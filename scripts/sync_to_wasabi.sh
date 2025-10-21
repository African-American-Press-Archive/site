#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH="config/papers.yaml"
ENDPOINT_OVERRIDE=""
BUCKET_OVERRIDE=""

usage() {
  cat <<USAGE
Usage: $0 [--config path] [--endpoint url] [--bucket name]

Synchronizes processed issues from web_content/<slug>/ to a Wasabi bucket using the AWS CLI.
Requires that the bucket and credentials are configured (e.g. via AWS_PROFILE or environment variables).
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      CONFIG_PATH="$2"
      shift 2
      ;;
    --endpoint)
      ENDPOINT_OVERRIDE="$2"
      shift 2
      ;;
    --bucket)
      BUCKET_OVERRIDE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! command -v aws >/dev/null 2>&1; then
  echo "Error: aws CLI not found." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 not found." >&2
  exit 1
fi

if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "Error: config file $CONFIG_PATH not found." >&2
  exit 1
fi

readarray -t CONFIG_LINES < <(python3 - <<PY
import yaml, json, sys
from pathlib import Path
config_path = Path("$CONFIG_PATH")
data = yaml.safe_load(config_path.read_text())
storage = data.get('storage', {}) if isinstance(data, dict) else {}
endpoint = storage.get('endpoint')
bucket = storage.get('bucket')
for slug, info in data.get('papers', {}).items():
    path = info.get('path', slug)
    print(json.dumps({
        'slug': slug,
        'path': path,
        'base_url': info.get('base_url'),
        'title': info.get('title', slug)
    }))
print(json.dumps({'_storage_endpoint': endpoint}))
print(json.dumps({'_storage_bucket': bucket}))
PY
)

PAPER_JSON=()
STORAGE_ENDPOINT=""
STORAGE_BUCKET=""
for line in "${CONFIG_LINES[@]}"; do
  [[ -z "$line" ]] && continue
  key=$(python3 - <<PY
import json;import sys
obj=json.loads(sys.argv[1])
print(next(iter(obj)) if len(obj)==1 and next(iter(obj)).startswith('_storage_') else '')
PY "$line")
  if [[ "$key" == "_storage_endpoint" ]]; then
    STORAGE_ENDPOINT=$(python3 - <<PY
import json, sys
print(json.loads(sys.argv[1])['_storage_endpoint'] or '')
PY "$line")
  elif [[ "$key" == "_storage_bucket" ]]; then
    STORAGE_BUCKET=$(python3 - <<PY
import json, sys
print(json.loads(sys.argv[1])['_storage_bucket'] or '')
PY "$line")
  else
    PAPER_JSON+=("$line")
  fi
done

[[ -n "$ENDPOINT_OVERRIDE" ]] && STORAGE_ENDPOINT="$ENDPOINT_OVERRIDE"
[[ -n "$BUCKET_OVERRIDE" ]] && STORAGE_BUCKET="$BUCKET_OVERRIDE"

if [[ -z "$STORAGE_BUCKET" ]]; then
  echo "Error: storage bucket not defined (set in config or via --bucket)." >&2
  exit 1
fi

AWS_ARGS=()
if [[ -n "$STORAGE_ENDPOINT" ]]; then
  AWS_ARGS+=("--endpoint-url" "$STORAGE_ENDPOINT")
fi

ROOT_DIR=$(pwd)

for paper in "${PAPER_JSON[@]}"; do
  slug=$(python3 - <<PY
import json, sys
obj=json.loads(sys.argv[1])
print(obj['slug'])
PY "$paper")
  path=$(python3 - <<PY
import json, sys
obj=json.loads(sys.argv[1])
print(obj['path'])
PY "$paper")
  title=$(python3 - <<PY
import json, sys
obj=json.loads(sys.argv[1])
print(obj['title'])
PY "$paper")

  local_dir="web_content/${slug}"
  if [[ ! -d "$local_dir" ]]; then
    echo "Skipping ${slug}: $local_dir not found" >&2
    continue
  fi

  echo "=========================================="
  echo "Syncing ${title} (${slug})"
  echo "  Local:  ${local_dir}"
  echo "  Target: s3://${STORAGE_BUCKET}/${path}/"

  aws s3 sync "${local_dir}/" "s3://${STORAGE_BUCKET}/${path}/" "${AWS_ARGS[@]}" --delete --acl public-read

done

echo "Finished syncing all papers to Wasabi." 
