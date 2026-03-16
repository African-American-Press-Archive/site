/**
 * search.js — Progressive enhancement for the search/filter form.
 * Replaces the plain year inputs with a visual two-handle range slider.
 */
(function () {
  'use strict';

  var form = document.querySelector('.search-filters');
  if (!form) return;

  var fromInput = form.querySelector('input[name="from"]');
  var toInput   = form.querySelector('input[name="to"]');

  if (!fromInput || !toInput) return;

  var container = fromInput.closest('.filter-date-range');
  if (!container) return;

  // ── Determine year bounds from the input constraints or fallback values ──
  var yearMin = parseInt(fromInput.min || '1905', 10);
  var yearMax = parseInt(toInput.max   || '1929', 10);

  var currentFrom = parseInt(fromInput.value || yearMin, 10);
  var currentTo   = parseInt(toInput.value   || yearMax, 10);

  // Clamp to valid range
  if (isNaN(currentFrom) || currentFrom < yearMin) currentFrom = yearMin;
  if (isNaN(currentTo)   || currentTo   > yearMax) currentTo   = yearMax;
  if (currentFrom > currentTo) currentFrom = currentTo;

  // ── Build slider DOM ─────────────────────────────────────────────────────
  var slider = document.createElement('div');
  slider.className = 'range-slider';

  var track = document.createElement('div');
  track.className = 'range-track';

  var fill = document.createElement('div');
  fill.className = 'range-fill';

  var handleFrom = document.createElement('div');
  handleFrom.className = 'range-handle';
  handleFrom.setAttribute('role', 'slider');
  handleFrom.setAttribute('aria-label', 'From year');
  handleFrom.setAttribute('tabindex', '0');

  var handleTo = document.createElement('div');
  handleTo.className = 'range-handle';
  handleTo.setAttribute('role', 'slider');
  handleTo.setAttribute('aria-label', 'To year');
  handleTo.setAttribute('tabindex', '0');

  var labels = document.createElement('div');
  labels.className = 'range-labels';

  var labelFrom = document.createElement('span');
  var labelTo   = document.createElement('span');
  labels.appendChild(labelFrom);
  labels.appendChild(labelTo);

  track.appendChild(fill);
  track.appendChild(handleFrom);
  track.appendChild(handleTo);
  slider.appendChild(track);
  slider.appendChild(labels);

  // Insert after the container (or append inside it)
  container.appendChild(slider);

  // ── Hide the raw inputs (keep them in DOM for form submission) ───────────
  fromInput.style.display = 'none';
  toInput.style.display   = 'none';

  // ── Helpers ──────────────────────────────────────────────────────────────
  function yearToPercent(year) {
    return ((year - yearMin) / (yearMax - yearMin)) * 100;
  }

  function percentToYear(pct) {
    var raw = yearMin + Math.round((pct / 100) * (yearMax - yearMin));
    return Math.max(yearMin, Math.min(yearMax, raw));
  }

  function render() {
    var pctFrom = yearToPercent(currentFrom);
    var pctTo   = yearToPercent(currentTo);

    handleFrom.style.left = pctFrom + '%';
    handleTo.style.left   = pctTo   + '%';

    fill.style.left  = pctFrom + '%';
    fill.style.width = (pctTo - pctFrom) + '%';

    labelFrom.textContent = currentFrom;
    labelTo.textContent   = currentTo;

    handleFrom.setAttribute('aria-valuenow', currentFrom);
    handleFrom.setAttribute('aria-valuemin', yearMin);
    handleFrom.setAttribute('aria-valuemax', currentTo);
    handleTo.setAttribute('aria-valuenow', currentTo);
    handleTo.setAttribute('aria-valuemin', currentFrom);
    handleTo.setAttribute('aria-valuemax', yearMax);

    fromInput.value = currentFrom;
    toInput.value   = currentTo;
  }

  // ── Drag logic ───────────────────────────────────────────────────────────
  function getTrackX(clientX) {
    var rect = track.getBoundingClientRect();
    var pct  = ((clientX - rect.left) / rect.width) * 100;
    return Math.max(0, Math.min(100, pct));
  }

  function makeDraggable(handle, isFrom) {
    var dragging = false;

    function onStart(e) {
      dragging = true;
      handle.style.zIndex = '2';
      e.preventDefault();
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
    }

    function onMove(e) {
      if (!dragging) return;
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var pct     = getTrackX(clientX);
      var year    = percentToYear(pct);

      if (isFrom) {
        currentFrom = Math.min(year, currentTo);
      } else {
        currentTo = Math.max(year, currentFrom);
      }
      render();
      if (e.preventDefault) e.preventDefault();
    }

    function onEnd() {
      if (!dragging) return;
      dragging = false;
      handle.style.zIndex = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    }

    handle.addEventListener('mousedown', onStart);
    handle.addEventListener('touchstart', onStart, { passive: false });

    // Keyboard support
    handle.addEventListener('keydown', function (e) {
      var changed = false;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        if (isFrom) { currentFrom = Math.max(yearMin, currentFrom - 1); }
        else         { currentTo   = Math.max(currentFrom, currentTo - 1); }
        changed = true;
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        if (isFrom) { currentFrom = Math.min(currentTo, currentFrom + 1); }
        else         { currentTo   = Math.min(yearMax, currentTo + 1); }
        changed = true;
      }
      if (changed) { render(); e.preventDefault(); }
    });
  }

  makeDraggable(handleFrom, true);
  makeDraggable(handleTo,   false);

  // ── Initial render ───────────────────────────────────────────────────────
  render();

})();
