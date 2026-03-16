import type { Paper, Issue } from '../types';
import { layout, escapeHtml, escapeAttr } from './layout';
import { paperCard } from './components/paper-card';
import { formatDateMedium } from './components/date-fmt';

export function homePage(
  papers: Paper[],
  todayIssues: (Issue & { paper_title: string })[] = [],
): string {
  const totalIssues = papers.reduce((sum, p) => sum + p.issue_count, 0);
  const cards = papers.map((p) => paperCard(p)).join('');

  // Today in History
  const now = new Date();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const todayLabel = `${monthNames[now.getMonth()]} ${now.getDate()}`;

  const heroCards = todayIssues.map((issue) => {
    const href = `/papers/${issue.paper_slug}/${issue.date}`;
    const thumb = issue.thumbnail_url ?? '';
    const date = formatDateMedium(issue.date);
    return `<figure class="hero-card">
      <a href="${escapeAttr(href)}">
        ${thumb ? `<img src="${escapeAttr(thumb)}" alt="${escapeHtml(issue.paper_title)} - ${date}" loading="lazy">` : ''}
        <figcaption>
          <div class="hero-card-meta">${escapeHtml(date)}</div>
          <div class="hero-card-title">${escapeHtml(issue.paper_title)}</div>
        </figcaption>
      </a>
    </figure>`;
  }).join('');

  const heroSection = todayIssues.length > 0 ? `
    <section class="newsstand-hero glass-card">
      <div class="hero-history-header">
        <p class="hero-kicker">Today in History</p>
        <h2 class="hero-period-title">${escapeHtml(todayLabel)}</h2>
      </div>
      <div class="hero-grid">
        ${heroCards}
      </div>
    </section>
  ` : '';

  const content = `
    <header class="site-header glass">
      <div class="site-header-inner">
        <div class="branding-lockup">
          <span class="brand-emblem">
            <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Dangerous Press logo: historical newspaper archive emblem">
              <rect x="6" y="12" width="52" height="40" rx="4" fill="#F5F1E8" stroke="#8B7355" stroke-width="2"/>
              <path d="M12 20H52" stroke="#8B7355" stroke-width="3" stroke-linecap="round"/>
              <path d="M12 28H44" stroke="#8B7355" stroke-width="3" stroke-linecap="round"/>
              <path d="M12 36H40" stroke="#8B7355" stroke-width="3" stroke-linecap="round"/>
              <path d="M12 44H36" stroke="#8B7355" stroke-width="3" stroke-linecap="round"/>
              <path d="M50 24V48" stroke="#8B7355" stroke-width="3" stroke-linecap="round"/>
              <path d="M45 24V48" stroke="#8B7355" stroke-width="3" stroke-linecap="round"/>
              <path d="M16 48H32" stroke="#8B7355" stroke-width="3" stroke-linecap="round"/>
            </svg>
          </span>
          <div>
            <h1 class="hero-title editorial-title">Dangerous Press</h1>
            <p class="subtitle-text">An Archive of African American Newspapers, 1905–1929</p>
          </div>
        </div>
        <div class="header-search-col">
          <form action="/search" method="get" class="search-form">
            <input type="search" name="q" placeholder="Search archive..." class="search-input" aria-label="Search archive">
            <button type="submit" class="search-button">Search</button>
          </form>
          <div class="header-about-link">
            <a href="/about" class="deco-link">About</a>
          </div>
        </div>
      </div>
    </header>
    <div class="home-content">
      ${heroSection}
      <section class="home-papers">
        <div class="section-header">
          <h2>Browse by Paper</h2>
          <p>${papers.length} newspapers · ${totalIssues.toLocaleString()} issues</p>
        </div>
        <div class="paper-gallery-grid">
          ${cards}
        </div>
      </section>
    </div>
  `;

  return layout(
    {
      title: 'Dangerous Press — African American Newspapers Archive',
      description: `Explore ${papers.length} African American newspapers and over ${totalIssues.toLocaleString()} issues from 1905 to 1929.`,
      bodyClass: 'home-page',
      hideNav: true,
    },
    content,
  );
}
