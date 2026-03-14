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
