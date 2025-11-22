// Load the base app.js functionality, then override the filter system
document.write('<script src="app.js"><\/script>');
document.write('<script src="filters-modern.js"><\/script>');

// Override filter initialization when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for manifest to load
    const checkManifest = setInterval(() => {
        if (window.state && window.state.allIssues && window.state.allIssues.length > 0) {
            clearInterval(checkManifest);
            initializeModernFilters();
        }
    }, 100);
});

function initializeModernFilters() {
    // Get unique papers from manifest
    const paperCounts = new Map();
    window.state.allIssues.forEach(issue => {
        const slug = issue.title.toLowerCase().replace(/\s+/g, '-');
        const count = (paperCounts.get(slug) || 0) + 1;
        paperCounts.set(slug, { 
            title: issue.title, 
            slug,
            count 
        });
    });
    
    const papers = Array.from(paperCounts.values()).sort((a, b) => 
        a.title.localeCompare(b.title)
    );
    
    // Populate paper list
    window.ModernFilters.populatePaperList(papers);
    
    // Listen for filter changes
    document.addEventListener('filtersChanged', (e) => {
        const { year, month, papers } = e.detail;
        
        // Update main app state
        window.state.selectedYear = year;
        window.state.selectedMonth = month ? String(month).padStart(2, '0') : null;
        window.state.selectedPapers.clear();
        papers.forEach(p => window.state.selectedPapers.add(p));
        
        // Trigger filter update
        if (window.applyFilters) {
            window.applyFilters();
        }
    });
}
