/* ──────────────────────────────────────────────────────────────
   Credit Report Viewer — Standalone PDF viewer con BroadcastChannel
   Renderizado lazy con IntersectionObserver
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const AUTH_TOKEN_KEY = 'project_gw_auth_token';

  /* ── URL params ── */
  const params = new URLSearchParams(window.location.search);
  const fileId = params.get('fileId');
  const leadId = params.get('leadId');
  const fileName = params.get('name') || 'Reporte de Crédito';

  /* ── DOM refs ── */
  const container = document.getElementById('pdfContainer');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const titleEl = document.getElementById('viewerTitle');
  const searchInput = document.getElementById('searchInput');
  const searchInfo = document.getElementById('searchInfo');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnZoomIn = document.getElementById('btnZoomIn');
  const btnZoomOut = document.getElementById('btnZoomOut');
  const zoomLabel = document.getElementById('zoomLabel');
  const pageInfoEl = document.getElementById('pageInfo');
  const broadcastBadge = document.getElementById('broadcastBadge');
  const broadcastText = document.getElementById('broadcastText');

  /* ── State ── */
  let pdfDoc = null;
  let pdfBytes = null;
  let pageSlots = [];        // { wrapper, rendered, pageNum }
  let currentScale = 1.3;
  let matches = [];
  let currentMatchIdx = -1;
  let searchDebounce = null;
  let observer = null;
  let renderQueue = new Set();
  let rendering = false;

  titleEl.textContent = decodeURIComponent(fileName);
  document.title = decodeURIComponent(fileName) + ' — Visor';

  /* ── Auth fetch helper ── */
  function authFetch(url) {
    const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
    return fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token },
      credentials: 'same-origin'
    });
  }

  /* ── Init ── */
  async function init() {
    if (!fileId || !leadId) {
      showError('Parámetros inválidos. Se requiere fileId y leadId.');
      return;
    }

    try {
      const resp = await authFetch('/api/leads/' + leadId + '/files/' + fileId + '/content');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const json = await resp.json();
      const dataUrl = json.dataUrl || '';
      if (!dataUrl) throw new Error('Sin datos de archivo');

      if (json.file && json.file.name) {
        titleEl.textContent = json.file.name;
        document.title = json.file.name + ' — Visor';
      }

      await loadPdf(dataUrl);
    } catch (err) {
      showError('No se pudo cargar el documento: ' + err.message);
    }
  }

  function showError(msg) {
    loadingOverlay.innerHTML = '<div class="error-msg">' + msg + '</div>';
  }

  /* ── PDF Loading ── */
  async function loadPdf(dataUrl) {
    const pdfjs = window.pdfjsLib;
    if (!pdfjs) { showError('PDF.js no disponible'); return; }

    pdfjs.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

    // Convert dataUrl to ArrayBuffer
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    pdfBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) pdfBytes[i] = binary.charCodeAt(i);

    pdfDoc = await pdfjs.getDocument({ data: pdfBytes.slice() }).promise;
    pageInfoEl.textContent = pdfDoc.numPages + ' páginas';

    loadingOverlay.remove();
    await createPageSlots();
    setupObserver();
  }

  /* ── Create placeholder slots for all pages ── */
  async function createPageSlots() {
    container.innerHTML = '';
    pageSlots = [];

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: currentScale });

      const wrapper = document.createElement('div');
      wrapper.className = 'pdf-page-wrapper';
      wrapper.style.width = viewport.width + 'px';
      wrapper.style.height = viewport.height + 'px';
      wrapper.dataset.pageNum = i;

      // Placeholder con número de página
      const placeholder = document.createElement('div');
      placeholder.className = 'page-placeholder';
      placeholder.textContent = 'Página ' + i;
      wrapper.appendChild(placeholder);

      container.appendChild(wrapper);
      pageSlots.push({ wrapper: wrapper, rendered: false, pageNum: i });
    }

    zoomLabel.textContent = Math.round(currentScale * 100) + '%';
  }

  /* ── IntersectionObserver — renderiza cuando entra en viewport ── */
  function setupObserver() {
    if (observer) observer.disconnect();

    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var pageNum = parseInt(entry.target.dataset.pageNum, 10);
          var slot = pageSlots[pageNum - 1];
          if (slot && !slot.rendered) {
            renderQueue.add(pageNum);
            processRenderQueue();
          }
        }
      });
    }, {
      root: container,
      rootMargin: '600px 0px'   // pre-render 600px antes de que sea visible
    });

    pageSlots.forEach(function (slot) {
      observer.observe(slot.wrapper);
    });
  }

  /* ── Process render queue sequentially ── */
  async function processRenderQueue() {
    if (rendering) return;
    rendering = true;

    while (renderQueue.size > 0) {
      var pageNum = renderQueue.values().next().value;
      renderQueue.delete(pageNum);

      var slot = pageSlots[pageNum - 1];
      if (!slot || slot.rendered) continue;

      await renderPage(slot);
    }

    rendering = false;
  }

  /* ── Render a single page ── */
  async function renderPage(slot) {
    var page = await pdfDoc.getPage(slot.pageNum);
    var viewport = page.getViewport({ scale: currentScale });
    var wrapper = slot.wrapper;

    // Limpiar placeholder
    wrapper.innerHTML = '';
    wrapper.style.width = viewport.width + 'px';
    wrapper.style.height = viewport.height + 'px';

    // Canvas
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Fondo blanco antes de renderizar (evita artefactos negros con SMask)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    wrapper.appendChild(canvas);

    // Render
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;

    // Text layer
    var textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    textLayerDiv.style.width = viewport.width + 'px';
    textLayerDiv.style.height = viewport.height + 'px';
    wrapper.appendChild(textLayerDiv);

    var textContent = await page.getTextContent();
    buildTextLayer(textContent, textLayerDiv, viewport);

    slot.rendered = true;
    slot.textLayer = textLayerDiv;

    // Si hay búsqueda activa, resaltar en esta página
    var query = searchInput.value.trim();
    if (query.length >= 2) {
      highlightInLayer(textLayerDiv, query);
    }
  }

  /* ── Build text layer ── */
  function buildTextLayer(textContent, layerDiv, viewport) {
    var items = textContent.items;
    var styles = textContent.styles || {};
    var scale = viewport.scale;

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var str = item.str;
      if (!str) continue;

      // item.transform = [scaleX, skewX, skewY, scaleY, translateX, translateY]
      var tx = item.transform;
      var fontSize = Math.hypot(tx[2], tx[3]);

      var span = document.createElement('span');
      span.textContent = str;

      var scaledFontSize = fontSize * scale;
      span.style.fontSize = scaledFontSize + 'px';
      span.style.fontFamily = (styles[item.fontName] && styles[item.fontName].fontFamily) || 'sans-serif';

      // PDF coordinates: origin bottom-left; DOM: origin top-left
      var left = tx[4] * scale;
      var top = viewport.height - (tx[5] * scale) - scaledFontSize;

      span.style.left = left + 'px';
      span.style.top = top + 'px';
      span.style.transformOrigin = '0% 0%';

      // Scale X to match actual glyph width
      if (item.width > 0) {
        var targetWidth = item.width * scale;
        var renderedWidth = getTextWidth(str, scaledFontSize, span.style.fontFamily);
        if (renderedWidth > 0) {
          span.style.transform = 'scaleX(' + (targetWidth / renderedWidth).toFixed(4) + ')';
        }
      }

      layerDiv.appendChild(span);
    }
  }

  /* ── Measure text width ── */
  var measureCanvas = null;
  function getTextWidth(text, fontSize, fontFamily) {
    if (!measureCanvas) measureCanvas = document.createElement('canvas');
    var ctx = measureCanvas.getContext('2d');
    ctx.font = fontSize + 'px ' + fontFamily;
    return ctx.measureText(text).width;
  }

  /* ── Search ── */
  function performSearch(query) {
    clearHighlights();
    if (!query || query.length < 2) {
      searchInfo.textContent = '';
      btnPrev.disabled = true;
      btnNext.disabled = true;
      return;
    }

    // Forzar renderizado de TODAS las páginas para búsqueda completa
    var unrendered = pageSlots.filter(function (s) { return !s.rendered; });
    if (unrendered.length > 0) {
      renderAllForSearch(query);
      return;
    }

    doSearch(query);
  }

  async function renderAllForSearch(query) {
    searchInfo.textContent = 'Cargando...';
    for (var i = 0; i < pageSlots.length; i++) {
      if (!pageSlots[i].rendered) {
        await renderPage(pageSlots[i]);
      }
    }
    doSearch(query);
  }

  function doSearch(query) {
    var normalizedQuery = query.toLowerCase().replace(/\s+/g, '');

    for (var p = 0; p < pageSlots.length; p++) {
      var slot = pageSlots[p];
      if (!slot.textLayer) continue;
      highlightInLayer(slot.textLayer, query);
    }

    if (matches.length > 0) {
      currentMatchIdx = 0;
      activateMatch(0);
      searchInfo.textContent = '1 / ' + matches.length;
      btnPrev.disabled = matches.length <= 1;
      btnNext.disabled = matches.length <= 1;
    } else {
      searchInfo.textContent = 'Sin resultados';
      btnPrev.disabled = true;
      btnNext.disabled = true;
    }
  }

  function highlightInLayer(layerDiv, query) {
    var normalizedQuery = query.toLowerCase().replace(/\s+/g, '');
    var spans = layerDiv.querySelectorAll('span');
    spans.forEach(function (span) {
      var text = span.textContent.toLowerCase().replace(/\s+/g, '');
      if (text.includes(normalizedQuery)) {
        span.classList.add('highlight-match');
        matches.push(span);
      }
    });
  }

  function clearHighlights() {
    matches.forEach(function (span) {
      span.classList.remove('highlight-match', 'active');
    });
    matches = [];
    currentMatchIdx = -1;
  }

  function activateMatch(idx) {
    if (idx < 0 || idx >= matches.length) return;
    matches.forEach(function (s) { s.classList.remove('active'); });
    matches[idx].classList.add('active');
    currentMatchIdx = idx;
    searchInfo.textContent = (idx + 1) + ' / ' + matches.length;
    matches[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function navigateMatch(dir) {
    if (matches.length === 0) return;
    var next = currentMatchIdx + dir;
    if (next < 0) next = matches.length - 1;
    if (next >= matches.length) next = 0;
    activateMatch(next);
  }

  /* ── Event listeners ── */
  searchInput.addEventListener('input', function () {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(function () {
      performSearch(searchInput.value.trim());
    }, 300);
  });

  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) navigateMatch(-1);
      else navigateMatch(1);
    }
    if (e.key === 'Escape') {
      searchInput.value = '';
      clearHighlights();
      searchInfo.textContent = '';
      btnPrev.disabled = true;
      btnNext.disabled = true;
    }
  });

  btnPrev.addEventListener('click', function () { navigateMatch(-1); });
  btnNext.addEventListener('click', function () { navigateMatch(1); });

  /* ── Zoom ── */
  async function reZoom() {
    zoomLabel.textContent = Math.round(currentScale * 100) + '%';
    // Reset all pages
    pageSlots.forEach(function (slot) {
      slot.rendered = false;
      slot.textLayer = null;
    });
    clearHighlights();
    await createPageSlots();
    setupObserver();
  }

  btnZoomIn.addEventListener('click', function () {
    currentScale = Math.min(currentScale + 0.2, 3);
    reZoom();
  });

  btnZoomOut.addEventListener('click', function () {
    currentScale = Math.max(currentScale - 0.2, 0.5);
    reZoom();
  });

  /* ── Zoom con Shift+Scroll ── */
  var zoomDebounce = null;
  container.addEventListener('wheel', function (e) {
    if (!e.shiftKey) return;
    e.preventDefault();

    var delta = e.deltaY > 0 ? -0.1 : 0.1;
    var newScale = Math.min(Math.max(currentScale + delta, 0.3), 4);
    if (newScale === currentScale) return;
    currentScale = newScale;

    clearTimeout(zoomDebounce);
    zoomDebounce = setTimeout(function () {
      reZoom();
    }, 150);

    // Feedback inmediato en el label
    zoomLabel.textContent = Math.round(currentScale * 100) + '%';
  }, { passive: false });

  /* ── BroadcastChannel listener ── */
  var channel;
  try {
    channel = new BroadcastChannel('gw-credit-report');
    channel.onmessage = function (event) {
      var data = event.data;
      if (!data || data.type !== 'SEARCH' || !data.value) return;

      var query = String(data.value).trim();
      searchInput.value = query;
      performSearch(query);

      // Show broadcast badge
      broadcastText.textContent = query;
      broadcastBadge.classList.add('active');
      setTimeout(function () {
        broadcastBadge.classList.remove('active');
      }, 3000);
    };
  } catch (e) {
    console.warn('BroadcastChannel no soportado:', e);
  }

  /* ── Cleanup ── */
  window.addEventListener('beforeunload', function () {
    if (channel) channel.close();
    if (observer) observer.disconnect();
  });

  /* ── Start ── */
  init();
})();
