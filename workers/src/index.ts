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
