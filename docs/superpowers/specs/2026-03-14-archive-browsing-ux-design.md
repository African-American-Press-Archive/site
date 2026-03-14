# Archive Browsing UX Redesign

**Date:** 2026-03-14
**Status:** Approved

## Problem

The current browsing experience below the "Today in History" hero has several UX issues:

- **No paper-first path:** Users who want to browse a specific newspaper (e.g., Chicago Defender) must use a checkbox filter panel with an Apply button — there's no way to click a paper name and immediately see its issues.
- **Clunky filter workflow:** The year pill grid (25 flat pills) and paper checkbox list require multiple clicks and give no sense of collection density or date coverage.
- **Poor orientation:** The grid shows a random month/year on first load with no result counts, no context about what's available, and no breadcrumbs.
- **No timeline navigation:** When browsing hundreds of issues from a single paper, users must infinite-scroll through all of them with no way to jump to a specific period.

## Design

Replace the filter bar and initial grid with a three-level navigation flow. The "Today in History" hero section and the issue viewer modal are unchanged.

### Navigation Flow

```
Landing Page
  └─ Today in History Hero (unchanged)
  └─ Paper Gallery (new default browse view)
       ├─ click paper card → Paper Detail View
       └─ click "browse by date" → Cross-Paper Date Browse
            └─ click issue card → Issue Viewer Modal (unchanged)
```

### Component 1: Paper Gallery

The new default view below the hero. Replaces the filter bar + random month grid.

**Layout:** A grid of 41 newspaper cards (3 columns desktop, 2 tablet, 1 mobile).

**Each card shows:**
- Masthead thumbnail — top third of a random front page, displayed via CSS `object-position: top` on an existing issue thumbnail
- Paper name (e.g., "Chicago Defender")
- City and state (e.g., "Chicago, Illinois")
- Date range (e.g., "1909–1929")
- Issue count (e.g., "1,847 issues")

**Features:**
- Search input to filter cards by paper name or city
- Default sort: by issue count (largest first), with option to sort alphabetically
- All 41 cards visible without pagination
- Heading: "Browse by Paper" with a link: "or browse all issues by date →"

**Data source:** Paper names, date ranges, and issue counts computed from the manifest at load time. City/state added as a small client-side lookup table (or added to `config/papers.yaml` and included in the manifest). Masthead thumbnails use existing `issue_thumb` URLs with CSS cropping.

**Masthead thumbnail selection:** Use the first issue (by date) for each paper — deterministic across page loads.

**Clicking a card** transitions to the Paper Detail View and updates the URL to `?paper=<slug>`.

### Component 2: Paper Detail View

Shown after clicking a paper card in the gallery.

**Header:**
- Breadcrumb: "All Papers › Chicago Defender" — clicking "All Papers" returns to the gallery
- Paper name, city/state, total issue count, date range
- Masthead thumbnail alongside the title

**Timeline Scrubber:**
- Horizontal bar chart spanning the paper's date range
- Each bar represents one year; bar height is proportional to the number of issues that year
- Hover shows tooltip: "1918 — 52 issues"
- Click a year to filter the grid to that year (bar turns dark green, year label highlights)
- Click the selected year again to deselect (show all years)
- Coverage gaps are visible as missing bars

**Month Pills:**
- Appear below the timeline when a year is selected
- 12 pills (Jan–Dec), each showing issue count in parentheses: "Mar (5)"
- Grayed out / hidden for months with no issues
- Click a month to filter further; click again to deselect

**Result Header:**
- Always visible below the month pills
- Format: "March 1918 · 5 issues" or "1918 · 52 issues" or "All years · 1,847 issues"
- Sort dropdown: Oldest First, Newest First

**Issue Grid:**
- Same card design as current (thumbnail, paper name, date)
- Infinite scroll for loading more
- Clicking an issue card opens the existing viewer modal

