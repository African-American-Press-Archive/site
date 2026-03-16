# Dangerous Press v2: Cloudflare Workers Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Dangerous Press newspaper archive from a static SPA to server-rendered pages on Cloudflare Workers with D1 full-text search and SEO.

**Architecture:** Cloudflare Workers serve HTML pages rendered from D1 queries. D1 holds all issue metadata, paper info, and an FTS5 search index over OCR text. R2 (existing) hosts page images and OCR JSON files. Two client-side JS bundles (`viewer.js`, `search.js`) progressively enhance the server-rendered pages.

**Tech Stack:** TypeScript (Workers), Hono (router), D1/SQLite (database + FTS5), R2 (images), Workers Static Assets (JS/CSS), Python (seed/ingest scripts), Tailwind CSS (styling).

**Spec:** `docs/superpowers/specs/2026-03-16-workers-rewrite-design.md`

**Existing codebase reference files:**
- `app.js` (1,896 lines) — viewer modal, zoom/pan, keyboard nav, OCR overlay
- `paper-gallery.js` (110 lines) — gallery card grid
- `paper-detail.js` (290 lines) — paper detail with timeline + issue grid
- `date-browse.js` (382 lines) — cross-paper date browsing
- `browse-router.js` (165 lines) — client-side URL routing
- `paper-data.js` (158 lines) — paper metadata, slugs, locations
- `timeline-scrubber.js` (150 lines) — bar chart timeline component
- `style.css` (2,237 lines) — all CSS including design tokens
- `manifest.json` (~20,900 entries) — issue metadata
- `merge_manifests.py` (194 lines) — manifest build pipeline

---

## File Structure

```
workers/
├── wrangler.toml                        # D1, R2, static assets config
├── package.json                         # Dependencies: hono, wrangler
├── tsconfig.json                        # TypeScript config
├── src/
│   ├── index.ts                         # Hono app: mounts all routes
│   ├── types.ts                         # Shared types: Paper, Issue, Page, SearchResult, Env
│   ├── handlers/
│   │   ├── home.ts                      # GET / — gallery page
│   │   ├── papers.ts                    # GET /papers, /papers/:slug, /papers/:slug/:segment
│   │   ├── issue.ts                     # GET /papers/:slug/:date, /papers/:slug/:date/:page
│   │   ├── search.ts                    # GET /search
│   │   ├── date-browse.ts              # GET /date/:date
│   │   ├── about.ts                     # GET /about
│   │   └── sitemap.ts                   # GET /sitemap.xml, /sitemap/:slug.xml
│   ├── db/
│   │   ├── schema.sql                   # CREATE TABLE, indexes, FTS5, triggers
│   │   ├── queries.ts                   # All D1 query functions
│   │   └── queries.test.ts             # Query integration tests (miniflare)
│   ├── templates/
│   │   ├── layout.ts                    # HTML shell: <head>, nav, footer, meta tags
│   │   ├── components/
│   │   │   ├── breadcrumb.ts            # Breadcrumb navigation
│   │   │   ├── pagination.ts            # Pagination links
│   │   │   ├── issue-card.ts            # Issue card (thumbnail + date + paper)
│   │   │   ├── paper-card.ts            # Paper gallery card (masthead + stats)
│   │   │   ├── timeline.ts              # Timeline bar chart (year bars + month pills)
│   │   │   ├── search-bar.ts            # Search input (used in nav + search page)
│   │   │   └── date-fmt.ts             # Shared date formatting utilities
│   │   ├── home-page.ts                 # Homepage: gallery + search + hero
│   │   ├── paper-gallery-page.ts        # /papers — all papers grid
│   │   ├── paper-detail-page.ts         # /papers/:slug — timeline + issue grid
│   │   ├── issue-page.ts               # /papers/:slug/:date — the SEO page
│   │   ├── search-results-page.ts       # /search — results + sidebar filters
│   │   ├── date-browse-page.ts          # /date/:date — cross-paper issues
│   │   ├── about-page.ts               # /about
│   │   └── error-page.ts               # 404 and 500 pages
│   └── public/                          # Workers Static Assets
│       ├── viewer.js                    # Issue viewer (zoom, pan, keyboard nav)
│       ├── search.js                    # Date range slider, filter updates
│       └── style.css                    # All styles (migrated from current site)
├── scripts/
│   ├── seed.py                          # One-time: manifest.json → D1 (papers, issues, pages)
│   ├── ocr-index.py                     # One-time: R2 OCR JSONs → D1 pages.ocr_text + issues.ocr_excerpt
│   ├── ingest.py                        # Ongoing: add-paper, add-issues, add-ocr commands
│   └── requirements.txt                 # Python deps (requests, etc.)
└── test/
    ├── handlers.test.ts                 # Route handler tests
    └── templates.test.ts                # Template output tests
```

---

## Chunk 1: Project Scaffold, Database Schema, and Seed Scripts

### Task 1: Initialize Workers Project

**Files:**
- Create: `workers/package.json`
- Create: `workers/tsconfig.json`
- Create: `workers/wrangler.toml`
- Create: `workers/src/index.ts`
- Create: `workers/src/types.ts`

- [ ] **Step 1: Create `workers/` directory and `package.json`**

```json
{
  "name": "dangerouspress-workers",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "db:migrate": "wrangler d1 execute dangerouspress-db --local --file=src/db/schema.sql",
    "db:migrate:remote": "wrangler d1 execute dangerouspress-db --remote --file=src/db/schema.sql"
  },
  "dependencies": {
    "hono": "^4"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4",
    "wrangler": "^4",
    "typescript": "^5",
    "vitest": "^3"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "lib": ["ESNext"],
    "types": ["@cloudflare/workers-types"],
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `wrangler.toml`**

```toml
name = "dangerouspress"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[assets]
directory = "./src/public/"
binding = "ASSETS"

[[d1_databases]]
binding = "DB"
database_name = "dangerouspress-db"
database_id = "<to-be-created>"

[[r2_buckets]]
binding = "R2"
bucket_name = "dangerouspress-pages"
```

- [ ] **Step 4: Create `src/types.ts`**

```typescript
export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  ASSETS: Fetcher;
}

export interface Paper {
  slug: string;
  title: string;
  location: string | null;
  issue_count: number;
  first_date: string | null;
  last_date: string | null;
  thumbnail_url: string | null;
}

export interface Issue {
  id: string;
  paper_slug: string;
  date: string;
  year: number;
  month: number;
  seq: number;
  page_count: number;
  thumbnail_url: string | null;
  ocr_excerpt: string | null;
}

export interface Page {
  id: number;
  issue_id: string;
  page_num: number;
  image_url: string;
  thumbnail_url: string | null;
  ocr_text: string | null;
}

export interface SearchResult {
  excerpt: string;
  issue_id: string;
  date: string;
  thumbnail_url: string | null;
  ocr_excerpt: string | null;
  paper_slug: string;
  page_num: number;
  paper_title: string;
  location: string | null;
}

export interface SearchFilters {
  fromYear?: number;
  toYear?: number;
  papers?: string[];
  sort?: 'relevance' | 'date-asc' | 'date-desc';
  page?: number;
}

export interface YearStat {
  year: number;
  count: number;
}
```

- [ ] **Step 5: Create minimal `src/index.ts`**

```typescript
import { Hono } from 'hono';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.text('Dangerous Press — coming soon'));

export default app;
```

- [ ] **Step 6: Install dependencies and verify dev server starts**

Run:
```bash
cd workers && npm install && npx wrangler dev
```
Expected: Dev server starts on localhost, returns "Dangerous Press — coming soon" at `/`.

- [ ] **Step 7: Commit**

```bash
git add workers/
git commit -m "feat: scaffold Workers project with Hono, D1, R2, static assets config"
```

---

### Task 2: Database Schema

**Files:**
- Create: `workers/src/db/schema.sql`

- [ ] **Step 1: Write `schema.sql` with all tables, indexes, FTS5, and triggers**

```sql
-- Papers table
CREATE TABLE IF NOT EXISTS papers (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  location TEXT,
  issue_count INTEGER DEFAULT 0,
  first_date TEXT,
  last_date TEXT,
  thumbnail_url TEXT
);

-- Issues table
CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  paper_slug TEXT NOT NULL REFERENCES papers(slug),
  date TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  page_count INTEGER NOT NULL,
  thumbnail_url TEXT,
  ocr_excerpt TEXT
);

-- Pages table
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id TEXT NOT NULL REFERENCES issues(id),
  page_num INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  ocr_text TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_issues_year ON issues(year);
CREATE INDEX IF NOT EXISTS idx_issues_paper ON issues(paper_slug);
CREATE INDEX IF NOT EXISTS idx_issues_date ON issues(date);
CREATE INDEX IF NOT EXISTS idx_issues_paper_date ON issues(paper_slug, date);
CREATE INDEX IF NOT EXISTS idx_issues_paper_seq ON issues(paper_slug, seq);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_issue_page ON pages(issue_id, page_num);

-- FTS5 virtual table (external content backed by pages)
CREATE VIRTUAL TABLE IF NOT EXISTS ocr_search USING fts5(
  ocr_text,
  issue_id UNINDEXED,
  content=pages,
  content_rowid=id,
  tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync with pages
CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
  INSERT INTO ocr_search(rowid, ocr_text, issue_id) VALUES (new.id, new.ocr_text, new.issue_id);
END;

CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
  INSERT INTO ocr_search(ocr_search, rowid, ocr_text, issue_id) VALUES ('delete', old.id, old.ocr_text, old.issue_id);
END;

CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
  INSERT INTO ocr_search(ocr_search, rowid, ocr_text, issue_id) VALUES ('delete', old.id, old.ocr_text, old.issue_id);
  INSERT INTO ocr_search(rowid, ocr_text, issue_id) VALUES (new.id, new.ocr_text, new.issue_id);
END;
```

- [ ] **Step 2: Run migration locally**

Run:
```bash
cd workers && npx wrangler d1 execute dangerouspress-db --local --file=src/db/schema.sql
```
Expected: Tables created successfully, no errors.

- [ ] **Step 3: Verify tables exist**

Run:
```bash
cd workers && npx wrangler d1 execute dangerouspress-db --local --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```
Expected: Output includes `issues`, `ocr_search`, `pages`, `papers` (plus FTS internal tables).

- [ ] **Step 4: Commit**

```bash
git add workers/src/db/schema.sql
git commit -m "feat: add D1 schema with papers, issues, pages, FTS5 indexes and triggers"
```

---

### Task 3: Seed Script — Manifest to D1

**Files:**
- Create: `workers/scripts/seed.py`
- Create: `workers/scripts/requirements.txt`

This script reads `manifest.json` and populates the `papers`, `issues`, and `pages` tables. It does NOT handle OCR — that's a separate script.

- [ ] **Step 1: Create `requirements.txt`**

```
requests>=2.31
```

- [ ] **Step 2: Write `seed.py`**

```python
#!/usr/bin/env python3
"""Seed D1 database from manifest.json.

Reads the existing manifest.json and inserts papers, issues, and pages
into the local D1 database via wrangler CLI.

Usage:
    cd workers
    python scripts/seed.py [--remote]
"""

import json
import subprocess
import sys
from pathlib import Path
from collections import defaultdict

MANIFEST_PATH = Path(__file__).parent.parent.parent / "manifest.json"
DB_NAME = "dangerouspress-db"

# Paper locations — matches paper-data.js
PAPER_LOCATIONS = {
    "Amsterdam News": "New York, New York",
    "Baltimore Afro-American": "Baltimore, Maryland",
    "Broad Ax": "Chicago, Illinois",
    "California Eagle": "Los Angeles, California",
    "Chicago Defender": "Chicago, Illinois",
    "Chicago Whip": "Chicago, Illinois",
    "Cleveland Gazette": "Cleveland, Ohio",
    "Colored American": "Washington, D.C.",
    "Crisis": "New York, New York",
    "Freeman": "Indianapolis, Indiana",
    "Kansas City Sun": "Kansas City, Missouri",
    "Messenger": "New York, New York",
    "Muskogee Cimeter": "Muskogee, Oklahoma",
    "Negro World": "New York, New York",
    "New York Age": "New York, New York",
    "Norfolk Journal and Guide": "Norfolk, Virginia",
    "Opportunity": "New York, New York",
    "Philadelphia Tribune": "Philadelphia, Pennsylvania",
    "Pittsburgh Courier": "Pittsburgh, Pennsylvania",
    "Savannah Tribune": "Savannah, Georgia",
    "Washington Bee": "Washington, D.C.",
    # Add remaining papers as discovered from manifest
}

TITLE_OVERRIDES = {
    "Broad Ax": "Chicago Broad Ax",
}


def make_slug(title: str) -> str:
    """Generate URL slug from paper title."""
    import re
    display = TITLE_OVERRIDES.get(title, title)
    return re.sub(r"[.\s]+", "-", display.lower()).strip("-")


def run_sql(sql: str, remote: bool = False):
    """Execute SQL via wrangler d1."""
    cmd = ["npx", "wrangler", "d1", "execute", DB_NAME]
    if remote:
        cmd.append("--remote")
    else:
        cmd.append("--local")
    cmd.extend(["--command", sql])
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=Path(__file__).parent.parent)
    if result.returncode != 0:
        print(f"SQL error: {result.stderr}", file=sys.stderr)
        raise RuntimeError(result.stderr)
    return result.stdout


