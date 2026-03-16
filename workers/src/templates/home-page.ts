import type { Paper, Issue } from '../types';
import { layout, escapeHtml, escapeAttr } from './layout';
import { paperCard } from './components/paper-card';
import { searchBar } from './components/search-bar';
import { formatDateMedium } from './components/date-fmt';

export function homePage(
  papers: Paper[],
  todayIssues: (Issue & { paper_title: string })[] = [],
): string {
  const totalIssues = papers.reduce((sum, p) => sum + p.issue_count, 0);
  const cards = papers.map((p) => paperCard(p)).join('');

  // Today in History section
  const now = new Date();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const todayLabel = `${monthNames[now.getMonth()]} ${now.getDate()}`;

  const heroCards = todayIssues.map((issue) => {
    const href = `/papers/${issue.paper_slug}/${issue.date}`;
    const thumb = issue.thumbnail_url ?? '';
    const date = formatDateMedium(issue.date);
    return `<a href="${escapeAttr(href)}" class="hero-card">
      <div class="hero-card-img">
        ${thumb ? `<img src="${escapeAttr(thumb)}" alt="${escapeHtml(issue.paper_title)}, ${date}" loading="lazy">` : ''}
      </div>
      <div class="hero-card-info">
        <span class="hero-card-date">${escapeHtml(date)}</span>
        <span class="hero-card-title">${escapeHtml(issue.paper_title)}</span>
      </div>
    </a>`;
  }).join('');

  const heroSection = todayIssues.length > 0 ? `
    <section class="hero-history">
      <div class="hero-history-header">
        <span class="hero-history-kicker">Today in History</span>
        <span class="hero-history-date">${todayLabel}</span>
      </div>
      <div class="hero-history-grid">
        ${heroCards}
      </div>
    </section>
  ` : '';

  const content = `
    <section class="hero">
      <div class="hero-inner">
        <h1 class="hero-title">Dangerous Press</h1>
        <p class="hero-subtitle">African American Newspapers, 1905–1929</p>
        <div class="hero-search">
          ${searchBar('', true)}
        </div>
      </div>
    </section>
    ${heroSection}
    <section class="home-papers">
      <div class="section-header">
        <h2>Browse the Archive</h2>
        <p>${papers.length} newspapers · ${totalIssues.toLocaleString()} issues</p>
      </div>
      <div class="paper-gallery-grid">
        ${cards}
      </div>
    </section>
  `;

  return layout(
    {
      title: 'Dangerous Press — African American Newspapers Archive',
      description: `Explore ${papers.length} African American newspapers and over ${totalIssues.toLocaleString()} issues from 1905 to 1929.`,
      bodyClass: 'home-page',
    },
    content,
  );
}
