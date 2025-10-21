// ==================== CONFIG / CONSTANTS ====================
const CONFIG = {
    YEARS: { MIN: 1910, MAX: 1929 },
    ITEMS_PER_PAGE: 12,
    PRELOAD_PAGES: 2,
    DEBOUNCE_DELAY: 300,
    SPRING_DAMPING: 0.8,
    SPRING_STIFFNESS: 0.3,
};

const MONTHS = [
    { value: '01', label: 'Jan', full: 'January' },
    { value: '02', label: 'Feb', full: 'February' },
    { value: '03', label: 'Mar', full: 'March' },
    { value: '04', label: 'Apr', full: 'April' },
    { value: '05', label: 'May', full: 'May' },
    { value: '06', label: 'Jun', full: 'June' },
    { value: '07', label: 'Jul', full: 'July' },
    { value: '08', label: 'Aug', full: 'August' },
    { value: '09', label: 'Sep', full: 'September' },
    { value: '10', label: 'Oct', full: 'October' },
    { value: '11', label: 'Nov', full: 'November' },
    { value: '12', label: 'Dec', full: 'December' },
];

const INTRO_STORAGE_KEY = 'bpa_intro_seen_v1';

// ==================== STATE MANAGEMENT ====================
const state = {
    allIssues: [],
    filteredIssues: [],
    displayedIssues: [],
    selectedPapers: new Set(),
    selectedYear: null,
    selectedMonth: null,
    currentSort: 'date-asc',
    currentPage: 0,
    isLoading: false,
    searchQuery: '',

    // Viewer state
    currentIssueIndex: 0,
    currentPages: [],
    currentPageIndex: 0,
    pageCache: new Map(),
    thumbnailsVisible: false,
    zoomLevel: 1,

    // Timeline state
    yearCounts: new Map(),
    availableYears: [],
};

function resolveAssetPath(input) {
    if (!input) return '';
    if (/^https?:\/\//i.test(input)) {
        return input;
    }
    if (input.startsWith('/')) {
        return `web_content${input}`;
    }
    return `web_content/${input}`;
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
    await loadManifest();
    setupEventListeners();
    initializeIntersectionObserver();
    initializeTimeline();
});

// ==================== DATA LOADING ====================
async function loadManifest() {
    try {
        const response = await fetch('web_content/manifest.json');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Filter to only 1910-1929
        state.allIssues = data.filter(issue => {
            const year = parseInt(issue.date.split('-')[0]);
            return year >= CONFIG.YEARS.MIN && year <= CONFIG.YEARS.MAX;
        });

        // Sort by date ascending (oldest first)
        state.allIssues.sort((a, b) => new Date(a.date) - new Date(b.date));
        state.filteredIssues = [...state.allIssues];

        // Calculate year counts for timeline
        calculateYearCounts();

        // Initialize UI
        initializeFilters();

        const initializedRandomView = initializeRandomDefaultView();
        if (!initializedRandomView) {
            updateStats();
            renderGrid();
        }

        // Hide loading, show content
        hideElement('loading-state');
        showElement('grid-header');
        showElement('issue-grid-wrapper');
        maybeShowIntroOverlay();

    } catch (error) {
        console.error('Error loading manifest:', error);
        hideElement('loading-state');
        showElement('error-state');
    }
}

// ==================== TIMELINE CONTROLLER ====================
function initializeTimeline() {
    const slider = document.getElementById('year-slider');
    const ticksContainer = document.getElementById('year-ticks');
    const years = state.availableYears;

    if (!slider || !ticksContainer) {
        return;
    }

    slider.removeEventListener('input', handleYearSliderInput);
    slider.removeEventListener('change', handleYearSliderChange);

    ticksContainer.innerHTML = '';

    if (!years.length) {
        slider.disabled = true;
        return;
    }

    slider.disabled = false;
    slider.min = 0;
    slider.max = years.length - 1;
    slider.step = 1;

    let selectedIndex = 0;
    if (state.selectedYear) {
        const idx = years.indexOf(Number(state.selectedYear));
        if (idx >= 0) {
            selectedIndex = idx;
        }
    }

    slider.value = selectedIndex;

    years.forEach((year, index) => {
        const tick = document.createElement('span');
        tick.className = 'year-tick';
        tick.dataset.year = year;
        tick.dataset.index = index;
        tick.textContent = year;
        tick.tabIndex = 0;
        tick.setAttribute('role', 'option');
        tick.setAttribute('aria-label', `${year}`);
        tick.addEventListener('click', () => setYearFromIndex(index));
        tick.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setYearFromIndex(index);
            }
        });
        ticksContainer.appendChild(tick);
    });

    slider.addEventListener('input', handleYearSliderInput);
    slider.addEventListener('change', handleYearSliderChange);

    updateTimelineVisuals();
    renderTimelineMonths(state.selectedYear);
    updateTimelineLabel();
}

function setYearFromIndex(index, options = {}) {
    const years = state.availableYears;
    if (!years.length) return;

    const normalized = Math.max(0, Math.min(index, years.length - 1));
    const year = years[normalized];
    selectYear(year, { toggle: false, ...options });
    highlightYearTick(normalized);
    scrollYearIntoView(year);
}

function handleYearSliderInput(event) {
    const index = parseInt(event.target.value, 10);
    if (Number.isNaN(index)) return;
    setYearFromIndex(index, { fromSlider: true });
}

function handleYearSliderChange(event) {
    const index = parseInt(event.target.value, 10);
    if (Number.isNaN(index)) return;
    setYearFromIndex(index, { fromSlider: true });
}

function highlightYearTick(index) {
    const ticks = document.querySelectorAll('.year-tick');
    ticks.forEach((tick, idx) => {
        const isActive = state.selectedYear && Number(tick.dataset.year) === Number(state.selectedYear);
        tick.classList.toggle('active', isActive);
        tick.setAttribute('aria-selected', isActive ? 'true' : 'false');
        if (!state.selectedYear && idx === index) {
            tick.classList.remove('active');
        }
    });

    const slider = document.getElementById('year-slider');
    if (slider) {
        if (state.selectedYear) {
            const years = state.availableYears;
            const activeIndex = years.indexOf(Number(state.selectedYear));
            if (activeIndex >= 0) {
                slider.value = activeIndex;
            }
        } else {
            slider.value = 0;
        }
    }
}