def run_sql_batch(statements: list[str], remote: bool = False):
    """Execute multiple SQL statements via a temp file."""
    import tempfile
    with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False) as f:
        f.write("\n".join(statements))
        f.flush()
        cmd = ["npx", "wrangler", "d1", "execute", DB_NAME]
        if remote:
            cmd.append("--remote")
        else:
            cmd.append("--local")
        cmd.extend(["--file", f.name])
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=Path(__file__).parent.parent)
        if result.returncode != 0:
            print(f"SQL error: {result.stderr}", file=sys.stderr)
            raise RuntimeError(result.stderr)


def escape_sql(s: str) -> str:
    """Escape single quotes for SQL."""
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def main():
    remote = "--remote" in sys.argv

    print(f"Loading manifest from {MANIFEST_PATH}...")
    with open(MANIFEST_PATH) as f:
        issues = json.load(f)
    print(f"  {len(issues)} issues loaded")

    # Group by paper title
    by_paper = defaultdict(list)
    for issue in issues:
        by_paper[issue["title"]].append(issue)

    print(f"  {len(by_paper)} papers found")

    # Build paper records
    paper_stmts = []
    for title, paper_issues in sorted(by_paper.items()):
        slug = make_slug(title)
        location = PAPER_LOCATIONS.get(title)
        sorted_issues = sorted(paper_issues, key=lambda x: x["date"])
        first_date = sorted_issues[0]["date"]
        last_date = sorted_issues[-1]["date"]
        thumb = sorted_issues[0].get("issue_thumb")
        paper_stmts.append(
            f"INSERT OR REPLACE INTO papers (slug, title, location, issue_count, first_date, last_date, thumbnail_url) "
            f"VALUES ({escape_sql(slug)}, {escape_sql(title)}, {escape_sql(location)}, "
            f"{len(paper_issues)}, {escape_sql(first_date)}, {escape_sql(last_date)}, {escape_sql(thumb)});"
        )

    print("Inserting papers...")
    run_sql_batch(paper_stmts, remote)

    # Build issue + page records (batch in chunks of 500)
    issue_stmts = []
    page_stmts = []
    for title, paper_issues in sorted(by_paper.items()):
        slug = make_slug(title)
        sorted_issues = sorted(paper_issues, key=lambda x: x["date"])
        for seq, issue in enumerate(sorted_issues, 1):
            issue_id = f"{issue['date']}_{slug}"
            date = issue["date"]
            year = int(date[:4])
            month = int(date[5:7])
            page_count = issue.get("pages", len(issue.get("page_paths", [])))
            thumb = issue.get("issue_thumb")

            issue_stmts.append(
                f"INSERT OR REPLACE INTO issues (id, paper_slug, date, year, month, seq, page_count, thumbnail_url) "
                f"VALUES ({escape_sql(issue_id)}, {escape_sql(slug)}, {escape_sql(date)}, "
                f"{year}, {month}, {seq}, {page_count}, {escape_sql(thumb)});"
            )

            # Page rows
            page_paths = issue.get("page_paths", [])
            for page_num, image_url in enumerate(page_paths, 1):
                page_stmts.append(
                    f"INSERT OR REPLACE INTO pages (issue_id, page_num, image_url) "
                    f"VALUES ({escape_sql(issue_id)}, {page_num}, {escape_sql(image_url)});"
                )

    # Execute in batches
    BATCH = 500
    print(f"Inserting {len(issue_stmts)} issues...")
    for i in range(0, len(issue_stmts), BATCH):
        run_sql_batch(issue_stmts[i : i + BATCH], remote)
        print(f"  {min(i + BATCH, len(issue_stmts))}/{len(issue_stmts)}")

    print(f"Inserting {len(page_stmts)} pages...")
    for i in range(0, len(page_stmts), BATCH):
        run_sql_batch(page_stmts[i : i + BATCH], remote)
        print(f"  {min(i + BATCH, len(page_stmts))}/{len(page_stmts)}")

    print("Done!")
    # Verify counts
    print("\nVerification:")
    print(run_sql("SELECT COUNT(*) as paper_count FROM papers;", remote))
    print(run_sql("SELECT COUNT(*) as issue_count FROM issues;", remote))
    print(run_sql("SELECT COUNT(*) as page_count FROM pages;", remote))


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run seed against local D1**

Run:
```bash
cd workers && python scripts/seed.py
```
Expected: Papers (~41), issues (~20,900), and pages (~100K+) inserted. Verification counts printed at end.

- [ ] **Step 4: Spot-check data**

Run:
```bash
cd workers && npx wrangler d1 execute dangerouspress-db --local --command="SELECT slug, title, issue_count FROM papers ORDER BY issue_count DESC LIMIT 5"
```
Expected: Top papers by issue count (e.g., Chicago Defender with most issues).

Run:
```bash
cd workers && npx wrangler d1 execute dangerouspress-db --local --command="SELECT i.id, i.date, i.page_count, COUNT(p.id) as actual_pages FROM issues i JOIN pages p ON p.issue_id = i.id WHERE i.paper_slug = 'chicago-defender' GROUP BY i.id LIMIT 3"
```
Expected: Issue IDs with matching page counts.

- [ ] **Step 5: Commit**

```bash
git add workers/scripts/
git commit -m "feat: add seed.py to populate D1 from manifest.json"
```

---

### Task 4: OCR Index Script

**Files:**
- Create: `workers/scripts/ocr-index.py`

This script fetches OCR JSON files from R2 (via their public URLs), extracts text, updates `pages.ocr_text`, and sets `issues.ocr_excerpt`.

- [ ] **Step 1: Write `ocr-index.py`**

```python
#!/usr/bin/env python3
"""Index OCR text from R2 JSON files into D1.

Fetches OCR JSON files from R2 (via public URL), extracts concatenated text,
updates pages.ocr_text for matching page rows, and sets issues.ocr_excerpt.

Usage:
    cd workers
    python scripts/ocr-index.py [--paper SLUG] [--remote] [--rebuild-fts]
"""

import json
import subprocess
import sys
import tempfile
import urllib.request
import urllib.error
from pathlib import Path
from collections import defaultdict

DB_NAME = "dangerouspress-db"
R2_BASE = "https://pages.dangerouspress.org"


def run_sql(sql: str, remote: bool = False):
    cmd = ["npx", "wrangler", "d1", "execute", DB_NAME]
    cmd.append("--remote" if remote else "--local")
    cmd.extend(["--command", sql])
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=Path(__file__).parent.parent)
    if result.returncode != 0:
        print(f"SQL error: {result.stderr}", file=sys.stderr)
    return result.stdout


def run_sql_json(sql: str, remote: bool = False) -> list[dict]:
    """Execute SQL and return results as parsed JSON list."""
    cmd = ["npx", "wrangler", "d1", "execute", DB_NAME, "--json"]
    cmd.append("--remote" if remote else "--local")
    cmd.extend(["--command", sql])
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=Path(__file__).parent.parent)
    if result.returncode != 0:
        print(f"SQL error: {result.stderr}", file=sys.stderr)
        return []
    data = json.loads(result.stdout)
    # wrangler d1 --json returns [{success, results: [...]}]
    if data and isinstance(data, list) and data[0].get("results"):
        return data[0]["results"]
    return []


def run_sql_batch(statements: list[str], remote: bool = False):
    with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False) as f:
        f.write("\n".join(statements))
        f.flush()
        cmd = ["npx", "wrangler", "d1", "execute", DB_NAME]
        cmd.append("--remote" if remote else "--local")
        cmd.extend(["--file", f.name])
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=Path(__file__).parent.parent)
        if result.returncode != 0:
            print(f"SQL error: {result.stderr}", file=sys.stderr)
            raise RuntimeError(result.stderr)


def escape_sql(s: str) -> str:
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def fetch_ocr_json(image_url: str) -> dict | None:
    """Fetch OCR JSON for a page image URL.

    Image URL: https://pages.dangerouspress.org/slug/year/date/page_01.jpg
    OCR URL:   https://pages.dangerouspress.org/slug/year/date/page_01.json
    """
    json_url = image_url.rsplit(".", 1)[0] + ".json"
    try:
        with urllib.request.urlopen(json_url, timeout=10) as resp:
            return json.loads(resp.read())
    except (urllib.error.HTTPError, urllib.error.URLError):
        return None


def extract_text(ocr_data: dict) -> str:
    """Concatenate all region text from OCR JSON."""
    regions = ocr_data.get("regions", [])
    texts = [r["text"] for r in regions if r.get("text") and r.get("status") == "ok"]
    return " ".join(texts)


def main():
    remote = "--remote" in sys.argv
    rebuild_fts = "--rebuild-fts" in sys.argv
    paper_filter = None
    if "--paper" in sys.argv:
        idx = sys.argv.index("--paper")
        paper_filter = sys.argv[idx + 1]

    if rebuild_fts:
        print("Rebuilding FTS index...")
        run_sql("INSERT INTO ocr_search(ocr_search) VALUES ('rebuild');", remote)
        print("  FTS rebuild complete.")

    # Get all front pages (page_num=1) to index
    where = f"AND i.paper_slug = {escape_sql(paper_filter)}" if paper_filter else ""
    query = (
        f"SELECT p.id, p.issue_id, p.image_url FROM pages p "
        f"JOIN issues i ON i.id = p.issue_id "
        f"WHERE p.page_num = 1 AND p.ocr_text IS NULL {where} "
        f"ORDER BY i.date;"
    )

    print(f"Fetching front pages to index{f' for {paper_filter}' if paper_filter else ''}...")
    raw = run_sql_json(query, remote)
    pages_to_index = raw  # list of {id, issue_id, image_url}
    print(f"  {len(pages_to_index)} pages need OCR indexing")

    # Process in batches
    update_stmts = []
    excerpt_stmts = []
    seen_issues = set()
    success = 0
    skipped = 0

    for i, page in enumerate(pages_to_index):
        ocr_data = fetch_ocr_json(page["image_url"])
        if not ocr_data:
            skipped += 1
            continue

        text = extract_text(ocr_data)
        if not text:
            skipped += 1
            continue

        # Update pages.ocr_text (triggers update FTS automatically)
        update_stmts.append(
            f"UPDATE pages SET ocr_text = {escape_sql(text)} WHERE id = {page['id']};"
        )

        # Set issues.ocr_excerpt (first ~300 chars of front page)
        if page["issue_id"] not in seen_issues:
            excerpt = text[:300].rsplit(" ", 1)[0] if len(text) > 300 else text
            excerpt_stmts.append(
                f"UPDATE issues SET ocr_excerpt = {escape_sql(excerpt)} WHERE id = {escape_sql(page['issue_id'])};"
            )
            seen_issues.add(page["issue_id"])

        success += 1

        # Execute in batches of 200
        if len(update_stmts) >= 200:
            run_sql_batch(update_stmts + excerpt_stmts, remote)
            print(f"  Indexed {success}/{len(pages_to_index)} (skipped {skipped})")
            update_stmts = []
            excerpt_stmts = []

    # Final batch
    if update_stmts:
        run_sql_batch(update_stmts + excerpt_stmts, remote)

    print(f"Done! Indexed {success} pages, skipped {skipped}.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Test OCR fetch for a known page**

Run:
```bash
cd workers && python -c "
import urllib.request, json
url = 'https://pages.dangerouspress.org/chicago-defender/1919/1919-07-26/page_01.json'
try:
    resp = urllib.request.urlopen(url, timeout=10)
    data = json.loads(resp.read())
    texts = [r['text'] for r in data.get('regions', []) if r.get('text')]
    print(f'Found {len(texts)} regions, first: {texts[0][:80] if texts else \"none\"}')
except Exception as e:
    print(f'Error: {e}')
"
```
Expected: Region count and first text snippet, confirming OCR JSON format.

- [ ] **Step 3: Commit**

```bash
git add workers/scripts/ocr-index.py
git commit -m "feat: add OCR indexing script (R2 JSON → D1 pages.ocr_text)"
```

---

## Chunk 2: Query Layer and Shared Templates

### Task 5: Query Functions

**Files:**
- Create: `workers/src/db/queries.ts`

All D1 queries in one file. Each function takes the D1 binding and returns typed results.

- [ ] **Step 1: Write `queries.ts` with all query functions**

```typescript
import type { Paper, Issue, Page, SearchResult, SearchFilters, YearStat } from '../types';

