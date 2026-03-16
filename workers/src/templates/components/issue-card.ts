import type { Issue } from '../../types';
import { escapeHtml } from '../layout';
import { formatDateShort } from './date-fmt';

export function issueCard(issue: Issue, paperTitle?: string, paperSlug?: string): string {
  const slug = paperSlug ?? issue.paper_slug;
  const href = `/papers/${slug}/${issue.date}`;
  const displayDate = formatDateShort(issue.date);
  const title = paperTitle ?? '';
  return `<article class="issue-card glass-card">
  <a href="${href}" class="issue-card-link">
    <div class="issue-card-thumb">
      ${issue.thumbnail_url ? `<img src="${escapeHtml(issue.thumbnail_url)}" alt="${escapeHtml(title)}, ${displayDate}" loading="lazy">` : '<div class="issue-card-placeholder"></div>'}
    </div>
    <div class="issue-card-info">
      ${title ? `<h3 class="issue-card-title">${escapeHtml(title)}</h3>` : ''}
      <p class="issue-card-date">${displayDate}</p>
      <p class="issue-card-pages">${issue.page_count} page${issue.page_count !== 1 ? 's' : ''}</p>
    </div>
  </a>
</article>`;
}
