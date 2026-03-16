import { Hono } from 'hono';
import type { Env } from '../types';
import { getAllPapers } from '../db/queries';
import { homePage } from '../templates/home-page';
import { errorPage } from '../templates/error-page';

const home = new Hono<{ Bindings: Env }>();

home.get('/', async (c) => {
  try {
    const papers = await getAllPapers(c.env.DB);
    return c.html(homePage(papers));
  } catch (err) {
    console.error('Home handler error:', err);
    return c.html(errorPage(), 500);
  }
});

export default home;