const ITEMS_PER_PAGE = 20;
const ISSUES_PER_PAGE = 12;

// --- Papers ---

export async function getAllPapers(db: D1Database): Promise<Paper[]> {
  const { results } = await db
    .prepare('SELECT * FROM papers ORDER BY issue_count DESC')
    .all<Paper>();
  return results;
}

export async function getPaper(db: D1Database, slug: string): Promise<Paper | null> {
  return db
    .prepare('SELECT * FROM papers WHERE slug = ?')
    .bind(slug)
    .first<Paper>();
}

// --- Issues ---

export async function getIssuesByPaper(
  db: D1Database,
  slug: string,
  opts: { year?: number; month?: number; page?: number; sort?: string } = {}
): Promise<{ issues: Issue[]; total: number }> {
  const { year, month, page = 1, sort = 'date-asc' } = opts;

  let where = 'WHERE paper_slug = ?';
  const params: (string | number)[] = [slug];

  if (year) {
    where += ' AND year = ?';
    params.push(year);
  }
  if (month) {
    where += ' AND month = ?';
    params.push(month);
  }

  const orderBy = sort === 'date-desc' ? 'ORDER BY date DESC' : 'ORDER BY date ASC';
  const offset = (page - 1) * ISSUES_PER_PAGE;

  const [countResult, issueResult] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as total FROM issues ${where}`).bind(...params).first<{ total: number }>(),
    db.prepare(`SELECT * FROM issues ${where} ${orderBy} LIMIT ? OFFSET ?`)
      .bind(...params, ISSUES_PER_PAGE, offset)
      .all<Issue>(),
  ]);

  return {
    issues: issueResult.results,
    total: countResult?.total ?? 0,
  };
}

export async function getIssue(db: D1Database, slug: string, date: string): Promise<Issue | null> {
  return db
    .prepare('SELECT * FROM issues WHERE paper_slug = ? AND date = ?')
    .bind(slug, date)
    .first<Issue>();
}

export async function getAdjacentIssues(
  db: D1Database,
  slug: string,
  seq: number
): Promise<{ prev: Issue | null; next: Issue | null }> {
  const [prev, next] = await Promise.all([
    db.prepare('SELECT * FROM issues WHERE paper_slug = ? AND seq = ?').bind(slug, seq - 1).first<Issue>(),
    db.prepare('SELECT * FROM issues WHERE paper_slug = ? AND seq = ?').bind(slug, seq + 1).first<Issue>(),
  ]);
  return { prev, next };
}

export async function getIssuesByDate(db: D1Database, date: string): Promise<(Issue & { paper_title: string; location: string | null })[]> {
  const { results } = await db
    .prepare(
      `SELECT i.*, p.title as paper_title, p.location
       FROM issues i JOIN papers p ON p.slug = i.paper_slug
       WHERE i.date = ? ORDER BY p.title`
    )
    .bind(date)
    .all();
  return results as any;
}

// --- Pages ---

export async function getPages(db: D1Database, issueId: string): Promise<Page[]> {
  const { results } = await db
    .prepare('SELECT * FROM pages WHERE issue_id = ? ORDER BY page_num')
    .bind(issueId)
    .all<Page>();
  return results;
}

// --- Timeline ---

export async function getYearStats(db: D1Database, slug?: string): Promise<YearStat[]> {
  if (slug) {
    const { results } = await db
      .prepare('SELECT year, COUNT(*) as count FROM issues WHERE paper_slug = ? GROUP BY year ORDER BY year')
      .bind(slug)
      .all<YearStat>();
    return results;
  }
  const { results } = await db
    .prepare('SELECT year, COUNT(*) as count FROM issues GROUP BY year ORDER BY year')
    .all<YearStat>();
  return results;
}

export async function getMonthStats(
  db: D1Database,
  year: number,
  slug?: string
): Promise<{ month: number; count: number }[]> {
  const query = slug
    ? 'SELECT month, COUNT(*) as count FROM issues WHERE year = ? AND paper_slug = ? GROUP BY month ORDER BY month'
    : 'SELECT month, COUNT(*) as count FROM issues WHERE year = ? GROUP BY month ORDER BY month';
  const stmt = slug
    ? db.prepare(query).bind(year, slug)
    : db.prepare(query).bind(year);
  const { results } = await stmt.all<{ month: number; count: number }>();
  return results;
}

// --- Search ---

export async function searchOCR(
  db: D1Database,
  query: string,
  filters: SearchFilters = {}
): Promise<{
  results: SearchResult[];
  total: number;
  paperCounts: Map<string, { title: string; count: number }>;
}> {
  const { fromYear = 1905, toYear = 1929, papers, sort = 'relevance', page = 1 } = filters;
  const offset = (page - 1) * ITEMS_PER_PAGE;

  // Build WHERE clause for filters
  let filterWhere = 'AND i.year BETWEEN ? AND ?';
  const filterParams: (string | number)[] = [fromYear, toYear];

  if (papers && papers.length > 0) {
    const placeholders = papers.map(() => '?').join(', ');
    filterWhere += ` AND i.paper_slug IN (${placeholders})`;
    filterParams.push(...papers);
  }

  const orderBy = sort === 'date-asc' ? 'ORDER BY i.date ASC'
    : sort === 'date-desc' ? 'ORDER BY i.date DESC'
    : 'ORDER BY rank';

  // Run main query and facet query in parallel
  const [mainResult, countResult, facetResult] = await Promise.all([
    // Main results
    db.prepare(
      `SELECT snippet(ocr_search, 0, '<mark>', '</mark>', '...', 30) as excerpt,
              i.id as issue_id, i.date, i.thumbnail_url, i.ocr_excerpt, i.paper_slug,
              pg.page_num, p.title as paper_title, p.location
       FROM ocr_search
       JOIN pages pg ON pg.id = ocr_search.rowid
       JOIN issues i ON i.id = pg.issue_id
       JOIN papers p ON p.slug = i.paper_slug
       WHERE ocr_search MATCH ?
       ${filterWhere}
       ${orderBy}
       LIMIT ? OFFSET ?`
    ).bind(query, ...filterParams, ITEMS_PER_PAGE, offset).all<SearchResult>(),

    // Total count
    db.prepare(
      `SELECT COUNT(*) as total
       FROM ocr_search
       JOIN pages pg ON pg.id = ocr_search.rowid
       JOIN issues i ON i.id = pg.issue_id
       WHERE ocr_search MATCH ?
       ${filterWhere}`
    ).bind(query, ...filterParams).first<{ total: number }>(),

    // Paper facet counts
    db.prepare(
      `SELECT i.paper_slug, p.title, COUNT(*) as count
       FROM ocr_search
       JOIN pages pg ON pg.id = ocr_search.rowid
       JOIN issues i ON i.id = pg.issue_id
       JOIN papers p ON p.slug = i.paper_slug
       WHERE ocr_search MATCH ?
       AND i.year BETWEEN ? AND ?
       GROUP BY i.paper_slug
       ORDER BY count DESC`
    ).bind(query, fromYear, toYear).all<{ paper_slug: string; title: string; count: number }>(),
  ]);

  const paperCounts = new Map<string, { title: string; count: number }>();
  for (const row of facetResult.results) {
    paperCounts.set(row.paper_slug, { title: row.title, count: row.count });
  }

  return {
    results: mainResult.results,
    total: countResult?.total ?? 0,
    paperCounts,
  };
}

// --- Sitemap ---

export async function getIssueUrlsForPaper(
  db: D1Database,
  slug: string
): Promise<{ slug: string; date: string }[]> {
  const { results } = await db
    .prepare('SELECT paper_slug as slug, date FROM issues WHERE paper_slug = ? ORDER BY date')
    .bind(slug)
    .all<{ slug: string; date: string }>();
  return results;
}

export async function getAllPaperSlugs(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT slug FROM papers ORDER BY slug')
    .all<{ slug: string }>();
  return results.map((r) => r.slug);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
cd workers && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add workers/src/db/queries.ts
git commit -m "feat: add all D1 query functions (papers, issues, pages, search, sitemap)"
```

---

### Task 6: Shared Layout Template

**Files:**
- Create: `workers/src/templates/layout.ts`

The HTML shell wrapping every page. Includes `<head>` with meta tags, nav bar with search, footer.

- [ ] **Step 1: Write `layout.ts`**

```typescript
export interface LayoutOptions {
  title: string;
  description?: string;
  ogImage?: string;
  canonicalUrl?: string;
  jsonLd?: object;
  bodyClass?: string;
}

export function layout(options: LayoutOptions, content: string): string {
  const { title, description, ogImage, canonicalUrl, jsonLd, bodyClass } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — Dangerous Press</title>
  ${description ? `<meta name="description" content="${escapeAttr(description)}">` : ''}
  <meta property="og:title" content="${escapeAttr(title)}">
  ${description ? `<meta property="og:description" content="${escapeAttr(description)}">` : ''}
  ${ogImage ? `<meta property="og:image" content="${escapeAttr(ogImage)}">` : ''}
  <meta property="og:type" content="website">
  ${canonicalUrl ? `<link rel="canonical" href="${escapeAttr(canonicalUrl)}">` : ''}
  ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
  <link rel="stylesheet" href="/style.css">
  <link rel="icon" href="/favicon.svg">
</head>
<body class="${bodyClass ?? ''}">
  <nav class="site-nav">
    <div class="site-nav-inner">
      <a href="/" class="site-logo">Dangerous Press</a>
      <div class="site-nav-links">
        <a href="/papers">Papers</a>
        <a href="/about">About</a>
        <form action="/search" method="get" class="nav-search-form">
          <input type="search" name="q" placeholder="Search the archive..." class="nav-search-input" aria-label="Search">
        </form>
      </div>
    </div>
  </nav>
  <main>
    ${content}
  </main>
  <footer class="site-footer">
    <p>Dangerous Press Archive — African American Newspapers, 1905–1929</p>
  </footer>
</body>
</html>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd workers && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add workers/src/templates/layout.ts
git commit -m "feat: add shared HTML layout template with meta tags, nav, footer"
```

---

### Task 7: Shared Template Components

**Files:**
- Create: `workers/src/templates/components/breadcrumb.ts`
- Create: `workers/src/templates/components/pagination.ts`
- Create: `workers/src/templates/components/issue-card.ts`
- Create: `workers/src/templates/components/paper-card.ts`
- Create: `workers/src/templates/components/timeline.ts`
- Create: `workers/src/templates/components/search-bar.ts`

- [ ] **Step 1: Write `breadcrumb.ts`**

```typescript
export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function breadcrumb(items: BreadcrumbItem[]): string {
  const parts = items.map((item, i) => {
    if (i === items.length - 1 || !item.href) {
      return `<span class="breadcrumb-current">${item.label}</span>`;
    }
    return `<a href="${item.href}" class="breadcrumb-link">${item.label}</a>`;
  });
  return `<nav class="breadcrumb" aria-label="Breadcrumb">${parts.join(' <span class="breadcrumb-sep">›</span> ')}</nav>`;
}
```

- [ ] **Step 2: Write `pagination.ts`**

```typescript
export function pagination(basePath: string, currentPage: number, totalItems: number, itemsPerPage: number): string {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (totalPages <= 1) return '';

  const sep = basePath.includes('?') ? '&' : '?';
  const pageUrl = (p: number) => `${basePath}${sep}page=${p}`;

  const pages: string[] = [];

  if (currentPage > 1) {
    pages.push(`<a href="${pageUrl(currentPage - 1)}" class="pagination-link">← Prev</a>`);
  }

  // Show: 1 ... (current-1) current (current+1) ... last
  const show = new Set<number>();
  show.add(1);
  show.add(totalPages);
  for (let i = Math.max(1, currentPage - 1); i <= Math.min(totalPages, currentPage + 1); i++) {
    show.add(i);
  }

  let prev = 0;
  for (const p of [...show].sort((a, b) => a - b)) {
    if (p - prev > 1) pages.push('<span class="pagination-ellipsis">...</span>');
    if (p === currentPage) {
      pages.push(`<span class="pagination-current">${p}</span>`);
    } else {
      pages.push(`<a href="${pageUrl(p)}" class="pagination-link">${p}</a>`);
    }
    prev = p;
  }

  if (currentPage < totalPages) {
    pages.push(`<a href="${pageUrl(currentPage + 1)}" class="pagination-link">Next →</a>`);
  }

  return `<nav class="pagination" aria-label="Pagination">${pages.join('')}</nav>`;
}
```

- [ ] **Step 3: Write `issue-card.ts`**

```typescript
import type { Issue } from '../../types';
import { escapeHtml } from '../layout';

export function issueCard(issue: Issue, paperTitle?: string, paperSlug?: string): string {
  const slug = paperSlug ?? issue.paper_slug;
  const href = `/papers/${slug}/${issue.date}`;
  const displayDate = formatDate(issue.date);
  const title = paperTitle ?? '';

  return `<article class="issue-card glass-card">
  <a href="${href}" class="issue-card-link">
    <div class="issue-card-thumb">
      ${issue.thumbnail_url
        ? `<img src="${escapeHtml(issue.thumbnail_url)}" alt="${escapeHtml(title)}, ${displayDate}" loading="lazy">`
        : '<div class="issue-card-placeholder"></div>'}
    </div>
    <div class="issue-card-info">
      ${title ? `<h3 class="issue-card-title">${escapeHtml(title)}</h3>` : ''}
      <p class="issue-card-date">${displayDate}</p>
      <p class="issue-card-pages">${issue.page_count} page${issue.page_count !== 1 ? 's' : ''}</p>
    </div>
  </a>
</article>`;
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
}
```

- [ ] **Step 4: Write `paper-card.ts`**

```typescript
import type { Paper } from '../../types';
import { escapeHtml } from '../layout';

export function paperCard(paper: Paper): string {
  return `<article class="paper-gallery-card glass-card">
  <a href="/papers/${paper.slug}" class="paper-card-link">
    <div class="paper-gallery-masthead">
      ${paper.thumbnail_url
        ? `<img src="${escapeHtml(paper.thumbnail_url)}" alt="${escapeHtml(paper.title)}" loading="lazy">`
        : '<div class="paper-card-placeholder"></div>'}
    </div>
    <div class="paper-card-info">
      <div class="paper-card-header">
        <h3 class="paper-card-title">${escapeHtml(paper.title)}</h3>
        ${paper.location ? `<span class="paper-card-location">${escapeHtml(paper.location)}</span>` : ''}
      </div>
      <div class="paper-card-stats">
        <span class="paper-card-dates">${paper.first_date?.slice(0, 4) ?? ''}–${paper.last_date?.slice(0, 4) ?? ''}</span>
        <span class="paper-card-count">${paper.issue_count} issues</span>
      </div>
    </div>
  </a>
</article>`;
}
```

- [ ] **Step 5: Write `timeline.ts`**

```typescript
import type { YearStat } from '../../types';

export function timeline(
  yearStats: YearStat[],
  selectedYear: number | null,
  baseUrl: string,
  totalIssues: number
): string {
  if (yearStats.length === 0) return '';

  const maxCount = Math.max(...yearStats.map((s) => s.count));
  const maxBarHeight = 60;
  const minBarHeight = 4;

  const bars = yearStats.map((stat) => {
    const height = Math.max(minBarHeight, Math.round((stat.count / maxCount) * maxBarHeight));
    const selected = stat.year === selectedYear;
    // baseUrl is the paper slug (e.g., "chicago-defender")
    // If clicking the already-selected year, deselect (link to paper detail without year)
    const href = selected
      ? `/papers/${baseUrl}`
      : `/papers/${baseUrl}?year=${stat.year}`;

    return `<a href="${href}"
      class="timeline-bar-col ${selected ? 'selected' : ''}"
      data-year="${stat.year}" data-count="${stat.count}"
      title="${stat.year}: ${stat.count} issues">
      <div class="timeline-bar" style="height:${height}px"></div>
    </a>`;
  });

  const labels = yearStats
    .filter((_, i) => i % 5 === 0 || i === yearStats.length - 1)
    .map((s) => `<span class="timeline-label">${s.year}</span>`);

  return `<div class="timeline-scrubber">
  <div class="timeline-header">
    <span class="timeline-title">TIMELINE</span>
    <span class="timeline-total">${totalIssues.toLocaleString()} issues</span>
  </div>
  <div class="timeline-bars">${bars.join('')}</div>
  <div class="timeline-labels">${labels.join('')}</div>
</div>`;
}

export function monthPills(
  months: { month: number; count: number }[],
  selectedMonth: number | null,
  baseUrl: string
): string {
  if (months.length === 0) return '';

  const sep = baseUrl.includes('?') ? '&' : '?';
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pills = months.map((m) => {
    const selected = m.month === selectedMonth;
    return `<a href="${baseUrl}${sep}month=${m.month}"
      class="month-pill ${selected ? 'selected' : ''}">
      ${names[m.month - 1]} (${m.count})
    </a>`;
  });

  return `<div class="month-pills">${pills.join('')}</div>`;
}
```

- [ ] **Step 6: Write `date-fmt.ts`**

```typescript
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Jan 5, 1905" */
export function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}

/** "Saturday, January 5, 1905" */
export function formatDateLong(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  return `${DAYS[dateObj.getDay()]}, ${MONTHS_LONG[m - 1]} ${d}, ${y}`;
}

/** "January 5, 1905" (no day-of-week) */
export function formatDateMedium(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} ${d}, ${y}`;
}
```

- [ ] **Step 7: Write `search-bar.ts`**

```typescript
import { escapeAttr } from '../layout';

