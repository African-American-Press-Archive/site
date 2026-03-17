#!/usr/bin/env python3
"""
Upload paper descriptions from Markdown files to D1.

Reads ../paper-descriptions/*.md, converts body to HTML, and updates
the papers table's description, description_source, and image_source columns.

Usage:
    cd workers
    python3 scripts/upload-descriptions.py --remote
    python3 scripts/upload-descriptions.py --remote --dry-run
    python3 scripts/upload-descriptions.py --remote --slug chicago-whip
"""

import argparse
import os
import re
import subprocess
import sys
import tempfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORKERS_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
DESCRIPTIONS_DIR = os.path.abspath(os.path.join(WORKERS_DIR, "..", "paper-descriptions"))
DB_NAME = "dangerouspress-db"


def escape_sql(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def parse_frontmatter(text):
    """Parse YAML frontmatter and body from a markdown file."""
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.DOTALL)
    if not m:
        return {}, text

    meta = {}
    for line in m.group(1).strip().split("\n"):
        if ":" in line:
            key, val = line.split(":", 1)
            val = val.strip().strip('"').strip("'")
            meta[key.strip()] = val
    return meta, m.group(2).strip()


def md_to_html(md_text):
    """Convert markdown body to simple HTML paragraphs."""
    paragraphs = re.split(r"\n\n+", md_text.strip())
    html_parts = []
    for p in paragraphs:
        # Convert *text* to <em>text</em>
        p = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", p)
        # Convert [text](url) to <a> tags
        p = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', p)
        # Convert -- to em dash
        p = p.replace("--", "\u2014")
        # Wrap in <p>
        html_parts.append(f"<p>{p}</p>")
    return "\n".join(html_parts)


def md_link_to_html(md_text):
    """Convert a markdown link like [Text](url) to HTML."""
    if not md_text:
        return None
    result = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', md_text)
    return result


def load_descriptions(slug_filter=None):
    """Load all markdown files from the descriptions directory."""
    descriptions = []
    for fname in sorted(os.listdir(DESCRIPTIONS_DIR)):
        if not fname.endswith(".md") or fname == "README.md":
            continue
        filepath = os.path.join(DESCRIPTIONS_DIR, fname)
        with open(filepath, encoding="utf-8") as f:
            text = f.read()

        meta, body = parse_frontmatter(text)
        slug = meta.get("slug", fname.replace(".md", ""))

        if slug_filter and slug != slug_filter:
            continue

        description_html = md_to_html(body)
        description_source = md_link_to_html(meta.get("description_source"))
        image_source = md_link_to_html(meta.get("image_source"))

        descriptions.append({
            "slug": slug,
            "description": description_html,
            "description_source": description_source,
            "image_source": image_source,
            "file": fname,
        })

    return descriptions


def run_sql(stmts, remote):
    if not stmts:
        return
    location = "--remote" if remote else "--local"
    with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False, encoding="utf-8") as f:
        f.write("\n".join(stmts))
        tmp = f.name
    try:
        result = subprocess.run(
            ["npx", "wrangler", "d1", "execute", DB_NAME, location, f"--file={tmp}"],
            cwd=WORKERS_DIR, capture_output=True, text=True,
        )
        if result.returncode != 0:
            print(f"  SQL error: {result.stderr[:300]}", file=sys.stderr)
        else:
            print(f"  OK")
    finally:
        os.unlink(tmp)


def main():
    parser = argparse.ArgumentParser(description="Upload paper descriptions to D1")
    parser.add_argument("--remote", action="store_true")
    parser.add_argument("--local", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--slug", help="Only upload this slug")
    args = parser.parse_args()

    if not args.remote and not args.local:
        print("Specify --remote or --local", file=sys.stderr)
        sys.exit(1)

    descriptions = load_descriptions(args.slug)
    if not descriptions:
        print("No description files found.")
        return

    print(f"Found {len(descriptions)} description(s):\n")

    stmts = []
    for d in descriptions:
        print(f"  {d['file']} -> {d['slug']}")
        if args.dry_run:
            preview = d["description"][:100] + "..." if len(d["description"]) > 100 else d["description"]
            print(f"    description: {preview}")
            if d["description_source"]:
                print(f"    description_source: {d['description_source']}")
            if d["image_source"]:
                print(f"    image_source: {d['image_source']}")
            continue

        stmts.append(
            f"UPDATE papers SET "
            f"description = {escape_sql(d['description'])}, "
            f"description_source = {escape_sql(d['description_source'])}, "
            f"image_source = {escape_sql(d['image_source'])} "
            f"WHERE slug = {escape_sql(d['slug'])};"
        )

    if args.dry_run:
        print("\nDry run — no changes made.")
        return

    print(f"\nUploading {len(stmts)} descriptions...")
    run_sql(stmts, args.remote)
    print("Done!")


if __name__ == "__main__":
    main()
