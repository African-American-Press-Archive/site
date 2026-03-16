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

  // Page thumbnails with data-image-url for viewer JS
  const pageThumbs = pages.map((p) => {
    const isActive = p.page_num === pageNum;
    const href = `/papers/${paper.slug}/${issue.date}${p.page_num > 1 ? `?page=${p.page_num}` : ''}`;
    const thumb = p.thumbnail_url ?? p.image_url;
    return `<a href="${escapeAttr(href)}" class="page-thumb${isActive ? ' active' : ''}" data-page="${p.page_num}" data-image-url="${escapeAttr(p.image_url)}">
      <img src="${escapeAttr(thumb)}" alt="Page ${p.page_num}" loading="lazy">
      <span class="page-thumb-num">${p.page_num}</span>
    </a>`;
  }).join('');

  // OCR text from the requested page (hidden from search snippets)
  const activePage = pages.find((p) => p.page_num === pageNum) ?? pages[0];
  const ocrText = activePage?.ocr_text ?? '';
  const ocrHtml = ocrText
    ? `<div class="ocr-text" data-nosnippet>${escapeHtml(ocrText)}</div>`
    : '';

  // Prev/next navigation
  const prevHtml = prev
    ? `<a href="/papers/${paper.slug}/${prev.date}" class="issue-nav-link prev">← ${formatDateMedium(prev.date)}</a>`
    : '<span class="issue-nav-link prev disabled"></span>';
  const nextHtml = next
    ? `<a href="/papers/${paper.slug}/${next.date}" class="issue-nav-link next">${formatDateMedium(next.date)} →</a>`
    : '<span class="issue-nav-link next disabled"></span>';

  // Active page image
  const activeImageUrl = activePage?.image_url ?? '';

  const content = `
    ${crumbs}
    <div class="issue-header">
      <div class="issue-header-text">
        <h1>${escapeHtml(paper.title)}</h1>
        <p class="issue-date">${displayDate}</p>
        <p class="issue-meta">${issue.page_count} page${issue.page_count !== 1 ? 's' : ''}</p>
      </div>
      ${paper.thumbnail_url ? `<div class="paper-masthead-small"><img src="${escapeAttr(paper.thumbnail_url)}" alt="${escapeAttr(paper.title)}" loading="lazy"></div>` : ''}
    </div>
    <div class="issue-viewer" id="issue-viewer" data-paper="${escapeAttr(paper.slug)}" data-date="${escapeAttr(issue.date)}" data-page="${pageNum}" data-page-count="${issue.page_count}">
      <div class="viewer-main">
        <div class="viewer-image-wrap">
          <img id="viewer-image" src="${escapeAttr(activeImageUrl)}" alt="${escapeAttr(paper.title)}, ${escapeAttr(displayDate)}, page ${pageNum}" class="viewer-image">
        </div>
        <div class="viewer-thumbs" id="viewer-thumbs">
          ${pageThumbs}
        </div>
      </div>
    </div>
    <nav class="issue-nav">
      ${prevHtml}
      <a href="/papers/${escapeAttr(paper.slug)}" class="issue-nav-link paper-link">All issues</a>
      ${nextHtml}
    </nav>
    ${ocrHtml}
    <script src="/viewer.js" defer></script>
  `;

  const ogImage = activePage?.thumbnail_url ?? activePage?.image_url ?? paper.thumbnail_url ?? undefined;
  const description = `${paper.title}, ${displayDate}. ${issue.page_count} pages. ${issue.ocr_excerpt ? issue.ocr_excerpt.slice(0, 120) + '…' : ''}`;

  const canonicalUrl = `https://dangerouspress.com/papers/${paper.slug}/${issue.date}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: `${paper.title} — ${displayDate}`,
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
      title: `${paper.title} — ${displayDateMedium}`,
      description,
      ogImage,
      canonicalUrl,
      jsonLd,
      bodyClass: 'issue-page',
    },
    content,
  );
}
