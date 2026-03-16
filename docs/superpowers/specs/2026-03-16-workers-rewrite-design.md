# Dangerous Press v2: Cloudflare Workers Rewrite

## Overview

Rewrite the Dangerous Press archive viewer from a static SPA (vanilla JS on GitHub Pages) to a server-rendered site on Cloudflare Workers. Primary goals: full-text search across OCR content and SEO/discoverability so that individual issue pages rank in search engines.

The current browsing UX (gallery → paper detail → issue viewer) stays the same — this is an evolution, not a redesign.

## Architecture

**Workers + D1 + R2**, all within Cloudflare's ecosystem:

- **Cloudflare Workers** — server-render every page as HTML
- **D1 (SQLite)** — issue metadata, paper info, FTS5 search index
- **R2 (existing)** — page images (JPG), OCR JSON files, thumbnails at `pages.dangerouspress.org`

Request flows:
- `/papers/chicago-defender/1919-07-26` → Worker queries D1 → renders full HTML with meta tags → browser loads images from R2
- `/search?q=race+riots` → Worker queries D1 FTS5 → renders results page with highlighted snippets
- `/` → Worker queries D1 for paper list + stats → renders gallery

## URL Structure

| URL | Page Type | Description |
|-----|-----------|-------------|
| `/` | Homepage | Paper gallery + search bar + hero |
| `/search?q=lynch+law` | Search results | FTS5 results with snippets, sidebar filters |
| `/papers` | Paper gallery | All 41 papers as cards |
| `/papers/:slug` | Paper detail | Timeline, issue grid, paper info |
| `/papers/:slug/:year` | Paper + year | Issues from that year, month pills |
| `/papers/:slug/:date` | Issue page | Full page images, OCR text, meta tags |
| `/papers/:slug/:date/:page` | Specific page | Direct link to page N of an issue |
| `/date/:date` | Date browse | All issues published on a date, across papers |
| `/about` | About | Project info |

Pagination via query params: `/papers/chicago-defender?page=2`, `/search?q=riot&page=3`.

**Route disambiguation:** The router matches segments by format: `:year` matches `YYYY` (4 digits), `:date` matches `YYYY-MM-DD` (10 characters with hyphens), `:page` matches a bare integer. The router checks in order: date format first, then year, then falls through to 404.

## Database Schema (D1)

### papers
| Column | Type | Notes |
|--------|------|-------|
| slug | TEXT PK | "chicago-defender" |
| title | TEXT NOT NULL | "Chicago Defender" |
| location | TEXT | "Chicago, IL" |
| issue_count | INTEGER | Updated on ingest |
| first_date | TEXT | "1905-01-07" |
| last_date | TEXT | "1929-12-28" |
| thumbnail_url | TEXT | Representative thumbnail |

### issues
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | "1919-07-26_chicago-defender" |
| paper_slug | TEXT NOT NULL | FK → papers.slug |
| date | TEXT NOT NULL | "1919-07-26" |
| year | INTEGER NOT NULL | For fast filtering |
| month | INTEGER NOT NULL | For fast filtering |
| seq | INTEGER NOT NULL | Position within paper, ordered by date. Enables O(1) prev/next navigation: `seq - 1` / `seq + 1`. |
| page_count | INTEGER NOT NULL | Number of pages |
| thumbnail_url | TEXT | R2 URL |
| ocr_excerpt | TEXT | First ~300 chars of front-page OCR, used for meta descriptions, og:tags, issue cards, and search previews. Populated during OCR ingestion. |

### pages
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Autoincrement |
| issue_id | TEXT NOT NULL | FK → issues.id |
| page_num | INTEGER NOT NULL | 1-indexed |
| image_url | TEXT NOT NULL | R2 URL for full page image |
| thumbnail_url | TEXT | R2 URL for page thumbnail (nullable, future use) |
| ocr_text | TEXT | OCR text for this page (nullable — populated when available) |
| | UNIQUE | (issue_id, page_num) |

Normalized page-level table replacing the previous `page_paths` JSON array and separate `ocr_pages` table. Each page image and its OCR text live in the same row. Initially ~20,900 rows have `ocr_text` populated (front pages only). Adding OCR for remaining pages is just an UPDATE on existing rows. Future page-level metadata (annotations, bounding boxes, layout info) can be added as columns without schema redesign.

