#!/usr/bin/env bash
set -euo pipefail

REPO_FULL="African-American-Press-Archive/site"

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh CLI not found." >&2
  exit 1
fi

echo "Initializing git repo..."
rm -rf .git

git init

if git config user.name >/dev/null 2>&1; then
  echo "Using existing git user.name $(git config user.name)"
else
  git config user.name "$(gh api user --jq '.name // .login')"
  echo "Configured git user.name to $(git config user.name)"
fi

if git config user.email >/dev/null 2>&1; then
  echo "Using existing git user.email $(git config user.email)"
else
  git config user.email "$(gh api user --jq '.email // "user@example.com"')"
  echo "Configured git user.email to $(git config user.email)"
fi

echo "Creating remote repository ${REPO_FULL} (ignoring if it already exists)"
if gh repo view "${REPO_FULL}" >/dev/null 2>&1; then
  echo "Repo already exists."
else
  gh repo create "${REPO_FULL}" --public --confirm
fi

DEFAULT_BRANCH="main"

git add .
git commit -m "Initial site commit"

git branch -M "${DEFAULT_BRANCH}"
git remote add origin "https://github.com/${REPO_FULL}.git" 2>/dev/null || git remote set-url origin "https://github.com/${REPO_FULL}.git"

git push -u origin "${DEFAULT_BRANCH}"

echo "Repository setup complete."
