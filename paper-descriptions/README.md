# Paper Descriptions

Historical descriptions for newspapers in the Dangerous Press Archive. These are displayed on each paper's detail page on the website.

## File Format

Each file is named `{slug}.md` where `{slug}` matches the paper's slug in the database (e.g., `chicago-defender.md`). Use YAML frontmatter for metadata:

```markdown
---
slug: chicago-whip
description_source: "[Illinois Digital Newspaper Collection](https://example.com)"
image_source: "[Illinois Digital Newspaper Collection](https://example.com), a project of the University of Illinois"
---

Your prose paragraphs here. Use *italics* for newspaper names.
Separate paragraphs with blank lines.
```

### Frontmatter fields

| Field | Required | Description |
|---|---|---|
| `slug` | Yes | Must match the paper's slug in D1 |
| `description_source` | No | Credit for the description text, as Markdown link |
| `image_source` | No | Credit for the digitized images, as Markdown link |

## Uploading to the site

From the `workers/` directory, run:

```bash
python3 scripts/upload-descriptions.py --remote
```

This reads all `.md` files in this folder, converts the Markdown body to HTML, and updates the `papers` table in D1. Papers without a description file are not affected.

### Options

```bash
# Preview what would be uploaded (dry run)
python3 scripts/upload-descriptions.py --remote --dry-run

# Upload a single paper
python3 scripts/upload-descriptions.py --remote --slug chicago-whip

# Upload to local dev database
python3 scripts/upload-descriptions.py --local
```

## Adding a new paper description

1. Create `{slug}.md` in this folder
2. Add frontmatter with at least `slug`
3. Write the prose (Markdown, will be converted to HTML)
4. Run `python3 scripts/upload-descriptions.py --remote`
5. Deploy: `cd workers && npx wrangler deploy`
   (Only needed if template code changed; description updates are data-only)