export function searchBar(query: string = '', autofocus: boolean = false): string {
  return `<form action="/search" method="get" class="search-form">
  <input type="search" name="q" value="${escapeAttr(query)}"
    placeholder="Search the archive..." class="search-input"
    aria-label="Search" ${autofocus ? 'autofocus' : ''}>
  <button type="submit" class="search-button">Search</button>
</form>`;
}
```

- [ ] **Step 8: Verify compilation**

Run: `cd workers && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add workers/src/templates/components/
git commit -m "feat: add shared template components (breadcrumb, pagination, cards, timeline, date-fmt, search)"
```

---

### Task 8: Error Page Template

**Files:**
- Create: `workers/src/templates/error-page.ts`

- [ ] **Step 1: Write `error-page.ts`**

```typescript
import { layout } from './layout';
import { searchBar } from './components/search-bar';

export function notFoundPage(): string {
  return layout({ title: 'Not Found' }, `
    <div class="error-page">
      <h1>Page Not Found</h1>
      <p>The page you're looking for doesn't exist in the archive.</p>
      ${searchBar('', true)}
      <p><a href="/papers">Browse all papers</a></p>
    </div>
  `);
}

export function errorPage(): string {
  return layout({ title: 'Error' }, `
    <div class="error-page">
      <h1>Something went wrong</h1>
      <p>We're having trouble loading that page. Please try again.</p>
      <p><a href="/">Return to homepage</a></p>
    </div>
  `);
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd workers && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add workers/src/templates/error-page.ts
git commit -m "feat: add 404 and 500 error page templates"
```

---

## Chunk 3: Page Handlers and Templates (Browsing)

### Task 9: Homepage Handler + Template

**Files:**
- Create: `workers/src/templates/home-page.ts`
- Create: `workers/src/handlers/home.ts`
- Modify: `workers/src/index.ts`

- [ ] **Step 1: Write `home-page.ts`**

```typescript
import type { Paper } from '../types';
import { layout } from './layout';
import { paperCard } from './components/paper-card';
import { searchBar } from './components/search-bar';

export function homePage(papers: Paper[]): string {
  const totalIssues = papers.reduce((sum, p) => sum + p.issue_count, 0);
  const cards = papers.map(paperCard).join('');

  return layout(
    {
      title: 'African American Newspapers, 1905–1929',
      description: `Explore ${totalIssues.toLocaleString()} digitized issues from ${papers.length} African American newspapers published between 1905 and 1929.`,
    },
    `<section class="hero-section">
      <h1>Dangerous Press</h1>
      <p class="hero-subtitle">African American Newspapers, 1905–1929</p>
      <p class="hero-stats">${totalIssues.toLocaleString()} issues from ${papers.length} newspapers</p>
      ${searchBar('', true)}
    </section>
    <section class="gallery-section">
      <div class="section-header">
        <h2>Browse by Paper</h2>
      </div>
      <div class="paper-gallery-grid">
        ${cards}
      </div>
    </section>`
  );
}
```

- [ ] **Step 2: Write `home.ts` handler**

```typescript
import { Hono } from 'hono';
import type { Env } from '../types';
import { getAllPapers } from '../db/queries';
import { homePage } from '../templates/home-page';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const papers = await getAllPapers(c.env.DB);
  const html = homePage(papers);
  return c.html(html, 200, {
    'Cache-Control': 'public, max-age=86400',
  });
});

export default app;
```

- [ ] **Step 3: Update `src/index.ts` to mount home handler**

```typescript
import { Hono } from 'hono';
import type { Env } from './types';
import home from './handlers/home';
import { notFoundPage, errorPage } from './templates/error-page';

const app = new Hono<{ Bindings: Env }>();

// Mount handlers
app.route('/', home);

// 404
app.notFound((c) => c.html(notFoundPage(), 404));

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.html(errorPage(), 500);
});

export default app;
```

- [ ] **Step 4: Test locally with seeded data**

Run:
```bash
cd workers && npx wrangler dev
```
Open `http://localhost:8787/` — should see homepage with paper cards.

- [ ] **Step 5: Commit**

```bash
git add workers/src/handlers/home.ts workers/src/templates/home-page.ts workers/src/index.ts
git commit -m "feat: add homepage handler with paper gallery"
```

---

### Task 10: Paper Gallery + Paper Detail Handlers

**Files:**
- Create: `workers/src/templates/paper-gallery-page.ts`
- Create: `workers/src/templates/paper-detail-page.ts`
- Create: `workers/src/handlers/papers.ts`
- Modify: `workers/src/index.ts`

- [ ] **Step 1: Write `paper-gallery-page.ts`**

```typescript
import type { Paper } from '../types';
import { layout } from './layout';
import { paperCard } from './components/paper-card';
import { searchBar } from './components/search-bar';

export function paperGalleryPage(papers: Paper[]): string {
  const cards = papers.map(paperCard).join('');
  return layout(
    {
      title: 'All Papers',
      description: `Browse ${papers.length} African American newspapers from 1905–1929.`,
    },
    `<section class="gallery-section">
      <h1>All Papers</h1>
      ${searchBar()}
      <div class="paper-gallery-grid">${cards}</div>
    </section>`
  );
}
```

- [ ] **Step 2: Write `paper-detail-page.ts`**

```typescript
import type { Paper, Issue, YearStat } from '../types';
import { layout } from './layout';
import { breadcrumb } from './components/breadcrumb';
import { issueCard } from './components/issue-card';
import { timeline, monthPills } from './components/timeline';
import { pagination } from './components/pagination';
import { escapeHtml } from './layout';

interface PaperDetailData {
  paper: Paper;
  issues: Issue[];
  total: number;
  yearStats: YearStat[];
  months: { month: number; count: number }[];
  selectedYear: number | null;
  selectedMonth: number | null;
  currentPage: number;
}

export function paperDetailPage(data: PaperDetailData): string {
  const { paper, issues, total, yearStats, months, selectedYear, selectedMonth, currentPage } = data;
  const totalIssues = yearStats.reduce((sum, s) => sum + s.count, 0);

  const crumbs = [
    { label: 'Papers', href: '/papers' },
    { label: paper.title },
  ];

  const baseUrl = paper.slug;
  const yearParam = selectedYear ? `?year=${selectedYear}` : '';
  const monthParam = selectedMonth ? `&month=${selectedMonth}` : '';
  const paginationBase = `/papers/${paper.slug}${yearParam}${monthParam}`;

  const cards = issues.map((issue) => issueCard(issue, paper.title, paper.slug)).join('');

  return layout(
    {
      title: paper.title,
      description: `${paper.title}${paper.location ? `, ${paper.location}` : ''} — ${totalIssues} issues, ${paper.first_date?.slice(0, 4)}–${paper.last_date?.slice(0, 4)}.`,
    },
    `<section class="paper-detail-section">
      ${breadcrumb(crumbs)}
      <div class="paper-detail-header">
        <h1>${escapeHtml(paper.title)}</h1>
        ${paper.location ? `<p class="paper-location">${escapeHtml(paper.location)}</p>` : ''}
        <p class="paper-stats">${totalIssues} issues · ${paper.first_date?.slice(0, 4)}–${paper.last_date?.slice(0, 4)}</p>
      </div>
      ${timeline(yearStats, selectedYear, baseUrl, totalIssues)}
      ${selectedYear ? monthPills(months, selectedMonth, `/papers/${paper.slug}?year=${selectedYear}`) : ''}
      <div class="result-header">
        <span>${total} issue${total !== 1 ? 's' : ''}${selectedYear ? ` in ${selectedYear}` : ''}</span>
      </div>
      <div class="issue-grid">${cards}</div>
      ${pagination(paginationBase, currentPage, total, 12)}
    </section>`
  );
}
```

- [ ] **Step 3: Write `papers.ts` handler**

