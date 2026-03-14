# Archive Browsing UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the filter bar with a paper gallery, paper detail view with timeline scrubber, and improved cross-paper date browse — creating a three-level navigation flow for the archive.

**Architecture:** This is a vanilla JS single-page app with no build system. All new code lives in dedicated JS files (`paper-data.js`, `timeline-scrubber.js`, `paper-gallery.js`, `paper-detail.js`, `date-browse.js`, `browse-router.js`) loaded via `<script>` tags. The existing `app.js` is modified to delegate to the new router instead of the old filter system. `filters.js` is retired. HTML sections are added to `index.html` for each view.

**Tech Stack:** Vanilla JavaScript (ES6+), HTML5, CSS3 with Tailwind utility classes, no build tools

**Spec:** `docs/superpowers/specs/2026-03-14-archive-browsing-ux-design.md`

**Cross-file runtime dependencies:** The new JS files (`paper-data.js`, `paper-gallery.js`, `paper-detail.js`, `date-browse.js`) call functions defined in `app.js` (`resolveAssetPath()`, `getDisplayTitle()`, `createIssueCard()`) and reference its globals (`state`, `CONFIG`). This is safe because these functions are only called at runtime (after all scripts load), not at parse time. The script load order ensures `app.js` is parsed last.

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `paper-data.js` | Paper metadata: slug maps, city/state lookup, per-paper stats computed from manifest | Create |
| `timeline-scrubber.js` | Reusable timeline bar chart component (used in paper detail and date browse) | Create |
| `paper-gallery.js` | Paper gallery view: card grid, search, sort | Create |
| `paper-detail.js` | Paper detail view: header, timeline, month pills, filtered issue grid | Create |
| `date-browse.js` | Cross-paper date browse view: timeline, month pills, paper dropdown, issue grid | Create |
| `browse-router.js` | URL routing, history management, view transitions, popstate handler | Create |
| `index.html` | Add DOM sections for gallery, paper detail, date browse; remove old filter bar HTML | Modify |
| `style.css` | Add styles for new components; remove old filter bar styles | Modify |
| `app.js` | Remove old filter/timeline code; delegate to router after manifest load | Modify |
| `filters.js` | Retire (stop loading in index.html) | Remove reference |

**Load order in index.html:**
```html
<script src="paper-data.js"></script>
<script src="timeline-scrubber.js"></script>
<script src="paper-gallery.js"></script>
<script src="paper-detail.js"></script>
<script src="date-browse.js"></script>
<script src="browse-router.js"></script>
<script src="app.js"></script>
```

---

## Chunk 1: Data Layer & Timeline Scrubber

### Task 1: Create paper-data.js — Paper Metadata & Slug Maps

**Files:**
- Create: `paper-data.js`

This module provides all paper metadata needed by the gallery and detail views. It loads `web_content/manifests/index.json` for slugs and computes per-paper stats from the main manifest.

- [ ] **Step 1: Create paper-data.js with PAPER_LOCATIONS and initialization**

```javascript
// paper-data.js — Paper metadata: slugs, locations, per-paper stats

const PaperData = {
    // Bidirectional slug lookups (populated from index.json)
    slugToTitle: new Map(),
    titleToSlug: new Map(),

    // Per-paper computed stats (populated from manifest)
    // Map<title, { slug, location, dateRange, issueCount, firstThumb, yearCounts }>
    papers: new Map(),

    LOCATIONS: Object.freeze({
        'Amsterdam News': 'New York, New York',
        'Athens Republique': 'Athens, Georgia',
        'Baltimore Afro-American': 'Baltimore, Maryland',
        'Broad Ax': 'Chicago, Illinois',
        'California Eagle': 'Los Angeles, California',
        'Chicago Defender': 'Chicago, Illinois',
        'Chicago Whip': 'Chicago, Illinois',
        'Cleveland Gazette': 'Cleveland, Ohio',
        'Colorado Statesman': 'Denver, Colorado',
        'Dallas Express': 'Dallas, Texas',
        'Denver Star': 'Denver, Colorado',
        'Gary American': 'Gary, Indiana',
        'Houston Informer': 'Houston, Texas',
        'Indianapolis Freeman': 'Indianapolis, Indiana',
        'Iowa Bystander': 'Des Moines, Iowa',
        'Kansas City Advocate': 'Kansas City, Kansas',
        'Kansas City Sun': 'Kansas City, Missouri',
        'Metropolis Weekly Gazette': 'Metropolis, Illinois',
        'Montana Plaindealer': 'Helena, Montana',
        'Muskogee Cimeter': 'Muskogee, Oklahoma',
        'Nashville Globe': 'Nashville, Tennessee',
        'Negro World': 'New York, New York',
        'New York Age': 'New York, New York',
        'Norfolk Journal and Guide': 'Norfolk, Virginia',
        'Omaha Monitor': 'Omaha, Nebraska',
        'Phoenix Tribune': 'Phoenix, Arizona',
        'Pittsburgh Courier': 'Pittsburgh, Pennsylvania',
        'Portland New Age': 'Portland, Oregon',
        'Raleigh Independent': 'Raleigh, North Carolina',
        'Richmond Planet': 'Richmond, Virginia',
        "Seattle Cayton's Weekly": 'Seattle, Washington',
        'Springfield Forum': 'Springfield, Illinois',
        'St. Louis Argus': 'St. Louis, Missouri',
        'St. Paul Appeal': 'St. Paul, Minnesota',
        'Tulsa Star': 'Tulsa, Oklahoma',
        'Twin City Star': 'Minneapolis, Minnesota',
        'Washington Bee': 'Washington, D.C.',
        'Washington Tribune': 'Washington, D.C.',
        'Western Outlook': 'Oakland, California',
        'Wichita Searchlight': 'Wichita, Kansas',
        'Wisconsin Weekly Blade': 'Milwaukee, Wisconsin',
    }),

    /**
     * Load slug mappings from index.json
     */
    async loadSlugs() {
        try {
            const response = await fetch('web_content/manifests/index.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            for (const paper of data.papers) {
                this.slugToTitle.set(paper.slug, paper.title);
                this.titleToSlug.set(paper.title, paper.slug);
            }
        } catch (error) {
            console.warn('Failed to load paper slugs:', error);
            // Fallback: generate slugs from titles in manifest
            // This is less reliable but prevents total failure
        }
    },

    /**
     * Compute per-paper stats from loaded manifest issues.
     * Call after state.allIssues is populated.
     * @param {Array} allIssues - The full manifest issue array
     */
    computeStats(allIssues) {
        // Group issues by paper title
        const byTitle = new Map();
        for (const issue of allIssues) {
            if (!byTitle.has(issue.title)) {
                byTitle.set(issue.title, []);
            }
            byTitle.get(issue.title).push(issue);
        }

        this.papers.clear();

        for (const [title, issues] of byTitle) {
            // Sort by date to get range and first thumbnail
            issues.sort((a, b) => a.date.localeCompare(b.date));

            const firstDate = issues[0].date;
            const lastDate = issues[issues.length - 1].date;
            const firstYear = firstDate.slice(0, 4);
            const lastYear = lastDate.slice(0, 4);

            // Year counts for timeline
            const yearCounts = new Map();
            for (const issue of issues) {
                const year = parseInt(issue.date.slice(0, 4), 10);
                yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
            }

            // First issue thumb (deterministic)
            const firstThumb = resolveAssetPath(issues[0].issue_thumb);

            this.papers.set(title, {
                slug: this.titleToSlug.get(title) || title.toLowerCase().replace(/[.\s]+/g, '-').replace(/'/g, ''),
                location: this.LOCATIONS[title] || '',
                dateRange: `${firstYear}–${lastYear}`,
                firstYear,
                lastYear,
                issueCount: issues.length,
                firstThumb,
                yearCounts,
                issues,
            });
        }
    },

    /**
     * Get sorted array of paper info objects for the gallery.
     * @param {string} sortBy - 'count' (default) or 'alpha'
     * @returns {Array<{title, slug, location, dateRange, issueCount, firstThumb}>}
     */
    getSortedPapers(sortBy = 'count') {
        const papers = Array.from(this.papers.entries()).map(([title, data]) => ({
            title: getDisplayTitle(title),
            canonicalTitle: title,
            ...data,
        }));

        if (sortBy === 'alpha') {
            papers.sort((a, b) => a.title.localeCompare(b.title));
        } else {
            papers.sort((a, b) => b.issueCount - a.issueCount);
        }

        return papers;
    },

    /**
     * Look up paper by slug. Returns null if not found.
     */
    getBySlug(slug) {
        const title = this.slugToTitle.get(slug);
        if (!title) return null;
        const data = this.papers.get(title);
        if (!data) return null;
        return { title: getDisplayTitle(title), canonicalTitle: title, ...data };
    },
};
```