### Indexes
```sql
-- Issues: filter by year, paper, date
CREATE INDEX idx_issues_year ON issues(year);
CREATE INDEX idx_issues_paper ON issues(paper_slug);
CREATE INDEX idx_issues_date ON issues(date);

-- Issues: paginated listing by paper, ordered by date (covers WHERE paper_slug=? ORDER BY date)
CREATE INDEX idx_issues_paper_date ON issues(paper_slug, date);

-- Issues: prev/next navigation by sequence within a paper
CREATE INDEX idx_issues_paper_seq ON issues(paper_slug, seq);

-- Pages: lookup by issue, ordered by page number (also enforces uniqueness)
CREATE UNIQUE INDEX idx_pages_issue_page ON pages(issue_id, page_num);
```

### ocr_search (FTS5 virtual table)
```sql
CREATE VIRTUAL TABLE ocr_search USING fts5(
  ocr_text,
  issue_id UNINDEXED,
  content=pages,
  content_rowid=id,
  tokenize='porter unicode61'
);
```

External-content FTS table backed by the `pages` table. The FTS index references `pages.id` as its rowid. `issue_id` is stored as an `UNINDEXED` column — not searchable, but available in results for direct joins to `issues` without going through `pages`. Requires triggers to keep the index in sync with `pages`:

```sql
CREATE TRIGGER pages_ai AFTER INSERT ON pages BEGIN
  INSERT INTO ocr_search(rowid, ocr_text, issue_id) VALUES (new.id, new.ocr_text, new.issue_id);
END;
CREATE TRIGGER pages_ad AFTER DELETE ON pages BEGIN
  INSERT INTO ocr_search(ocr_search, rowid, ocr_text, issue_id) VALUES ('delete', old.id, old.ocr_text, old.issue_id);
END;
CREATE TRIGGER pages_au AFTER UPDATE ON pages BEGIN
  INSERT INTO ocr_search(ocr_search, rowid, ocr_text, issue_id) VALUES ('delete', old.id, old.ocr_text, old.issue_id);
  INSERT INTO ocr_search(rowid, ocr_text, issue_id) VALUES (new.id, new.ocr_text, new.issue_id);
END;
```

Porter stemming handles "lynching" → "lynch", "riots" → "riot". Only rows where `ocr_text IS NOT NULL` produce FTS entries (triggers fire but empty text is harmless).

**Search query patterns:**

Main results query:
```sql
SELECT snippet(ocr_search, 0, '<mark>', '</mark>', '...', 30) as excerpt,
       i.id, i.date, i.thumbnail_url, i.ocr_excerpt, i.paper_slug,
       pg.page_num, p.title, p.location
FROM ocr_search
JOIN pages pg ON pg.id = ocr_search.rowid
JOIN issues i ON i.id = pg.issue_id
JOIN papers p ON p.slug = i.paper_slug
WHERE ocr_search MATCH ?
  AND i.year BETWEEN ? AND ?          -- date range filter
  AND (i.paper_slug IN (?, ?, ...))   -- paper filter (omitted if "all papers")
ORDER BY rank                          -- or: i.date DESC / i.date ASC
LIMIT 20 OFFSET ?;
```

Paper counts query (for sidebar, runs alongside main query):
```sql
SELECT i.paper_slug, p.title, COUNT(*) as count
FROM ocr_search
JOIN pages pg ON pg.id = ocr_search.rowid
JOIN issues i ON i.id = pg.issue_id
JOIN papers p ON p.slug = i.paper_slug
WHERE ocr_search MATCH ?
  AND i.year BETWEEN ? AND ?
GROUP BY i.paper_slug
ORDER BY count DESC;
```

**Facet query performance:** At current scale (~20,900 pages with OCR), the facet query runs fast. As the index grows, the facet query can be cached separately (keyed on query + date range, `max-age=3600`). If performance becomes an issue, facets can be deferred to a secondary async request or simplified to show only total count without per-paper breakdown.

**SearchFilters type:**
```typescript
interface SearchFilters {
  fromYear?: number;    // default: 1905
  toYear?: number;      // default: 1929
  papers?: string[];    // paper slugs; omit for all
  sort?: 'relevance' | 'date-asc' | 'date-desc';  // default: relevance
  page?: number;        // 1-indexed, default: 1
}
```

## Key Pages

### Issue Page (`/papers/:slug/:date`)

The primary SEO target — what Google indexes and people share.

