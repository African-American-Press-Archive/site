import type { Paper, Issue, YearStat } from '../types';
import { layout, escapeHtml } from './layout';
import { breadcrumb } from './components/breadcrumb';
import { issueCard } from './components/issue-card';
import { timeline, monthPills } from './components/timeline';
import { pagination } from './components/pagination';

const ISSUES_PER_PAGE = 12;

export function paperDetailPage(
  paper: Paper,
  issues: Issue[],
  total: number,
  yearStats: YearStat[],
  monthStats: { month: number; count: number }[],
  opts: { year?: number; month?: number; page?: number; sort?: string },
): string {
  const { year, month, page = 1, sort = 'date-asc' } = opts;

  const crumbs = breadcrumb([
    { label: 'Papers', href: '/papers' },
    { label: paper.title },
  ]);

  const timelineHtml = timeline(yearStats, year ?? null, paper.slug, total);

  let monthPillsHtml = '';
  if (year && monthStats.length > 0) {
    const baseWithYear = `/papers/${paper.slug}?year=${year}`;
    monthPillsHtml = monthPills(monthStats, month ?? null, baseWithYear);
  }

  const baseUrl = buildBaseUrl(paper.slug, year, month);
  const sortOther = sort === 'date-asc' ? 'date-desc' : 'date-asc';
  const sortLabel = sort === 'date-asc' ? 'Oldest first' : 'Newest first';
  const sortToggleUrl = buildBaseUrl(paper.slug, year, month, sortOther);

  const cards = issues.map((i) => issueCard(i, paper.title, paper.slug)).join('');
  const paginationHtml = pagination(baseUrl, page, total, ISSUES_PER_PAGE);

  const years = paper.first_date?.slice(0, 4) ?? '';
  const yearsEnd = paper.last_date?.slice(0, 4) ?? '';
  const dateRange = years && yearsEnd ? `${years}–${yearsEnd}` : '';

  const content = `
    ${crumbs}
    <div class="paper-detail-header">
      <div class="paper-detail-title-block">
        <h1>${escapeHtml(paper.title)}</h1>
        ${paper.location ? `<p class="paper-detail-location">${escapeHtml(paper.location)}</p>` : ''}
        <p class="paper-detail-meta">${dateRange ? `${dateRange} · ` : ''}${paper.issue_count.toLocaleString()} issues</p>
      </div>
      ${paper.thumbnail_url ? `<div class="paper-detail-masthead"><img src="${escapeHtml(paper.thumbnail_url)}" alt="${escapeHtml(paper.title)}" loading="lazy"></div>` : ''}
    </div>
    <div class="paper-detail-timeline">
      ${timelineHtml}
      ${monthPillsHtml}
    </div>
    <div class="paper-detail-controls">
      <p class="paper-detail-count">${total.toLocaleString()} issue${total !== 1 ? 's' : ''}</p>
      <a href="${sortToggleUrl}&sort=${sortOther}" class="sort-toggle">${sortLabel}</a>
    </div>
    <div class="issue-grid">
      ${cards || '<p class="no-results">No issues found for the selected filters.</p>'}
    </div>
    ${paginationHtml}
  `;

  const description = `Browse ${paper.issue_count.toLocaleString()} issues of ${paper.title}${paper.location ? `, ${paper.location}` : ''}${dateRange ? ` (${dateRange})` : ''}.`;

  return layout(
    {
      title: paper.title,
      description,
      ogImage: paper.thumbnail_url ?? undefined,
      canonicalUrl: `https://dangerouspress.com/papers/${paper.slug}`,
      bodyClass: 'paper-detail-page',
    },
    content,
  );
}

function buildBaseUrl(slug: string, year?: number, month?: number, sort?: string): string {
  const params: string[] = [];
  if (year) params.push(`year=${year}`);
  if (month) params.push(`month=${month}`);
  if (sort) params.push(`sort=${sort}`);
  return `/papers/${slug}${params.length ? '?' + params.join('&') : ''}`;
}
