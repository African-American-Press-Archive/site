export function pagination(basePath: string, currentPage: number, totalItems: number, itemsPerPage: number): string {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (totalPages <= 1) return '';
  const sep = basePath.includes('?') ? '&' : '?';
  const pageUrl = (p: number) => `${basePath}${sep}page=${p}`;
  const pages: string[] = [];
  if (currentPage > 1) pages.push(`<a href="${pageUrl(currentPage - 1)}" class="pagination-link">← Prev</a>`);
  const show = new Set<number>();
  show.add(1); show.add(totalPages);
  for (let i = Math.max(1, currentPage - 1); i <= Math.min(totalPages, currentPage + 1); i++) show.add(i);
  let prev = 0;
  for (const p of [...show].sort((a, b) => a - b)) {
    if (p - prev > 1) pages.push('<span class="pagination-ellipsis">...</span>');
    if (p === currentPage) pages.push(`<span class="pagination-current">${p}</span>`);
    else pages.push(`<a href="${pageUrl(p)}" class="pagination-link">${p}</a>`);
    prev = p;
  }
  if (currentPage < totalPages) pages.push(`<a href="${pageUrl(currentPage + 1)}" class="pagination-link">Next →</a>`);
  return `<nav class="pagination" aria-label="Pagination">${pages.join('')}</nav>`;
}
