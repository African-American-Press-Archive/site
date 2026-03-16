export interface BreadcrumbItem { label: string; href?: string; }

export function breadcrumb(items: BreadcrumbItem[]): string {
  const parts = items.map((item, i) => {
    if (i === items.length - 1 || !item.href) return `<span class="breadcrumb-current">${item.label}</span>`;
    return `<a href="${item.href}" class="breadcrumb-link">${item.label}</a>`;
  });
  return `<nav class="breadcrumb" aria-label="Breadcrumb">${parts.join(' <span class="breadcrumb-sep">›</span> ')}</nav>`;
}