```typescript
import { Hono } from 'hono';
import type { Env } from '../types';
import * as db from '../db/queries';
import { paperGalleryPage } from '../templates/paper-gallery-page';
import { paperDetailPage } from '../templates/paper-detail-page';
import { notFoundPage } from '../templates/error-page';

const app = new Hono<{ Bindings: Env }>();

// GET /papers — gallery
app.get('/', async (c) => {
  const papers = await db.getAllPapers(c.env.DB);
  return c.html(paperGalleryPage(papers), 200, { 'Cache-Control': 'public, max-age=86400' });
});

// GET /papers/:slug — paper detail (optionally with ?year=&month=&page=)
app.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const paper = await db.getPaper(c.env.DB, slug);
  if (!paper) return c.html(notFoundPage(), 404);

  const yearParam = c.req.query('year');
  const monthParam = c.req.query('month');
  const pageParam = c.req.query('page');

  const selectedYear = yearParam ? parseInt(yearParam, 10) : null;
  const selectedMonth = monthParam ? parseInt(monthParam, 10) : null;
  const currentPage = pageParam ? parseInt(pageParam, 10) : 1;

  const [issueResult, yearStats, months] = await Promise.all([
    db.getIssuesByPaper(c.env.DB, slug, {
      year: selectedYear ?? undefined,
      month: selectedMonth ?? undefined,
      page: currentPage,
    }),
    db.getYearStats(c.env.DB, slug),
    selectedYear ? db.getMonthStats(c.env.DB, selectedYear, slug) : Promise.resolve([]),
  ]);

  return c.html(
    paperDetailPage({
      paper,
      issues: issueResult.issues,
      total: issueResult.total,
      yearStats,
      months,
      selectedYear,
      selectedMonth,
      currentPage,
    }),
    200,
    { 'Cache-Control': 'public, max-age=86400' }
  );
});

// GET /papers/:slug/:segment — year or date
app.get('/:slug/:segment', async (c) => {
  const slug = c.req.param('slug');
  const segment = c.req.param('segment');

  // Route disambiguation: YYYY-MM-DD = date (issue page), YYYY = year
  if (/^\d{4}-\d{2}-\d{2}$/.test(segment)) {
    // Issue page — handled by issue handler (forwarded below)
    // We import and call the issue handler logic directly
    const { issuePageHandler } = await import('./issue');
    return issuePageHandler(c, slug, segment);
  }

  if (/^\d{4}$/.test(segment)) {
    // Paper + year — redirect to paper detail with year param
    const year = parseInt(segment, 10);
    return c.redirect(`/papers/${slug}?year=${year}`, 301);
  }

  return c.html(notFoundPage(), 404);
});

// GET /papers/:slug/:date/:pageNum — specific page
app.get('/:slug/:date/:pageNum', async (c) => {
  const slug = c.req.param('slug');
  const date = c.req.param('date');
  const pageNum = c.req.param('pageNum');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d+$/.test(pageNum)) {
    return c.html(notFoundPage(), 404);
  }

  const { issuePageHandler } = await import('./issue');
  return issuePageHandler(c, slug, date, parseInt(pageNum, 10));
});

export default app;
```

- [ ] **Step 4: Update `src/index.ts` to mount papers handler**

Add to `src/index.ts`:
```typescript
import papers from './handlers/papers';
// ...
app.route('/papers', papers);
```

- [ ] **Step 5: Test locally**

Run: `cd workers && npx wrangler dev`
- `http://localhost:8787/papers` — paper gallery
- `http://localhost:8787/papers/chicago-defender` — paper detail with timeline
- `http://localhost:8787/papers/chicago-defender?year=1919` — year-filtered view

- [ ] **Step 6: Commit**

```bash
git add workers/src/handlers/papers.ts workers/src/templates/paper-gallery-page.ts workers/src/templates/paper-detail-page.ts workers/src/index.ts
git commit -m "feat: add paper gallery and paper detail pages with timeline"
```

---

### Task 11: Issue Page Handler + Template

**Files:**
- Create: `workers/src/templates/issue-page.ts`
- Create: `workers/src/handlers/issue.ts`

The primary SEO target page.

- [ ] **Step 1: Write `issue-page.ts`**

```typescript
import type { Paper, Issue, Page } from '../types';
import { layout, escapeHtml, escapeAttr } from './layout';
import { breadcrumb } from './components/breadcrumb';

interface IssuePageData {
  paper: Paper;
  issue: Issue;
  pages: Page[];
  prev: Issue | null;
  next: Issue | null;
  initialPage: number;
}

export function issuePage(data: IssuePageData): string {
  const { paper, issue, pages, prev, next, initialPage } = data;
  const displayDate = formatDateLong(issue.date);
  const frontPage = pages.find((p) => p.page_num === 1);
  const ocrText = frontPage?.ocr_text ?? '';

  const crumbs = [
    { label: 'Papers', href: '/papers' },
    { label: paper.title, href: `/papers/${paper.slug}` },
    { label: issue.date.slice(0, 4), href: `/papers/${paper.slug}?year=${issue.year}` },
    { label: displayDate },
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: `${paper.title}, ${displayDate}`,
    datePublished: issue.date,
    publisher: {
      '@type': 'Organization',
      name: paper.title,
    },
    image: issue.thumbnail_url,
    description: issue.ocr_excerpt ?? `Issue of ${paper.title} published on ${displayDate}.`,
  };

  const thumbs = pages.map((p) => {
    const active = p.page_num === initialPage ? ' active' : '';
    return `<a href="/papers/${paper.slug}/${issue.date}/${p.page_num}"
      class="page-thumb${active}" data-page="${p.page_num}" data-image-url="${escapeAttr(p.image_url)}">
      <span class="page-thumb-num">${p.page_num}</span>
    </a>`;
  }).join('');

  return layout(
    {
      title: `${paper.title}, ${displayDate}`,
      description: issue.ocr_excerpt ?? `Issue of ${paper.title}, ${displayDate}. ${issue.page_count} pages.`,
      ogImage: issue.thumbnail_url ?? undefined,
      canonicalUrl: `https://dangerouspress.org/papers/${paper.slug}/${issue.date}`,
      jsonLd,
      bodyClass: 'issue-page-body',
    },
    `<section class="issue-page-section">
      ${breadcrumb(crumbs)}
      <div class="issue-header">
        <h1>${escapeHtml(paper.title)}</h1>
        <p class="issue-meta">${displayDate}${paper.location ? ` · ${escapeHtml(paper.location)}` : ''} · ${issue.page_count} page${issue.page_count !== 1 ? 's' : ''}</p>
        <div class="issue-actions">
          <button id="open-viewer" class="btn btn-primary" data-issue-id="${escapeAttr(issue.id)}" data-initial-page="${initialPage}">Open Viewer</button>
        </div>
      </div>
      <div class="issue-content">
        <div class="issue-sidebar">
          <div class="issue-thumbnail">
            ${frontPage ? `<img src="${escapeAttr(frontPage.image_url)}" alt="Front page" loading="eager" id="front-page-img">` : ''}
          </div>
          <div class="page-thumbs">${thumbs}</div>
        </div>
        <div class="issue-main">
          <h2>Front Page Text (OCR)</h2>
          <div class="ocr-text" data-nosnippet>${escapeHtml(ocrText)}</div>
        </div>
      </div>
      <nav class="issue-nav">
        ${prev ? `<a href="/papers/${paper.slug}/${prev.date}" class="issue-nav-prev">← ${formatDateLong(prev.date)}</a>` : '<span></span>'}
        ${next ? `<a href="/papers/${paper.slug}/${next.date}" class="issue-nav-next">${formatDateLong(next.date)} →</a>` : '<span></span>'}
      </nav>
    </section>
    <script src="/viewer.js" defer></script>`
  );
}

function formatDateLong(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dateObj = new Date(y, m - 1, d);
  return `${days[dateObj.getDay()]}, ${months[m - 1]} ${d}, ${y}`;
}
```

- [ ] **Step 2: Write `issue.ts` handler**

```typescript
import type { Context } from 'hono';
import type { Env } from '../types';
import * as db from '../db/queries';
import { issuePage } from '../templates/issue-page';
import { notFoundPage } from '../templates/error-page';

export async function issuePageHandler(
  c: Context<{ Bindings: Env }>,
  slug: string,
  date: string,
  pageNum: number = 1
) {
  const [paper, issue] = await Promise.all([
    db.getPaper(c.env.DB, slug),
    db.getIssue(c.env.DB, slug, date),
  ]);

  if (!paper || !issue) return c.html(notFoundPage(), 404);

  const [pages, adjacent] = await Promise.all([
    db.getPages(c.env.DB, issue.id),
    db.getAdjacentIssues(c.env.DB, slug, issue.seq),
  ]);

  return c.html(
    issuePage({
      paper,
      issue,
      pages,
      prev: adjacent.prev,
      next: adjacent.next,
      initialPage: pageNum,
    }),
    200,
    { 'Cache-Control': 'public, max-age=86400' }
  );
}
```

- [ ] **Step 3: Test locally**

Run: `cd workers && npx wrangler dev`
Open `http://localhost:8787/papers/chicago-defender/1919-07-26`
Expected: Issue page with breadcrumb, metadata, thumbnail, OCR text, prev/next links.

- [ ] **Step 4: Commit**

```bash
git add workers/src/handlers/issue.ts workers/src/templates/issue-page.ts
git commit -m "feat: add issue page with SEO meta tags, OCR text, NewsArticle JSON-LD"
```

---

### Task 12: Date Browse + About + Sitemap Handlers

**Files:**
- Create: `workers/src/templates/date-browse-page.ts`
- Create: `workers/src/handlers/date-browse.ts`
- Create: `workers/src/templates/about-page.ts`
- Create: `workers/src/handlers/about.ts`
- Create: `workers/src/handlers/sitemap.ts`
- Modify: `workers/src/index.ts`

- [ ] **Step 1: Write `date-browse-page.ts`**

```typescript
import type { Issue } from '../types';
import { layout } from './layout';
import { breadcrumb } from './components/breadcrumb';
import { issueCard } from './components/issue-card';

export function dateBrowsePage(
  date: string,
  issues: (Issue & { paper_title: string; location: string | null })[]
): string {
  const displayDate = formatDateLong(date);
  const crumbs = [
    { label: 'Papers', href: '/papers' },
    { label: displayDate },
  ];
  const cards = issues.map((issue) => issueCard(issue, issue.paper_title)).join('');

  return layout(
    {
      title: `Issues from ${displayDate}`,
      description: `${issues.length} newspaper issue${issues.length !== 1 ? 's' : ''} published on ${displayDate}.`,
    },
    `<section class="date-browse-section">
      ${breadcrumb(crumbs)}
      <h1>Issues from ${displayDate}</h1>
      <p class="date-browse-count">${issues.length} issue${issues.length !== 1 ? 's' : ''} across ${new Set(issues.map((i) => i.paper_slug)).size} papers</p>
      <div class="issue-grid">${cards}</div>
    </section>`
  );
}

function formatDateLong(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[m - 1]} ${d}, ${y}`;
}
```

- [ ] **Step 2: Write `date-browse.ts` handler**

```typescript
import { Hono } from 'hono';
import type { Env } from '../types';
import { getIssuesByDate } from '../db/queries';
import { dateBrowsePage } from '../templates/date-browse-page';
import { notFoundPage } from '../templates/error-page';

const app = new Hono<{ Bindings: Env }>();

app.get('/:date', async (c) => {
  const date = c.req.param('date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.html(notFoundPage(), 404);

  const issues = await getIssuesByDate(c.env.DB, date);
  if (issues.length === 0) return c.html(notFoundPage(), 404);

  return c.html(dateBrowsePage(date, issues), 200, { 'Cache-Control': 'public, max-age=86400' });
});

export default app;
```

- [ ] **Step 3: Write `about-page.ts` and `about.ts` handler**

`about-page.ts`:
```typescript
import { layout } from './layout';

export function aboutPage(): string {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Dangerous Press Archive',
    description: 'A digitized collection of African American newspapers published between 1905 and 1929.',
    temporalCoverage: '1905/1929',
    license: 'https://creativecommons.org/publicdomain/zero/1.0/',
  };

  return layout(
    {
      title: 'About',
      description: 'About the Dangerous Press Archive — a digitized collection of African American newspapers, 1905–1929.',
      jsonLd,
    },
    `<section class="about-section">
      <h1>About Dangerous Press</h1>
      <p>The Dangerous Press Archive is a digitized collection of African American newspapers published between 1905 and 1929. The archive includes over 20,000 issues from more than 40 newspapers.</p>
      <p>These newspapers documented the experiences, struggles, and achievements of Black communities during a transformative period in American history — from the Great Migration to the Harlem Renaissance, from World War I to the Red Summer of 1919.</p>
    </section>`
  );
}
```

`about.ts`:
```typescript
import { Hono } from 'hono';
import type { Env } from '../types';
import { aboutPage } from '../templates/about-page';

const app = new Hono<{ Bindings: Env }>();
app.get('/', async (c) => c.html(aboutPage(), 200, { 'Cache-Control': 'public, max-age=86400' }));
export default app;
```

- [ ] **Step 4: Write `sitemap.ts` handler**

```typescript
import { Hono } from 'hono';
import type { Env } from '../types';
import * as db from '../db/queries';

