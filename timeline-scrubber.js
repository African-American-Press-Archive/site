// timeline-scrubber.js — Reusable timeline bar chart component

const TimelineScrubber = {
    MAX_BAR_HEIGHT: 60,
    MIN_BAR_HEIGHT: 4,
    YEAR_MIN: 1905,
    YEAR_MAX: 1929,

    /**
     * Render the timeline scrubber into a container element.
     * @param {HTMLElement} container - The element to render into
     * @param {Map<number, number>} yearCounts - Map of year -> issue count
     * @param {object} options
     * @param {number|null} options.selectedYear - Currently selected year
     * @param {string} options.label - Label text (e.g., "Timeline" or "Timeline — All Papers")
     * @param {number} options.totalIssues - Total issue count to display
     * @param {function} options.onYearSelect - Callback(year) when a year is clicked
     */
    render(container, yearCounts, options = {}) {
        const {
            selectedYear = null,
            label = 'Timeline',
            totalIssues = 0,
            onYearSelect = () => {},
        } = options;

        const maxCount = Math.max(...Array.from(yearCounts.values()), 1);

        // Build bars HTML
        let barsHtml = '';
        let labelsHtml = '';

        for (let year = this.YEAR_MIN; year <= this.YEAR_MAX; year++) {
            const count = yearCounts.get(year) || 0;
            const isSelected = year === selectedYear;

            let heightPx = 0;
            if (count > 0) {
                heightPx = Math.max(
                    this.MIN_BAR_HEIGHT,
                    Math.round((count / maxCount) * this.MAX_BAR_HEIGHT)
                );
            }

            const barColor = isSelected
                ? 'var(--unc-longleaf-pine)'
                : count > 0 ? '#c4ddd9' : 'transparent';

            const cursor = count > 0 ? 'cursor:pointer;' : '';
            const yearShort = String(year).slice(2);
            const labelColor = isSelected ? 'color:var(--unc-longleaf-pine);font-weight:600;' : 'color:#aaa;';

            barsHtml += `<div class="timeline-bar-col" data-year="${year}" data-count="${count}"
                style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;${cursor}"
                title="${count > 0 ? year + ' — ' + count + ' issue' + (count !== 1 ? 's' : '') : year + ' — no issues'}"
                ${count > 0 ? `role="option" tabindex="0" aria-label="${year}, ${count} issues${isSelected ? ', selected' : ''}" aria-selected="${isSelected}"` : ''}>
                <div class="timeline-bar" style="width:100%;border-radius:2px 2px 0 0;height:${heightPx}px;background:${barColor};transition:background 0.15s,height 0.15s;"></div>
            </div>`;

            labelsHtml += `<div style="flex:1;text-align:center;font-size:9px;${labelColor}">${year}</div>`;
        }

        container.innerHTML = `
            <div class="timeline-scrubber" style="background:white;border-radius:10px;padding:16px 20px;border:1px solid #e8e0d4;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <span style="font-size:12px;font-weight:600;color:var(--unc-longleaf-pine);text-transform:uppercase;letter-spacing:0.5px;">${label}</span>
                    <span style="font-size:12px;color:var(--text-muted);">${totalIssues.toLocaleString()} issues total</span>
                </div>
                <div class="timeline-bars" style="display:flex;align-items:flex-end;gap:2px;height:${this.MAX_BAR_HEIGHT}px;margin-bottom:4px;" role="listbox" aria-label="Select year">
                    ${barsHtml}
                </div>
                <div class="timeline-labels" style="display:flex;gap:2px;">
                    ${labelsHtml}
                </div>
            </div>
        `;

        // Click handlers
        container.querySelectorAll('.timeline-bar-col[data-count]').forEach(col => {
            const count = parseInt(col.dataset.count, 10);
            if (count === 0) return;

            const year = parseInt(col.dataset.year, 10);
            col.addEventListener('click', () => {
                // Toggle: if already selected, deselect (pass null)
                onYearSelect(year === selectedYear ? null : year);
            });
            col.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onYearSelect(year === selectedYear ? null : year);
                }
            });
        });
    },
};

/**
 * Render month pills into a container.
 * @param {HTMLElement} container - Element to render into
 * @param {Array} issues - Issues for the selected year
 * @param {object} options
 * @param {string|null} options.selectedMonth - Currently selected month ('01'-'12')
 * @param {function} options.onMonthSelect - Callback(monthValue) when a pill is clicked
 */
TimelineScrubber.renderMonthPills = function(container, issues, options = {}) {
    const { selectedMonth = null, onMonthSelect = () => {} } = options;

    const MONTHS = [
        { value: '01', label: 'Jan' }, { value: '02', label: 'Feb' },
        { value: '03', label: 'Mar' }, { value: '04', label: 'Apr' },
        { value: '05', label: 'May' }, { value: '06', label: 'Jun' },
        { value: '07', label: 'Jul' }, { value: '08', label: 'Aug' },
        { value: '09', label: 'Sep' }, { value: '10', label: 'Oct' },
        { value: '11', label: 'Nov' }, { value: '12', label: 'Dec' },
    ];

    // Count issues per month
    const monthCounts = new Map();
    for (const issue of issues) {
        const month = issue.date.slice(5, 7);
        monthCounts.set(month, (monthCounts.get(month) || 0) + 1);
    }

    let html = '<div class="month-pills" style="display:flex;gap:6px;flex-wrap:wrap;">';

    for (const m of MONTHS) {
        const count = monthCounts.get(m.value) || 0;
        if (count === 0) continue;

        const isSelected = m.value === selectedMonth;
        const bg = isSelected ? 'var(--unc-longleaf-pine)' : '#e8e0d4';
        const color = isSelected ? 'white' : 'var(--text-muted)';
        const weight = isSelected ? 'font-weight:500;' : '';

        html += `<button class="month-pill" data-month="${m.value}"
            style="padding:4px 12px;border-radius:16px;font-size:12px;background:${bg};color:${color};${weight}border:none;cursor:pointer;transition:background 0.15s,color 0.15s;"
            aria-pressed="${isSelected}">${m.label} (${count})</button>`;
    }

    html += '</div>';
    container.innerHTML = html;

    // Click handlers
    container.querySelectorAll('.month-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const month = pill.dataset.month;
            onMonthSelect(month === selectedMonth ? null : month);
        });
    });
};
