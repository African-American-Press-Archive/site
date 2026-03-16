/**
 * ocr-cron.ts — Scheduled handler that indexes new OCR from R2 into D1.
 *
 * Strategy: List .json files in R2, match them to pages in D1 that lack
 * ocr_text, and update only those. This avoids wasting time checking pages
 * that don't have OCR on R2 yet.
 *
 * Uses R2 list() to find what exists, then queries D1 to find what's missing.
 */

import type { Env } from '../types';

const BATCH_LIMIT = 5000;  // R2 list limit — includes images, ~15-20% will be .json
const EXCERPT_LEN = 300;

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

function extractText(data: OcrData): string {
  if (!data || !data.regions) return '';
  return data.regions
    .filter((r) => r.status === 'ok' && r.text?.trim())
    .map((r) => r.text.trim())
    .join('\n');
}

/**
 * Convert an R2 key like "chicago-defender/1919/1919-07-26/page_01.json"
 * to the image_url stored in D1: "https://pages.dangerouspress.org/chicago-defender/1919/1919-07-26/page_01.jpg"
 */
function r2KeyToImageUrl(key: string): string {
  return 'https://pages.dangerouspress.org/' + key.replace(/\.json$/, '.jpg');
}

export async function handleOcrCron(env: Env, limitOverride?: number): Promise<string> {
  const db = env.DB;
  const r2 = env.R2;
  const limit = limitOverride ?? BATCH_LIMIT;

  // 1. Get the cursor from last run (for paginating R2 list)
  const cursorRow = await db
    .prepare("SELECT value FROM ocr_stats WHERE key = 'r2_cursor'")
    .first<{ value: string }>()
    .catch(() => null);
  const savedCursor = cursorRow?.value || undefined;

  // 2. List .json files from R2 (paginated, picks up where we left off)
  const listed = await r2.list({
    limit: limit,
    cursor: savedCursor,
    // Only list .json files — R2 doesn't filter by extension, but we filter below
  });

  const jsonKeys = listed.objects
    .filter((obj) => obj.key.endsWith('.json'))
    .map((obj) => obj.key);

  if (jsonKeys.length === 0 && !listed.truncated) {
    // We've scanned the whole bucket — reset cursor for next cycle
    await db.prepare(
      "INSERT OR REPLACE INTO ocr_stats (key, value, updated_at) VALUES ('r2_cursor', '', ?)"
    ).bind(new Date().toISOString()).run();

    await updateStats(db, 0, 0, 0, false);
    return 'OCR cron: scanned all R2 objects, no new JSON files. Cursor reset.';
  }

  // 3. Save cursor for next run
  const nextCursor = listed.truncated ? listed.cursor : '';
  await db.prepare(
    "INSERT OR REPLACE INTO ocr_stats (key, value, updated_at) VALUES ('r2_cursor', ?, ?)"
  ).bind(nextCursor, new Date().toISOString()).run();

  // 4. For each JSON key, check if the corresponding page in D1 needs OCR
  let indexed = 0;
  let alreadyDone = 0;
  let noMatch = 0;
  const issueExcerpts = new Map<string, string>();

  for (const key of jsonKeys) {
    const imageUrl = r2KeyToImageUrl(key);

    // Find the page row that needs updating
    const page = await db
      .prepare(
        'SELECT p.id, p.issue_id, p.page_num FROM pages p WHERE p.image_url = ? AND p.ocr_text IS NULL'
      )
      .bind(imageUrl)
      .first<{ id: number; issue_id: string; page_num: number }>();

    if (!page) {
      // Either already indexed or no matching page in D1
      alreadyDone++;
      continue;
    }

    // 5. Fetch and parse the OCR JSON from R2
    const obj = await r2.get(key);
    if (!obj) { noMatch++; continue; }

    let data: OcrData;
    try {
      data = await obj.json<OcrData>();
    } catch {
      noMatch++;
      continue;
    }

    const text = extractText(data);
    if (!text) { noMatch++; continue; }

    // 6. Update pages.ocr_text (FTS trigger fires automatically)
    await db
      .prepare('UPDATE pages SET ocr_text = ? WHERE id = ?')
      .bind(text, page.id)
      .run();

    // 7. Track excerpt for front pages
    if (page.page_num === 1 && !issueExcerpts.has(page.issue_id)) {
      const excerpt = text.length > EXCERPT_LEN
        ? text.slice(0, EXCERPT_LEN).replace(/\s+\S*$/, '')
        : text;
      issueExcerpts.set(page.issue_id, excerpt);
    }

    indexed++;
  }

  // 8. Update issue excerpts
  for (const [issueId, excerpt] of issueExcerpts) {
    await db
      .prepare('UPDATE issues SET ocr_excerpt = ? WHERE id = ?')
      .bind(excerpt, issueId)
      .run();
  }

  // 9. Update stats
  await updateStats(db, indexed, alreadyDone, jsonKeys.length, listed.truncated);

  const msg = `OCR cron: found ${jsonKeys.length} JSON files in R2, indexed ${indexed} new, ${alreadyDone} already done, ${issueExcerpts.size} excerpts updated. ${listed.truncated ? 'More to scan.' : 'Scan complete, cursor reset.'}`;
  console.log(msg);
  return msg;
}

async function updateStats(
  db: D1Database,
  indexed: number,
  alreadyDone: number,
  checked: number,
  moreToCome: boolean,
) {
  const now = new Date().toISOString();
  await db.prepare(
    "INSERT OR REPLACE INTO ocr_stats (key, value, updated_at) VALUES ('last_run', ?, ?)"
  ).bind(JSON.stringify({ indexed, alreadyDone, checked, moreToCome, at: now }), now).run();

  const prev = await db.prepare("SELECT value FROM ocr_stats WHERE key = 'r2_totals'").first<{ value: string }>().catch(() => null);
  const totals = prev ? JSON.parse(prev.value) : { found: 0, already_done: 0, scanned: 0 };
  totals.found += indexed;
  totals.already_done += alreadyDone;
  totals.scanned += checked;
  await db.prepare(
    "INSERT OR REPLACE INTO ocr_stats (key, value, updated_at) VALUES ('r2_totals', ?, ?)"
  ).bind(JSON.stringify(totals), now).run();
}
