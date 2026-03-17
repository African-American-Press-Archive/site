#!/usr/bin/env python3
"""
Index OCR via the webhook endpoint (gentle — no DB locking).

Posts keys in small batches to /admin/ocr-index, which does
individual writes that don't lock D1 for other queries.

Usage:
    python3 scripts/ocr-webhook-batch.py /path/to/new_files.txt
    python3 scripts/ocr-webhook-batch.py /path/to/new_files.txt --batch-size 10 --delay 0.5
"""

import argparse
import json
import sys
import time
import urllib.request
import urllib.error

WEBHOOK_URL = "https://beta.dangerouspress.org/admin/ocr-index"
DEFAULT_BATCH = 5  # keys per request
DEFAULT_DELAY = 0.2  # seconds between batches


def post_keys(keys):
    """Post a batch of keys to the webhook. Returns (indexed, skipped)."""
    payload = json.dumps({"keys": keys}).encode()
    req = urllib.request.Request(
        WEBHOOK_URL,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "dp-ocr-indexer/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            return result.get("indexed", 0), result.get("skipped", 0)
    except Exception as e:
        print(f"  Error: {e}", file=sys.stderr)
        return 0, len(keys)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("file", help="File with R2 keys (one per line)")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH)
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY)
    args = parser.parse_args()

    with open(args.file) as f:
        keys = [line.strip() for line in f if line.strip() and line.strip().endswith(".json")]

    total = len(keys)
    print(f"Posting {total} keys in batches of {args.batch_size}")

    total_indexed = 0
    total_skipped = 0

    for i in range(0, total, args.batch_size):
        batch = keys[i : i + args.batch_size]
        indexed, skipped = post_keys(batch)
        total_indexed += indexed
        total_skipped += skipped

        if (i // args.batch_size + 1) % 20 == 0 or i + args.batch_size >= total:
            print(f"  [{i + len(batch)}/{total}] indexed={total_indexed} skipped={total_skipped}")

        time.sleep(args.delay)

    print(f"\nDone! Indexed {total_indexed}, skipped {total_skipped}, out of {total} files.")


if __name__ == "__main__":
    main()
