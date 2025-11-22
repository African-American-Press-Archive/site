// Modern Filter Integration with Main App
// This bridges the new filter UI with the existing app.js functionality

// Wait for both the main app and manifest to be ready
let appReady = false;
let manifestReady = false;

// Check when app.js state is initialized
const checkAppReady = setInterval(() => {
    if (window.state && window.applyFilters) {
        appReady = true;
        if (manifestReady) {
            clearInterval(checkAppReady);
            initializeModernFilters();
        }
    }
}, 50);

// Check when manifest is loaded
const checkManifestReady = setInterval(() => {
    if (window.state && window.state.allIssues && window.state.allIssues.length > 0) {
        manifestReady = true;
        if (appReady) {
            clearInterval(checkManifestReady);
            initializeModernFilters();
        }
    }
}, 50);

function initializeModernFilters() {
    console.log('Initializing modern filters with', window.state.allIssues.length, 'issues');

    // Initial population of filters
    updateAvailableFilters();

    // Listen for filter changes from the modern UI
    document.addEventListener('filtersChanged', (e) => {
        const { year, month, papers } = e.detail;

        console.log('Filters changed:', { year, month, papers });

        // Update main app state
        window.state.selectedYear = year;
        window.state.selectedMonth = month ? String(month).padStart(2, '0') : null;
        window.state.selectedPapers.clear();

        // Map paper slugs to titles (app.js uses titles, not slugs)
        papers.forEach(slug => {
            // Find the paper title from the slug
            const issue = window.state.allIssues.find(i => {
                const issueSlug = i.title.toLowerCase().replace(/\s+/g, '-');
                return issueSlug === slug;
            });
            if (issue) {
                window.state.selectedPapers.add(issue.title);
            }
        });

        console.log('Updated state.selectedPapers:', Array.from(window.state.selectedPapers));

        // Apply filters using main app's function
        window.applyFilters();

        // Update available filter options based on new selection
        updateAvailableFilters();
    });

    // Listen for when year/month changes to update available papers
    window.ModernFilters.onYearChange = updateAvailableFilters;
    window.ModernFilters.onMonthChange = updateAvailableFilters;
}

function updateAvailableFilters() {
    const filters = window.ModernFilters.getFilters();
    let filteredIssues = window.state.allIssues;

    // Filter issues based on current year/month selection
    if (filters.year) {
        filteredIssues = filteredIssues.filter(issue => {
            const issueYear = parseInt(issue.date.substring(0, 4));
            return issueYear === filters.year;
        });

        if (filters.month) {
            filteredIssues = filteredIssues.filter(issue => {
                const issueMonth = parseInt(issue.date.substring(5, 7));
                return issueMonth === filters.month;
            });
        }
    }

    // Get unique papers from filtered issues
    const paperCounts = new Map();
    filteredIssues.forEach(issue => {
        const slug = issue.title.toLowerCase().replace(/\s+/g, '-').replace(/\./g, '');
        const existing = paperCounts.get(slug);
        if (existing) {
            existing.count++;
        } else {
            paperCounts.set(slug, {
                title: issue.title,
                slug,
                count: 1
            });
        }
    });

    const availablePapers = Array.from(paperCounts.values()).sort((a, b) =>
        a.title.localeCompare(b.title)
    );

    console.log('Available papers for current filters:', availablePapers.length);

    // Update paper list in the modern filter UI
    window.ModernFilters.populatePaperList(availablePapers);

    // Also update available years and months based on selected papers
    updateAvailableYears();
    updateAvailableMonths();
}

function updateAvailableYears() {
    const filters = window.ModernFilters.getFilters();
    let filteredIssues = window.state.allIssues;

    // Filter by selected papers if any
    if (filters.papers && filters.papers.length > 0) {
        filteredIssues = filteredIssues.filter(issue => {
            const slug = issue.title.toLowerCase().replace(/\s+/g, '-').replace(/\./g, '');
            return filters.papers.includes(slug);
        });
    }

    // Get available years
    const yearCounts = new Map();
    filteredIssues.forEach(issue => {
        const year = parseInt(issue.date.substring(0, 4));
        yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
    });

    // Mark unavailable years in the grid
    const yearButtons = document.querySelectorAll('#year-grid button');
    yearButtons.forEach(btn => {
        const year = parseInt(btn.dataset.year);
        const count = yearCounts.get(year) || 0;

        if (count === 0 && filters.papers.length > 0) {
            btn.classList.add('disabled');
            btn.disabled = true;
        } else {
            btn.classList.remove('disabled');
            btn.disabled = false;
        }
    });
}

function updateAvailableMonths() {
    const filters = window.ModernFilters.getFilters();

    // Only filter months if a year is selected
    if (!filters.year) {
        // Enable all months
        const monthButtons = document.querySelectorAll('#month-grid button');
        monthButtons.forEach(btn => {
            btn.classList.remove('disabled');
            btn.disabled = false;
        });
        return;
    }

    let filteredIssues = window.state.allIssues;

    // Filter by year
    filteredIssues = filteredIssues.filter(issue => {
        const year = parseInt(issue.date.substring(0, 4));
        return year === filters.year;
    });

    // Filter by selected papers if any
    if (filters.papers && filters.papers.length > 0) {
        filteredIssues = filteredIssues.filter(issue => {
            const slug = issue.title.toLowerCase().replace(/\s+/g, '-').replace(/\./g, '');
            return filters.papers.includes(slug);
        });
    }

    // Get available months
    const monthCounts = new Map();
    filteredIssues.forEach(issue => {
        const month = parseInt(issue.date.substring(5, 7));
        monthCounts.set(month, (monthCounts.get(month) || 0) + 1);
    });

    // Mark unavailable months in the grid
    const monthButtons = document.querySelectorAll('#month-grid button');
    monthButtons.forEach(btn => {
        const month = parseInt(btn.dataset.month);
        const count = monthCounts.get(month) || 0;

        if (count === 0) {
            btn.classList.add('disabled');
            btn.disabled = true;
        } else {
            btn.classList.remove('disabled');
            btn.disabled = false;
        }
    });
}