function selectYear(year, options = {}) {
    const { toggle = true } = options;
    const yearStr = year !== null && year !== undefined ? String(year) : null;
    const timelineReset = document.getElementById('timeline-reset');
    let selectionChanged = false;

    if (yearStr === null) {
        if (state.selectedYear !== null) {
            state.selectedYear = null;
            state.selectedMonth = null;
            selectionChanged = true;
        }
    } else if (toggle && state.selectedYear === yearStr) {
        state.selectedYear = null;
        state.selectedMonth = null;
        selectionChanged = true;
    } else if (state.selectedYear !== yearStr) {
        state.selectedYear = yearStr;
        state.selectedMonth = null;
        selectionChanged = true;
    }

    if (state.selectedYear) {
        renderTimelineMonths(state.selectedYear);
        if (timelineReset) {
            timelineReset.style.opacity = '1';
            timelineReset.style.pointerEvents = 'all';
        }
    } else {
        renderTimelineMonths(null);
        if (timelineReset) {
            timelineReset.style.opacity = '0';
            timelineReset.style.pointerEvents = 'none';
        }
        const wrapper = document.getElementById('year-ticks')?.parentElement;
        if (wrapper) {
            wrapper.scrollTo({ left: 0, behavior: 'smooth' });
        }
    }

    updateTimelineLabel();
    updateTimelineVisuals();

    if (selectionChanged) {
        applyFilters();
    }
}

function updateTimelineVisuals() {
    const ticks = document.querySelectorAll('.year-tick');
    const selectedYear = state.selectedYear ? Number(state.selectedYear) : null;
    let selectedIndex = -1;

    ticks.forEach((tick, index) => {
        const tickYear = Number(tick.dataset.year);
        const isActive = selectedYear !== null && tickYear === selectedYear;
        tick.classList.toggle('active', isActive);
        tick.setAttribute('aria-selected', isActive ? 'true' : 'false');
        if (isActive) {
            selectedIndex = index;
        }
    });

    const slider = document.getElementById('year-slider');
    if (slider) {
        if (selectedIndex >= 0) {
            slider.value = selectedIndex;
        } else if (!state.selectedYear) {
            slider.value = 0;
        }
    }
}

function renderTimelineMonths(yearStr) {
    const container = document.getElementById('timeline-months');
    const monthCaption = document.getElementById('month-carousel-year');
    const monthCarousel = document.querySelector('.month-carousel');
    if (!container) return;

    container.innerHTML = '';

    if (!yearStr) {
        if (monthCaption) {
            monthCaption.textContent = 'All Years';
        }
        if (monthCarousel) {
            monthCarousel.classList.add('month-carousel--disabled');
        }
        return;
    }

    const issuesForYear = state.allIssues.filter(issue => issue.date.startsWith(String(yearStr)));
    const monthCounts = new Map();
    issuesForYear.forEach(issue => {
        const month = issue.date.slice(5, 7);
        monthCounts.set(month, (monthCounts.get(month) || 0) + 1);
    });

    const activeMonths = MONTHS.filter(({ value }) => monthCounts.get(value));

    if (monthCaption) {
        monthCaption.textContent = yearStr;
    }
    if (monthCarousel) {
        monthCarousel.classList.remove('month-carousel--disabled');
    }

    if (!activeMonths.length) {
        return;
    }

    const totalIssues = issuesForYear.length;

    const createMonthTile = ({ value, label, full }, count) => {
        const tile = document.createElement('span');
        tile.className = 'month-tile';
        tile.dataset.month = value;
        tile.dataset.count = count;
        tile.textContent = label;
        tile.tabIndex = 0;
        tile.setAttribute('role', 'option');
        tile.setAttribute('aria-label', `${full} ${yearStr} (${count} issues)`);
        const isActive = state.selectedMonth === value;
        tile.classList.toggle('active', isActive);
        tile.setAttribute('aria-selected', isActive ? 'true' : 'false');

        const toggleSelection = () => {
            state.selectedMonth = state.selectedMonth === value ? null : value;
            updateTimelineLabel();
            renderTimelineMonths(yearStr);
            applyFilters();
        };

        tile.addEventListener('click', toggleSelection);
        tile.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleSelection();
            }
        });

        return tile;
    };

    const allTile = document.createElement('span');
    allTile.className = 'month-tile';
    allTile.dataset.month = 'all';
    allTile.dataset.count = totalIssues;
    allTile.textContent = 'All';
    allTile.tabIndex = 0;
    allTile.setAttribute('role', 'option');
    const isAllActive = !state.selectedMonth;
    allTile.classList.toggle('active', isAllActive);
    allTile.setAttribute('aria-selected', isAllActive ? 'true' : 'false');
    allTile.setAttribute('aria-label', `All months ${yearStr}`);
    allTile.addEventListener('click', () => {
        state.selectedMonth = null;
        updateTimelineLabel();
        renderTimelineMonths(yearStr);
        applyFilters();
    });
    allTile.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            state.selectedMonth = null;
            updateTimelineLabel();
            renderTimelineMonths(yearStr);
            applyFilters();
        }
    });

    container.appendChild(allTile);

    activeMonths.forEach(monthInfo => {
        const count = monthCounts.get(monthInfo.value);
        container.appendChild(createMonthTile(monthInfo, count));
    });

    scrollMonthIntoView(state.selectedMonth || 'all');
}

function scrollMonthIntoView(monthValue) {
    const container = document.getElementById('timeline-months');
    if (!container) return;

    const targetValue = monthValue && monthValue !== 'all' ? monthValue : 'all';
    const tile = container.querySelector(`.month-tile[data-month="${targetValue}"]`);
    if (!tile) return;

    tile.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest'
    });
}