- [ ] **Step 2: Verify file loads without errors**

Open `http://localhost:8765/index.html` in browser, check console for syntax errors from paper-data.js. (Script tag not added yet — just verify the file is valid JS by loading it directly or checking syntax.)

```bash
node --check paper-data.js
```

Expected: no output (syntax OK)

- [ ] **Step 3: Commit**

```bash
git add paper-data.js
git commit -m "feat: add paper-data.js with slug maps, locations, and per-paper stats"
```

---

### Task 2: Create timeline-scrubber.js — Reusable Timeline Component

**Files:**
- Create: `timeline-scrubber.js`

Renders a horizontal bar chart showing issue density by year. Used in both paper detail and date browse views.

- [ ] **Step 1: Create timeline-scrubber.js**

```javascript
// timeline-scrubber.js — Reusable timeline bar chart component

const TimelineScrubber = {
    MAX_BAR_HEIGHT: 60,
    MIN_BAR_HEIGHT: 4,
    YEAR_MIN: 1905,
    YEAR_MAX: 1929,

    /**
     * Render the timeline scrubber into a container element.
     * @param {HTMLElement} container - The element to render into
     * @param {Map<number, number>} yearCounts - Map of year -> issue count
     * @param {object} options
     * @param {number|null} options.selectedYear - Currently selected year
     * @param {string} options.label - Label text (e.g., "Timeline" or "Timeline — All Papers")
     * @param {number} options.totalIssues - Total issue count to display
     * @param {function} options.onYearSelect - Callback(year) when a year is clicked
     */
    render(container, yearCounts, options = {}) {
        const {
            selectedYear = null,
            label = 'Timeline',
            totalIssues = 0,
            onYearSelect = () => {},
        } = options;

        const maxCount = Math.max(...Array.from(yearCounts.values()), 1);

        // Build bars HTML
        let barsHtml = '';
        let labelsHtml = '';

        for (let year = this.YEAR_MIN; year <= this.YEAR_MAX; year++) {
            const count = yearCounts.get(year) || 0;
            const isSelected = year === selectedYear;

            let heightPx = 0;
            if (count > 0) {
                heightPx = Math.max(
                    this.MIN_BAR_HEIGHT,
                    Math.round((count / maxCount) * this.MAX_BAR_HEIGHT)
                );
            }

            const barColor = isSelected
                ? 'var(--unc-longleaf-pine)'
                : count > 0 ? '#c4ddd9' : 'transparent';

            const cursor = count > 0 ? 'cursor:pointer;' : '';
            const yearShort = String(year).slice(2);
            const labelColor = isSelected ? 'color:var(--unc-longleaf-pine);font-weight:600;' : 'color:#aaa;';

            barsHtml += `<div class="timeline-bar-col" data-year="${year}" data-count="${count}"
                style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;${cursor}"
                title="${count > 0 ? year + ' — ' + count + ' issue' + (count !== 1 ? 's' : '') : year + ' — no issues'}"
                ${count > 0 ? `role="option" tabindex="0" aria-label="${year}, ${count} issues${isSelected ? ', selected' : ''}" aria-selected="${isSelected}"` : ''}>
                <div class="timeline-bar" style="width:100%;border-radius:2px 2px 0 0;height:${heightPx}px;background:${barColor};transition:background 0.15s,height 0.15s;"></div>
            </div>`;

            labelsHtml += `<div style="flex:1;text-align:center;font-size:10px;${labelColor}">${yearShort}</div>`;
        }

        container.innerHTML = `
            <div class="timeline-scrubber" style="background:white;border-radius:10px;padding:16px 20px;border:1px solid #e8e0d4;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <span style="font-size:12px;font-weight:600;color:var(--unc-longleaf-pine);text-transform:uppercase;letter-spacing:0.5px;">${label}</span>
                    <span style="font-size:12px;color:var(--text-muted);">${totalIssues.toLocaleString()} issues total</span>
                </div>
                <div class="timeline-bars" style="display:flex;align-items:flex-end;gap:2px;height:${this.MAX_BAR_HEIGHT}px;margin-bottom:4px;" role="listbox" aria-label="Select year">
                    ${barsHtml}
                </div>
                <div class="timeline-labels" style="display:flex;gap:2px;">
                    ${labelsHtml}
                </div>
            </div>
        `;

        // Click handlers
        container.querySelectorAll('.timeline-bar-col[data-count]').forEach(col => {
            const count = parseInt(col.dataset.count, 10);
            if (count === 0) return;

            const year = parseInt(col.dataset.year, 10);
            col.addEventListener('click', () => {
                // Toggle: if already selected, deselect (pass null)
                onYearSelect(year === selectedYear ? null : year);
            });
            col.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onYearSelect(year === selectedYear ? null : year);
                }
            });
        });
    },
};
```

- [ ] **Step 2: Verify syntax**

```bash
node --check timeline-scrubber.js
```

Expected: no output (syntax OK)

- [ ] **Step 3: Commit**

```bash
git add timeline-scrubber.js
git commit -m "feat: add timeline-scrubber.js reusable bar chart component"
```

---

### Task 3: Add Month Pills Renderer (shared utility)

Month pills are used identically in both paper detail and date browse views. Add a shared rendering function to `timeline-scrubber.js` since it's closely related.

**Files:**
- Modify: `timeline-scrubber.js`

- [ ] **Step 1: Add renderMonthPills to TimelineScrubber**

Append to `timeline-scrubber.js`:

```javascript
/**
 * Render month pills into a container.
 * @param {HTMLElement} container - Element to render into
 * @param {Array} issues - Issues for the selected year
 * @param {object} options
 * @param {string|null} options.selectedMonth - Currently selected month ('01'-'12')
 * @param {function} options.onMonthSelect - Callback(monthValue) when a pill is clicked
 */
TimelineScrubber.renderMonthPills = function(container, issues, options = {}) {
    const { selectedMonth = null, onMonthSelect = () => {} } = options;

    const MONTHS = [
        { value: '01', label: 'Jan' }, { value: '02', label: 'Feb' },
        { value: '03', label: 'Mar' }, { value: '04', label: 'Apr' },
        { value: '05', label: 'May' }, { value: '06', label: 'Jun' },
        { value: '07', label: 'Jul' }, { value: '08', label: 'Aug' },
        { value: '09', label: 'Sep' }, { value: '10', label: 'Oct' },
        { value: '11', label: 'Nov' }, { value: '12', label: 'Dec' },
    ];

    // Count issues per month
    const monthCounts = new Map();
    for (const issue of issues) {
        const month = issue.date.slice(5, 7);
        monthCounts.set(month, (monthCounts.get(month) || 0) + 1);
    }

    let html = '<div class="month-pills" style="display:flex;gap:6px;flex-wrap:wrap;">';

    for (const m of MONTHS) {
        const count = monthCounts.get(m.value) || 0;
        if (count === 0) continue;

        const isSelected = m.value === selectedMonth;
        const bg = isSelected ? 'var(--unc-longleaf-pine)' : '#e8e0d4';
        const color = isSelected ? 'white' : 'var(--text-muted)';
        const weight = isSelected ? 'font-weight:500;' : '';

        html += `<button class="month-pill" data-month="${m.value}"
            style="padding:4px 12px;border-radius:16px;font-size:12px;background:${bg};color:${color};${weight}border:none;cursor:pointer;transition:background 0.15s,color 0.15s;"
            aria-pressed="${isSelected}">${m.label} (${count})</button>`;
    }

    html += '</div>';
    container.innerHTML = html;

    // Click handlers
    container.querySelectorAll('.month-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const month = pill.dataset.month;
            onMonthSelect(month === selectedMonth ? null : month);
        });
    });
};
```

