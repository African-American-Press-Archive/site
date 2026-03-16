import { Hono } from 'hono';
import type { Env } from './types';
import home from './handlers/home';
import papers from './handlers/papers';
import dateBrowse from './handlers/date-browse';
import about from './handlers/about';
import sitemap from './handlers/sitemap';
import search from './handlers/search';
import { notFoundPage, errorPage } from './templates/error-page';

const app = new Hono<{ Bindings: Env }>();

app.route('/', home);
app.route('/papers', papers);
app.route('/date', dateBrowse);
app.route('/about', about);
app.route('/search', search);
app.route('/', sitemap);

app.notFound((c) => c.html(notFoundPage(), 404));
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.html(errorPage(), 500);
});

export default app;
