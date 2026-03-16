import { Hono } from 'hono';
import type { Env } from './types';
import home from './handlers/home';
import papers from './handlers/papers';
import dateBrowse from './handlers/date-browse';
import about from './handlers/about';
import sitemap from './handlers/sitemap';
import search from './handlers/search';
import { handleOcrCron } from './handlers/ocr-cron';
import { notFoundPage, errorPage } from './templates/error-page';

const app = new Hono<{ Bindings: Env }>();

app.route('/', home);
app.route('/papers', papers);
app.route('/date', dateBrowse);
app.route('/about', about);
app.route('/search', search);
app.route('/', sitemap);

// Proxy OCR JSON from R2 (avoids CORS issues when viewer fetches from workers.dev)
app.get('/ocr/*', async (c) => {
  const path = c.req.path.replace('/ocr/', '');
  const r2Url = `https://pages.dangerouspress.org/${path}`;
  const resp = await fetch(r2Url);
  if (!resp.ok) return c.json({ error: 'not found' }, 404);
  const data = await resp.json();
  return c.json(data, 200, {
    'Cache-Control': 'public, max-age=86400',
    'Access-Control-Allow-Origin': '*',
  });
});

// OCR indexing status
app.get('/admin/ocr-status', async (c) => {
  const db = c.env.DB;
  const [total, indexed, missing] = await Promise.all([
    db.prepare('SELECT COUNT(*) as n FROM pages').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) as n FROM pages WHERE ocr_text IS NOT NULL').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) as n FROM pages WHERE ocr_text IS NULL').first<{ n: number }>(),
  ]);
  const excerpts = await db.prepare('SELECT COUNT(*) as n FROM issues WHERE ocr_excerpt IS NOT NULL').first<{ n: number }>();
  const lastRun = await db.prepare("SELECT value FROM ocr_stats WHERE key = 'last_run'").first<{ value: string }>().catch(() => null);
  const r2Totals = await db.prepare("SELECT value FROM ocr_stats WHERE key = 'r2_totals'").first<{ value: string }>().catch(() => null);

  return c.json({
    total_pages: total?.n ?? 0,
    pages_with_ocr: indexed?.n ?? 0,
    pages_missing_ocr: missing?.n ?? 0,
    issues_with_excerpt: excerpts?.n ?? 0,
    pct_indexed: total?.n ? Math.round((indexed?.n ?? 0) / total.n * 100) : 0,
    cron: {
      last_run: lastRun ? JSON.parse(lastRun.value) : null,
      r2_totals: r2Totals ? JSON.parse(r2Totals.value) : null,
    },
  });
});

// Webhook: index a single OCR JSON from R2 into D1
// Called by OCR pipeline after uploading to R2
// POST /admin/ocr-index { "key": "chicago-defender/1919/1919-07-26/page_01.json" }
app.post('/admin/ocr-index', async (c) => {
  try {
    const body = await c.req.json<{ key?: string; keys?: string[] }>();
    const keys = body.keys ?? (body.key ? [body.key] : []);
    if (!keys.length) return c.json({ error: 'Provide "key" or "keys"' }, 400);

    const db = c.env.DB;
    const r2 = c.env.R2;
    let indexed = 0;
    let skipped = 0;

    for (const key of keys) {
      const imageUrl = 'https://pages.dangerouspress.org/' + key.replace(/\.json$/, '.jpg');

      // Find matching page in D1
      const page = await db
        .prepare('SELECT p.id, p.issue_id, p.page_num FROM pages p WHERE p.image_url = ?')
        .bind(imageUrl)
        .first<{ id: number; issue_id: string; page_num: number }>();
      if (!page) { skipped++; continue; }

      // Fetch OCR JSON from R2
      const obj = await r2.get(key);
      if (!obj) { skipped++; continue; }

      let data: any;
      try { data = await obj.json(); } catch { skipped++; continue; }

      const text = (data.regions ?? [])
        .filter((r: any) => r.status === 'ok' && r.text?.trim())
        .map((r: any) => r.text.trim())
        .join('\n');
      if (!text) { skipped++; continue; }

      // Update page OCR text (FTS triggers fire automatically)
      await db.prepare('UPDATE pages SET ocr_text = ? WHERE id = ?').bind(text, page.id).run();

      // Update issue excerpt for front pages
      if (page.page_num === 1) {
        const excerpt = text.length > 300 ? text.slice(0, 300).replace(/\s+\S*$/, '') : text;
        await db.prepare('UPDATE issues SET ocr_excerpt = ? WHERE id = ?').bind(excerpt, page.issue_id).run();
      }
      indexed++;
    }
    return c.json({ indexed, skipped, total: keys.length });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Manually trigger OCR cron (smaller batch for HTTP request time limits)
app.get('/admin/ocr-run', async (c) => {
  try {
    const result = await handleOcrCron(c.env, 100);
    return c.json({ result });
  } catch (e: any) {
    return c.json({ error: e.message, stack: e.stack }, 500);
  }
});

app.notFound((c) => c.html(notFoundPage(), 404));
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.html(errorPage(), 500);
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleOcrCron(env).then((msg) => console.log(msg)));
  },
};
