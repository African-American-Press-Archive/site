#!/usr/bin/env python3
"""
seed.py — Read manifest.json and populate local D1 with papers, issues, and pages.

Usage (from workers/ directory):
    python3 scripts/seed.py

Prerequisites:
    npx wrangler d1 execute dangerouspress-db --local --file=src/db/schema.sql
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from collections import defaultdict

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
MANIFEST_PATH = os.path.join(REPO_ROOT, "manifest.json")
WORKERS_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))

BATCH_SIZE = 500  # SQL statements per wrangler invocation
REMOTE = "--remote" in sys.argv  # Use remote D1 if --remote flag is passed
LOCATION_FLAG = "--remote" if REMOTE else "--local"

TITLE_OVERRIDES = {
    "Broad Ax": "Chicago Broad Ax",
}

PAPER_LOCATIONS = {
    "Amsterdam News": "New York, New York",
    "Athens Republique": "Athens, Georgia",
    "Baltimore Afro-American": "Baltimore, Maryland",
    "Broad Ax": "Chicago, Illinois",
    "California Eagle": "Los Angeles, California",
    "Chicago Defender": "Chicago, Illinois",
    "Chicago Whip": "Chicago, Illinois",
    "Cleveland Gazette": "Cleveland, Ohio",
    "Colorado Statesman": "Denver, Colorado",
    "Dallas Express": "Dallas, Texas",
    "Denver Star": "Denver, Colorado",
    "Gary American": "Gary, Indiana",
    "Houston Informer": "Houston, Texas",
    "Indianapolis Freeman": "Indianapolis, Indiana",
    "Iowa Bystander": "Des Moines, Iowa",
    "Kansas City Advocate": "Kansas City, Kansas",
    "Kansas City Sun": "Kansas City, Missouri",
    "Metropolis Weekly Gazette": "Metropolis, Illinois",
    "Montana Plaindealer": "Helena, Montana",
    "Muskogee Cimeter": "Muskogee, Oklahoma",
    "Nashville Globe": "Nashville, Tennessee",
    "Negro World": "New York, New York",
    "New York Age": "New York, New York",
    "Norfolk Journal and Guide": "Norfolk, Virginia",
    "Omaha Monitor": "Omaha, Nebraska",
    "Phoenix Tribune": "Phoenix, Arizona",
    "Pittsburgh Courier": "Pittsburgh, Pennsylvania",
    "Portland New Age": "Portland, Oregon",
    "Raleigh Independent": "Raleigh, North Carolina",
    "Richmond Planet": "Richmond, Virginia",
    "Seattle Cayton's Weekly": "Seattle, Washington",
    "Springfield Forum": "Springfield, Illinois",
    "St. Louis Argus": "St. Louis, Missouri",
    "St. Paul Appeal": "St. Paul, Minnesota",
    "Tulsa Star": "Tulsa, Oklahoma",
    "Twin City Star": "Minneapolis, Minnesota",
    "Washington Bee": "Washington, D.C.",
    "Washington Tribune": "Washington, D.C.",
    "Western Outlook": "Oakland, California",
    "Wichita Searchlight": "Wichita, Kansas",
    "Wisconsin Weekly Blade": "Milwaukee, Wisconsin",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_slug(title: str) -> str:
    """Generate a slug from a paper title, applying overrides."""
    name = TITLE_OVERRIDES.get(title, title)
    slug = re.sub(r"[.\s]+", "-", name.lower())
    slug = slug.rstrip("-")
    return slug


def escape_sql(value):
    """Escape a string value for SQL insertion."""
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def run_sql_batch(statements: list[str]) -> None:
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
        result = subprocess.run(
            [
                "npx",
                "wrangler",
                "d1",
                "execute",
                "dangerouspress-db",
                LOCATION_FLAG,
                f"--file={tmp_path}",
            ],
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


def execute_batches(statements: list[str]) -> None:
    """Split statements into BATCH_SIZE chunks and execute each."""
    for i in range(0, len(statements), BATCH_SIZE):
        batch = statements[i : i + BATCH_SIZE]
        print(f"  Executing batch {i // BATCH_SIZE + 1} ({len(batch)} statements)...")
        run_sql_batch(batch)


def query_count(table: str) -> int:
    """Return row count for a table via wrangler d1 execute."""
    result = subprocess.run(
        [
            "npx",
            "wrangler",
            "d1",
            "execute",
            "dangerouspress-db",
            LOCATION_FLAG,
            "--command",
            f"SELECT COUNT(*) as cnt FROM {table};",
            "--json",
        ],
        cwd=WORKERS_DIR,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"Warning: could not query {table}: {result.stderr}", file=sys.stderr)
        return -1
    try:
        data = json.loads(result.stdout)
        # wrangler --json returns a list of result objects; first has results list
        return data[0]["results"][0]["cnt"]
    except Exception as e:
        print(f"Warning: could not parse count for {table}: {e}", file=sys.stderr)
        return -1


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    # 1. Load manifest
    print(f"Reading manifest from {MANIFEST_PATH} ...")
    with open(MANIFEST_PATH, encoding="utf-8") as f:
        manifest = json.load(f)
    print(f"  Loaded {len(manifest)} issues from manifest.")

    # 2. Group issues by paper title
    by_title = defaultdict(list)
    for issue in manifest:
        by_title[issue["title"]].append(issue)

    print(f"  Found {len(by_title)} distinct paper titles.")

    # 3. Build paper rows and issue/page rows
    paper_statements = []
    issue_statements = []
    page_statements = []

    for title, issues in by_title.items():
        slug = make_slug(title)
        location = PAPER_LOCATIONS.get(title, "")

        # Sort issues by date for seq and range computation
        issues_sorted = sorted(issues, key=lambda x: x["date"])

        first_date = issues_sorted[0]["date"]
        last_date = issues_sorted[-1]["date"]
        issue_count = len(issues_sorted)
        thumbnail_url = issues_sorted[0].get("issue_thumb", "")

        # Insert paper
        paper_statements.append(
            f"INSERT OR REPLACE INTO papers (slug, title, location, issue_count, first_date, last_date, thumbnail_url) "
            f"VALUES ({escape_sql(slug)}, {escape_sql(title)}, {escape_sql(location)}, "
            f"{issue_count}, {escape_sql(first_date)}, {escape_sql(last_date)}, {escape_sql(thumbnail_url)});"
        )

        # Insert issues
        for seq, issue in enumerate(issues_sorted, start=1):
            issue_id = issue["id"]
            date = issue["date"]
            year = int(date[:4])
            month = int(date[5:7])
            page_count = issue.get("pages", len(issue.get("page_paths", [])))
            issue_thumb = issue.get("issue_thumb", "")

            issue_statements.append(
                f"INSERT OR REPLACE INTO issues (id, paper_slug, date, year, month, seq, page_count, thumbnail_url) "
                f"VALUES ({escape_sql(issue_id)}, {escape_sql(slug)}, {escape_sql(date)}, "
                f"{year}, {month}, {seq}, {page_count}, {escape_sql(issue_thumb)});"
            )

            # Insert pages
            for page_num, image_url in enumerate(issue.get("page_paths", []), start=1):
                page_statements.append(
                    f"INSERT OR REPLACE INTO pages (issue_id, page_num, image_url) "
                    f"VALUES ({escape_sql(issue_id)}, {page_num}, {escape_sql(image_url)});"
                )

    # 4. Execute all inserts
    print(f"\nInserting {len(paper_statements)} paper rows ...")
    execute_batches(paper_statements)

    print(f"Inserting {len(issue_statements)} issue rows ...")
    execute_batches(issue_statements)

    print(f"Inserting {len(page_statements)} page rows ...")
    execute_batches(page_statements)

    # 5. Verification
    print("\n--- Verification ---")
    print(f"  papers : {query_count('papers')}")
    print(f"  issues : {query_count('issues')}")
    print(f"  pages  : {query_count('pages')}")
    print("\nDone.")


if __name__ == "__main__":
    main()
