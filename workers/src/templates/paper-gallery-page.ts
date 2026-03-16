import type { Paper } from '../types';
import { layout } from './layout';
import { paperCard } from './components/paper-card';
import { searchBar } from './components/search-bar';

export function paperGalleryPage(papers: Paper[]): string {
  const totalIssues = papers.reduce((sum, p) => sum + p.issue_count, 0);
  const cards = papers.map((p) => paperCard(p)).join('');

  const content = `
    <div class="page-header">
      <h1>All Newspapers</h1>
      <p class="page-header-sub">${papers.length} newspapers · ${totalIssues.toLocaleString()} issues · 1905–1929</p>
      ${searchBar()}
    </div>
    <div class="paper-gallery-grid">
      ${cards}
    </div>
  `;

  return layout(
    {
      title: 'All Newspapers',
      description: `Browse all ${papers.length} African American newspapers in the Dangerous Press archive, with over ${totalIssues.toLocaleString()} issues from 1905 to 1929.`,
      canonicalUrl: 'https://dangerouspress.com/papers',
      bodyClass: 'paper-gallery-page',
    },
    content,
  );
}