function updateTimelineLabel() {
    const label = document.getElementById('timeline-year-label');
    const gridTitle = document.getElementById('grid-title');
    if (!label || !gridTitle) {
        return;
    }

    if (!state.selectedYear) {
        label.textContent = 'All Years';
        gridTitle.textContent = 'All Issues';
        return;
    }

    if (state.selectedMonth) {
        const monthInfo = MONTHS.find(m => m.value === state.selectedMonth);
        const monthName = monthInfo ? monthInfo.full : state.selectedMonth;
        label.textContent = `${monthName} ${state.selectedYear}`;
        gridTitle.textContent = `Issues from ${monthName} ${state.selectedYear}`;
    } else {
        label.textContent = state.selectedYear;
        gridTitle.textContent = `Issues from ${state.selectedYear}`;
    }
}

function calculateYearCounts() {
    state.yearCounts.clear();

    state.allIssues.forEach(issue => {
        const year = parseInt(issue.date.slice(0, 4), 10);
        state.yearCounts.set(year, (state.yearCounts.get(year) || 0) + 1);
    });

    state.availableYears = Array.from(state.yearCounts.keys()).sort((a, b) => a - b);
}

function initializeRandomDefaultView() {
    if (!state.allIssues.length) {
        return false;
    }

    const randomIssue = state.allIssues[Math.floor(Math.random() * state.allIssues.length)];
    if (!randomIssue || !randomIssue.date) {
        return false;
    }

    const [year, month] = randomIssue.date.split('-');
    state.selectedYear = year;
    state.selectedMonth = month;

    const resetBtn = document.getElementById('timeline-reset');
    if (resetBtn) {
        resetBtn.style.opacity = '1';
        resetBtn.style.pointerEvents = 'all';
    }

    updateTimelineLabel();
    renderTimelineMonths(year);
    updateTimelineVisuals();
    scrollYearIntoView(year);
    applyFilters();

    return true;
}

function spinArchive() {
    // Don't spin if there are no available years
    if (!state.availableYears || state.availableYears.length === 0) {
        return;
    }

    // Randomly select a year
    const randomYear = state.availableYears[Math.floor(Math.random() * state.availableYears.length)];

    // Get all issues for the selected year
    const issuesForYear = state.allIssues.filter(issue => issue.date.startsWith(String(randomYear)));

    // Get all available months for that year
    const monthsWithIssues = new Set();
    issuesForYear.forEach(issue => {
        const month = issue.date.slice(5, 7);
        monthsWithIssues.add(month);
    });

    // Convert to array and randomly select a month
    const availableMonths = Array.from(monthsWithIssues);
    const randomMonth = availableMonths[Math.floor(Math.random() * availableMonths.length)];

    // Update state
    state.selectedYear = String(randomYear);
    state.selectedMonth = randomMonth;

    // Show the reset button
    const resetBtn = document.getElementById('timeline-reset');
    if (resetBtn) {
        resetBtn.style.opacity = '1';
        resetBtn.style.pointerEvents = 'all';
    }

    // Add spinning animation to the button
    const spinBtn = document.getElementById('spin-archive-btn');
    if (spinBtn) {
        spinBtn.classList.add('spinning');
        setTimeout(() => {
            spinBtn.classList.remove('spinning');
        }, 600);
    }

    // Update UI
    updateTimelineLabel();
    renderTimelineMonths(String(randomYear));
    updateTimelineVisuals();
    applyFilters();
    scrollYearIntoView(randomYear);
}

function scrollYearIntoView(year) {
    const ticksContainer = document.getElementById('year-ticks');
    if (!ticksContainer) return;

    const wrapper = ticksContainer.parentElement;
    if (!wrapper) return;

    const tick = ticksContainer.querySelector(`.year-tick[data-year="${year}"]`);
    if (!tick) return;

    const scrollLeft = tick.offsetLeft - (wrapper.clientWidth / 2) + (tick.offsetWidth / 2);

    wrapper.scrollTo({
        left: Math.max(scrollLeft, 0),
        behavior: 'smooth'
    });
}

function getHeroPeriodLabel() {
    if (state.selectedYear && state.selectedMonth) {
        const monthInfo = MONTHS.find(m => m.value === state.selectedMonth);
        const monthName = monthInfo ? monthInfo.full : state.selectedMonth;
        return `${monthName} ${state.selectedYear}`;
    }
    if (state.selectedYear) {
        return `${state.selectedYear}`;
    }
    return 'Archive Highlights';
}

function selectHeroIssues(sortedIssues) {
    if (!sortedIssues || !sortedIssues.length) {
        return [];
    }

    let pool = sortedIssues;

    if (state.selectedYear && state.selectedMonth) {
        const yearMonth = `${state.selectedYear}-${state.selectedMonth}`;
        pool = sortedIssues.filter(issue => issue.date.startsWith(yearMonth));
    } else if (state.selectedYear) {
        const yearPrefix = `${state.selectedYear}-`;
        pool = sortedIssues.filter(issue => issue.date.startsWith(yearPrefix));
    }

    if (!pool.length) {
        pool = sortedIssues;
    }

    const maxItems = Math.min(6, pool.length);
    const minItems = Math.min(3, pool.length);
    const desired = Math.max(minItems, Math.min(5, maxItems));

    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, desired);
}

