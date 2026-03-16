import { Hono } from 'hono';
import type { Env, Issue } from '../types';
import { getAllPapers } from '../db/queries';
import { homePage } from '../templates/home-page';
import { errorPage } from '../templates/error-page';

const home = new Hono<{ Bindings: Env }>();

home.get('/', async (c) => {
  try {
    // Get today's month-day for "Today in History"
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const monthDay = `%-${mm}-${dd}`;

    const [papers, todayResult] = await Promise.all([
      getAllPapers(c.env.DB),
      c.env.DB.prepare(
        `SELECT i.*, p.title as paper_title, p.location
         FROM issues i JOIN papers p ON p.slug = i.paper_slug
         WHERE i.date LIKE ?
         ORDER BY RANDOM()
         LIMIT 20`
      ).bind(monthDay).all<Issue & { paper_title: string; location: string | null }>(),
    ]);

    // Pick one per paper, max 5
    const byPaper = new Map<string, Issue & { paper_title: string }>();
    for (const issue of todayResult.results) {
      if (!byPaper.has(issue.paper_slug)) {
        byPaper.set(issue.paper_slug, issue);
      }
    }
    const todayIssues = [...byPaper.values()].slice(0, 5);

    return c.html(homePage(papers, todayIssues), 200, {
      'Cache-Control': 'public, max-age=3600',
    });
  } catch (err) {
    console.error('Home handler error:', err);
    return c.html(errorPage(), 500);
  }
});

export default home;
