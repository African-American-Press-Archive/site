import { Hono } from 'hono';
import type { Env } from '../types';
import type { SearchFilters } from '../types';
import { searchOCR, getAllPapers } from '../db/queries';
import { searchResultsPage } from '../templates/search-results-page';
import { errorPage } from '../templates/error-page';

const search = new Hono<{ Bindings: Env }>();

search.get('/', async (c) => {
  const query = c.req.query('q')?.trim() ?? '';
  if (!query) return c.redirect('/', 302);

  const fromParam = c.req.query('from');
  const toParam = c.req.query('to');
  const sortParam = c.req.query('sort') as SearchFilters['sort'] | undefined;
  const pageParam = c.req.query('page');
  // Hono's c.req.queries() returns an array of values for a repeated param
  const paperParams: string[] = c.req.queries('paper') ?? [];

  const filters: SearchFilters = {
    fromYear: fromParam ? parseInt(fromParam, 10) : 1905,
    toYear: toParam ? parseInt(toParam, 10) : 1929,
    papers: paperParams.length > 0 ? paperParams : undefined,
    sort: sortParam && ['relevance', 'date-asc', 'date-desc'].includes(sortParam) ? sortParam : 'relevance',
    page: pageParam ? parseInt(pageParam, 10) : 1,
  };

  try {
    const [{ results, total, paperCounts }, allPapers] = await Promise.all([
      searchOCR(c.env.DB, query, filters),
      getAllPapers(c.env.DB),
    ]);

    const html = searchResultsPage(query, results, total, filters, paperCounts, allPapers);

    return c.html(html, 200, {
      'Cache-Control': 'public, max-age=3600',
    });
  } catch (err) {
    console.error('Search error:', err);
    return c.html(errorPage(), 500);
  }
});

export default search;