function createHeroCard(issue) {
    const figure = document.createElement('figure');
    figure.className = 'hero-card';

    const thumbPath = resolveAssetPath(issue.issue_thumb);
    const date = new Date(issue.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    figure.innerHTML = `
        <img src="${thumbPath}" alt="${issue.title} - ${date}" loading="lazy" />
        <figcaption>
            <div class="hero-card-title">${issue.title}</div>
            <div class="hero-card-meta">${date}</div>
        </figcaption>
    `;

    figure.addEventListener('click', () => {
        const issueIndex = state.displayedIssues.findIndex(item => item.id === issue.id);
        if (issueIndex !== -1) {
            openViewer(issueIndex);
        }
    });

    return figure;
}

function updateHeroShowcase(sortedIssues, forceRefresh = false) {
    const heroSection = document.getElementById('newsstand-hero');
    const heroGrid = document.getElementById('hero-grid');
    const heroLabel = document.getElementById('hero-period-label');
    const heroClear = document.getElementById('hero-clear-btn');

    if (!heroSection || !heroGrid || !heroLabel) {
        return;
    }

    if (!forceRefresh && heroSection.dataset.initialized === 'true' && !state.selectedYear && !state.selectedMonth) {
        // If nothing has changed and hero is already showing archive highlights, skip redundant re-render.
        return;
    }

    const showcaseIssues = selectHeroIssues(sortedIssues);
    heroGrid.innerHTML = '';

    if (!showcaseIssues.length) {
        heroSection.classList.add('hidden');
        return;
    }

    heroSection.classList.remove('hidden');
    heroSection.dataset.initialized = 'true';
    heroLabel.textContent = getHeroPeriodLabel();

    showcaseIssues.forEach(issue => {
        heroGrid.appendChild(createHeroCard(issue));
    });

    if (heroClear) {
        if (state.selectedYear || state.selectedMonth) {
            heroClear.classList.remove('opacity-0', 'pointer-events-none');
        } else {
            heroClear.classList.add('opacity-0', 'pointer-events-none');
        }
    }
}

// ==================== FILTERS ====================
function initializeFilters() {
    const paperTitles = [...new Set(state.allIssues.map(issue => issue.title))].sort();
    paperTitles.forEach(title => state.selectedPapers.add(title));

    const filterList = document.getElementById('filter-list');
    document.getElementById('filter-count').textContent = paperTitles.length;

    // Add "All Papers" option
    filterList.innerHTML = `
        <label class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all" style="hover:background: var(--bg-hover);">
            <input
                type="checkbox"
                checked
                id="all-papers-checkbox"
                class="filter-checkbox w-4 h-4 rounded"
                style="border-color: var(--unc-basin-slate); accent-color: var(--unc-tile-teal);"
            />
            <span class="text-sm font-semibold" style="color: var(--unc-tile-teal);">All Papers</span>
        </label>
    `;

    // Add individual paper filters
    paperTitles.forEach(title => {
        const count = state.allIssues.filter(issue => issue.title === title).length;
        const filterId = `filter-${title.toLowerCase().replace(/\s+/g, '-')}`;

        const filterEl = document.createElement('label');
        filterEl.className = 'filter-label flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border border-transparent';
        filterEl.style.cssText = 'color: var(--text-secondary);';
        filterEl.innerHTML = `
            <input
                type="checkbox"
                id="${filterId}"
                checked
                class="filter-checkbox w-4 h-4 rounded"
                style="border-color: var(--unc-basin-slate); accent-color: var(--unc-tile-teal);"
                data-title="${title}"
            />
            <span class="flex-1 text-sm" style="color: var(--text-primary);">${title}</span>
            <span class="text-xs px-2 py-0.5 rounded-full" style="background: var(--bg-hover); color: var(--text-muted);">${count}</span>
        `;
        filterList.appendChild(filterEl);
    });

    // Add event listeners
    document.getElementById('all-papers-checkbox').addEventListener('change', toggleAllFilters);

    filterList.querySelectorAll('.filter-checkbox[data-title]').forEach(checkbox => {
        checkbox.addEventListener('change', () => togglePaperFilter(checkbox.dataset.title));
    });
}

function toggleAllFilters(event) {
    const checked = event.target.checked;
    const allCheckboxes = document.querySelectorAll('.filter-checkbox');

    allCheckboxes.forEach(cb => cb.checked = checked);

    if (checked) {
        const paperTitles = [...new Set(state.allIssues.map(issue => issue.title))];
        paperTitles.forEach(title => state.selectedPapers.add(title));
    } else {
        state.selectedPapers.clear();
    }

    applyFilters();
}

function togglePaperFilter(title) {
    if (state.selectedPapers.has(title)) {
        state.selectedPapers.delete(title);
    } else {
        state.selectedPapers.add(title);
    }

    // Update "All Papers" checkbox
    const allCheckbox = document.getElementById('all-papers-checkbox');
    const totalPapers = new Set(state.allIssues.map(issue => issue.title)).size;
    allCheckbox.checked = state.selectedPapers.size === totalPapers;

    applyFilters();
}

function resetFilters() {
    state.selectedYear = null;
    state.selectedMonth = null;
    const paperTitles = [...new Set(state.allIssues.map(issue => issue.title))];
    state.selectedPapers.clear();
    paperTitles.forEach(title => state.selectedPapers.add(title));

    // Reset all checkboxes
    document.querySelectorAll('.filter-checkbox').forEach(cb => cb.checked = true);

    // Reset timeline
    const timelineReset = document.getElementById('timeline-reset');
    if (timelineReset) {
        timelineReset.style.opacity = '0';
        timelineReset.style.pointerEvents = 'none';
    }

    highlightYearTick(0);
    renderTimelineMonths(null);
    updateTimelineLabel();
    updateTimelineVisuals();
    applyFilters();
}

function applyFilters() {
    state.filteredIssues = state.allIssues.filter(issue => {
        const matchesPaper = state.selectedPapers.size === 0 || state.selectedPapers.has(issue.title);
        const matchesYear = !state.selectedYear || issue.date.startsWith(state.selectedYear);
        const matchesMonth = !state.selectedMonth || !state.selectedYear ||
            issue.date.startsWith(`${state.selectedYear}-${state.selectedMonth}`);
        const matchesSearch = !state.searchQuery ||
            issue.title.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
            issue.date.includes(state.searchQuery);

        return matchesPaper && matchesYear && matchesMonth && matchesSearch;
    });

    state.currentPage = 0;
    updateStats();
    renderGrid();
}

// ==================== SEARCH ====================
let searchTimeout = null;

function handleSearch(query) {
    state.searchQuery = query.trim();

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        applyFilters();
    }, CONFIG.DEBOUNCE_DELAY);
}

// ==================== SORTING ====================
function handleSort() {
    state.currentSort = document.getElementById('sort-select').value;
    renderGrid();
}