const BASE = 'https://dangerouspress.org';
const app = new Hono<{ Bindings: Env }>();

// Sitemap index
app.get('/sitemap.xml', async (c) => {
  const slugs = await db.getAllPaperSlugs(c.env.DB);
  const sitemaps = slugs.map(
    (s) => `<sitemap><loc>${BASE}/sitemap/${s}.xml</loc></sitemap>`
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${BASE}/sitemap/static.xml</loc></sitemap>
  ${sitemaps.join('\n  ')}
</sitemapindex>`;
  return c.text(xml, 200, {
    'Content-Type': 'application/xml',
    'Cache-Control': 'public, max-age=604800',
  });
});

// Static pages sitemap
app.get('/sitemap/static.xml', async (c) => {
  const papers = await db.getAllPapers(c.env.DB);
  const urls = [
    `<url><loc>${BASE}/</loc><priority>1.0</priority></url>`,
    `<url><loc>${BASE}/papers</loc><priority>0.9</priority></url>`,
    `<url><loc>${BASE}/about</loc><priority>0.5</priority></url>`,
    ...papers.map((p) => `<url><loc>${BASE}/papers/${p.slug}</loc><priority>0.8</priority></url>`),
  ];
  return c.text(sitemapXml(urls), 200, {
    'Content-Type': 'application/xml',
    'Cache-Control': 'public, max-age=604800',
  });
});

// Per-paper sitemap
app.get('/sitemap/:slug.xml', async (c) => {
  const slug = c.req.param('slug');
  const issues = await db.getIssueUrlsForPaper(c.env.DB, slug);
  const urls = issues.map(
    (i) => `<url><loc>${BASE}/papers/${i.slug}/${i.date}</loc><priority>0.7</priority></url>`
  );
  return c.text(sitemapXml(urls), 200, {
    'Content-Type': 'application/xml',
    'Cache-Control': 'public, max-age=604800',
  });
});

function sitemapXml(urls: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls.join('\n  ')}
</urlset>`;
}

export default app;
```

- [ ] **Step 5: Update `src/index.ts` to mount all handlers**

```typescript
import { Hono } from 'hono';
import type { Env } from './types';
import home from './handlers/home';
import papers from './handlers/papers';
import dateBrowse from './handlers/date-browse';
import about from './handlers/about';
import sitemap from './handlers/sitemap';
import { notFoundPage, errorPage } from './templates/error-page';

const app = new Hono<{ Bindings: Env }>();

app.route('/', home);
app.route('/papers', papers);
app.route('/date', dateBrowse);
app.route('/about', about);
app.route('/', sitemap); // /sitemap.xml and /sitemap/:slug.xml

app.notFound((c) => c.html(notFoundPage(), 404));
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.html(errorPage(), 500);
});

export default app;
```

- [ ] **Step 6: Test all routes locally**

Run: `cd workers && npx wrangler dev`
- `/date/1919-07-26` — date browse page
- `/about` — about page
- `/sitemap.xml` — sitemap index
- `/sitemap/chicago-defender.xml` — paper sitemap

- [ ] **Step 7: Commit**

```bash
git add workers/src/handlers/ workers/src/templates/ workers/src/index.ts
git commit -m "feat: add date browse, about, sitemap handlers; wire all routes"
```

---

## Chunk 4: Search Handler and CSS Migration

### Task 13: Search Handler + Template

**Files:**
- Create: `workers/src/templates/search-results-page.ts`
- Create: `workers/src/handlers/search.ts`
- Modify: `workers/src/index.ts`

- [ ] **Step 1: Write `search-results-page.ts`**

```typescript
import type { SearchResult, SearchFilters } from '../types';
import { layout, escapeHtml, escapeAttr } from './layout';
import { searchBar } from './components/search-bar';
import { pagination } from './components/pagination';

interface SearchPageData {
  query: string;
  results: SearchResult[];
  total: number;
  paperCounts: Map<string, { title: string; count: number }>;
  filters: SearchFilters;
}

export function searchResultsPage(data: SearchPageData): string {
  const { query, results, total, paperCounts, filters } = data;
  const currentPage = filters.page ?? 1;
  const fromYear = filters.fromYear ?? 1905;
  const toYear = filters.toYear ?? 1929;

  const resultCards = results.map((r) => searchResultCard(r)).join('');

  // Paper checkboxes
  const paperChecks = [...paperCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([slug, { title, count }]) => {
      const checked = !filters.papers || filters.papers.includes(slug) ? 'checked' : '';
      return `<label class="filter-paper">
        <input type="checkbox" name="paper" value="${escapeAttr(slug)}" ${checked}>
        <span class="filter-paper-title">${escapeHtml(title)}</span>
        <span class="filter-paper-count">${count}</span>
      </label>`;
    })
    .join('');

  // Sort options
  const sortOptions = [
    { value: 'relevance', label: 'Relevance' },
    { value: 'date-asc', label: 'Date (oldest)' },
    { value: 'date-desc', label: 'Date (newest)' },
  ]
    .map((opt) => {
      const checked = (filters.sort ?? 'relevance') === opt.value ? 'checked' : '';
      return `<label class="filter-sort"><input type="radio" name="sort" value="${opt.value}" ${checked}> ${opt.label}</label>`;
    })
    .join('');

  // Build pagination base URL
  let paginationBase = `/search?q=${encodeURIComponent(query)}`;
  if (fromYear !== 1905) paginationBase += `&from=${fromYear}`;
  if (toYear !== 1929) paginationBase += `&to=${toYear}`;
  if (filters.sort && filters.sort !== 'relevance') paginationBase += `&sort=${filters.sort}`;
  if (filters.papers) filters.papers.forEach((p) => (paginationBase += `&paper=${p}`));

  return layout(
    {
      title: `Search: ${query}`,
      description: `${total} results for "${query}" across the Dangerous Press archive.`,
    },
    `<section class="search-section">
      <div class="search-header">
        ${searchBar(query, true)}
        <p class="search-count"><strong>${total.toLocaleString()} result${total !== 1 ? 's' : ''}</strong> for "${escapeHtml(query)}"</p>
      </div>
      <div class="search-layout">
        <aside class="search-sidebar">
          <form action="/search" method="get" class="search-filters">
            <input type="hidden" name="q" value="${escapeAttr(query)}">
            <div class="filter-group">
              <h3 class="filter-heading">Date Range</h3>
              <div class="filter-date-range">
                <label>From: <input type="number" name="from" value="${fromYear}" min="1905" max="1929" class="filter-year-input"></label>
                <label>To: <input type="number" name="to" value="${toYear}" min="1905" max="1929" class="filter-year-input"></label>
              </div>
            </div>
            <div class="filter-group">
              <h3 class="filter-heading">Newspaper</h3>
              <div class="filter-papers">${paperChecks}</div>
            </div>
            <div class="filter-group">
              <h3 class="filter-heading">Sort By</h3>
              <div class="filter-sort-options">${sortOptions}</div>
            </div>
            <button type="submit" class="filter-apply">Apply Filters</button>
          </form>
        </aside>
        <div class="search-results">
          ${results.length > 0 ? resultCards : '<p class="no-results">No results found. Try a different search term.</p>'}
          ${pagination(paginationBase, currentPage, total, 20)}
        </div>
      </div>
    </section>
    <script src="/search.js" defer></script>`
  );
}

function searchResultCard(r: SearchResult): string {
  const href = `/papers/${r.paper_slug}/${r.date}`;
  const displayDate = formatDateShort(r.date);

  return `<article class="search-result">
  <a href="${href}" class="search-result-link">
    <div class="search-result-thumb">
      ${r.thumbnail_url ? `<img src="${escapeHtml(r.thumbnail_url)}" alt="" loading="lazy">` : '<div class="search-result-placeholder"></div>'}
    </div>
    <div class="search-result-body">
      <h3 class="search-result-title">${escapeHtml(r.paper_title)} — ${displayDate}</h3>
      <p class="search-result-meta">${r.location ? escapeHtml(r.location) + ' · ' : ''}Page ${r.page_num}</p>
      <p class="search-result-excerpt">${r.excerpt}</p>
    </div>
  </a>
</article>`;
}

function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
}
```

- [ ] **Step 2: Write `search.ts` handler**

```typescript
import { Hono } from 'hono';
import type { Env, SearchFilters } from '../types';
import { searchOCR } from '../db/queries';
import { searchResultsPage } from '../templates/search-results-page';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const query = c.req.query('q')?.trim();
  if (!query) {
    return c.redirect('/');
  }

  const filters: SearchFilters = {
    fromYear: c.req.query('from') ? parseInt(c.req.query('from')!, 10) : undefined,
    toYear: c.req.query('to') ? parseInt(c.req.query('to')!, 10) : undefined,
    papers: c.req.queries('paper') ?? undefined,
    sort: (c.req.query('sort') as SearchFilters['sort']) ?? undefined,
    page: c.req.query('page') ? parseInt(c.req.query('page')!, 10) : undefined,
  };

  const searchResult = await searchOCR(c.env.DB, query, filters);

  return c.html(
    searchResultsPage({
      query,
      results: searchResult.results,
      total: searchResult.total,
      paperCounts: searchResult.paperCounts,
      filters,
    }),
    200,
    { 'Cache-Control': 'public, max-age=3600' }
  );
});

export default app;
```

- [ ] **Step 3: Mount search handler in `src/index.ts`**

Add:
```typescript
import search from './handlers/search';
// ...
app.route('/search', search);
```

- [ ] **Step 4: Test locally (requires OCR data in D1)**

Run: `cd workers && npx wrangler dev`
`http://localhost:8787/search?q=lynching` — search results page (will show results only if OCR data has been indexed).

- [ ] **Step 5: Commit**

```bash
git add workers/src/handlers/search.ts workers/src/templates/search-results-page.ts workers/src/index.ts
git commit -m "feat: add search handler with FTS5, sidebar filters, pagination"
```

---

### Task 14: CSS Migration

**Files:**
- Create: `workers/src/public/style.css`

Migrate the existing `style.css` design tokens and key component styles. Add new styles for server-rendered components (search sidebar, issue page layout, etc.).

- [ ] **Step 1: Copy existing CSS design tokens and base styles**

Copy `style.css` from the root project into `workers/src/public/style.css`. Keep:
- All `:root` CSS custom properties (color palette, shadows, transitions)
- `.glass-card` styles
- `.issue-card` styles
- `.paper-gallery-card`, `.paper-gallery-masthead` styles
- `.timeline-scrubber`, `.timeline-bar`, `.month-pill` styles
- `.viewer-modal` and all viewer-related styles
- Body, typography, and base layout styles

- [ ] **Step 2: Add new styles for server-rendered components**

Append to `style.css`:

