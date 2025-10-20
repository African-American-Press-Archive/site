#!/usr/bin/env bash
#
# Sync per-paper repositories for the Black Press Archive.
# Requires: gh CLI (authenticated), git, git-lfs.
#
# Usage:
#   scripts/sync_papers.sh [--org ORG] [--branch BRANCH] [--manifest manifests/index.json]
#
# By default this script:
#   * Reads paper slugs from web_content/manifests/index.json
#   * Ensures each repo exists under African-American-Press-Archive/<slug>
#   * Copies the processed JPGs/thumbnails into the repo
#   * Copies the paper manifest (as manifests/paper-manifest.json)
#   * Tracks images with git LFS and commits/pushes updates to the chosen branch

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_CONTENT_DIR="${ROOT_DIR}/web_content"
MANIFEST_INDEX="${WEB_CONTENT_DIR}/manifests/index.json"
GITHUB_ORG="African-American-Press-Archive"
TARGET_BRANCH="main"

usage() {
    cat <<EOF
Usage: $0 [options]

Options:
  --org ORG           GitHub organization/user (default: ${GITHUB_ORG})
  --branch BRANCH     Target branch to push (default: ${TARGET_BRANCH})
  --manifest FILE     Path to manifests index JSON (default: ${MANIFEST_INDEX})
  -h, --help          Show this message
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --org)
            GITHUB_ORG="$2"
            shift 2
            ;;
        --branch)
            TARGET_BRANCH="$2"
            shift 2
            ;;
        --manifest)
            MANIFEST_INDEX="$2"
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

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Error: '$1' command not found. Please install it before running this script." >&2
        exit 1
    fi
}

require_command gh
require_command git
require_command jq
require_command rsync

if ! git lfs env >/dev/null 2>&1; then
    echo "Error: git-lfs is not installed or not configured. Install Git LFS before continuing." >&2
    exit 1
fi

if [[ ! -f "${MANIFEST_INDEX}" ]]; then
    echo "Error: manifest index not found at ${MANIFEST_INDEX}. Run merge_manifests.py first." >&2
    exit 1
fi

TMP_ROOT="$(mktemp -d)"
cleanup() {
    rm -rf "${TMP_ROOT}"
}
trap cleanup EXIT

echo "Using organization: ${GITHUB_ORG}"
echo "Target branch: ${TARGET_BRANCH}"
echo "Manifest index: ${MANIFEST_INDEX}"
echo ""

jq -c '.papers[]' "${MANIFEST_INDEX}" | while read -r PAPER; do
    SLUG=$(echo "${PAPER}" | jq -r '.slug')
    TITLE=$(echo "${PAPER}" | jq -r '.title')
    ISSUE_COUNT=$(echo "${PAPER}" | jq -r '.issue_count')

    SOURCE_DIR="${WEB_CONTENT_DIR}/${SLUG}"
    PAPER_MANIFEST="${WEB_CONTENT_DIR}/manifests/${SLUG}.json"
    REPO_NAME="${GITHUB_ORG}/${SLUG}"

    if [[ ! -d "${SOURCE_DIR}" ]]; then
        echo "Skipping ${SLUG}: source directory ${SOURCE_DIR} not found."
        continue
    fi

    echo "=========================================="
    echo "Syncing ${TITLE} (${SLUG})"
    echo "  Issues: ${ISSUE_COUNT}"
    echo "  Repo:   ${REPO_NAME}"

    if ! gh repo view "${REPO_NAME}" >/dev/null 2>&1; then
        echo "  -> creating repository ${REPO_NAME}"
        gh repo create "${REPO_NAME}" --private \
            --description "Black Press Archive assets for ${TITLE}" \
            --disable-issues --disable-wiki >/dev/null
        gh repo clone "${REPO_NAME}" "${TMP_ROOT}/${SLUG}" >/dev/null
    else
        gh repo clone "${REPO_NAME}" "${TMP_ROOT}/${SLUG}" >/dev/null
    fi

    pushd "${TMP_ROOT}/${SLUG}" >/dev/null

    # Ensure Git LFS tracks images
    git lfs install --local >/dev/null
    git lfs track "*.jpg" "*.jpeg" >/dev/null
    git add .gitattributes >/dev/null 2>&1 || true

    # Sync issue images year by year
    YEARS=($(find "${SOURCE_DIR}" -maxdepth 1 -type d -name '[0-9][0-9][0-9][0-9]' | sort))
    if [[ ${#YEARS[@]} -eq 0 ]]; then
        echo "  -> no year directories found under ${SOURCE_DIR}"
    fi

    for YEAR_PATH in "${YEARS[@]}"; do
        YEAR_DIR=$(basename "${YEAR_PATH}")
        echo "  -> syncing year ${YEAR_DIR}"

        mkdir -p "./${YEAR_DIR}"
        rsync -a --delete \
            "${SOURCE_DIR}/${YEAR_DIR}/" "./${YEAR_DIR}/"

        git add "${YEAR_DIR}" >/dev/null || true
        if git diff --cached --quiet; then
            git reset "${YEAR_DIR}" >/dev/null || true
            echo "     (no changes)"
            continue
        fi

        git commit -m "Sync year ${YEAR_DIR} from main repo" >/dev/null
        git push origin HEAD:"${TARGET_BRANCH}" >/dev/null
        echo "     pushed ${YEAR_DIR}"
    done

    # Copy paper manifest after years
    if [[ -f "${PAPER_MANIFEST}" ]]; then
        mkdir -p manifests
        cp "${PAPER_MANIFEST}" manifests/paper-manifest.json
        git add manifests/paper-manifest.json >/dev/null 2>&1 || true
        if ! git diff --cached --quiet; then
            git commit -m "Update paper manifest" >/dev/null
            git push origin HEAD:"${TARGET_BRANCH}" >/dev/null
            echo "  -> manifest updated"
        else
            git reset manifests/paper-manifest.json >/dev/null || true
        fi
    fi

    popd >/dev/null
    rm -rf "${TMP_ROOT:?}/${SLUG}"
done

echo ""
echo "All papers processed."
