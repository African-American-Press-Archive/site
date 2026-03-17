/**
 * ocr-cron.ts — Scheduled handler that indexes new OCR from R2 into D1.
 *
 * Two-phase strategy:
 * Phase 1 (targeted): Query D1 for pages missing OCR where we expect R2 files
 *   to exist — i.e., pages belonging to issues that already have SOME OCR.
 *   These are the most likely to have new R2 uploads.
 * Phase 2 (scan): If phase 1 finds nothing, do a small R2 list scan to
 *   discover OCR for pages we haven't checked yet.
 */

import type { Env } from '../types';

const BATCH_SIZE = 200;   // pages to check per cron run
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

function imageUrlToR2Key(imageUrl: string): string {
  return imageUrl
    .replace('https://pages.dangerouspress.org/', '')
    .replace(/\.jpg$/, '.json');
}

async function indexPage(
  db: D1Database,
  r2: R2Bucket,
  page: { id: number; issue_id: string; page_num: number; image_url: string },
  issueExcerpts: Map<string, string>,
): Promise<boolean> {
  const key = imageUrlToR2Key(page.image_url);
  const obj = await r2.get(key);
  if (!obj) return false;

  let data: OcrData;
  try {
    data = await obj.json<OcrData>();
  } catch {
    return false;
  }

  const text = extractText(data);
  if (!text) return false;

  await db.prepare('UPDATE pages SET ocr_text = ? WHERE id = ?').bind(text, page.id).run();

  if (page.page_num === 1 && !issueExcerpts.has(page.issue_id)) {
    const excerpt = text.length > EXCERPT_LEN
      ? text.slice(0, EXCERPT_LEN).replace(/\s+\S*$/, '')
      : text;
    issueExcerpts.set(page.issue_id, excerpt);
  }

  return true;
}

export async function handleOcrCron(env: Env, limitOverride?: number): Promise<string> {
  const db = env.DB;
  const r2 = env.R2;
  const limit = limitOverride ?? BATCH_SIZE;

  let indexed = 0;
  let checked = 0;
  const issueExcerpts = new Map<string, string>();

  // Phase 1: Find pages missing OCR in issues that already have some OCR.
  // These are the most likely to have new R2 uploads (same paper being OCR'd).
  const { results: likelyPages } = await db
    .prepare(
      `SELECT p.id, p.issue_id, p.page_num, p.image_url
       FROM pages p
       JOIN issues i ON i.id = p.issue_id
       WHERE p.ocr_text IS NULL
         AND i.paper_slug IN (
           SELECT DISTINCT i2.paper_slug FROM pages p2
           JOIN issues i2 ON i2.id = p2.issue_id
           WHERE p2.ocr_text IS NOT NULL
         )
       LIMIT ?`
    )
    .bind(limit)
    .all<{ id: number; issue_id: string; page_num: number; image_url: string }>();

  for (const page of likelyPages) {
    checked++;
    if (await indexPage(db, r2, page, issueExcerpts)) indexed++;
  }

  // Phase 2: If phase 1 didn't fill the batch, do an R2 list scan
  // to find OCR for papers we haven't seen yet.
  if (checked < limit) {
    const cursorRow = await db
      .prepare("SELECT value FROM ocr_stats WHERE key = 'r2_cursor'")
      .first<{ value: string }>()
      .catch(() => null);
    const savedCursor = cursorRow?.value || undefined;

    const listed = await r2.list({ limit: 1000, cursor: savedCursor });
    const jsonKeys = listed.objects
      .filter((obj) => obj.key.endsWith('.json'))
      .map((obj) => obj.key);

    const nextCursor = listed.truncated ? listed.cursor : '';
    await db.prepare(
      "INSERT OR REPLACE INTO ocr_stats (key, value, updated_at) VALUES ('r2_cursor', ?, ?)"
    ).bind(nextCursor, new Date().toISOString()).run();

    for (const key of jsonKeys) {
      if (checked >= limit) break;
      const imageUrl = 'https://pages.dangerouspress.org/' + key.replace(/\.json$/, '.jpg');
      const page = await db
        .prepare('SELECT p.id, p.issue_id, p.page_num, p.image_url FROM pages p WHERE p.image_url = ? AND p.ocr_text IS NULL')
        .bind(imageUrl)
        .first<{ id: number; issue_id: string; page_num: number; image_url: string }>();
      if (!page) continue;
      checked++;
      if (await indexPage(db, r2, page, issueExcerpts)) indexed++;
    }
  }

  // Update issue excerpts
  for (const [issueId, excerpt] of issueExcerpts) {
    await db
      .prepare('UPDATE issues SET ocr_excerpt = ? WHERE id = ?')
      .bind(excerpt, issueId)
      .run();
  }

  await updateStats(db, indexed, checked);

  const msg = `OCR cron: checked ${checked} pages, indexed ${indexed} new, ${issueExcerpts.size} excerpts updated.`;
  console.log(msg);
  return msg;
}

async function updateStats(db: D1Database, indexed: number, checked: number) {
  const now = new Date().toISOString();
  await db.prepare(
    "INSERT OR REPLACE INTO ocr_stats (key, value, updated_at) VALUES ('last_run', ?, ?)"
  ).bind(JSON.stringify({ indexed, checked, at: now }), now).run();
}
