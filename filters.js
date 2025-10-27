/**
 * Filter System - Toggle + Panel UI
 * Handles date (year/month) and paper selection filters
 */

const FilterSystem = {
    // State
    selectedYear: null,
    selectedMonth: null,
    selectedPapers: new Set(),
    allPapers: [],

    // DOM Elements
    dateToggle: null,
    datePanel: null,
    dateLabel: null,
    paperToggle: null,
    paperPanel: null,
    paperLabel: null,
    yearGrid: null,
    monthGrid: null,
    monthSelector: null,
    paperList: null,
    paperSearchInput: null,
    clearFiltersBtn: null,

    /**
     * Initialize the filter system
     */
    init() {
        // Cache DOM elements
        this.dateToggle = document.getElementById('date-filter-toggle');
        this.datePanel = document.getElementById('date-filter-panel');
        this.dateLabel = document.getElementById('date-filter-label');
        this.paperToggle = document.getElementById('paper-filter-toggle');
        this.paperPanel = document.getElementById('paper-filter-panel');
        this.paperLabel = document.getElementById('paper-filter-label');
        this.yearGrid = document.getElementById('year-grid');
        this.monthGrid = document.getElementById('month-grid');
        this.monthSelector = document.getElementById('month-selector');
        this.paperList = document.getElementById('paper-list');
        this.paperSearchInput = document.getElementById('paper-search-input');
        this.clearFiltersBtn = document.getElementById('filters-reset');

        // Set up event listeners
        this.setupToggleListeners();
        this.setupClearFiltersButton();
        this.setupPaperListeners();
        this.setupOutsideClickClose();
        this.setupKeyboardClose();

        // Populate filters
        this.populateYearGrid();
        this.populatePaperList();
    },

    /**
     * Set up toggle button click handlers
     */
    setupToggleListeners() {
        // Date toggle
        this.dateToggle?.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = this.dateToggle.getAttribute('aria-expanded') === 'true';

            if (isOpen) {
                this.closeDatePanel();
            } else {
                this.closePaperPanel(); // Close other panel
                this.openDatePanel();
            }
        });

        // Paper toggle
        this.paperToggle?.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = this.paperToggle.getAttribute('aria-expanded') === 'true';

            if (isOpen) {
                this.closePaperPanel();
            } else {
                this.closeDatePanel(); // Close other panel
                this.openPaperPanel();
            }
        });
    },

    /**
     * Open date filter panel
     */
    openDatePanel() {
        this.dateToggle?.setAttribute('aria-expanded', 'true');
        this.datePanel?.classList.remove('hidden');
    },

    /**
     * Close date filter panel
     */
    closeDatePanel() {
        this.dateToggle?.setAttribute('aria-expanded', 'false');
        this.datePanel?.classList.add('hidden');
    },

    /**
     * Open paper filter panel
     */
    openPaperPanel() {
        this.paperToggle?.setAttribute('aria-expanded', 'true');
        this.paperPanel?.classList.remove('hidden');
    },

    /**
     * Close paper filter panel
     */
    closePaperPanel() {
        this.paperToggle?.setAttribute('aria-expanded', 'false');
        this.paperPanel?.classList.add('hidden');
    },

    /**
     * Close panels when clicking outside
     */
    setupOutsideClickClose() {
        document.addEventListener('click', (e) => {
            // Check if click is outside both filter groups
            const dateGroup = e.target.closest('.filter-toggle-group');
            const isDateToggle = e.target.closest('#date-filter-toggle');
            const isPaperToggle = e.target.closest('#paper-filter-toggle');

            if (!dateGroup && !isDateToggle) {
                this.closeDatePanel();
            }
            if (!dateGroup && !isPaperToggle) {
                this.closePaperPanel();
            }
        });
    },

    /**
     * Close panels on Escape key
     */
    setupKeyboardClose() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeDatePanel();
                this.closePaperPanel();
            }
        });
    },

    /**
     * Populate year grid with available years
     */
    populateYearGrid() {
        if (!this.yearGrid || !state.allIssues) return;

        // Get unique years from issues
        const years = [...new Set(state.allIssues.map(issue => issue.date.substring(0, 4)))].sort();

        this.yearGrid.innerHTML = years.map(year => `
            <button class="year-pill" data-year="${year}" role="option">
                ${year}
            </button>
        `).join('');

        // Add click handlers
        this.yearGrid.querySelectorAll('.year-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const year = pill.dataset.year;
                this.selectYear(year);
            });
        });
    },

    /**
     * Select a year
     */
    selectYear(year) {
        this.selectedYear = year;
        this.selectedMonth = null; // Reset month when year changes

        // Update visual state
        this.yearGrid?.querySelectorAll('.year-pill').forEach(pill => {
            pill.classList.toggle('selected', pill.dataset.year === year);
        });

        // Show month selector
        this.monthSelector?.classList.remove('hidden');
        this.populateMonthGrid(year);

        // Update label
        this.updateDateLabel();

        // Apply filters
        this.applyDateFilter();
    },

    /**
     * Populate month grid for selected year
     */
    populateMonthGrid(year) {
        if (!this.monthGrid || !state.allIssues) return;

        const months = [
            'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
        ];

        // Get months that have issues in the selected year
        const availableMonths = new Set(
            state.allIssues
                .filter(issue => issue.date.startsWith(year))
                .map(issue => issue.date.substring(5, 7))
        );

        this.monthGrid.innerHTML = months.map((month, index) => {
            const monthNum = String(index + 1).padStart(2, '0');
            const isAvailable = availableMonths.has(monthNum);
            const disabled = isAvailable ? '' : 'disabled';

            return `
                <button
                    class="month-pill"
                    data-month="${monthNum}"
                    ${disabled}
                    role="option"
                >
                    ${month}
                </button>
            `;
        }).join('');

        // Add click handlers
        this.monthGrid.querySelectorAll('.month-pill:not([disabled])').forEach(pill => {
            pill.addEventListener('click', () => {
                const month = pill.dataset.month;
                this.selectMonth(month);
            });
        });
    },

    /**
     * Select a month
     */
    selectMonth(month) {
        if (this.selectedMonth === month) {
            // Deselect if clicking the same month
            this.selectedMonth = null;
        } else {
            this.selectedMonth = month;
        }

        // Update visual state
        this.monthGrid?.querySelectorAll('.month-pill').forEach(pill => {
            pill.classList.toggle('selected', pill.dataset.month === month && this.selectedMonth);
        });

        // Update label
        this.updateDateLabel();

        // Apply filters and close panel
        this.applyDateFilter();
        this.closeDatePanel();
    },

    /**
     * Update date toggle label
     */
    updateDateLabel() {
        if (!this.dateLabel) return;

        if (!this.selectedYear) {
            this.dateLabel.textContent = 'All Years';
        } else if (!this.selectedMonth) {
            this.dateLabel.textContent = this.selectedYear;
        } else {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthName = months[parseInt(this.selectedMonth) - 1];
            this.dateLabel.textContent = `${this.selectedYear} · ${monthName}`;
        }

        // Show/hide clear button
        this.updateClearButtonVisibility();
    },

    /**
     * Apply date filter to issues
     */
    applyDateFilter() {
        state.selectedYear = this.selectedYear || null;
        state.selectedMonth = this.selectedMonth || null;

        // Trigger the main app's filter function
        if (typeof applyFilters === 'function') {
            applyFilters();
        }
    },

    /**
     * Populate paper list
     */
    populatePaperList() {
        if (!this.paperList || !state.allIssues) return;

        // Get unique papers and sort alphabetically
        const paperTitles = [...new Set(state.allIssues.map(issue => issue.title))].sort();
        this.allPapers = paperTitles;

        // Initially select all papers
        this.selectedPapers = new Set(paperTitles);

        this.renderPaperList(paperTitles);
        this.updatePaperLabel();
    },

    /**
     * Render paper list
     */
    renderPaperList(papers) {
        if (!this.paperList) return;

        this.paperList.innerHTML = papers.map(paper => {
            const isChecked = this.selectedPapers.has(paper);
            return `
                <div class="paper-item" data-paper="${paper}">
                    <div class="paper-checkbox ${isChecked ? 'checked' : ''}"></div>
                    <span class="paper-label">${paper}</span>
                </div>
            `;
        }).join('');

        // Update Select All button text
        this.updateSelectAllButtonText();

        // Add click handlers
        this.paperList.querySelectorAll('.paper-item').forEach(item => {
            item.addEventListener('click', () => {
                const paper = item.dataset.paper;
                this.togglePaper(paper);
            });
        });
    },

    /**
     * Toggle paper selection
     */
    togglePaper(paper) {
        if (this.selectedPapers.has(paper)) {
            this.selectedPapers.delete(paper);
        } else {
            this.selectedPapers.add(paper);
        }

        // Update checkbox visual
        const item = this.paperList?.querySelector(`[data-paper="${paper}"]`);
        const checkbox = item?.querySelector('.paper-checkbox');
        checkbox?.classList.toggle('checked', this.selectedPapers.has(paper));

        // Update label (but don't apply yet - wait for Apply button)
        this.updatePaperLabel();
    },

    /**
     * Set up paper panel listeners
     */
    setupPaperListeners() {
        // Search input
        this.paperSearchInput?.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = this.allPapers.filter(paper =>
                paper.toLowerCase().includes(query)
            );
            this.renderPaperList(filtered);
        });

        // Select All button
        const selectAllBtn = document.getElementById('paper-select-all');
        selectAllBtn?.addEventListener('click', () => {
            const allVisible = Array.from(this.paperList?.querySelectorAll('.paper-item') || [])
                .map(item => item.dataset.paper);

            // Toggle: if all visible are selected, deselect all; otherwise select all
            const allSelected = allVisible.every(paper => this.selectedPapers.has(paper));

            if (allSelected) {
                allVisible.forEach(paper => this.selectedPapers.delete(paper));
            } else {
                allVisible.forEach(paper => this.selectedPapers.add(paper));
            }

            this.renderPaperList(allVisible);
            this.updatePaperLabel();
            this.updateSelectAllButtonText();
        });

        // Apply button
        document.getElementById('paper-apply')?.addEventListener('click', () => {
            this.applyPaperFilter();
            this.closePaperPanel();
        });
    },

    /**
     * Update paper toggle label
     */
    updatePaperLabel() {
        if (!this.paperLabel) return;

        const count = this.selectedPapers.size;
        const total = this.allPapers.length;

        if (count === 0) {
            this.paperLabel.textContent = 'No Papers Selected';
        } else if (count === total) {
            this.paperLabel.textContent = 'All Papers';
        } else if (count === 1) {
            this.paperLabel.textContent = [...this.selectedPapers][0];
        } else {
            this.paperLabel.textContent = `${count} Papers Selected`;
        }

        // Show/hide clear button
        this.updateClearButtonVisibility();
    },

    /**
     * Update Select All button text based on current state
     */
    updateSelectAllButtonText() {
        const selectAllBtn = document.getElementById('paper-select-all');
        if (!selectAllBtn) return;

        const allVisible = Array.from(this.paperList?.querySelectorAll('.paper-item') || [])
            .map(item => item.dataset.paper);
        const allSelected = allVisible.every(paper => this.selectedPapers.has(paper));

        selectAllBtn.textContent = allSelected ? 'Deselect All' : 'Select All';
    },

    /**
     * Apply paper filter
     */
    applyPaperFilter() {
        // Update main app state
        state.selectedPapers = new Set(this.selectedPapers);

        // Trigger the main app's filter function
        if (typeof applyFilters === 'function') {
            applyFilters();
        }
    },

    /**
     * Set up clear filters button
     */
    setupClearFiltersButton() {
        this.clearFiltersBtn?.addEventListener('click', () => {
            this.clearAllFilters();
        });
    },

    /**
     * Clear all filters
     */
    clearAllFilters() {
        // Clear date filters
        this.selectedYear = null;
        this.selectedMonth = null;
        this.yearGrid?.querySelectorAll('.year-pill').forEach(pill => {
            pill.classList.remove('selected');
        });
        this.monthSelector?.classList.add('hidden');
        this.updateDateLabel();

        // Clear paper filters (select all)
        this.selectedPapers = new Set(this.allPapers);
        this.renderPaperList(this.allPapers);
        this.updatePaperLabel();

        // Clear search
        if (this.paperSearchInput) {
            this.paperSearchInput.value = '';
        }

        // Apply filters
        state.selectedYear = null;
        state.selectedMonth = null;
        state.selectedPapers = new Set(this.selectedPapers);

        if (typeof applyFilters === 'function') {
            applyFilters();
        }

        // Close panels
        this.closeDatePanel();
        this.closePaperPanel();
    },

    /**
     * Update clear button visibility
     */
    updateClearButtonVisibility() {
        if (!this.clearFiltersBtn) return;

        const hasDateFilter = this.selectedYear !== null;
        const hasPaperFilter = this.selectedPapers.size < this.allPapers.length;
        const hasAnyFilter = hasDateFilter || hasPaperFilter;

        if (hasAnyFilter) {
            this.clearFiltersBtn.style.opacity = '1';
            this.clearFiltersBtn.style.pointerEvents = 'all';
        } else {
            this.clearFiltersBtn.style.opacity = '0';
            this.clearFiltersBtn.style.pointerEvents = 'none';
        }
    },

    /**
     * Set initial filter state from a random issue
     * Called after data is loaded to set filters to match the random pick
     */
    setInitialStateFromRandomIssue(issue) {
        if (!issue || !issue.date) return;

        // Parse date
        const [year, month] = issue.date.split('-');

        // Set year
        this.selectedYear = year;
        this.selectedMonth = month;

        // Update visuals
        this.yearGrid?.querySelectorAll('.year-pill').forEach(pill => {
            pill.classList.toggle('selected', pill.dataset.year === year);
        });

        // Show month selector
        this.monthSelector?.classList.remove('hidden');
        this.populateMonthGrid(year);

        // Select month
        this.monthGrid?.querySelectorAll('.month-pill').forEach(pill => {
            pill.classList.toggle('selected', pill.dataset.month === month);
        });

        // Select all papers initially
        this.selectedPapers = new Set(this.allPapers);

        // Update labels
        this.updateDateLabel();
        this.updatePaperLabel();

        // Sync with main state
        state.selectedYear = this.selectedYear;
        state.selectedMonth = this.selectedMonth;
        state.selectedPapers = new Set(this.selectedPapers);
    }
};

// Export for use in main app
if (typeof window !== 'undefined') {
    window.FilterSystem = FilterSystem;
}