function sortIssues(issues) {
    const sorted = [...issues];

    switch (state.currentSort) {
        case 'date-desc':
            sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
            break;
        case 'date-asc':
            sorted.sort((a, b) => new Date(a.date) - new Date(b.date));
            break;
        case 'title':
            sorted.sort((a, b) => a.title.localeCompare(b.title));
            break;
    }

    return sorted;
}

// ==================== GRID CONTROLLER ====================
function renderGrid(append = false) {
    const grid = document.getElementById('issue-grid');
    const wrapper = document.getElementById('issue-grid-wrapper');
    const emptyState = document.getElementById('empty-state');

    if (!grid || !wrapper) return;

    if (state.filteredIssues.length === 0) {
        wrapper.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    wrapper.classList.remove('hidden');
    emptyState.classList.add('hidden');

    const sorted = sortIssues(state.filteredIssues);
    const shouldRefreshHero = !append;

    if (!append) {
        state.currentPage = 0;
    }

    const startIndex = state.currentPage * CONFIG.ITEMS_PER_PAGE;
    const endIndex = startIndex + CONFIG.ITEMS_PER_PAGE;
    const itemsToRender = sorted.slice(startIndex, endIndex);

    state.displayedIssues = sorted;

    if (!append) {
        grid.innerHTML = '';
    }

    itemsToRender.forEach((issue, index) => {
        const globalIndex = startIndex + index;
        const card = createIssueCard(issue, globalIndex);
        grid.appendChild(card);
    });

    if (shouldRefreshHero) {
        updateHeroShowcase(sorted, true);
    }

    // Show/hide load more trigger
    const loadMoreTrigger = document.getElementById('load-more-trigger');
    if (endIndex < sorted.length) {
        loadMoreTrigger.classList.remove('hidden');
    } else {
        loadMoreTrigger.classList.add('hidden');
    }
}

function createIssueCard(issue, index) {
    const card = document.createElement('article');
    card.className = 'issue-card glass-card rounded-2xl overflow-hidden cursor-pointer';
    card.style.animationDelay = `${(index % CONFIG.ITEMS_PER_PAGE) * 0.05}s`;

    const thumbPath = resolveAssetPath(issue.issue_thumb);
    const date = new Date(issue.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    card.innerHTML = `
        <div class="aspect-[3/4] skeleton newsstand-thumbnail overflow-hidden" style="background: rgba(79, 117, 139, 0.1);">
            <img
                src="${thumbPath}"
                alt="${issue.title} - ${date}"
                class="w-full h-full object-cover transition-transform duration-500"
                loading="lazy"
                data-loaded="false"
            />
        </div>
        <div class="p-4 space-y-2">
            <h3 class="issue-card-title transition-colors" style="color: var(--unc-longleaf-pine);">
                ${issue.title}
            </h3>
            <p class="issue-card-date" style="color: var(--text-muted);">${date}</p>
        </div>
    `;

    // Image lazy loading
    const img = card.querySelector('img');
    img.addEventListener('load', () => {
        img.setAttribute('data-loaded', 'true');
        img.parentElement.classList.remove('skeleton');
    });

    img.addEventListener('error', () => {
        img.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='400'%3E%3Crect fill='%231E2238' width='300' height='400'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239CA3B4' font-family='sans-serif'%3EImage unavailable%3C/text%3E%3C/svg%3E`;
        img.setAttribute('data-loaded', 'true');
        img.parentElement.classList.remove('skeleton');
    });

    card.addEventListener('click', () => openViewer(index));

    return card;
}

// ==================== INFINITE SCROLL ====================
function initializeIntersectionObserver() {
    const loadMoreTrigger = document.getElementById('load-more-trigger');
    const spinner = loadMoreTrigger.querySelector('.loading-spinner');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !state.isLoading) {
                loadMoreItems();
            }
        });
    }, {
        rootMargin: '100px'
    });

    observer.observe(loadMoreTrigger);
}

function loadMoreItems() {
    const sorted = sortIssues(state.filteredIssues);
    const nextPage = state.currentPage + 1;
    const startIndex = nextPage * CONFIG.ITEMS_PER_PAGE;

    if (startIndex >= sorted.length) return;

    state.isLoading = true;
    const spinner = document.querySelector('#load-more-trigger .loading-spinner');
    if (spinner) spinner.classList.remove('hidden');

    // Simulate loading delay for smooth UX
    setTimeout(() => {
        state.currentPage = nextPage;
        renderGrid(true);
        state.isLoading = false;
        if (spinner) spinner.classList.add('hidden');
    }, 300);
}

// ==================== STATS ====================
function updateStats() {
    const issuesEl = document.getElementById('stat-issues');
    const papersEl = document.getElementById('stat-papers');
    const filteredEl = document.getElementById('stat-filtered');

    if (!issuesEl || !papersEl || !filteredEl) {
        return;
    }

    const paperCount = new Set(state.allIssues.map(issue => issue.title)).size;

    issuesEl.textContent = state.allIssues.length;
    papersEl.textContent = paperCount;
    filteredEl.textContent = state.filteredIssues.length;
}

// ==================== VIEWER CONTROLLER ====================
async function openViewer(index) {
    if (!state.displayedIssues.length) return;
    const issue = state.displayedIssues[index];
    if (!issue) return;

    state.currentIssueIndex = index;

    const modal = document.getElementById('viewer-modal');
    const title = document.getElementById('viewer-title');
    const dateEl = document.getElementById('viewer-date');

    const date = new Date(issue.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    title.textContent = issue.title;
    dateEl.textContent = date;

    // Show loading
    showElement('page-loading');

    // Discover pages for this issue
    state.currentPages = await discoverPages(issue);
    state.currentPageIndex = 0;

    // Show modal
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Setup UI based on whether we have multiple pages
    setupPageViewer();

    // Load first page
    await loadPage(0, 'fade');

    // Preload next pages
    for (let i = 1; i <= CONFIG.PRELOAD_PAGES && i < state.currentPages.length; i++) {
        preloadPage(i);
    }

    resetZoom();
    updateIssueNavigationButtons();
}

async function discoverPages(issue) {
    if (Array.isArray(issue.page_paths) && issue.page_paths.length) {
        return issue.page_paths;
    }

    const issueDir = issue.issue_thumb.substring(0, issue.issue_thumb.lastIndexOf('/'));
    const pages = [];

    for (let i = 1; i <= 50; i++) {
        const pageNum = String(i).padStart(2, '0');
        const pagePath = `${issueDir}/page_${pageNum}.jpg`;
        const fullPath = resolveAssetPath(pagePath);

        try {
            const exists = await checkImageExists(fullPath);
            if (exists) {
                pages.push(pagePath);
            } else {
                break;
            }
        } catch (e) {
            break;
        }
    }

    if (pages.length === 0) {
        pages.push(issue.issue_thumb);
    }

    return pages;
}

function checkImageExists(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
        setTimeout(() => resolve(false), 500);
    });
}