- **Server-rendered HTML** that works without JavaScript
- Breadcrumb: Papers › Chicago Defender › 1919 › July 26, 1919
- Issue header: paper name, formatted date, location, page count
- Front page thumbnail + all page thumbnails
- OCR text rendered in the HTML (indexable by search engines). Bulk OCR body wrapped in `<div class="ocr-text" data-nosnippet>` so Google indexes the text but prefers `ocr_excerpt` (via meta description) for search result snippets — avoids noisy OCR in Google's snippet display.
- "Open Viewer" button — JS progressively enhances to zoom/pan viewer
- Previous/next issue links (for users and crawlers)
- Meta tags: og:title, og:image (thumbnail), og:description (`ocr_excerpt` from issues table), canonical URL
- JSON-LD structured data: `NewsArticle` schema on issue pages (datePublished, publisher, image, description). `Dataset` schema on the about page describing the archive as a whole. These align with Google's supported rich result types.

### Search Results (`/search?q=...`)

- Prominent search bar with query and result count
- Sidebar filters:
  - **Date range filter** — min/max year input fields as baseline; JS progressively enhances to a drag slider
  - **Paper checkboxes with result counts** — toggle papers, see per-paper match counts
  - **Sort** — relevance (FTS5 rank), date newest, date oldest
- Search page includes a small JS bundle (`search.js`) for the date range slider and dynamic filter updates. Falls back to standard form submission without JS.
- Results: thumbnail + paper/date link + location + OCR snippet with highlighted matches
- 20 results per page, standard pagination links
- All filters in URL: `/search?q=lynching&from=1908&to=1924&paper=chicago-defender`

### Gallery, Paper Detail, Date Browse

Same UX as current SPA, server-rendered. Timeline scrubber, month pills, search/sort cards, paginated issue grids.

## Worker Project Structure

```
workers/
├── wrangler.toml              # D1 binding, R2 binding, routes
├── src/
│   ├── index.ts               # Router
│   ├── handlers/
│   │   ├── home.ts            # GET /
│   │   ├── papers.ts          # GET /papers, /papers/:slug, /papers/:slug/:year
│   │   ├── issue.ts           # GET /papers/:slug/:date
│   │   ├── search.ts          # GET /search
│   │   ├── date-browse.ts     # GET /date/:date
│   │   └── about.ts           # GET /about
│   ├── templates/
│   │   ├── layout.ts          # Shared HTML shell (head, nav, footer)
│   │   ├── issue-page.ts      # Issue page template
│   │   ├── search-results.ts  # Search results template
│   │   ├── paper-gallery.ts   # Gallery cards
│   │   ├── paper-detail.ts    # Paper detail + timeline
│   │   └── components/        # Breadcrumb, pagination, etc.
│   ├── db/
│   │   ├── queries.ts         # All D1 queries
│   │   └── schema.sql         # CREATE TABLE statements
│   └── public/                    # Workers Static Assets directory
│       ├── viewer.js          # Client-side viewer (zoom/pan/keyboard)
│       ├── search.js          # Date range slider, filter updates
│       └── style.css
├── scripts/
│   ├── ingest.py              # CLI: add papers, issues, OCR to D1
│   ├── seed.py                # Initial migration: manifest.json → D1
│   └── ocr-index.py           # Fetch OCR JSONs from R2 → D1 FTS
└── package.json
```

Templates are TypeScript functions returning HTML strings — no template engine.

### Key Query Functions (db/queries.ts)

| Function | Returns | Used by |
|----------|---------|---------|
| `getAllPapers()` | `Paper[]` | home, papers |
| `getPaper(slug)` | `Paper \| null` | papers, issue |
| `getIssuesByPaper(slug, year?, month?, page?)` | `{ issues: Issue[], total: number }` | papers |
| `getIssue(slug, date)` | `Issue \| null` (with ocr_excerpt) | issue |
| `getPages(issueId)` | `Page[]` (image_url, page_num, ocr_text) | issue |
| `getAdjacentIssues(slug, seq)` | `{ prev: Issue \| null, next: Issue \| null }` | issue (uses `seq - 1` / `seq + 1`) |
| `searchOCR(query, filters)` | `{ results: SearchResult[], total: number, paperCounts: Map<string, { title: string, count: number }> }` | search |
| `getIssuesByDate(date)` | `Issue[]` (with paper info) | date-browse |
| `getYearStats(slug)` | `{ year: number, count: number }[]` | papers (timeline) |

## Data Ingestion (CLI Scripts)

Python CLI scripts for ongoing maintenance after initial migration.

### Add a new paper
```
python scripts/ingest.py add-paper --slug chicago-whip --title "Chicago Whip" --location "Chicago, IL"
```
Inserts row into `papers` table. Paper appears in gallery with 0 issues.

