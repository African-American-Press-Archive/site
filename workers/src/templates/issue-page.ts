import type { Paper, Issue, Page } from '../types';
import { layout, escapeHtml, escapeAttr } from './layout';
import { breadcrumb } from './components/breadcrumb';
import { formatDateLong, formatDateMedium } from './components/date-fmt';

export function issuePage(
  paper: Paper,
  issue: Issue,
  pages: Page[],
  prev: Issue | null,
  next: Issue | null,
  pageNum: number = 1,
): string {
  const displayDate = formatDateLong(issue.date);
  const displayDateMedium = formatDateMedium(issue.date);

  const crumbs = breadcrumb([
    { label: 'Papers', href: '/papers' },
    { label: paper.title, href: `/papers/${paper.slug}` },
    { label: displayDateMedium },
  ]);

  // Preserve search query for deep-linking into viewer
  const queryParam = typeof globalThis !== 'undefined' ? '' : '';

  // Page cards — playing-card sized thumbnails in a grid
  const pageCards = pages.map((p) => {
    const thumb = p.thumbnail_url ?? p.image_url;
    return `<a href="/papers/${paper.slug}/${issue.date}?page=${p.page_num}" class="issue-page-card" data-page="${p.page_num}" data-image-url="${escapeAttr(p.image_url)}">
      <div class="issue-page-card-img">
        <img src="${escapeAttr(thumb)}" alt="Page ${p.page_num}" loading="lazy">
      </div>
      <span class="issue-page-card-label">Page ${p.page_num}</span>
    </a>`;
  }).join('');

  // OCR text for SEO (hidden, accessible to crawlers)
  const allOcrText = pages
    .filter((p) => p.ocr_text)
    .map((p) => p.ocr_text)
    .join('\n\n');
  const ocrHtml = allOcrText
    ? `<details class="ocr-text-seo" data-nosnippet><summary class="ocr-text-seo-toggle">Page text (machine-generated)</summary><div class="ocr-text-seo-content">${escapeHtml(allOcrText)}</div></details>`
    : '';

  // Prev/next navigation
  const prevHtml = prev
    ? `<a href="/papers/${paper.slug}/${prev.date}" class="issue-nav-link prev">\u2190 ${formatDateMedium(prev.date)}</a>`
    : '<span class="issue-nav-link prev disabled"></span>';
  const nextHtml = next
    ? `<a href="/papers/${paper.slug}/${next.date}" class="issue-nav-link next">${formatDateMedium(next.date)} \u2192</a>`
    : '<span class="issue-nav-link next disabled"></span>';

  const content = `
    ${crumbs}
    <div class="issue-header">
      <div class="issue-header-text">
        <h1>${escapeHtml(paper.title)}</h1>
        <p class="issue-date">${displayDate}</p>
        ${paper.location ? `<p class="issue-location">${escapeHtml(paper.location)}</p>` : ''}
        <p class="issue-meta">${issue.page_count} page${issue.page_count !== 1 ? 's' : ''}</p>
      </div>
    </div>
    <div class="issue-page-grid">
      ${pageCards}
    </div>
    <nav class="issue-nav">
      ${prevHtml}
      <a href="/papers/${escapeAttr(paper.slug)}" class="issue-nav-link paper-link">All issues</a>
      ${nextHtml}
    </nav>
    ${ocrHtml}
    <button id="open-viewer" class="open-viewer-btn hidden" data-initial-page="${pageNum}"></button>
    <script src="/viewer.js" defer></script>
  `;

  const ogImage = pages[0]?.thumbnail_url ?? pages[0]?.image_url ?? paper.thumbnail_url ?? undefined;
  const description = `${paper.title}, ${displayDate}. ${issue.page_count} pages. ${issue.ocr_excerpt ? issue.ocr_excerpt.slice(0, 120) + '\u2026' : ''}`;
  const canonicalUrl = `https://dangerouspress.org/papers/${paper.slug}/${issue.date}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: `${paper.title} \u2014 ${displayDate}`,
    datePublished: issue.date,
    isPartOf: {
      '@type': 'Periodical',
      name: paper.title,
    },
    publisher: {
      '@type': 'Organization',
      name: paper.title,
    },
    url: canonicalUrl,
    ...(ogImage ? { image: ogImage } : {}),
    ...(issue.ocr_excerpt ? { description: issue.ocr_excerpt } : {}),
  };

  return layout(
    {
      title: `${paper.title} \u2014 ${displayDateMedium}`,
      description,
      ogImage,
      canonicalUrl,
      jsonLd,
      bodyClass: 'issue-page',
    },
    content,
  );
}