- [ ] **Step 2: Verify syntax**

```bash
node --check timeline-scrubber.js
```

- [ ] **Step 3: Commit**

```bash
git add timeline-scrubber.js
git commit -m "feat: add month pills renderer to timeline-scrubber.js"
```

---

## Chunk 2: Paper Gallery View

### Task 4: Add Paper Gallery HTML to index.html

**Files:**
- Modify: `index.html`

Add the paper gallery DOM section. Also add the paper detail and date browse sections as hidden placeholders (they'll be populated by JS).

- [ ] **Step 1: Add new view sections to index.html**

Find the closing `</section>` of the filter bar section (the one with class `filter-bar-section`). After the `<!-- Empty state -->` div and before the `grid-header` div, we need to restructure. But more practically: add three new sections right after the hero section and replace the filter-bar-section.

Replace the entire `<section class="filter-bar-section ...">` block with the new gallery, paper detail, and date browse sections:

```html
                    <!-- Paper Gallery (default browse view) -->
                    <section id="paper-gallery-section" class="hidden">
                        <div class="flex items-center justify-between mb-4">
                            <h2 class="text-xl font-bold" style="color: var(--unc-longleaf-pine);">Browse by Paper</h2>
                            <a href="#" id="browse-by-date-link" class="text-sm transition-colors deco-link" style="color: var(--unc-tile-teal);">Browse all issues by date →</a>
                        </div>
                        <div class="mb-4">
                            <input type="text" id="gallery-search" placeholder="Search papers..."
                                class="w-full max-w-sm px-4 py-2.5 rounded-lg text-sm transition-all"
                                style="border: 1px solid var(--border-color); background: white; color: var(--text-primary);" />
                        </div>
                        <div class="flex items-center justify-between mb-4">
                            <span id="gallery-count" class="text-sm" style="color: var(--text-muted);"></span>
                            <select id="gallery-sort" class="px-3 py-1.5 rounded-lg text-sm" style="border: 1px solid var(--border-color); background: white; color: var(--text-secondary);">
                                <option value="count">Most Issues</option>
                                <option value="alpha">Alphabetical</option>
                            </select>
                        </div>
                        <div id="paper-gallery-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"></div>
                    </section>

                    <!-- Paper Detail View -->
                    <section id="paper-detail-section" class="hidden">
                        <nav id="paper-detail-breadcrumb" class="text-sm mb-4" style="color: var(--text-muted);"></nav>
                        <div id="paper-detail-header" class="mb-4"></div>
                        <div id="paper-detail-timeline" class="mb-4"></div>
                        <div id="paper-detail-months" class="mb-4"></div>
                        <div id="paper-detail-result-header" class="flex items-center justify-between mb-4"></div>
                        <div id="paper-detail-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"></div>
                        <div id="paper-detail-load-more" class="h-20 flex items-center justify-center hidden">
                            <div class="loading-spinner hidden">
                                <div class="w-8 h-8 border-4 rounded-full animate-spin" style="border-color: var(--border-color); border-top-color: var(--unc-tile-teal);"></div>
                            </div>
                        </div>
                    </section>

                    <!-- Cross-Paper Date Browse View -->
                    <section id="date-browse-section" class="hidden">
                        <nav id="date-browse-breadcrumb" class="text-sm mb-4" style="color: var(--text-muted);"></nav>
                        <div id="date-browse-timeline" class="mb-4"></div>
                        <div class="flex justify-between items-start gap-4 flex-wrap mb-4">
                            <div id="date-browse-months" class="flex-1"></div>
                            <div id="date-browse-paper-filter" class="relative"></div>
                        </div>
                        <div id="date-browse-result-header" class="flex items-center justify-between mb-4"></div>
                        <div id="date-browse-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"></div>
                        <div id="date-browse-load-more" class="h-20 flex items-center justify-center hidden">
                            <div class="loading-spinner hidden">
                                <div class="w-8 h-8 border-4 rounded-full animate-spin" style="border-color: var(--border-color); border-top-color: var(--unc-tile-teal);"></div>
                            </div>
                        </div>
                    </section>
```

- [ ] **Step 2: Add script tags for new JS files**

Before the existing `<script src="app.js">` tag, add:

```html
    <script src="paper-data.js"></script>
    <script src="timeline-scrubber.js"></script>
    <script src="paper-gallery.js"></script>
    <script src="paper-detail.js"></script>
    <script src="date-browse.js"></script>
    <script src="browse-router.js"></script>
```

Remove the `<script src="filters.js">` tag.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add HTML sections for paper gallery, detail, and date browse views"
```

---

### Task 5: Create paper-gallery.js — Gallery View

**Files:**
- Create: `paper-gallery.js`

- [ ] **Step 1: Create paper-gallery.js**

```javascript
// paper-gallery.js — Paper gallery view: card grid, search, sort

const PaperGallery = {
    currentSort: 'count',
    searchQuery: '',

    /**
     * Initialize the gallery. Call after PaperData.computeStats().
     */
    init() {
        this.setupEventListeners();
        this.render();
    },

    setupEventListeners() {
        const searchInput = document.getElementById('gallery-search');
        const sortSelect = document.getElementById('gallery-sort');

        if (searchInput) {
            let timeout;
            searchInput.addEventListener('input', () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.searchQuery = searchInput.value.trim().toLowerCase();
                    this.render();
                }, 200);
            });
        }

        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                this.currentSort = sortSelect.value;
                this.render();
            });
        }
    },

    render() {
        const grid = document.getElementById('paper-gallery-grid');
        const countEl = document.getElementById('gallery-count');
        if (!grid) return;

        let papers = PaperData.getSortedPapers(this.currentSort);

        // Filter by search query
        if (this.searchQuery) {
            papers = papers.filter(p =>
                p.title.toLowerCase().includes(this.searchQuery) ||
                p.location.toLowerCase().includes(this.searchQuery)
            );
        }

        if (countEl) {
            countEl.textContent = `${papers.length} of ${PaperData.papers.size} papers`;
        }

        grid.innerHTML = papers.map(paper => this.createCard(paper)).join('');

        // Click handlers
        grid.querySelectorAll('.paper-gallery-card').forEach(card => {
            card.addEventListener('click', () => {
                const slug = card.dataset.slug;
                if (slug && window.BrowseRouter) {
                    BrowseRouter.navigateTo('paper', { paper: slug });
                }
            });
        });
    },

    createCard(paper) {
        return `
            <article class="paper-gallery-card glass-card rounded-xl overflow-hidden cursor-pointer transition-all"
                     data-slug="${paper.slug}"
                     style="border: 1px solid var(--border-color);">
                <div class="paper-gallery-masthead" style="height:80px;overflow:hidden;background:rgba(79,117,139,0.1);">
                    <img src="${paper.firstThumb}"
                         alt="${paper.title} masthead"
                         loading="lazy"
                         style="width:100%;height:200%;object-fit:cover;object-position:top;" />
                </div>
                <div class="p-4">
                    <h3 class="text-base font-semibold mb-1" style="color: var(--text-primary); font-family: var(--font-display);">
                        ${paper.title}
                    </h3>
                    <p class="text-sm mb-3" style="color: var(--text-muted);">${paper.location}</p>
                    <div class="flex justify-between items-center">
                        <span class="text-xs font-medium" style="color: var(--unc-longleaf-pine);">${paper.dateRange}</span>
                        <span class="text-xs px-2 py-0.5 rounded-full" style="background: var(--bg-hover); color: var(--text-muted);">
                            ${paper.issueCount.toLocaleString()} issues
                        </span>
                    </div>
                </div>
            </article>
        `;
    },

    /**
     * Show the gallery section, hide others.
     */
    show() {
        document.getElementById('paper-gallery-section')?.classList.remove('hidden');
    },

    hide() {
        document.getElementById('paper-gallery-section')?.classList.add('hidden');
    },
};
```

- [ ] **Step 2: Verify syntax**

```bash
node --check paper-gallery.js
```

- [ ] **Step 3: Commit**

```bash
git add paper-gallery.js
git commit -m "feat: add paper-gallery.js with card grid, search, and sort"
```

---

### Task 6: Add gallery CSS styles

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Add gallery card styles to style.css**

Append to the end of `style.css`:

```css
/* ==================== PAPER GALLERY ==================== */