```css
/* --- Site navigation --- */
.site-nav { background: var(--bg-card); border-bottom: 1px solid var(--border-color); padding: 0.75rem 1.5rem; }
.site-nav-inner { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; }
.site-logo { font-weight: 700; font-size: 1.1rem; color: var(--text-primary); text-decoration: none; }
.site-nav-links { display: flex; gap: 1.5rem; align-items: center; }
.site-nav-links a { color: var(--text-secondary); text-decoration: none; font-size: 0.9rem; }
.nav-search-form { display: flex; }
.nav-search-input { border: 1px solid var(--border-color); border-radius: 6px; padding: 0.4rem 0.8rem; font-size: 0.85rem; background: var(--bg-primary); width: 200px; }

/* --- Breadcrumb --- */
.breadcrumb { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem; }
.breadcrumb-link { color: var(--unc-hyperlink-blue); text-decoration: none; }
.breadcrumb-sep { margin: 0 0.4rem; }

/* --- Search page --- */
.search-section { max-width: 1200px; margin: 0 auto; padding: 1.5rem; }
.search-header { margin-bottom: 1.5rem; }
.search-count { margin-top: 0.5rem; font-size: 0.9rem; color: var(--text-muted); }
.search-layout { display: flex; gap: 2rem; }
.search-sidebar { flex: 0 0 240px; }
.search-results { flex: 1; min-width: 0; }
.filter-group { margin-bottom: 1.5rem; }
.filter-heading { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 0.5rem; }
.filter-date-range { display: flex; gap: 0.5rem; }
.filter-year-input { width: 70px; border: 1px solid var(--border-color); border-radius: 4px; padding: 0.3rem; font-size: 0.85rem; }
.filter-paper { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; line-height: 2; cursor: pointer; }
.filter-paper-count { color: var(--text-muted); font-size: 0.75rem; }
.filter-apply { background: var(--accent-primary); color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; width: 100%; margin-top: 0.5rem; }
.search-result { display: flex; gap: 1rem; margin-bottom: 1.5rem; }
.search-result-link { display: flex; gap: 1rem; text-decoration: none; color: inherit; }
.search-result-thumb { flex: 0 0 70px; }
.search-result-thumb img { width: 70px; height: 95px; object-fit: cover; border-radius: 3px; border: 1px solid var(--border-color); }
.search-result-title { color: var(--unc-hyperlink-blue); font-weight: 600; font-size: 0.95rem; }
.search-result-meta { font-size: 0.75rem; color: var(--text-muted); margin: 0.2rem 0; }
.search-result-excerpt { font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5; }
.search-result-excerpt mark { background: #fff3cd; padding: 0.1rem 0.2rem; border-radius: 2px; }

/* --- Issue page --- */
.issue-page-section { max-width: 1200px; margin: 0 auto; padding: 1.5rem; }
.issue-header h1 { margin: 0 0 0.3rem; font-size: 1.5rem; }
.issue-meta { color: var(--text-muted); font-size: 0.9rem; }
.issue-actions { margin-top: 0.8rem; }
.btn { padding: 0.4rem 1rem; border-radius: 6px; font-size: 0.85rem; border: none; cursor: pointer; text-decoration: none; }
.btn-primary { background: var(--unc-hyperlink-blue); color: white; }
.issue-content { display: flex; gap: 1.5rem; margin-top: 1.5rem; }
.issue-sidebar { flex: 0 0 220px; }
.issue-thumbnail img { width: 100%; border: 1px solid var(--border-color); border-radius: 4px; }
.page-thumbs { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 0.5rem; }
.page-thumb { display: flex; align-items: center; justify-content: center; width: 32px; height: 42px; border: 1px solid var(--border-color); border-radius: 2px; font-size: 0.65rem; color: var(--text-muted); text-decoration: none; }
.page-thumb.active { border-color: var(--unc-hyperlink-blue); border-width: 2px; color: var(--unc-hyperlink-blue); }
.issue-main { flex: 1; min-width: 0; }
.ocr-text { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; padding: 1rem; font-family: Georgia, serif; font-size: 0.85rem; line-height: 1.6; max-height: 400px; overflow-y: auto; white-space: pre-wrap; }
.issue-nav { display: flex; justify-content: space-between; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border-color); }
.issue-nav a { color: var(--unc-hyperlink-blue); text-decoration: none; font-size: 0.9rem; }

/* --- Pagination --- */
.pagination { display: flex; justify-content: center; gap: 0.3rem; margin-top: 2rem; }
.pagination-link, .pagination-current { padding: 0.4rem 0.8rem; border-radius: 4px; text-decoration: none; font-size: 0.9rem; }
.pagination-link { color: var(--unc-hyperlink-blue); }
.pagination-current { background: var(--unc-hyperlink-blue); color: white; font-weight: 600; }
.pagination-ellipsis { padding: 0.4rem 0.3rem; color: var(--text-muted); }

/* --- Error page --- */
.error-page { max-width: 600px; margin: 4rem auto; text-align: center; padding: 2rem; }
.error-page h1 { font-size: 2rem; margin-bottom: 1rem; }

/* --- Grids --- */
.paper-gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
.issue-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1.5rem; }

/* --- Sections --- */
.gallery-section, .paper-detail-section, .date-browse-section, .about-section { max-width: 1200px; margin: 0 auto; padding: 1.5rem; }
.hero-section { text-align: center; padding: 3rem 1.5rem; background: var(--bg-secondary); }
.hero-subtitle { color: var(--text-muted); font-size: 1.1rem; }
.hero-stats { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem; }
.search-form { display: flex; gap: 0.5rem; max-width: 500px; margin: 0 auto; }
.search-input { flex: 1; border: 2px solid var(--accent-primary); border-radius: 6px; padding: 0.6rem 1rem; font-size: 0.95rem; }
.search-button { background: var(--accent-primary); color: white; border: none; padding: 0.6rem 1.2rem; border-radius: 6px; cursor: pointer; }

/* --- Footer --- */
.site-footer { text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.85rem; border-top: 1px solid var(--border-color); margin-top: 3rem; }

/* --- Responsive --- */
@media (max-width: 768px) {
  .search-layout { flex-direction: column; }
  .search-sidebar { flex: none; }
  .issue-content { flex-direction: column; }
  .issue-sidebar { flex: none; }
}
```

- [ ] **Step 3: Verify CSS loads in dev**

Run: `cd workers && npx wrangler dev`
Visit any page — verify styles are applied.

- [ ] **Step 4: Commit**

```bash
git add workers/src/public/style.css
git commit -m "feat: add CSS with design tokens from current site + new server-rendered component styles"
```

---

## Chunk 5: Client-Side JS, Ingest Tooling, and Deployment

### Task 15: Viewer JS (Progressive Enhancement)

**Files:**
- Create: `workers/src/public/viewer.js`

Port the existing viewer from `app.js`. The viewer activates when "Open Viewer" is clicked on the issue page. It reads page image URLs from the already-rendered page DOM.

- [ ] **Step 1: Write `viewer.js` — extract and adapt from `app.js`**

This is a ~600 line file. Extract viewer logic from the existing `app.js` (lines ~200-1100) and adapt to the server-rendered DOM contract.

**Source → Target Function Mapping:**

| app.js function | viewer.js equivalent | Changes needed |
|---|---|---|
| `openViewer(index)` | `openViewer()` | Read page URLs from DOM `.page-thumb` elements instead of `state.displayedIssues` |
| `discoverPages(issue)` | Remove | Pages are already in the DOM as `.page-thumb[data-page]` elements |
| `loadPage(pageIndex, transition)` | `loadPage(pageIndex)` | Build image URL from page data attributes instead of `state.currentPages[]` |
| `zoomImage(direction)` | `zoomImage(direction)` | Keep as-is (operates on `#viewer-image`) |
| `zoomToPoint(e)` | `zoomToPoint(e)` | Keep as-is |
| `resetZoom()` | `resetZoom()` | Keep as-is |
| Pan handlers (`mousedown/move/up`) | Same | Keep as-is (operates on `#image-wrapper`) |
| `handleKeyDown(e)` | `handleKeyDown(e)` | Remove issue-navigation keys (no `state.displayedIssues`), keep page/zoom/tool keys |
| `navigateIssue(direction)` | Remove | Use server-rendered prev/next links instead |
| `toggleThumbnails()` | `toggleThumbnails()` | Keep — reads from DOM `.page-thumb` elements |
| `downloadPage()` | `downloadPage()` | Keep — downloads current `#viewer-image` src |
| `toggleFullscreen()` | `toggleFullscreen()` | Keep as-is |

**New DOM contract** (reads from server-rendered issue page):

```javascript
// Page data: read from .page-thumb elements in the server-rendered HTML
// Each has data-page="N" attribute; image URL derived from href
const pageThumbs = document.querySelectorAll('.page-thumb');
const pages = Array.from(pageThumbs).map(el => ({
  num: parseInt(el.dataset.page),
  // href is /papers/:slug/:date/:pageNum — derive image URL from R2
  // OR store image URL as data-image-url on each .page-thumb
  imageUrl: el.dataset.imageUrl,
}));
```

**Implementation structure:**

```javascript
(function() {
  'use strict';

  const openBtn = document.getElementById('open-viewer');
  if (!openBtn) return;

  // --- State ---
  let currentPageIndex = 0;
  let zoomLevel = 1;
  const ZOOM_STEP = 1.25;
  const MAX_ZOOM = 3;
  const PRELOAD_PAGES = 2;
  const panState = { isDragging: false, startX: 0, startY: 0, translateX: 0, translateY: 0 };
  const imageCache = new Map();

  // --- Read page data from DOM ---
  const pageThumbs = Array.from(document.querySelectorAll('.page-thumb'));
  const pages = pageThumbs.map(el => ({
    num: parseInt(el.dataset.page),
    imageUrl: el.dataset.imageUrl,
  }));
  const initialPage = parseInt(openBtn.dataset.initialPage) || 1;
  const issueTitle = document.querySelector('.issue-header h1')?.textContent || '';

  // --- Create modal DOM (injected, not server-rendered) ---
  function createModal() {
    // Build the viewer modal HTML and append to document.body
    // Structure matches existing app.js modal:
    // - .viewer-modal > .modal-backdrop + .modal-content
    // - .viewer-header (title, page nav, zoom controls, tool buttons)
    // - #image-container > #image-wrapper > #viewer-image
    // - #thumbnail-strip
    // Copy the modal HTML structure from index.html lines ~480-570
  }

  // --- Page loading ---
  // Port loadPage() from app.js ~line 350
  // - Set #viewer-image src to pages[index].imageUrl
  // - Update page counter text
  // - Preload next PRELOAD_PAGES images into imageCache
  // - Reset zoom/pan state
  // - Update thumbnail active state

  // --- Zoom ---
  // Port zoomImage(), zoomToPoint(), resetZoom() from app.js ~lines 420-480
  // - zoomLevel *= ZOOM_STEP (in) or /= ZOOM_STEP (out)
  // - Clamp to [1, MAX_ZOOM]
  // - Apply via transform: scale(zoomLevel) translate(tx, ty)

  // --- Pan ---
  // Port mousedown/mousemove/mouseup handlers from app.js ~lines 500-560
  // - Track panState.isDragging, startX/Y, translateX/Y
  // - Apply transform on image-wrapper
  // - Constrain to image bounds at current zoom

  // --- Keyboard ---
  // Port handleKeyDown from app.js ~lines 600-680
  // ArrowLeft/Right: prev/next page
  // +/=: zoom in, -/_: zoom out, 0: reset zoom
  // T: toggle thumbnails, F: fullscreen, D: download
  // Escape: close modal, ?: show help overlay

  // --- Thumbnails ---
  // Port toggleThumbnails from app.js ~line 700
  // Toggle #thumbnail-strip visibility, scroll to active thumb

  // --- Download ---
  // Port downloadPage from app.js ~line 730
  // Create temp <a> with href=current image URL, download attribute, click()

  // --- Fullscreen ---
  // Port toggleFullscreen from app.js ~line 750
  // document.fullscreenElement ? document.exitFullscreen() : modal.requestFullscreen()

  // --- Init ---
  openBtn.addEventListener('click', () => {
    createModal();
    currentPageIndex = initialPage - 1;
    loadPage(currentPageIndex);
    modal.classList.remove('hidden');
  });
})();
```

**IMPORTANT for implementer:** The server-rendered issue page must add `data-image-url` attributes to each `.page-thumb` element. Update `issue-page.ts` (Task 11) to include this:
```html
<a href="..." class="page-thumb" data-page="${p.page_num}" data-image-url="${p.image_url}">
```

- [ ] **Step 2: Test viewer on an issue page**

Run: `cd workers && npx wrangler dev`
Navigate to an issue page, click "Open Viewer". Verify:
- Modal opens with first page image
- Arrow keys navigate pages
- Zoom in/out works
- Escape closes modal

- [ ] **Step 3: Commit**

```bash
git add workers/src/public/viewer.js
git commit -m "feat: add viewer.js — progressive enhancement for issue page image viewer"
```

---

### Task 16: Search JS (Progressive Enhancement)

**Files:**
- Create: `workers/src/public/search.js`

Enhances the search filter form with a date range slider and live filter updates.

- [ ] **Step 1: Write `search.js`**

```javascript
(function() {
  'use strict';

  const form = document.querySelector('.search-filters');
  if (!form) return;

  // Date range slider enhancement
  // Replace the number inputs with a range slider UI
  const fromInput = form.querySelector('input[name="from"]');
  const toInput = form.querySelector('input[name="to"]');

  if (fromInput && toInput) {
    const container = fromInput.closest('.filter-date-range');
    if (container) {
      const slider = createRangeSlider(
        parseInt(fromInput.value) || 1905,
        parseInt(toInput.value) || 1929,
        1905,
        1929
      );
      container.appendChild(slider.element);

      slider.onChange((from, to) => {
        fromInput.value = from;
        toInput.value = to;
      });
    }
  }

  function createRangeSlider(from, to, min, max) {
    const el = document.createElement('div');
    el.className = 'range-slider';
    el.innerHTML = `
      <div class="range-track">
        <div class="range-fill"></div>
        <div class="range-handle range-handle-from" tabindex="0"></div>
        <div class="range-handle range-handle-to" tabindex="0"></div>
      </div>
      <div class="range-labels">
        <span class="range-label-from">${from}</span>
        <span class="range-label-to">${to}</span>
      </div>
    `;

    const track = el.querySelector('.range-track');
    const fill = el.querySelector('.range-fill');
    const handleFrom = el.querySelector('.range-handle-from');
    const handleTo = el.querySelector('.range-handle-to');
    const labelFrom = el.querySelector('.range-label-from');
    const labelTo = el.querySelector('.range-label-to');

    let currentFrom = from;
    let currentTo = to;
    let callback = null;

    function update() {
      const range = max - min;
      const leftPct = ((currentFrom - min) / range) * 100;
      const rightPct = ((currentTo - min) / range) * 100;
      handleFrom.style.left = leftPct + '%';
      handleTo.style.left = rightPct + '%';
      fill.style.left = leftPct + '%';
      fill.style.width = (rightPct - leftPct) + '%';
      labelFrom.textContent = currentFrom;
      labelTo.textContent = currentTo;
      if (callback) callback(currentFrom, currentTo);
    }

    function startDrag(handle, isFrom) {
      function onMove(e) {
        const rect = track.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const val = Math.round(min + pct * (max - min));
        if (isFrom) {
          currentFrom = Math.min(val, currentTo - 1);
        } else {
          currentTo = Math.max(val, currentFrom + 1);
        }
        update();
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    handleFrom.addEventListener('mousedown', () => startDrag(handleFrom, true));
    handleTo.addEventListener('mousedown', () => startDrag(handleTo, false));

    update();

    return {
      element: el,
      onChange(fn) { callback = fn; },
    };
  }
})();
```

