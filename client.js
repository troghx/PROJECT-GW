    // ============================================
    // TEMA
    // ============================================
    const crmHelpers = window.CrmHelpers || {};
    const EMPTY_FIELD_LABEL = 'No especificado';
    const EDITABLE_FIELD_PAYLOAD_MAP = {
      home_phone: 'homePhone',
      cell_phone: 'cellPhone',
      email: 'email',
      ssn: 'ssn',
      address_street: 'addressStreet',
      city: 'city',
      zip_code: 'zipCode',
      state: 'state',
      best_time: 'bestTime',
      currently_employed: 'currentlyEmployed',
      employer_name: 'employerName',
      occupation: 'occupation',
      self_employed: 'selfEmployed'
    };
    const THEME_KEY = 'project_gw_theme';
    const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(`theme-${savedTheme}`);
    
    const themeSwitch = document.getElementById('themeSwitch');
    if (themeSwitch) {
      themeSwitch.checked = savedTheme === 'light';
      themeSwitch.addEventListener('change', () => {
        const newTheme = themeSwitch.checked ? 'light' : 'dark';
        document.body.classList.remove('theme-dark', 'theme-light');
        document.body.classList.add(`theme-${newTheme}`);
        localStorage.setItem(THEME_KEY, newTheme);
      });
    }

    const escapeHtml = crmHelpers.escapeHtml || ((text) => {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    });

    function toIsoDateOnly(value) {
      if (!value) return null;
      const raw = String(value).trim();
      if (!raw) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) return null;
      return parsed.toISOString().slice(0, 10);
    }

    function formatDateEs(dateValue) {
      if (crmHelpers.formatDateEs) return crmHelpers.formatDateEs(dateValue);
      if (!dateValue) return '-';
      const parsed = new Date(dateValue);
      if (Number.isNaN(parsed.getTime())) return '-';
      return parsed.toLocaleDateString('es-ES');
    }

    function formatDateTimeEs(dateValue) {
      if (crmHelpers.formatDateTimeEs) return crmHelpers.formatDateTimeEs(dateValue);
      if (!dateValue) return '-';
      const parsed = new Date(dateValue);
      if (Number.isNaN(parsed.getTime())) return '-';
      return parsed.toLocaleString('es-ES');
    }

    function getStateName(code) {
      if (crmHelpers.getStateName) return crmHelpers.getStateName(code);
      return code || '';
    }
    
    // ============================================
    // MENU DE CUENTA
    // ============================================
    const accountBtn = document.getElementById('accountBtn');
    const accountMenu = document.getElementById('accountMenu');
    
    if (accountBtn && accountMenu) {
      accountBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = accountMenu.classList.toggle('hidden');
        accountBtn.setAttribute('aria-expanded', !isOpen);
      });
      
      document.addEventListener('click', () => {
        accountMenu.classList.add('hidden');
        accountBtn.setAttribute('aria-expanded', 'false');
      });
    }
    
    // Cerrar sesión
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('project_gw_session');
        window.location.href = 'index.html';
      });
    }
    
    // ============================================
    // TOOLBAR TOGGLE
    // ============================================
    const toolbarToggle = document.getElementById('toolbarToggle');
    const toolbarWrap = document.getElementById('toolbarWrap');
    
    if (toolbarToggle && toolbarWrap) {
      toolbarToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = toolbarWrap.classList.toggle('expanded');
        toolbarToggle.setAttribute('aria-expanded', isOpen);
      });
    }

    // ============================================
    // BUSQUEDA GLOBAL DE LEADS (TOOLBAR)
    // ============================================
    const homeSearchInput = document.getElementById('homeSearch');
    const LEAD_SEARCH_TRANSFER_KEY = 'project_gw_leads_search_query';
    const LEAD_SEARCH_PREFETCH_DEBOUNCE_MS = 80;
    const LEAD_SEARCH_SUGGESTION_LIMIT = 8;
    const LEAD_SEARCH_SUGGESTION_Z_INDEX = 2147483000;
    let globalLeadSearchCache = [];
    let globalLeadSearchIndex = [];
    let globalLeadSearchRequest = null;
    let globalLeadSearchDebounceTimer = null;
    let globalLeadSuggestionBox = null;
    let globalLeadSuggestionShell = null;
    let globalLeadSuggestionMatches = [];
    let globalLeadSuggestionActiveIndex = -1;

    const normalizeSearchText = crmHelpers.normalizeSearchText || ((value) => String(value || '').toLowerCase().trim());
    const onlyDigits = crmHelpers.onlyDigits || ((value) => String(value || '').replace(/\D/g, ''));
    const normalizePhoneDigits = crmHelpers.normalizePhoneDigits || ((value) => {
      const digits = onlyDigits(value);
      return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    });

    function storeLeadSearchTransferQuery(query) {
      try {
        localStorage.setItem(LEAD_SEARCH_TRANSFER_KEY, String(query || '').trim());
      } catch (_error) {
        // Ignorar errores de storage para no bloquear la navegacion.
      }
    }

    function goToLeadsWithQuery(query) {
      storeLeadSearchTransferQuery(query);
      window.location.href = 'index.html#leads';
    }

    function getGlobalLeadSuggestionPalette() {
      const isLight = document.body.classList.contains('theme-light');
      if (isLight) {
        return {
          background: 'rgba(255, 255, 255, 0.97)',
          border: '1px solid rgba(15, 23, 42, 0.12)',
          shadow: '0 14px 34px rgba(15, 23, 42, 0.16)',
          itemBorder: '1px solid rgba(15, 23, 42, 0.08)',
          itemHover: 'rgba(59, 130, 246, 0.12)',
          textPrimary: 'rgba(15, 23, 42, 0.95)',
          textSecondary: 'rgba(15, 23, 42, 0.62)'
        };
      }

      return {
        background: 'rgba(10, 16, 27, 0.96)',
        border: '1px solid rgba(255, 255, 255, 0.14)',
        shadow: '0 14px 34px rgba(0, 0, 0, 0.35)',
        itemBorder: '1px solid rgba(255, 255, 255, 0.1)',
        itemHover: 'rgba(126, 234, 252, 0.18)',
        textPrimary: 'rgba(255, 255, 255, 0.94)',
        textSecondary: 'rgba(255, 255, 255, 0.68)'
      };
    }

    function ensureGlobalLeadSuggestionBox() {
      if (globalLeadSuggestionBox || !homeSearchInput) return globalLeadSuggestionBox;
      const shell = homeSearchInput.closest('.home-search-shell');
      if (!shell) return null;
      globalLeadSuggestionShell = shell;

      const box = document.createElement('div');
      box.setAttribute('role', 'listbox');
      box.setAttribute('aria-label', 'Sugerencias de leads');
      box.style.position = 'fixed';
      box.style.top = '0';
      box.style.left = '0';
      box.style.width = '320px';
      box.style.maxHeight = '320px';
      box.style.overflowY = 'auto';
      box.style.borderRadius = '12px';
      box.style.padding = '8px';
      box.style.pointerEvents = 'auto';
      box.style.zIndex = String(LEAD_SEARCH_SUGGESTION_Z_INDEX);
      box.style.display = 'none';

      document.body.appendChild(box);
      globalLeadSuggestionBox = box;

      const reposition = () => {
        if (!globalLeadSuggestionBox || globalLeadSuggestionBox.style.display === 'none') return;
        positionGlobalLeadSuggestionBox();
      };
      window.addEventListener('resize', reposition);
      window.addEventListener('scroll', reposition, true);

      return globalLeadSuggestionBox;
    }

    function positionGlobalLeadSuggestionBox() {
      if (!globalLeadSuggestionBox || !globalLeadSuggestionShell) return;
      const rect = globalLeadSuggestionShell.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const viewportPadding = 8;
      const top = rect.bottom + 8;
      const left = Math.max(viewportPadding, rect.left);
      const availableWidth = Math.max(220, window.innerWidth - left - viewportPadding);
      const width = Math.min(rect.width, availableWidth);
      const availableHeight = Math.max(140, window.innerHeight - top - viewportPadding);

      globalLeadSuggestionBox.style.left = `${left}px`;
      globalLeadSuggestionBox.style.top = `${top}px`;
      globalLeadSuggestionBox.style.width = `${Math.max(220, width)}px`;
      globalLeadSuggestionBox.style.maxHeight = `${Math.min(360, availableHeight)}px`;
    }

    function hideGlobalLeadSuggestions() {
      if (!globalLeadSuggestionBox) return;
      globalLeadSuggestionBox.style.display = 'none';
      globalLeadSuggestionBox.innerHTML = '';
      globalLeadSuggestionMatches = [];
      globalLeadSuggestionActiveIndex = -1;
    }

    function setGlobalLeadSuggestionActive(nextIndex) {
      if (!globalLeadSuggestionBox) return;
      const buttons = Array.from(globalLeadSuggestionBox.querySelectorAll('[data-suggest-index]'));
      if (!buttons.length) return;

      let target = Number(nextIndex);
      if (!Number.isFinite(target)) target = -1;
      if (target < 0) target = buttons.length - 1;
      if (target >= buttons.length) target = 0;

      globalLeadSuggestionActiveIndex = target;
      const palette = getGlobalLeadSuggestionPalette();
      buttons.forEach((button, index) => {
        button.style.background = index === target ? palette.itemHover : 'transparent';
      });
    }

    function openGlobalLeadById(leadId) {
      const numericLeadId = Number(leadId);
      if (!Number.isFinite(numericLeadId) || numericLeadId <= 0) return;
      window.location.href = `/client.html?id=${numericLeadId}&tab=lead`;
    }

    function navigateToGlobalLeadFromSuggestion(leadId, event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      const numericLeadId = Number(leadId);
      if (!Number.isFinite(numericLeadId) || numericLeadId <= 0) return;
      hideGlobalLeadSuggestions();
      window.location.assign(`/client.html?id=${numericLeadId}&tab=lead`);
    }

    function renderGlobalLeadSuggestions(matches, query) {
      const box = ensureGlobalLeadSuggestionBox();
      if (!box) return;

      const normalizedQuery = String(query || '').trim();
      if (!normalizedQuery) {
        hideGlobalLeadSuggestions();
        return;
      }

      const list = Array.isArray(matches) ? matches.slice(0, LEAD_SEARCH_SUGGESTION_LIMIT) : [];
      if (!list.length) {
        hideGlobalLeadSuggestions();
        return;
      }

      const palette = getGlobalLeadSuggestionPalette();
      box.style.background = palette.background;
      box.style.border = palette.border;
      box.style.boxShadow = palette.shadow;

      globalLeadSuggestionMatches = list;
      globalLeadSuggestionActiveIndex = -1;

      box.innerHTML = list.map((lead, index) => {
        const linePrimary = escapeHtml(lead.full_name || 'Sin nombre');
        const lineSecondary = `#${escapeHtml(String(lead.case_id || '-'))} · ${escapeHtml(lead.phone || '-')} · ${escapeHtml(lead.state_code || '-')}`;
        return `
          <button
            type="button"
            data-suggest-index="${index}"
            data-lead-id="${lead.id}"
            style="width:100%;display:flex;flex-direction:column;align-items:flex-start;gap:3px;border:${palette.itemBorder};border-radius:9px;padding:9px 10px;margin:0 0 6px;background:transparent;cursor:pointer;text-align:left;"
          >
            <span style="font-size:0.86rem;font-weight:600;color:${palette.textPrimary};">${linePrimary}</span>
            <span style="font-size:0.75rem;color:${palette.textSecondary};">${lineSecondary}</span>
          </button>
        `;
      }).join('');

      box.querySelectorAll('[data-suggest-index]').forEach((button) => {
        button.addEventListener('mouseenter', () => {
          setGlobalLeadSuggestionActive(Number(button.dataset.suggestIndex));
        });
        button.addEventListener('pointerdown', (event) => {
          navigateToGlobalLeadFromSuggestion(button.dataset.leadId, event);
        });
        button.addEventListener('mousedown', (event) => {
          navigateToGlobalLeadFromSuggestion(button.dataset.leadId, event);
        });
        button.addEventListener('click', (event) => {
          navigateToGlobalLeadFromSuggestion(button.dataset.leadId, event);
        });
      });

      positionGlobalLeadSuggestionBox();
      box.style.display = 'block';
    }

    function openActiveGlobalLeadSuggestion() {
      if (globalLeadSuggestionActiveIndex < 0 || globalLeadSuggestionActiveIndex >= globalLeadSuggestionMatches.length) {
        return false;
      }
      const targetLead = globalLeadSuggestionMatches[globalLeadSuggestionActiveIndex];
      if (!targetLead?.id) return false;
      hideGlobalLeadSuggestions();
      openGlobalLeadById(targetLead.id);
      return true;
    }

    function isExactSearchMatch(lead, query) {
      const digits = onlyDigits(query);
      if (!digits) return false;

      if (String(lead?.id || '') === digits || String(lead?.case_id || '') === digits) {
        return true;
      }

      const normalizedQueryPhone = normalizePhoneDigits(query);
      const phoneCandidates = [
        lead?.phone,
        lead?.home_phone,
        lead?.cell_phone,
        lead?.co_applicant_home_phone,
        lead?.co_applicant_cell_phone
      ]
        .map((value) => normalizePhoneDigits(value))
        .filter(Boolean);

      if (normalizedQueryPhone && phoneCandidates.includes(normalizedQueryPhone)) {
        return true;
      }

      const docCandidates = [onlyDigits(lead?.ssn), onlyDigits(lead?.co_applicant_ssn)].filter(Boolean);
      return docCandidates.includes(digits);
    }

    async function ensureGlobalLeadSearchData(forceReload = false) {
      if (!forceReload && globalLeadSearchIndex.length > 0) {
        return globalLeadSearchCache;
      }

      if (globalLeadSearchRequest) {
        return globalLeadSearchRequest;
      }

      globalLeadSearchRequest = (async () => {
        const response = await fetch('/api/leads');
        if (!response.ok) throw new Error('No se pudieron cargar leads para busqueda.');
        const data = await response.json().catch(() => ({}));
        globalLeadSearchCache = Array.isArray(data.leads) ? data.leads : [];
        if (typeof crmHelpers.buildLeadSearchIndex === 'function') {
          globalLeadSearchIndex = crmHelpers.buildLeadSearchIndex(globalLeadSearchCache);
        } else {
          globalLeadSearchIndex = globalLeadSearchCache.map((lead, position) => ({
            lead,
            position,
            textBlob: normalizeSearchText(lead?.full_name),
            numericBlob: onlyDigits(lead?.case_id)
          }));
        }
        return globalLeadSearchCache;
      })().finally(() => {
        globalLeadSearchRequest = null;
      });

      return globalLeadSearchRequest;
    }

    function findGlobalLeadMatches(query) {
      const rawQuery = String(query || '').trim();
      if (!rawQuery) return [];

      if (typeof crmHelpers.searchLeads === 'function') {
        return crmHelpers.searchLeads(globalLeadSearchIndex, rawQuery, { limit: 50 });
      }

      const normalizedQuery = normalizeSearchText(rawQuery);
      return globalLeadSearchCache.filter((lead) =>
        normalizeSearchText(lead?.full_name).includes(normalizedQuery)
      );
    }

    async function runGlobalLeadSearchSubmit() {
      const query = String(homeSearchInput?.value || '').trim();
      if (!query) {
        hideGlobalLeadSuggestions();
        window.location.href = 'index.html#leads';
        return;
      }

      if (openActiveGlobalLeadSuggestion()) {
        return;
      }

      try {
        await ensureGlobalLeadSearchData();
        const matches = findGlobalLeadMatches(query);
        renderGlobalLeadSuggestions(matches, query);

        if (!matches.length) {
          goToLeadsWithQuery(query);
          return;
        }

        const exactMatches = matches.filter((lead) => isExactSearchMatch(lead, query));
        if (exactMatches.length === 1) {
          hideGlobalLeadSuggestions();
          openGlobalLeadById(exactMatches[0].id);
          return;
        }

        if (matches.length === 1) {
          hideGlobalLeadSuggestions();
          openGlobalLeadById(matches[0].id);
          return;
        }

        goToLeadsWithQuery(query);
      } catch (error) {
        console.error('Error en busqueda global:', error);
        goToLeadsWithQuery(query);
      }
    }

    if (homeSearchInput) {
      homeSearchInput.addEventListener('focus', async () => {
        await ensureGlobalLeadSearchData();
        const query = String(homeSearchInput.value || '').trim();
        if (query) {
          renderGlobalLeadSuggestions(findGlobalLeadMatches(query), query);
        }
      });

      homeSearchInput.addEventListener('input', (event) => {
        if (globalLeadSearchDebounceTimer) {
          clearTimeout(globalLeadSearchDebounceTimer);
        }
        const query = String(event.target.value || '').trim();
        if (!query) {
          hideGlobalLeadSuggestions();
          return;
        }
        globalLeadSearchDebounceTimer = setTimeout(async () => {
          await ensureGlobalLeadSearchData();
          renderGlobalLeadSuggestions(findGlobalLeadMatches(query), query);
        }, LEAD_SEARCH_PREFETCH_DEBOUNCE_MS);
      });

      homeSearchInput.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          if (globalLeadSuggestionMatches.length > 0) {
            setGlobalLeadSuggestionActive(globalLeadSuggestionActiveIndex + 1);
          }
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          if (globalLeadSuggestionMatches.length > 0) {
            setGlobalLeadSuggestionActive(globalLeadSuggestionActiveIndex - 1);
          }
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          void runGlobalLeadSearchSubmit();
          return;
        }

        if (event.key === 'Escape') {
          homeSearchInput.value = '';
          hideGlobalLeadSuggestions();
        }
      });

      document.addEventListener('click', (event) => {
        const shell = homeSearchInput.closest('.home-search-shell');
        if (!shell) return;
        const clickedInsideSuggestions = Boolean(globalLeadSuggestionBox && globalLeadSuggestionBox.contains(event.target));
        if (!shell.contains(event.target) && !clickedInsideSuggestions) {
          hideGlobalLeadSuggestions();
        }
      });
    }
    
    // ============================================
    // NOMBRE EDITABLE Y COPIAR
    // ============================================
    const leadNameEl = document.getElementById('leadName');
    const copyNameBtn = document.getElementById('copyNameBtn');
    const caseNumberEl = document.getElementById('caseNumber');
    const copyCaseBtn = document.getElementById('copyCaseBtn');
    let originalName = '';
    let caseIdValue = '';
    let currentLeadId = null;
    let currentLeadData = null;
    let relatedBadgeRequestVersion = 0;
    const zipLocationCache = new Map();
    const notesBtn = document.getElementById('notesBtn');
    const notesPanel = document.getElementById('notesPanel');
    const notesCloseBtn = document.getElementById('notesCloseBtn');
    const notesComposerWrap = document.getElementById('notesComposerWrap');
    const notesComposer = document.getElementById('notesComposerTextarea');
    const notesAddBtn = document.getElementById('notesAddBtn');
    const notesStatus = document.getElementById('notesStatus');
    const notesList = document.getElementById('notesList');
    const notesTemplateSelect = document.getElementById('notesTemplateSelect');
    const notesTemplateUseBtn = document.getElementById('notesTemplateUseBtn');
    const notesTemplateManageBtn = document.getElementById('notesTemplateManageBtn');
    const notesTemplatesModal = document.getElementById('notesTemplatesModal');
    const notesTemplatesModalBackdrop = document.getElementById('notesTemplatesModalBackdrop');
    const notesTemplatesModalClose = document.getElementById('notesTemplatesModalClose');
    const notesTemplatesManagerSelect = document.getElementById('notesTemplatesManagerSelect');
    const notesTemplatesManagerName = document.getElementById('notesTemplatesManagerName');
    const notesTemplatesManagerContent = document.getElementById('notesTemplatesManagerContent');
    const notesTemplatesManagerNewBtn = document.getElementById('notesTemplatesManagerNewBtn');
    const notesTemplatesManagerSaveBtn = document.getElementById('notesTemplatesManagerSaveBtn');
    const notesTemplatesManagerSaveAsNewBtn = document.getElementById('notesTemplatesManagerSaveAsNewBtn');
    const notesTemplatesManagerDeleteBtn = document.getElementById('notesTemplatesManagerDeleteBtn');
    const NOTES_MAX_LENGTH = 5000;
    const NOTE_COLOR_TAGS = ['yellow', 'red', 'green', 'blue', 'gray'];
    const NOTE_COLOR_OPTIONS = [
      { value: 'yellow', label: 'Amarillo' },
      { value: 'red', label: 'Rojo' },
      { value: 'green', label: 'Verde' },
      { value: 'blue', label: 'Azul' },
      { value: 'gray', label: 'Gris' }
    ];
    let notesAdding = false;
    let notesPanelOpen = false;
    let notesTemplatesModalOpen = false;
    let notesComposerVisible = false;
    let activeLeadNoteMenuId = null;
    let noteTemplates = [];
    let selectedNoteTemplateId = null;
    let noteTemplatesLoaded = false;
    let noteTemplatesLoadingPromise = null;
    let noteTemplatesOwner = '';
    let leadNotes = [];
    let notesLoadedForLeadId = null;
    let leadNotesLoadingPromise = null;

    const PARTY_SWITCHABLE_FIELDS = new Set([
      'home_phone',
      'cell_phone',
      'email',
      'ssn',
      'dob',
      'currently_employed',
      'employer_name',
      'occupation',
      'self_employed'
    ]);
    const CO_APPLICANT_COLUMN_MAP = {
      home_phone: 'co_applicant_home_phone',
      cell_phone: 'co_applicant_cell_phone',
      email: 'co_applicant_email',
      ssn: 'co_applicant_ssn',
      dob: 'co_applicant_dob',
      currently_employed: 'co_applicant_currently_employed',
      employer_name: 'co_applicant_employer_name',
      occupation: 'co_applicant_occupation',
      self_employed: 'co_applicant_self_employed'
    };
    const CO_APPLICANT_FIELD_PAYLOAD_MAP = {
      home_phone: 'coApplicantHomePhone',
      cell_phone: 'coApplicantCellPhone',
      email: 'coApplicantEmail',
      ssn: 'coApplicantSsn',
      dob: 'coApplicantDob',
      currently_employed: 'coApplicantCurrentlyEmployed',
      employer_name: 'coApplicantEmployerName',
      occupation: 'coApplicantOccupation',
      self_employed: 'coApplicantSelfEmployed'
    };

    function createPartyData() {
      return {
        fullName: '',
        homePhone: '',
        cellPhone: '',
        email: '',
        dob: null,
        ssn: '',
        currentlyEmployed: '',
        employerName: '',
        occupation: '',
        selfEmployed: false
      };
    }
    
    // Manejo de Applicant / Co-Applicant
    let isApplicant = true;
    let applicantData = createPartyData();
    let coApplicantData = createPartyData();

    function resolveLeadColumnForParty(fieldName, forApplicant = isApplicant) {
      if (forApplicant || !PARTY_SWITCHABLE_FIELDS.has(fieldName)) return fieldName;
      return CO_APPLICANT_COLUMN_MAP[fieldName] || fieldName;
    }

    function resolvePayloadKeyForParty(fieldName, forApplicant = isApplicant) {
      if (forApplicant || !PARTY_SWITCHABLE_FIELDS.has(fieldName)) {
        return EDITABLE_FIELD_PAYLOAD_MAP[fieldName] || fieldName;
      }
      return CO_APPLICANT_FIELD_PAYLOAD_MAP[fieldName] || fieldName;
    }

    function getCurrentPartyData() {
      return isApplicant ? applicantData : coApplicantData;
    }

    function getCurrentPartyName() {
      const partyData = getCurrentPartyData();
      if (partyData.fullName) return partyData.fullName;
      return isApplicant ? (originalName || EMPTY_FIELD_LABEL) : 'Nuevo Co-Applicant';
    }

    function syncPartyDataFromLead(lead) {
      if (!lead) return;

      applicantData = {
        fullName: lead.full_name || '',
        homePhone: lead.home_phone || lead.phone || '',
        cellPhone: lead.cell_phone || lead.phone || '',
        email: lead.email || '',
        dob: toIsoDateOnly(lead.dob),
        ssn: lead.ssn || '',
        currentlyEmployed: lead.currently_employed || '',
        employerName: lead.employer_name || '',
        occupation: lead.occupation || '',
        selfEmployed: Boolean(lead.self_employed)
      };

      coApplicantData = {
        fullName: lead.co_applicant_name || '',
        homePhone: lead.co_applicant_home_phone || '',
        cellPhone: lead.co_applicant_cell_phone || '',
        email: lead.co_applicant_email || '',
        dob: toIsoDateOnly(lead.co_applicant_dob),
        ssn: lead.co_applicant_ssn || '',
        currentlyEmployed: lead.co_applicant_currently_employed || '',
        employerName: lead.co_applicant_employer_name || '',
        occupation: lead.co_applicant_occupation || '',
        selfEmployed: Boolean(lead.co_applicant_self_employed)
      };

      originalName = applicantData.fullName || originalName;
    }

    function syncLeadDataState(lead) {
      if (!lead) return;
      currentLeadData = lead;
      syncPartyDataFromLead(lead);
    }

    function setPartyFieldDisplay(fieldElement, value) {
      if (!fieldElement) return;
      const copyIcon = fieldElement.querySelector('.copy-icon');
      if (copyIcon) copyIcon.remove();
      fieldElement.textContent = value || EMPTY_FIELD_LABEL;
      if (copyIcon) {
        fieldElement.appendChild(copyIcon);
        copyIcon.style.display = '';
      }
    }

    function refreshPartyContactView() {
      if (leadNameEl && leadNameEl.contentEditable !== 'true') {
        leadNameEl.textContent = getCurrentPartyName();
      }

      ['home_phone', 'cell_phone', 'email', 'ssn', 'currently_employed', 'employer_name', 'occupation'].forEach((fieldName) => {
        const fieldElement = document.querySelector(`.info-row-value.editable[data-field="${fieldName}"]`);
        if (!fieldElement || fieldElement.querySelector('input')) return;
        const displayValue = getLeadFieldValueForDisplay(currentLeadData || {}, fieldName);
        setPartyFieldDisplay(fieldElement, displayValue);
      });

      selectedDOB = isApplicant ? applicantData.dob : coApplicantData.dob;
      const dobValueEl = document.getElementById('dobValue');
      if (dobValueEl) {
        dobValueEl.textContent = selectedDOB ? formatDateEs(selectedDOB) : EMPTY_FIELD_LABEL;
      }

      const dobCalendarEl = document.getElementById('dobCalendar');
      if (dobCalendarEl && !dobCalendarEl.classList.contains('hidden')) {
        renderDOBCalendar();
      }

      const selfToggle = document.getElementById('selfEmployedToggle');
      const selfLabel = selfToggle?.closest('.self-employed-toggle')?.querySelector('.self-employed-label');
      if (selfToggle) {
        const selfFieldColumn = resolveLeadColumnForParty('self_employed');
        const selfValue = Boolean((currentLeadData || {})[selfFieldColumn]);
        selfToggle.checked = selfValue;
        if (selfLabel) selfLabel.textContent = selfValue ? 'Si' : 'No';
      }
    }

    function refreshStaticContactFields(lead, fieldNames = ['address_street', 'city', 'zip_code', 'state', 'best_time']) {
      if (!lead) return;

      fieldNames.forEach((fieldName) => {
        const fieldElement = document.querySelector(`.info-row-value.editable[data-field="${fieldName}"]`);
        if (!fieldElement || fieldElement.querySelector('input')) return;
        const displayValue = getLeadFieldValueForDisplay(lead, fieldName);
        setPartyFieldDisplay(fieldElement, displayValue);
      });
    }
    
    const applicantToggleBtn = document.getElementById('applicantToggleBtn');
    const applicantTypeLabel = document.getElementById('applicantTypeLabel');
    
    if (applicantToggleBtn && applicantTypeLabel) {
      // Elementos del toggle "Incluir en contrato"
      const includeToggleWrapper = document.getElementById('includeCoAppToggleWrapper');
      const includeToggle = document.getElementById('includeCoAppToggle');
      const includeToggleStatus = document.getElementById('includeToggleStatus');
      
      // Función para actualizar el estado visual del toggle
      function updateToggleVisualState() {
        if (includeToggleWrapper && includeToggle && includeToggleStatus) {
          const isChecked = includeToggle.checked;
          includeToggleWrapper.classList.toggle('active', isChecked);
          includeToggleStatus.textContent = isChecked ? 'ON' : 'OFF';
        }
      }
      
      applicantToggleBtn.addEventListener('click', () => {
        // Cambiar estado
        isApplicant = !isApplicant;
        
        // Rotar botón
        applicantToggleBtn.classList.toggle('rotated', !isApplicant);
        
        // Actualizar etiqueta y estilos
        if (isApplicant) {
          applicantTypeLabel.textContent = 'Applicant';
          applicantTypeLabel.classList.remove('co-applicant');
          applicantToggleBtn.title = 'Cambiar a Co-Applicant';
          
          // Ocultar toggle de "Incluir en contrato"
          if (includeToggleWrapper) {
            includeToggleWrapper.classList.add('hidden');
          }
          
        } else {
          applicantTypeLabel.textContent = 'Co-Applicant';
          applicantTypeLabel.classList.add('co-applicant');
          applicantToggleBtn.title = 'Cambiar a Applicant';
          
          // Mostrar toggle de "Incluir en contrato"
          if (includeToggleWrapper) {
            includeToggleWrapper.classList.remove('hidden');
            updateToggleVisualState();
          }
          
        }

        refreshPartyContactView();
        
        showToast(`Cambiado a ${isApplicant ? 'Applicant' : 'Co-Applicant'}`, 'info');
      });
      
      // Event listener para el toggle "Incluir en contrato"
      if (includeToggle) {
        includeToggle.addEventListener('change', () => {
          updateToggleVisualState();
          showToast(
            includeToggle.checked 
              ? 'Co-Applicant será incluido en el contrato' 
              : 'Co-Applicant no será incluido en el contrato', 
            includeToggle.checked ? 'success' : 'info'
          );
        });
      }
    }
    
    // Hacer el nombre editable al hacer click
    if (leadNameEl) {
      leadNameEl.addEventListener('click', () => {
        if (leadNameEl.contentEditable === 'false') {
          leadNameEl.contentEditable = 'true';
          leadNameEl.classList.add('editing');
          leadNameEl.focus();
          
          // Seleccionar todo el texto
          const range = document.createRange();
          range.selectNodeContents(leadNameEl);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });
      
      // Guardar al perder foco o presionar Enter
      leadNameEl.addEventListener('blur', () => {
        saveName();
      });
      
      leadNameEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          leadNameEl.blur();
        } else if (e.key === 'Escape') {
          leadNameEl.textContent = getCurrentPartyName();
          leadNameEl.blur();
        }
      });
    }
    
    async function saveName() {
      if (!leadNameEl) return;
      
      leadNameEl.contentEditable = 'false';
      leadNameEl.classList.remove('editing');
      
      const newName = leadNameEl.textContent.trim();
      const currentOriginal = getCurrentPartyData().fullName || '';
      
      if (newName && newName !== currentOriginal) {
        try {
          if (!currentLeadId) {
            showToast('Error: No se encontró el ID del lead', 'error');
            leadNameEl.textContent = currentOriginal;
            return;
          }
          
          if (isApplicant) applicantData.fullName = newName;
          else coApplicantData.fullName = newName;

          const payload = isApplicant
            ? { fullName: newName, coApplicantName: coApplicantData.fullName || '' }
            : { fullName: applicantData.fullName || originalName, coApplicantName: newName };
          const updatedLead = await patchLead(payload);
          syncLeadDataState(updatedLead);
          refreshPartyContactView();
          
          showToast(`${isApplicant ? 'Applicant' : 'Co-Applicant'} actualizado correctamente`, 'success');
        } catch (error) {
          console.error('Error:', error);
          showToast(error.message || 'Error al actualizar el nombre', 'error');
          leadNameEl.textContent = getCurrentPartyName();
        }
      } else {
        leadNameEl.textContent = getCurrentPartyName();
      }
    }
    
    // Botón de copiar nombre (con box)
    if (copyNameBtn) {
      copyNameBtn.addEventListener('click', async () => {
        const name = leadNameEl ? leadNameEl.textContent.trim() : '';
        if (name) {
          try {
            await navigator.clipboard.writeText(name);
            copyNameBtn.classList.add('copied');
            copyNameBtn.innerHTML = `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            `;
            
            setTimeout(() => {
              copyNameBtn.classList.remove('copied');
              copyNameBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              `;
            }, 2000);
          } catch (err) {
            console.error('Error al copiar:', err);
          }
        }
      });
    }
    
    // Botón de copiar Case ID (solo icono, sin box)
    if (copyCaseBtn) {
      copyCaseBtn.addEventListener('click', async () => {
        if (caseIdValue) {
          try {
            await navigator.clipboard.writeText(caseIdValue);
            copyCaseBtn.classList.add('copied');
            copyCaseBtn.innerHTML = `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            `;
            
            setTimeout(() => {
              copyCaseBtn.classList.remove('copied');
              copyCaseBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              `;
            }, 2000);
          } catch (err) {
            console.error('Error al copiar:', err);
          }
        }
      });
    }
    
    // ============================================
    // TOAST NOTIFICATIONS
    // ============================================
    function showToast(message, type = 'info') {
      let container = document.getElementById('toastContainer');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
      }
      
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      
      const iconSvg = type === 'success' 
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" width="20" height="20"><path d="M5 13l4 4L19 7"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><path d="M12 7v6m0 4v-2"/></svg>';
      
      toast.innerHTML = `${iconSvg}<span>${message}</span>`;
      container.appendChild(toast);
      
      setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    async function patchLead(payload) {
      if (!currentLeadId) {
        throw new Error('No se encontro el ID del lead.');
      }

      const cleanPayload = Object.fromEntries(
        Object.entries(payload || {}).filter(([key, value]) => key && key !== 'undefined' && value !== undefined)
      );
      if (Object.keys(cleanPayload).length === 0) {
        throw new Error('No hay datos validos para guardar.');
      }

      const response = await fetch(`/api/leads/${currentLeadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanPayload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'No se pudo guardar el cambio.');
      }

      if (data.lead) {
        syncLeadDataState(data.lead);
      }
      return data.lead || null;
    }

    function trimNoteText(value) {
      return String(value || '').slice(0, NOTES_MAX_LENGTH);
    }

    function getCurrentUsername() {
      try {
        const rawSession = localStorage.getItem('project_gw_session');
        if (!rawSession) return 'admin';
        const session = JSON.parse(rawSession);
        const username = String(session?.username || session?.name || '').trim();
        return username || 'admin';
      } catch (_error) {
        return 'admin';
      }
    }

    function setNotesStatus(message, tone = 'neutral') {
      if (!notesStatus) return;
      notesStatus.textContent = message;

      if (tone === 'success') {
        notesStatus.style.color = '#4ade80';
        return;
      }
      if (tone === 'warning') {
        notesStatus.style.color = '#facc15';
        return;
      }
      if (tone === 'error') {
        notesStatus.style.color = '#f87171';
        return;
      }
      notesStatus.style.color = '';
    }

    function setNotesComposerVisible(visible, options = {}) {
      const { focus = false, preserveText = true } = options;
      notesComposerVisible = Boolean(visible);

      if (notesComposerWrap) {
        notesComposerWrap.classList.toggle('hidden', !notesComposerVisible);
      }

      if (!notesComposerVisible && notesComposer && !preserveText) {
        notesComposer.value = '';
      }

      if (notesComposerVisible && focus && notesComposer) {
        setTimeout(() => notesComposer.focus(), 0);
      }
    }

    function formatNoteTimestamp(dateValue) {
      if (!dateValue) return '-';
      return formatDateTimeEs(dateValue);
    }

    function normalizeLeadNoteColorTag(value) {
      const normalized = String(value || '').trim().toLowerCase();
      return NOTE_COLOR_TAGS.includes(normalized) ? normalized : 'yellow';
    }

    function parseLeadNoteId(noteIdValue) {
      const numericId = Number(noteIdValue);
      return Number.isInteger(numericId) && numericId > 0 ? numericId : null;
    }

    function findLeadNoteById(noteIdValue) {
      const noteId = parseLeadNoteId(noteIdValue);
      if (!noteId) return null;
      return leadNotes.find((note) => Number(note.id) === noteId) || null;
    }

    function closeLeadNoteMenus() {
      activeLeadNoteMenuId = null;
      if (!notesList) return;

      notesList.querySelectorAll('.note-card-menu').forEach((menu) => {
        menu.classList.add('hidden');
        menu.classList.remove('note-card-menu-up');
      });
      notesList.querySelectorAll('.note-card-menu-btn').forEach((button) => {
        button.setAttribute('aria-expanded', 'false');
      });
      notesList.querySelectorAll('.note-card.note-card-menu-open').forEach((card) => {
        card.classList.remove('note-card-menu-open');
      });
    }

    function toggleLeadNoteMenu(noteIdValue) {
      const noteId = parseLeadNoteId(noteIdValue);
      if (!noteId || !notesList) return;

      const noteCard = notesList.querySelector(`.note-card[data-note-id="${noteId}"]`);
      if (!noteCard) return;
      const menu = noteCard.querySelector('.note-card-menu');
      const triggerButton = noteCard.querySelector('.note-card-menu-btn');
      if (!menu || !triggerButton) return;

      if (activeLeadNoteMenuId === noteId && !menu.classList.contains('hidden')) {
        closeLeadNoteMenus();
        return;
      }

      closeLeadNoteMenus();
      activeLeadNoteMenuId = noteId;
      noteCard.classList.add('note-card-menu-open');
      menu.classList.remove('hidden');
      triggerButton.setAttribute('aria-expanded', 'true');

      if (notesPanel) {
        menu.classList.remove('note-card-menu-up');
        const panelRect = notesPanel.getBoundingClientRect();
        const triggerRect = triggerButton.getBoundingClientRect();
        const menuHeight = menu.offsetHeight;
        const margin = 8;
        const spaceBelow = panelRect.bottom - triggerRect.bottom - margin;
        const spaceAbove = triggerRect.top - panelRect.top - margin;
        if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
          menu.classList.add('note-card-menu-up');
        }
      }
    }

    function renderLeadNotesList() {
      if (!notesList) return;
      activeLeadNoteMenuId = null;

      if (!Array.isArray(leadNotes) || leadNotes.length === 0) {
        notesList.innerHTML = '<div class="notes-feed-empty">Aun no hay notas en este lead.</div>';
        return;
      }

      notesList.innerHTML = leadNotes.map((note) => `
        <article class="note-card note-color-${escapeHtml(normalizeLeadNoteColorTag(note.color_tag))}" data-note-id="${escapeHtml(String(note.id))}">
          <div class="note-card-meta">
            <span class="note-card-author">${escapeHtml(note.author_username || 'Sistema')}</span>
            <div class="note-card-meta-right">
              <span class="note-card-time">${escapeHtml(formatNoteTimestamp(note.created_at))}</span>
              ${Number.isInteger(Number(note.id)) && !note.is_legacy ? `
                <button
                  class="note-card-menu-btn"
                  type="button"
                  title="Acciones de nota"
                  aria-expanded="false"
                  data-note-id="${escapeHtml(String(note.id))}">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="5" cy="12" r="2"></circle>
                    <circle cx="12" cy="12" r="2"></circle>
                    <circle cx="19" cy="12" r="2"></circle>
                  </svg>
                </button>
                <div class="note-card-menu hidden" data-note-id="${escapeHtml(String(note.id))}">
                  <button class="note-card-menu-item" type="button" data-action="edit-note" data-note-id="${escapeHtml(String(note.id))}">Editar</button>
                  <button class="note-card-menu-item danger" type="button" data-action="delete-note" data-note-id="${escapeHtml(String(note.id))}">Eliminar</button>
                  <div class="note-card-menu-divider"></div>
                  ${NOTE_COLOR_OPTIONS.map((option) => `
                    <button
                      class="note-card-menu-item note-card-menu-color-option ${normalizeLeadNoteColorTag(note.color_tag) === option.value ? 'active' : ''}"
                      type="button"
                      data-action="set-note-color"
                      data-note-id="${escapeHtml(String(note.id))}"
                      data-color="${escapeHtml(option.value)}">
                      <span class="note-color-swatch note-color-swatch-${escapeHtml(option.value)}"></span>
                      <span>${escapeHtml(option.label)}</span>
                    </button>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          </div>
          <div class="note-card-content">${escapeHtml(note.content || '')}</div>
        </article>
      `).join('');
    }

    function prepareNotesForLead(leadId) {
      notesLoadedForLeadId = null;
      leadNotesLoadingPromise = null;
      leadNotes = [];
      closeLeadNoteMenus();
      renderLeadNotesList();
      setNotesComposerVisible(false, { preserveText: false });
      if (leadId) {
        setNotesStatus('Sin notas', 'neutral');
      } else {
        setNotesStatus('Selecciona un lead', 'warning');
      }
    }

    function setNotesPanelOpen(nextOpen) {
      if (!notesPanel || !notesBtn) return;
      notesPanelOpen = Boolean(nextOpen);
      notesPanel.classList.toggle('hidden', !notesPanelOpen);
      notesBtn.setAttribute('aria-expanded', notesPanelOpen ? 'true' : 'false');
      if (!notesPanelOpen) {
        closeLeadNoteMenus();
        setNotesComposerVisible(false, { preserveText: false });
        setNotesTemplatesModalOpen(false);
      }
      if (notesPanelOpen && notesComposerVisible && notesComposer) {
        setTimeout(() => notesComposer.focus(), 0);
      }
    }

    async function requestLeadNotes(pathname = '', options = {}) {
      if (!currentLeadId) {
        throw new Error('No se encontro el ID del lead.');
      }

      const headers = new Headers(options.headers || {});
      headers.set('x-user', getCurrentUsername());
      if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const response = await fetch(`/api/leads/${currentLeadId}/notes${pathname}`, {
        ...options,
        headers
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'No se pudo completar la accion de notas.');
      }
      return data;
    }

    async function requestNoteTemplate(pathname = '', options = {}) {
      const headers = new Headers(options.headers || {});
      headers.set('x-user', getCurrentUsername());
      if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const response = await fetch(`/api/note-templates${pathname}`, {
        ...options,
        headers
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'No se pudo completar la accion de templates.');
      }
      return data;
    }

    function findNoteTemplateById(templateId) {
      const numericId = Number(templateId);
      if (!Number.isInteger(numericId) || numericId <= 0) return null;
      return noteTemplates.find((item) => Number(item.id) === numericId) || null;
    }

    function sortNoteTemplates(templates) {
      return [...(templates || [])].sort((a, b) => {
        const byName = String(a?.name || '').localeCompare(String(b?.name || ''), 'es', { sensitivity: 'base' });
        if (byName !== 0) return byName;
        return Number(b?.id || 0) - Number(a?.id || 0);
      });
    }

    function syncNoteTemplateSelectionUi() {
      const hasSelectedTemplate = Boolean(findNoteTemplateById(selectedNoteTemplateId));
      const selectedValue = hasSelectedTemplate ? String(selectedNoteTemplateId) : '';

      if (!hasSelectedTemplate) {
        selectedNoteTemplateId = null;
      }
      if (notesTemplateSelect) {
        notesTemplateSelect.value = selectedValue;
      }
      if (notesTemplatesManagerSelect) {
        notesTemplatesManagerSelect.value = selectedValue;
      }
    }

    function syncNoteTemplateManagerEditor() {
      if (!notesTemplatesManagerName || !notesTemplatesManagerContent) return;
      const selectedTemplate = findNoteTemplateById(selectedNoteTemplateId);
      if (!selectedTemplate) {
        notesTemplatesManagerName.value = '';
        notesTemplatesManagerContent.value = '';
        return;
      }
      notesTemplatesManagerName.value = String(selectedTemplate.name || '');
      notesTemplatesManagerContent.value = trimNoteText(selectedTemplate.content || '');
    }

    function selectNoteTemplate(templateId) {
      const nextId = Number(templateId);
      if (Number.isInteger(nextId) && nextId > 0 && findNoteTemplateById(nextId)) {
        selectedNoteTemplateId = nextId;
      } else {
        selectedNoteTemplateId = null;
      }
      syncNoteTemplateSelectionUi();
      syncNoteTemplateManagerEditor();
    }

    function startNewNoteTemplateDraft() {
      selectedNoteTemplateId = null;
      syncNoteTemplateSelectionUi();
      if (notesTemplatesManagerName) notesTemplatesManagerName.value = '';
      if (notesTemplatesManagerContent) notesTemplatesManagerContent.value = '';
      if (notesTemplatesManagerName) {
        setTimeout(() => notesTemplatesManagerName.focus(), 0);
      }
    }

    function getNoteTemplateDraftFromManager() {
      const name = String(notesTemplatesManagerName?.value || '').trim();
      const content = trimNoteText(notesTemplatesManagerContent?.value || '').trim();
      return { name, content };
    }

    function renderNoteTemplateSelect() {
      const previousSelected = selectedNoteTemplateId;
      const sortedTemplates = sortNoteTemplates(noteTemplates);

      if (notesTemplateSelect) {
        notesTemplateSelect.innerHTML = '<option value="">Seleccionar template...</option>';
        sortedTemplates.forEach((template) => {
          const option = document.createElement('option');
          option.value = String(template.id);
          option.textContent = template.name;
          notesTemplateSelect.appendChild(option);
        });
      }

      if (notesTemplatesManagerSelect) {
        notesTemplatesManagerSelect.innerHTML = '';
        sortedTemplates.forEach((template) => {
          const option = document.createElement('option');
          option.value = String(template.id);
          option.textContent = template.name;
          notesTemplatesManagerSelect.appendChild(option);
        });
      }

      selectedNoteTemplateId = findNoteTemplateById(previousSelected)
        ? Number(previousSelected)
        : null;
      syncNoteTemplateSelectionUi();
      syncNoteTemplateManagerEditor();
    }

    async function loadNoteTemplates(options = {}) {
      const force = Boolean(options.force);
      const currentOwner = getCurrentUsername();
      if (noteTemplatesOwner !== currentOwner) {
        noteTemplatesLoaded = false;
        noteTemplates = [];
        selectedNoteTemplateId = null;
      }

      if (!force && noteTemplatesLoaded && noteTemplatesOwner === currentOwner) {
        renderNoteTemplateSelect();
        return noteTemplates;
      }
      if (!force && noteTemplatesLoadingPromise) {
        return noteTemplatesLoadingPromise;
      }

      noteTemplatesLoadingPromise = (async () => {
        const data = await requestNoteTemplate('');
        noteTemplates = Array.isArray(data.templates) ? data.templates : [];
        noteTemplatesLoaded = true;
        noteTemplatesOwner = currentOwner;
        renderNoteTemplateSelect();
        return noteTemplates;
      })();

      try {
        return await noteTemplatesLoadingPromise;
      } finally {
        noteTemplatesLoadingPromise = null;
      }
    }

    async function loadLeadNotes(options = {}) {
      if (!currentLeadId) {
        leadNotes = [];
        renderLeadNotesList();
        return leadNotes;
      }

      const force = Boolean(options.force);
      if (!force && notesLoadedForLeadId === String(currentLeadId)) {
        renderLeadNotesList();
        return leadNotes;
      }
      if (!force && leadNotesLoadingPromise) {
        return leadNotesLoadingPromise;
      }

      setNotesStatus('Cargando notas...', 'neutral');
      leadNotesLoadingPromise = (async () => {
        const data = await requestLeadNotes('');
        const notes = Array.isArray(data.notes) ? data.notes : [];
        leadNotes = notes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        notesLoadedForLeadId = String(currentLeadId);
        renderLeadNotesList();
        setNotesStatus(`${leadNotes.length} nota${leadNotes.length === 1 ? '' : 's'}`, 'neutral');
        return leadNotes;
      })();

      try {
        return await leadNotesLoadingPromise;
      } finally {
        leadNotesLoadingPromise = null;
      }
    }

    async function addLeadNote() {
      if (!notesComposer) return;
      if (!currentLeadId) {
        showToast('No se encontro el lead activo para guardar notas.', 'error');
        return;
      }

      if (!notesComposerVisible) {
        setNotesComposerVisible(true, { focus: true });
        setNotesStatus('Escribe la nota y vuelve a presionar Agregar nota.', 'warning');
        return;
      }

      const content = trimNoteText(notesComposer.value).trim();
      if (!content) {
        setNotesStatus('Escribe una nota antes de agregar.', 'warning');
        return;
      }
      if (notesAdding) return;

      notesAdding = true;
      if (notesAddBtn) notesAddBtn.disabled = true;
      notesComposer.disabled = true;
      setNotesStatus('Agregando nota...', 'neutral');

      try {
        const data = await requestLeadNotes('', {
          method: 'POST',
          body: JSON.stringify({ content })
        });
        const note = data.note || null;
        if (note) {
          leadNotes = [note, ...leadNotes];
          notesLoadedForLeadId = String(currentLeadId);
          renderLeadNotesList();
        }
        notesComposer.value = '';
        setNotesComposerVisible(false, { preserveText: false });
        setNotesStatus(`${leadNotes.length} nota${leadNotes.length === 1 ? '' : 's'}`, 'success');
        showToast('Nota agregada correctamente.', 'success');
      } catch (error) {
        setNotesStatus(error.message || 'No se pudo agregar la nota.', 'error');
        showToast(error.message || 'No se pudo agregar la nota.', 'error');
      } finally {
        notesAdding = false;
        if (notesAddBtn) notesAddBtn.disabled = false;
        notesComposer.disabled = false;
      }
    }

    async function editLeadNoteById(noteIdValue) {
      const noteId = parseLeadNoteId(noteIdValue);
      if (!noteId) return;

      const targetNote = findLeadNoteById(noteId);
      if (!targetNote || targetNote.is_legacy) {
        showToast('No se pudo editar la nota seleccionada.', 'error');
        return;
      }

      const proposedContent = window.prompt('Editar nota:', String(targetNote.content || ''));
      if (proposedContent === null) return;

      const content = trimNoteText(proposedContent).trim();
      if (!content) {
        showToast('La nota no puede quedar vacia.', 'error');
        return;
      }

      try {
        const data = await requestLeadNotes(`/${noteId}`, {
          method: 'PATCH',
          body: JSON.stringify({ content })
        });
        const updatedNote = data.note || null;
        if (updatedNote) {
          leadNotes = leadNotes.map((note) => (
            Number(note.id) === noteId ? { ...note, ...updatedNote } : note
          ));
          renderLeadNotesList();
          setNotesStatus(`${leadNotes.length} nota${leadNotes.length === 1 ? '' : 's'}`, 'success');
        }
        showToast('Nota actualizada correctamente.', 'success');
      } catch (error) {
        showToast(error.message || 'No se pudo actualizar la nota.', 'error');
      }
    }

    async function deleteLeadNoteById(noteIdValue) {
      const noteId = parseLeadNoteId(noteIdValue);
      if (!noteId) return;

      const targetNote = findLeadNoteById(noteId);
      if (!targetNote || targetNote.is_legacy) {
        showToast('No se pudo eliminar la nota seleccionada.', 'error');
        return;
      }

      const confirmed = window.confirm('Eliminar esta nota?');
      if (!confirmed) return;

      try {
        await requestLeadNotes(`/${noteId}`, { method: 'DELETE' });
        leadNotes = leadNotes.filter((note) => Number(note.id) !== noteId);
        renderLeadNotesList();
        setNotesStatus(`${leadNotes.length} nota${leadNotes.length === 1 ? '' : 's'}`, 'success');
        showToast('Nota eliminada correctamente.', 'success');
      } catch (error) {
        showToast(error.message || 'No se pudo eliminar la nota.', 'error');
      }
    }

    async function setLeadNoteColorById(noteIdValue, colorTagValue) {
      const noteId = parseLeadNoteId(noteIdValue);
      const normalizedColorTag = normalizeLeadNoteColorTag(colorTagValue);
      if (!noteId) return;

      const targetNote = findLeadNoteById(noteId);
      if (!targetNote || targetNote.is_legacy) {
        showToast('No se pudo actualizar el color de la nota.', 'error');
        return;
      }

      if (normalizeLeadNoteColorTag(targetNote.color_tag) === normalizedColorTag) {
        closeLeadNoteMenus();
        return;
      }

      try {
        const data = await requestLeadNotes(`/${noteId}`, {
          method: 'PATCH',
          body: JSON.stringify({ colorTag: normalizedColorTag })
        });
        const updatedNote = data.note || null;
        if (updatedNote) {
          leadNotes = leadNotes.map((note) => (
            Number(note.id) === noteId ? { ...note, ...updatedNote } : note
          ));
          renderLeadNotesList();
        }
        showToast('Color de nota actualizado.', 'success');
      } catch (error) {
        showToast(error.message || 'No se pudo actualizar el color de la nota.', 'error');
      }
    }

    async function createNoteTemplateFromManager(successMessage = 'Template creado correctamente.') {
      const { name, content } = getNoteTemplateDraftFromManager();
      if (!name) {
        showToast('Debes escribir un nombre para el template.', 'error');
        return null;
      }
      if (!content) {
        showToast('Debes escribir contenido para el template.', 'error');
        return null;
      }

      try {
        const data = await requestNoteTemplate('', {
          method: 'POST',
          body: JSON.stringify({ name, content })
        });
        const createdTemplate = data.template || null;
        if (createdTemplate) {
          noteTemplates.push(createdTemplate);
          selectedNoteTemplateId = Number(createdTemplate.id);
          renderNoteTemplateSelect();
          showToast(successMessage, 'success');
          return createdTemplate;
        }
        showToast('No se pudo crear el template.', 'error');
        return null;
      } catch (error) {
        showToast(error.message || 'No se pudo crear el template.', 'error');
        return null;
      }
    }

    async function saveTemplateFromManager() {
      const selectedTemplate = findNoteTemplateById(selectedNoteTemplateId);
      if (!selectedTemplate) {
        await createNoteTemplateFromManager('Template creado correctamente.');
        return;
      }

      const { name, content } = getNoteTemplateDraftFromManager();
      if (!name) {
        showToast('Debes escribir un nombre para el template.', 'error');
        return;
      }
      if (!content) {
        showToast('Debes escribir contenido para el template.', 'error');
        return;
      }

      try {
        const data = await requestNoteTemplate(`/${selectedTemplate.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name, content })
        });
        const updatedTemplate = data.template || null;
        if (updatedTemplate) {
          noteTemplates = noteTemplates.map((item) => (
            Number(item.id) === Number(updatedTemplate.id) ? updatedTemplate : item
          ));
          selectedNoteTemplateId = Number(updatedTemplate.id);
        }
        renderNoteTemplateSelect();
        showToast('Template actualizado.', 'success');
      } catch (error) {
        showToast(error.message || 'No se pudo actualizar el template.', 'error');
      }
    }

    async function saveTemplateAsNewFromManager() {
      await createNoteTemplateFromManager('Template guardado como nuevo.');
    }

    async function deleteSelectedTemplateFromManager() {
      const selectedTemplate = findNoteTemplateById(selectedNoteTemplateId);
      if (!selectedTemplate) {
        showToast('Selecciona un template para eliminar.', 'info');
        return;
      }

      const confirmed = window.confirm(`Eliminar template "${selectedTemplate.name}"?`);
      if (!confirmed) return;

      try {
        await requestNoteTemplate(`/${selectedTemplate.id}`, { method: 'DELETE' });
        noteTemplates = noteTemplates.filter((item) => Number(item.id) !== Number(selectedTemplate.id));
        selectedNoteTemplateId = null;
        renderNoteTemplateSelect();
        showToast('Template eliminado.', 'success');
      } catch (error) {
        showToast(error.message || 'No se pudo eliminar el template.', 'error');
      }
    }

    function applySelectedTemplateToNotes() {
      const selectedTemplate = findNoteTemplateById(selectedNoteTemplateId);
      if (!selectedTemplate) {
        showToast('Selecciona un template para aplicar.', 'info');
        return;
      }
      if (!notesComposer) return;

      setNotesComposerVisible(true, { focus: true });
      notesComposer.value = trimNoteText(selectedTemplate.content || '');
      setNotesStatus('Template aplicado. Presiona Agregar nota para guardar.', 'warning');
      showToast('Template aplicado a la nota.', 'success');
    }

    function setNotesTemplatesModalOpen(nextOpen) {
      if (!notesTemplatesModal) return;
      notesTemplatesModalOpen = Boolean(nextOpen);
      notesTemplatesModal.classList.toggle('hidden', !notesTemplatesModalOpen);
      notesTemplatesModal.setAttribute('aria-hidden', notesTemplatesModalOpen ? 'false' : 'true');

      if (!notesTemplatesModalOpen) return;

      syncNoteTemplateSelectionUi();
      syncNoteTemplateManagerEditor();
      if (selectedNoteTemplateId && notesTemplatesManagerContent) {
        setTimeout(() => notesTemplatesManagerContent.focus(), 0);
      } else if (notesTemplatesManagerName) {
        setTimeout(() => notesTemplatesManagerName.focus(), 0);
      }
    }

    function initNotesPanel() {
      if (!notesBtn || !notesPanel || !notesComposer) return;

      notesBtn.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const nextOpen = !notesPanelOpen;
        setNotesPanelOpen(nextOpen);
        if (nextOpen) {
          try {
            await Promise.all([
              loadNoteTemplates(),
              loadLeadNotes()
            ]);
          } catch (error) {
            showToast(error.message || 'No se pudo cargar el panel de notas.', 'error');
          }
        }
      });

      notesCloseBtn?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setNotesPanelOpen(false);
      });

      notesPanel.addEventListener('click', (event) => {
        event.stopPropagation();
      });

      notesList?.addEventListener('click', (event) => {
        const menuButton = event.target.closest('.note-card-menu-btn');
        if (menuButton) {
          event.preventDefault();
          event.stopPropagation();
          toggleLeadNoteMenu(menuButton.dataset.noteId);
          return;
        }

        const menuAction = event.target.closest('.note-card-menu-item');
        if (!menuAction) {
          closeLeadNoteMenus();
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        const noteId = menuAction.dataset.noteId;
        const action = menuAction.dataset.action;

        if (action === 'edit-note') {
          closeLeadNoteMenus();
          void editLeadNoteById(noteId);
          return;
        }
        if (action === 'delete-note') {
          closeLeadNoteMenus();
          void deleteLeadNoteById(noteId);
          return;
        }
        if (action === 'set-note-color') {
          const colorTag = menuAction.dataset.color;
          void setLeadNoteColorById(noteId, colorTag);
        }
      });

      document.addEventListener('click', (event) => {
        if (!notesPanelOpen || !notesPanel) return;
        if (!notesPanel.contains(event.target)) {
          closeLeadNoteMenus();
        }
      });

      notesComposer.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'enter') {
          event.preventDefault();
          void addLeadNote();
        }
      });

      notesAddBtn?.addEventListener('click', () => {
        void addLeadNote();
      });

      notesTemplateSelect?.addEventListener('change', () => {
        selectNoteTemplate(notesTemplateSelect.value);
      });

      notesTemplateUseBtn?.addEventListener('click', () => {
        applySelectedTemplateToNotes();
      });

      notesTemplateManageBtn?.addEventListener('click', () => {
        void (async () => {
          try {
            await loadNoteTemplates();
            setNotesTemplatesModalOpen(true);
          } catch (error) {
            showToast(error.message || 'No se pudo abrir el editor de templates.', 'error');
          }
        })();
      });

      notesTemplatesModalClose?.addEventListener('click', () => {
        setNotesTemplatesModalOpen(false);
      });

      notesTemplatesModalBackdrop?.addEventListener('click', () => {
        setNotesTemplatesModalOpen(false);
      });

      notesTemplatesManagerSelect?.addEventListener('change', () => {
        selectNoteTemplate(notesTemplatesManagerSelect.value);
      });

      notesTemplatesManagerNewBtn?.addEventListener('click', () => {
        startNewNoteTemplateDraft();
      });

      notesTemplatesManagerSaveBtn?.addEventListener('click', () => {
        void saveTemplateFromManager();
      });

      notesTemplatesManagerSaveAsNewBtn?.addEventListener('click', () => {
        void saveTemplateAsNewFromManager();
      });

      notesTemplatesManagerDeleteBtn?.addEventListener('click', () => {
        void deleteSelectedTemplateFromManager();
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && notesTemplatesModalOpen) {
          event.preventDefault();
          setNotesTemplatesModalOpen(false);
        }
      });

      prepareNotesForLead(currentLeadId);
    }

    function setElementSavingState(element, saving) {
      if (!element) return;
      element.dataset.saving = saving ? 'true' : 'false';
      element.style.opacity = saving ? '0.7' : '';
      element.style.pointerEvents = saving ? 'none' : '';
    }

    function normalizeEditableValue(fieldName, rawValue) {
      const trimmed = String(rawValue || '').trim();
      if (!trimmed || trimmed === EMPTY_FIELD_LABEL) return '';
      if (fieldName === 'home_phone' || fieldName === 'cell_phone') {
        return formatPhoneValue(trimmed);
      }
      if (fieldName === 'zip_code') {
        return formatZipCodeValue(trimmed);
      }
      if (fieldName === 'ssn') {
        return trimmed.replace(/\s+/g, '');
      }
      return trimmed;
    }

    function formatPhoneValue(rawValue) {
      const digits = String(rawValue || '').replace(/\D/g, '');
      const normalized = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
      const base = normalized.slice(0, 10);

      if (!base) return '';
      if (base.length <= 3) return base;
      if (base.length <= 6) return `${base.slice(0, 3)}-${base.slice(3)}`;
      return `${base.slice(0, 3)}-${base.slice(3, 6)}-${base.slice(6)}`;
    }

    function formatZipCodeValue(rawValue) {
      const digits = String(rawValue || '').replace(/\D/g, '').slice(0, 9);
      if (!digits) return '';
      if (digits.length <= 5) return digits;
      return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    }

    async function lookupZipLocation(zipCode) {
      const normalized = formatZipCodeValue(zipCode);
      if (!normalized) return null;

      const baseZip = normalized.slice(0, 5);
      if (baseZip.length !== 5) return null;

      if (zipLocationCache.has(baseZip)) {
        return zipLocationCache.get(baseZip);
      }

      const response = await fetch(`/api/zipcode/${encodeURIComponent(baseZip)}`);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 404 || response.status === 422) return null;
        throw new Error(data.message || 'No se pudo validar el ZIP.');
      }

      const city = String(data.city || '').trim();
      const stateCode = String(data.stateCode || '').trim().toUpperCase();
      if (!city || !stateCode) return null;

      const resolved = { city, stateCode };
      zipLocationCache.set(baseZip, resolved);
      return resolved;
    }

    function getLeadFieldValueForDisplay(lead, fieldName) {
      const targetLead = lead || {};
      const homePhoneKey = resolveLeadColumnForParty('home_phone');
      const cellPhoneKey = resolveLeadColumnForParty('cell_phone');
      const emailKey = resolveLeadColumnForParty('email');
      const ssnKey = resolveLeadColumnForParty('ssn');
      const currentlyEmployedKey = resolveLeadColumnForParty('currently_employed');
      const employerNameKey = resolveLeadColumnForParty('employer_name');
      const occupationKey = resolveLeadColumnForParty('occupation');

      const valueByField = {
        home_phone: formatPhoneValue(targetLead[homePhoneKey] || (isApplicant ? targetLead.phone : '')),
        cell_phone: formatPhoneValue(targetLead[cellPhoneKey] || (isApplicant ? targetLead.phone : '')),
        email: targetLead[emailKey],
        ssn: targetLead[ssnKey],
        address_street: targetLead.address_street,
        city: targetLead.city,
        zip_code: targetLead.zip_code,
        state: targetLead.state_code ? `${getStateName(targetLead.state_code)} (${targetLead.state_code})` : null,
        best_time: targetLead.best_time,
        currently_employed: targetLead[currentlyEmployedKey],
        employer_name: targetLead[employerNameKey],
        occupation: targetLead[occupationKey]
      };
      return valueByField[fieldName] || EMPTY_FIELD_LABEL;
    }

    function updateStateBadge(lead) {
      const stateBadge = document.getElementById('stateBadge');
      if (!stateBadge || !lead) return;

      const stateCode = lead.state_code || '-';
      const stateType = lead.state_type || 'Red';
      const isGreen = stateType === 'Green';

      stateBadge.className = `lead-state-badge ${isGreen ? 'green' : 'red'}`;
      stateBadge.textContent = stateType;
      stateBadge.title = `${getStateName(stateCode)} (${stateCode}) - ${stateType} State`;
      updateLegalPlanStateHint();
    }

    async function updateRelatedLeadBadge(lead) {
      const relatedBadge = document.getElementById('relatedLeadBadge');
      const relatedBadgeText = document.getElementById('relatedLeadBadgeText');
      if (!relatedBadge || !relatedBadgeText) return;

      const relatedLeadId = Number(lead?.related_lead_id);
      if (!Number.isInteger(relatedLeadId) || relatedLeadId <= 0) {
        relatedBadge.classList.add('hidden');
        relatedBadge.href = '#';
        relatedBadgeText.textContent = 'Relacionado con #';
        return;
      }

      relatedBadge.classList.remove('hidden');
      relatedBadge.href = `/client.html?id=${relatedLeadId}`;
      relatedBadgeText.textContent = `Relacionado con #${relatedLeadId}`;
      relatedBadge.title = 'Abrir lead relacionado';

      const requestVersion = ++relatedBadgeRequestVersion;

      try {
        const response = await fetch(`/api/leads/${relatedLeadId}`);
        if (!response.ok) throw new Error('Lead relacionado no encontrado');

        const data = await response.json();
        if (requestVersion !== relatedBadgeRequestVersion) return;

        const relatedLead = data?.lead || null;
        if (!relatedLead) {
          relatedBadge.classList.add('hidden');
          relatedBadge.href = '#';
          relatedBadgeText.textContent = 'Relacionado con #';
          return;
        }
        const relatedCase = relatedLead?.case_id ? `#${relatedLead.case_id}` : `#${relatedLeadId}`;
        const relatedName = relatedLead?.full_name ? ` (${relatedLead.full_name})` : '';

        relatedBadgeText.textContent = `Relacionado con ${relatedCase}${relatedName}`;
        relatedBadge.title = `Abrir lead relacionado ${relatedCase}`;
      } catch (_error) {
        if (requestVersion !== relatedBadgeRequestVersion) return;
        relatedBadge.classList.add('hidden');
        relatedBadge.href = '#';
        relatedBadgeText.textContent = 'Relacionado con #';
      }
    }
    
    // ============================================
    // CUSTOM CALENDAR - LIQUID GLASS
    // ============================================
    let currentCalendarDate = new Date();
    let selectedCallbackDate = null;
    let calendarLeadId = null;
    let calendarLeadName = '';
    let callbackCalendarController = null;
    let dobCalendarController = null;
    let calcPaymentDayCalendarController = null;
    const CALENDAR_MIN_YEAR = 1900;
    const CALENDAR_MAX_YEAR = 2100;
    const CALENDAR_MONTH_NAMES = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    function toCalendarDate(value) {
      const parsed = parseISODate(value);
      if (!parsed) return null;
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }

    function shiftCalendarViewDate(baseDate, deltaMonths) {
      const safeBase = baseDate instanceof Date && !Number.isNaN(baseDate.getTime())
        ? baseDate
        : new Date();
      return new Date(safeBase.getFullYear(), safeBase.getMonth() + deltaMonths, 1);
    }

    function parseCalendarJumpInput(rawInput, fallbackDate) {
      const fallback = fallbackDate instanceof Date && !Number.isNaN(fallbackDate.getTime())
        ? fallbackDate
        : new Date();
      const text = String(rawInput || '').trim();
      const match = text.match(/^(\d{4})(?:[-\/](\d{1,2}))?$/);
      if (!match) return null;

      const year = Number(match[1]);
      const month = match[2] ? Number(match[2]) : (fallback.getMonth() + 1);

      if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
      if (year < CALENDAR_MIN_YEAR || year > CALENDAR_MAX_YEAR) return null;
      if (month < 1 || month > 12) return null;

      return new Date(year, month - 1, 1);
    }

    function ensureCalendarJumpPopover(options) {
      const {
        calendarEl,
        getViewDate,
        setViewDate,
        render
      } = options || {};

      if (!calendarEl || !getViewDate || !setViewDate || !render) return null;

      if (calendarEl.__calendarJumpPopoverController) {
        return calendarEl.__calendarJumpPopoverController;
      }

      const popover = document.createElement('div');
      popover.className = 'calendar-jump-popover hidden';
      popover.innerHTML = `
        <div class="calendar-jump-popover-row">
          <input type="text" class="calendar-jump-input" placeholder="YYYY-MM" maxlength="7" />
          <button type="button" class="calendar-jump-apply">Ir</button>
        </div>
        <div class="calendar-jump-error" aria-live="polite"></div>
      `;

      calendarEl.appendChild(popover);

      const input = popover.querySelector('.calendar-jump-input');
      const applyBtn = popover.querySelector('.calendar-jump-apply');
      const errorEl = popover.querySelector('.calendar-jump-error');

      const hide = () => {
        popover.classList.add('hidden');
        if (errorEl) errorEl.textContent = '';
      };

      const show = () => {
        const current = getViewDate();
        if (input) {
          input.value = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
        }
        if (errorEl) errorEl.textContent = '';
        popover.classList.remove('hidden');
        setTimeout(() => input?.focus(), 0);
      };

      const submit = () => {
        const current = getViewDate();
        const jumpedDate = parseCalendarJumpInput(input?.value, current);
        if (!jumpedDate) {
          if (errorEl) {
            errorEl.textContent = `Usa YYYY-MM (${CALENDAR_MIN_YEAR}-${CALENDAR_MAX_YEAR}).`;
          }
          return;
        }

        hide();
        setViewDate(jumpedDate);
        render();
      };

      applyBtn?.addEventListener('click', (event) => {
        event.stopPropagation();
        submit();
      });

      input?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          hide();
        }
      });

      popover.addEventListener('click', (event) => {
        event.stopPropagation();
      });

      calendarEl.__calendarJumpPopoverController = {
        show,
        hide,
        isOpen: () => !popover.classList.contains('hidden')
      };

      return calendarEl.__calendarJumpPopoverController;
    }

    function ensureCalendarYearNavigation(options) {
      const {
        calendarEl,
        prevBtn,
        nextBtn,
        monthYearEl,
        getViewDate,
        setViewDate,
        render
      } = options || {};

      if (!calendarEl || !prevBtn || !nextBtn || !monthYearEl || !getViewDate || !setViewDate || !render) return;

      const jumpPopover = ensureCalendarJumpPopover({
        calendarEl,
        getViewDate,
        setViewDate,
        render
      });

      if (calendarEl.dataset.yearNavigationReady) return;

      const yearPrevBtn = document.createElement('button');
      yearPrevBtn.type = 'button';
      yearPrevBtn.className = 'calendar-nav';
      yearPrevBtn.dataset.calendarNav = 'year-prev';
      yearPrevBtn.textContent = '<<';
      yearPrevBtn.title = 'Anio anterior';

      const yearNextBtn = document.createElement('button');
      yearNextBtn.type = 'button';
      yearNextBtn.className = 'calendar-nav';
      yearNextBtn.dataset.calendarNav = 'year-next';
      yearNextBtn.textContent = '>>';
      yearNextBtn.title = 'Anio siguiente';

      prevBtn.parentNode?.insertBefore(yearPrevBtn, prevBtn);
      nextBtn.parentNode?.insertBefore(yearNextBtn, nextBtn.nextSibling);

      yearPrevBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        jumpPopover?.hide();
        setViewDate(shiftCalendarViewDate(getViewDate(), -12));
        render();
      });

      yearNextBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        jumpPopover?.hide();
        setViewDate(shiftCalendarViewDate(getViewDate(), 12));
        render();
      });

      monthYearEl.style.cursor = 'pointer';
      monthYearEl.title = 'Click para saltar a YYYY-MM';
      monthYearEl.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!jumpPopover) return;
        if (jumpPopover.isOpen()) {
          jumpPopover.hide();
        } else {
          jumpPopover.show();
        }
      });

      calendarEl.dataset.yearNavigationReady = 'true';
    }

    function renderUnifiedCalendarDays(options) {
      const {
        monthYearEl,
        daysContainer,
        viewDate,
        selectedIsoDate,
        showToday = true,
        isDateDisabled,
        decorateDay,
        onSelectDay
      } = options || {};

      if (!monthYearEl || !daysContainer || !(viewDate instanceof Date) || Number.isNaN(viewDate.getTime())) return;

      const year = viewDate.getFullYear();
      const month = viewDate.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const daysInPrevMonth = new Date(year, month, 0).getDate();
      const todayIso = formatISODate(new Date());

      monthYearEl.textContent = `${CALENDAR_MONTH_NAMES[month]} ${year}`;
      daysContainer.innerHTML = '';

      for (let i = firstDay - 1; i >= 0; i--) {
        const dayEl = document.createElement('button');
        dayEl.type = 'button';
        dayEl.className = 'calendar-day other-month';
        dayEl.textContent = String(daysInPrevMonth - i);
        dayEl.disabled = true;
        daysContainer.appendChild(dayEl);
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month, day);
        const isoDate = formatISODate(dateObj);
        const dayEl = document.createElement('button');
        dayEl.type = 'button';
        dayEl.className = 'calendar-day';
        dayEl.textContent = String(day);

        if (showToday && isoDate === todayIso) {
          dayEl.classList.add('today');
        }
        if (isoDate === selectedIsoDate) {
          dayEl.classList.add('selected');
        }

        if (typeof decorateDay === 'function') {
          decorateDay({ dayEl, isoDate, dateObj });
        }

        const disabled = typeof isDateDisabled === 'function'
          ? Boolean(isDateDisabled(dateObj, isoDate))
          : false;
        if (disabled) {
          dayEl.classList.add('disabled');
          dayEl.disabled = true;
        } else if (typeof onSelectDay === 'function') {
          dayEl.addEventListener('click', async (event) => {
            event.stopPropagation();
            try {
              await onSelectDay({ dayEl, isoDate, dateObj });
            } catch (error) {
              console.error('Error al seleccionar fecha de calendario:', error);
            }
          });
        }

        daysContainer.appendChild(dayEl);
      }

      const totalCells = firstDay + daysInMonth;
      const remainingCells = Math.max(0, 42 - totalCells);
      for (let i = 1; i <= remainingCells; i++) {
        const dayEl = document.createElement('button');
        dayEl.type = 'button';
        dayEl.className = 'calendar-day other-month';
        dayEl.textContent = String(i);
        dayEl.disabled = true;
        daysContainer.appendChild(dayEl);
      }
    }

    function createUnifiedCalendarController(options) {
      const {
        triggerEl,
        calendarEl,
        prevBtn,
        nextBtn,
        monthYearEl,
        daysContainer,
        getViewDate,
        setViewDate,
        getSelectedIsoDate,
        onSelectDate,
        isDateDisabled,
        decorateDay,
        showToday = true,
        closeOnSelect = true,
        rerenderAfterSelect = true,
        syncViewToSelectedOnOpen = true
      } = options || {};

      if (!triggerEl || !calendarEl || !prevBtn || !nextBtn || !monthYearEl || !daysContainer) return null;

      const render = () => {
        renderUnifiedCalendarDays({
          monthYearEl,
          daysContainer,
          viewDate: getViewDate(),
          selectedIsoDate: typeof getSelectedIsoDate === 'function' ? getSelectedIsoDate() : null,
          showToday,
          isDateDisabled,
          decorateDay,
          onSelectDay: async ({ dayEl, isoDate, dateObj }) => {
            let closeCalendarNow = closeOnSelect;
            if (typeof onSelectDate === 'function') {
              const result = await onSelectDate({ dayEl, isoDate, dateObj });
              if (result === false) closeCalendarNow = false;
            }
            if (closeCalendarNow) close();
            if (rerenderAfterSelect) render();
          }
        });
      };

      const changeMonth = (deltaMonths) => {
        const jumpPopover = calendarEl.__calendarJumpPopoverController;
        jumpPopover?.hide();
        setViewDate(shiftCalendarViewDate(getViewDate(), deltaMonths));
        render();
      };

      const open = () => {
        if (syncViewToSelectedOnOpen) {
          const selected = typeof getSelectedIsoDate === 'function'
            ? toCalendarDate(getSelectedIsoDate())
            : null;
          if (selected) {
            setViewDate(new Date(selected.getFullYear(), selected.getMonth(), 1));
          }
        }
        calendarEl.classList.remove('hidden');
        render();
      };

      const close = () => {
        const jumpPopover = calendarEl.__calendarJumpPopoverController;
        jumpPopover?.hide();
        calendarEl.classList.add('hidden');
      };

      triggerEl.addEventListener('click', (event) => {
        event.stopPropagation();
        if (calendarEl.classList.contains('hidden')) {
          open();
        } else {
          close();
        }
      });

      prevBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        changeMonth(event.shiftKey ? -12 : -1);
      });

      nextBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        changeMonth(event.shiftKey ? 12 : 1);
      });

      ensureCalendarYearNavigation({
        calendarEl,
        prevBtn,
        nextBtn,
        monthYearEl,
        getViewDate,
        setViewDate,
        render
      });

      document.addEventListener('click', (event) => {
        if (!calendarEl.contains(event.target) && !triggerEl.contains(event.target)) {
          close();
        }
      });

      return {
        open,
        close,
        render
      };
    }

    function initCallbackCalendar(leadId, leadName) {
      calendarLeadId = leadId;
      calendarLeadName = leadName;

      const calendarBtn = document.getElementById('callbackCalendarBtn');
      const calendarEl = document.getElementById('customCalendar');
      const dateDisplay = document.getElementById('callbackDateDisplay');
      const macBtn = document.getElementById('callbackMacBtn');
      const prevBtn = document.getElementById('calendarPrev');
      const nextBtn = document.getElementById('calendarNext');
      const monthYearEl = document.getElementById('calendarMonthYear');
      const daysContainer = document.getElementById('calendarDays');

      if (!calendarBtn || !calendarEl || !dateDisplay || !prevBtn || !nextBtn || !monthYearEl || !daysContainer) return;

      const savedCallback = localStorage.getItem(`lead_callback_${leadId}`);
      if (savedCallback) {
        selectedCallbackDate = savedCallback;
        const parsedSavedDate = toCalendarDate(savedCallback);
        if (parsedSavedDate) {
          currentCalendarDate = new Date(parsedSavedDate.getFullYear(), parsedSavedDate.getMonth(), 1);
          dateDisplay.textContent = parsedSavedDate.toLocaleDateString('es-ES');
        }
        if (macBtn) macBtn.classList.remove('hidden');
      } else {
        selectedCallbackDate = null;
        dateDisplay.textContent = 'Seleccionar fecha';
      }

      callbackCalendarController = createUnifiedCalendarController({
        triggerEl: calendarBtn,
        calendarEl,
        prevBtn,
        nextBtn,
        monthYearEl,
        daysContainer,
        getViewDate: () => currentCalendarDate,
        setViewDate: (date) => {
          currentCalendarDate = new Date(date.getFullYear(), date.getMonth(), 1);
        },
        getSelectedIsoDate: () => selectedCallbackDate,
        showToday: true,
        closeOnSelect: false,
        rerenderAfterSelect: true,
        syncViewToSelectedOnOpen: true,
        decorateDay: ({ dayEl, isoDate }) => {
          if (isoDate === localStorage.getItem(`lead_callback_${calendarLeadId}`)) {
            dayEl.classList.add('has-pin');
          }
        },
        onSelectDate: ({ isoDate }) => {
          selectedCallbackDate = isoDate;
          localStorage.setItem(`lead_callback_${calendarLeadId}`, isoDate);
          localStorage.setItem(`lead_callback_name_${calendarLeadId}`, calendarLeadName);

          const parsedDate = toCalendarDate(isoDate);
          dateDisplay.textContent = parsedDate ? parsedDate.toLocaleDateString('es-ES') : 'Seleccionar fecha';

          const mb = document.getElementById('callbackMacBtn');
          if (mb) mb.classList.remove('hidden');

          showToast(`Callback programado para: ${dateDisplay.textContent}`, 'success');
          updateNotificationBadge();
          return true;
        }
      });

      if (macBtn) {
        macBtn.addEventListener('click', () => {
          selectedCallbackDate = null;
          localStorage.removeItem(`lead_callback_${leadId}`);
          localStorage.removeItem(`lead_callback_name_${leadId}`);
          macBtn.classList.add('hidden');
          dateDisplay.textContent = 'Seleccionar fecha';
          showToast('Callback eliminado', 'info');
          updateNotificationBadge();
          if (callbackCalendarController) {
            callbackCalendarController.render();
          }
        });
      }
    }

    // ============================================
    // CAMPOS EDITABLES Y FUNCIONALIDAD DE COPIAR
    // ============================================
    
    function initEditableFields() {
      const editableFields = document.querySelectorAll('.info-row-value.editable[data-field]');
      
      editableFields.forEach(field => {
        const canCopy = field.dataset.copy === 'true';
        const fieldName = field.dataset.field;
        
        // Agregar icono de copiar si aplica
        if (canCopy && !field.querySelector('.copy-icon')) {
          const copyIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          copyIcon.setAttribute('viewBox', '0 0 24 24');
          copyIcon.setAttribute('fill', 'none');
          copyIcon.setAttribute('stroke', 'currentColor');
          copyIcon.setAttribute('stroke-width', '2');
          copyIcon.classList.add('copy-icon');
          copyIcon.innerHTML = '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>';
          copyIcon.title = 'Copiar';
          
          copyIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            const textToCopy = field.textContent.trim();
            navigator.clipboard.writeText(textToCopy).then(() => {
              showToast('Copiado al portapapeles', 'success');
            }).catch(() => {
              showToast('Error al copiar', 'error');
            });
          });
          
          field.appendChild(copyIcon);
        }
        
        // Hacer editable al hacer click (excepto DOB que tiene calendario)
        if (fieldName !== 'dob' && EDITABLE_FIELD_PAYLOAD_MAP[fieldName]) {
          field.addEventListener('click', () => {
            if (field.dataset.saving === 'true') return;
            makeFieldEditable(field, fieldName);
          });
        }
      });
    }
    
    function makeFieldEditable(field, fieldName) {
      if (field.querySelector('input')) return; // Ya esta en modo edicion
      const safeFieldName = String(fieldName || '').trim();
      if (!EDITABLE_FIELD_PAYLOAD_MAP[safeFieldName]) return;

      const currentDisplayValue = field.childNodes[0]?.textContent?.trim() || field.textContent.trim();
      const currentValue = currentDisplayValue === EMPTY_FIELD_LABEL ? '' : currentDisplayValue;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = currentValue;
      if (safeFieldName === 'home_phone' || safeFieldName === 'cell_phone') {
        input.value = formatPhoneValue(currentValue);
      }
      
      // Guardar referencia al icono de copiar si existe
      const copyIcon = field.querySelector('.copy-icon');
      if (copyIcon) copyIcon.style.display = 'none';
      
      field.textContent = '';
      field.appendChild(input);
      input.focus();

      let wasCommitted = false;

      const restoreField = (value) => {
        field.textContent = value || EMPTY_FIELD_LABEL;
        if (copyIcon) {
          field.appendChild(copyIcon);
          copyIcon.style.display = '';
        }
      };
      
      async function saveEdit() {
        if (wasCommitted) return;
        wasCommitted = true;

        const normalizedValue = normalizeEditableValue(safeFieldName, input.value);
        const tentativeDisplay = normalizedValue || EMPTY_FIELD_LABEL;
        restoreField(tentativeDisplay);

        if (normalizedValue === currentValue) {
          return;
        }

        try {
          setElementSavingState(field, true);

          const payloadKey = resolvePayloadKeyForParty(safeFieldName);
          if (!payloadKey) {
            throw new Error(`Campo no soportado para guardado: ${safeFieldName}`);
          }

          let payload = { [payloadKey]: normalizedValue };
          let zipLocation = null;
          let zipLookupWarning = '';

          if (safeFieldName === 'zip_code' && normalizedValue) {
            try {
              zipLocation = await lookupZipLocation(normalizedValue);
            } catch (lookupError) {
              zipLookupWarning = lookupError?.message || 'No se pudo autocompletar ciudad/estado para ese ZIP.';
            }
            if (zipLocation) {
              payload = {
                ...payload,
                city: zipLocation.city,
                state: zipLocation.stateCode
              };
            }
          }

          const updatedLead = await patchLead(payload);
          if (updatedLead) {
            syncLeadDataState(updatedLead);
            const persistedValue = getLeadFieldValueForDisplay(updatedLead, safeFieldName);
            restoreField(persistedValue);
            if (safeFieldName === 'state') {
              updateStateBadge(updatedLead);
              updateLegalPlanStateHint();
            }
            if (safeFieldName === 'zip_code') {
              refreshStaticContactFields(updatedLead, ['zip_code', 'city', 'state']);
              updateStateBadge(updatedLead);
            }
          }

          if (safeFieldName === 'zip_code' && zipLocation) {
            showToast(`ZIP actualizado: ${zipLocation.city}, ${zipLocation.stateCode}`, 'success');
          } else {
            showToast('Campo actualizado', 'success');
          }
          if (safeFieldName === 'zip_code' && zipLookupWarning) {
            showToast(zipLookupWarning, 'info');
          }
        } catch (error) {
          console.error('Error al guardar campo editable:', error);
          restoreField(currentDisplayValue || EMPTY_FIELD_LABEL);
          showToast(error.message || 'No se pudo guardar el campo.', 'error');
        } finally {
          setElementSavingState(field, false);
        }
      }
      
      input.addEventListener('blur', saveEdit);
      input.addEventListener('input', () => {
        if (safeFieldName === 'home_phone' || safeFieldName === 'cell_phone') {
          input.value = formatPhoneValue(input.value);
          return;
        }
        if (safeFieldName === 'zip_code') {
          input.value = formatZipCodeValue(input.value);
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          input.blur();
        } else if (e.key === 'Escape') {
          wasCommitted = true;
          restoreField(currentDisplayValue || EMPTY_FIELD_LABEL);
        }
      });
    }
    
    // ============================================
    // CALENDARIO PARA DOB
    // ============================================
    
    let dobCalendarDate = new Date();
    let selectedDOB = null;
    
    function initDOBCalendar() {
      const dobTrigger = document.getElementById('dobTrigger');
      const dobCalendar = document.getElementById('dobCalendar');
      const prevBtn = document.getElementById('dobCalendarPrev');
      const nextBtn = document.getElementById('dobCalendarNext');
      const monthYearEl = document.getElementById('dobCalendarMonthYear');
      const daysContainer = document.getElementById('dobCalendarDays');
      
      if (!dobTrigger || !dobCalendar || !prevBtn || !nextBtn || !monthYearEl || !daysContainer) return;

      selectedDOB = isApplicant ? applicantData.dob : coApplicantData.dob;
      const parsedSelectedDOB = toCalendarDate(selectedDOB);
      if (parsedSelectedDOB) {
        dobCalendarDate = new Date(parsedSelectedDOB.getFullYear(), parsedSelectedDOB.getMonth(), 1);
      }

      dobCalendarController = createUnifiedCalendarController({
        triggerEl: dobTrigger,
        calendarEl: dobCalendar,
        prevBtn,
        nextBtn,
        monthYearEl,
        daysContainer,
        getViewDate: () => dobCalendarDate,
        setViewDate: (date) => {
          dobCalendarDate = new Date(date.getFullYear(), date.getMonth(), 1);
        },
        getSelectedIsoDate: () => selectedDOB,
        showToday: false,
        closeOnSelect: true,
        rerenderAfterSelect: true,
        syncViewToSelectedOnOpen: true,
        isDateDisabled: (dateObj) => {
          const today = new Date();
          const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          return dateObj > todayOnly;
        },
        onSelectDate: async ({ dayEl, isoDate }) => {
          if (dayEl.dataset.saving === 'true') return false;

          const previousDOB = selectedDOB;
          try {
            setElementSavingState(dayEl, true);
            const payloadKey = resolvePayloadKeyForParty('dob');
            const updatedLead = await patchLead({ [payloadKey]: isoDate });
            syncLeadDataState(updatedLead);
            selectedDOB = isApplicant ? applicantData.dob : coApplicantData.dob;
            if (!selectedDOB) selectedDOB = isoDate;
            document.getElementById('dobValue').textContent = formatDateEs(selectedDOB);
            showToast('Fecha de nacimiento actualizada', 'success');
            return true;
          } catch (error) {
            selectedDOB = previousDOB;
            showToast(error.message || 'No se pudo guardar la fecha de nacimiento.', 'error');
            return false;
          } finally {
            setElementSavingState(dayEl, false);
          }
        }
      });
    }
    
    function renderDOBCalendar() {
      if (dobCalendarController) {
        dobCalendarController.render();
      }
    }

    // ============================================
    // TOGGLE SELF EMPLOYED
    // ============================================
    
    // ============================================
    // CALCULATOR LOGIC - REDESIGNED
    // ============================================
    
    const DEFAULT_CALC_CONFIG = Object.freeze({
      totalDebt: 0,
      settlementPercent: 0,
      programFeePercent: 0,
      bankFee: 0,
      months: 48,
      legalPlanEnabled: false
    });

    let suppressCalculatorAutoSave = false;
    let calcConfigPersistTimer = null;
    let lastSavedCalcConfigSignature = '';
    let calculatorInitialized = false;
    let currentMonths = 48;
    let calcPaymentDayCalendarDate = new Date();
    let selectedCalcPaymentDay = null;

    function formatFixedNumber(value, decimals = 2) {
      const normalized = Number(value);
      if (!Number.isFinite(normalized)) return (0).toFixed(decimals);
      return normalized.toFixed(decimals);
    }

    function normalizeCalcConfig(config) {
      const totalDebt = Number(config?.totalDebt ?? DEFAULT_CALC_CONFIG.totalDebt);
      const settlementPercent = Number(config?.settlementPercent ?? DEFAULT_CALC_CONFIG.settlementPercent);
      const programFeePercent = Number(config?.programFeePercent ?? DEFAULT_CALC_CONFIG.programFeePercent);
      const bankFee = Number(config?.bankFee ?? DEFAULT_CALC_CONFIG.bankFee);
      const months = Number(config?.months ?? DEFAULT_CALC_CONFIG.months);
      const legalPlanEnabled = Boolean(config?.legalPlanEnabled);

      return {
        totalDebt: Number.isFinite(totalDebt) && totalDebt >= 0 ? Number(totalDebt.toFixed(2)) : DEFAULT_CALC_CONFIG.totalDebt,
        settlementPercent: Number.isFinite(settlementPercent) ? Math.min(100, Math.max(0, Number(settlementPercent.toFixed(2)))) : DEFAULT_CALC_CONFIG.settlementPercent,
        programFeePercent: Number.isFinite(programFeePercent) ? Math.min(100, Math.max(0, Number(programFeePercent.toFixed(2)))) : DEFAULT_CALC_CONFIG.programFeePercent,
        bankFee: Number.isFinite(bankFee) && bankFee >= 0 ? Number(bankFee.toFixed(2)) : DEFAULT_CALC_CONFIG.bankFee,
        months: Number.isInteger(months) ? Math.min(120, Math.max(6, months)) : DEFAULT_CALC_CONFIG.months,
        legalPlanEnabled
      };
    }

    function getLeadStateType(lead = currentLeadData) {
      return String(lead?.state_type || '').trim();
    }

    function getStateBasedDefaultLegalPlan(lead = currentLeadData) {
      return getLeadStateType(lead) === 'Green';
    }

    function readCalcConfigFromLead(lead) {
      const legalPlanFromLead = lead?.calc_legal_plan_enabled;
      return normalizeCalcConfig({
        totalDebt: lead?.calc_total_debt,
        settlementPercent: lead?.calc_settlement_percent,
        programFeePercent: lead?.calc_program_fee_percent,
        bankFee: lead?.calc_bank_fee,
        months: lead?.calc_months,
        legalPlanEnabled: legalPlanFromLead === undefined || legalPlanFromLead === null
          ? getStateBasedDefaultLegalPlan(lead)
          : Boolean(legalPlanFromLead)
      });
    }

    function getCalcConfigSignature(config) {
      const normalized = normalizeCalcConfig(config);
      return [
        normalized.totalDebt.toFixed(2),
        normalized.settlementPercent.toFixed(2),
        normalized.programFeePercent.toFixed(2),
        normalized.bankFee.toFixed(2),
        String(normalized.months),
        normalized.legalPlanEnabled ? '1' : '0'
      ].join('|');
    }

    function readCalcConfigFromUI() {
      const totalDebtInput = document.getElementById('calcTotalDebt');
      const settlementInput = document.getElementById('calcSettlementPercent');
      const programFeeInput = document.getElementById('calcProgramFeePercent');
      const bankFeeInput = document.getElementById('calcBankFee');
      const legalSwitch = document.getElementById('calcLegalPlanSwitch');

      return normalizeCalcConfig({
        totalDebt: parseCurrency(totalDebtInput?.value),
        settlementPercent: parsePercent(settlementInput?.value),
        programFeePercent: parsePercent(programFeeInput?.value),
        bankFee: parseCurrency(bankFeeInput?.value),
        months: currentMonths,
        legalPlanEnabled: legalSwitch?.classList.contains('active')
      });
    }

    function getCalcConfigPatchPayload(config) {
      const normalized = normalizeCalcConfig(config);
      return {
        calcTotalDebt: normalized.totalDebt,
        calcSettlementPercent: normalized.settlementPercent,
        calcProgramFeePercent: normalized.programFeePercent,
        calcBankFee: normalized.bankFee,
        calcMonths: normalized.months,
        calcLegalPlanEnabled: normalized.legalPlanEnabled
      };
    }

    function syncCalcConfigSnapshotFromLead(lead) {
      lastSavedCalcConfigSignature = getCalcConfigSignature(readCalcConfigFromLead(lead));
    }

    function updateLegalPlanStateHint() {
      const hint = document.getElementById('calcLegalPlanStateHint');
      const legalSwitch = document.getElementById('calcLegalPlanSwitch');
      if (!hint || !legalSwitch) return;

      const isActive = legalSwitch.classList.contains('active');
      const stateType = getLeadStateType();

      let html = '';
      if (stateType === 'Red' && isActive) {
        html = 'Activando Legal Plan en <span class="calc-legal-state-word red">RedState</span>.';
      } else if (stateType === 'Green' && !isActive) {
        html = 'Desactivando Legal Plan en <span class="calc-legal-state-word green">GreenState</span>.';
      }

      if (html) {
        hint.innerHTML = html;
        hint.classList.remove('hidden');
      } else {
        hint.classList.add('hidden');
        hint.textContent = '';
      }
    }

    function applyCalculatorConfigToUI(config) {
      const normalized = normalizeCalcConfig(config);
      const totalDebtInput = document.getElementById('calcTotalDebt');
      const settlementInput = document.getElementById('calcSettlementPercent');
      const programFeeInput = document.getElementById('calcProgramFeePercent');
      const bankFeeInput = document.getElementById('calcBankFee');
      const hiddenMonths = document.getElementById('calcMonths');
      const legalSwitch = document.getElementById('calcLegalPlanSwitch');

      if (totalDebtInput) totalDebtInput.value = formatFixedNumber(normalized.totalDebt, 2);
      if (settlementInput) settlementInput.value = formatFixedNumber(normalized.settlementPercent, 2).replace(/\.00$/, '');
      if (programFeeInput) programFeeInput.value = formatFixedNumber(normalized.programFeePercent, 2).replace(/\.00$/, '');
      if (bankFeeInput) bankFeeInput.value = formatFixedNumber(normalized.bankFee, 2);
      if (hiddenMonths) hiddenMonths.value = String(normalized.months);

      currentMonths = normalized.months;
      if (legalSwitch) {
        legalSwitch.classList.toggle('active', normalized.legalPlanEnabled);
      }
      updateLegalPlanStateHint();
    }

    async function persistCalculatorConfigNow() {
      if (suppressCalculatorAutoSave || !currentLeadId) return;
      const config = readCalcConfigFromUI();
      const signature = getCalcConfigSignature(config);
      if (signature === lastSavedCalcConfigSignature) return;

      try {
        const updatedLead = await patchLead(getCalcConfigPatchPayload(config));
        if (updatedLead) {
          syncLeadDataState(updatedLead);
          syncCalcConfigSnapshotFromLead(updatedLead);
          updateLegalPlanStateHint();
        } else {
          lastSavedCalcConfigSignature = signature;
        }
      } catch (error) {
        console.error('Error al guardar configuracion de calculadora:', error);
        showToast('No se pudo sincronizar la calculadora.', 'error');
      }
    }

    function queuePersistCalculatorConfig() {
      if (suppressCalculatorAutoSave || !currentLeadId) return;
      if (calcConfigPersistTimer) clearTimeout(calcConfigPersistTimer);
      calcConfigPersistTimer = setTimeout(() => {
        persistCalculatorConfigNow();
      }, 400);
    }

    function hydrateCalculatorFromLead(lead) {
      suppressCalculatorAutoSave = true;
      applyCalculatorConfigToUI(readCalcConfigFromLead(lead));
      syncCalcConfigSnapshotFromLead(lead);
      suppressCalculatorAutoSave = false;
    }
    
    function initCalculator() {
      if (calculatorInitialized) {
        updateLegalPlanStateHint();
        calculateAll();
        return;
      }
      
      calculatorInitialized = true;
      
      // Todos los inputs de configuración
      const configInputs = [
        'calcTotalDebt',
        'calcSettlementPercent',
        'calcProgramFeePercent',
        'calcBankFee'
      ];
      configInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
          input.addEventListener('input', debounce(calculateAll, 300));
          input.addEventListener('change', calculateAll);
        }
      });
      
      // Campos protegidos con doble-click
      initProtectedFields();
      
      // Toggle Legal Plan
      const legalToggle = document.getElementById('calcLegalPlanToggle');
      if (legalToggle) {
        legalToggle.addEventListener('click', () => {
          const switchEl = document.getElementById('calcLegalPlanSwitch');
          switchEl.classList.toggle('active');
          updateLegalPlanStateHint();
          calculateAll();
        });
      }
      // Selector de primer deposito (monthly payment day)
      initCalcPaymentDayCalendar();

      // Control de meses (wheel + botones rapidos)
      initMonthsControl();

      // Click para copiar Total Debt
      const copyTotalDebt = document.getElementById('copyTotalDebt');
      if (copyTotalDebt) {
        copyTotalDebt.addEventListener('click', () => {
          const value = document.getElementById('calcTotalDebt').value;
          const formattedValue = '$' + value;
          navigator.clipboard.writeText(formattedValue).then(() => {
            copyTotalDebt.classList.add('copied');
            showToast('Total Debt copiado: ' + formattedValue, 'success');
            setTimeout(() => copyTotalDebt.classList.remove('copied'), 1000);
          });
        });
      }
      
      // Click para copiar Monthly Payment (formato: "meses $monto")
      const copyMonthlyPayment = document.getElementById('copyMonthlyPayment');
      if (copyMonthlyPayment) {
        copyMonthlyPayment.addEventListener('click', () => {
          const months = currentMonths;
          const amount = document.getElementById('resultMonthlyPayment').textContent;
          const textToCopy = months + ' ' + amount;
          navigator.clipboard.writeText(textToCopy).then(() => {
            copyMonthlyPayment.classList.add('copied');
            showToast('Copiado: ' + textToCopy, 'success');
            setTimeout(() => copyMonthlyPayment.classList.remove('copied'), 1000);
          });
        });
      }
      
      // Calcular inicial
      updateLegalPlanStateHint();
      calculateAll();
    }
    

    function initProtectedFields() {
      const lockButtons = document.querySelectorAll('.lock-toggle-btn');
      
      lockButtons.forEach(btn => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        const lockedIcon = btn.querySelector('.lock-icon-svg.locked');
        const unlockedIcon = btn.querySelector('.lock-icon-svg.unlocked');
        
        if (!input) return;
        
        // Click en el candado para toggle
        btn.addEventListener('click', () => {
          const isLocked = input.readOnly;
          
          if (isLocked) {
            // Desbloquear
            input.readOnly = false;
            btn.classList.add('unlocked');
            lockedIcon.classList.add('hidden');
            unlockedIcon.classList.remove('hidden');
            btn.title = 'Click para bloquear';
            input.focus();
            input.select();
            showToast('Campo desbloqueado', 'info');
          } else {
            // Bloquear
            input.readOnly = true;
            btn.classList.remove('unlocked');
            lockedIcon.classList.remove('hidden');
            unlockedIcon.classList.add('hidden');
            btn.title = 'Click para desbloquear';
            calculateAll();
            showToast('Campo bloqueado', 'success');
          }
        });
        
        // Guardar al perder foco si está desbloqueado
        input.addEventListener('blur', () => {
          if (!input.readOnly) {
            // Auto-bloquear al salir
            input.readOnly = true;
            btn.classList.remove('unlocked');
            lockedIcon.classList.remove('hidden');
            unlockedIcon.classList.add('hidden');
            btn.title = 'Click para desbloquear';
            calculateAll();
          }
        });
        
        // Teclas
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            input.blur();
          } else if (e.key === 'Escape') {
            input.value = input.defaultValue;
            input.blur();
          }
        });
      });
    }
    
    function initMonthsControl() {
      const MIN_MONTHS = 6;
      const MAX_MONTHS = 120;
      const ITEM_WIDTH = 58;
      const hiddenInput = document.getElementById('calcMonths');
      const wheel = document.getElementById('monthsInlineWheel');
      const wheelTrack = document.getElementById('monthsWheelTrackInline');

      if (!wheel || !wheelTrack || !hiddenInput) return;

      const initialMonths = parseInt(hiddenInput.value, 10);
      if (Number.isFinite(initialMonths)) {
        currentMonths = Math.max(MIN_MONTHS, Math.min(MAX_MONTHS, initialMonths));
      }

      let items = [];
      let isDragging = false;
      let dragPointerId = null;
      let dragStartX = 0;
      let dragStartValue = currentMonths;
      let dragMoved = false;
      let suppressClickUntil = 0;

      function clampMonths(value) {
        return Math.max(MIN_MONTHS, Math.min(MAX_MONTHS, value));
      }

      function syncQuickButtons() {
        document.querySelectorAll('.months-quick-btn.minimal').forEach(btn => {
          btn.classList.toggle('active', parseInt(btn.dataset.months, 10) === currentMonths);
        });
      }
      
      function monthsToText(months) {
        const years = Math.floor(months / 12);
        const remainingMonths = months % 12;
        
        if (years === 0) {
          return remainingMonths === 1 ? '1 mes' : `${remainingMonths} meses`;
        } else if (remainingMonths === 0) {
          return years === 1 ? '1 año' : `${years} años`;
        } else {
          const yearText = years === 1 ? '1 año' : `${years} años`;
          const monthText = remainingMonths === 1 ? '1 mes' : `${remainingMonths} meses`;
          return `${yearText} y ${monthText}`;
        }
      }
      
      function updatePlanText() {
        const planText = document.getElementById('planDurationText');
        if (planText) {
          planText.textContent = monthsToText(currentMonths);
        }
      }

      function syncWheelA11y() {
        wheel.setAttribute('aria-valuenow', String(currentMonths));
        wheel.setAttribute('aria-valuetext', `${currentMonths} months`);
      }

      function updateMonths(value, animate = false, shouldCalculate = true) {
        currentMonths = Math.round(clampMonths(value));
        hiddenInput.value = currentMonths;
        syncQuickButtons();
        syncWheelA11y();
        updatePlanText();
        updateWheelPosition(currentMonths, animate);

        if (shouldCalculate) {
          calculateAll();
        }
      }

      function setDraggedMonths(value) {
        const snappedValue = Math.round(clampMonths(value));
        if (snappedValue === currentMonths) return;

        currentMonths = snappedValue;
        hiddenInput.value = currentMonths;
        syncQuickButtons();
        syncWheelA11y();
        updatePlanText();
        calculateAll();
      }

      function generateWheelItems() {
        let wheelHTML = '';
        for (let i = MIN_MONTHS; i <= MAX_MONTHS; i++) {
          wheelHTML += `<div class="months-wheel-item-inline" data-months="${i}">${i}</div>`;
        }
        wheelTrack.innerHTML = wheelHTML;
        items = Array.from(wheelTrack.querySelectorAll('.months-wheel-item-inline'));

        items.forEach(item => {
          item.addEventListener('click', () => {
            if (Date.now() < suppressClickUntil) return;
            const months = parseInt(item.dataset.months, 10);
            if (Number.isFinite(months)) {
              updateMonths(months, true);
            }
          });
        });
      }
      generateWheelItems();

      function updateWheelPosition(monthsValue, animate = false) {
        const clampedValue = clampMonths(monthsValue);
        const index = clampedValue - MIN_MONTHS;
        const centerOffset = (wheel.clientWidth - ITEM_WIDTH) / 2;
        const offset = centerOffset - (index * ITEM_WIDTH);

        if (animate) {
          wheelTrack.style.transition = 'transform 0.22s cubic-bezier(0.22, 0.75, 0.28, 1)';
        } else {
          wheelTrack.style.transition = 'none';
        }

        wheelTrack.style.transform = `translateX(${offset}px)`;

        const nearestIndex = Math.round(index);
        items.forEach((item, idx) => {
          item.classList.remove('active', 'near');
          if (idx === nearestIndex) {
            item.classList.add('active');
          } else if (Math.abs(idx - nearestIndex) <= 1) {
            item.classList.add('near');
          }

          const signedDistance = idx - index;
          const absDistance = Math.abs(signedDistance);
          const rotate = Math.max(-70, Math.min(70, -signedDistance * 18));
          const scale = Math.max(0.56, 1 - absDistance * 0.16);
          const opacity = Math.max(0.08, 1 - absDistance * 0.22);
          const blur = Math.max(0, absDistance - 0.15) * 0.32;

          item.style.transform = `rotateY(${rotate.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
          item.style.opacity = opacity.toFixed(3);
          item.style.filter = `blur(${blur.toFixed(2)}px)`;
        });
      }

      function endDrag(pointerId) {
        if (!isDragging || pointerId !== dragPointerId) return;

        isDragging = false;
        dragPointerId = null;
        wheel.classList.remove('dragging');
        if (dragMoved) {
          suppressClickUntil = Date.now() + 120;
        }
        dragMoved = false;
        updateMonths(currentMonths, true, false);
      }

      wheel.addEventListener('pointerdown', (e) => {
        if (typeof e.button === 'number' && e.button !== 0) return;

        isDragging = true;
        dragPointerId = e.pointerId;
        dragStartX = e.clientX;
        dragStartValue = currentMonths;
        dragMoved = false;
        wheel.classList.add('dragging');

        if (wheel.setPointerCapture) {
          wheel.setPointerCapture(dragPointerId);
        }

        e.preventDefault();
      });

      wheel.addEventListener('pointermove', (e) => {
        if (!isDragging || e.pointerId !== dragPointerId) return;

        const deltaX = dragStartX - e.clientX;
        if (Math.abs(deltaX) > 2) {
          dragMoved = true;
        }

        const liveValue = clampMonths(dragStartValue + (deltaX / ITEM_WIDTH));
        setDraggedMonths(liveValue);
        updateWheelPosition(liveValue, false);
        e.preventDefault();
      });

      wheel.addEventListener('pointerup', (e) => {
        endDrag(e.pointerId);
      });

      wheel.addEventListener('pointercancel', (e) => {
        endDrag(e.pointerId);
      });

      wheel.addEventListener('lostpointercapture', () => {
        if (isDragging) {
          endDrag(dragPointerId);
        }
      });

      wheel.addEventListener('wheel', (e) => {
        e.preventDefault();
        const dominantAxis = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        const step = Math.abs(dominantAxis) > 40 ? 2 : 1;
        const delta = dominantAxis > 0 ? step : -step;
        updateMonths(currentMonths + delta, true);
      }, { passive: false });

      wheel.addEventListener('keydown', (e) => {
        let nextValue = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') nextValue = currentMonths + 1;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') nextValue = currentMonths - 1;
        if (e.key === 'PageUp') nextValue = currentMonths + 6;
        if (e.key === 'PageDown') nextValue = currentMonths - 6;
        if (e.key === 'Home') nextValue = MIN_MONTHS;
        if (e.key === 'End') nextValue = MAX_MONTHS;

        if (nextValue === null) return;
        e.preventDefault();
        updateMonths(nextValue, true);
      });

      document.querySelectorAll('.months-quick-btn.minimal').forEach(btn => {
        btn.addEventListener('click', () => {
          const months = parseInt(btn.dataset.months, 10);
          if (Number.isFinite(months)) {
            updateMonths(months, true);
          }
        });
      });

      updateMonths(currentMonths, false, false);
    }

    function formatISODate(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    function parseISODate(value) {
      if (!value) return null;

      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
      }

      const raw = String(value).trim();
      if (!raw) return null;

      // Acepta "YYYY-MM-DD" y tambien "YYYY-MM-DDTHH:mm:ss.sssZ"
      const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
      if (!match) return null;

      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const parsed = new Date(year, month - 1, day);

      if (
        parsed.getFullYear() !== year ||
        parsed.getMonth() !== month - 1 ||
        parsed.getDate() !== day
      ) {
        return null;
      }

      return parsed;
    }

    function formatCalcPaymentDayDisplay(isoDate) {
      const parsed = parseISODate(isoDate);
      if (!parsed) return 'Seleccionar fecha';
      return parsed.toLocaleDateString('es-ES');
    }

    function getCalcFirstDepositStorageKey() {
      if (!currentLeadId) return null;
      return `lead_calc_first_deposit_${currentLeadId}`;
    }

    function loadPersistedCalcFirstDepositDate() {
      const storageKey = getCalcFirstDepositStorageKey();
      if (!storageKey) return null;

      const savedValue = localStorage.getItem(storageKey);
      const parsedDate = parseISODate(savedValue);

      if (!parsedDate && savedValue) {
        localStorage.removeItem(storageKey);
      }

      return parsedDate ? formatISODate(parsedDate) : null;
    }

    async function persistCalcFirstDepositDateToBackend(isoDate) {
      if (!currentLeadId) return;

      try {
        const response = await fetch(`/api/leads/${currentLeadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstDepositDate: isoDate })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        console.error('Error al guardar firstDepositDate en backend:', error);
        showToast('No se pudo sincronizar la fecha en el servidor', 'info');
      }
    }

    function persistCalcFirstDepositDate(isoDate, options = {}) {
      const { saveToBackend = true } = options;
      const storageKey = getCalcFirstDepositStorageKey();
      if (!storageKey) return;

      const parsedDate = parseISODate(isoDate);
      if (!parsedDate) {
        localStorage.removeItem(storageKey);
        if (saveToBackend) {
          persistCalcFirstDepositDateToBackend(null);
        }
        return;
      }

      const normalizedDate = formatISODate(parsedDate);
      localStorage.setItem(storageKey, normalizedDate);

      if (saveToBackend) {
        persistCalcFirstDepositDateToBackend(normalizedDate);
      }
    }

    function addMonthsWithDayClamp(baseDate, monthsToAdd, preferredDay = baseDate.getDate()) {
      const targetMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + monthsToAdd, 1);
      const lastDayOfMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate();
      const safeDay = Math.min(preferredDay, lastDayOfMonth);
      return new Date(targetMonth.getFullYear(), targetMonth.getMonth(), safeDay);
    }

    function initCalcPaymentDayCalendar() {
      const trigger = document.getElementById('calcPaymentDayTrigger');
      const calendarEl = document.getElementById('calcPaymentDayCalendar');
      const prevBtn = document.getElementById('calcPaymentDayPrev');
      const nextBtn = document.getElementById('calcPaymentDayNext');
      const monthYearEl = document.getElementById('calcPaymentDayMonthYear');
      const daysContainer = document.getElementById('calcPaymentDayDays');
      const hiddenInput = document.getElementById('calcFirstDepositDate');
      const displayEl = document.getElementById('calcPaymentDayDisplay');

      if (!trigger || !calendarEl || !prevBtn || !nextBtn || !monthYearEl || !daysContainer || !hiddenInput || !displayEl) return;

      const persistedDate = loadPersistedCalcFirstDepositDate();
      const initialDate = parseISODate(hiddenInput.value) || parseISODate(persistedDate);
      if (initialDate) {
        const normalizedDate = formatISODate(initialDate);
        selectedCalcPaymentDay = normalizedDate;
        calcPaymentDayCalendarDate = new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
        hiddenInput.value = normalizedDate;
        displayEl.textContent = formatCalcPaymentDayDisplay(normalizedDate);
      } else {
        selectedCalcPaymentDay = null;
        calcPaymentDayCalendarDate = new Date();
        hiddenInput.value = '';
        displayEl.textContent = 'Seleccionar fecha';
      }

      calcPaymentDayCalendarController = createUnifiedCalendarController({
        triggerEl: trigger,
        calendarEl,
        prevBtn,
        nextBtn,
        monthYearEl,
        daysContainer,
        getViewDate: () => calcPaymentDayCalendarDate,
        setViewDate: (date) => {
          calcPaymentDayCalendarDate = new Date(date.getFullYear(), date.getMonth(), 1);
        },
        getSelectedIsoDate: () => selectedCalcPaymentDay,
        showToday: true,
        closeOnSelect: true,
        rerenderAfterSelect: false,
        syncViewToSelectedOnOpen: true,
        onSelectDate: ({ isoDate }) => {
          selectedCalcPaymentDay = isoDate;
          hiddenInput.value = isoDate;
          persistCalcFirstDepositDate(isoDate, { saveToBackend: true });
          displayEl.textContent = formatCalcPaymentDayDisplay(isoDate);
          calculateAll();
          showToast(`Primer deposito: ${formatCalcPaymentDayDisplay(isoDate)}`, 'success');
          return true;
        }
      });
    }

    function renderCalcPaymentDayCalendar() {
      if (calcPaymentDayCalendarController) {
        calcPaymentDayCalendarController.render();
      }
    }

    function calculateAll() {
      // Obtener valores
      const totalDebt = parseCurrency(document.getElementById('calcTotalDebt').value);
      const settlementPercent = parsePercent(document.getElementById('calcSettlementPercent').value);
      const programFeePercent = parsePercent(document.getElementById('calcProgramFeePercent').value);
      const monthlyBankFee = parseCurrency(document.getElementById('calcBankFee').value);
      const months = currentMonths;
      const hasLegalPlan = document.getElementById('calcLegalPlanSwitch').classList.contains('active');
      
      // Cálculos principales
      const estimatedSettlement = totalDebt * (settlementPercent / 100);
      const programFees = totalDebt * (programFeePercent / 100);
      
      // Legal fees: $24.99 mensuales si tiene plan legal
      const monthlyLegalFee = hasLegalPlan ? 24.99 : 0;
      const totalLegalFees = monthlyLegalFee * months;
      
      // Bank fees: mensual x número de meses
      const totalBankFees = monthlyBankFee * months;
      
      // Total del programa
      const totalProgram = estimatedSettlement + programFees + totalLegalFees + totalBankFees;
      
      // Pago mensual
      const monthlyPayment = totalProgram / months;
      
      // Ahorros (comparando con pagar la deuda completa)
      const totalSavings = totalDebt - estimatedSettlement;
      const monthlySavings = totalSavings / months;
      
      // Actualizar resultados en UI
      document.getElementById('resultSettlement').textContent = formatCurrency(estimatedSettlement);
      document.getElementById('resultProgramFees').textContent = formatCurrency(programFees);
      document.getElementById('resultLegalFees').textContent = formatCurrency(totalLegalFees);
      document.getElementById('resultBankFees').textContent = formatCurrency(totalBankFees);
      document.getElementById('resultMonthlyPayment').textContent = formatCurrency(monthlyPayment);
      document.getElementById('resultTotalProgram').textContent = formatCurrency(totalProgram);
      document.getElementById('resultSavings').textContent = formatCurrency(totalSavings);
      
      // Generar tabla de pagos
      generatePaymentSchedule(months, monthlyPayment, monthlyLegalFee, monthlyBankFee, monthlySavings);
      queuePersistCalculatorConfig();
    }
    
    function generatePaymentSchedule(months, monthlyPayment, monthlyLegalFee, monthlyBankFee, monthlySavings) {
      const tbody = document.getElementById('scheduleTableBody');
      if (!tbody) return;
      
      let html = '';
      const selectedDateValue = document.getElementById('calcFirstDepositDate')?.value || '';
      const selectedStartDate = parseISODate(selectedDateValue);
      const baseDate = selectedStartDate || new Date();
      const firstMonthOffset = selectedStartDate ? 0 : 1;
      const paymentDay = baseDate.getDate();
      
      for (let i = 1; i <= Math.min(months, 48); i++) {
        const paymentDate = addMonthsWithDayClamp(baseDate, (i - 1) + firstMonthOffset, paymentDay);
        
        const dateStr = paymentDate.toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric'
        });
        
        html += `
          <tr>
            <td>${i}</td>
            <td>${dateStr}</td>
            <td class="mono">${formatCurrency(monthlyPayment)}</td>
            <td class="mono">${formatCurrency(monthlyLegalFee)}</td>
            <td class="mono">${formatCurrency(monthlyBankFee)}</td>
            <td class="mono savings">${formatCurrency(monthlySavings)}</td>
          </tr>
        `;
      }
      
      // Si hay más de 48 meses, agregar indicador de truncamiento
      if (months > 48) {
        html += `
          <tr>
            <td colspan="6" style="text-align:center;color:rgba(255,255,255,0.5);padding:12px;">
              ... y ${months - 48} pagos más
            </td>
          </tr>
        `;
      }
      
      tbody.innerHTML = html;
    }
    
    // Helpers para la calculadora
    function parseCurrency(value) {
      if (!value) return 0;
      return parseFloat(value.toString().replace(/[^0-9.-]/g, '')) || 0;
    }
    
    function parsePercent(value) {
      if (!value) return 0;
      return parseFloat(value.toString().replace(/[^0-9.-]/g, '')) || 0;
    }
    
    function formatCurrency(value) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(value);
    }
    
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
    
    function initSelfEmployedToggle() {
      const toggle = document.getElementById('selfEmployedToggle');
      if (!toggle) return;
      
      const label = toggle.closest('.self-employed-toggle').querySelector('.self-employed-label');
      refreshPartyContactView();
      let syncing = false;
      
      toggle.addEventListener('change', async () => {
        if (syncing) return;
        const previousValue = !toggle.checked;

        try {
          syncing = true;
          toggle.disabled = true;
          label.textContent = toggle.checked ? 'Si' : 'No';
          const payloadKey = resolvePayloadKeyForParty('self_employed');
          const updatedLead = await patchLead({ [payloadKey]: toggle.checked });
          if (updatedLead) {
            syncLeadDataState(updatedLead);
          }
          showToast(`Self Employed: ${toggle.checked ? 'Si' : 'No'}`, 'success');
        } catch (error) {
          toggle.checked = previousValue;
          label.textContent = previousValue ? 'Si' : 'No';
          showToast(error.message || 'No se pudo actualizar Self Employed.', 'error');
        } finally {
          toggle.disabled = false;
          syncing = false;
        }
      });
    }
    
    // ============================================
    // NAVEGACIÓN DE PESTAÑAS
    // ============================================
    
    const ACTIVE_TAB_KEY = 'lead_active_tab';
    
    function initLeadTabs() {
      const tabs = document.querySelectorAll('.lead-tab');
      
      // Secciones
      const sections = {
        'lead': document.getElementById('leadSection'),
        'banking': document.getElementById('bankingSection'),
        'calculator': document.getElementById('calculatorSection'),
        'budget': document.getElementById('budgetSection'),
        'creditors': document.getElementById('creditorsSection')
      };
      
      // Función para activar una pestaña
      function activateTab(tabName) {
        // Remover clase active de todas las pestañas
        tabs.forEach(t => t.classList.remove('active'));
        
        // Agregar clase active a la pestaña seleccionada
        const activeTab = document.querySelector(`.lead-tab[data-tab="${tabName}"]`);
        if (activeTab) activeTab.classList.add('active');
        
        // Ocultar todas las secciones
        Object.values(sections).forEach(section => {
          if (section) section.classList.add('hidden');
        });
        
        // Mostrar la sección seleccionada
        if (sections[tabName]) {
          sections[tabName].classList.remove('hidden');
        }
        
        // Guardar en localStorage
        localStorage.setItem(ACTIVE_TAB_KEY, tabName);
        
        // Inicializar calculadora si es la pestaña de calculator
        if (tabName === 'calculator') {
          initCalculator();
        }
      }
      
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const tabName = tab.dataset.tab;
          console.log('Cambiando a pestaña:', tabName);
          activateTab(tabName);
        });
      });
      
      // Prioridad 1: parámetro URL (?tab=lead|banking|calculator|budget|creditors)
      const urlTab = String(new URLSearchParams(window.location.search).get('tab') || '').trim().toLowerCase();
      if (urlTab && sections[urlTab]) {
        activateTab(urlTab);
        return;
      }

      // Prioridad 2: restaurar pestaña activa al cargar
      const savedTab = localStorage.getItem(ACTIVE_TAB_KEY);
      if (savedTab && sections[savedTab]) {
        activateTab(savedTab);
      }
    }
    
    function renderCalendar() {
      if (callbackCalendarController) {
        callbackCalendarController.render();
      }
    }

    // ============================================
    // NOTIFICACIONES DE CALLBACK
    // ============================================
    function getAllCallbacks() {
      const callbacks = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('lead_callback_') && !key.includes('_name_')) {
          const leadId = key.replace('lead_callback_', '');
          const date = localStorage.getItem(key);
          const name = localStorage.getItem(`lead_callback_name_${leadId}`) || `Lead #${leadId}`;
          if (date) {
            callbacks.push({ leadId, date, name });
          }
        }
      }
      return callbacks.sort((a, b) => new Date(a.date) - new Date(b.date));
    }
    
    function updateNotificationBadge() {
      const callbacks = getAllCallbacks();
      const today = new Date().toISOString().split('T')[0];
      const todayCallbacks = callbacks.filter(cb => cb.date === today);
      
      // Buscar el botón de notificaciones en el toolbar
      const notifBtn = document.querySelector('.tool-btn[aria-label="Notificaciones"]');
      if (notifBtn) {
        // Remover badge anterior si existe
        const existingBadge = notifBtn.querySelector('.notif-badge');
        if (existingBadge) existingBadge.remove();
        
        // Agregar nuevo badge si hay callbacks para hoy
        if (todayCallbacks.length > 0) {
          const badge = document.createElement('span');
          badge.className = 'notif-badge';
          badge.textContent = todayCallbacks.length;
          badge.style.cssText = `
            position: absolute;
            top: -4px;
            right: -4px;
            background: #ef4444;
            color: white;
            font-size: 0.7rem;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 10px;
            min-width: 18px;
            text-align: center;
            box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
          `;
          notifBtn.style.position = 'relative';
          notifBtn.appendChild(badge);
        }
      }
    }
    
    function showCallbackNotifications() {
      const callbacks = getAllCallbacks();
      const today = new Date().toISOString().split('T')[0];
      const upcoming = callbacks.filter(cb => cb.date >= today);
      
      if (upcoming.length === 0) {
        showToast('No hay callbacks programados', 'info');
        return;
      }
      
      // Crear modal de notificaciones
      let notifModal = document.getElementById('callbackNotifModal');
      if (notifModal) notifModal.remove();
      
      notifModal = document.createElement('div');
      notifModal.id = 'callbackNotifModal';
      notifModal.className = 'notif-modal';
      notifModal.innerHTML = `
        <div class="notif-modal-backdrop"></div>
        <div class="notif-modal-content">
          <div class="notif-modal-header">
            <h3>Callbacks Programados</h3>
            <button class="notif-modal-close" onclick="this.closest('.notif-modal').remove()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="notif-modal-body">
            ${upcoming.map(cb => {
              const isToday = cb.date === today;
              const dateObj = new Date(cb.date);
              const dateStr = dateObj.toLocaleDateString('es-ES', { weekday: 'short', month: 'short', day: 'numeric' });
              return `
                <div class="notif-item ${isToday ? 'today' : ''}">
                  <div class="notif-item-pin">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                  </div>
                  <div class="notif-item-info">
                    <span class="notif-item-name">${escapeHtml(cb.name)}</span>
                    <span class="notif-item-date ${isToday ? 'today-badge' : ''}">${isToday ? 'HOY - ' : ''}${dateStr}</span>
                  </div>
                  <button class="notif-item-link" onclick="window.location.href='/client.html?id=${cb.leadId}'">
                    Ver
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
      
      document.body.appendChild(notifModal);
      
      // Cerrar al hacer click fuera
      notifModal.querySelector('.notif-modal-backdrop').addEventListener('click', () => {
        notifModal.remove();
      });
    }
    
    // Actualizar badge al cargar la página
    document.addEventListener('DOMContentLoaded', () => {
      updateNotificationBadge();
      
      // Conectar botón de notificaciones
      const notifBtn = document.querySelector('.tool-btn[aria-label="Notificaciones"]');
      if (notifBtn) {
        notifBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          showCallbackNotifications();
        });
      }
    });
    
    // ============================================
    // CARGAR DATOS DEL LEAD
    // ============================================
    async function loadLead() {
      const urlParams = new URLSearchParams(window.location.search);
      const leadId = urlParams.get('id');
      currentLeadId = leadId || null;
      
      if (!leadId) {
        document.getElementById('leadSection').innerHTML = `
          <div class="error">
            <h2>Error</h2>
            <p>No se especificó un ID de cliente.</p>
          </div>
        `;
        return;
      }
      
      try {
        const response = await fetch(`/api/leads/${leadId}`);
        if (!response.ok) throw new Error('Lead no encontrado');
        
        const data = await response.json();
        const lead = data.lead;

        const backendFirstDepositDate = parseISODate(lead.first_deposit_date);
        const firstDepositInput = document.getElementById('calcFirstDepositDate');
        const firstDepositDisplay = document.getElementById('calcPaymentDayDisplay');
        if (backendFirstDepositDate) {
          const normalizedFirstDepositDate = formatISODate(backendFirstDepositDate);
          if (firstDepositInput) firstDepositInput.value = normalizedFirstDepositDate;
          if (firstDepositDisplay) firstDepositDisplay.textContent = formatCalcPaymentDayDisplay(normalizedFirstDepositDate);
          persistCalcFirstDepositDate(normalizedFirstDepositDate, { saveToBackend: false });
        } else {
          if (firstDepositInput) firstDepositInput.value = '';
          if (firstDepositDisplay) firstDepositDisplay.textContent = 'Seleccionar fecha';
          persistCalcFirstDepositDate(null, { saveToBackend: false });
        }
        
        // Guardar valores originales
        syncLeadDataState(lead);
        prepareNotesForLead(lead.id);
        hydrateCalculatorFromLead(lead);
        caseIdValue = String(lead.case_id);
        selectedDOB = applicantData.dob;
        
        // Setear nombre (Applicant por defecto)
        if (leadNameEl) {
          leadNameEl.textContent = applicantData.fullName || lead.full_name;
        }
        
        // Setear Case ID
        if (caseNumberEl) {
          caseNumberEl.textContent = lead.case_id;
        }
        
        // Setear badge de estado (Green/Red)
        updateStateBadge(lead);
        
        // Badge de Test
        const testBadge = document.getElementById('testBadge');
        if (testBadge) {
          testBadge.classList.toggle('hidden', !lead.is_test);
        }

        await updateRelatedLeadBadge(lead);
        if (notesPanelOpen) {
          try {
            await loadLeadNotes({ force: true });
          } catch (error) {
            showToast(error.message || 'No se pudieron cargar las notas.', 'error');
          }
        }
        
        // Renderizar contenido
        document.getElementById('leadSection').innerHTML = `
          <!-- Card 1: Información de Contacto -->
          <div class="lead-info-card">
            <h3>Información de Contacto</h3>
            <div class="info-row">
              <span class="info-row-label">Home Phone</span>
              <span class="info-row-value editable mono" data-field="home_phone" data-copy="true" tabindex="0">${escapeHtml(getLeadFieldValueForDisplay(lead, 'home_phone'))}</span>
            </div>
            <div class="info-row">
              <span class="info-row-label">Cell Phone</span>
              <span class="info-row-value editable mono" data-field="cell_phone" data-copy="true" tabindex="0">${escapeHtml(getLeadFieldValueForDisplay(lead, 'cell_phone'))}</span>
            </div>
            <div class="info-row">
              <span class="info-row-label">DOB</span>
              <div class="dob-calendar-wrapper">
                <span class="info-row-value editable dob-calendar-trigger" data-field="dob" id="dobTrigger" tabindex="0">
                  <span id="dobValue">${selectedDOB ? formatDateEs(selectedDOB) : EMPTY_FIELD_LABEL}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </span>
                <div id="dobCalendar" class="custom-calendar dob-calendar hidden">
                  <div class="calendar-header">
                    <button id="dobCalendarPrev" class="calendar-nav">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"/>
                      </svg>
                    </button>
                    <span id="dobCalendarMonthYear" class="calendar-title"></span>
                    <button id="dobCalendarNext" class="calendar-nav">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                  </div>
                  <div class="calendar-weekdays">
                    <span>Dom</span><span>Lun</span><span>Mar</span><span>Mié</span>
                    <span>Jue</span><span>Vie</span><span>Sáb</span>
                  </div>
                  <div id="dobCalendarDays" class="calendar-days"></div>
                </div>
              </div>
            </div>
            <div class="info-row">
              <span class="info-row-label">Email</span>
              <span class="info-row-value editable" data-field="email" data-copy="true" tabindex="0">${escapeHtml(getLeadFieldValueForDisplay(lead, 'email'))}</span>
            </div>
            <div class="info-row">
              <span class="info-row-label">SSN / ITIN</span>
              <span class="info-row-value editable mono" data-field="ssn" data-copy="true" tabindex="0">${escapeHtml(getLeadFieldValueForDisplay(lead, 'ssn'))}</span>
            </div>
          </div>
          
          <!-- Card 2: Dirección & WC -->
          <div class="lead-info-card">
            <h3>DIRECCIÓN & WC</h3>
            <div class="info-row">
              <span class="info-row-label">Address Street</span>
              <span class="info-row-value editable" data-field="address_street" data-copy="true" tabindex="0">${escapeHtml(getLeadFieldValueForDisplay(lead, 'address_street'))}</span>
            </div>
            <div class="info-row">
              <span class="info-row-label">City</span>
              <span class="info-row-value editable" data-field="city" data-copy="true" tabindex="0">${escapeHtml(getLeadFieldValueForDisplay(lead, 'city'))}</span>
            </div>
            <div class="info-row">
              <span class="info-row-label">ZIP Code</span>
              <span class="info-row-value editable mono" data-field="zip_code" data-copy="true" tabindex="0">${escapeHtml(getLeadFieldValueForDisplay(lead, 'zip_code'))}</span>
            </div>
            <div class="info-row">
              <span class="info-row-label">State</span>
              <span class="info-row-value editable" data-field="state" data-copy="true" tabindex="0">${escapeHtml(getLeadFieldValueForDisplay(lead, 'state'))}</span>
            </div>
            <div class="info-row">
              <span class="info-row-label">Best time to call</span>
              <span class="info-row-value editable" data-field="best_time" data-copy="true" tabindex="0">${escapeHtml(getLeadFieldValueForDisplay(lead, 'best_time'))}</span>
            </div>
          </div>
          
          <!-- Card 3: Employment Details -->
          <div class="lead-info-card">
            <h3>EMPLOYMENT DETAILS</h3>
            <div class="info-row">
              <span class="info-row-label">Currently employed</span>
              <span class="info-row-value editable" data-field="currently_employed" tabindex="0">${escapeHtml(getLeadFieldValueForDisplay(lead, 'currently_employed'))}</span>
            </div>
            <div class="info-row">
              <span class="info-row-label">Employer name</span>
              <span class="info-row-value editable" data-field="employer_name" tabindex="0">${escapeHtml(getLeadFieldValueForDisplay(lead, 'employer_name'))}</span>
            </div>
            <div class="info-row">
              <span class="info-row-label">Occupation</span>
              <span class="info-row-value editable" data-field="occupation" tabindex="0">${escapeHtml(getLeadFieldValueForDisplay(lead, 'occupation'))}</span>
            </div>
            <div class="info-row">
              <span class="info-row-label">Self Employed</span>
              <label class="self-employed-toggle">
                <input type="checkbox" id="selfEmployedToggle" data-field="self_employed" ${lead.self_employed ? 'checked' : ''}>
                <span class="self-employed-switch">
                  <span class="self-employed-thumb"></span>
                </span>
                <span class="self-employed-label">${lead.self_employed ? 'Si' : 'No'}</span>
              </label>
            </div>
          </div>
          
          <!-- Card 2: Tiempos y Fechas (Expandido) -->
          <div class="lead-info-card lead-info-card-wide">
            <h3>Tiempos y Fechas</h3>
            <div class="two-column-layout">
              <!-- Columna Izquierda -->
              <div class="info-column">
                <div class="info-row">
                  <span class="info-row-label">Fecha de Creación</span>
                  <span class="info-row-value">${formatDateTimeEs(lead.created_at)}</span>
                </div>
                <div class="info-row">
                  <span class="info-row-label">Assigned Date</span>
                  <span class="info-row-value">${lead.assigned_to ? formatDateEs(lead.created_at) : 'Sin asignar'}</span>
                </div>
                <div class="info-row">
                  <span class="info-row-label">Close Date</span>
                  <span class="info-row-value" id="closeDateValue">${lead.status === 'Sent to Debt Manager' ? formatDateEs(lead.updated_at) : 'Pendiente'}</span>
                </div>
                <div class="info-row">
                  <span class="info-row-label">Días en Status</span>
                  <span class="info-row-value">${calculateDaysInStatus(lead.created_at)}</span>
                </div>
              </div>
              
              <!-- Columna Derecha -->
              <div class="info-column">
                <div class="info-row">
                  <span class="info-row-label">Last Credit Pull</span>
                  <span class="info-row-value">${formatDateEs(lead.created_at)}</span>
                </div>
                <div class="info-row">
                  <span class="info-row-label">Submitted Date</span>
                  <span class="info-row-value">${lead.status === 'Submitted to UW' ? formatDateEs(lead.updated_at) : 'N/A'}</span>
                </div>
                <div class="info-row callback-row">
                  <span class="info-row-label">Callback</span>
                  <div class="callback-wrapper">
                    <button id="callbackCalendarBtn" class="calendar-trigger liquid-glass-btn">
                      <span id="callbackDateDisplay">Seleccionar fecha</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                    </button>
                    <button id="callbackMacBtn" class="callback-mac-btn hidden" title="Eliminar callback"></button>
                    
                    <!-- Calendario Custom Liquid Glass -->
                    <div id="customCalendar" class="custom-calendar hidden">
                      <div class="calendar-header">
                      <button id="calendarPrev" class="calendar-nav">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="15 18 9 12 15 6"/>
                        </svg>
                      </button>
                      <span id="calendarMonthYear" class="calendar-title"></span>
                      <button id="calendarNext" class="calendar-nav">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </button>
                    </div>
                    <div class="calendar-weekdays">
                      <span>Dom</span><span>Lun</span><span>Mar</span><span>Mié</span>
                      <span>Jue</span><span>Vie</span><span>Sáb</span>
                    </div>
                    <div id="calendarDays" class="calendar-days"></div>
                  </div>
                </div>
                <div class="info-row">
                  <span class="info-row-label">FICO Score</span>
                  <span class="info-row-value fico-score" id="ficoScore">Pendiente</span>
                </div>
              </div>
            </div>
          </div>
        `;
        
        // Inicializar Callback Calendar después de renderizar
        initCallbackCalendar(leadId, lead.full_name);
        
        // Inicializar campos editables
        initEditableFields();
        
        // Inicializar calendario DOB
        initDOBCalendar();
        
        // Inicializar toggle Self Employed
        initSelfEmployedToggle();
        
        // Inicializar navegación de pestañas
        initLeadTabs();
        
      } catch (error) {
        console.error('Error cargando lead:', error);
        document.getElementById('leadSection').innerHTML = `
          <div class="error">
            <h2>Error</h2>
            <p>No se pudo cargar la información del cliente.</p>
            <button class="toolbar-btn" onclick="window.location.href='index.html#leads'" style="margin-top: 20px;">
              Volver a Leads
            </button>
          </div>
        `;
      }
    }
    
    // Helpers
    function calculateDaysInStatus(createdAt) {
      const created = new Date(createdAt);
      const now = new Date();
      const diffTime = Math.abs(now - created);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    }
    
    // Cargar datos
    initNotesPanel();
    loadLead();


