/**
 * search.js — Progressive enhancement for search year histogram slider.
 * Connects the dual range inputs to the hidden form fields and
 * updates histogram bar highlighting as the range changes.
 */
(function () {
  'use strict';

  var fromRange = document.getElementById('from-year-range');
  var toRange = document.getElementById('to-year-range');
  var fromHidden = document.getElementById('from-year');
  var toHidden = document.getElementById('to-year');
  var fromDisplay = document.getElementById('from-year-display');
  var toDisplay = document.getElementById('to-year-display');

  if (!fromRange || !toRange || !fromHidden || !toHidden) return;

  var bars = document.querySelectorAll('.year-bar-col');

  function update() {
    var from = parseInt(fromRange.value, 10);
    var to = parseInt(toRange.value, 10);

    // Prevent crossing
    if (from > to) {
      fromRange.value = to;
      from = to;
    }

    // Update hidden inputs for form submission
    fromHidden.value = from;
    toHidden.value = to;

    // Update display labels
    if (fromDisplay) fromDisplay.textContent = from;
    if (toDisplay) toDisplay.textContent = to;

    // Update histogram bar highlighting
    bars.forEach(function (bar) {
      var year = parseInt(bar.dataset.year, 10);
      if (year >= from && year <= to) {
        bar.classList.add('year-bar-active');
        bar.classList.remove('year-bar-dim');
      } else {
        bar.classList.remove('year-bar-active');
        bar.classList.add('year-bar-dim');
      }
    });
  }

  fromRange.addEventListener('input', update);
  toRange.addEventListener('input', update);

  // Click on histogram bar to set range to that single year
  bars.forEach(function (bar) {
    bar.addEventListener('click', function () {
      var year = parseInt(bar.dataset.year, 10);
      fromRange.value = year;
      toRange.value = year;
      update();
    });
  });

  // Initial sync
  update();
})();
