import type { Paper } from '../../types';
import { escapeHtml } from '../layout';

export function paperCard(paper: Paper): string {
  return `<article class="paper-gallery-card glass-card">
  <a href="/papers/${paper.slug}" class="paper-card-link">
    <div class="paper-gallery-masthead">
      ${paper.thumbnail_url ? `<img src="${escapeHtml(paper.thumbnail_url)}" alt="${escapeHtml(paper.title)}" loading="lazy">` : '<div class="paper-card-placeholder"></div>'}
    </div>
    <div class="paper-card-info">
      <div class="paper-card-header">
        <h3 class="paper-card-title">${escapeHtml(paper.title)}</h3>
        ${paper.location ? `<span class="paper-card-location">${escapeHtml(paper.location)}</span>` : ''}
      </div>
      <div class="paper-card-stats">
        <span class="paper-card-dates">${paper.first_date?.slice(0, 4) ?? ''}–${paper.last_date?.slice(0, 4) ?? ''}</span>
        <span class="paper-card-count">${paper.issue_count} issues</span>
      </div>
    </div>
  </a>
</article>`;
}
