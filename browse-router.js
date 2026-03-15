// browse-router.js — URL routing, history management, view transitions

// Using var so BrowseRouter attaches to window (const doesn't in non-module scripts)
var BrowseRouter = {
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
