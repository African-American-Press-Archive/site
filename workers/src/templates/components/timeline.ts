import type { YearStat } from '../../types';

export function timeline(yearStats: YearStat[], selectedYear: number | null, baseUrl: string, totalIssues: number): string {
  if (yearStats.length === 0) return '';
  const maxCount = Math.max(...yearStats.map((s) => s.count));
  const maxBarHeight = 60;
  const minBarHeight = 4;
  const bars = yearStats.map((stat) => {
    const height = Math.max(minBarHeight, Math.round((stat.count / maxCount) * maxBarHeight));
    const selected = stat.year === selectedYear;
    const href = selected ? `/papers/${baseUrl}` : `/papers/${baseUrl}?year=${stat.year}`;
    return `<a href="${href}" class="timeline-bar-col ${selected ? 'selected' : ''}" data-year="${stat.year}" data-count="${stat.count}" title="${stat.year}: ${stat.count} issues"><div class="timeline-bar" style="height:${height}px"></div></a>`;
  });
  const labels = yearStats.filter((_, i) => i % 5 === 0 || i === yearStats.length - 1).map((s) => `<span class="timeline-label">${s.year}</span>`);
  return `<div class="timeline-scrubber"><div class="timeline-header"><span class="timeline-title">TIMELINE</span><span class="timeline-total">${totalIssues.toLocaleString()} issues</span></div><div class="timeline-bars">${bars.join('')}</div><div class="timeline-labels">${labels.join('')}</div></div>`;
}

export function monthPills(months: { month: number; count: number }[], selectedMonth: number | null, baseUrl: string): string {
  if (months.length === 0) return '';
  const sep = baseUrl.includes('?') ? '&' : '?';
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pills = months.map((m) => {
    const selected = m.month === selectedMonth;
    return `<a href="${baseUrl}${sep}month=${m.month}" class="month-pill ${selected ? 'selected' : ''}">${names[m.month - 1]} (${m.count})</a>`;
  });
  return `<div class="month-pills">${pills.join('')}</div>`;
}
