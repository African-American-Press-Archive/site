import type { SearchResult, SearchFilters } from '../types';
import { layout, escapeHtml, escapeAttr } from './layout';
import { pagination } from './components/pagination';

const ITEMS_PER_PAGE = 20;

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[month - 1]} ${day}, ${year}`;
}

function buildSearchUrl(
  query: string,
  filters: SearchFilters,
  overrides: Partial<SearchFilters & { q: string }> = {},
): string {
  const params = new URLSearchParams();
  const q = overrides.q ?? query;
  if (q) params.set('q', q);
  const from = overrides.fromYear ?? filters.fromYear;
  const to = overrides.toYear ?? filters.toYear;
  if (from && from !== 1905) params.set('from', String(from));
  if (to && to !== 1929) params.set('to', String(to));
  const papers = overrides.papers ?? filters.papers;
  if (papers && papers.length > 0) papers.forEach((p) => params.append('paper', p));
  const sort = overrides.sort ?? filters.sort;
  if (sort && sort !== 'relevance') params.set('sort', sort);
  const page = overrides.page ?? filters.page;
  if (page && page > 1) params.set('page', String(page));
  return `/search?${params.toString()}`;
}

function resultCard(result: SearchResult): string {
  const issueUrl = `/papers/${result.paper_slug}/${result.date}`;
  const dateLabel = formatDate(result.date);
  const thumb = result.thumbnail_url
    ? `<a href="${escapeAttr(issueUrl)}" class="search-result-thumb">
        <img src="${escapeAttr(result.thumbnail_url)}" alt="${escapeAttr(result.paper_title)} ${dateLabel}" loading="lazy">
       </a>`
    : '';

  return `<article class="search-result-card">
  ${thumb}
  <div class="search-result-body">
    <div class="search-result-meta">
      <a href="${escapeAttr(issueUrl)}" class="search-result-title">${escapeHtml(result.paper_title)}</a>
      <span class="search-result-date">${escapeHtml(dateLabel)}</span>
      ${result.location ? `<span class="search-result-location">${escapeHtml(result.location)}</span>` : ''}
      <span class="search-result-page">p.${result.page_num}</span>
    </div>
    <p class="search-result-excerpt">${result.excerpt}</p>
    <a href="${escapeAttr(issueUrl)}?page=${result.page_num}" class="search-result-link">View page →</a>
  </div>
</article>`;
}

export function searchResultsPage(
  query: string,
  results: SearchResult[],
  total: number,
  filters: SearchFilters,
  paperCounts: Map<string, { title: string; count: number }>,
  allPapers: Array<{ slug: string; title: string }>,
): string {
  const { fromYear = 1905, toYear = 1929, papers: selectedPapers = [], sort = 'relevance', page = 1 } = filters;

  const baseSearchUrl = buildSearchUrl(query, filters, { page: 1 });

  // Sidebar: date range
  const dateRangeSidebar = `<div class="filter-section">
  <h3 class="filter-heading">Date Range</h3>
  <div class="filter-date-range">
    <label class="filter-label" for="from-year">From</label>
    <input type="number" id="from-year" name="from" value="${fromYear}" min="1905" max="1929" class="filter-year-input">
    <label class="filter-label" for="to-year">To</label>
    <input type="number" id="to-year" name="to" value="${toYear}" min="1905" max="1929" class="filter-year-input">
  </div>
</div>`;

  // Sidebar: sort
  const sortSidebar = `<div class="filter-section">
  <h3 class="filter-heading">Sort By</h3>
  <div class="filter-sort">
    <label class="filter-radio">
      <input type="radio" name="sort" value="relevance" ${sort === 'relevance' ? 'checked' : ''}> Relevance
    </label>
    <label class="filter-radio">
      <input type="radio" name="sort" value="date-asc" ${sort === 'date-asc' ? 'checked' : ''}> Oldest first
    </label>
    <label class="filter-radio">
      <input type="radio" name="sort" value="date-desc" ${sort === 'date-desc' ? 'checked' : ''}> Newest first
    </label>
  </div>
</div>`;

  // Sidebar: paper checkboxes (show all with counts from facets)
  const paperCheckboxes = allPapers
    .map((p) => {
      const count = paperCounts.get(p.slug)?.count ?? 0;
      const checked = selectedPapers.includes(p.slug) ? 'checked' : '';
      const countBadge = count > 0 ? `<span class="filter-count">${count}</span>` : '';
      return `<label class="filter-checkbox ${count === 0 ? 'filter-checkbox--empty' : ''}">
      <input type="checkbox" name="paper" value="${escapeAttr(p.slug)}" ${checked}> ${escapeHtml(p.title)} ${countBadge}
    </label>`;
    })
    .join('\n');

  const papersSidebar = `<div class="filter-section">
  <h3 class="filter-heading">Newspapers</h3>
  <div class="filter-papers">
    ${paperCheckboxes}
  </div>
</div>`;

  // Results
  const resultCards = results.map(resultCard).join('\n');
  const paginationHtml = pagination(baseSearchUrl.replace('&page=1', '').replace('?page=1', ''), page, total, ITEMS_PER_PAGE);

  const resultCountText = total === 0
    ? `No results for "${escapeHtml(query)}"`
    : `${total.toLocaleString()} result${total !== 1 ? 's' : ''} for "${escapeHtml(query)}"`;

  const content = `
<div class="search-page">
  <div class="search-page-header">
    <form action="/search" method="get" class="search-form search-form--inline">
      <input type="search" name="q" value="${escapeAttr(query)}" placeholder="Search the archive..." class="search-input" aria-label="Search" autofocus>
      <button type="submit" class="search-button">Search</button>
    </form>
    <p class="search-result-count">${resultCountText}</p>
  </div>
  <div class="search-layout">
    <aside class="search-sidebar">
      <form action="/search" method="get" id="search-filters-form">
        <input type="hidden" name="q" value="${escapeAttr(query)}">
        ${dateRangeSidebar}
        ${sortSidebar}
        ${papersSidebar}
        <button type="submit" class="filter-apply-btn">Apply Filters</button>
      </form>
    </aside>
    <section class="search-results">
      ${total === 0
        ? `<div class="search-no-results">
            <p>No pages matched your search. Try different keywords or broaden the date range.</p>
           </div>`
        : resultCards
      }
      ${paginationHtml}
    </section>
  </div>
</div>
<script src="/search.js" defer></script>
`;

  return layout(
    {
      title: `Search: ${query}`,
      description: `Search results for "${query}" across the Dangerous Press archive of African American newspapers 1905–1929.`,
      bodyClass: 'search-page-body',
    },
    content,
  );
}
