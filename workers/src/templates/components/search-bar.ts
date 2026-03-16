import { escapeAttr } from '../layout';

export function searchBar(query: string = '', autofocus: boolean = false): string {
  return `<form action="/search" method="get" class="search-form">
  <input type="search" name="q" value="${escapeAttr(query)}" placeholder="Search the archive..." class="search-input" aria-label="Search" ${autofocus ? 'autofocus' : ''}>
  <button type="submit" class="search-button">Search</button>
</form>`;
}
