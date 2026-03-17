import type { Paper, Issue, Page, SearchResult, SearchFilters, YearStat } from '../types';

const ITEMS_PER_PAGE = 20;
const ISSUES_PER_PAGE = 12;

export async function getAllPapers(db: D1Database): Promise<Paper[]> {
  const { results } = await db.prepare('SELECT * FROM papers ORDER BY issue_count DESC').all<Paper>();
  return results;
}

export async function getPaper(db: D1Database, slug: string): Promise<Paper | null> {
  return db.prepare('SELECT * FROM papers WHERE slug = ?').bind(slug).first<Paper>();
}

export async function getIssuesByPaper(
  db: D1Database, slug: string,
  opts: { year?: number; month?: number; page?: number; sort?: string } = {}
): Promise<{ issues: Issue[]; total: number }> {
  const { year, month, page = 1, sort = 'date-asc' } = opts;
  let where = 'WHERE paper_slug = ?';
  const params: (string | number)[] = [slug];
  if (year) { where += ' AND year = ?'; params.push(year); }
  if (month) { where += ' AND month = ?'; params.push(month); }
  const orderBy = sort === 'date-desc' ? 'ORDER BY date DESC' : 'ORDER BY date ASC';
  const offset = (page - 1) * ISSUES_PER_PAGE;
  const [countResult, issueResult] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as total FROM issues ${where}`).bind(...params).first<{ total: number }>(),
    db.prepare(`SELECT * FROM issues ${where} ${orderBy} LIMIT ? OFFSET ?`).bind(...params, ISSUES_PER_PAGE, offset).all<Issue>(),
  ]);
  return { issues: issueResult.results, total: countResult?.total ?? 0 };
}

export async function getIssue(db: D1Database, slug: string, date: string): Promise<Issue | null> {
  return db.prepare('SELECT * FROM issues WHERE paper_slug = ? AND date = ?').bind(slug, date).first<Issue>();
}

export async function getAdjacentIssues(db: D1Database, slug: string, seq: number): Promise<{ prev: Issue | null; next: Issue | null }> {
  const [prev, next] = await Promise.all([
    db.prepare('SELECT * FROM issues WHERE paper_slug = ? AND seq = ?').bind(slug, seq - 1).first<Issue>(),
    db.prepare('SELECT * FROM issues WHERE paper_slug = ? AND seq = ?').bind(slug, seq + 1).first<Issue>(),
  ]);
  return { prev, next };
}

export async function getIssuesByDate(db: D1Database, date: string): Promise<(Issue & { paper_title: string; location: string | null })[]> {
  const { results } = await db.prepare(
    `SELECT i.*, p.title as paper_title, p.location FROM issues i JOIN papers p ON p.slug = i.paper_slug WHERE i.date = ? ORDER BY p.title`
  ).bind(date).all();
  return results as unknown as (Issue & { paper_title: string; location: string | null })[];
}

export async function getPages(db: D1Database, issueId: string): Promise<Page[]> {
  const { results } = await db.prepare('SELECT * FROM pages WHERE issue_id = ? ORDER BY page_num').bind(issueId).all<Page>();
  return results;
}

export async function getYearStats(db: D1Database, slug?: string): Promise<YearStat[]> {
  if (slug) {
    const { results } = await db.prepare('SELECT year, COUNT(*) as count FROM issues WHERE paper_slug = ? GROUP BY year ORDER BY year').bind(slug).all<YearStat>();
    return results;
  }
  const { results } = await db.prepare('SELECT year, COUNT(*) as count FROM issues GROUP BY year ORDER BY year').all<YearStat>();
  return results;
}

export async function getMonthStats(db: D1Database, year: number, slug?: string): Promise<{ month: number; count: number }[]> {
  const query = slug
    ? 'SELECT month, COUNT(*) as count FROM issues WHERE year = ? AND paper_slug = ? GROUP BY month ORDER BY month'
    : 'SELECT month, COUNT(*) as count FROM issues WHERE year = ? GROUP BY month ORDER BY month';
  const stmt = slug ? db.prepare(query).bind(year, slug) : db.prepare(query).bind(year);
  const { results } = await stmt.all<{ month: number; count: number }>();
  return results;
}

/** Wrap a token for FTS5: preserve trailing * for prefix search, quote everything else */
function wrapToken(t: string): string {
  const clean = t.replace(/"/g, '');
  if (clean.length > 1 && clean.endsWith('*')) {
    // FTS5 prefix query: must be unquoted, e.g. lynch*
    const stem = clean.slice(0, -1).replace(/[*^:(){}]/g, '');
    return stem.length > 0 ? `${stem}*` : '""';
  }
  // Strip any stray * not at end
  return `"${clean.replace(/\*/g, '')}"`;
}

/**
 * Sanitize a user query for FTS5 MATCH.
 * - Convert dotted abbreviations (N.A.A.C.P.) into quoted phrases of single letters
 *   to match how unicode61 tokenizer splits them ("n a a c p")
 * - Strip characters that FTS5 treats as operators
 * - Wrap each resulting token in double quotes so punctuation is literal
 */
function sanitizeFtsQuery(raw: string): string {
  // Normalize smart/curly quotes to straight quotes
  let q = raw.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"').replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
  // Convert dotted abbreviations into quoted phrase of single letters.
  // unicode61 tokenizer splits N.A.A.C.P. into tokens [n, a, a, c, p],
  // so we need to search for "n a a c p" as a phrase to match them consecutively.
  q = q.replace(/\b([A-Za-z]\.){2,}[A-Za-z]?\b/g, (match) => {
    const letters = match.replace(/\./g, '').split('').join(' ');
    return `"${letters}"`;
  });
  // Remove remaining dots
  q = q.replace(/\./g, ' ');
  // Strip FTS5 special characters except * (used for prefix search): ^ : ( ) { }
  q = q.replace(/[\^:(){}]/g, ' ');
  // Split into tokens, preserving quoted phrases
  const parts: string[] = [];
  const quoteRe = /"[^"]*"/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = quoteRe.exec(q)) !== null) {
    const before = q.slice(lastIdx, m.index);
    for (const t of before.split(/\s+/).filter((s) => s.length > 0)) {
      parts.push(wrapToken(t));
    }
    parts.push(m[0]); // already quoted phrase
    lastIdx = m.index + m[0].length;
  }
  const remaining = q.slice(lastIdx);
  for (const t of remaining.split(/\s+/).filter((s) => s.length > 0)) {
    parts.push(wrapToken(t));
  }
  return parts.length > 0 ? parts.join(' ') : '""';
}

export async function searchOCR(db: D1Database, query: string, filters: SearchFilters = {}): Promise<{
  results: SearchResult[]; total: number;
  paperCounts: Map<string, { title: string; count: number }>;
  yearCounts: { year: number; count: number }[];
}> {
  const { fromYear = 1905, toYear = 1929, papers, sort = 'relevance', page = 1 } = filters;
  const ftsQuery = sanitizeFtsQuery(query);
  const offset = (page - 1) * ITEMS_PER_PAGE;
  let filterWhere = 'AND i.year BETWEEN ? AND ?';
  const filterParams: (string | number)[] = [fromYear, toYear];
  if (papers && papers.length > 0) {
    const placeholders = papers.map(() => '?').join(', ');
    filterWhere += ` AND i.paper_slug IN (${placeholders})`;
    filterParams.push(...papers);
  }
  const orderBy = sort === 'date-asc' ? 'ORDER BY i.date ASC' : sort === 'date-desc' ? 'ORDER BY i.date DESC' : 'ORDER BY rank';
  const [mainResult, countResult, facetResult, yearResult] = await Promise.all([
    db.prepare(
      `SELECT snippet(ocr_search, 0, '<mark>', '</mark>', '...', 30) as excerpt,
              i.id as issue_id, i.date, i.thumbnail_url, i.ocr_excerpt, i.paper_slug,
              pg.page_num, p.title as paper_title, p.location
       FROM ocr_search JOIN pages pg ON pg.id = ocr_search.rowid
       JOIN issues i ON i.id = pg.issue_id JOIN papers p ON p.slug = i.paper_slug
       WHERE ocr_search MATCH ? ${filterWhere} ${orderBy} LIMIT ? OFFSET ?`
    ).bind(ftsQuery, ...filterParams, ITEMS_PER_PAGE, offset).all<SearchResult>(),
    db.prepare(
      `SELECT COUNT(*) as total FROM ocr_search JOIN pages pg ON pg.id = ocr_search.rowid
       JOIN issues i ON i.id = pg.issue_id WHERE ocr_search MATCH ? ${filterWhere}`
    ).bind(ftsQuery, ...filterParams).first<{ total: number }>(),
    db.prepare(
      `SELECT i.paper_slug, p.title, COUNT(*) as count FROM ocr_search
       JOIN pages pg ON pg.id = ocr_search.rowid JOIN issues i ON i.id = pg.issue_id
       JOIN papers p ON p.slug = i.paper_slug WHERE ocr_search MATCH ? AND i.year BETWEEN ? AND ?
       GROUP BY i.paper_slug ORDER BY count DESC`
    ).bind(ftsQuery, fromYear, toYear).all<{ paper_slug: string; title: string; count: number }>(),
    // Year histogram — counts across full range regardless of year filter
    db.prepare(
      `SELECT i.year, COUNT(*) as count FROM ocr_search
       JOIN pages pg ON pg.id = ocr_search.rowid JOIN issues i ON i.id = pg.issue_id
       WHERE ocr_search MATCH ? AND i.year BETWEEN 1905 AND 1929
       GROUP BY i.year ORDER BY i.year`
    ).bind(ftsQuery).all<{ year: number; count: number }>(),
  ]);
  const paperCounts = new Map<string, { title: string; count: number }>();
  for (const row of facetResult.results) { paperCounts.set(row.paper_slug, { title: row.title, count: row.count }); }
  return { results: mainResult.results, total: countResult?.total ?? 0, paperCounts, yearCounts: yearResult.results };
}

export async function getIssueUrlsForPaper(db: D1Database, slug: string): Promise<{ slug: string; date: string }[]> {
  const { results } = await db.prepare('SELECT paper_slug as slug, date FROM issues WHERE paper_slug = ? ORDER BY date').bind(slug).all<{ slug: string; date: string }>();
  return results;
}

export async function getAllPaperSlugs(db: D1Database): Promise<string[]> {
  const { results } = await db.prepare('SELECT slug FROM papers ORDER BY slug').all<{ slug: string }>();
  return results.map((r) => r.slug);
}