function setupPageViewer() {
    const hasMultiplePages = state.currentPages.length > 1;

    toggleElement('prev-page-btn', hasMultiplePages);
    toggleElement('next-page-btn', hasMultiplePages);
    toggleElement('page-indicator', hasMultiplePages);
    toggleElement('thumbnails-toggle', hasMultiplePages);
    toggleElement('progress-bar-container', hasMultiplePages);

    if (hasMultiplePages) {
        generateThumbnails();
    } else {
        hideElement('thumbnail-strip');
        state.thumbnailsVisible = false;
    }

    updatePageIndicator();
    updateProgressBar();
}

async function loadPage(pageIndex, transition = 'next') {
    if (pageIndex < 0 || pageIndex >= state.currentPages.length) return;

    state.currentPageIndex = pageIndex;
    const pagePath = state.currentPages[pageIndex];
    const fullPath = resolveAssetPath(pagePath);

    const image = document.getElementById('viewer-image');

    showElement('page-loading');

    // Remove old transition classes
    image.classList.remove('page-transition-next', 'page-transition-prev', 'page-transition-fade');

    // Fade out current image
    image.style.opacity = '0';

    await new Promise(resolve => setTimeout(resolve, 150));

    return new Promise((resolve) => {
        const tempImg = new Image();
        tempImg.onload = () => {
            image.src = tempImg.src;

            // Add transition class
            if (transition === 'next') {
                image.classList.add('page-transition-next');
            } else if (transition === 'prev') {
                image.classList.add('page-transition-prev');
            } else {
                image.classList.add('page-transition-fade');
            }

            image.style.opacity = '1';
            hideElement('page-loading');

            updatePageIndicator();
            updateProgressBar();
            updatePageNavigationButtons();
            updateThumbnailSelection();

            state.pageCache.set(pagePath, tempImg);
            resolve();
        };

        tempImg.onerror = () => {
            console.error('Failed to load page:', fullPath);
            hideElement('page-loading');
            resolve();
        };

        tempImg.src = fullPath;
    });
}

function navigatePage(direction) {
    const newIndex = state.currentPageIndex + direction;
    if (newIndex >= 0 && newIndex < state.currentPages.length) {
        const transition = direction > 0 ? 'next' : 'prev';
        loadPage(newIndex, transition);

        // Preload adjacent pages
        if (direction > 0 && newIndex + 1 < state.currentPages.length) {
            preloadPage(newIndex + 1);
        } else if (direction < 0 && newIndex - 1 >= 0) {
            preloadPage(newIndex - 1);
        }
    }
}

function preloadPage(pageIndex) {
    if (pageIndex < 0 || pageIndex >= state.currentPages.length) return;

    const pagePath = state.currentPages[pageIndex];
    if (state.pageCache.has(pagePath)) return;

    const fullPath = resolveAssetPath(pagePath);
    const img = new Image();
    img.onload = () => {
        state.pageCache.set(pagePath, img);
    };
    img.src = fullPath;
}

function updatePageIndicator() {
    if (state.currentPages.length > 1) {
        document.getElementById('current-page').textContent = state.currentPageIndex + 1;
        document.getElementById('total-pages').textContent = state.currentPages.length;
    }
}

function updateProgressBar() {
    if (state.currentPages.length > 1) {
        const progress = ((state.currentPageIndex + 1) / state.currentPages.length) * 100;
        document.getElementById('progress-bar').style.width = `${progress}%`;
    }
}

function updatePageNavigationButtons() {
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');

    if (state.currentPages.length > 1) {
        prevBtn.style.opacity = state.currentPageIndex > 0 ? '1' : '0.3';
        prevBtn.style.pointerEvents = state.currentPageIndex > 0 ? 'auto' : 'none';

        nextBtn.style.opacity = state.currentPageIndex < state.currentPages.length - 1 ? '1' : '0.3';
        nextBtn.style.pointerEvents = state.currentPageIndex < state.currentPages.length - 1 ? 'auto' : 'none';
    }
}

function closeViewer() {
    hideElement('viewer-modal');
    document.body.style.overflow = '';
    hideElement('thumbnail-strip');
    state.thumbnailsVisible = false;
    resetZoom();
    state.currentPages = [];
    state.currentPageIndex = 0;
}

function navigateIssue(direction) {
    if (!state.displayedIssues.length) return;
    const newIndex = state.currentIssueIndex + direction;
    if (newIndex >= 0 && newIndex < state.displayedIssues.length) {
        openViewer(newIndex);
    }
}

function updateIssueNavigationButtons() {
    const prevBtn = document.getElementById('prev-issue-btn');
    const nextBtn = document.getElementById('next-issue-btn');
    const atStart = state.currentIssueIndex <= 0;
    const atEnd = state.currentIssueIndex >= state.displayedIssues.length - 1;

    if (prevBtn) {
        prevBtn.style.opacity = atStart ? '0.3' : '1';
        prevBtn.style.pointerEvents = atStart ? 'none' : 'auto';
    }

    if (nextBtn) {
        nextBtn.style.opacity = atEnd ? '0.3' : '1';
        nextBtn.style.pointerEvents = atEnd ? 'none' : 'auto';
    }
}

