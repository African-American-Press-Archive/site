export interface LayoutOptions {
  title: string;
  description?: string;
  ogImage?: string;
  canonicalUrl?: string;
  jsonLd?: object;
  bodyClass?: string;
}

export function layout(options: LayoutOptions, content: string): string {
  const { title, description, ogImage, canonicalUrl, jsonLd, bodyClass } = options;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — Dangerous Press</title>
  ${description ? `<meta name="description" content="${escapeAttr(description)}">` : ''}
  <meta property="og:title" content="${escapeAttr(title)}">
  ${description ? `<meta property="og:description" content="${escapeAttr(description)}">` : ''}
  ${ogImage ? `<meta property="og:image" content="${escapeAttr(ogImage)}">` : ''}
  <meta property="og:type" content="website">
  ${canonicalUrl ? `<link rel="canonical" href="${escapeAttr(canonicalUrl)}">` : ''}
  ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
  <link rel="stylesheet" href="/style.css">
  <link rel="icon" href="/favicon.svg">
</head>
<body class="${bodyClass ?? ''}">
  <nav class="site-nav">
    <div class="site-nav-inner">
      <a href="/" class="site-logo">Dangerous Press</a>
      <div class="site-nav-links">
        <a href="/papers">Papers</a>
        <a href="/about">About</a>
        <form action="/search" method="get" class="nav-search-form">
          <input type="search" name="q" placeholder="Search the archive..." class="nav-search-input" aria-label="Search">
        </form>
      </div>
    </div>
  </nav>
  <main>${content}</main>
  <footer class="site-footer">
    <p>Dangerous Press Archive — African American Newspapers, 1905–1929</p>
  </footer>
</body>
</html>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