.paper-gallery-card {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.paper-gallery-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.paper-gallery-masthead img {
    transition: transform 0.3s ease;
}

.paper-gallery-card:hover .paper-gallery-masthead img {
    transform: scale(1.05);
}

/* ==================== TIMELINE SCRUBBER ==================== */

.timeline-bar-col:hover .timeline-bar {
    opacity: 0.8;
}

.timeline-bar-col[data-count="0"] {
    pointer-events: none;
}

/* ==================== MONTH PILLS ==================== */

.month-pill:hover {
    opacity: 0.85;
}

/* ==================== BREADCRUMB ==================== */

.browse-breadcrumb a {
    color: var(--unc-tile-teal);
    text-decoration: none;
    transition: color 0.15s;
}

.browse-breadcrumb a:hover {
    color: var(--unc-longleaf-pine);
}

.browse-breadcrumb .separator {
    margin: 0 6px;
    color: var(--text-muted);
}

/* ==================== PAPER DETAIL HEADER ==================== */

.paper-detail-header {
    display: flex;
    gap: 16px;
    align-items: flex-start;
}

.paper-detail-masthead {
    width: 120px;
    height: 60px;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
    border: 1px solid var(--border-color);
}

.paper-detail-masthead img {
    width: 100%;
    height: 200%;
    object-fit: cover;
    object-position: top;
}

/* ==================== PAPER FILTER DROPDOWN ==================== */

.paper-filter-dropdown {
    position: absolute;
    right: 0;
    top: 100%;
    margin-top: 4px;
    width: 300px;
    max-height: 400px;
    overflow-y: auto;
    background: white;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    z-index: 50;
    padding: 12px;
}

.paper-filter-dropdown .paper-filter-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.1s;
}

.paper-filter-dropdown .paper-filter-item:hover {
    background: var(--bg-hover);
}

.paper-filter-dropdown .paper-filter-check {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    border: 2px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s, border-color 0.15s;
}

.paper-filter-dropdown .paper-filter-item.selected .paper-filter-check {
    background: var(--unc-tile-teal);
    border-color: var(--unc-tile-teal);
    color: white;
}

/* ==================== MOBILE: PAPER FILTER AS FULL-SCREEN OVERLAY ==================== */

@media (max-width: 640px) {
    .paper-filter-dropdown {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        max-height: 100%;
        border-radius: 0;
        z-index: 100;
        padding: 20px;
    }
}

/* ==================== VIEW TRANSITIONS ==================== */

.issue-grid-fade {
    transition: opacity 0.15s ease;
}

.issue-grid-fade.fading {
    opacity: 0.3;
}
```

- [ ] **Step 2: Commit**

```bash
git add style.css
git commit -m "feat: add CSS for paper gallery, timeline, breadcrumb, and paper filter dropdown"
```

---

## Chunk 3: Paper Detail & Date Browse Views

### Task 7: Create paper-detail.js — Paper Detail View

**Files:**
- Create: `paper-detail.js`

- [ ] **Step 1: Create paper-detail.js**

```javascript
// paper-detail.js — Paper detail view: header, timeline, months, issue grid

const PaperDetail = {
    currentPaper: null,     // PaperData entry
    selectedYear: null,
    selectedMonth: null,
    filteredIssues: [],
    currentPage: 0,
    observer: null,

    /**
     * Show the paper detail view for a given slug.
     * @param {string} slug - Paper slug
     * @param {object} params - Optional { year, month }
     */
    show(slug, params = {}) {
        const paper = PaperData.getBySlug(slug);
        if (!paper) {
            console.warn(`Paper not found: ${slug}`);
            if (window.BrowseRouter) BrowseRouter.navigateTo('gallery');
            return;
        }

        this.currentPaper = paper;
        this.selectedYear = params.year ? parseInt(params.year, 10) : null;
        this.selectedMonth = params.month || null;
        this.currentPage = 0;

        this.renderBreadcrumb();
        this.renderHeader();
        this.renderTimeline();
        this.renderMonths();
        this.applyFilter();
        this.renderResultHeader();
        this.renderGrid();
        this.setupInfiniteScroll();

        document.getElementById('paper-detail-section')?.classList.remove('hidden');
    },

    hide() {
        document.getElementById('paper-detail-section')?.classList.add('hidden');
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    },

    renderBreadcrumb() {
        const el = document.getElementById('paper-detail-breadcrumb');
        if (!el) return;

        let html = `<span class="browse-breadcrumb">`;
        html += `<a href="#" data-nav="gallery">All Papers</a>`;
        html += `<span class="separator">›</span>`;
        html += `<span style="color:var(--text-primary);font-weight:500;">${this.currentPaper.title}</span>`;

        if (this.selectedYear) {
            // Make paper name a link when year is selected
            html = `<span class="browse-breadcrumb">`;
            html += `<a href="#" data-nav="gallery">All Papers</a>`;
            html += `<span class="separator">›</span>`;
            html += `<a href="#" data-nav="paper" data-slug="${this.currentPaper.slug}">${this.currentPaper.title}</a>`;
            html += `<span class="separator">›</span>`;
            html += `<span style="color:var(--text-primary);font-weight:500;">${this.selectedYear}</span>`;
        }

        html += `</span>`;
        el.innerHTML = html;

        // Click handlers
        el.querySelectorAll('a[data-nav]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const nav = link.dataset.nav;
                if (nav === 'gallery') {
                    BrowseRouter.navigateTo('gallery');
                } else if (nav === 'paper') {
                    BrowseRouter.navigateTo('paper', { paper: link.dataset.slug });
                }
            });
        });
    },

    renderHeader() {
        const el = document.getElementById('paper-detail-header');
        if (!el) return;

        el.innerHTML = `
            <div class="paper-detail-header">
                <div class="paper-detail-masthead">
                    <img src="${this.currentPaper.firstThumb}" alt="${this.currentPaper.title} masthead" />
                </div>
                <div>
                    <h2 class="text-2xl font-bold mb-1" style="color:var(--unc-longleaf-pine);font-family:var(--font-display);">
                        ${this.currentPaper.title}
                    </h2>
                    <p class="text-sm" style="color:var(--text-muted);">
                        ${this.currentPaper.location} · ${this.currentPaper.issueCount.toLocaleString()} issues · ${this.currentPaper.dateRange}
                    </p>
                </div>
            </div>
        `;
    },

    renderTimeline() {
        const container = document.getElementById('paper-detail-timeline');
        if (!container) return;

        TimelineScrubber.render(container, this.currentPaper.yearCounts, {
            selectedYear: this.selectedYear,
            label: 'Timeline',
            totalIssues: this.currentPaper.issueCount,
            onYearSelect: (year) => {
                this.selectedYear = year;
                this.selectedMonth = null;
                this.currentPage = 0;
                this.renderTimeline();
                this.renderMonths();
                this.applyFilter();
                this.renderResultHeader();
                this.renderGrid();
                this.renderBreadcrumb();

                // Update URL without pushing history
                if (window.BrowseRouter) {
                    BrowseRouter.replaceParams({
                        paper: this.currentPaper.slug,
                        year: year ? String(year) : null,
                        month: null,
                    });
                }
            },
        });
    },

    renderMonths() {
        const container = document.getElementById('paper-detail-months');
        if (!container) return;

        if (!this.selectedYear) {
            container.innerHTML = '';
            return;
        }

        const yearIssues = this.currentPaper.issues.filter(
            i => i.date.startsWith(String(this.selectedYear))
        );

        TimelineScrubber.renderMonthPills(container, yearIssues, {
            selectedMonth: this.selectedMonth,
            onMonthSelect: (month) => {
                this.selectedMonth = month;
                this.currentPage = 0;
                this.renderMonths();
                this.applyFilter();
                this.renderResultHeader();
                this.renderGrid();

                if (window.BrowseRouter) {
                    BrowseRouter.replaceParams({
                        paper: this.currentPaper.slug,
                        year: String(this.selectedYear),
                        month: month,
                    });
                }
            },
        });
    },

    applyFilter() {
        let issues = this.currentPaper.issues;

        if (this.selectedYear) {
            const yearStr = String(this.selectedYear);
            issues = issues.filter(i => i.date.startsWith(yearStr));

            if (this.selectedMonth) {
                const prefix = `${yearStr}-${this.selectedMonth}`;
                issues = issues.filter(i => i.date.startsWith(prefix));
            }
        }

        this.filteredIssues = issues;
    },

    renderResultHeader() {
        const el = document.getElementById('paper-detail-result-header');
        if (!el) return;

        const MONTH_NAMES = ['January','February','March','April','May','June',
            'July','August','September','October','November','December'];

        let label;
        if (this.selectedYear && this.selectedMonth) {
            const monthName = MONTH_NAMES[parseInt(this.selectedMonth, 10) - 1];
            label = `${monthName} ${this.selectedYear}`;
        } else if (this.selectedYear) {
            label = String(this.selectedYear);
        } else {
            label = 'All years';
        }

        el.innerHTML = `
            <div>
                <span class="text-lg font-semibold" style="color:var(--text-primary);font-family:var(--font-display);">${label}</span>
                <span class="text-sm ml-2" style="color:var(--text-muted);">· ${this.filteredIssues.length.toLocaleString()} issues</span>
            </div>
            <select id="paper-detail-sort" class="px-3 py-1.5 rounded-lg text-sm"
                    style="border:1px solid var(--border-color);background:white;color:var(--text-secondary);">
                <option value="date-asc">Oldest First</option>
                <option value="date-desc">Newest First</option>
            </select>
        `;

        document.getElementById('paper-detail-sort')?.addEventListener('change', (e) => {
            this.currentPage = 0;
            this.renderGrid();
        });
    },

    renderGrid(append = false) {
        const grid = document.getElementById('paper-detail-grid');
        if (!grid) return;

        const sortSelect = document.getElementById('paper-detail-sort');
        const sortOrder = sortSelect?.value || 'date-asc';

        let sorted = [...this.filteredIssues];
        if (sortOrder === 'date-desc') {
            sorted.sort((a, b) => b.date.localeCompare(a.date));
        } else {
            sorted.sort((a, b) => a.date.localeCompare(b.date));
        }

        // Store for viewer navigation
        state.displayedIssues = sorted;

        const startIndex = this.currentPage * CONFIG.ITEMS_PER_PAGE;
        const endIndex = startIndex + CONFIG.ITEMS_PER_PAGE;
        const items = sorted.slice(startIndex, endIndex);

        if (!append) {
            grid.innerHTML = '';
        }

        items.forEach((issue, index) => {
            const globalIndex = startIndex + index;
            const card = createIssueCard(issue, globalIndex);
            grid.appendChild(card);
        });

        // Manage load-more trigger
        // Manage infinite scroll observer
        const loadMore = document.getElementById('paper-detail-load-more');
        if (loadMore) {
            const hasMore = endIndex < sorted.length;
            loadMore.classList.toggle('hidden', !hasMore);

            // Re-observe after each render (trigger may have gone visible→hidden→visible)
            if (this.observer) {
                this.observer.disconnect();
                if (hasMore) {
                    this.observer.observe(loadMore);
                }
            }
        }
    },

    setupInfiniteScroll() {
        if (this.observer) {
            this.observer.disconnect();
        }

        const trigger = document.getElementById('paper-detail-load-more');
        if (!trigger) return;

        this.observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                this.currentPage++;
                this.renderGrid(true);
            }
        }, { rootMargin: '100px' });

        if (!trigger.classList.contains('hidden')) {
            this.observer.observe(trigger);
        }
    },
};
```

- [ ] **Step 2: Verify syntax**

```bash
node --check paper-detail.js
```

- [ ] **Step 3: Commit**

```bash
git add paper-detail.js
git commit -m "feat: add paper-detail.js with timeline, months, and filtered issue grid"
```

---

### Task 8: Create date-browse.js — Cross-Paper Date Browse View

**Files:**
- Create: `date-browse.js`

- [ ] **Step 1: Create date-browse.js**

```javascript
// date-browse.js — Cross-paper date browse view