// ==================== THUMBNAILS ====================
function generateThumbnails() {
    const container = document.getElementById('thumbnail-container');
    container.innerHTML = '';

    state.currentPages.forEach((pagePath, index) => {
        const thumb = document.createElement('div');
        thumb.className = 'thumbnail-item rounded-lg overflow-hidden bg-gray-800';
        thumb.style.width = '80px';
        thumb.style.height = '100px';
        thumb.style.flexShrink = '0';
        thumb.style.position = 'relative';

        const img = document.createElement('img');
        img.src = resolveAssetPath(pagePath);
        img.className = 'w-full h-full object-cover';
        img.alt = `Page ${index + 1}`;
        img.loading = 'lazy';

        thumb.appendChild(img);

        const overlay = document.createElement('div');
        overlay.className = 'absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs text-center py-1';
        overlay.textContent = index + 1;
        thumb.appendChild(overlay);

        thumb.addEventListener('click', () => {
            loadPage(index, 'fade');
        });

        container.appendChild(thumb);
    });

    updateThumbnailSelection();
}

function updateThumbnailSelection() {
    const thumbnails = document.querySelectorAll('.thumbnail-item');
    thumbnails.forEach((thumb, index) => {
        thumb.classList.toggle('active', index === state.currentPageIndex);
    });

    const activeThumb = thumbnails[state.currentPageIndex];
    if (activeThumb && state.thumbnailsVisible) {
        activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

function toggleThumbnails() {
    state.thumbnailsVisible = !state.thumbnailsVisible;
    const strip = document.getElementById('thumbnail-strip');
    strip.classList.toggle('hidden', !state.thumbnailsVisible);

    if (state.thumbnailsVisible) {
        updateThumbnailSelection();
    }
}

// ==================== ZOOM CONTROLS ====================
function zoomImage(direction) {
    const image = document.getElementById('viewer-image');

    if (direction > 0) {
        state.zoomLevel = Math.min(state.zoomLevel * 1.25, 3);
    } else {
        state.zoomLevel = Math.max(state.zoomLevel / 1.25, 1);
    }

    image.style.transform = `scale(${state.zoomLevel})`;
    image.style.cursor = state.zoomLevel > 1 ? 'zoom-out' : 'zoom-in';
}

function resetZoom() {
    state.zoomLevel = 1;
    const image = document.getElementById('viewer-image');
    image.style.transform = 'scale(1)';
    image.style.cursor = 'zoom-in';
}

// ==================== UTILITY FUNCTIONS ====================
function downloadCurrentPage() {
    if (state.currentPages.length === 0 || !state.displayedIssues.length) return;

    const issue = state.displayedIssues[state.currentIssueIndex];
    if (!issue) return;

    const pagePath = state.currentPages[state.currentPageIndex];
    const fullPath = resolveAssetPath(pagePath);

    const link = document.createElement('a');
    link.href = fullPath;
    link.download = `${issue.id}_page_${state.currentPageIndex + 1}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function toggleFullscreen() {
    const elem = document.getElementById('viewer-modal');

    if (!document.fullscreenElement) {
        elem.requestFullscreen().catch(err => {
            console.error('Error attempting to enable fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

function toggleHelp() {
    const helpOverlay = document.getElementById('help-overlay');
    helpOverlay.classList.toggle('hidden');
}

function showElement(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
}

function hideElement(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

function toggleElement(id, show) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !show);
}

// ==================== INTRO OVERLAY ====================
function showIntroOverlay() {
    const overlay = document.getElementById('intro-overlay');
    if (!overlay) return;

    overlay.classList.remove('hidden');
    requestAnimationFrame(() => {
        overlay.classList.add('active');
    });
    document.body.style.overflow = 'hidden';
}

function hideIntroOverlay(persist = true) {
    const overlay = document.getElementById('intro-overlay');
    if (!overlay) return;

    overlay.classList.remove('active');
    document.body.style.overflow = '';

    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 250);

    if (persist) {
        try {
            localStorage.setItem(INTRO_STORAGE_KEY, '1');
        } catch (error) {
            console.warn('Unable to persist intro overlay state:', error);
        }
    }
}

function maybeShowIntroOverlay() {
    const overlay = document.getElementById('intro-overlay');
    if (!overlay) return;

    try {
        if (localStorage.getItem(INTRO_STORAGE_KEY)) {
            overlay.classList.add('hidden');
            return;
        }
    } catch (error) {
        console.warn('Unable to access intro overlay preference:', error);
    }

    showIntroOverlay();
}

// Debounce utility
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==================== COLLAPSIBLE FILTER TOGGLE ====================
function setupFilterToggle() {
    const filterToggle = document.getElementById('filter-toggle');
    const filterSidebar = document.getElementById('filter-sidebar');
    const filterOverlay = document.getElementById('filter-overlay');
    const closeButton = document.querySelector('#filter-sidebar .close-filters');

    function openFilters() {
        filterSidebar.classList.add('open');
        filterOverlay.classList.add('visible');
        document.body.style.overflow = 'hidden';
    }

    function closeFilters() {
        filterSidebar.classList.remove('open');
        filterOverlay.classList.remove('visible');
        document.body.style.overflow = '';
    }

    if (filterToggle) {
        filterToggle.addEventListener('click', openFilters);
    }

    if (filterOverlay) {
        filterOverlay.addEventListener('click', closeFilters);
    }

    if (closeButton) {
        closeButton.addEventListener('click', closeFilters);
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && filterSidebar.classList.contains('open')) {
            closeFilters();
        }
    });
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // Setup collapsible filter toggle
    setupFilterToggle();

    // Header shrink on scroll with parallax
    let lastScroll = 0;
    const header = document.getElementById('main-header');

    window.addEventListener('scroll', debounce(() => {
        const currentScroll = window.pageYOffset;

        if (currentScroll > 100) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }

        lastScroll = currentScroll;
    }, 10));

    // Search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => handleSearch(e.target.value));
    }

    // Sort select
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', handleSort);
    }

    // Reset filters button
    const resetBtn = document.getElementById('reset-filters-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetFilters);
    }

    // Spin the Archive button
    const spinArchiveBtn = document.getElementById('spin-archive-btn');
    if (spinArchiveBtn) {
        spinArchiveBtn.addEventListener('click', spinArchive);
    }

    // Timeline reset button
    const timelineReset = document.getElementById('timeline-reset');
    if (timelineReset) {
        timelineReset.addEventListener('click', () => {
            state.selectedYear = null;
            state.selectedMonth = null;
            renderTimelineMonths(null);
            updateTimelineVisuals();
            updateTimelineLabel();
            applyFilters();
            timelineReset.style.opacity = '0';
            timelineReset.style.pointerEvents = 'none';
        });
    }

    const heroClearBtn = document.getElementById('hero-clear-btn');
    if (heroClearBtn) {
        heroClearBtn.addEventListener('click', () => {
            state.selectedYear = null;
            state.selectedMonth = null;
            renderTimelineMonths(null);
            updateTimelineVisuals();
            updateTimelineLabel();
            applyFilters();
            heroClearBtn.classList.add('opacity-0', 'pointer-events-none');
            if (timelineReset) {
                timelineReset.style.opacity = '0';
                timelineReset.style.pointerEvents = 'none';
            }
        });
    }

    const introStartBtn = document.getElementById('intro-start-btn');
    if (introStartBtn) {
        introStartBtn.addEventListener('click', () => hideIntroOverlay(true));
    }

    const introCloseBtn = document.getElementById('intro-close-btn');
    if (introCloseBtn) {
        introCloseBtn.addEventListener('click', () => hideIntroOverlay(true));
    }

    const introBackdrop = document.querySelector('#intro-overlay .intro-backdrop');
    if (introBackdrop) {
        introBackdrop.addEventListener('click', () => hideIntroOverlay(true));
    }

    // Retry button
    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => location.reload());
    }

    // Viewer controls
    document.getElementById('close-viewer-btn')?.addEventListener('click', closeViewer);
    document.getElementById('viewer-backdrop')?.addEventListener('click', closeViewer);
    document.getElementById('help-btn')?.addEventListener('click', toggleHelp);
    document.getElementById('close-help-btn')?.addEventListener('click', toggleHelp);
    document.getElementById('download-btn')?.addEventListener('click', downloadCurrentPage);
    document.getElementById('thumbnails-toggle')?.addEventListener('click', toggleThumbnails);
    document.getElementById('prev-page-btn')?.addEventListener('click', () => navigatePage(-1));
    document.getElementById('next-page-btn')?.addEventListener('click', () => navigatePage(1));
    document.getElementById('prev-issue-btn')?.addEventListener('click', () => navigateIssue(-1));
    document.getElementById('next-issue-btn')?.addEventListener('click', () => navigateIssue(1));
    document.getElementById('zoom-in-btn')?.addEventListener('click', () => zoomImage(1));
    document.getElementById('zoom-out-btn')?.addEventListener('click', () => zoomImage(-1));
    document.getElementById('zoom-reset-btn')?.addEventListener('click', resetZoom);

    // Image click to zoom
    const viewerImage = document.getElementById('viewer-image');
    if (viewerImage) {
        viewerImage.addEventListener('click', () => {
            if (state.zoomLevel === 1) {
                zoomImage(1);
            } else {
                resetZoom();
            }
        });

        viewerImage.addEventListener('dblclick', toggleFullscreen);
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        const introOverlay = document.getElementById('intro-overlay');
        const overlayActive = introOverlay && introOverlay.classList.contains('active') && !introOverlay.classList.contains('hidden');
        if (overlayActive) {
            if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
                hideIntroOverlay(true);
            }
            e.preventDefault();
            return;
        }

        const modal = document.getElementById('viewer-modal');
        if (!modal.classList.contains('hidden')) {
            if (e.key === 'Escape') {
                closeViewer();
                return;
            }

            if (e.key === 'ArrowLeft') {
                if (state.currentPages.length > 1) {
                    navigatePage(-1);
                } else {
                    navigateIssue(-1);
                }
                e.preventDefault();
            }

            if (e.key === 'ArrowRight') {
                if (state.currentPages.length > 1) {
                    navigatePage(1);
                } else {
                    navigateIssue(1);
                }
                e.preventDefault();
            }

            if (e.key === 'Home' && state.currentPages.length > 1) {
                loadPage(0, 'fade');
                e.preventDefault();
            }

            if (e.key === 'End' && state.currentPages.length > 1) {
                loadPage(state.currentPages.length - 1, 'fade');
                e.preventDefault();
            }

            if (e.key === '+' || e.key === '=') {
                zoomImage(1);
                e.preventDefault();
            }

            if (e.key === '-' || e.key === '_') {
                zoomImage(-1);
                e.preventDefault();
            }

            if (e.key === '0') {
                resetZoom();
                e.preventDefault();
            }

            if (e.key === 't' || e.key === 'T') {
                if (state.currentPages.length > 1) {
                    toggleThumbnails();
                }
                e.preventDefault();
            }

            if (e.key === 'f' || e.key === 'F') {
                toggleFullscreen();
                e.preventDefault();
            }

            if (e.key === 'd' || e.key === 'D') {
                downloadCurrentPage();
                e.preventDefault();
            }

            if (e.key === '?' || e.key === '/') {
                toggleHelp();
                e.preventDefault();
            }
        }
    });

    // Swipe gestures for mobile
    let touchStartX = 0;
    let touchEndX = 0;

    viewerImage?.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });

    viewerImage?.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    });

    function handleSwipe() {
        const swipeThreshold = 50;
        const diff = touchStartX - touchEndX;

        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                // Swipe left - next page
                if (state.currentPages.length > 1) {
                    navigatePage(1);
                } else {
                    navigateIssue(1);
                }
            } else {
                // Swipe right - previous page
                if (state.currentPages.length > 1) {
                    navigatePage(-1);
                } else {
                    navigateIssue(-1);
                }
            }
        }
    }
}
