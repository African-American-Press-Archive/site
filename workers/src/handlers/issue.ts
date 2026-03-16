import type { Context } from 'hono';
import type { Env } from '../types';
import { getPaper, getIssue, getPages, getAdjacentIssues } from '../db/queries';
import { issuePage } from '../templates/issue-page';
import { notFoundPage, errorPage } from '../templates/error-page';

export async function issuePageHandler(
  c: Context<{ Bindings: Env }>,
  slug: string,
  date: string,
  pageNum: number = 1,
): Promise<Response> {
  try {
    const [paper, issue] = await Promise.all([
      getPaper(c.env.DB, slug),
      getIssue(c.env.DB, slug, date),
    ]);

    if (!paper) return c.html(notFoundPage(), 404);
    if (!issue) return c.html(notFoundPage(), 404);

    const [pages, adjacent] = await Promise.all([
      getPages(c.env.DB, issue.id),
      getAdjacentIssues(c.env.DB, slug, issue.seq),
    ]);

    const safePageNum = Math.max(1, Math.min(pageNum, issue.page_count || 1));

    return c.html(issuePage(paper, issue, pages, adjacent.prev, adjacent.next, safePageNum));
  } catch (err) {
    console.error('Issue page handler error:', err);
    return c.html(errorPage(), 500);
  }
}