const DateBrowse = {
    selectedYear: null,
    selectedMonth: null,
    selectedPapers: new Set(),  // empty = all papers
    filteredIssues: [],
    currentPage: 0,
    observer: null,
    dropdownOpen: false,
    _outsideClickHandler: null,  // Store reference to avoid listener leak

    /**
     * Show the date browse view.
     * @param {object} params - Optional { year, month }
     */
    show(params = {}) {
        this.selectedYear = params.year ? parseInt(params.year, 10) : null;
        this.selectedMonth = params.month || null;
        this.selectedPapers.clear(); // Reset to all papers
        this.currentPage = 0;

        this.renderBreadcrumb();
        this.renderTimeline();
        this.renderMonths();
        this.renderPaperFilter();
        this.applyFilter();
        this.renderResultHeader();
        this.renderGrid();
        this.setupInfiniteScroll();

        document.getElementById('date-browse-section')?.classList.remove('hidden');
    },

    hide() {
        document.getElementById('date-browse-section')?.classList.add('hidden');
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    },

    getAllYearCounts() {
        const issues = this.getActiveIssues();
        const yearCounts = new Map();
        for (const issue of issues) {
            const year = parseInt(issue.date.slice(0, 4), 10);
            yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
        }
        return yearCounts;
    },

    getActiveIssues() {
        if (this.selectedPapers.size === 0) return state.allIssues;
        return state.allIssues.filter(i => this.selectedPapers.has(i.title));
    },

    renderBreadcrumb() {
        const el = document.getElementById('date-browse-breadcrumb');
        if (!el) return;

        let html = `<span class="browse-breadcrumb">`;
        html += `<a href="#" data-nav="gallery">All Papers</a>`;
        html += `<span class="separator">›</span>`;

        if (this.selectedYear) {
            html += `<a href="#" data-nav="date-browse">All Issues by Date</a>`;
            html += `<span class="separator">›</span>`;
            html += `<span style="color:var(--text-primary);font-weight:500;">${this.selectedYear}</span>`;
        } else {
            html += `<span style="color:var(--text-primary);font-weight:500;">All Issues by Date</span>`;
        }

        html += `</span>`;
        el.innerHTML = html;

        el.querySelectorAll('a[data-nav]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const nav = link.dataset.nav;
                if (nav === 'gallery') {
                    BrowseRouter.navigateTo('gallery');
                } else if (nav === 'date-browse') {
                    BrowseRouter.navigateTo('date', {});
                }
            });
        });
    },

    renderTimeline() {
        const container = document.getElementById('date-browse-timeline');
        if (!container) return;

        const yearCounts = this.getAllYearCounts();
        const totalIssues = Array.from(yearCounts.values()).reduce((a, b) => a + b, 0);

        TimelineScrubber.render(container, yearCounts, {
            selectedYear: this.selectedYear,
            label: this.selectedPapers.size > 0
                ? `Timeline — ${this.selectedPapers.size} papers`
                : 'Timeline — All Papers',
            totalIssues,
            onYearSelect: (year) => {
                this.selectedYear = year;
                this.selectedMonth = null;
                this.currentPage = 0;
                this.renderTimeline();
                this.renderMonths();
                this.applyFilter();
                this.renderResultHeader();
                this.renderGrid();
                this.renderBreadcrumb();

                if (window.BrowseRouter) {
                    BrowseRouter.replaceParams({
                        view: 'date',
                        year: year ? String(year) : null,
                        month: null,
                    });
                }
            },
        });
    },

    renderMonths() {
        const container = document.getElementById('date-browse-months');
        if (!container) return;

        if (!this.selectedYear) {
            container.innerHTML = '';
            return;
        }

        const yearIssues = this.getActiveIssues().filter(
            i => i.date.startsWith(String(this.selectedYear))
        );

        TimelineScrubber.renderMonthPills(container, yearIssues, {
            selectedMonth: this.selectedMonth,
            onMonthSelect: (month) => {
                this.selectedMonth = month;
                this.currentPage = 0;
                this.renderMonths();
                this.applyFilter();
                this.renderResultHeader();
                this.renderGrid();

                if (window.BrowseRouter) {
                    BrowseRouter.replaceParams({
                        view: 'date',
                        year: String(this.selectedYear),
                        month: month,
                    });
                }
            },
        });
    },

    renderPaperFilter() {
        const container = document.getElementById('date-browse-paper-filter');
        if (!container) return;

        const totalPapers = PaperData.papers.size;
        const selectedCount = this.selectedPapers.size || totalPapers;
        const label = this.selectedPapers.size === 0
            ? `All ${totalPapers} Papers`
            : `${selectedCount} of ${totalPapers} Papers`;

        container.innerHTML = `
            <button id="paper-filter-btn" class="px-3 py-2 rounded-lg text-sm flex items-center gap-2"
                    style="border:1px solid var(--border-color);background:white;color:var(--text-secondary);cursor:pointer;white-space:nowrap;">
                ${label} <span style="font-size:10px;">▼</span>
            </button>
            <div id="paper-filter-dropdown" class="paper-filter-dropdown hidden">
                <input type="text" id="paper-filter-search" placeholder="Search papers..."
                       style="width:100%;padding:8px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;margin-bottom:8px;" />
                <div id="paper-filter-list" style="max-height:300px;overflow-y:auto;"></div>
            </div>
        `;

        // Toggle dropdown
        const btn = document.getElementById('paper-filter-btn');
        const dropdown = document.getElementById('paper-filter-dropdown');

        btn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dropdownOpen = !this.dropdownOpen;
            dropdown?.classList.toggle('hidden', !this.dropdownOpen);
            if (this.dropdownOpen) this.renderPaperList();
        });

        // Close on outside click (remove previous listener to avoid leak)
        if (this._outsideClickHandler) {
            document.removeEventListener('click', this._outsideClickHandler);
        }
        this._outsideClickHandler = (e) => {
            if (this.dropdownOpen && !container.contains(e.target)) {
                this.dropdownOpen = false;
                dropdown?.classList.add('hidden');
            }
        };
        document.addEventListener('click', this._outsideClickHandler);

        // Search
        const searchInput = document.getElementById('paper-filter-search');
        searchInput?.addEventListener('input', () => {
            this.renderPaperList(searchInput.value.trim().toLowerCase());
        });
    },

    renderPaperList(searchQuery = '') {
        const list = document.getElementById('paper-filter-list');
        if (!list) return;

        const allPapers = PaperData.getSortedPapers('alpha');
        const filtered = searchQuery
            ? allPapers.filter(p => p.title.toLowerCase().includes(searchQuery) || p.location.toLowerCase().includes(searchQuery))
            : allPapers;

        list.innerHTML = filtered.map(paper => {
            const isSelected = this.selectedPapers.size === 0 || this.selectedPapers.has(paper.canonicalTitle);
            return `
                <div class="paper-filter-item ${isSelected ? 'selected' : ''}" data-title="${paper.canonicalTitle}">
                    <div class="paper-filter-check">${isSelected ? '✓' : ''}</div>
                    <span style="flex:1;">${paper.title}</span>
                    <span style="font-size:11px;color:var(--text-muted);">${paper.issueCount}</span>
                </div>
            `;
        }).join('');

        list.querySelectorAll('.paper-filter-item').forEach(item => {
            item.addEventListener('click', () => {
                const title = item.dataset.title;
                this.togglePaper(title);
            });
        });
    },

    togglePaper(title) {
        if (this.selectedPapers.size === 0) {
            // Currently "all" — switch to all-except-this
            for (const [t] of PaperData.papers) {
                if (t !== title) this.selectedPapers.add(t);
            }
        } else if (this.selectedPapers.has(title)) {
            this.selectedPapers.delete(title);
            // If none selected, reset to "all"
            if (this.selectedPapers.size === 0) {
                // Leave empty = all
            }
        } else {
            this.selectedPapers.add(title);
            // If all are now selected, reset to "all" (empty set)
            if (this.selectedPapers.size === PaperData.papers.size) {
                this.selectedPapers.clear();
            }
        }

        this.currentPage = 0;
        this.renderTimeline();
        this.renderMonths();
        this.renderPaperFilter();
        this.applyFilter();
        this.renderResultHeader();
        this.renderGrid();
    },

    applyFilter() {
        let issues = this.getActiveIssues();

        if (this.selectedYear) {
            const yearStr = String(this.selectedYear);
            issues = issues.filter(i => i.date.startsWith(yearStr));

            if (this.selectedMonth) {
                const prefix = `${yearStr}-${this.selectedMonth}`;
                issues = issues.filter(i => i.date.startsWith(prefix));
            }
        }

        this.filteredIssues = issues;
    },

    renderResultHeader() {
        const el = document.getElementById('date-browse-result-header');
        if (!el) return;

        const MONTH_NAMES = ['January','February','March','April','May','June',
            'July','August','September','October','November','December'];

        let label;
        if (this.selectedYear && this.selectedMonth) {
            const monthName = MONTH_NAMES[parseInt(this.selectedMonth, 10) - 1];
            label = `${monthName} ${this.selectedYear}`;
        } else if (this.selectedYear) {
            label = String(this.selectedYear);
        } else {
            label = 'All years';
        }

        // Count unique papers in filtered results
        const paperSet = new Set(this.filteredIssues.map(i => i.title));

        el.innerHTML = `
            <div>
                <span class="text-lg font-semibold" style="color:var(--text-primary);font-family:var(--font-display);">${label}</span>
                <span class="text-sm ml-2" style="color:var(--text-muted);">· ${this.filteredIssues.length.toLocaleString()} issues across ${paperSet.size} papers</span>
            </div>
            <select id="date-browse-sort" class="px-3 py-1.5 rounded-lg text-sm"
                    style="border:1px solid var(--border-color);background:white;color:var(--text-secondary);">
                <option value="date-asc">Oldest First</option>
                <option value="date-desc">Newest First</option>
                <option value="title">By Title</option>
            </select>
        `;

        document.getElementById('date-browse-sort')?.addEventListener('change', () => {
            this.currentPage = 0;
            this.renderGrid();
        });
    },

    renderGrid(append = false) {
        const grid = document.getElementById('date-browse-grid');
        if (!grid) return;

        const sortSelect = document.getElementById('date-browse-sort');
        const sortOrder = sortSelect?.value || 'date-asc';

        let sorted = [...this.filteredIssues];
        if (sortOrder === 'date-desc') {
            sorted.sort((a, b) => b.date.localeCompare(a.date));
        } else if (sortOrder === 'title') {
            sorted.sort((a, b) => getDisplayTitle(a.title).localeCompare(getDisplayTitle(b.title)));
        } else {
            sorted.sort((a, b) => a.date.localeCompare(b.date));
        }

        state.displayedIssues = sorted;

        const startIndex = this.currentPage * CONFIG.ITEMS_PER_PAGE;
        const endIndex = startIndex + CONFIG.ITEMS_PER_PAGE;
        const items = sorted.slice(startIndex, endIndex);

        if (!append) {
            grid.innerHTML = '';
        }

        items.forEach((issue, index) => {
            const globalIndex = startIndex + index;
            const card = createIssueCard(issue, globalIndex);
            grid.appendChild(card);
        });

        const loadMore = document.getElementById('date-browse-load-more');
        if (loadMore) {
            const hasMore = endIndex < sorted.length;
            loadMore.classList.toggle('hidden', !hasMore);
        }
    },

    setupInfiniteScroll() {
        if (this.observer) {
            this.observer.disconnect();
        }

        const trigger = document.getElementById('date-browse-load-more');
        if (!trigger) return;

        this.observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                this.currentPage++;
                this.renderGrid(true);
            }
        }, { rootMargin: '100px' });

        if (!trigger.classList.contains('hidden')) {
            this.observer.observe(trigger);
        }
    },
};
```

- [ ] **Step 2: Verify syntax**

```bash
node --check date-browse.js
```

- [ ] **Step 3: Commit**

```bash
git add date-browse.js
git commit -m "feat: add date-browse.js with cross-paper timeline, paper filter dropdown"
```

---

## Chunk 4: Router & App Integration

### Task 9: Create browse-router.js — URL Routing & History

**Files:**
- Create: `browse-router.js`

- [ ] **Step 1: Create browse-router.js**

```javascript
// browse-router.js — URL routing, history management, view transitions