**URL scheme:**
- `?paper=chicago-defender` — all years
- `?paper=chicago-defender&year=1918` — filtered to 1918
- `?paper=chicago-defender&year=1918&month=03` — March 1918
- Browser back button works naturally through each step

### Component 3: Cross-Paper Date Browse

Accessed via "Browse all issues by date →" from the gallery. An improved version of the current filter experience for queries like "show me everything from March 1919."

**Layout:** Same structure as Paper Detail View (breadcrumb, timeline, month pills, result header, grid) with two differences:

1. **Timeline shows all papers combined** — bar heights reflect total issues across all 41 papers per year
2. **Compact paper filter dropdown** — a "All 41 Papers ▼" button that opens a searchable multi-select dropdown overlay. Users can toggle individual papers on/off; the grid and timeline update immediately as papers are toggled (no Apply button needed). The dropdown shows checkmarks next to selected papers. The result header updates to reflect the filtered count (e.g., "85 issues across 3 papers"). Selecting a single paper does NOT navigate to the Paper Detail View — it stays in Date Browse with just that paper's issues shown alongside the cross-paper timeline for context.

**Breadcrumb:** "All Papers › All Issues by Date"

**Result header format:** "March 1919 · 85 issues across 28 papers"

**Sort options:** Oldest First, Newest First, By Title (useful for grouping by paper)

**URL scheme:**
- `?view=date` — all issues, no date filter
- `?view=date&year=1919` — all issues from 1919
- `?view=date&year=1919&month=03` — March 1919

### Paper Slugs

Slugs are sourced from `web_content/manifests/index.json`, which contains an authoritative `slug` field for each paper (e.g., `"amsterdam-news"`, `"st-louis-argus"`, `"broad-ax"`). These slugs are loaded once at startup and used for all URL generation. No runtime slugification from titles.

At manifest load time, build a `Map<slug, title>` and `Map<title, slug>` for bidirectional lookup.

### Backward Compatibility for `?paper=&date=` Deep Links

The existing URL pattern `?paper=X&date=YYYY-MM-DD&page=N` currently opens the viewer directly. This behavior is preserved: if both `paper` and `date` params are present, the app opens the Paper Detail View and immediately opens the viewer for the matching issue. The `?paper=X` param alone (without `date`) now shows the Paper Detail View instead of filtering the old grid.

### History Management

View transitions push new history entries; filter refinements replace the current entry:

| Action | History Method |
|--------|---------------|
| Gallery → Paper Detail | `pushState` |
| Gallery → Date Browse | `pushState` |
| Paper Detail / Date Browse → Viewer | `pushState` (existing behavior) |
| Select year in timeline | `replaceState` |
| Select month pill | `replaceState` |
| Breadcrumb navigation | `pushState` |

Gallery scroll position is saved before navigating away and restored on back navigation via `popstate`.

### Component 4: Timeline Scrubber (Reusable)

A single reusable component used in both Paper Detail View and Cross-Paper Date Browse. Accepts an array of issues and renders the density bar chart.

**Input:** Array of issues (either from one paper or all papers)