### Add issues to a paper
```
python scripts/ingest.py add-issues --paper chicago-whip --source ./newspapers/chicago-whip/
```
Reads a source directory of already-processed JPGs (matching the existing R2 structure), uploads to R2, inserts issue row + page rows into D1, and updates paper stats. Image processing (JP2/PDF → JPG conversion, thumbnail generation) is handled by the existing `merge_manifests.py` pipeline — `ingest.py` assumes images are ready for upload.

### Add OCR
```
python scripts/ingest.py add-ocr --paper chicago-whip
```
Fetches OCR JSON files from R2 → updates `pages.ocr_text` for matching page rows → FTS triggers keep the search index in sync automatically. Also computes and sets `issues.ocr_excerpt` (first ~300 chars of front-page OCR). Can target a single paper or the whole archive. A `--rebuild-fts` flag drops and recreates the FTS table + triggers for full reindexing if needed.

### Initial seed (one-time migration)
```
python scripts/seed.py              # manifest.json → D1 papers + issues tables
python scripts/ocr-index.py         # R2 OCR JSONs → D1 pages.ocr_text + issues.ocr_excerpt
```

## Migration Phases

### Phase 1: Workers project + D1 setup
- Scaffold `workers/` with wrangler.toml, TypeScript config
- Create D1 database, run schema.sql
- Write and run `seed.py` (manifest.json → D1)
- Write and run `ocr-index.py` (R2 OCR → D1 FTS)

### Phase 2: Core browsing pages + issue page
- Homepage (gallery), paper detail, paper+year, date browse
- Shared layout template with nav, meta tags, footer
- Server-rendered issue page with OCR text, meta tags, structured data
- Previous/next issue navigation
- Deploy to `beta.dangerouspress.org`

### Phase 3: Viewer + search
- Port current viewer JS as progressive enhancement on issue pages
- Search handler + results template
- Sidebar filters: date range slider, paper checkboxes with counts, sort
- FTS5 queries with snippet highlighting

### Phase 4: Ingest tooling
- `ingest.py` with add-paper, add-issues, add-ocr commands
- Documentation for each operation

### Phase 5: Cutover
- Deploy Workers to `dangerouspress.org`
- Current SPA available at `old.dangerouspress.org` as fallback
- Redirects from any old URL patterns
- Submit sitemap to Google Search Console

## Technical Notes

- ~20,900 issues across 41 papers, 1905–1929 — well within D1 limits
- OCR currently front pages only; schema supports expanding to all pages by updating `ocr_text` on existing page rows
- Images stay on R2 at `pages.dangerouspress.org` — no migration needed
- Two client-side JS bundles: `viewer.js` (issue page zoom/pan/keyboard nav) and `search.js` (date range slider, filter updates). All pages work without JS — these are progressive enhancements.
- **Static asset serving:** Uses [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) — files in `src/public/` are bundled with the Worker deployment and served automatically with content-hashing, cache headers, and no custom route logic needed. Configured via `assets` in `wrangler.toml`.
- **Error handling:** 404 pages render a styled "Issue not found" page with search bar and link to gallery. D1 errors return a minimal 500 page. Workers will use `try/catch` around all D1 calls.
- **Caching:** Workers set `Cache-Control: public, max-age=86400` on browse pages (content is archival/static). Search results use `Cache-Control: public, max-age=3600`. Issue images served from R2 already have long cache headers.
- **Sitemap:** Worker route at `/sitemap.xml` generates a sitemap index. Individual sitemaps per paper at `/sitemap/:slug.xml` list all issue URLs for that paper. Only issue-level URLs are included (not individual page URLs). Generated dynamically from D1 with `Cache-Control: public, max-age=604800` (7 days) — archive content rarely changes. At ~20,900 issues + 41 paper pages, well within sitemap limits.
- **FTS index updates:** The FTS table uses external content backed by the `pages` table with triggers. Normal inserts/updates to `pages.ocr_text` automatically update the FTS index. A `--rebuild-fts` flag on `ingest.py` drops and recreates the FTS table for full reindexing.
- **D1 storage:** OCR text is stored once in `pages.ocr_text`; the FTS table is a lightweight index over it (not a full copy). At ~20,900 front pages, estimated total DB size is under 300MB. Expanding to all pages (~150K rows) remains well within D1's 5GB limit.
- **`ocr_excerpt` on issues:** A denormalized ~300-character excerpt from the front page OCR. Used for meta descriptions, og:tags, issue cards in gallery/detail views, and search result previews when a full FTS snippet isn't needed. Set during OCR ingestion.
