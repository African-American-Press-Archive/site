import { Hono } from 'hono';
import type { Env } from '../types';
import { getAllPaperSlugs, getIssueUrlsForPaper } from '../db/queries';

const BASE = 'https://dangerouspress.com';

function sitemapXml(urls: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  ${urls.join('\n  ')}\n</urlset>`;
}

function urlEntry(loc: string, changefreq?: string, priority?: string): string {
  return `<url><loc>${loc}</loc>${changefreq ? `<changefreq>${changefreq}</changefreq>` : ''}${priority ? `<priority>${priority}</priority>` : ''}</url>`;
}

function sitemapIndex(sitemapUrls: string[]): string {
  const maps = sitemapUrls
    .map((url) => `<sitemap><loc>${url}</loc></sitemap>`)
    .join('\n  ');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  ${maps}\n</sitemapindex>`;
}

const sitemap = new Hono<{ Bindings: Env }>();

// GET /sitemap.xml — sitemap index
sitemap.get('/sitemap.xml', async (c) => {
  try {
    const slugs = await getAllPaperSlugs(c.env.DB);
    const urls = [
      `${BASE}/sitemap/static.xml`,
      ...slugs.map((s) => `${BASE}/sitemap/${s}.xml`),
    ];
    return c.text(sitemapIndex(urls), 200, {
      'Content-Type': 'application/xml; charset=utf-8',
    });
  } catch (err) {
    console.error('Sitemap index error:', err);
    return c.text('Sitemap error', 500);
  }
});

// GET /sitemap/static.xml — static pages
sitemap.get('/sitemap/static.xml', (c) => {
  const urls = [
    urlEntry(`${BASE}/`, 'weekly', '1.0'),
    urlEntry(`${BASE}/papers`, 'weekly', '0.9'),
    urlEntry(`${BASE}/about`, 'monthly', '0.5'),
    urlEntry(`${BASE}/search`, 'monthly', '0.5'),
  ];
  return c.text(sitemapXml(urls), 200, {
    'Content-Type': 'application/xml; charset=utf-8',
  });
});

// GET /sitemap/:slug.xml — per-paper issue URLs
sitemap.get('/sitemap/:filename', async (c) => {
  const filename = c.req.param('filename');
  if (!filename.endsWith('.xml')) {
    return c.text('Not found', 404);
  }
  const slug = filename.slice(0, -4); // strip .xml

  try {
    const issues = await getIssueUrlsForPaper(c.env.DB, slug);
    if (issues.length === 0) {
      return c.text('Not found', 404);
    }
    const urls = [
      urlEntry(`${BASE}/papers/${slug}`, 'monthly', '0.8'),
      ...issues.map((i) => urlEntry(`${BASE}/papers/${i.slug}/${i.date}`, 'never', '0.6')),
    ];
    return c.text(sitemapXml(urls), 200, {
      'Content-Type': 'application/xml; charset=utf-8',
    });
  } catch (err) {
    console.error('Per-paper sitemap error:', err);
    return c.text('Sitemap error', 500);
  }
});

export default sitemap;
