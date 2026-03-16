/**
 * ocr-cron.ts — Scheduled handler that indexes new OCR from R2 into D1.
 *
 * Runs on a Cloudflare Cron Trigger. Finds pages in D1 where ocr_text is NULL,
 * checks R2 for a corresponding .json file, and if found, updates the page
 * and issue records. FTS triggers keep the search index in sync automatically.
 *
 * Uses the R2 binding directly (no HTTP fetches, no CORS).
 */

import type { Env } from '../types';

// Process up to this many pages per cron run to stay within CPU limits
const BATCH_LIMIT = 2000;
const EXCERPT_LEN = 300;

interface PageRow {
  id: number;
  issue_id: string;
  page_num: number;
  image_url: string;
}

interface OcrRegion {
  bbox: number[];
  text: string;
  status: string;
}

interface OcrData {
  width: number;
  height: number;
  regions: OcrRegion[];
}

/**
 * Derive the R2 object key from a full image URL.
 * e.g. "https://pages.dangerouspress.org/chicago-defender/1919/1919-07-26/page_01.jpg"
 *   -> "chicago-defender/1919/1919-07-26/page_01.json"
 */
function imageUrlToR2Key(imageUrl: string): string {
  const path = imageUrl.replace(/^https?:\/\/[^/]+\//, '');
  return path.replace(/\.[^.]+$/, '.json');
}

/**
 * Extract concatenated text from OCR regions where status is "ok".
 */
function extractText(data: OcrData): string {
  if (!data || !data.regions) return '';
  return data.regions
    .filter((r) => r.status === 'ok' && r.text?.trim())
    .map((r) => r.text.trim())
    .join('\n');
}

export async function handleOcrCron(env: Env): Promise<string> {
  const db = env.DB;
  const r2 = env.R2;

  // 1. Find pages missing OCR text (all pages, not just front pages)
  const { results: pages } = await db
    .prepare(
      `SELECT p.id, p.issue_id, p.page_num, p.image_url
       FROM pages p
       WHERE p.ocr_text IS NULL
       ORDER BY p.issue_id, p.page_num
       LIMIT ?`
    )
    .bind(BATCH_LIMIT)
    .all<PageRow>();

  if (pages.length === 0) {
    return 'No pages need OCR indexing.';
  }

  let indexed = 0;
  let skipped = 0;
  const issueExcerpts = new Map<string, string>();

  // 2. For each page, check R2 for the OCR JSON
  for (const page of pages) {
    const r2Key = imageUrlToR2Key(page.image_url);

    const obj = await r2.get(r2Key);
    if (!obj) {
      skipped++;
      continue;
    }

    let data: OcrData;
    try {
      data = await obj.json<OcrData>();
    } catch {
      skipped++;
      continue;
    }

    const text = extractText(data);
    if (!text) {
      skipped++;
      continue;
    }

    // 3. Update pages.ocr_text (FTS trigger fires automatically)
    await db
      .prepare('UPDATE pages SET ocr_text = ? WHERE id = ?')
      .bind(text, page.id)
      .run();

    // 4. Track excerpt for front pages (page_num = 1)
    if (page.page_num === 1 && !issueExcerpts.has(page.issue_id)) {
      const excerpt = text.length > EXCERPT_LEN
        ? text.slice(0, EXCERPT_LEN).replace(/\s+\S*$/, '')
        : text;
      issueExcerpts.set(page.issue_id, excerpt);
    }

    indexed++;
  }

  // 5. Update issue excerpts
  for (const [issueId, excerpt] of issueExcerpts) {
    await db
      .prepare('UPDATE issues SET ocr_excerpt = ? WHERE id = ?')
      .bind(excerpt, issueId)
      .run();
  }

  const msg = `OCR cron: indexed ${indexed}, skipped ${skipped} (no JSON on R2), ${pages.length - indexed - skipped} errors. ${issueExcerpts.size} issue excerpts updated.`;
  console.log(msg);
  return msg;
}
