#!/usr/bin/env python3
"""
Merge PDF and JP2 manifests into a single unified manifest.json
"""

import json
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote

import yaml

CONFIG_PATH = Path('config/papers.yaml')

def load_paper_config():
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f) or {}
        return data.get('papers', {})
    return {}

def merge_manifests():
    """Merge manifest.json and manifest_jp2.json into single file."""

    web_content = Path('web_content')
    manifest_pdf = web_content / 'manifest_pdf.json'
    manifest_jp2 = web_content / 'manifest_jp2.json'

    all_issues = []

    pdf_manifest_path = None
    for candidate in (manifest_pdf, web_content / 'manifest.json'):
        if candidate.exists():
            pdf_manifest_path = candidate
            break

    # Load PDF manifest
    if pdf_manifest_path:
        with open(pdf_manifest_path, 'r') as f:
            pdf_issues = json.load(f)
            print(f"Loaded {len(pdf_issues)} PDF issues")
            if pdf_manifest_path != manifest_pdf:
                print(f"  (legacy manifest detected at {pdf_manifest_path})")
            all_issues.extend(pdf_issues)
    else:
        print("Warning: PDF manifest not found (checked manifest_pdf.json and legacy manifest.json)")

    # Load JP2 manifest
    if manifest_jp2.exists():
        with open(manifest_jp2, 'r') as f:
            jp2_issues = json.load(f)
            print(f"Loaded {len(jp2_issues)} JP2 issues")
            all_issues.extend(jp2_issues)
    else:
        print("Warning: manifest_jp2.json not found")

    if not all_issues:
        print("Error: No issues found in either manifest")
        return

    # Sort by date
    all_issues.sort(key=lambda x: x['date'])

    paper_config = load_paper_config()
    per_paper_issues = defaultdict(list)
    transformed_all_issues = []

    for issue in all_issues:
        slug = _slugify(issue['title'])
        base_url = _compute_base_url(paper_config.get(slug, {}))
        transformed = _transform_issue(issue, base_url, slug)
        transformed_all_issues.append(transformed)
        per_paper_issues[slug].append(transformed)

    # Save unified manifest
    output_file = web_content / 'manifest.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(transformed_all_issues, f, indent=2, ensure_ascii=False)

    manifests_dir = web_content / 'manifests'
    manifests_dir.mkdir(exist_ok=True)

    index_payload = []

    for slug, issues in per_paper_issues.items():
        issues.sort(key=lambda x: x['date'])
        config_entry = paper_config.get(slug, {})
        base_url = _compute_base_url(config_entry)

        manifest_payload = {
            'manifest_version': 1,
            'title': issues[0]['title'] if issues else slug,
            'issues': issues
        }

        manifest_path = manifests_dir / f'{slug}.json'
        with open(manifest_path, 'w', encoding='utf-8') as mf:
            json.dump(manifest_payload, mf, indent=2, ensure_ascii=False)

        remote_manifest_url = None
        if base_url:
            remote_manifest_url = f'{base_url}/manifests/paper-manifest.json'

        index_payload.append({
            'slug': slug,
            'title': manifest_payload['title'],
            'issue_count': len(issues),
            'manifest_path': f'manifests/{slug}.json',
            'remote_manifest': remote_manifest_url
        })

    index_payload.sort(key=lambda x: x['title'])

    papers_index_path = manifests_dir / 'index.json'
    with open(papers_index_path, 'w', encoding='utf-8') as idx:
        json.dump({
            'manifest_version': 1,
            'papers': index_payload
        }, idx, indent=2, ensure_ascii=False)

    # Print summary
    print(f"\n{'='*60}")
    print("MANIFEST MERGE COMPLETE")
    print(f"{'='*60}")
    print(f"Total issues: {len(all_issues)}")
    print(f"Date range: {all_issues[0]['date']} to {all_issues[-1]['date']}")

    # Count by paper
    paper_counts = {}
    for issue in all_issues:
        paper_counts[issue['title']] = paper_counts.get(issue['title'], 0) + 1

    print(f"\nIssues by newspaper:")
    for paper, count in sorted(paper_counts.items()):
        print(f"  {paper}: {count}")

    print(f"\nUnified manifest saved to: {output_file}")
    print(f"Per-paper manifests saved to: {manifests_dir}")
    print(f"Papers index saved to: {papers_index_path}")


def _slugify(title: str) -> str:
    """Create a filesystem-safe slug from a newspaper title."""
    slug = title.strip().lower().replace('+', '-')
    slug = slug.replace(' ', '-')
    return ''.join(char for char in slug if char.isalnum() or char in ('-', '_'))


def _compute_base_url(config_entry):
    repo = config_entry.get('repo') if isinstance(config_entry, dict) else None
    branch = config_entry.get('branch', 'main') if isinstance(config_entry, dict) else 'main'
    if not repo:
        return None
    base = f'https://raw.githubusercontent.com/{repo}/{branch}'
    return base.rstrip('/')


def _to_remote_path(base_url, original_path, slug=None):
    if not original_path:
        return original_path
    if original_path.startswith('http://') or original_path.startswith('https://'):
        return original_path
    if not base_url:
        return original_path
    normalized = original_path.lstrip('/')
    if slug:
        slug = slug.strip('/').lower()
        if normalized.lower().startswith(f"{slug}/"):
            normalized = normalized[len(slug) + 1:]
    segments = [quote(part) for part in normalized.split('/')]
    return f'{base_url}/' + '/'.join(segments)


def _transform_issue(issue, base_url, slug):
    transformed = issue.copy()
    transformed['issue_thumb'] = _to_remote_path(base_url, issue.get('issue_thumb'), slug)
    if 'page_paths' in issue and isinstance(issue['page_paths'], list):
        transformed['page_paths'] = [
            _to_remote_path(base_url, path, slug) for path in issue['page_paths']
        ]
    return transformed

if __name__ == '__main__':
    merge_manifests()
