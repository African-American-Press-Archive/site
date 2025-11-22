// Modern Filter System for Dangerous Press Archive
// This handles the slide-in panel UI for Year/Month/Paper filters

class ModernFilterSystem {
    constructor() {
        this.selectedYear = null;
        this.selectedMonth = null;
        this.selectedPapers = new Set();
        this.availablePapers = [];
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.populateYearGrid();
        this.populateMonthGrid();
    }
    
    setupEventListeners() {
        // Chip clicks
        document.getElementById('year-chip')?.addEventListener('click', () => this.openPanel('year'));
        document.getElementById('month-chip')?.addEventListener('click', () => this.openPanel('month'));
        document.getElementById('paper-chip')?.addEventListener('click', () => this.openPanel('paper'));
        
        // Panel close buttons
        document.getElementById('year-panel-close')?.addEventListener('click', () => this.closePanel('year'));
        document.getElementById('month-panel-close')?.addEventListener('click', () => this.closePanel('month'));
        document.getElementById('paper-panel-close')?.addEventListener('click', () => this.closePanel('paper'));
        
        // Backdrop click
        document.getElementById('filter-backdrop')?.addEventListener('click', () => this.closeAllPanels());
        
        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeAllPanels();
        });
        
        // Paper search
        document.getElementById('paper-search-input')?.addEventListener('input', (e) => {
            this.filterPaperList(e.target.value);
        });
        
        // Paper select all
        document.getElementById('paper-select-all')?.addEventListener('click', () => {
            this.toggleSelectAll();
        });
        
        // Paper apply
        document.getElementById('paper-apply')?.addEventListener('click', () => {
            this.applyPaperFilter();
            this.closePanel('paper');
        });
        
        // Clear all filters
        document.getElementById('filters-reset')?.addEventListener('click', () => {
            this.clearAllFilters();
        });
    }
    
    openPanel(panelName) {
        this.closeAllPanels();
        
        const panel = document.getElementById(`${panelName}-panel`);
        const backdrop = document.getElementById('filter-backdrop');
        const chip = document.getElementById(`${panelName}-chip`);
        
        if (panel && backdrop) {
            // Show backdrop
            backdrop.classList.remove('hidden');
            setTimeout(() => backdrop.classList.add('show'), 10);
            
            // Slide in panel
            panel.classList.add('open');
            
            // Mark chip as active
            if (chip) chip.classList.add('active');
            
            // Prevent body scroll
            document.body.style.overflow = 'hidden';
        }
    }
    
    closePanel(panelName) {
        const panel = document.getElementById(`${panelName}-panel`);
        const chip = document.getElementById(`${panelName}-chip`);
        
        if (panel) {
            panel.classList.remove('open');
            if (chip) chip.classList.remove('active');
        }
        
        // Check if all panels are closed
        const allPanels = document.querySelectorAll('.filter-panel-slide');
        const anyOpen = Array.from(allPanels).some(p => p.classList.contains('open'));
        
        if (!anyOpen) {
            document.getElementById('filter-backdrop')?.classList.remove('show');
            setTimeout(() => {
                document.getElementById('filter-backdrop')?.classList.add('hidden');
            }, 300);
            document.body.style.overflow = '';
        }
    }
    
    closeAllPanels() {
        const panels = ['year', 'month', 'paper'];
        panels.forEach(p => this.closePanel(p));
    }
    
    populateYearGrid() {
        const yearGrid = document.getElementById('year-grid');
        if (!yearGrid) return;
        
        yearGrid.innerHTML = '';
        
        // Generate years 1905-1929
        for (let year = 1929; year >= 1905; year--) {
            const btn = document.createElement('button');
            btn.textContent = year;
            btn.dataset.year = year;
            btn.addEventListener('click', () => this.selectYear(year));
            
            if (this.selectedYear === year) {
                btn.classList.add('selected');
            }
            
            yearGrid.appendChild(btn);
        }
    }
    
    populateMonthGrid() {
        const monthGrid = document.getElementById('month-grid');
        if (!monthGrid) return;
        
        monthGrid.innerHTML = '';
        
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        months.forEach((month, index) => {
            const btn = document.createElement('button');
            btn.textContent = month;
            btn.dataset.month = String(index + 1).padStart(2, '0');
            btn.addEventListener('click', () => this.selectMonth(index + 1));
            
            if (this.selectedMonth === index + 1) {
                btn.classList.add('selected');
            }
            
            monthGrid.appendChild(btn);
        });
    }
    
    selectYear(year) {
        this.selectedYear = year;
        this.selectedMonth = null; // Reset month when year changes
        
        // Update UI
        document.getElementById('year-chip-label').textContent = year;
        document.getElementById('month-chip-label').textContent = 'All Months';
        document.getElementById('month-chip')?.classList.remove('hidden');
        
        this.populateYearGrid();
        this.populateMonthGrid();
        this.updateActiveFilters();
        this.closePanel('year');
        
        // Trigger filter event
        this.triggerFilterChange();
    }
    
    selectMonth(month) {
        this.selectedMonth = month;
        
        // Update UI
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        document.getElementById('month-chip-label').textContent = months[month - 1];
        
        this.populateMonthGrid();
        this.updateActiveFilters();
        this.closePanel('month');
        
        // Trigger filter event
        this.triggerFilterChange();
    }
    
    populatePaperList(papers) {
        const paperList = document.getElementById('paper-list');
        if (!paperList) return;

        this.availablePapers = papers;

        // Remove papers that are no longer available from selection
        const availableSlugs = new Set(papers.map(p => p.slug));
        this.selectedPapers.forEach(slug => {
            if (!availableSlugs.has(slug)) {
                this.selectedPapers.delete(slug);
            }
        });

        paperList.innerHTML = '';

        papers.forEach(paper => {
            const item = document.createElement('div');
            item.className = 'paper-checkbox-item';
            if (this.selectedPapers.has(paper.slug)) {
                item.classList.add('selected');
            }
            
            item.innerHTML = `
                <div class="paper-checkbox">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                    </svg>
                </div>
                <span class="paper-name">${paper.title}</span>
                <span class="paper-count">${paper.count}</span>
            `;
            
            item.addEventListener('click', () => this.togglePaper(paper.slug, item));
            paperList.appendChild(item);
        });
        
        this.updatePaperCounts();
    }
    
    togglePaper(slug, item) {
        if (this.selectedPapers.has(slug)) {
            this.selectedPapers.delete(slug);
            item.classList.remove('selected');
        } else {
            this.selectedPapers.add(slug);
            item.classList.add('selected');
        }
        
        this.updatePaperCounts();
    }
    
    toggleSelectAll() {
        const btn = document.getElementById('paper-select-all');
        const allSelected = this.selectedPapers.size === this.availablePapers.length;
        
        if (allSelected) {
            // Deselect all
            this.selectedPapers.clear();
            document.querySelectorAll('.paper-checkbox-item').forEach(item => {
                item.classList.remove('selected');
            });
            btn.textContent = 'Select All';
        } else {
            // Select all
            this.availablePapers.forEach(paper => {
                this.selectedPapers.add(paper.slug);
            });
            document.querySelectorAll('.paper-checkbox-item').forEach(item => {
                item.classList.add('selected');
            });
            btn.textContent = 'Deselect All';
        }
        
        this.updatePaperCounts();
    }
    
    updatePaperCounts() {
        const totalCount = this.availablePapers.length;
        const selectedCount = this.selectedPapers.size;
        
        document.getElementById('filter-count').textContent = totalCount;
        document.getElementById('selected-count').textContent = selectedCount;
        
        const btn = document.getElementById('paper-select-all');
        if (btn) {
            btn.textContent = selectedCount === totalCount ? 'Deselect All' : 'Select All';
        }
    }
    
    filterPaperList(query) {
        const items = document.querySelectorAll('.paper-checkbox-item');
        const lowerQuery = query.toLowerCase();
        
        items.forEach(item => {
            const name = item.querySelector('.paper-name').textContent.toLowerCase();
            if (name.includes(lowerQuery)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    }
    
    applyPaperFilter() {
        const count = this.selectedPapers.size;
        if (count === 0 || count === this.availablePapers.length) {
            document.getElementById('paper-chip-label').textContent = 'All Papers';
        } else if (count === 1) {
            const slug = Array.from(this.selectedPapers)[0];
            const paper = this.availablePapers.find(p => p.slug === slug);
            document.getElementById('paper-chip-label').textContent = paper?.title || '1 Paper';
        } else {
            document.getElementById('paper-chip-label').textContent = `${count} Papers`;
        }
        
        this.updateActiveFilters();
        this.triggerFilterChange();
    }
    
    updateActiveFilters() {
        const container = document.getElementById('active-filters');
        const resetBtn = document.getElementById('filters-reset');
        
        if (!container) return;
        
        container.innerHTML = '';
        let hasFilters = false;
        
        // Add year tag
        if (this.selectedYear) {
            hasFilters = true;
            const tag = this.createFilterTag(this.selectedYear, () => {
                this.selectedYear = null;
                this.selectedMonth = null;
                document.getElementById('year-chip-label').textContent = 'All Years';
                document.getElementById('month-chip')?.classList.add('hidden');
                this.updateActiveFilters();
                this.populateYearGrid();
                this.triggerFilterChange();
            });
            container.appendChild(tag);
            
            // Add month tag if selected
            if (this.selectedMonth) {
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const tag = this.createFilterTag(months[this.selectedMonth - 1], () => {
                    this.selectedMonth = null;
                    document.getElementById('month-chip-label').textContent = 'All Months';
                    this.updateActiveFilters();
                    this.populateMonthGrid();
                    this.triggerFilterChange();
                });
                container.appendChild(tag);
            }
        }
        
        // Add paper tags
        if (this.selectedPapers.size > 0 && this.selectedPapers.size < this.availablePapers.length) {
            hasFilters = true;
            this.selectedPapers.forEach(slug => {
                const paper = this.availablePapers.find(p => p.slug === slug);
                if (paper) {
                    const tag = this.createFilterTag(paper.title, () => {
                        this.selectedPapers.delete(slug);
                        this.applyPaperFilter();
                        this.populatePaperList(this.availablePapers);
                    });
                    container.appendChild(tag);
                }
            });
        }
        
        // Show/hide reset button
        if (resetBtn) {
            if (hasFilters) {
                resetBtn.classList.remove('opacity-0', 'pointer-events-none');
                resetBtn.classList.add('opacity-100');
            } else {
                resetBtn.classList.add('opacity-0', 'pointer-events-none');
                resetBtn.classList.remove('opacity-100');
            }
        }
    }
    
    createFilterTag(label, onRemove) {
        const tag = document.createElement('div');
        tag.className = 'filter-tag';
        tag.innerHTML = `
            <span>${label}</span>
            <button class="filter-tag-remove" aria-label="Remove filter">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        `;
        
        tag.querySelector('.filter-tag-remove').addEventListener('click', onRemove);
        return tag;
    }
    
    clearAllFilters() {
        this.selectedYear = null;
        this.selectedMonth = null;
        this.selectedPapers.clear();
        
        document.getElementById('year-chip-label').textContent = 'All Years';
        document.getElementById('month-chip-label').textContent = 'All Months';
        document.getElementById('paper-chip-label').textContent = 'All Papers';
        document.getElementById('month-chip')?.classList.add('hidden');
        
        this.populateYearGrid();
        this.populateMonthGrid();
        this.populatePaperList(this.availablePapers);
        this.updateActiveFilters();
        this.triggerFilterChange();
    }
    
    triggerFilterChange() {
        // Dispatch custom event for the main app to listen to
        const event = new CustomEvent('filtersChanged', {
            detail: {
                year: this.selectedYear,
                month: this.selectedMonth,
                papers: Array.from(this.selectedPapers)
            }
        });
        document.dispatchEvent(event);
    }
    
    getFilters() {
        return {
            year: this.selectedYear,
            month: this.selectedMonth,
            papers: Array.from(this.selectedPapers)
        };
    }
}

// Export for use in main app
window.ModernFilters = new ModernFilterSystem();