const BrowseRouter = {
    currentView: null,  // 'gallery' | 'paper' | 'date'
    galleryScrollY: 0,

    /**
     * Initialize routing. Call after manifest is loaded and PaperData is ready.
     */
    init() {
        window.addEventListener('popstate', (e) => this.handlePopState(e));
        this.routeFromURL();
    },

    /**
     * Route based on current URL parameters.
     */
    routeFromURL() {
        const params = new URLSearchParams(window.location.search);
        const paperSlug = params.get('paper');
        const dateParam = params.get('date');
        const viewParam = params.get('view');
        const yearParam = params.get('year');
        const monthParam = params.get('month');

        // Backward compat: ?paper=X&date=Y opens viewer
        if (paperSlug && dateParam) {
            this.showView('paper', { paper: paperSlug, year: yearParam, month: monthParam });
            // The viewer opening is handled by app.js backward compat code
            return;
        }

        // Backward compat: bare ?date=Y (no paper) opens viewer directly
        // This is the existing deep link format — handled by app.js after routing
        if (dateParam && !paperSlug) {
            this.showView('gallery');
            // The viewer opening is handled by app.js backward compat code
            return;
        }

        if (paperSlug) {
            this.showView('paper', { paper: paperSlug, year: yearParam, month: monthParam });
            return;
        }

        if (viewParam === 'date') {
            this.showView('date', { year: yearParam, month: monthParam });
            return;
        }

        // Default: gallery
        this.showView('gallery');
    },

    /**
     * Navigate to a view, pushing history.
     * @param {string} view - 'gallery' | 'paper' | 'date'
     * @param {object} params - View parameters
     */
    navigateTo(view, params = {}) {
        // Save scroll position when leaving gallery
        if (this.currentView === 'gallery') {
            this.galleryScrollY = window.scrollY;
        }

        const url = this.buildURL(view, params);
        history.pushState({ view, params }, '', url);
        this.showView(view, params);
    },

    /**
     * Update URL parameters without pushing history (for filter changes).
     */
    replaceParams(params) {
        const view = this.currentView;
        const url = this.buildURL(view, params);
        history.replaceState({ view, params }, '', url);
    },

    /**
     * Build URL string for a view + params.
     */
    buildURL(view, params = {}) {
        const url = new URL(window.location.href);
        // Clear existing params (keep hash for viewer deep links)
        url.search = '';

        if (view === 'paper' && params.paper) {
            url.searchParams.set('paper', params.paper);
            if (params.year) url.searchParams.set('year', params.year);
            if (params.month) url.searchParams.set('month', params.month);
        } else if (view === 'date') {
            url.searchParams.set('view', 'date');
            if (params.year) url.searchParams.set('year', params.year);
            if (params.month) url.searchParams.set('month', params.month);
        }
        // gallery: no params

        return url.pathname + url.search;
    },

    /**
     * Show a view, hiding all others.
     */
    showView(view, params = {}) {
        this.currentView = view;

        // Hide all views
        PaperGallery.hide();
        PaperDetail.hide();
        DateBrowse.hide();

        // Hide old grid elements
        const oldElements = ['grid-header', 'issue-grid-wrapper', 'empty-state', 'loading-state'];
        oldElements.forEach(id => {
            document.getElementById(id)?.classList.add('hidden');
        });

        // Show requested view
        switch (view) {
            case 'gallery':
                PaperGallery.show();
                PaperGallery.render();
                break;
            case 'paper':
                PaperDetail.show(params.paper, {
                    year: params.year,
                    month: params.month,
                });
                break;
            case 'date':
                DateBrowse.show({
                    year: params.year,
                    month: params.month,
                });
                break;
        }

        // Scroll to top unless returning to gallery
        if (view !== 'gallery') {
            window.scrollTo(0, 0);
        }
    },

    /**
     * Handle browser back/forward.
     */
    handlePopState(event) {
        if (event.state && event.state.view) {
            this.showView(event.state.view, event.state.params || {});

            // Restore gallery scroll position
            if (event.state.view === 'gallery') {
                requestAnimationFrame(() => {
                    window.scrollTo(0, this.galleryScrollY);
                });
            }
        } else {
            // No state = initial page load state
            this.routeFromURL();
        }
    },
};
```

- [ ] **Step 2: Verify syntax**

```bash
node --check browse-router.js
```

- [ ] **Step 3: Commit**

```bash
git add browse-router.js
git commit -m "feat: add browse-router.js with URL routing and history management"
```

---

### Task 10: Modify app.js — Integrate New Navigation

**Files:**
- Modify: `app.js`

Replace the old filter initialization with the new router. Keep all viewer, OCR, hero, and manifest code intact.

- [ ] **Step 1: Update DOMContentLoaded handler**

In `app.js`, find the `DOMContentLoaded` event handler (around line 100-114). Replace it with:

```javascript
document.addEventListener('DOMContentLoaded', async () => {
    const issueGrid = document.getElementById('issue-grid');
    if (!issueGrid && !document.getElementById('paper-gallery-grid')) {
        return;
    }

    // Load slug mappings in parallel with manifest
    await Promise.all([
        loadManifest(),
        PaperData.loadSlugs(),
    ]);

    // Compute per-paper stats from loaded manifest
    PaperData.computeStats(state.allIssues);

    // Initialize new navigation
    PaperGallery.init();
    BrowseRouter.init();

    // Setup event listeners (viewer, keyboard shortcuts, etc.)
    setupEventListeners();

    // "Browse by date" link
    document.getElementById('browse-by-date-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        BrowseRouter.navigateTo('date');
    });
});
```

- [ ] **Step 2: Remove old filter initialization calls**

In `app.js`, remove or comment out these function calls and their associated functions that are no longer needed:

- Remove the call to `initializeFilters()` inside `loadManifest()` (around line 353)
- Remove the call to `refreshTimelineAvailability()` inside `loadManifest()` (around line 354)
- Remove the call to `initializeRandomDefaultView()` or `initializeCurrentMonthRandomYear()` inside `loadManifest()`
- Remove the `FilterSystem.init()` call (around line 111-113)
- Remove the old URL parameter handling for `?paper=` that uses naive slug conversion (lines 357-465). The backward compat case (`?paper=X&date=Y`) is now handled by `BrowseRouter.routeFromURL()` which calls `PaperDetail.show()` followed by the existing viewer opening logic.

Keep these functions intact (still used):
- `loadManifest()` (data loading and caching)
- `calculateYearCounts()` (used by PaperData)
- `createIssueCard()` (reused by paper-detail and date-browse)
- `openViewer()`, `openViewerDirect()`, `closeViewer()` and all viewer functions
- `getDisplayTitle()`
- `resolveAssetPath()`
- All hero section functions (`updateHeroShowcase`, `selectHeroIssues`, `createHeroCard`)
- All OCR functions
- `setupEventListeners()` (but remove filter-related listeners from it)

- [ ] **Step 3: Hide the header search input**

The old `search-input` in the header is currently hidden via CSS (`display: none`) and its handler (`handleSearch`) is being removed. Keep it hidden — no changes needed. If it's ever made visible again, it should be wired to the gallery search instead.

- [ ] **Step 4: Update setupEventListeners to remove old filter listeners**

In `setupEventListeners()` (around line 2223), remove event listeners for:
- `sort-select` (old sort dropdown) — the new views have their own sort handlers
- `filters-reset` (old clear filters button)
- `search-input` (old search input)
- Old timeline pill click handlers
- Old filter toggle handlers

Keep these event listeners:
- Viewer keyboard shortcuts (arrow keys, +/-, T, D, R, F, ?, Esc)
- Viewer mouse/touch handlers
- Intro overlay handlers
- Window resize handler
- Spin archive button handler (in hero section)

- [ ] **Step 5: Update the viewer's openViewer function for backward compat**

In `loadManifest()`, after the new router initialization, add backward compat for `?paper=X&date=Y`:

```javascript
// Handle backward compat: ?paper=X&date=Y opens viewer
const urlParams = new URLSearchParams(window.location.search);
const paperSlug = urlParams.get('paper');
const dateParam = urlParams.get('date');
const pageParam = urlParams.get('page');

