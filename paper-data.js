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
        'Voice of the People': 'Laurel, Mississippi',
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