- [ ] **Step 2: Add range slider CSS to `style.css`**

Append:
```css
/* --- Range slider --- */
.range-slider { margin-top: 0.5rem; }
.range-track { position: relative; height: 6px; background: var(--border-color); border-radius: 3px; margin: 1rem 0 0.5rem; }
.range-fill { position: absolute; height: 100%; background: var(--unc-hyperlink-blue); border-radius: 3px; }
.range-handle { position: absolute; top: -5px; width: 16px; height: 16px; background: white; border: 2px solid var(--unc-hyperlink-blue); border-radius: 50%; cursor: pointer; transform: translateX(-50%); }
.range-labels { display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600; }
```

- [ ] **Step 3: Commit**

```bash
git add workers/src/public/search.js workers/src/public/style.css
git commit -m "feat: add search.js with date range slider progressive enhancement"
```

---

### Task 17: Ingest CLI Script

**Files:**
- Create: `workers/scripts/ingest.py`

Ongoing tool for adding papers, issues, and OCR after initial migration.

- [ ] **Step 1: Write `ingest.py` with subcommands**

```python
#!/usr/bin/env python3
"""Ingest data into D1 database.

Commands:
    add-paper  --slug SLUG --title TITLE [--location LOC]
    add-issues --paper SLUG --source DIR
    add-ocr    --paper SLUG [--rebuild-fts]

Usage:
    cd workers
    python scripts/ingest.py add-paper --slug chicago-whip --title "Chicago Whip" --location "Chicago, IL"
    python scripts/ingest.py add-issues --paper chicago-whip --source ../newspapers/chicago-whip/
    python scripts/ingest.py add-ocr --paper chicago-whip
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path
from collections import defaultdict

DB_NAME = "dangerouspress-db"
R2_BASE = "https://pages.dangerouspress.org"


def escape_sql(s):
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def run_sql(sql, remote=False):
    cmd = ["npx", "wrangler", "d1", "execute", DB_NAME]
    cmd.append("--remote" if remote else "--local")
    cmd.extend(["--command", sql])
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=Path(__file__).parent.parent)
    if result.returncode != 0:
        print(f"Error: {result.stderr}", file=sys.stderr)
    return result.stdout


def run_sql_json(sql, remote=False):
    """Execute SQL and return results as parsed JSON list."""
    cmd = ["npx", "wrangler", "d1", "execute", DB_NAME, "--json"]
    cmd.append("--remote" if remote else "--local")
    cmd.extend(["--command", sql])
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=Path(__file__).parent.parent)
    if result.returncode != 0:
        print(f"Error: {result.stderr}", file=sys.stderr)
        return []
    data = json.loads(result.stdout)
    if data and isinstance(data, list) and data[0].get("results"):
        return data[0]["results"]
    return []


def run_sql_batch(stmts, remote=False):
    with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False) as f:
        f.write("\n".join(stmts))
        f.flush()
        cmd = ["npx", "wrangler", "d1", "execute", DB_NAME]
        cmd.append("--remote" if remote else "--local")
        cmd.extend(["--file", f.name])
        subprocess.run(cmd, capture_output=True, text=True, cwd=Path(__file__).parent.parent, check=True)


def cmd_add_paper(args):
    sql = (
        f"INSERT OR REPLACE INTO papers (slug, title, location, issue_count) "
        f"VALUES ({escape_sql(args.slug)}, {escape_sql(args.title)}, "
        f"{escape_sql(args.location)}, 0);"
    )
    run_sql(sql, args.remote)
    print(f"Added paper: {args.title} ({args.slug})")


def cmd_add_issues(args):
    """Add issues from a source directory of already-processed JPGs."""
    source = Path(args.source)
    if not source.exists():
        print(f"Source directory not found: {source}", file=sys.stderr)
        sys.exit(1)

    # Discover issues: expect dirs named YYYY-MM-DD containing page_01.jpg, etc.
    issue_dirs = sorted([d for d in source.iterdir() if d.is_dir() and len(d.name) == 10])
    print(f"Found {len(issue_dirs)} issue directories")

    stmts = []
    page_stmts = []

    for seq, issue_dir in enumerate(issue_dirs, 1):
        date = issue_dir.name
        year = int(date[:4])
        month = int(date[5:7])
        issue_id = f"{date}_{args.paper}"

        # Find page images
        page_files = sorted(issue_dir.glob("page_*.jpg"))
        page_count = len(page_files)
        thumb = f"{R2_BASE}/{args.paper}/{year}/{date}/thumb.jpg"

        stmts.append(
            f"INSERT OR REPLACE INTO issues (id, paper_slug, date, year, month, seq, page_count, thumbnail_url) "
            f"VALUES ({escape_sql(issue_id)}, {escape_sql(args.paper)}, {escape_sql(date)}, "
            f"{year}, {month}, {seq}, {page_count}, {escape_sql(thumb)});"
        )

        for page_num, page_file in enumerate(page_files, 1):
            image_url = f"{R2_BASE}/{args.paper}/{year}/{date}/{page_file.name}"
            page_stmts.append(
                f"INSERT OR REPLACE INTO pages (issue_id, page_num, image_url) "
                f"VALUES ({escape_sql(issue_id)}, {page_num}, {escape_sql(image_url)});"
            )

    # Execute
    BATCH = 500
    print(f"Inserting {len(stmts)} issues...")
    for i in range(0, len(stmts), BATCH):
        run_sql_batch(stmts[i:i+BATCH], args.remote)

    print(f"Inserting {len(page_stmts)} pages...")
    for i in range(0, len(page_stmts), BATCH):
        run_sql_batch(page_stmts[i:i+BATCH], args.remote)

    # Update paper stats
    run_sql(
        f"UPDATE papers SET issue_count = (SELECT COUNT(*) FROM issues WHERE paper_slug = {escape_sql(args.paper)}), "
        f"first_date = (SELECT MIN(date) FROM issues WHERE paper_slug = {escape_sql(args.paper)}), "
        f"last_date = (SELECT MAX(date) FROM issues WHERE paper_slug = {escape_sql(args.paper)}) "
        f"WHERE slug = {escape_sql(args.paper)};",
        args.remote
    )
    print(f"Done. Added {len(stmts)} issues with {len(page_stmts)} pages.")


def cmd_add_ocr(args):
    """Fetch OCR JSONs from R2 and update pages.ocr_text."""
    if args.rebuild_fts:
        print("Rebuilding FTS index...")
        run_sql("INSERT INTO ocr_search(ocr_search) VALUES ('rebuild');", args.remote)

    where = f"AND i.paper_slug = {escape_sql(args.paper)}" if args.paper else ""
    query = (
        f"SELECT p.id, p.issue_id, p.image_url FROM pages p "
        f"JOIN issues i ON i.id = p.issue_id "
        f"WHERE p.page_num = 1 AND p.ocr_text IS NULL {where} "
        f"ORDER BY i.date;"
    )

    print(f"Fetching pages to OCR index{f' for {args.paper}' if args.paper else ''}...")
    raw = run_sql_json(query, args.remote)
    print(f"  {len(raw)} pages need indexing")

    stmts = []
    excerpt_stmts = []
    seen_issues = set()
    success = 0

    for page in raw:
        json_url = page["image_url"].rsplit(".", 1)[0] + ".json"
        try:
            resp = urllib.request.urlopen(json_url, timeout=10)
            ocr_data = json.loads(resp.read())
        except Exception:
            continue

        texts = [r["text"] for r in ocr_data.get("regions", []) if r.get("text") and r.get("status") == "ok"]
        text = " ".join(texts)
        if not text:
            continue

        stmts.append(f"UPDATE pages SET ocr_text = {escape_sql(text)} WHERE id = {page['id']};")

        if page["issue_id"] not in seen_issues:
            excerpt = text[:300].rsplit(" ", 1)[0] if len(text) > 300 else text
            excerpt_stmts.append(f"UPDATE issues SET ocr_excerpt = {escape_sql(excerpt)} WHERE id = {escape_sql(page['issue_id'])};")
            seen_issues.add(page["issue_id"])

        success += 1
        if len(stmts) >= 200:
            run_sql_batch(stmts + excerpt_stmts, args.remote)
            print(f"  Indexed {success}/{len(raw)}")
            stmts = []
            excerpt_stmts = []

    if stmts:
        run_sql_batch(stmts + excerpt_stmts, args.remote)

    print(f"Done! Indexed {success} pages.")


def main():
    parser = argparse.ArgumentParser(description="Ingest data into D1")
    parser.add_argument("--remote", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    p_paper = sub.add_parser("add-paper")
    p_paper.add_argument("--slug", required=True)
    p_paper.add_argument("--title", required=True)
    p_paper.add_argument("--location")

    p_issues = sub.add_parser("add-issues")
    p_issues.add_argument("--paper", required=True)
    p_issues.add_argument("--source", required=True)

    p_ocr = sub.add_parser("add-ocr")
    p_ocr.add_argument("--paper")
    p_ocr.add_argument("--rebuild-fts", action="store_true")

    args = parser.parse_args()

    if args.command == "add-paper":
        cmd_add_paper(args)
    elif args.command == "add-issues":
        cmd_add_issues(args)
    elif args.command == "add-ocr":
        cmd_add_ocr(args)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Test add-paper command**

Run:
```bash
cd workers && python scripts/ingest.py add-paper --slug test-paper --title "Test Paper" --location "Test, USA"
```
Expected: "Added paper: Test Paper (test-paper)"

Verify:
```bash
cd workers && npx wrangler d1 execute dangerouspress-db --local --command="SELECT * FROM papers WHERE slug='test-paper'"
```

- [ ] **Step 3: Clean up test data**

Run:
```bash
cd workers && npx wrangler d1 execute dangerouspress-db --local --command="DELETE FROM papers WHERE slug='test-paper'"
```

- [ ] **Step 4: Commit**

```bash
git add workers/scripts/ingest.py
git commit -m "feat: add ingest.py CLI with add-paper, add-issues, add-ocr commands"
```

---

### Task 18: Deploy to Beta

**Files:**
- Modify: `workers/wrangler.toml`

- [ ] **Step 1: Create D1 database on Cloudflare**

Run:
```bash
cd workers && npx wrangler d1 create dangerouspress-db
```
Expected: Database created. Copy the `database_id` from output.

- [ ] **Step 2: Update `wrangler.toml` with real database ID**

Replace `<to-be-created>` with the actual database ID.

- [ ] **Step 3: Run schema migration on remote**

Run:
```bash
cd workers && npx wrangler d1 execute dangerouspress-db --remote --file=src/db/schema.sql
```

- [ ] **Step 4: Seed remote database**

Run:
```bash
cd workers && python scripts/seed.py --remote
```
Expected: All papers, issues, pages inserted into production D1.

- [ ] **Step 5: Run OCR indexing on remote**

Run:
```bash
cd workers && python scripts/ocr-index.py --remote
```

- [ ] **Step 6: Deploy to beta**

Add to `wrangler.toml`:
```toml
[env.beta]
routes = [{ pattern = "beta.dangerouspress.org", custom_domain = true }]
```

Run:
```bash
cd workers && npx wrangler deploy --env beta
```
Expected: Worker deployed to `beta.dangerouspress.org`.

- [ ] **Step 7: Verify beta site**

Open `https://beta.dangerouspress.org/` — homepage with paper gallery.
Open `https://beta.dangerouspress.org/papers/chicago-defender` — paper detail.
Open `https://beta.dangerouspress.org/papers/chicago-defender/1919-07-26` — issue page with OCR text.
Open `https://beta.dangerouspress.org/search?q=lynching` — search results with highlighted snippets.
Open `https://beta.dangerouspress.org/sitemap.xml` — sitemap index.
Open a nonexistent URL like `https://beta.dangerouspress.org/papers/fake/2000-01-01` — 404 page.

- [ ] **Step 8: Commit**

```bash
git add workers/wrangler.toml
git commit -m "feat: configure beta deployment, create remote D1 database"
```
