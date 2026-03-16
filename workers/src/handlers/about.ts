import { Hono } from 'hono';
import type { Env } from '../types';
import { aboutPage } from '../templates/about-page';

const about = new Hono<{ Bindings: Env }>();

about.get('/', async (c) => {
  return c.html(aboutPage());
});

export default about;
