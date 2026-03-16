#!/usr/bin/env python3
"""
ocr-index.py — Fetch OCR JSON files from R2, extract text, and update D1.

Reads front-page OCR JSON for each issue (page_num=1 that lacks ocr_text),
populates pages.ocr_text (which fires FTS triggers automatically), and sets
issues.ocr_excerpt to the first ~300 chars of front-page text.

Usage (from workers/ directory):
    python3 scripts/ocr-index.py [--paper SLUG] [--remote] [--rebuild-fts]

Options:
    --paper SLUG    Only process issues for a specific paper slug
    --remote        Run against remote D1 (default: local)
    --rebuild-fts   Rebuild the ocr_search FTS index from scratch after updates

Prerequisites:
    npx wrangler d1 execute dangerouspress-db --local --file=src/db/schema.sql
    python3 scripts/seed.py
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import urllib.request
import urllib.error

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORKERS_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))

DB_NAME = "dangerouspress-db"
BATCH_SIZE = 200       # UPDATE statements per wrangler invocation
EXCERPT_LEN = 300      # characters for issues.ocr_excerpt
FETCH_TIMEOUT = 15     # seconds per HTTP request


# ---------------------------------------------------------------------------
# SQL helpers
# ---------------------------------------------------------------------------

def escape_sql(s) -> str:
    """Escape a string value for inline SQL (returns NULL for None)."""
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def _wrangler_args(remote: bool) -> list[str]:
    base = ["npx", "wrangler", "d1", "execute", DB_NAME]
    if remote:
        base.append("--remote")
    else:
        base.append("--local")
    return base


def run_sql(sql: str, remote: bool) -> None:
    """Execute a single SQL statement via wrangler (no JSON output needed)."""
    result = subprocess.run(
        _wrangler_args(remote) + ["--command", sql],
        cwd=WORKERS_DIR,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print("ERROR executing SQL:", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        sys.exit(1)


def run_sql_json(sql: str, remote: bool) -> list[dict]:
    """Execute SQL via wrangler --json, return the results list."""
    result = subprocess.run(
        _wrangler_args(remote) + ["--command", sql, "--json"],
        cwd=WORKERS_DIR,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print("ERROR executing SQL (json):", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        sys.exit(1)
    try:
        data = json.loads(result.stdout)
        # wrangler --json returns a list; first element has a "results" key
        return data[0].get("results", [])
    except Exception as e:
        print(f"ERROR parsing wrangler JSON output: {e}", file=sys.stderr)
        print("stdout:", result.stdout, file=sys.stderr)
        sys.exit(1)


def run_sql_batch(statements: list[str], remote: bool) -> None:
    """Write SQL statements to a temp file and execute via wrangler --file."""
    if not statements:
        return
    sql = "\n".join(statements)
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".sql", delete=False, encoding="utf-8"
    ) as f:
        f.write(sql)
        tmp_path = f.name

    try:
        result = subprocess.run(
            _wrangler_args(remote) + [f"--file={tmp_path}"],
            cwd=WORKERS_DIR,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            print("ERROR executing SQL batch:", file=sys.stderr)
            print(result.stderr, file=sys.stderr)
            print("stdout:", result.stdout, file=sys.stderr)
            sys.exit(1)
    finally:
        os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# OCR fetch / extract
# ---------------------------------------------------------------------------

def image_url_to_ocr_url(image_url: str) -> str:
    """Derive the OCR JSON URL by replacing the .jpg extension with .json."""
    # image_url example:
    #   https://pages.dangerouspress.org/chicago-defender/1919/1919-07-26/page_01.jpg
    # OCR JSON URL:
    #   https://pages.dangerouspress.org/chicago-defender/1919/1919-07-26/page_01.json
    if image_url.endswith(".jpg"):
        return image_url[:-4] + ".json"
    # Fallback: strip query string and swap extension
    base = image_url.split("?")[0]
    dot = base.rfind(".")
    if dot != -1:
        return base[:dot] + ".json"
    return base + ".json"


def fetch_ocr_json(image_url: str) -> dict | None:
    """Fetch the OCR JSON for a page. Returns parsed dict or None on failure."""
    url = image_url_to_ocr_url(image_url)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "dangerouspress-ocr-indexer/1.0"})
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
            raw = resp.read()
        return json.loads(raw)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None   # no OCR available for this page — not an error
        print(f"  HTTP {e.code} fetching {url}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  Error fetching {url}: {e}", file=sys.stderr)
        return None


def extract_text(ocr_data: dict) -> str:
    """Concatenate region texts where status='ok'. Returns empty string if none."""
    if not ocr_data:
        return ""
    regions = ocr_data.get("regions", [])
    parts = []
    for region in regions:
        if region.get("status") == "ok":
            text = region.get("text", "").strip()
            if text:
                parts.append(text)
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

def get_pages_needing_ocr(paper_slug: str | None, remote: bool, all_pages: bool = False) -> list[dict]:
    """
    Query D1 for pages that have no ocr_text yet.
    By default only front pages (page_num=1). Pass all_pages=True for all pages.
    Returns list of dicts with keys: page_id, issue_id, image_url.
    """
    if all_pages:
        where_clause = "(p.ocr_text IS NULL OR p.ocr_text = '')"
    else:
        where_clause = "p.page_num = 1 AND (p.ocr_text IS NULL OR p.ocr_text = '')"
    if paper_slug:
        where_clause += f" AND i.paper_slug = {escape_sql(paper_slug)}"

    sql = (
        "SELECT p.id AS page_id, p.issue_id, p.image_url "
        "FROM pages p "
        "JOIN issues i ON i.id = p.issue_id "
        f"WHERE {where_clause} "
        "ORDER BY i.date;"
    )
    return run_sql_json(sql, remote)


def execute_batches(statements: list[str], remote: bool, label: str = "batch") -> None:
    """Split statements into BATCH_SIZE chunks and execute each."""
    total = len(statements)
    for i in range(0, total, BATCH_SIZE):
        chunk = statements[i : i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"  {label}: executing batch {batch_num}/{total_batches} ({len(chunk)} statements)...")
        run_sql_batch(chunk, remote)


def rebuild_fts(remote: bool) -> None:
    """Rebuild the FTS index from scratch using the content table."""
    print("Rebuilding FTS index (ocr_search)...")
    # Delete all FTS rows and re-insert from pages
    run_sql("INSERT INTO ocr_search(ocr_search) VALUES ('rebuild');", remote)
    print("  FTS rebuild complete.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Index OCR text from R2 JSON files into D1 pages.ocr_text."
    )
    parser.add_argument(
        "--paper",
        metavar="SLUG",
        default=None,
        help="Only process issues for this paper slug (e.g. chicago-defender)",
    )
    parser.add_argument(
        "--remote",
        action="store_true",
        default=False,
        help="Run against remote D1 (default: local --local)",
    )
    parser.add_argument(
        "--all-pages",
        action="store_true",
        default=False,
        help="Index all pages, not just front pages (page_num=1)",
    )
    parser.add_argument(
        "--rebuild-fts",
        action="store_true",
        default=False,
        help="Rebuild FTS index after all updates",
    )
    args = parser.parse_args()

    target = "remote" if args.remote else "local"
    print(f"OCR Indexer — target: {target}" + (f", paper: {args.paper}" if args.paper else ""))

    # 1. Find front pages that need OCR
    print("\nQuerying front pages without OCR text...")
    rows = get_pages_needing_ocr(args.paper, args.remote, all_pages=args.all_pages)
    total = len(rows)
    print(f"  Found {total} front page(s) needing OCR.")

    if total == 0:
        print("Nothing to do.")
        if args.rebuild_fts:
            rebuild_fts(args.remote)
        return

    # 2. Fetch OCR JSON and write to D1 incrementally
    page_updates: list[str] = []
    issue_updates: list[str] = []

    skipped = 0
    processed = 0
    flushed = 0

    def flush_batch():
        nonlocal page_updates, issue_updates, flushed
        if not page_updates:
            return
        stmts = page_updates + issue_updates
        batch_num = flushed // BATCH_SIZE + 1
        print(f"  Writing batch {batch_num} ({len(page_updates)} pages, {len(issue_updates)} excerpts) to D1...")
        run_sql_batch(stmts, args.remote)
        flushed += len(page_updates)
        page_updates = []
        issue_updates = []

    for idx, row in enumerate(rows, start=1):
        page_id = row["page_id"]
        issue_id = row["issue_id"]
        image_url = row["image_url"]

        if idx % 50 == 0 or idx == 1:
            print(f"  [{idx}/{total}] Fetching OCR for issue {issue_id} ...")

        ocr_data = fetch_ocr_json(image_url)
        if ocr_data is None:
            skipped += 1
            continue

        text = extract_text(ocr_data)
        if not text:
            skipped += 1
            continue

        excerpt = text[:EXCERPT_LEN]

        page_updates.append(
            f"UPDATE pages SET ocr_text = {escape_sql(text)} WHERE id = {page_id};"
        )
        issue_updates.append(
            f"UPDATE issues SET ocr_excerpt = {escape_sql(excerpt)} WHERE id = {escape_sql(issue_id)};"
        )
        processed += 1

        # Flush every BATCH_SIZE pages
        if len(page_updates) >= BATCH_SIZE:
            flush_batch()

    # Final flush
    flush_batch()

    print(f"\n  Processed: {processed}, Skipped (no OCR / empty): {skipped}")

    # 6. Optionally rebuild FTS
    if args.rebuild_fts:
        rebuild_fts(args.remote)

    print("\nDone.")


if __name__ == "__main__":
    main()
