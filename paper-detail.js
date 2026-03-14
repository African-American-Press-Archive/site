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
