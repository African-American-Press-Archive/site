# OCR Integration Memo for Dangerous Press v2

**To:** OCR pipeline developer
**From:** Neal
**Date:** March 2026

---

## Summary

We're migrating the Dangerous Press archive to a new server-rendered architecture (Cloudflare Workers + D1 database). The site now has full-text search across OCR content — each page's OCR text is stored in D1 and indexed with SQLite FTS5.

**Your OCR script should keep writing JSON files to the same R2 location it does now.** Nothing changes about where OCR files go. We have separate scripts that pull the JSON from R2 into the search index.

---

## Where OCR JSON files should live

**Same place as always:**

```
https://pages.dangerouspress.org/{paper-slug}/{year}/{date}/page_01.json
https://pages.dangerouspress.org/{paper-slug}/{year}/{date}/page_02.json
...
```

The JSON file sits alongside the page image:
- Image: `page_01.jpg`
- OCR: `page_01.json`

**JSON format** (unchanged):

```json
{
  "page_path": "muskogee-cimeter/1907/1907-08-02/page_01.jpg",
  "width": 1924,
  "height": 2800,
  "regions": [
    {
      "bbox": [x1, y1, x2, y2],
      "label": "text",
      "text": "The actual text content...",
      "status": "ok"
    }
  ]
}
```

**Required fields per region:**
- `bbox` — pixel coordinates `[x1, y1, x2, y2]` for interactive highlighting
- `text` — the OCR text
- `status` — must be `"ok"` to be included in the index (regions with other statuses are skipped)

**Required top-level fields:**
- `width`, `height` — image dimensions in pixels (used to position overlay boxes)
- `regions` — array of text regions

---

## How OCR gets into the search index

After OCR JSON files are uploaded to R2, we run one of two scripts to pull them into D1:

### For a single paper (preferred for incremental updates):

```bash
cd workers
python3 scripts/ingest.py add-ocr --paper chicago-defender --remote
```

This fetches OCR JSON for **all pages** of that paper from R2, updates `pages.ocr_text` in D1 (which auto-updates the FTS search index via triggers), and sets `issues.ocr_excerpt` for meta descriptions.

- **Script:** [`workers/scripts/ingest.py`](../workers/scripts/ingest.py) — see `cmd_add_ocr()` (line ~285)
- Processes all pages, not just front pages
- Skips pages where the JSON doesn't exist on R2 (404)
- Idempotent — safe to run repeatedly

### For bulk indexing across all papers:

```bash
cd workers

# Front pages only (default):
python3 scripts/ocr-index.py --remote

# All pages:
python3 scripts/ocr-index.py --remote --all-pages

# Single paper:
python3 scripts/ocr-index.py --remote --paper muskogee-cimeter

# Rebuild FTS index from scratch after manual DB changes:
python3 scripts/ocr-index.py --remote --rebuild-fts
```

- **Script:** [`workers/scripts/ocr-index.py`](../workers/scripts/ocr-index.py)
- Only processes pages where `ocr_text IS NULL` in D1 (incremental)
- By default only front pages (`page_num=1`); use `--all-pages` for everything

---

## Bringing over the existing ~5K non-front-page JSONs

These already exist on R2 but aren't in D1 yet. To index them:

```bash
cd workers
python3 scripts/ocr-index.py --remote --all-pages
```

This will:
1. Query D1 for all pages (any page_num) where `ocr_text IS NULL`
2. For each, try to fetch the corresponding `.json` from R2
3. If found, update `pages.ocr_text` and rebuild the search index entry
4. Skip pages where no JSON exists (the vast majority of non-front pages)

**Time estimate:** ~5,000 HTTP fetches at ~100-200ms each = 10-20 minutes. The script batches D1 writes every 200 pages so results appear incrementally.

**If you know which papers have non-front-page OCR**, you can target them individually for faster runs:

```bash
python3 scripts/ingest.py add-ocr --paper chicago-defender --remote
python3 scripts/ingest.py add-ocr --paper pittsburgh-courier --remote
```

---

## Workflow for new OCR going forward

1. **Your OCR script** processes pages and uploads JSON to R2 (same as now)
2. **After a batch is done**, run:
   ```bash
   cd workers && python3 scripts/ingest.py add-ocr --paper <slug> --remote
   ```
3. The text appears in search immediately (FTS triggers handle indexing)
4. The interactive OCR viewer on issue pages fetches the JSON from R2 on demand — no extra step needed for that

**That's it.** Upload JSON to R2, run the ingest command, done.

---

## Paper slugs

For reference, paper slugs are lowercase with hyphens. Examples:

| Paper title | Slug |
|---|---|
| Chicago Defender | `chicago-defender` |
| Pittsburgh Courier | `pittsburgh-courier` |
| Baltimore Afro-American | `baltimore-afro-american` |
| Broad Ax | `chicago-broad-ax` (title override) |
| New York Age | `new-york-age` |

Full list: run `cd workers && npx wrangler d1 execute dangerouspress-db --remote --command="SELECT slug, title FROM papers ORDER BY slug"`

---

## Questions?

The relevant code is all in `workers/scripts/`:
- [`ingest.py`](../workers/scripts/ingest.py) — ongoing data management CLI
- [`ocr-index.py`](../workers/scripts/ocr-index.py) — bulk OCR indexing
- [`seed.py`](../workers/scripts/seed.py) — initial database population (one-time)
