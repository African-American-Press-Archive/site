import { layout } from './layout';
import { searchBar } from './components/search-bar';

export function notFoundPage(): string {
  return layout({ title: 'Not Found' }, `
    <div class="error-page">
      <h1>Page Not Found</h1>
      <p>The page you're looking for doesn't exist in the archive.</p>
      ${searchBar('', true)}
      <p><a href="/papers">Browse all papers</a></p>
    </div>
  `);
}

export function errorPage(): string {
  return layout({ title: 'Error' }, `
    <div class="error-page">
      <h1>Something went wrong</h1>
      <p>We're having trouble loading that page. Please try again.</p>
      <p><a href="/">Return to homepage</a></p>
    </div>
  `);
}
