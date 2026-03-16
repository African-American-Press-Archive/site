import type { Issue } from '../types';
import { layout, escapeHtml, escapeAttr } from './layout';
import { breadcrumb } from './components/breadcrumb';
import { formatDateLong, formatDateMedium } from './components/date-fmt';

type IssueWithPaper = Issue & { paper_title: string; location: string | null };

export function dateBrowsePage(date: string, issues: IssueWithPaper[]): string {
  const displayDate = formatDateLong(date);
  const displayDateMedium = formatDateMedium(date);

  const crumbs = breadcrumb([
    { label: 'Browse by Date' },
    { label: displayDateMedium },
  ]);

  const cards = issues.map((issue) => {
    const href = `/papers/${issue.paper_slug}/${issue.date}`;
    const thumb = issue.thumbnail_url;
    return `<article class="issue-card glass-card">
  <a href="${escapeAttr(href)}" class="issue-card-link">
    <div class="issue-card-thumb">
      ${thumb ? `<img src="${escapeAttr(thumb)}" alt="${escapeAttr(issue.paper_title)}, ${escapeAttr(displayDateMedium)}" loading="lazy">` : '<div class="issue-card-placeholder"></div>'}
    </div>
    <div class="issue-card-info">
      <h3 class="issue-card-title">${escapeHtml(issue.paper_title)}</h3>
      ${issue.location ? `<p class="issue-card-location">${escapeHtml(issue.location)}</p>` : ''}
      <p class="issue-card-pages">${issue.page_count} page${issue.page_count !== 1 ? 's' : ''}</p>
    </div>
  </a>
</article>`;
  }).join('');

  const content = `
    ${crumbs}
    <div class="page-header">
      <h1>Issues from ${displayDate}</h1>
      <p class="page-header-sub">${issues.length} newspaper${issues.length !== 1 ? 's' : ''} published on this date</p>
    </div>
    <div class="issue-grid">
      ${cards || '<p class="no-results">No issues found for this date.</p>'}
    </div>
  `;

  return layout(
    {
      title: `Issues from ${displayDateMedium}`,
      description: `${issues.length} African American newspapers published on ${displayDate}.`,
      bodyClass: 'date-browse-page',
    },
    content,
  );
}
