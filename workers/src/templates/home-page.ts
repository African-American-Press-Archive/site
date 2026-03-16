import type { Paper } from '../types';
import { layout } from './layout';
import { paperCard } from './components/paper-card';
import { searchBar } from './components/search-bar';

export function homePage(papers: Paper[]): string {
  const totalIssues = papers.reduce((sum, p) => sum + p.issue_count, 0);
  const cards = papers.map((p) => paperCard(p)).join('');

  const content = `
    <section class="hero">
      <div class="hero-inner">
        <h1 class="hero-title">Dangerous Press</h1>
        <p class="hero-subtitle">African American Newspapers, 1905–1929</p>
        <p class="hero-description">
          Explore ${papers.length} newspapers and over ${totalIssues.toLocaleString()} issues
          from the Black press during a pivotal era in American history.
        </p>
        ${searchBar('', true)}
      </div>
    </section>
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
