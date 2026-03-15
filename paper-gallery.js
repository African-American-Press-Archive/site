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
                    <div class="flex justify-between items-baseline mb-2">
                        <h3 class="text-base font-semibold" style="color: var(--text-primary); font-family: var(--font-display);">
                            ${paper.title}
                        </h3>
                        <span class="text-xs ml-2 flex-shrink-0" style="color: var(--text-muted);">${paper.location}</span>
                    </div>
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
