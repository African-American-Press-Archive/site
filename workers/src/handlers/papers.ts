import { Hono } from 'hono';
import type { Env } from '../types';
import { getAllPapers, getPaper, getIssuesByPaper, getYearStats, getMonthStats } from '../db/queries';
import { paperGalleryPage } from '../templates/paper-gallery-page';
import { paperDetailPage } from '../templates/paper-detail-page';
import { notFoundPage, errorPage } from '../templates/error-page';
import { issuePageHandler } from './issue';

const papers = new Hono<{ Bindings: Env }>();

// GET /papers — gallery of all papers
papers.get('/', async (c) => {
  try {
    const allPapers = await getAllPapers(c.env.DB);
    return c.html(paperGalleryPage(allPapers));
  } catch (err) {
    console.error('Paper gallery error:', err);
    return c.html(errorPage(), 500);
  }
});

// GET /papers/:slug — paper detail with issue grid + timeline
papers.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const query = c.req.query();
  const year = query.year ? parseInt(query.year, 10) : undefined;
  const month = query.month ? parseInt(query.month, 10) : undefined;
  const page = query.page ? parseInt(query.page, 10) : 1;
  const sort = query.sort ?? 'date-asc';

  try {
    const paper = await getPaper(c.env.DB, slug);
    if (!paper) return c.html(notFoundPage(), 404);

    const [{ issues, total }, yearStats, monthStats] = await Promise.all([
      getIssuesByPaper(c.env.DB, slug, { year, month, page, sort }),
      getYearStats(c.env.DB, slug),
      year ? getMonthStats(c.env.DB, year, slug) : Promise.resolve([]),
    ]);

    return c.html(paperDetailPage(paper, issues, total, yearStats, monthStats, { year, month, page, sort }));
  } catch (err) {
    console.error('Paper detail error:', err);
    return c.html(errorPage(), 500);
  }
});

// GET /papers/:slug/:segment — issue page (YYYY-MM-DD), year redirect (YYYY), or 404
papers.get('/:slug/:segment', async (c) => {
  const slug = c.req.param('slug');
  const segment = c.req.param('segment');

  // YYYY-MM-DD → issue page
  if (/^\d{4}-\d{2}-\d{2}$/.test(segment)) {
    const pageNum = c.req.query('page') ? parseInt(c.req.query('page')!, 10) : 1;
    return issuePageHandler(c, slug, segment, pageNum);
  }

  // YYYY → redirect to paper detail filtered by year
  if (/^\d{4}$/.test(segment)) {
    return c.redirect(`/papers/${slug}?year=${segment}`, 301);
  }

  return c.html(notFoundPage(), 404);
});

export default papers;
