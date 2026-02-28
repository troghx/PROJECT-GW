(function initQuickActions(globalScope) {
  if (globalScope.__quickActionsInitialized) return;
  globalScope.__quickActionsInitialized = true;

  const doc = document;
  const crmHelpers = globalScope.CrmHelpers || {};
  const SESSION_KEY = 'project_gw_session';
  const CREDITOR_CATALOG_STORAGE_KEY = 'project_gw_creditor_catalog_v1';
  const quickStateNames = crmHelpers.STATE_NAMES || {};
  const ENABLE_CREDITOR_ACTION = true;
  const FALLBACK_CREDITORS_DB = [
    { id: 1, nombre: 'JPMorgan Chase', estatus: 'aceptable', notas: 'Settlements often 40-50%' },
    { id: 2, nombre: 'Bank of America', estatus: 'aceptable', notas: 'Requires strict validation' },
    { id: 3, nombre: 'Wells Fargo', estatus: 'aceptable', notas: '' },
    { id: 4, nombre: 'Citibank', estatus: 'aceptable', notas: 'Aggressive legal team' },
    { id: 5, nombre: 'US Bank', estatus: 'aceptable', notas: '' },
    { id: 6, nombre: 'PNC Bank', estatus: 'aceptable', notas: '' },
    { id: 7, nombre: 'Truist', estatus: 'aceptable', notas: '' },
    { id: 8, nombre: 'Capital One', estatus: 'aceptable', notas: 'Litigious but settles' },
    { id: 9, nombre: 'American Express', estatus: 'aceptable', notas: 'Hard to negotiate' },
    { id: 10, nombre: 'Discover', estatus: 'aceptable', notas: 'Sues frequently' },
    { id: 11, nombre: 'Synchrony Bank', estatus: 'aceptable', notas: 'Handles Amazon/PayPal credit cards' },
    { id: 12, nombre: 'Barclays', estatus: 'aceptable', notas: '' },
    { id: 13, nombre: 'Credit One Bank', estatus: 'aceptable', notas: 'Subprime lender' },
    { id: 14, nombre: 'Goldman Sachs', estatus: 'aceptable', notas: 'Apple Card issuer' },
    { id: 15, nombre: 'Ally Bank', estatus: 'aceptable', notas: '' },
    { id: 16, nombre: 'Navy Federal Credit Union', estatus: 'aceptable', notas: 'Does not sell debt usually' },
    { id: 17, nombre: 'USAA', estatus: 'aceptable', notas: '' },
    { id: 18, nombre: 'Citizens Bank', estatus: 'aceptable', notas: '' },
    { id: 19, nombre: 'Santander Consumer USA', estatus: 'aceptable', notas: 'Auto loans mostly' },
    { id: 20, nombre: 'Comenity Bank', estatus: 'aceptable', notas: 'Store cards issuer' },
    { id: 21, nombre: 'Merrick Bank', estatus: 'no_aceptable', notas: 'High interest / Fees' },
    { id: 22, nombre: 'First Premier Bank', estatus: 'no_aceptable', notas: 'Predatory fees' },
    { id: 23, nombre: 'Credit Acceptance', estatus: 'no_aceptable', notas: 'Aggressive auto collections' },
    { id: 24, nombre: 'Portfolio Recovery Associates', estatus: 'no_aceptable', notas: 'Debt Buyer' },
    { id: 25, nombre: 'Midland Credit Management', estatus: 'no_aceptable', notas: 'Debt Buyer (Encore)' },
    { id: 26, nombre: 'LVNV Funding', estatus: 'no_aceptable', notas: 'Debt Buyer' },
    { id: 27, nombre: 'OneMain Financial', estatus: 'no_aceptable', notas: 'Secured loans risk' },
    { id: 28, nombre: 'Ace Cash Express', estatus: 'no_aceptable', notas: 'Payday Lender' },
    { id: 29, nombre: 'Speedy Cash', estatus: 'no_aceptable', notas: 'Payday Lender' },
    { id: 30, nombre: 'Quick Cash Loans LLC', estatus: 'no_aceptable', notas: 'Example Payday' },
    { id: 31, nombre: '1st Franklin Financial', estatus: 'no_aceptable', notas: 'High-cost installment lender' }
  ];

  function cloneCreditorCatalog(entries) {
    return (Array.isArray(entries) ? entries : [])
      .map((entry) => ({
        id: Number(entry?.id || 0),
        nombre: String(entry?.nombre || '').trim(),
        estatus: entry?.estatus === 'no_aceptable' ? 'no_aceptable' : 'aceptable',
        notas: String(entry?.notas || '').trim()
      }))
      .filter((entry) => entry.nombre)
      .map((entry, index) => ({
        id: entry.id > 0 ? entry.id : index + 1,
        nombre: entry.nombre,
        estatus: entry.estatus,
        notas: entry.notas
      }));
  }

  function getCatalogFromHelpers() {
    if (typeof crmHelpers.getCreditorStatusCatalog === 'function') {
      const list = crmHelpers.getCreditorStatusCatalog();
      if (Array.isArray(list) && list.length) return cloneCreditorCatalog(list);
    }
    if (Array.isArray(crmHelpers.CREDITOR_STATUS_CATALOG) && crmHelpers.CREDITOR_STATUS_CATALOG.length) {
      return cloneCreditorCatalog(crmHelpers.CREDITOR_STATUS_CATALOG);
    }
    return cloneCreditorCatalog(FALLBACK_CREDITORS_DB);
  }

  function readStoredCreditorCatalog() {
    try {
      const raw = localStorage.getItem(CREDITOR_CATALOG_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? cloneCreditorCatalog(parsed) : null;
    } catch (_error) {
      return null;
    }
  }

  function persistCreditorCatalog(entries) {
    try {
      localStorage.setItem(CREDITOR_CATALOG_STORAGE_KEY, JSON.stringify(entries));
    } catch (_error) {
      // noop: localStorage full o restringido
    }
  }

  function syncCatalogWithHelpers(entries) {
    const cloned = cloneCreditorCatalog(entries);
    if (typeof crmHelpers.setCreditorStatusCatalog === 'function') {
      const updated = crmHelpers.setCreditorStatusCatalog(cloned);
      return cloneCreditorCatalog(updated);
    }
    return cloned;
  }

  function mergeCatalogWithStored(baseCatalog, storedCatalog) {
    const base = cloneCreditorCatalog(baseCatalog);
    const stored = cloneCreditorCatalog(storedCatalog);
    if (!stored.length) return base;

    const map = new Map();
    base.forEach((entry) => {
      map.set(normalizeText(entry.nombre), { ...entry });
    });

    stored.forEach((entry) => {
      const key = normalizeText(entry.nombre);
      if (!key) return;

      const current = map.get(key);
      if (!current) {
        map.set(key, { ...entry });
        return;
      }

      current.estatus = entry.estatus;
      if (entry.notas) current.notas = entry.notas;
      if (entry.nombre.length > current.nombre.length) current.nombre = entry.nombre;
    });

    return Array.from(map.values())
      .sort(sortCreditorsByName)
      .map((entry, index) => ({
        ...entry,
        id: index + 1
      }));
  }

  function initializeCreditorCatalog() {
    const stored = readStoredCreditorCatalog();
    const source = getCatalogFromHelpers();
    const merged = mergeCatalogWithStored(source, stored);
    const synced = syncCatalogWithHelpers(merged);
    const withIds = synced.map((entry, index) => ({
      ...entry,
      id: index + 1
    }));
    persistCreditorCatalog(withIds);
    return withIds;
  }

  let creditorsDb = initializeCreditorCatalog();

  function getCreditorCatalog() {
    return creditorsDb;
  }

  function setCreditorCatalog(entries, options = {}) {
    const { persist = true } = options;
    const synced = syncCatalogWithHelpers(entries)
      .map((entry, index) => ({
        ...entry,
        id: index + 1
      }));
    creditorsDb = synced;
    if (persist) persistCreditorCatalog(synced);
    return creditorsDb;
  }

  const pointer = {
    x: Math.round(globalScope.innerWidth / 2),
    y: Math.round(globalScope.innerHeight / 2)
  };

  let menuOpen = false;
  let hintTimer = null;
  let leadModalContext = null;
  let creditorModalContext = null;
  let creditorEditorModalContext = null;

  function isHomeActive() {
    return doc.body?.classList.contains('home-active');
  }

  function isBlockedTarget(target) {
    if (!target || !(target instanceof Element)) return false;
    return Boolean(
      target.closest(
        'input, textarea, select, option, [contenteditable="true"], .modal, .state-suggestions, .quick-radial-menu'
      )
    );
  }

  function escapeHtml(value) {
    if (crmHelpers.escapeHtml) return crmHelpers.escapeHtml(value);
    const div = doc.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
  }

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildScoreMeta(query, creditorName) {
    const q = normalizeText(query);
    const c = normalizeText(creditorName);
    if (!q || !c) return { score: 0, reason: 'sin_coincidencia' };

    if (q === c) return { score: 1000, reason: 'coincidencia exacta' };
    if (c.startsWith(q)) return { score: 900 + q.length, reason: 'coincidencia por prefijo' };
    if (c.includes(q)) return { score: 780 + q.length, reason: 'coincidencia parcial' };
    if (q.includes(c)) return { score: 730 + c.length, reason: 'consulta contiene al acreedor' };

    const qTokens = q.split(' ').filter(Boolean);
    const cTokens = c.split(' ').filter(Boolean);
    const cSet = new Set(cTokens);
    const overlap = qTokens.filter((token) => cSet.has(token));

    if (overlap.length >= 2) {
      return { score: 500 + overlap.length * 40, reason: 'coincidencia por palabras clave' };
    }
    if (overlap.length === 1 && q.length >= 5) {
      return { score: 350, reason: 'coincidencia por palabra clave' };
    }

    return { score: 0, reason: 'sin_coincidencia' };
  }

  function findBestCreditorMatch(query) {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return null;

    let best = null;
    for (const creditor of getCreditorCatalog()) {
      const matchMeta = buildScoreMeta(normalizedQuery, creditor.nombre);
      if (matchMeta.score <= 0) continue;
      if (!best || matchMeta.score > best.score) {
        best = { creditor, score: matchMeta.score, reason: matchMeta.reason };
      }
    }

    if (!best) return null;
    if (best.score < 330) return null;
    return best;
  }

  function findCreditorSuggestions(query, limit = 6) {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return [];

    return getCreditorCatalog().map((creditor) => {
      const matchMeta = buildScoreMeta(normalizedQuery, creditor.nombre);
      return { creditor, score: matchMeta.score };
    })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  function formatPhoneInput(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  function getSessionUserName() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return 'Usuario';
    try {
      const parsed = JSON.parse(raw);
      return parsed?.username || parsed?.name || 'Usuario';
    } catch (_error) {
      return 'Usuario';
    }
  }

  function getSessionUserData() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  function hasLeadAuditAccess() {
    const session = getSessionUserData();
    const role = String(session?.role || '').trim().toLowerCase();
    if (role === 'admin' || role === 'supervisor') return true;
    const permissions = Array.isArray(session?.permissions)
      ? session.permissions.map((value) => String(value || '').trim().toLowerCase())
      : [];
    return permissions.includes('audit.view');
  }

  function hasCreditorEditorAccess() {
    const session = getSessionUserData();
    const role = String(session?.role || '').trim().toLowerCase();
    if (role === 'admin' || role === 'supervisor') return true;
    const permissions = Array.isArray(session?.permissions)
      ? session.permissions.map((value) => String(value || '').trim().toLowerCase())
      : [];
    return permissions.includes('users.manage') || permissions.includes('users.permissions.manage');
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof data.message === 'string' ? data.message : 'Error en la solicitud.';
      throw new Error(message);
    }
    return data;
  }

  function createRadialMenu() {
    const creditorDisabledClass = ENABLE_CREDITOR_ACTION ? '' : ' is-disabled';
    const creditorDisabledAttrs = ENABLE_CREDITOR_ACTION ? '' : ' aria-disabled="true"';

    const radial = doc.createElement('div');
    radial.className = 'quick-radial-menu';
    radial.innerHTML = `
      <button
        type="button"
        class="quick-radial-node quick-radial-node-creditor${creditorDisabledClass}"
        data-action="creditor"
        style="--orbit-phase:0deg;--open-dx:-118px;--open-dy:-16px;"
        ${creditorDisabledAttrs}
      >
        <span class="quick-node-dot" aria-hidden="true"></span>
        <svg class="quick-node-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 7h18M6 12h12M9 17h6"/>
        </svg>
        <span class="quick-node-label">Acreedor califica</span>
      </button>

      <button
        type="button"
        class="quick-radial-node quick-radial-node-lead"
        data-action="lead"
        style="--orbit-phase:180deg;--open-dx:118px;--open-dy:-16px;"
      >
        <span class="quick-node-dot" aria-hidden="true"></span>
        <svg class="quick-node-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="8.5" cy="7" r="3.2"/>
          <path d="M20 8v6M17 11h6"/>
        </svg>
        <span class="quick-node-label">Nuevo Lead</span>
      </button>

      <button
        type="button"
        class="quick-radial-node quick-radial-node-audit is-disabled"
        data-action="lead-audit"
        style="--orbit-phase:300deg;--open-dx:0px;--open-dy:116px;"
        aria-disabled="true"
      >
        <span class="quick-node-dot" aria-hidden="true"></span>
        <svg class="quick-node-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 7h11M9 12h11M9 17h11"/>
          <circle cx="4" cy="7" r="1.5"/>
          <circle cx="4" cy="12" r="1.5"/>
          <circle cx="4" cy="17" r="1.5"/>
        </svg>
        <span class="quick-node-label">Historial Lead</span>
      </button>

      <p id="quickRadialHint" class="quick-radial-hint" aria-live="polite"></p>
    `;

    doc.body.appendChild(radial);
    return radial;
  }

  function createLeadModalTemplate() {
    return `
      <div id="newLeadModal" class="modal hidden">
        <div class="modal-backdrop"></div>
        <div class="modal-content">
          <button class="modal-close-mac" id="closeModalBtn" type="button" title="Cerrar"></button>

          <div class="modal-header">
            <h3>Nuevo Lead</h3>
          </div>

          <form id="newLeadForm" class="modal-form">
            <div class="form-group toggle-group test-toggle-top">
              <label class="toggle-label">
                <input type="checkbox" id="isTestLead" name="isTest">
                <span class="toggle-switch">
                  <span class="toggle-thumb"></span>
                </span>
                <span class="toggle-text">Test</span>
              </label>
            </div>

            <div class="form-group">
              <label for="leadName">Nombre del Cliente *</label>
              <input type="text" id="leadName" name="fullName" placeholder="Ej: Juan Perez" required>
            </div>

            <div class="form-group">
              <label for="leadPhone">Numero de Telefono *</label>
              <input type="tel" id="leadPhone" name="phone" placeholder="Ej: 305-555-0123" required>
            </div>

            <div id="duplicateAlert" class="duplicate-alert hidden" role="alert" aria-live="polite">
              <div class="duplicate-alert-head">Posibles duplicados detectados</div>
              <p id="duplicateSummary" class="duplicate-summary"></p>
              <div id="duplicateList" class="duplicate-list"></div>
              <div class="duplicate-actions">
                <button type="button" id="openDuplicateBtn" class="duplicate-btn duplicate-btn-secondary">Abrir existente</button>
                <button type="button" id="linkAndCreateBtn" class="duplicate-btn duplicate-btn-primary">Crear y marcar relacion</button>
                <button type="button" id="forceCreateBtn" class="duplicate-btn duplicate-btn-ghost">Crear de todos modos</button>
              </div>
            </div>

            <div class="form-group state-search-group">
              <label for="leadStateSearch">Estado (US)</label>
              <div class="state-search-wrapper">
                <input type="text" id="leadStateSearch" placeholder="Buscar estado..." autocomplete="off">
                <input type="hidden" id="leadState" name="stateCode">
                <div id="stateSuggestions" class="state-suggestions hidden"></div>
                <div id="stateDetected" class="state-detected hidden"></div>
              </div>
            </div>

            <div class="form-actions">
              <button type="button" class="btn-cancel" id="cancelLeadBtn">Cancelar</button>
              <button type="submit" class="btn-create">Crear Lead</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function createCreditorModalTemplate() {
    return `
      <div id="quickCreditorModal" class="modal hidden">
        <div class="modal-backdrop"></div>
        <div class="modal-content quick-creditor-modal-content">
          <button class="modal-close-mac" id="quickCreditorCloseBtn" type="button" title="Cerrar"></button>

          <div class="modal-header">
            <h3>Validar Acreedor</h3>
          </div>

          <form id="quickCreditorForm" class="modal-form quick-creditor-form">
            <div class="form-group">
              <label for="quickCreditorInput">Nombre del acreedor *</label>
              <input
                type="text"
                id="quickCreditorInput"
                name="creditorName"
                placeholder="Ej: Capital One, Discover, Citibank..."
                autocomplete="off"
                required
              >
            </div>

            <div id="quickCreditorSuggest" class="quick-creditor-suggest hidden"></div>
            <div id="quickCreditorResult" class="quick-creditor-result hidden" aria-live="polite"></div>

            <div class="form-actions">
              <button type="button" class="btn-cancel" id="quickCreditorCancelBtn">Cerrar</button>
              <button type="button" class="btn-create" id="quickCreditorEditBtn">Editar Acreedores</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function createCreditorEditorModalTemplate() {
    return `
      <div id="quickCreditorEditorModal" class="modal hidden">
        <div class="modal-backdrop"></div>
        <div class="modal-content quick-creditor-editor-modal-content">
          <button class="modal-close-mac" id="quickCreditorEditorCloseBtn" type="button" title="Cerrar"></button>

          <div class="modal-header">
            <h3>Editor de Acreedores</h3>
          </div>

          <div class="quick-creditor-editor-toolbar">
            <p class="quick-creditor-editor-tip">Arrastra un acreedor de una lista a otra para cambiar su estado.</p>
            <input type="text" id="quickCreditorEditorFilter" class="quick-creditor-editor-filter" placeholder="Filtrar acreedor...">
          </div>

          <div class="quick-creditor-editor-grid">
            <section class="quick-creditor-editor-column" data-editor-status="aceptable">
              <div class="quick-creditor-editor-column-head">
                <h4>Aceptables</h4>
                <span id="quickCreditorAcceptCount" class="quick-creditor-editor-count">0</span>
              </div>
              <div id="quickCreditorAcceptList" class="quick-creditor-editor-list" data-drop-status="aceptable"></div>
            </section>

            <section class="quick-creditor-editor-column" data-editor-status="no_aceptable">
              <div class="quick-creditor-editor-column-head">
                <h4>No aceptables</h4>
                <span id="quickCreditorNotAcceptCount" class="quick-creditor-editor-count is-not-acceptable">0</span>
              </div>
              <div id="quickCreditorNotAcceptList" class="quick-creditor-editor-list" data-drop-status="no_aceptable"></div>
            </section>
          </div>

          <div class="form-actions">
            <button type="button" class="btn-cancel" id="quickCreditorEditorCloseFooterBtn">Cerrar</button>
          </div>
        </div>
      </div>
    `;
  }

  function sortCreditorsByName(a, b) {
    return String(a?.nombre || '').localeCompare(String(b?.nombre || ''), 'en', { sensitivity: 'base' });
  }

  function renderCreditorResult(resultRoot, matchEntry, query) {
    if (!resultRoot) return;

    const safeQuery = escapeHtml(query);
    if (!matchEntry || !matchEntry.creditor) {
      resultRoot.className = 'quick-creditor-result is-not-found';
      resultRoot.innerHTML = `
        <div class="quick-creditor-result-title">No encontrado</div>
        <p class="quick-creditor-result-line">No localizamos "${safeQuery}" en la base actual.</p>
        <p class="quick-creditor-result-note">Puedes revisar ortografia o intentar con el nombre comercial del acreedor.</p>
      `;
      resultRoot.classList.remove('hidden');
      return;
    }

    const { creditor, reason } = matchEntry;
    const isAcceptable = creditor.estatus === 'aceptable';
    const statusText = isAcceptable ? 'ACEPTABLE' : 'NO ACEPTABLE';
    const statusClass = isAcceptable ? 'is-acceptable' : 'is-not-acceptable';

    resultRoot.className = `quick-creditor-result ${statusClass}`;
    resultRoot.innerHTML = `
      <div class="quick-creditor-result-head">
        <span class="quick-creditor-result-title">${escapeHtml(creditor.nombre)}</span>
        <span class="quick-creditor-status ${statusClass}">${statusText}</span>
      </div>
      <p class="quick-creditor-result-line">Coincidencia: ${escapeHtml(reason || 'coincidencia parcial')}</p>
      ${creditor.notas ? `<p class="quick-creditor-result-note">${escapeHtml(creditor.notas)}</p>` : ''}
    `;
    resultRoot.classList.remove('hidden');
  }

  function bindCreditorModal(modal) {
    if (!modal || modal.dataset.quickCreditorBound === '1') return;
    modal.dataset.quickCreditorBound = '1';

    const refs = {
      modal,
      form: modal.querySelector('#quickCreditorForm'),
      closeBtn: modal.querySelector('#quickCreditorCloseBtn'),
      cancelBtn: modal.querySelector('#quickCreditorCancelBtn'),
      editBtn: modal.querySelector('#quickCreditorEditBtn'),
      backdrop: modal.querySelector('.modal-backdrop'),
      input: modal.querySelector('#quickCreditorInput'),
      suggest: modal.querySelector('#quickCreditorSuggest'),
      result: modal.querySelector('#quickCreditorResult')
    };

    const closeModal = () => {
      refs.modal.classList.add('hidden');
      refs.form?.reset();
      refs.suggest?.classList.add('hidden');
      refs.suggest && (refs.suggest.innerHTML = '');
      refs.result?.classList.add('hidden');
      refs.result && (refs.result.innerHTML = '');
    };

    const resetForOpen = () => {
      refs.form?.reset();
      refs.suggest?.classList.add('hidden');
      refs.suggest && (refs.suggest.innerHTML = '');
      refs.result?.classList.add('hidden');
      refs.result && (refs.result.innerHTML = '');
      if (refs.editBtn) {
        const canEditCreditors = hasCreditorEditorAccess();
        refs.editBtn.hidden = !canEditCreditors;
        refs.editBtn.disabled = !canEditCreditors;
      }
    };

    const renderSuggestions = (query) => {
      if (!refs.suggest) return;
      const suggestions = findCreditorSuggestions(query, 6);

      if (!suggestions.length) {
        refs.suggest.classList.add('hidden');
        refs.suggest.innerHTML = '';
        return;
      }

      refs.suggest.innerHTML = suggestions
        .map((entry) => {
          const creditor = entry.creditor;
          const statusLabel = creditor.estatus === 'aceptable' ? 'ACEPTABLE' : 'NO ACEPTABLE';
          const statusClass = creditor.estatus === 'aceptable' ? 'is-acceptable' : 'is-not-acceptable';
          return `
            <button type="button" class="quick-creditor-suggest-item" data-creditor-id="${creditor.id}">
              <span class="quick-creditor-suggest-name">${escapeHtml(creditor.nombre)}</span>
              <span class="quick-creditor-status ${statusClass}">${statusLabel}</span>
            </button>
          `;
        })
        .join('');
      refs.suggest.classList.remove('hidden');

      refs.suggest.querySelectorAll('.quick-creditor-suggest-item').forEach((item) => {
        item.addEventListener('mousedown', (event) => {
          event.preventDefault();
          const creditorId = Number(item.dataset.creditorId || 0);
          const selected = getCreditorCatalog().find((creditor) => Number(creditor.id) === creditorId);
          if (!selected) return;
          refs.input.value = selected.nombre;
          refs.suggest.classList.add('hidden');
          refs.suggest.innerHTML = '';
          const directMatch = { creditor: selected, reason: 'seleccion directa' };
          renderCreditorResult(refs.result, directMatch, selected.nombre);
        });
      });
    };

    modal.__quickCreditorCloseModal = closeModal;
    modal.__quickCreditorResetForOpen = resetForOpen;

    refs.closeBtn?.addEventListener('click', closeModal);
    refs.cancelBtn?.addEventListener('click', closeModal);
    refs.editBtn?.addEventListener('click', () => {
      if (!hasCreditorEditorAccess()) return;
      closeModal();
      openCreditorEditorModal();
    });
    refs.backdrop?.addEventListener('click', closeModal);

    refs.input?.addEventListener('input', () => {
      refs.result?.classList.add('hidden');
      refs.result && (refs.result.innerHTML = '');
      renderSuggestions(refs.input.value);
    });

    refs.input?.addEventListener('focus', () => {
      renderSuggestions(refs.input.value);
    });

    refs.form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const query = String(refs.input?.value || '').trim();
      if (!query) return;
      refs.suggest?.classList.add('hidden');
      refs.suggest && (refs.suggest.innerHTML = '');
      const matchEntry = findBestCreditorMatch(query);
      renderCreditorResult(refs.result, matchEntry, query);
    });
  }

  function ensureCreditorModal() {
    if (creditorModalContext?.modal) return creditorModalContext;

    let modal = doc.getElementById('quickCreditorModal');
    if (!modal) {
      const temp = doc.createElement('div');
      temp.innerHTML = createCreditorModalTemplate().trim();
      modal = temp.firstElementChild;
      doc.body.appendChild(modal);
    } else if (modal.parentElement !== doc.body) {
      doc.body.appendChild(modal);
    }

    bindCreditorModal(modal);
    creditorModalContext = { modal };
    return creditorModalContext;
  }

  function openCreditorModal() {
    if (!ENABLE_CREDITOR_ACTION) return;
    const context = ensureCreditorModal();
    const modal = context?.modal;
    if (!modal) return;
    if (typeof modal.__quickCreditorResetForOpen === 'function') {
      modal.__quickCreditorResetForOpen();
    }
    modal.classList.remove('hidden');
    globalScope.requestAnimationFrame(() => {
      modal.querySelector('#quickCreditorInput')?.focus();
    });
  }

  function bindCreditorEditorModal(modal) {
    if (!modal || modal.dataset.quickCreditorEditorBound === '1') return;
    modal.dataset.quickCreditorEditorBound = '1';

    const refs = {
      modal,
      closeBtn: modal.querySelector('#quickCreditorEditorCloseBtn'),
      closeFooterBtn: modal.querySelector('#quickCreditorEditorCloseFooterBtn'),
      backdrop: modal.querySelector('.modal-backdrop'),
      filterInput: modal.querySelector('#quickCreditorEditorFilter'),
      acceptList: modal.querySelector('#quickCreditorAcceptList'),
      notAcceptList: modal.querySelector('#quickCreditorNotAcceptList'),
      acceptCount: modal.querySelector('#quickCreditorAcceptCount'),
      notAcceptCount: modal.querySelector('#quickCreditorNotAcceptCount')
    };

    const state = {
      filter: '',
      drag: {
        active: false,
        pointerId: null,
        creditorId: 0,
        sourceStatus: '',
        hoverStatus: '',
        originEl: null,
        ghostEl: null,
        width: 0,
        height: 0,
        grabOffsetX: 0,
        grabOffsetY: 0,
        transformOriginX: 0,
        transformOriginY: 0,
        grabNormX: 0,
        grabNormY: 0,
        targetLeft: 0,
        targetTop: 0,
        smoothLeft: 0,
        smoothTop: 0,
        rafId: 0
      }
    };

    const closeModal = () => {
      resetDragState();
      refs.modal.classList.add('hidden');
    };

    const clearDropTargets = () => {
      refs.acceptList?.classList.remove('is-drop-target');
      refs.notAcceptList?.classList.remove('is-drop-target');
    };

    const setDropTarget = (status) => {
      clearDropTargets();
      if (status === 'aceptable') refs.acceptList?.classList.add('is-drop-target');
      if (status === 'no_aceptable') refs.notAcceptList?.classList.add('is-drop-target');
    };

    const findDropStatusAtPoint = (x, y) => {
      const node = doc.elementFromPoint(x, y);
      const zone = node?.closest('.quick-creditor-editor-list[data-drop-status]');
      const dropStatus = String(zone?.getAttribute('data-drop-status') || '');
      if (dropStatus === 'aceptable' || dropStatus === 'no_aceptable') return dropStatus;
      return '';
    };

    const destroyDragGhost = () => {
      if (state.drag.ghostEl?.parentElement) {
        state.drag.ghostEl.remove();
      }
      state.drag.ghostEl = null;
    };

    const stopDragLoop = () => {
      if (state.drag.rafId) {
        cancelAnimationFrame(state.drag.rafId);
        state.drag.rafId = 0;
      }
    };

    const resetDragState = () => {
      stopDragLoop();
      destroyDragGhost();
      clearDropTargets();
      if (state.drag.originEl) {
        state.drag.originEl.classList.remove('is-grabbed');
      }
      doc.body.classList.remove('quick-creditor-drag-active');
      state.drag.active = false;
      state.drag.pointerId = null;
      state.drag.creditorId = 0;
      state.drag.sourceStatus = '';
      state.drag.hoverStatus = '';
      state.drag.originEl = null;
      state.drag.width = 0;
      state.drag.height = 0;
      state.drag.grabOffsetX = 0;
      state.drag.grabOffsetY = 0;
      state.drag.transformOriginX = 0;
      state.drag.transformOriginY = 0;
      state.drag.grabNormX = 0;
      state.drag.grabNormY = 0;
      state.drag.targetLeft = 0;
      state.drag.targetTop = 0;
      state.drag.smoothLeft = 0;
      state.drag.smoothTop = 0;
    };

    const buildGhostTransform = (left, top, opts = {}) => {
      const {
        scale = 1,
        tiltX = 0,
        tiltY = 0,
        tiltZ = 0
      } = opts;
      return [
        'perspective(1120px)',
        `translate3d(${left.toFixed(2)}px, ${top.toFixed(2)}px, 0)`,
        `scale(${Number(scale).toFixed(3)})`,
        `rotateX(${Number(tiltX).toFixed(2)}deg)`,
        `rotateY(${Number(tiltY).toFixed(2)}deg)`,
        `rotateZ(${Number(tiltZ).toFixed(2)}deg)`
      ].join(' ');
    };

    const tickDragPhysics = () => {
      if (!state.drag.active || !state.drag.ghostEl) return;

      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      const easing = 0.24;
      state.drag.smoothLeft += (state.drag.targetLeft - state.drag.smoothLeft) * easing;
      state.drag.smoothTop += (state.drag.targetTop - state.drag.smoothTop) * easing;
      const velocityX = state.drag.targetLeft - state.drag.smoothLeft;
      const velocityY = state.drag.targetTop - state.drag.smoothTop;

      const baseTiltX = clamp(state.drag.grabNormY * 9.2, -12, 12);
      const baseTiltY = clamp(state.drag.grabNormX * 11.2, -14, 14);
      const baseTiltZ = 0;

      const dynTiltX = clamp(velocityY * -0.075, -4.2, 4.2);
      const dynTiltY = clamp(velocityX * 0.082, -5.4, 5.4);
      const dynTiltZ = clamp(velocityX * 0.026, -2.6, 2.6);

      const tiltX = clamp(baseTiltX + dynTiltX, -14, 14);
      const tiltY = clamp(baseTiltY + dynTiltY, -16, 16);
      const tiltZ = clamp(baseTiltZ + dynTiltZ, -10, 10);

      state.drag.ghostEl.style.transform = buildGhostTransform(
        state.drag.smoothLeft,
        state.drag.smoothTop,
        { scale: 1.024, tiltX, tiltY, tiltZ }
      );

      state.drag.rafId = requestAnimationFrame(tickDragPhysics);
    };

    const animateGhostRelease = (toX, toY, onDone) => {
      if (!state.drag.ghostEl) {
        if (typeof onDone === 'function') onDone();
        return;
      }

      stopDragLoop();
      const ghost = state.drag.ghostEl;
      ghost.classList.add('is-releasing');
      const startLeft = state.drag.smoothLeft;
      const startTop = state.drag.smoothTop;
      const targetLeft = toX - (state.drag.width / 2);
      const targetTop = toY - (state.drag.height / 2);
      const overshootLeft = targetLeft + ((targetLeft - startLeft) * 0.08);
      const overshootTop = targetTop + ((targetTop - startTop) * 0.08);

      ghost.style.transition = 'transform 130ms cubic-bezier(0.16, 0.84, 0.3, 1.15), opacity 130ms ease';
      ghost.style.transform = buildGhostTransform(overshootLeft, overshootTop, {
        scale: 0.99,
        tiltX: state.drag.grabNormY * 2,
        tiltY: state.drag.grabNormX * 2.4,
        tiltZ: state.drag.grabNormX * 1.8
      });

      globalScope.setTimeout(() => {
        ghost.style.transition = 'transform 110ms cubic-bezier(0.2, 0.92, 0.35, 1), opacity 110ms ease';
        ghost.style.transform = buildGhostTransform(targetLeft, targetTop, { scale: 1, tiltX: 0, tiltY: 0, tiltZ: 0 });
      }, 130);

      globalScope.setTimeout(() => {
        if (typeof onDone === 'function') onDone();
      }, 250);
    };

    const finishPointerDrag = (pointerX, pointerY) => {
      if (!state.drag.active) return;

      const targetStatus = state.drag.hoverStatus || findDropStatusAtPoint(pointerX, pointerY);
      const shouldApply = Boolean(
        targetStatus &&
        targetStatus !== state.drag.sourceStatus &&
        state.drag.creditorId
      );

      const releaseTarget = (() => {
        if (shouldApply) {
          const zone = targetStatus === 'aceptable' ? refs.acceptList : refs.notAcceptList;
          if (zone) {
            const rect = zone.getBoundingClientRect();
            return { x: rect.left + (rect.width / 2), y: rect.top + Math.min(70, rect.height / 2) };
          }
        }
        if (state.drag.originEl) {
          const rect = state.drag.originEl.getBoundingClientRect();
          return { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) };
        }
        return { x: pointerX, y: pointerY };
      })();

      animateGhostRelease(releaseTarget.x, releaseTarget.y, () => {
        const creditorId = state.drag.creditorId;
        resetDragState();
        if (shouldApply) {
          applyCreditorStatusChange(creditorId, targetStatus);
        }
      });
    };

    const renderEditorLists = () => {
      const all = getCreditorCatalog().slice().sort(sortCreditorsByName);
      const normalizedFilter = normalizeText(state.filter);
      const visible = normalizedFilter
        ? all.filter((entry) => normalizeText(entry.nombre).includes(normalizedFilter))
        : all;

      const acceptableVisible = visible.filter((entry) => entry.estatus === 'aceptable');
      const notAcceptableVisible = visible.filter((entry) => entry.estatus === 'no_aceptable');
      const acceptableTotal = all.filter((entry) => entry.estatus === 'aceptable').length;
      const notAcceptableTotal = all.filter((entry) => entry.estatus === 'no_aceptable').length;

      refs.acceptCount.textContent = normalizedFilter
        ? `${acceptableVisible.length}/${acceptableTotal}`
        : String(acceptableTotal);
      refs.notAcceptCount.textContent = normalizedFilter
        ? `${notAcceptableVisible.length}/${notAcceptableTotal}`
        : String(notAcceptableTotal);

      const renderItems = (entries, targetStatus) => {
        if (!entries.length) {
          return '<div class="quick-creditor-editor-empty">Sin acreedores en esta lista.</div>';
        }
        return entries
          .map((entry) => {
            const statusClass = entry.estatus === 'aceptable' ? 'is-acceptable' : 'is-not-acceptable';
            const statusText = entry.estatus === 'aceptable' ? 'ACEPTABLE' : 'NO ACEPTABLE';
            const nextStatus = targetStatus === 'aceptable' ? 'no_aceptable' : 'aceptable';
            const toggleLabel = targetStatus === 'aceptable' ? 'Pasar a No aceptable' : 'Pasar a Aceptable';

            return `
              <article class="quick-creditor-editor-item" draggable="false" data-creditor-id="${entry.id}" data-creditor-status="${entry.estatus}">
                <div class="quick-creditor-editor-item-name">${escapeHtml(entry.nombre)}</div>
                <div class="quick-creditor-editor-item-meta">
                  <span class="quick-creditor-status ${statusClass}">${statusText}</span>
                  <button type="button" class="quick-creditor-editor-toggle-btn" data-creditor-id="${entry.id}" data-next-status="${nextStatus}">${toggleLabel}</button>
                </div>
              </article>
            `;
          })
          .join('');
      };

      if (refs.acceptList) refs.acceptList.innerHTML = renderItems(acceptableVisible, 'aceptable');
      if (refs.notAcceptList) refs.notAcceptList.innerHTML = renderItems(notAcceptableVisible, 'no_aceptable');

      refs.modal.querySelectorAll('.quick-creditor-editor-item').forEach((item) => {
        item.addEventListener('pointerdown', (event) => {
          if (event.button !== 0) return;
          const blocked = event.target instanceof Element
            ? event.target.closest('.quick-creditor-editor-toggle-btn')
            : null;
          if (blocked) return;

          const creditorId = Number(item.getAttribute('data-creditor-id') || 0);
          const sourceStatus = String(item.getAttribute('data-creditor-status') || '');
          if (!creditorId || (sourceStatus !== 'aceptable' && sourceStatus !== 'no_aceptable')) return;

          event.preventDefault();

          const rect = item.getBoundingClientRect();
          const ghost = item.cloneNode(true);
          ghost.classList.add('quick-creditor-drag-ghost');
          ghost.classList.remove('is-grabbed');
          ghost.style.width = `${rect.width}px`;
          ghost.style.height = `${rect.height}px`;
          ghost.style.transform = `translate3d(${rect.left.toFixed(2)}px, ${rect.top.toFixed(2)}px, 0)`;
          doc.body.appendChild(ghost);

          state.drag.active = true;
          state.drag.pointerId = event.pointerId;
          state.drag.creditorId = creditorId;
          state.drag.sourceStatus = sourceStatus;
          state.drag.originEl = item;
          state.drag.ghostEl = ghost;
          state.drag.width = rect.width;
          state.drag.height = rect.height;
          state.drag.grabOffsetX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
          state.drag.grabOffsetY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
          state.drag.transformOriginX = state.drag.grabOffsetX;
          state.drag.transformOriginY = state.drag.grabOffsetY;
          state.drag.grabNormX = ((state.drag.grabOffsetX / Math.max(1, rect.width)) - 0.5) * 2;
          state.drag.grabNormY = ((state.drag.grabOffsetY / Math.max(1, rect.height)) - 0.5) * 2;
          ghost.style.transformOrigin = `${state.drag.transformOriginX.toFixed(2)}px ${state.drag.transformOriginY.toFixed(2)}px`;
          state.drag.targetLeft = rect.left;
          state.drag.targetTop = rect.top;
          state.drag.smoothLeft = rect.left;
          state.drag.smoothTop = rect.top;
          state.drag.hoverStatus = '';
          item.classList.add('is-grabbed');
          doc.body.classList.add('quick-creditor-drag-active');
          setDropTarget(sourceStatus);
          tickDragPhysics();
        });
      });

      refs.modal.querySelectorAll('.quick-creditor-editor-toggle-btn').forEach((button) => {
        button.addEventListener('click', () => {
          const creditorId = Number(button.getAttribute('data-creditor-id') || 0);
          const nextStatus = String(button.getAttribute('data-next-status') || '');
          if (!creditorId || (nextStatus !== 'aceptable' && nextStatus !== 'no_aceptable')) return;
          applyCreditorStatusChange(creditorId, nextStatus);
        });
      });
    };

    const applyCreditorStatusChange = (creditorId, nextStatus) => {
      const source = getCreditorCatalog();
      const selected = source.find((entry) => Number(entry.id) === Number(creditorId));
      if (!selected) return;
      if (selected.estatus === nextStatus) return;

      const updated = source.map((entry) => (
        Number(entry.id) === Number(creditorId)
          ? { ...entry, estatus: nextStatus }
          : { ...entry }
      ));

      setCreditorCatalog(updated, { persist: true });
      renderEditorLists();
      requestAnimationFrame(() => {
        const selector = `.quick-creditor-editor-item[data-creditor-id="${Number(creditorId)}"][data-creditor-status="${nextStatus}"]`;
        const movedItem = refs.modal.querySelector(selector);
        if (!movedItem) return;
        movedItem.classList.remove('is-drop-bounce');
        void movedItem.offsetWidth;
        movedItem.classList.add('is-drop-bounce');
        movedItem.addEventListener('animationend', () => {
          movedItem.classList.remove('is-drop-bounce');
        }, { once: true });
      });
    };

    doc.addEventListener('pointermove', (event) => {
      if (!state.drag.active) return;
      if (state.drag.pointerId !== null && event.pointerId !== state.drag.pointerId) return;
      state.drag.targetLeft = event.clientX - state.drag.grabOffsetX;
      state.drag.targetTop = event.clientY - state.drag.grabOffsetY;
      const hoverStatus = findDropStatusAtPoint(event.clientX, event.clientY);
      state.drag.hoverStatus = hoverStatus;
      setDropTarget(state.drag.hoverStatus || '');
    });

    doc.addEventListener('pointerup', (event) => {
      if (!state.drag.active) return;
      if (state.drag.pointerId !== null && event.pointerId !== state.drag.pointerId) return;
      finishPointerDrag(event.clientX, event.clientY);
    });

    doc.addEventListener('pointercancel', (event) => {
      if (!state.drag.active) return;
      if (state.drag.pointerId !== null && event.pointerId !== state.drag.pointerId) return;
      finishPointerDrag(event.clientX, event.clientY);
    });

    const resetForOpen = () => {
      resetDragState();
      state.filter = '';
      if (refs.filterInput) refs.filterInput.value = '';
      renderEditorLists();
    };

    modal.__quickCreditorEditorCloseModal = closeModal;
    modal.__quickCreditorEditorResetForOpen = resetForOpen;

    refs.closeBtn?.addEventListener('click', closeModal);
    refs.closeFooterBtn?.addEventListener('click', closeModal);
    refs.backdrop?.addEventListener('click', closeModal);
    refs.filterInput?.addEventListener('input', () => {
      state.filter = String(refs.filterInput.value || '');
      renderEditorLists();
    });
  }

  function ensureCreditorEditorModal() {
    if (creditorEditorModalContext?.modal) return creditorEditorModalContext;

    let modal = doc.getElementById('quickCreditorEditorModal');
    if (!modal) {
      const temp = doc.createElement('div');
      temp.innerHTML = createCreditorEditorModalTemplate().trim();
      modal = temp.firstElementChild;
      doc.body.appendChild(modal);
    } else if (modal.parentElement !== doc.body) {
      doc.body.appendChild(modal);
    }

    bindCreditorEditorModal(modal);
    creditorEditorModalContext = { modal };
    return creditorEditorModalContext;
  }

  function openCreditorEditorModal() {
    if (!hasCreditorEditorAccess()) return;
    const context = ensureCreditorEditorModal();
    const modal = context?.modal;
    if (!modal) return;
    if (typeof modal.__quickCreditorEditorResetForOpen === 'function') {
      modal.__quickCreditorEditorResetForOpen();
    }
    modal.classList.remove('hidden');
    globalScope.requestAnimationFrame(() => {
      modal.querySelector('#quickCreditorEditorFilter')?.focus();
    });
  }

  function clearDuplicateAlert(refs, stateStore) {
    stateStore.matches = [];
    stateStore.decision = null;
    stateStore.phone = null;

    refs.duplicateAlert?.classList.add('hidden');
    if (refs.duplicateSummary) refs.duplicateSummary.textContent = '';
    if (refs.duplicateList) refs.duplicateList.innerHTML = '';
  }

  function renderDuplicateAlert(refs, stateStore, matches, phone) {
    stateStore.matches = matches;
    stateStore.decision = null;
    stateStore.phone = phone;

    if (!refs.duplicateAlert || !refs.duplicateSummary || !refs.duplicateList) return;

    refs.duplicateSummary.textContent = `Se encontraron ${matches.length} lead(s) con telefono ${phone}.`;
    refs.duplicateList.innerHTML = matches
      .map((match) => {
        const name = escapeHtml(match.full_name || 'Sin nombre');
        const caseId = escapeHtml(String(match.case_id || match.id || '-'));
        const stateCode = escapeHtml(match.state_code || '-');
        const leadId = Number(match.id || 0);
        return `
          <button type="button" class="duplicate-item" data-lead-id="${leadId}">
            <span class="duplicate-item-name">${name}</span>
            <span class="duplicate-item-meta">Case #${caseId} | ${stateCode}</span>
          </button>
        `;
      })
      .join('');
    refs.duplicateAlert.classList.remove('hidden');

    refs.duplicateList.querySelectorAll('.duplicate-item').forEach((item) => {
      item.addEventListener('click', () => {
        const leadId = Number(item.dataset.leadId || 0);
        if (leadId > 0) globalScope.location.href = `/client.html?id=${leadId}`;
      });
    });
  }

  async function findPhoneDuplicates(phone) {
    if (!phone) return { total: 0, matches: [] };
    try {
      const result = await requestJson(`/api/leads/duplicates?phone=${encodeURIComponent(phone)}`);
      return {
        total: Number(result?.total || 0),
        matches: Array.isArray(result?.matches) ? result.matches : []
      };
    } catch (_error) {
      return { total: 0, matches: [] };
    }
  }

  function setupStandaloneStateSearch(refs) {
    const allStates = Object.entries(quickStateNames).sort((a, b) => a[1].localeCompare(b[1]));
    let selectedIndex = -1;

    const hideSuggestions = () => {
      refs.stateSuggestions?.classList.add('hidden');
      selectedIndex = -1;
    };

    const renderSuggestions = (query) => {
      if (!refs.stateSuggestions) return;
      const q = String(query || '').trim().toLowerCase();
      const filtered = q
        ? allStates.filter(
            ([code, name]) =>
              code.toLowerCase().includes(q) || String(name).toLowerCase().includes(q)
          )
        : allStates.slice(0, 12);

      if (!filtered.length) {
        refs.stateSuggestions.classList.add('hidden');
        refs.stateSuggestions.innerHTML = '';
        return;
      }

      refs.stateSuggestions.innerHTML = filtered
        .slice(0, 14)
        .map(
          ([code, name], index) => `
            <div class="state-suggestion-item${index === selectedIndex ? ' active' : ''}" data-code="${code}" data-name="${escapeHtml(name)}">
              <span class="state-suggestion-name">${escapeHtml(name)}</span>
              <span class="state-suggestion-code">${code}</span>
            </div>
          `
        )
        .join('');

      refs.stateSuggestions.classList.remove('hidden');

      refs.stateSuggestions.querySelectorAll('.state-suggestion-item').forEach((item) => {
        item.addEventListener('mousedown', (event) => {
          event.preventDefault();
          const code = String(item.dataset.code || '').trim();
          const name = String(item.dataset.name || '').trim();
          if (!code) return;
          refs.stateSearchInput.value = `${name} (${code})`;
          refs.stateHiddenInput.value = code;
          refs.stateDetected?.classList.add('hidden');
          hideSuggestions();
        });
      });
    };

    refs.stateSearchInput?.addEventListener('focus', () => {
      renderSuggestions(refs.stateSearchInput.value);
    });

    refs.stateSearchInput?.addEventListener('input', () => {
      refs.stateHiddenInput.value = '';
      refs.stateDetected?.classList.add('hidden');
      renderSuggestions(refs.stateSearchInput.value);
    });

    refs.stateSearchInput?.addEventListener('keydown', (event) => {
      const items = Array.from(refs.stateSuggestions?.querySelectorAll('.state-suggestion-item') || []);
      if (!items.length) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (selectedIndex >= 0 && items[selectedIndex]) {
          items[selectedIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        }
        return;
      } else if (event.key === 'Escape') {
        hideSuggestions();
        return;
      } else {
        return;
      }

      items.forEach((item, index) => item.classList.toggle('active', index === selectedIndex));
    });

    doc.addEventListener('click', (event) => {
      if (!refs.stateSearchInput || !refs.stateSuggestions) return;
      const insideInput = refs.stateSearchInput.contains(event.target);
      const insideList = refs.stateSuggestions.contains(event.target);
      if (!insideInput && !insideList) hideSuggestions();
    });
  }

  function bindStandaloneLeadModal(modal) {
    if (!modal || modal.dataset.quickBound === '1') return;
    modal.dataset.quickBound = '1';

    const refs = {
      modal,
      form: modal.querySelector('#newLeadForm'),
      closeBtn: modal.querySelector('#closeModalBtn'),
      cancelBtn: modal.querySelector('#cancelLeadBtn'),
      backdrop: modal.querySelector('.modal-backdrop'),
      nameInput: modal.querySelector('#leadName'),
      phoneInput: modal.querySelector('#leadPhone'),
      stateSearchInput: modal.querySelector('#leadStateSearch'),
      stateHiddenInput: modal.querySelector('#leadState'),
      stateSuggestions: modal.querySelector('#stateSuggestions'),
      stateDetected: modal.querySelector('#stateDetected'),
      isTestInput: modal.querySelector('#isTestLead'),
      duplicateAlert: modal.querySelector('#duplicateAlert'),
      duplicateSummary: modal.querySelector('#duplicateSummary'),
      duplicateList: modal.querySelector('#duplicateList'),
      openDuplicateBtn: modal.querySelector('#openDuplicateBtn'),
      linkAndCreateBtn: modal.querySelector('#linkAndCreateBtn'),
      forceCreateBtn: modal.querySelector('#forceCreateBtn')
    };

    const stateStore = { matches: [], decision: null, phone: null };

    setupStandaloneStateSearch(refs);

    const closeModal = () => {
      refs.modal.classList.add('hidden');
      refs.form?.reset();
      refs.stateSuggestions?.classList.add('hidden');
      refs.stateDetected?.classList.add('hidden');
      clearDuplicateAlert(refs, stateStore);
    };

    const resetForOpen = () => {
      refs.form?.reset();
      refs.stateSuggestions?.classList.add('hidden');
      refs.stateDetected?.classList.add('hidden');
      clearDuplicateAlert(refs, stateStore);
    };

    modal.__quickCloseModal = closeModal;
    modal.__quickResetForOpen = resetForOpen;

    refs.closeBtn?.addEventListener('click', closeModal);
    refs.cancelBtn?.addEventListener('click', closeModal);
    refs.backdrop?.addEventListener('click', closeModal);

    refs.phoneInput?.addEventListener('input', () => {
      const formatted = formatPhoneInput(refs.phoneInput.value);
      if (formatted !== refs.phoneInput.value) refs.phoneInput.value = formatted;
      clearDuplicateAlert(refs, stateStore);
    });

    refs.openDuplicateBtn?.addEventListener('click', () => {
      const firstMatch = stateStore.matches[0];
      const leadId = Number(firstMatch?.id || 0);
      if (leadId > 0) globalScope.location.href = `/client.html?id=${leadId}`;
    });

    refs.linkAndCreateBtn?.addEventListener('click', () => {
      if (!stateStore.matches.length) return;
      stateStore.decision = 'link';
      refs.form?.requestSubmit();
    });

    refs.forceCreateBtn?.addEventListener('click', () => {
      if (!stateStore.matches.length) return;
      stateStore.decision = 'force';
      refs.form?.requestSubmit();
    });

    refs.form?.addEventListener('submit', async (event) => {
      event.preventDefault();

      const fullName = String(refs.nameInput?.value || '').trim();
      const rawPhone = String(refs.phoneInput?.value || '').trim();
      const stateCode = String(refs.stateHiddenInput?.value || '').trim();
      const isTest = Boolean(refs.isTestInput?.checked);
      const normalizedPhone = crmHelpers.normalizePhoneForLead(rawPhone);

      if (!fullName || !rawPhone) {
        globalScope.alert('Por favor completa todos los campos obligatorios.');
        return;
      }

      if (!normalizedPhone) {
        globalScope.alert('Ingresa un telefono valido de 10 digitos (ej: 305-555-0123).');
        refs.phoneInput?.focus();
        return;
      }

      if (!stateCode) {
        globalScope.alert('Por favor selecciona un estado.');
        refs.stateSearchInput?.focus();
        return;
      }

      try {
        if (!stateStore.decision) {
          const duplicateData = await findPhoneDuplicates(normalizedPhone);
          const matches = Array.isArray(duplicateData.matches) ? duplicateData.matches : [];
          if (matches.length > 0) {
            renderDuplicateAlert(refs, stateStore, matches, normalizedPhone);
            return;
          }
        }

        const payload = {
          fullName,
          phone: normalizedPhone,
          stateCode,
          isTest,
          assignedTo: getSessionUserName()
        };

        if (stateStore.decision === 'link' && stateStore.matches.length > 0) {
          const baseLead = stateStore.matches[0];
          payload.relatedLeadId = baseLead.id;
          payload.notes = `Telefono compartido detectado con lead #${baseLead.case_id || baseLead.id}.`;
        }

        const data = await requestJson('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        closeModal();
        const leadId = data?.lead?.id;
        if (leadId) globalScope.location.href = `/client.html?id=${leadId}&tab=lead`;
      } catch (error) {
        globalScope.alert(error.message || 'No se pudo crear el lead. Intenta de nuevo.');
      }
    });
  }

  function ensureLeadModal() {
    if (leadModalContext?.modal) return leadModalContext;

    let modal = doc.getElementById('newLeadModal');

    if (modal) {
      if (modal.parentElement !== doc.body) {
        doc.body.appendChild(modal);
      }
      leadModalContext = { modal, ownedByQuickActions: false };
      return leadModalContext;
    }

    const temp = doc.createElement('div');
    temp.innerHTML = createLeadModalTemplate().trim();
    modal = temp.firstElementChild;
    doc.body.appendChild(modal);
    bindStandaloneLeadModal(modal);

    leadModalContext = { modal, ownedByQuickActions: true };
    return leadModalContext;
  }

  function openLeadModal() {
    const context = ensureLeadModal();
    if (!context?.modal) return;

    if (context.ownedByQuickActions && typeof context.modal.__quickResetForOpen === 'function') {
      context.modal.__quickResetForOpen();
    }

    context.modal.classList.remove('hidden');
    globalScope.requestAnimationFrame(() => {
      context.modal.querySelector('#leadName')?.focus();
    });
  }

  const radialMenu = createRadialMenu();
  const quickRadialHint = radialMenu.querySelector('#quickRadialHint');

  function setRadialHint(message = '') {
    if (!quickRadialHint) return;

    if (hintTimer) {
      globalScope.clearTimeout(hintTimer);
      hintTimer = null;
    }

    quickRadialHint.textContent = message;
    quickRadialHint.classList.toggle('visible', Boolean(message));

    if (!message) return;

    hintTimer = globalScope.setTimeout(() => {
      quickRadialHint.classList.remove('visible');
      quickRadialHint.textContent = '';
      hintTimer = null;
    }, 1400);
  }

  function setMenuPosition(x, y) {
    const safeX = Math.max(18, Math.min(globalScope.innerWidth - 18, x));
    const safeY = Math.max(18, Math.min(globalScope.innerHeight - 18, y));
    radialMenu.style.transform = `translate3d(${safeX}px, ${safeY}px, 0)`;
  }

  function syncRadialVisibility() {
    radialMenu.classList.toggle('hidden-state', !isHomeActive());
    syncLeadAuditNodeState();
  }

  function isLeadAuditAvailable() {
    const pathname = String(globalScope.location?.pathname || '').toLowerCase();
    const inLeadPage = pathname.endsWith('/client.html') || pathname.endsWith('client.html');
    const leadIdFromWindow = Number(globalScope.currentLeadId || 0);
    const leadIdFromQuery = Number(new URLSearchParams(globalScope.location?.search || '').get('id') || 0);
    const activeLeadId = Number.isInteger(leadIdFromWindow) && leadIdFromWindow > 0 ? leadIdFromWindow : leadIdFromQuery;
    return inLeadPage && Number.isInteger(activeLeadId) && activeLeadId > 0
      && hasLeadAuditAccess()
      && typeof globalScope.openLeadAuditHistoryModal === 'function';
  }

  function syncLeadAuditNodeState() {
    const auditNode = radialMenu.querySelector('.quick-radial-node-audit');
    if (!auditNode) return;
    const enabled = isLeadAuditAvailable();
    auditNode.classList.toggle('is-disabled', !enabled);
    auditNode.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  }

  function openRadialMenu(x, y) {
    if (!isHomeActive()) return;
    menuOpen = true;
    setMenuPosition(x, y);
    setRadialHint('');
    radialMenu.classList.add('open');
    syncRadialVisibility();
  }

  function closeRadialMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    setRadialHint('');
    radialMenu.classList.remove('open');
    setMenuPosition(pointer.x, pointer.y);
  }

  radialMenu.addEventListener('click', (event) => {
    const actionTarget = event.target.closest('.quick-radial-node');
    if (!actionTarget) return;

    const action = actionTarget.dataset.action;
    if (!action) return;

    if (actionTarget.classList.contains('is-disabled')) {
      if (action === 'lead-audit') {
        setRadialHint('Solo admin/sup');
      } else {
        setRadialHint('Proximamente');
      }
      return;
    }

    closeRadialMenu();

    if (action === 'lead') {
      openLeadModal();
      return;
    }

    if (action === 'creditor') {
      openCreditorModal();
      return;
    }

    if (action === 'lead-audit') {
      if (!isLeadAuditAvailable()) {
        setRadialHint('Solo admin/sup');
        return;
      }
      globalScope.openLeadAuditHistoryModal();
    }
  });

  let _qaMouseTicking = false;
  doc.addEventListener('mousemove', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (!_qaMouseTicking) {
      globalScope.requestAnimationFrame(() => {
        syncRadialVisibility();
        if (!menuOpen && isHomeActive()) {
          setMenuPosition(pointer.x, pointer.y);
        }
        _qaMouseTicking = false;
      });
      _qaMouseTicking = true;
    }
  });

  doc.addEventListener('click', (event) => {
    if (menuOpen && !radialMenu.contains(event.target)) {
      closeRadialMenu();
    }
  });

  doc.addEventListener('contextmenu', (event) => {
    if (!isHomeActive()) return;
    if (isBlockedTarget(event.target)) return;
    event.preventDefault();
    openRadialMenu(event.clientX, event.clientY);
  });

  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeRadialMenu();
      if (leadModalContext?.ownedByQuickActions && typeof leadModalContext.modal.__quickCloseModal === 'function') {
        leadModalContext.modal.__quickCloseModal();
      }
      if (creditorModalContext?.modal && typeof creditorModalContext.modal.__quickCreditorCloseModal === 'function') {
        creditorModalContext.modal.__quickCreditorCloseModal();
      }
      if (creditorEditorModalContext?.modal && typeof creditorEditorModalContext.modal.__quickCreditorEditorCloseModal === 'function') {
        creditorEditorModalContext.modal.__quickCreditorEditorCloseModal();
      }
    }
  });

  let _qaResizeTicking = false;
  globalScope.addEventListener('resize', () => {
    if (!_qaResizeTicking) {
      globalScope.requestAnimationFrame(() => {
        closeRadialMenu();
        syncRadialVisibility();
        _qaResizeTicking = false;
      });
      _qaResizeTicking = true;
    }
  });
  globalScope.addEventListener('scroll', closeRadialMenu, { capture: true, passive: true });

  syncRadialVisibility();
  setMenuPosition(pointer.x, pointer.y);
})(window);