if (paperSlug && dateParam) {
    const paperTitle = PaperData.slugToTitle.get(paperSlug);
    if (paperTitle) {
        const issue = state.allIssues.find(i =>
            i.title === paperTitle && i.date === dateParam
        );
        if (issue) {
            const issueIndex = state.displayedIssues.findIndex(
                item => item.id === issue.id
            );
            if (issueIndex !== -1) {
                await openViewer(issueIndex);
            } else {
                await openViewerDirect(issue);
            }

            // Navigate to specific page if requested
            const targetPage = pageParam ? parseInt(pageParam, 10) - 1 : 0;
            if (targetPage > 0 && targetPage < state.currentPages.length) {
                await loadPage(targetPage, 'fade');
            }

            // Handle #chunk-N hash
            const hash = window.location.hash;
            if (hash && hash.startsWith('#chunk-')) {
                const chunkIdx = parseInt(hash.replace('#chunk-', ''), 10);
                if (!isNaN(chunkIdx)) {
                    const ocrBtn = document.getElementById('ocr-toggle-btn');
                    const ocrPanel = document.getElementById('ocr-panel');
                    if (ocrBtn && ocrPanel && ocrPanel.classList.contains('hidden')) {
                        ocrBtn.click();
                    }
                    setTimeout(() => {
                        const chunkEl = document.querySelector(`[data-ocr-idx="${chunkIdx}"]`)
                            || document.querySelectorAll('#ocr-panel-content [data-ocr-idx]')[chunkIdx];
                        if (chunkEl) {
                            chunkEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            chunkEl.classList.add('ocr-highlight');
                        }
                    }, 800);
                }
            }
        }
    }
}
```

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "feat: integrate new navigation, replace old filter system with router"
```

