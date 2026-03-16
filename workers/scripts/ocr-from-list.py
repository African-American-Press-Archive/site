#!/usr/bin/env python3
"""
Index OCR from a list of known completed files.

Takes a file listing R2 paths of completed OCR JSONs, matches them to
pages in D1, fetches the JSON, and updates pages.ocr_text + issues.ocr_excerpt.

Usage:
    cd workers
    python3 scripts/ocr-from-list.py /path/to/completed_files.txt --remote
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
import urllib.error

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORKERS_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
DB_NAME = "dangerouspress-db"
R2_BASE = "https://pages.dangerouspress.org"
BATCH_SIZE = 200
EXCERPT_LEN = 300


def escape_sql(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def _wrangler_args(remote):
    base = ["npx", "wrangler", "d1", "execute", DB_NAME]
    base.append("--remote" if remote else "--local")
    return base


def run_sql_batch(stmts, remote):
    if not stmts:
        return
    with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False, encoding="utf-8") as f:
        f.write("\n".join(stmts))
        tmp = f.name
    try:
        result = subprocess.run(
            _wrangler_args(remote) + [f"--file={tmp}"],
            cwd=WORKERS_DIR, capture_output=True, text=True,
        )
        if result.returncode != 0:
            print(f"  SQL error: {result.stderr[:200]}", file=sys.stderr)
    finally:
        os.unlink(tmp)


def fetch_ocr(r2_key):
    """Fetch OCR JSON from R2 via public URL."""
    url = f"{R2_BASE}/{r2_key}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "dp-ocr-indexer/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        regions = data.get("regions", [])
        texts = [r["text"].strip() for r in regions if r.get("status") == "ok" and r.get("text", "").strip()]
        return "\n".join(texts)
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser(description="Index OCR from a list of completed files")
    parser.add_argument("file", help="Path to completed_files.txt")
    parser.add_argument("--remote", action="store_true")
    args = parser.parse_args()

    # Parse the file list into R2 keys
    prefix = "/work/users/n/c/ncaren/newspaper-ocr/ocr-results/"
    with open(args.file) as f:
        lines = [line.strip() for line in f if line.strip()]

    r2_keys = []
    for line in lines:
        if line.startswith(prefix):
            r2_keys.append(line[len(prefix):])
        else:
            r2_keys.append(line)

    print(f"Loaded {len(r2_keys)} completed OCR files")

    # Convert to image URLs for matching against D1
    # R2 key: amsterdam-news/1922/1922-11-29/page_01.json
    # image_url: https://pages.dangerouspress.org/amsterdam-news/1922/1922-11-29/page_01.jpg
    image_urls = {}
    for key in r2_keys:
        img_url = f"{R2_BASE}/{key.replace('.json', '.jpg')}"
        image_urls[img_url] = key

    # Process in chunks — fetch OCR and build UPDATE statements
    page_stmts = []
    excerpt_stmts = []
    seen_issues = set()
    indexed = 0
    skipped = 0
    total = len(r2_keys)

    for i, (img_url, r2_key) in enumerate(image_urls.items()):
        if (i + 1) % 100 == 0 or i == 0:
            print(f"  [{i+1}/{total}] Fetching {r2_key}...")

        text = fetch_ocr(r2_key)
        if not text:
            skipped += 1
            continue

        # Build UPDATE for pages.ocr_text matched by image_url
        page_stmts.append(
            f"UPDATE pages SET ocr_text = {escape_sql(text)} "
            f"WHERE image_url = {escape_sql(img_url)} AND ocr_text IS NULL;"
        )

        # Build excerpt for the issue (from front pages)
        if "/page_01.json" in r2_key:
            # Extract issue_id from the key: slug/year/date/page_01.json
            parts = r2_key.split("/")
            if len(parts) >= 4:
                slug = parts[0]
                date = parts[2]
                issue_id = f"{date}_{slug}"
                if issue_id not in seen_issues:
                    excerpt = text[:EXCERPT_LEN].rsplit(" ", 1)[0] if len(text) > EXCERPT_LEN else text
                    excerpt_stmts.append(
                        f"UPDATE issues SET ocr_excerpt = {escape_sql(excerpt)} "
                        f"WHERE id = {escape_sql(issue_id)} AND ocr_excerpt IS NULL;"
                    )
                    seen_issues.add(issue_id)

        indexed += 1

        # Flush batch
        if len(page_stmts) >= BATCH_SIZE:
            print(f"  Writing batch ({len(page_stmts)} pages, {len(excerpt_stmts)} excerpts)...")
            run_sql_batch(page_stmts + excerpt_stmts, args.remote)
            page_stmts = []
            excerpt_stmts = []

    # Final flush
    if page_stmts:
        print(f"  Writing final batch ({len(page_stmts)} pages, {len(excerpt_stmts)} excerpts)...")
        run_sql_batch(page_stmts + excerpt_stmts, args.remote)

    print(f"\nDone! Indexed {indexed}, skipped {skipped} (fetch failed), out of {total} files.")


if __name__ == "__main__":
    main()
