import { Hono } from 'hono';
import type { Env } from '../types';
import { getIssuesByDate } from '../db/queries';
import { dateBrowsePage } from '../templates/date-browse-page';
import { notFoundPage, errorPage } from '../templates/error-page';

const dateBrowse = new Hono<{ Bindings: Env }>();

dateBrowse.get('/:date', async (c) => {
  const date = c.req.param('date');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.html(notFoundPage(), 404);
  }

  try {
    const issues = await getIssuesByDate(c.env.DB, date);
    return c.html(dateBrowsePage(date, issues));
  } catch (err) {
    console.error('Date browse error:', err);
    return c.html(errorPage(), 500);
  }
});

export default dateBrowse;