---

### Task 11: Remove old filter bar HTML and retire filters.js

**Files:**
- Modify: `index.html`
- (No change to `filters.js` file itself — just stop loading it)

- [ ] **Step 1: Remove old filter bar section from index.html**

Delete the entire `<section class="filter-bar-section ...">` block from `index.html`. This was replaced by the new gallery/detail/browse sections in Task 4.

Also remove or hide the old `grid-header`, `issue-grid-wrapper`, `empty-state`, and `load-more-trigger` elements (they are no longer rendered by the new views — the new views have their own grids and load-more triggers).

Keep them in the DOM but hidden, as the viewer's `openViewer()` function references `state.displayedIssues` which is now populated by the new views.

- [ ] **Step 2: Remove filters.js script tag**

In `index.html`, remove: `<script src="filters.js"></script>`

(The file itself stays in the repo for now — it can be deleted in a cleanup commit later.)

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: remove old filter bar HTML and stop loading filters.js"
```

---

### Task 12: Manual Integration Test

**Files:** None (testing only)

- [ ] **Step 1: Start local server and test gallery view**

```bash
python3 -m http.server 8765
```

Open `http://localhost:8765/index.html` in browser. Verify:
- Hero section shows "Today in History" (unchanged)
- Below hero, "Browse by Paper" heading appears with 41 paper cards
- Each card shows masthead thumbnail, paper name, city/state, date range, issue count
- Gallery search filters cards
- Sort dropdown works (Most Issues / Alphabetical)

- [ ] **Step 2: Test paper detail view**

Click a paper card (e.g., "Chicago Defender"). Verify:
- URL updates to `?paper=chicago-defender`
- Breadcrumb shows "All Papers › Chicago Defender"
- Timeline scrubber shows density bars for the paper's date range
- Click a year → month pills appear, grid filters
- Click a month → grid filters further
- Issue cards open the viewer modal
- Click "All Papers" breadcrumb → returns to gallery

- [ ] **Step 3: Test date browse view**

Click "Browse all issues by date →" from gallery. Verify:
- URL updates to `?view=date`
- Timeline shows all papers combined
- Paper filter dropdown works (toggle papers)
- Month pills, sorting, infinite scroll all work

- [ ] **Step 4: Test backward compatibility**

Navigate directly to:
- `?paper=chicago-defender&date=1920-03-06&page=1` → should show paper detail and open viewer
- `?paper=chicago-defender` → should show paper detail view
- `?view=date&year=1919&month=03` → should show date browse filtered to March 1919

- [ ] **Step 5: Test browser history**

Click through Gallery → Paper → Year → back → back → back. Verify each state restores correctly.

- [ ] **Step 6: Fix any issues found during testing and commit**

```bash
git add -A
git commit -m "fix: address integration test issues"
```

---

## Chunk 5: Polish & Cleanup

### Task 13: Remove unused old code from app.js

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Remove old functions no longer called**

Delete these functions from `app.js` (they were part of the old filter/timeline system and are now replaced):

- `initializeTimeline()`
- `createTimelineMarker()`
- `selectYear()`
- `updateTimelineVisuals()`
- `renderTimelineMonths()`
- `scrollMonthIntoView()`
- `updateTimelineLabel()`
- `getIssuesForActivePapers()`
- `refreshTimelineAvailability()`
- `initializeRandomDefaultView()`
- `initializeCurrentMonthRandomYear()`
- `scrollYearIntoView()`
- `initializeFilters()`
- `toggleAllFilters()`
- `togglePaperFilter()`
- `resetFilters()`
- `applyFilters()`
- `handleSearch()`
- `handleSort()`
- `sortIssues()`
- `updateStats()`
- `setupFilterToggle()`
- `loadMoreItems()` (replaced by per-view infinite scroll)
- `initializeIntersectionObserver()` (replaced by per-view observers)

**Adapt** `spinArchive()` — the hero section's shuffle button still calls this. Replace its body to work with the new navigation:

```javascript
function spinArchive() {
    // Pick a random paper and navigate to its detail view at a random year
    const papers = PaperData.getSortedPapers('count');
    if (!papers.length) return;

    const randomPaper = papers[Math.floor(Math.random() * papers.length)];
    const years = Array.from(randomPaper.yearCounts.keys());
    const randomYear = years[Math.floor(Math.random() * years.length)];

    // Animate the button
    const spinBtn = document.getElementById('spin-archive-btn');
    if (spinBtn) {
        spinBtn.classList.add('spinning');
        setTimeout(() => spinBtn.classList.remove('spinning'), 600);
    }

    BrowseRouter.navigateTo('paper', {
        paper: randomPaper.slug,
        year: String(randomYear),
    });
}
```

Keep:
- `createIssueCard()` — still used by new views
- All viewer functions
- All hero functions (`updateHeroShowcase`, `selectHeroIssues`, `createHeroCard`, `getHeroPeriodLabel`)
- All OCR functions
- `resolveAssetPath()`, `getDisplayTitle()`, `CONFIG`, `MONTHS`, `state`
- `calculateYearCounts()` — still used by hero section

- [ ] **Step 2: Remove old CSS for filter bar**

In `style.css`, remove styles for:
- `.filter-bar-section`
- `.filter-toggle`, `.filter-toggle-label`, `.filter-toggle-icon`
- `.filter-panel`, `.filter-panel-content`, `.filter-panel-title`
- `.filter-panel-search`, `.filter-search-input`
- `.paper-list`
- `.filter-panel-actions`, `.filter-panel-btn`
- `.year-grid`, `.year-pill`
- `.month-grid`, `.month-pill` (old ones — the new month pills use inline styles)
- `.month-selector`
- `.timeline-year-pill`
- `.timeline-slider`
- Any other filter-related classes no longer used

- [ ] **Step 3: Commit**

```bash
git add app.js style.css
git commit -m "chore: remove old filter system code and CSS"
```

---

### Task 14: Final verification

- [ ] **Step 1: Full smoke test**

Test all views on desktop (1200px+) and mobile (375px) viewport widths. Verify:
- Gallery renders correctly at all breakpoints
- Timeline scrubber is touch-friendly on mobile
- Paper filter dropdown works on mobile
- Viewer still functions correctly (zoom, pan, OCR, keyboard shortcuts)
- No console errors

- [ ] **Step 2: Verify all existing deep links still work**

Test these URLs:
- `/` — gallery
- `?paper=st-louis-argus` — paper detail (tests slug with period in title)
- `?paper=broad-ax` — paper detail (tests display title override)
- `?view=date&year=1919` — date browse
- `?paper=chicago-defender&date=1920-03-06&page=1` — backward compat viewer

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final polish and verification"
```
