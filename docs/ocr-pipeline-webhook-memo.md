# OCR Pipeline: Adding Search Indexing

**To:** OCR pipeline developer
**From:** Neal
**Date:** March 2026

---

## What changed

The new site has full-text search over OCR content. When an OCR JSON file is uploaded to R2, the text also needs to go into the D1 search index. We've added a webhook endpoint that handles this — one line of code to add to the OCR pipeline.

## What you need to change

### In `ocr_pages.py`

The `upload_to_r2()` function (line ~69) currently uploads the JSON to R2 and prints `[R2]`. Add a call to the search indexing webhook right after the upload succeeds.

**Current code** (around line 69-80):

```python
def upload_to_r2(output_json):
    """Upload a JSON file to R2. Key = path relative to RESULTS_DIR."""
    client = _get_s3_client()
    if client is None:
        return
    key = str(output_json.relative_to(RESULTS_DIR))
    try:
        client.upload_file(str(output_json), R2_BUCKET, key,
                           ExtraArgs={"ContentType": "application/json"})
        print(f" [R2]", end="", flush=True)
    except Exception as e:
        print(f" [R2 failed: {e}]", end="", flush=True)
```

**New code:**

```python
import urllib.request

SEARCH_INDEX_URL = "https://beta.dangerouspress.org/admin/ocr-index"

def upload_to_r2(output_json):
    """Upload a JSON file to R2, then notify the search index."""
    client = _get_s3_client()
    if client is None:
        return
    key = str(output_json.relative_to(RESULTS_DIR))
    try:
        client.upload_file(str(output_json), R2_BUCKET, key,
                           ExtraArgs={"ContentType": "application/json"})
        print(f" [R2]", end="", flush=True)
    except Exception as e:
        print(f" [R2 failed: {e}]", end="", flush=True)
        return

    # Notify search index
    try:
        payload = json.dumps({"key": key}).encode()
        req = urllib.request.Request(
            SEARCH_INDEX_URL,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())
            if result.get("indexed", 0) > 0:
                print(f" [indexed]", end="", flush=True)
    except Exception as e:
        # Non-fatal — cron will catch it later
        print(f" [index skip: {e}]", end="", flush=True)
```

That's it. **One function changed, no new dependencies** (uses stdlib `urllib.request` + `json` which are already imported).

### In `bulk_upload_r2.py`

Same idea — after each batch upload completes, notify the webhook. Or simpler: after the full upload, send all keys at once:

**Add at the end of `main()`, after the upload loop (before the marker update):**

```python
    # Notify search index about all uploaded files
    if uploaded > 0:
        print(f"\nNotifying search index about {uploaded} files...", flush=True)
        import urllib.request
        SEARCH_INDEX_URL = "https://beta.dangerouspress.org/admin/ocr-index"

        # Send in batches of 50
        uploaded_keys = [str(f.relative_to(RESULTS_DIR)) for f in to_upload[:uploaded]]
        for i in range(0, len(uploaded_keys), 50):
            batch = uploaded_keys[i:i+50]
            try:
                payload = json.dumps({"keys": batch}).encode()
                req = urllib.request.Request(
                    SEARCH_INDEX_URL,
                    data=payload,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=30) as resp:
                    result = json.loads(resp.read())
                    print(f"  Batch {i//50+1}: indexed {result.get('indexed',0)}, skipped {result.get('skipped',0)}", flush=True)
            except Exception as e:
                print(f"  Batch {i//50+1}: index error: {e}", flush=True)
```

## How the webhook works

```
POST https://beta.dangerouspress.org/admin/ocr-index
Content-Type: application/json

# Single file:
{"key": "chicago-defender/1919/1919-07-26/page_01.json"}

# Multiple files:
{"keys": ["chicago-defender/1919/1919-07-26/page_01.json", "chicago-defender/1919/1919-07-26/page_02.json"]}
```

**Response:**
```json
{"indexed": 1, "skipped": 0, "total": 1}
```

The key is the R2 object key — same as `output_json.relative_to(RESULTS_DIR)`.

**What happens:**
1. Reads the OCR JSON from R2 (via internal binding, fast)
2. Matches it to the page in D1 by image URL
3. Updates `pages.ocr_text` (which auto-updates the FTS search index)
4. For front pages (`page_01`), also updates the issue's meta description excerpt

**If the webhook fails:** No big deal. An hourly cron job scans R2 for any OCR files that haven't been indexed yet and catches them up. The webhook is just for instant indexing.

## No changes needed to

- JSON format — stays exactly the same
- R2 bucket or paths — stays exactly the same
- SLURM jobs, retry logic, etc. — no changes
- `.r2env` credentials — no changes

## Testing

After making the change, OCR a single page and check:
1. `[R2]` prints as before (upload succeeded)
2. `[indexed]` prints after (search index updated)
3. Search for a word from that page on https://beta.dangerouspress.org/search — it should appear immediately

## Questions?

The webhook source code is at `workers/src/index.ts` (search for `/admin/ocr-index`).
