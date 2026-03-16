#!/usr/bin/env python3
"""
ingest.py — CLI tool for ongoing data management of the DangerousPress D1 database.

Usage (from workers/ directory):
    python3 scripts/ingest.py add-paper --slug chicago-defender --title "Chicago Defender" --location "Chicago, Illinois"
    python3 scripts/ingest.py add-issues --paper chicago-defender --source /path/to/jpg-dirs
    python3 scripts/ingest.py add-ocr    --paper chicago-defender [--rebuild-fts]

All subcommands accept --remote to target the remote (production) D1 database.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
WORKERS_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
DB_NAME     = "dangerouspress-db"
R2_BASE_URL = "https://pages.dangerouspress.org"

BATCH_SIZE  = 500  # SQL statements per wrangler invocation


# ---------------------------------------------------------------------------
# SQL helpers
# ---------------------------------------------------------------------------

def escape_sql(value):
    """Escape a value for inline SQL (single-quoted string or NULL)."""
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def _wrangler_d1_args(remote: bool) -> list[str]:
    base = ["npx", "wrangler", "d1"]
    if remote:
        return base + ["execute", DB_NAME, "--remote"]
    return base + ["execute", DB_NAME, "--local"]


def run_sql(sql: str, remote: bool = False) -> None:
    """Execute a single SQL statement via wrangler d1 execute --command."""
    cmd = _wrangler_d1_args(remote) + ["--command", sql]
    result = subprocess.run(cmd, cwd=WORKERS_DIR, capture_output=True, text=True)
    if result.returncode != 0:
        print("ERROR executing SQL:", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        print("stdout:", result.stdout, file=sys.stderr)
        sys.exit(1)


def run_sql_batch(statements: list[str], remote: bool = False) -> None:
    """Write a batch of SQL statements to a temp file and execute via wrangler."""
    if not statements:
        return
    sql = "\n".join(statements)
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".sql", delete=False, encoding="utf-8"
    ) as f:
        f.write(sql)
        tmp_path = f.name
    try:
        cmd = _wrangler_d1_args(remote) + [f"--file={tmp_path}"]
        result = subprocess.run(cmd, cwd=WORKERS_DIR, capture_output=True, text=True)
        if result.returncode != 0:
            print("ERROR executing SQL batch:", file=sys.stderr)
            print(result.stderr, file=sys.stderr)
            print("stdout:", result.stdout, file=sys.stderr)
            sys.exit(1)
    finally:
        os.unlink(tmp_path)


def execute_batches(statements: list[str], remote: bool = False) -> None:
    """Split statements into BATCH_SIZE chunks and execute each."""
    for i in range(0, len(statements), BATCH_SIZE):
        batch = statements[i : i + BATCH_SIZE]
        print(f"  Executing batch {i // BATCH_SIZE + 1} ({len(batch)} statements)...")
        run_sql_batch(batch, remote=remote)


def run_sql_json(sql: str, remote: bool = False) -> list[dict]:
    """Execute a SQL query and return rows as a list of dicts."""
    cmd = _wrangler_d1_args(remote) + ["--command", sql, "--json"]
    result = subprocess.run(cmd, cwd=WORKERS_DIR, capture_output=True, text=True)
    if result.returncode != 0:
        print("ERROR executing SQL query:", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        sys.exit(1)
    try:
        data = json.loads(result.stdout)
        # wrangler --json returns a list; first element has a "results" key
        return data[0].get("results", []) if data else []
    except Exception as e:
        print(f"Warning: could not parse JSON output: {e}", file=sys.stderr)
        return []


# ---------------------------------------------------------------------------
# Subcommand: add-paper
# ---------------------------------------------------------------------------

def cmd_add_paper(args):
    slug     = args.slug
    title    = args.title
    location = args.location or ""

    print(f"Inserting paper: {slug!r} ({title!r}) ...")
    sql = (
        f"INSERT OR REPLACE INTO papers (slug, title, location) "
        f"VALUES ({escape_sql(slug)}, {escape_sql(title)}, {escape_sql(location)});"
    )
    run_sql(sql, remote=args.remote)
    print("Done.")


# ---------------------------------------------------------------------------
# Subcommand: add-issues
# ---------------------------------------------------------------------------

def _parse_date_from_dirname(dirname: str):
    """
    Try to extract a YYYY-MM-DD date from a directory name.
    Accepts: 1920-03-15, 19200315, 1920_03_15, etc.
    Returns (date_str, year, month) or (None, None, None).
    """
    m = re.search(r"(\d{4})[-_]?(\d{2})[-_]?(\d{2})", dirname)
    if m:
        y, mo, d = m.group(1), m.group(2), m.group(3)
        return f"{y}-{mo}-{d}", int(y), int(mo)
    return None, None, None


def _make_issue_id(paper_slug: str, date_str: str) -> str:
    return f"{date_str}_{paper_slug}"


def cmd_add_issues(args):
    paper_slug = args.paper
    source_dir = os.path.abspath(args.source)

    if not os.path.isdir(source_dir):
        print(f"ERROR: source directory not found: {source_dir}", file=sys.stderr)
        sys.exit(1)

    # Verify the paper exists
    rows = run_sql_json(
        f"SELECT slug FROM papers WHERE slug = {escape_sql(paper_slug)};",
        remote=args.remote,
    )
    if not rows:
        print(
            f"ERROR: paper {paper_slug!r} not found in database. "
            "Run add-paper first.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Each sub-directory of source_dir is one issue (named by date)
    issue_dirs = sorted(
        d for d in os.listdir(source_dir)
        if os.path.isdir(os.path.join(source_dir, d))
    )

    issue_statements = []
    page_statements  = []
    parsed_issues    = []  # (date_str, year, month, page_paths)

    for dirname in issue_dirs:
        date_str, year, month = _parse_date_from_dirname(dirname)
        if not date_str:
            print(f"  Skipping {dirname!r}: cannot parse date")
            continue

        issue_dir = os.path.join(source_dir, dirname)
        jpg_files = sorted(
            f for f in os.listdir(issue_dir)
            if f.lower().endswith(".jpg")
        )

        if not jpg_files:
            print(f"  Skipping {dirname!r}: no .jpg files found")
            continue

        # Build R2-style paths: paper_slug/year/date/filename.jpg
        r2_prefix = f"{paper_slug}/{year}/{date_str}"
        page_paths = [f"{r2_prefix}/{jpg}" for jpg in jpg_files]
        issue_thumb = page_paths[0]

        parsed_issues.append((date_str, year, month, page_paths, issue_thumb))

    if not parsed_issues:
        print("No issues found to insert.")
        return

    # Sort by date ascending for seq numbering
    parsed_issues.sort(key=lambda x: x[0])

    for seq, (date_str, year, month, page_paths, issue_thumb) in enumerate(parsed_issues, start=1):
        issue_id   = _make_issue_id(paper_slug, date_str)
        page_count = len(page_paths)

        issue_statements.append(
            f"INSERT OR REPLACE INTO issues "
            f"(id, paper_slug, date, year, month, seq, page_count, thumbnail_url) "
            f"VALUES ("
            f"{escape_sql(issue_id)}, {escape_sql(paper_slug)}, {escape_sql(date_str)}, "
            f"{year}, {month}, {seq}, {page_count}, {escape_sql(issue_thumb)});"
        )

        for page_num, image_url in enumerate(page_paths, start=1):
            page_statements.append(
                f"INSERT OR REPLACE INTO pages (issue_id, page_num, image_url) "
                f"VALUES ({escape_sql(issue_id)}, {page_num}, {escape_sql(image_url)});"
            )

    print(f"Inserting {len(issue_statements)} issues ...")
    execute_batches(issue_statements, remote=args.remote)

    print(f"Inserting {len(page_statements)} pages ...")
    execute_batches(page_statements, remote=args.remote)

    # Update paper stats
    all_dates = [i[0] for i in parsed_issues]
    first_date = all_dates[0]
    last_date  = all_dates[-1]
    issue_count = len(parsed_issues)
    thumbnail_url = parsed_issues[0][4]

    update_sql = (
        f"UPDATE papers SET "
        f"issue_count = {issue_count}, "
        f"first_date = {escape_sql(first_date)}, "
        f"last_date = {escape_sql(last_date)}, "
        f"thumbnail_url = {escape_sql(thumbnail_url)} "
        f"WHERE slug = {escape_sql(paper_slug)};"
    )
    run_sql(update_sql, remote=args.remote)
    print(f"Updated paper stats for {paper_slug!r}.")
    print("Done.")


# ---------------------------------------------------------------------------
# Subcommand: add-ocr
# ---------------------------------------------------------------------------

def _fetch_r2_json(r2_path: str) -> dict | None:
    """
    Fetch a JSON file from R2 via HTTP.
    r2_path should be the key (e.g. 'chicago-defender/1920/1920-03-15/page_01.json').
    """
    url = f"{R2_BASE_URL}/{r2_path}"
    try:
        import urllib.request
        with urllib.request.urlopen(url, timeout=15) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode("utf-8"))
    except Exception:
        pass
    return None


def _ocr_text_from_data(data: dict) -> str:
    """Extract plain text from an OCR JSON object (regions[].text)."""
    if not data or "regions" not in data:
        return ""
    parts = []
    for region in data.get("regions", []):
        text = region.get("text", "").strip()
        if text:
            parts.append(text)
    return "\n\n".join(parts)


def cmd_add_ocr(args):
    paper_slug  = args.paper
    rebuild_fts = args.rebuild_fts

    # Get all pages for this paper
    rows = run_sql_json(
        f"SELECT p.issue_id, p.page_num, p.image_url "
        f"FROM pages p "
        f"JOIN issues i ON i.id = p.issue_id "
        f"WHERE i.paper_slug = {escape_sql(paper_slug)} "
        f"ORDER BY p.issue_id, p.page_num;",
        remote=args.remote,
    )

    if not rows:
        print(f"No pages found for paper {paper_slug!r}.", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(rows)} pages for {paper_slug!r}. Fetching OCR JSON from R2 ...")

    page_updates   = []  # (issue_id, page_num, ocr_text)
    issue_excerpts = {}  # issue_id -> first non-empty text chunk

    for i, row in enumerate(rows, start=1):
        issue_id  = row["issue_id"]
        page_num  = row["page_num"]
        image_url = row["image_url"]

        # Derive R2 JSON path from image_url (replace .jpg with .json)
        if image_url.startswith("http"):
            # Full URL — extract the path component
            r2_path = re.sub(r"^https?://[^/]+/", "", image_url)
        else:
            r2_path = image_url
        r2_json_path = re.sub(r"\.jpg$", ".json", r2_path, flags=re.IGNORECASE)

        if i % 20 == 0 or i == len(rows):
            print(f"  [{i}/{len(rows)}] {r2_json_path}")

        data     = _fetch_r2_json(r2_json_path)
        ocr_text = _ocr_text_from_data(data) if data else ""

        page_updates.append((issue_id, page_num, ocr_text))

        # First page of each issue becomes the excerpt
        if ocr_text and issue_id not in issue_excerpts:
            # Take up to 500 characters for the excerpt
            issue_excerpts[issue_id] = ocr_text[:500].strip()

    # Build SQL updates for pages
    print(f"\nUpdating OCR text for {len(page_updates)} pages ...")
    statements = []
    for issue_id, page_num, ocr_text in page_updates:
        statements.append(
            f"UPDATE pages SET ocr_text = {escape_sql(ocr_text or None)} "
            f"WHERE issue_id = {escape_sql(issue_id)} AND page_num = {page_num};"
        )
    execute_batches(statements, remote=args.remote)

    # Update issue ocr_excerpt
    print(f"Updating OCR excerpts for {len(issue_excerpts)} issues ...")
    excerpt_stmts = [
        f"UPDATE issues SET ocr_excerpt = {escape_sql(excerpt)} "
        f"WHERE id = {escape_sql(iid)};"
        for iid, excerpt in issue_excerpts.items()
    ]
    execute_batches(excerpt_stmts, remote=args.remote)

    # Optionally rebuild FTS
    if rebuild_fts:
        print("Rebuilding FTS index ...")
        run_sql("INSERT INTO pages_fts(pages_fts) VALUES('rebuild');", remote=args.remote)
        print("FTS index rebuilt.")

    print("Done.")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="DangerousPress ingest CLI — manage papers, issues, pages, and OCR.",
    )
    parser.add_argument(
        "--remote",
        action="store_true",
        default=False,
        help="Target the remote (production) D1 database instead of local.",
    )

    sub = parser.add_subparsers(dest="command", required=True)

    # add-paper
    p_paper = sub.add_parser("add-paper", help="Insert a new paper into the database.")
    p_paper.add_argument("--slug",     required=True, help="URL-safe slug, e.g. chicago-defender")
    p_paper.add_argument("--title",    required=True, help="Display title, e.g. 'Chicago Defender'")
    p_paper.add_argument("--location", default="",    help="City, State")

    # add-issues
    p_issues = sub.add_parser(
        "add-issues",
        help="Read JPG directories, insert issues + pages, update paper stats.",
    )
    p_issues.add_argument("--paper",  required=True, help="Paper slug (must already exist)")
    p_issues.add_argument(
        "--source", required=True,
        help="Directory containing one sub-directory per issue (named by date).",
    )

    # add-ocr
    p_ocr = sub.add_parser(
        "add-ocr",
        help="Fetch OCR JSONs from R2, update pages.ocr_text, set issues.ocr_excerpt.",
    )
    p_ocr.add_argument("--paper",       required=True, help="Paper slug")
    p_ocr.add_argument("--rebuild-fts", action="store_true", default=False,
                       help="Trigger an FTS index rebuild after updating OCR text.")

    args = parser.parse_args()

    if args.command == "add-paper":
        cmd_add_paper(args)
    elif args.command == "add-issues":
        cmd_add_issues(args)
    elif args.command == "add-ocr":
        cmd_add_ocr(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
