# African-American Press Archive Site

This repository contains the public-facing web application for the African-American Press Archive. It provides a timeline browser for digitized newspapers, with images hosted in per-paper repositories under the `African-American-Press-Archive` organization.

## Structure

- `index.html`, `app.js`, `style.css`: Front-end application files.
- `web_content/manifest.json`: Combined manifest referencing the latest issues across all papers. Each entry points to images hosted in the corresponding paper repo.
- `web_content/manifests/`: Per-paper manifests and an index of available papers.
- `config/papers.yaml`: Mapping from paper slug to GitHub repo/branch used by tooling.
- `merge_manifests.py`: Script to rebuild manifests from processed metadata.
- `scripts/sync_papers.sh`: Utility to push processed image assets into their dedicated repositories.

## Workflow

1. Process PDFs/JP2s in the working repo (`extract_pages.py`, `process_jp2.py`).
2. Run `scripts/sync_papers.sh` to sync each paper's GitHub repository.
3. Run `python merge_manifests.py` to update `web_content/manifest.json` and per-paper manifests with raw GitHub URLs.
4. Commit and push this site repo to deploy (e.g., GitHub Pages, Netlify).

## Development

Install dependencies (requires Python 3.9+):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt  # or use pyproject via `pip install .`
```

Rebuild manifests after locally processing new issues:

```bash
python merge_manifests.py
```

Serve locally (simple example):

```bash
python -m http.server --directory . 8000
```

For a full workflow, pair this repo with the asset-processing repository containing the conversion scripts and source metadata.
