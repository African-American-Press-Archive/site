/**
 * viewer.js — Progressive enhancement for issue pages.
 * Creates a full-screen image viewer modal with interactive OCR panel.
 */
(function () {
  'use strict';

  // ── DOM setup ────────────────────────────────────────────────────────────
  const openBtn = document.getElementById('open-viewer');
  if (!openBtn) return;

  const pageThumbs = Array.from(document.querySelectorAll('.page-thumb'));
  if (!pageThumbs.length) return;

  const pages = pageThumbs.map(function (el) {
    return {
      num: parseInt(el.dataset.page, 10),
      imageUrl: el.dataset.imageUrl,
    };
  });

  const issueTitleEl = document.querySelector('.issue-header h1');
  const issueTitle = issueTitleEl ? issueTitleEl.textContent.trim() : '';
  const initialPage = parseInt(openBtn.dataset.initialPage || '1', 10);

  // ── Viewer state ─────────────────────────────────────────────────────────
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 3;
  const ZOOM_STEP = 1.25;
  const PRELOAD_AHEAD = 2;

  var state = {
    currentPageIndex: 0,
    zoomLevel: 1,
    pageCache: {},
    thumbnailsVisible: false,
  };

  var panState = {
    isDragging: false,
    startX: 0,
    startY: 0,
    translateX: 0,
    translateY: 0,
  };

  // ── OCR state ────────────────────────────────────────────────────────────
  var ocrState = { currentData: null, panelVisible: false, activeRegionIdx: -1, ocrCache: {} };

  // ── Build modal DOM ───────────────────────────────────────────────────────
  function buildModal() {
    var modal = document.createElement('div');
    modal.id = 'dp-viewer-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Issue viewer');
    modal.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:9000',
      'display:none',
      'flex-direction:column',
      'background:#111',
      'color:#fff',
    ].join(';');

    modal.innerHTML = [
      /* Header */
      '<div id="dpv-header" style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 1rem;background:#1a1a1a;border-bottom:1px solid #333;flex-shrink:0;flex-wrap:wrap;">',
        '<button id="dpv-close" title="Close (Esc)" aria-label="Close viewer" style="background:none;border:none;color:#fff;font-size:1.4rem;cursor:pointer;padding:0.25rem 0.5rem;line-height:1;">&times;</button>',
        '<div style="flex:1;min-width:0;">',
          '<span id="dpv-title" style="font-weight:700;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">' + escapeHtml(issueTitle) + '</span>',
        '</div>',
        '<div id="dpv-page-nav" style="display:flex;align-items:center;gap:0.25rem;">',
          '<button id="dpv-prev-page" title="Previous page (&#x2190;)" aria-label="Previous page" style="background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer;padding:0.25rem 0.5rem;">&#x2039;</button>',
          '<span style="font-size:0.85rem;white-space:nowrap;">Page <span id="dpv-current-page">1</span> / <span id="dpv-total-pages">' + pages.length + '</span></span>',
          '<button id="dpv-next-page" title="Next page (&#x2192;)" aria-label="Next page" style="background:none;border:none;color:#fff;font-size:1.2rem;cursor:pointer;padding:0.25rem 0.5rem;">&#x203A;</button>',
        '</div>',
        '<div style="display:flex;align-items:center;gap:0.25rem;">',
          '<button id="dpv-zoom-out" title="Zoom out (-)" aria-label="Zoom out" style="background:none;border:none;color:#fff;font-size:1rem;cursor:pointer;padding:0.25rem 0.5rem;">&#x2212;</button>',
          '<span id="dpv-zoom-label" style="font-size:0.8rem;min-width:3ch;text-align:center;">1&times;</span>',
          '<button id="dpv-zoom-in" title="Zoom in (+)" aria-label="Zoom in" style="background:none;border:none;color:#fff;font-size:1rem;cursor:pointer;padding:0.25rem 0.5rem;">+</button>',
          '<button id="dpv-zoom-reset" title="Reset zoom (0)" aria-label="Reset zoom" style="background:none;border:none;color:#aaa;font-size:0.75rem;cursor:pointer;padding:0.25rem 0.5rem;">Fit</button>',
        '</div>',
        '<div style="display:flex;align-items:center;gap:0.25rem;">',
          '<button id="dpv-ocr-toggle" class="ocr-toggle-btn" title="Read Text (R)" aria-label="Toggle OCR text panel">',
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
            '<span>Read Text</span>',
          '</button>',
          '<button id="dpv-thumbs-toggle" title="Thumbnails (T)" aria-label="Toggle thumbnails" style="background:none;border:none;color:#fff;font-size:0.8rem;cursor:pointer;padding:0.25rem 0.5rem;border:1px solid #555;border-radius:3px;">Pages</button>',
          '<button id="dpv-fullscreen" title="Fullscreen (F)" aria-label="Toggle fullscreen" style="background:none;border:none;color:#fff;font-size:1rem;cursor:pointer;padding:0.25rem 0.5rem;">&#x26F6;</button>',
          '<button id="dpv-download" title="Download (D)" aria-label="Download page" style="background:none;border:none;color:#fff;font-size:1rem;cursor:pointer;padding:0.25rem 0.5rem;">&#x2193;</button>',
        '</div>',
      '</div>',

      /* Body: image area + OCR panel side by side */
      '<div id="dpv-body" style="flex:1;display:flex;overflow:hidden;">',

        /* Image area */
        '<div id="dpv-image-wrapper" style="flex:1;overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center;cursor:zoom-in;">',
          '<div id="dpv-image-container" style="transform-origin:center center;transition:transform 0.15s ease;display:flex;align-items:center;justify-content:center;position:relative;">',
            '<img id="dpv-image" alt="Page image" style="max-width:100%;max-height:calc(100vh - 120px);object-fit:contain;user-select:none;-webkit-user-drag:none;display:block;" />',
            '<div id="dpv-ocr-overlays" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;"></div>',
          '</div>',
          '<div id="dpv-loading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);">',
            '<div style="width:40px;height:40px;border:3px solid #555;border-top-color:#fff;border-radius:50%;animation:dpv-spin 0.8s linear infinite;"></div>',
          '</div>',
          /* Overlay nav arrows */
          '<button id="dpv-prev-overlay" aria-label="Previous page" style="position:absolute;left:0;top:0;bottom:0;width:60px;background:linear-gradient(to right,rgba(0,0,0,0.4),transparent);border:none;color:#fff;font-size:2rem;cursor:pointer;display:flex;align-items:center;justify-content:flex-start;padding-left:0.75rem;">&#x2039;</button>',
          '<button id="dpv-next-overlay" aria-label="Next page" style="position:absolute;right:0;top:0;bottom:0;width:60px;background:linear-gradient(to left,rgba(0,0,0,0.4),transparent);border:none;color:#fff;font-size:2rem;cursor:pointer;display:flex;align-items:center;justify-content:flex-end;padding-right:0.75rem;">&#x203A;</button>',
        '</div>',

        /* OCR Panel */
        '<div id="ocr-panel" class="hidden">',
          '<div id="ocr-panel-header">',
            '<span class="ocr-panel-title">Page Text</span>',
            '<button id="ocr-panel-close" title="Close panel">&times;</button>',
          '</div>',
          '<div id="ocr-panel-content"></div>',
        '</div>',

      '</div>',

      /* Thumbnail strip */
      '<div id="dpv-thumb-strip" style="display:none;background:#1a1a1a;border-top:1px solid #333;padding:0.5rem;overflow-x:auto;white-space:nowrap;flex-shrink:0;max-height:140px;">',
        '<div id="dpv-thumb-container" style="display:inline-flex;gap:0.5rem;"></div>',
      '</div>',

      /* Keyframe for spinner */
      '<style>@keyframes dpv-spin{to{transform:rotate(360deg)}}</style>',
    ].join('');

    document.body.appendChild(modal);
    return modal;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Modal refs (set after build) ─────────────────────────────────────────
  var modal, imgEl, imgContainer, imgWrapper, loadingEl;
  var prevPageBtn, nextPageBtn, prevOverlay, nextOverlay;
  var thumbStrip, thumbContainer;
  var zoomLabel;
  var ocrToggleBtn, ocrPanel, ocrPanelContent, ocrOverlays;

  // ── Open / close ─────────────────────────────────────────────────────────
  function openViewer() {
    if (!modal) {
      modal = buildModal();
      imgEl = document.getElementById('dpv-image');
      imgContainer = document.getElementById('dpv-image-container');
      imgWrapper = document.getElementById('dpv-image-wrapper');
      loadingEl = document.getElementById('dpv-loading');
      prevPageBtn = document.getElementById('dpv-prev-page');
      nextPageBtn = document.getElementById('dpv-next-page');
      prevOverlay = document.getElementById('dpv-prev-overlay');
      nextOverlay = document.getElementById('dpv-next-overlay');
      thumbStrip = document.getElementById('dpv-thumb-strip');
      thumbContainer = document.getElementById('dpv-thumb-container');
      zoomLabel = document.getElementById('dpv-zoom-label');
      ocrToggleBtn = document.getElementById('dpv-ocr-toggle');
      ocrPanel = document.getElementById('ocr-panel');
      ocrPanelContent = document.getElementById('ocr-panel-content');
      ocrOverlays = document.getElementById('dpv-ocr-overlays');

      bindEvents();
      buildThumbnails();
    }

    state.currentPageIndex = Math.max(0, (initialPage - 1));
    state.zoomLevel = 1;
    panState.translateX = 0;
    panState.translateY = 0;
    state.thumbnailsVisible = false;
    thumbStrip.style.display = 'none';

    ocrState.panelVisible = false;
    ocrState.activeRegionIdx = -1;
    ocrState.currentData = null;
    ocrPanel.classList.add('hidden');
    ocrToggleBtn.classList.remove('active');

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    history.pushState({ dpViewerOpen: true }, '', window.location.href);

    loadPage(state.currentPageIndex);

    // Preload next pages
    for (var i = 1; i <= PRELOAD_AHEAD && i < pages.length; i++) {
      preloadPage(state.currentPageIndex + i);
    }
  }

  function closeViewer() {
    if (!modal || modal.style.display === 'none') return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
    state.thumbnailsVisible = false;
    hideOCRPanel();
    if (history.state && history.state.dpViewerOpen) {
      history.back();
    }
  }

  // ── Page loading ─────────────────────────────────────────────────────────
  function loadPage(index) {
    if (index < 0 || index >= pages.length) return;
    state.currentPageIndex = index;
    resetZoom();
    showLoading(true);

    var page = pages[index];
    var url = page.imageUrl;

    // Clear OCR overlays for new page
    ocrState.currentData = null;
    ocrState.activeRegionIdx = -1;
    ocrOverlays.innerHTML = '';
    ocrPanelContent.innerHTML = '';

    if (state.pageCache[url]) {
      imgEl.src = url;
      imgEl.style.opacity = '1';
      showLoading(false);
      updateUI();
      loadOCRForPage(url);
      return;
    }

    imgEl.style.opacity = '0';
    var tmp = new Image();
    tmp.onload = function () {
      state.pageCache[url] = true;
      imgEl.src = url;
      imgEl.style.opacity = '1';
      showLoading(false);
      updateUI();
      loadOCRForPage(url);
    };
    tmp.onerror = function () {
      showLoading(false);
      updateUI();
    };
    tmp.src = url;
  }

  function preloadPage(index) {
    if (index < 0 || index >= pages.length) return;
    var url = pages[index].imageUrl;
    if (state.pageCache[url]) return;
    var img = new Image();
    img.onload = function () { state.pageCache[url] = true; };
    img.src = url;
  }

  function navigatePage(dir) {
    var next = state.currentPageIndex + dir;
    if (next >= 0 && next < pages.length) {
      loadPage(next);
      preloadPage(next + dir);
    }
  }

  // ── Zoom & pan ───────────────────────────────────────────────────────────
  function resetZoom() {
    state.zoomLevel = 1;
    panState.translateX = 0;
    panState.translateY = 0;
    applyTransform();
    imgWrapper.style.cursor = 'zoom-in';
  }

  function zoomImage(dir) {
    if (dir > 0) {
      state.zoomLevel = Math.min(state.zoomLevel * ZOOM_STEP, ZOOM_MAX);
    } else {
      state.zoomLevel = Math.max(state.zoomLevel / ZOOM_STEP, ZOOM_MIN);
    }
    if (state.zoomLevel <= 1) {
      state.zoomLevel = 1;
      panState.translateX = 0;
      panState.translateY = 0;
    }
    applyTransform();
    imgWrapper.style.cursor = state.zoomLevel > 1 ? 'grab' : 'zoom-in';
  }

  function zoomToPoint(e) {
    var targetZoom = 2;
    var rect = imgContainer.getBoundingClientRect();
    var clickXRatio = (e.clientX - rect.left) / rect.width;
    var clickYRatio = (e.clientY - rect.top) / rect.height;

    var tx = (0.5 - clickXRatio) * rect.width;
    var ty = (0.5 - clickYRatio) * rect.height;
    var maxTx = rect.width * (1 - 1 / targetZoom) / 2;
    var maxTy = rect.height * (1 - 1 / targetZoom) / 2;

    state.zoomLevel = targetZoom;
    panState.translateX = Math.max(-maxTx, Math.min(maxTx, tx));
    panState.translateY = Math.max(-maxTy, Math.min(maxTy, ty));
    applyTransform();
    imgWrapper.style.cursor = 'grab';
  }

  function zoomToRegion(bbox, imgW, imgH) {
    var targetZoom = 2;
    var rect = imgEl.getBoundingClientRect();
    var cx = ((bbox[0] + bbox[2]) / 2) / imgW;
    var cy = ((bbox[1] + bbox[3]) / 2) / imgH;

    var tx = (0.5 - cx) * rect.width;
    var ty = (0.5 - cy) * rect.height;
    var maxTx = rect.width * (1 - 1 / targetZoom) / 2;
    var maxTy = rect.height * (1 - 1 / targetZoom) / 2;

    state.zoomLevel = targetZoom;
    panState.translateX = Math.max(-maxTx, Math.min(maxTx, tx));
    panState.translateY = Math.max(-maxTy, Math.min(maxTy, ty));
    applyTransform();
    imgWrapper.style.cursor = 'grab';
  }

  function applyTransform() {
    imgContainer.style.transform = 'scale(' + state.zoomLevel + ') translate(' + panState.translateX + 'px, ' + panState.translateY + 'px)';
    var pct = Math.round(state.zoomLevel * 100);
    zoomLabel.textContent = state.zoomLevel === 1 ? '1\u00D7' : pct + '%';
  }

  // ── UI helpers ───────────────────────────────────────────────────────────
  function showLoading(show) {
    loadingEl.style.display = show ? 'flex' : 'none';
  }

  function updateUI() {
    var idx = state.currentPageIndex;
    document.getElementById('dpv-current-page').textContent = idx + 1;
    document.getElementById('dpv-total-pages').textContent = pages.length;

    var atStart = idx <= 0;
    var atEnd = idx >= pages.length - 1;

    prevPageBtn.style.opacity = atStart ? '0.3' : '1';
    prevPageBtn.style.pointerEvents = atStart ? 'none' : '';
    nextPageBtn.style.opacity = atEnd ? '0.3' : '1';
    nextPageBtn.style.pointerEvents = atEnd ? 'none' : '';

    prevOverlay.style.display = atStart ? 'none' : 'flex';
    nextOverlay.style.display = atEnd ? 'none' : 'flex';

    // Hide page nav if only one page
    var pageNavEl = document.getElementById('dpv-page-nav');
    if (pageNavEl) pageNavEl.style.display = pages.length <= 1 ? 'none' : 'flex';

    var thumbsBtn = document.getElementById('dpv-thumbs-toggle');
    if (thumbsBtn) thumbsBtn.style.display = pages.length <= 1 ? 'none' : '';

    updateThumbnailSelection();
  }

  // ── Thumbnails ───────────────────────────────────────────────────────────
  function buildThumbnails() {
    thumbContainer.innerHTML = '';
    pages.forEach(function (page, i) {
      var div = document.createElement('div');
      div.style.cssText = 'display:inline-block;width:70px;height:90px;position:relative;cursor:pointer;border-radius:3px;overflow:hidden;border:2px solid transparent;flex-shrink:0;vertical-align:top;';
      div.dataset.thumbIndex = i;

      var img = document.createElement('img');
      img.src = page.imageUrl;
      img.alt = 'Page ' + (i + 1);
      img.loading = 'lazy';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';

      var label = document.createElement('div');
      label.textContent = i + 1;
      label.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);color:#fff;font-size:0.7rem;text-align:center;padding:2px 0;';

      div.appendChild(img);
      div.appendChild(label);
      div.addEventListener('click', function () { loadPage(i); });
      thumbContainer.appendChild(div);
    });
  }

  function updateThumbnailSelection() {
    var thumbs = thumbContainer.querySelectorAll('[data-thumb-index]');
    thumbs.forEach(function (t, i) {
      t.style.borderColor = i === state.currentPageIndex ? 'var(--unc-hyperlink-blue, #4b9cd3)' : 'transparent';
    });
    var active = thumbs[state.currentPageIndex];
    if (active && state.thumbnailsVisible) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  function toggleThumbnails() {
    state.thumbnailsVisible = !state.thumbnailsVisible;
    thumbStrip.style.display = state.thumbnailsVisible ? 'block' : 'none';
    if (state.thumbnailsVisible) updateThumbnailSelection();
  }

  // ── Download ─────────────────────────────────────────────────────────────
  function downloadPage() {
    var page = pages[state.currentPageIndex];
    if (!page) return;
    var url = page.imageUrl;
    var filename = url.split('/').pop() || ('page_' + (state.currentPageIndex + 1) + '.jpg');
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ── Fullscreen ───────────────────────────────────────────────────────────
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      modal.requestFullscreen && modal.requestFullscreen().catch(function () {});
    } else {
      document.exitFullscreen && document.exitFullscreen();
    }
  }

  // ── OCR functions ────────────────────────────────────────────────────────
  function loadOCRForPage(imageUrl) {
    // Derive JSON URL from image URL: replace extension with .json
    // Proxy through /ocr/ route to avoid CORS issues
    var r2Path = imageUrl.replace('https://pages.dangerouspress.org/', '');
    var jsonUrl = '/ocr/' + r2Path.replace(/\.[^.]+$/, '.json');

    // Check cache
    if (ocrState.ocrCache[jsonUrl]) {
      ocrState.currentData = ocrState.ocrCache[jsonUrl];
      renderOCRPanel(ocrState.currentData);
      renderOCROverlays(ocrState.currentData);
      ocrToggleBtn.classList.remove('hidden');
      if (!ocrState.panelVisible) showOCRPanel();
      return;
    }

    fetch(jsonUrl)
      .then(function (resp) {
        if (!resp.ok) throw new Error('No OCR data');
        return resp.json();
      })
      .then(function (data) {
        if (!data || !data.regions || !data.regions.length) {
          ocrState.currentData = null;
          ocrToggleBtn.classList.add('hidden');
          if (ocrState.panelVisible) hideOCRPanel();
          return;
        }
        ocrState.ocrCache[jsonUrl] = data;
        ocrState.currentData = data;
        renderOCRPanel(data);
        renderOCROverlays(data);
        ocrToggleBtn.classList.remove('hidden');
        if (!ocrState.panelVisible) showOCRPanel();
      })
      .catch(function () {
        ocrState.currentData = null;
        ocrToggleBtn.classList.add('hidden');
        if (ocrState.panelVisible) hideOCRPanel();
      });
  }

  function renderOCRPanel(data) {
    if (!data || !data.regions) { ocrPanelContent.innerHTML = ''; return; }
    var html = '';
    data.regions.forEach(function (region, idx) {
      var tag, cls;
      switch (region.type) {
        case 'doc_title':
          tag = 'h2'; cls = 'ocr-block-title'; break;
        case 'paragraph_title':
          tag = 'h3'; cls = 'ocr-block-subtitle'; break;
        default:
          tag = 'p'; cls = 'ocr-block-text'; break;
      }
      html += '<' + tag + ' class="' + cls + '" data-ocr-idx="' + idx + '">' + escapeHtml(region.text) + '</' + tag + '>';
    });
    ocrPanelContent.innerHTML = html;

    // Bind click handlers
    var blocks = ocrPanelContent.querySelectorAll('[data-ocr-idx]');
    blocks.forEach(function (block) {
      block.addEventListener('click', function () {
        var idx = parseInt(block.dataset.ocrIdx, 10);
        highlightOCRRegion(idx, 'text');
      });
    });
  }

  function renderOCROverlays(data) {
    ocrOverlays.innerHTML = '';
    if (!data || !data.regions || !data.image_width || !data.image_height) return;
    var imgW = data.image_width;
    var imgH = data.image_height;

    data.regions.forEach(function (region, idx) {
      if (!region.bbox || region.bbox.length < 4) return;
      var x1 = region.bbox[0], y1 = region.bbox[1], x2 = region.bbox[2], y2 = region.bbox[3];
      var box = document.createElement('div');
      box.className = 'ocr-overlay-box';
      box.dataset.ocrIdx = idx;
      box.style.left = (x1 / imgW * 100) + '%';
      box.style.top = (y1 / imgH * 100) + '%';
      box.style.width = ((x2 - x1) / imgW * 100) + '%';
      box.style.height = ((y2 - y1) / imgH * 100) + '%';
      ocrOverlays.appendChild(box);
    });
  }

  function hitTestOCRRegion(e) {
    if (!ocrState.currentData || !ocrState.currentData.regions) return -1;
    var data = ocrState.currentData;
    var imgW = data.image_width;
    var imgH = data.image_height;
    if (!imgW || !imgH) return -1;

    var rect = imgEl.getBoundingClientRect();
    var clickX = (e.clientX - rect.left) / rect.width * imgW;
    var clickY = (e.clientY - rect.top) / rect.height * imgH;

    var bestIdx = -1;
    var bestArea = Infinity;

    data.regions.forEach(function (region, idx) {
      if (!region.bbox || region.bbox.length < 4) return;
      var x1 = region.bbox[0], y1 = region.bbox[1], x2 = region.bbox[2], y2 = region.bbox[3];
      if (clickX >= x1 && clickX <= x2 && clickY >= y1 && clickY <= y2) {
        var area = (x2 - x1) * (y2 - y1);
        if (area < bestArea) {
          bestArea = area;
          bestIdx = idx;
        }
      }
    });

    return bestIdx;
  }

  function highlightOCRRegion(idx, source) {
    // Toggle off if clicking same region
    if (idx === ocrState.activeRegionIdx) {
      clearOCRHighlight();
      return;
    }

    clearOCRHighlight();
    ocrState.activeRegionIdx = idx;

    // Highlight text block in panel
    var textBlock = ocrPanelContent.querySelector('[data-ocr-idx="' + idx + '"]');
    if (textBlock) {
      textBlock.classList.add('ocr-block-highlight');
      textBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Highlight overlay box
    var overlayBox = ocrOverlays.querySelector('[data-ocr-idx="' + idx + '"]');
    if (overlayBox) {
      overlayBox.classList.add('ocr-overlay-active');
    }

    // If clicked from image, auto-zoom and show panel
    if (source === 'image') {
      var data = ocrState.currentData;
      if (data && data.regions[idx] && data.regions[idx].bbox) {
        zoomToRegion(data.regions[idx].bbox, data.image_width, data.image_height);
      }
      if (!ocrState.panelVisible) showOCRPanel();
    }
  }

  function clearOCRHighlight() {
    ocrState.activeRegionIdx = -1;
    var highlighted = ocrPanelContent.querySelectorAll('.ocr-block-highlight');
    highlighted.forEach(function (el) { el.classList.remove('ocr-block-highlight'); });
    var activeOverlays = ocrOverlays.querySelectorAll('.ocr-overlay-active');
    activeOverlays.forEach(function (el) { el.classList.remove('ocr-overlay-active'); });
  }

  function toggleOCRPanel() {
    if (ocrState.panelVisible) {
      hideOCRPanel();
    } else {
      showOCRPanel();
    }
  }

  function showOCRPanel() {
    ocrState.panelVisible = true;
    ocrPanel.classList.remove('hidden');
    ocrToggleBtn.classList.add('active');
  }

  function hideOCRPanel() {
    ocrState.panelVisible = false;
    ocrPanel.classList.add('hidden');
    ocrToggleBtn.classList.remove('active');
    clearOCRHighlight();
  }

  function navigateOCRRegion(dir) {
    if (!ocrState.currentData || !ocrState.currentData.regions.length) return;
    var count = ocrState.currentData.regions.length;
    var next;
    if (ocrState.activeRegionIdx < 0) {
      next = dir > 0 ? 0 : count - 1;
    } else {
      next = ocrState.activeRegionIdx + dir;
      if (next < 0) next = count - 1;
      if (next >= count) next = 0;
    }
    highlightOCRRegion(next, 'text');
  }

  // ── Event binding ────────────────────────────────────────────────────────
  function bindEvents() {
    // Header buttons
    document.getElementById('dpv-close').addEventListener('click', closeViewer);
    document.getElementById('dpv-prev-page').addEventListener('click', function () { navigatePage(-1); });
    document.getElementById('dpv-next-page').addEventListener('click', function () { navigatePage(1); });
    document.getElementById('dpv-prev-overlay').addEventListener('click', function () { navigatePage(-1); });
    document.getElementById('dpv-next-overlay').addEventListener('click', function () { navigatePage(1); });
    document.getElementById('dpv-zoom-in').addEventListener('click', function () { zoomImage(1); });
    document.getElementById('dpv-zoom-out').addEventListener('click', function () { zoomImage(-1); });
    document.getElementById('dpv-zoom-reset').addEventListener('click', resetZoom);
    document.getElementById('dpv-thumbs-toggle').addEventListener('click', toggleThumbnails);
    document.getElementById('dpv-fullscreen').addEventListener('click', toggleFullscreen);
    document.getElementById('dpv-download').addEventListener('click', downloadPage);

    // OCR buttons
    ocrToggleBtn.addEventListener('click', toggleOCRPanel);
    document.getElementById('ocr-panel-close').addEventListener('click', hideOCRPanel);

    // Click-to-zoom on image (with OCR hit-test)
    var clickStartX, clickStartY;
    imgEl.addEventListener('mousedown', function (e) {
      clickStartX = e.clientX;
      clickStartY = e.clientY;
    });
    imgEl.addEventListener('click', function (e) {
      var dx = Math.abs(e.clientX - clickStartX);
      var dy = Math.abs(e.clientY - clickStartY);
      if (dx >= 5 || dy >= 5) return; // was a drag

      // Try OCR hit test first
      if (ocrState.currentData) {
        var hitIdx = hitTestOCRRegion(e);
        if (hitIdx >= 0) {
          highlightOCRRegion(hitIdx, 'image');
          return;
        }
      }

      // Normal zoom behavior
      if (state.zoomLevel === 1) {
        zoomToPoint(e);
      } else {
        resetZoom();
      }
    });
    imgEl.addEventListener('dblclick', toggleFullscreen);

    // Pan (mouse)
    imgContainer.addEventListener('mousedown', function (e) {
      if (state.zoomLevel <= 1) return;
      panState.isDragging = true;
      panState.startX = e.clientX - panState.translateX;
      panState.startY = e.clientY - panState.translateY;
      imgWrapper.style.cursor = 'grabbing';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!panState.isDragging || state.zoomLevel <= 1) return;
      panState.translateX = e.clientX - panState.startX;
      panState.translateY = e.clientY - panState.startY;
      applyTransform();
      e.preventDefault();
    });
    document.addEventListener('mouseup', function () {
      if (panState.isDragging) {
        panState.isDragging = false;
        if (state.zoomLevel > 1) imgWrapper.style.cursor = 'grab';
      }
    });

    // Touch pan
    imgContainer.addEventListener('touchstart', function (e) {
      if (state.zoomLevel <= 1 || e.touches.length !== 1) return;
      panState.isDragging = true;
      panState.startX = e.touches[0].clientX - panState.translateX;
      panState.startY = e.touches[0].clientY - panState.translateY;
      e.preventDefault();
    }, { passive: false });
    imgContainer.addEventListener('touchmove', function (e) {
      if (!panState.isDragging || state.zoomLevel <= 1 || e.touches.length !== 1) return;
      panState.translateX = e.touches[0].clientX - panState.startX;
      panState.translateY = e.touches[0].clientY - panState.startY;
      applyTransform();
      e.preventDefault();
    }, { passive: false });
    imgContainer.addEventListener('touchend', function () {
      panState.isDragging = false;
    });

    // Touch swipe for page navigation
    var swipeStartX = 0;
    imgEl.addEventListener('touchstart', function (e) {
      swipeStartX = e.changedTouches[0].screenX;
    });
    imgEl.addEventListener('touchend', function (e) {
      var diff = swipeStartX - e.changedTouches[0].screenX;
      if (Math.abs(diff) > 50) {
        navigatePage(diff > 0 ? 1 : -1);
      }
    });

    // Keyboard
    document.addEventListener('keydown', function (e) {
      if (!modal || modal.style.display === 'none') return;

      // Arrow up/down for OCR navigation when panel is open
      if (ocrState.panelVisible && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        navigateOCRRegion(e.key === 'ArrowDown' ? 1 : -1);
        e.preventDefault();
        return;
      }

      switch (e.key) {
        case 'Escape':     closeViewer();       e.preventDefault(); break;
        case 'ArrowLeft':  navigatePage(-1);    e.preventDefault(); break;
        case 'ArrowRight': navigatePage(1);     e.preventDefault(); break;
        case '+':
        case '=':          zoomImage(1);        e.preventDefault(); break;
        case '-':
        case '_':          zoomImage(-1);       e.preventDefault(); break;
        case '0':          resetZoom();         e.preventDefault(); break;
        case 'f':
        case 'F':          toggleFullscreen();  e.preventDefault(); break;
        case 'd':
        case 'D':          downloadPage();      e.preventDefault(); break;
        case 't':
        case 'T':          if (pages.length > 1) toggleThumbnails(); e.preventDefault(); break;
        case 'r':
        case 'R':          if (ocrState.currentData) toggleOCRPanel(); e.preventDefault(); break;
      }
    });

    // Browser back button
    window.addEventListener('popstate', function (e) {
      if (modal && modal.style.display !== 'none') {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        state.thumbnailsVisible = false;
        hideOCRPanel();
      }
    });
  }

  // ── Wire up the open button ───────────────────────────────────────────────
  openBtn.addEventListener('click', openViewer);

  // Auto-open the viewer on page load
  openViewer();

})();
