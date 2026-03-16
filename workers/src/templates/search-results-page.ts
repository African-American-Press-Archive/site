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

function resultCard(result: SearchResult, query: string): string {
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
    <a href="${escapeAttr(issueUrl)}?page=${result.page_num}&q=${encodeURIComponent(query)}" class="search-result-link">View page →</a>
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
  yearCounts: { year: number; count: number }[] = [],
): string {
  const { fromYear = 1905, toYear = 1929, papers: selectedPapers = [], sort = 'relevance', page = 1 } = filters;

  const baseSearchUrl = buildSearchUrl(query, filters, { page: 1 });

  // Build year histogram — always show all years 1905-1929
  const yearMap = new Map(yearCounts.map((y) => [y.year, y.count]));
  const maxCount = Math.max(1, ...yearCounts.map((y) => y.count));
  const allYears = Array.from({ length: 25 }, (_, i) => 1905 + i);
  const histogramBars = allYears.map((year) => {
    const count = yearMap.get(year) ?? 0;
    const heightPct = count > 0 ? Math.max(4, Math.round((count / maxCount) * 50)) : 0;
    const inRange = year >= fromYear && year <= toYear;
    const activeClass = inRange ? 'year-bar-active' : 'year-bar-dim';
    const tooltip = count > 0 ? `${year}: ${count} result${count !== 1 ? 's' : ''}` : `${year}: 0`;
    return `<div class="year-bar-col ${activeClass}" title="${tooltip}" data-year="${year}">
      <div class="year-bar" style="height:${heightPct}px"></div>
    </div>`;
  }).join('');

  const yearLabels = allYears
    .filter((y) => y % 5 === 0 || y === 1929)
    .map((y) => `<span class="year-label">${y}</span>`)
    .join('');

  // Sidebar: date range histogram + hidden inputs
  const dateRangeSidebar = `<div class="filter-section">
  <h3 class="filter-heading">Date Range</h3>
  <div class="year-histogram">
    <div class="year-histogram-bars">${histogramBars}</div>
    <div class="year-histogram-labels">${yearLabels}</div>
    <div class="year-histogram-range">
      <input type="range" id="from-year-range" min="1905" max="1929" value="${fromYear}" class="year-range-input">
      <input type="range" id="to-year-range" min="1905" max="1929" value="${toYear}" class="year-range-input">
    </div>
    <div class="year-range-display">
      <span id="from-year-display">${fromYear}</span> – <span id="to-year-display">${toYear}</span>
    </div>
  </div>
  <input type="hidden" id="from-year" name="from" value="${fromYear}">
  <input type="hidden" id="to-year" name="to" value="${toYear}">
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
  const resultCards = results.map((r) => resultCard(r, query)).join('\n');
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
