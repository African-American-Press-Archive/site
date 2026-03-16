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
| pages | INTEGER NOT NULL | Page count |
| thumbnail_url | TEXT | R2 URL |
| page_paths | TEXT NOT NULL | JSON array of R2 image URLs |

### ocr_pages
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Autoincrement |
| issue_id | TEXT NOT NULL | FK → issues.id |
| page_num | INTEGER NOT NULL | 1 for front page |
| ocr_text | TEXT | Raw OCR text |
| | UNIQUE | (issue_id, page_num) |

Initially ~20,900 rows (front pages only). Expandable to all pages later without schema changes.

### ocr_search (FTS5 virtual table)
```sql
CREATE VIRTUAL TABLE ocr_search USING fts5(
  ocr_text,
  tokenize='porter unicode61'
);
```

Standalone FTS table (no `content=` directive) — rows are inserted directly with the OCR text during ingestion. Each FTS row's `rowid` maps to `ocr_pages.id` for joining back to issue metadata.

Porter stemming handles "lynching" → "lynch", "riots" → "riot".

**Search query patterns:**

Main results query:
```sql
SELECT snippet(ocr_search, 0, '<mark>', '</mark>', '...', 30) as excerpt,
       i.id, i.date, i.thumbnail_url, i.paper_slug, p.title, p.location
FROM ocr_search
JOIN ocr_pages op ON op.id = ocr_search.rowid
JOIN issues i ON i.id = op.issue_id
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
JOIN ocr_pages op ON op.id = ocr_search.rowid
JOIN issues i ON i.id = op.issue_id
JOIN papers p ON p.slug = i.paper_slug
WHERE ocr_search MATCH ?
  AND i.year BETWEEN ? AND ?
GROUP BY i.paper_slug
ORDER BY count DESC;
```

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
- OCR text rendered in the HTML (indexable by search engines)
- "Open Viewer" button — JS progressively enhances to zoom/pan viewer
- Previous/next issue links (for users and crawlers)
- Meta tags: og:title, og:image (thumbnail), og:description (OCR excerpt), canonical URL, JSON-LD structured data (Newspaper schema)

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
│   └── static/
│       ├── viewer.js          # Client-side viewer (zoom/pan/keyboard)
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
| `getIssue(slug, date)` | `Issue \| null` (with page_paths) | issue |
| `getAdjacentIssues(slug, date)` | `{ prev: Issue \| null, next: Issue \| null }` | issue |
| `searchOCR(query, filters)` | `{ results: SearchResult[], total: number, paperCounts: Map }` | search |
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
Reads a source directory of already-processed JPGs (matching the existing R2 structure), uploads to R2, and inserts issue rows into D1. Updates paper stats. Image processing (JP2/PDF → JPG conversion, thumbnail generation) is handled by the existing `merge_manifests.py` pipeline — `ingest.py` assumes images are ready for upload.

### Add OCR
```
python scripts/ingest.py add-ocr --paper chicago-whip
```
Fetches OCR JSON files from R2 → inserts into `ocr_pages` → rebuilds FTS5 index. Can target a single paper or the whole archive.

### Initial seed (one-time migration)
```
python scripts/seed.py              # manifest.json → D1 papers + issues tables
python scripts/ocr-index.py         # R2 OCR JSONs → D1 ocr_pages + FTS index
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
- OCR currently front pages only; schema supports expanding to all pages by adding rows to `ocr_pages`
- Images stay on R2 at `pages.dangerouspress.org` — no migration needed
- Two client-side JS bundles: `viewer.js` (issue page zoom/pan/keyboard nav) and `search.js` (date range slider, filter updates). All pages work without JS — these are progressive enhancements.
- **Static asset serving:** `viewer.js`, `search.js`, and `style.css` are served by the Worker via explicit routes (`/static/*`). Assets are inlined in the Worker bundle at build time or served from R2. Small enough that inlining is practical.
- **Error handling:** 404 pages render a styled "Issue not found" page with search bar and link to gallery. D1 errors return a minimal 500 page. Workers will use `try/catch` around all D1 calls.
- **Caching:** Workers set `Cache-Control: public, max-age=86400` on browse pages (content is archival/static). Search results use `Cache-Control: public, max-age=3600`. Issue images served from R2 already have long cache headers.
- **Sitemap:** Worker route at `/sitemap.xml` generates a sitemap index. Individual sitemaps per paper at `/sitemap/:slug.xml` list all issue URLs for that paper. Only issue-level URLs are included (not individual page URLs). Generated dynamically from D1 on each request (cached by Cloudflare CDN). At ~20,900 issues + 41 paper pages, well within sitemap limits.
- **FTS index updates:** `add-ocr` inserts new rows incrementally into the standalone FTS table — it does not drop/rebuild the full index. A `--rebuild` flag is available for full reindexing if needed.
- **D1 storage:** OCR text is stored in both `ocr_pages` (for display) and `ocr_search` (for FTS). At ~20,900 front pages, estimated total DB size is under 500MB, well within D1's 5GB limit. Expanding to all pages (~150K rows) would increase this but remain within limits.
- `page_paths` stored as JSON array in TEXT is intentional — avoids a separate pages table for what is always read as a unit. If per-page metadata grows beyond OCR, a `pages` table can be added later.