**Renders:**
- Horizontal bar chart with one bar per year that has issues
- Year labels below the bars (abbreviated: '05, '06, ... '29)
- Highlights the currently selected year
- Click handler to select/deselect a year

**Behavior:**
- Always renders bars for the full 1905–1929 range, with zero-height gaps for years with no issues — this keeps the timeline spatially consistent across papers and makes coverage gaps visible
- Bar height = `(yearCount / maxYearCount) * maxBarHeight`
- `maxBarHeight` = 60px
- Minimum bar height for years with issues: 4px (so even 1 issue is visible)
- Selected bar color: `var(--unc-longleaf-pine)` (#00594C)
- Unselected bar color: `#c4ddd9`
- Hover: tooltip with year and count

### Component 5: Breadcrumb Navigation

Simple breadcrumb trail shown at the top of Paper Detail and Date Browse views.

**Patterns:**
- Paper Detail: "All Papers › Chicago Defender"
- Paper Detail + year: "All Papers › Chicago Defender › 1918"
- Date Browse: "All Papers › All Issues by Date"
- Date Browse + year: "All Papers › All Issues by Date › 1919"

"All Papers" always links back to the Paper Gallery. Each segment is clickable to navigate up.

## What Stays the Same

- **Today in History hero** — unchanged, keeps independent data source
- **Issue viewer modal** — zoom, pan, OCR, page navigation, keyboard shortcuts all unchanged
- **Issue card design** — same thumbnail + title + date cards
- **Infinite scroll** — still used for loading more issues in the grid
- **Deep linking** — existing `?date=...&page=...#chunk-N` for viewer still works
- **Intro overlay** — still shown for first-time visitors
- **Manifest and caching** — IndexedDB caching, background update checks unchanged

## What's Removed

- **Filter bar dropdowns** — "All Years" and "All Papers" toggle panels
- **Year pill grid** — replaced by timeline scrubber
- **Paper checkbox list with Apply button** — replaced by gallery (single paper) and compact dropdown (cross-paper)
- **Random initial month/year** — replaced by paper gallery as default landing
- **`filters.js` FilterSystem** — replaced by the new navigation components

## Data Requirements

**City/state per paper:** A lookup table mapping paper titles to city/state strings. Can be a small JS object in app.js or added to `config/papers.yaml`. Example:

```javascript
const PAPER_LOCATIONS = {
    'Chicago Defender': 'Chicago, Illinois',
    'Pittsburgh Courier': 'Pittsburgh, Pennsylvania',
    'Baltimore Afro-American': 'Baltimore, Maryland',
    // ... 38 more
};
```

**Masthead thumbnails:** No new images needed. Use existing `issue_thumb` URLs from the manifest. For each paper, use the first issue by date (deterministic) and display with CSS `object-fit: cover; object-position: top; height: 60px` to show just the masthead portion.

**Paper slugs:** Already available in `web_content/manifests/index.json` with authoritative `slug` field per paper. Load this file at startup alongside the main manifest.

**Everything else** (date ranges, issue counts, year density) is computed from existing manifest data at load time.

## Transitions and Loading States

- **Gallery → Paper Detail:** Instant swap (no fade). The gallery section hides and the paper detail section shows. Issue grid shows skeleton cards while thumbnail images load.
- **Gallery → Date Browse:** Same instant swap pattern.
- **Timeline year click / month pill click:** Grid content fades briefly (150ms opacity transition) while updating. No full-page transition.
- **Breadcrumb "All Papers":** Instant swap back to gallery. Gallery scroll position is restored from saved state.
- **First visit (no cache):** Show "Loading archive..." with spinner (existing behavior), then render the Paper Gallery once the manifest is loaded.

## Mobile Considerations

- Paper gallery: 1 column on mobile, 2 on tablet, 3 on desktop
- Timeline scrubber: full width, touch-friendly bar targets (minimum 20px wide per bar)
- Month pills: wrap naturally on smaller screens
- Breadcrumb: truncate middle segments on very small screens if needed
- Paper dropdown: full-screen overlay on mobile (similar to current paper panel behavior)

## URL Routing Summary

| URL | View |
|-----|------|
| `/` (no params) | Hero + Paper Gallery |
| `?paper=chicago-defender` | Paper Detail — all years |
| `?paper=chicago-defender&year=1918` | Paper Detail — 1918 |
| `?paper=chicago-defender&year=1918&month=03` | Paper Detail — March 1918 |
| `?view=date` | Cross-Paper Date Browse — all years |
| `?view=date&year=1919` | Date Browse — 1919 |
| `?view=date&year=1919&month=03` | Date Browse — March 1919 |
| `?paper=chicago-defender&date=1920-03-15&page=2` | Paper Detail + viewer opens (backward compat) |
| `?date=1920-03-15&page=2#chunk-5` | Viewer deep link (unchanged) |
