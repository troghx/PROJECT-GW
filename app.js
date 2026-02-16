const loginForm = document.getElementById('loginForm');
const loginStatus = document.getElementById('loginStatus');
const quoteText = document.getElementById('quoteText');
const authShell = document.getElementById('authShell');
const dashboardView = document.getElementById('dashboardView');
const themeSwitch = document.getElementById('themeSwitch');
const accountBtn = document.getElementById('accountBtn');
const accountMenu = document.getElementById('accountMenu');
const toolbarToggle = document.getElementById('toolbarToggle');
const toolbarWrap = document.getElementById('toolbarWrap');
const homeSearchInput = document.getElementById('homeSearch');
const crmHelpers = window.CrmHelpers || {};

const SESSION_KEY = 'project_gw_session';
const THEME_KEY = 'project_gw_theme';
const LEAD_SEARCH_TRANSFER_KEY = 'project_gw_leads_search_query';
const LEAD_SEARCH_DEBOUNCE_MS = 70;
const LEAD_SEARCH_SUGGESTION_LIMIT = 8;
const LEAD_SEARCH_SUGGESTION_Z_INDEX = 2147483000;

// Toast notifications
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
    : type === 'error'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><path d="M12 7v6m0 4v-2"/></svg>';
  
  toast.innerHTML = `${iconSvg}<span>${message}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

const quotes = [
  'Como gotas de rocío que alimentan el océano, cada pequeña acción construye mares de transformación.',
  'En el jardín de la perseverancia, las semillas de hoy florecen en los bosques del mañana.',
  'La excelencia no es un destino, sino el arte de bailar con la disciplina cada amanecer.',
  'Cuando sirves con el corazón, cada encuentro se convierte en poesía y cada gesto, en legado.',
  'Las montañas más altas se conquistan un paso a la vez, con la fe de quien sueña en grande.',
  'El tiempo es el lienzo; tu dedicación, el pincel. Pinta con pasión cada momento.',
  'Como el faro guía al navegante perdido, tu compromiso ilumina caminos de esperanza.',
  'La verdadera riqueza no se mide en números, sino en las vidas que tocas con autenticidad.'
];

let quoteIndex = 0;

function rotateQuote() {
  if (!quoteText || authShell.classList.contains('hidden')) {
    return;
  }

  quoteIndex = (quoteIndex + 1) % quotes.length;
  quoteText.animate([{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], {
    duration: 620,
    easing: 'ease-out'
  });
  quoteText.textContent = quotes[quoteIndex];
}

setInterval(rotateQuote, 5200);

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof data.message === 'string' ? data.message : 'Error en la solicitud.';
    throw new Error(message);
  }

  return data;
}

function setAccountMenu(open) {
  if (!accountMenu || !accountBtn) {
    return;
  }

  accountMenu.classList.toggle('hidden', !open);
  accountBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function setToolbarExpanded(open) {
  if (!toolbarWrap || !toolbarToggle) {
    return;
  }

  toolbarWrap.classList.toggle('expanded', open);
  toolbarToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toolbarToggle.setAttribute('aria-label', open ? 'Ocultar accesos' : 'Mostrar accesos');
}

function applyTheme(theme) {
  const selected = theme === 'light' ? 'light' : 'dark';

  document.body.classList.remove('theme-light', 'theme-dark');
  document.body.classList.add(selected === 'light' ? 'theme-light' : 'theme-dark');

  localStorage.setItem(THEME_KEY, selected);

  if (themeSwitch) {
    themeSwitch.checked = selected === 'light';
    themeSwitch.setAttribute('aria-checked', selected === 'light' ? 'true' : 'false');
    themeSwitch.setAttribute(
      'aria-label',
      selected === 'light' ? 'Tema claro activo' : 'Tema oscuro activo'
    );
  }
}

function getInitialTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function showDashboard() {
  authShell.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  document.body.classList.add('home-active');
}

function showLogin() {
  dashboardView.classList.add('hidden');
  authShell.classList.remove('hidden');
  document.body.classList.remove('home-active');
  loginStatus.textContent = 'Credenciales demo: admin / 1234';
  setAccountMenu(false);
  setToolbarExpanded(false);
}

function saveSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

if (themeSwitch) {
  themeSwitch.addEventListener('change', () => {
    applyTheme(themeSwitch.checked ? 'light' : 'dark');
  });
}

if (toolbarWrap) {
  toolbarWrap.addEventListener('click', (event) => {
    event.stopPropagation();
  });
}

if (toolbarToggle) {
  toolbarToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = toolbarWrap?.classList.contains('expanded');
    setToolbarExpanded(!isOpen);
  });
}

if (accountBtn && accountMenu) {
  accountBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = accountBtn.getAttribute('aria-expanded') === 'true';
    setAccountMenu(!isOpen);
  });

  accountMenu.addEventListener('click', (event) => {
    event.stopPropagation();
  });
}

document.addEventListener('click', () => {
  setAccountMenu(false);
  setToolbarExpanded(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setAccountMenu(false);
    setToolbarExpanded(false);
  }
});

// Botón de cerrar sesión
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    clearSession();
    showLogin();
  });
}

// Animación de contadores en el dashboard
function animateCounter(elementId, targetValue, duration = 800) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  const startTime = performance.now();
  const startValue = 0;
  
  function updateCounter(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing function (ease-out)
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const currentValue = Math.floor(startValue + (targetValue - startValue) * easeOut);
    
    element.textContent = currentValue.toLocaleString();
    
    if (progress < 1) {
      requestAnimationFrame(updateCounter);
    }
  }
  
  requestAnimationFrame(updateCounter);
}

// Animar contadores cuando se muestra el dashboard
function animateDashboardCounters() {
  // Valores de ejemplo (estos vendrán de la base de datos)
  animateCounter('callsCount', 247, 1500);
  animateCounter('conversionsCount', 18, 1200);
}

// Observar cuando el dashboard se vuelve visible
const dashboardObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.target.id === 'dashboardView' && !mutation.target.classList.contains('hidden')) {
      setTimeout(animateDashboardCounters, 300);
    }
  });
});

if (dashboardView) {
  dashboardObserver.observe(dashboardView, { attributes: true, attributeFilter: ['class'] });
}

// Estados Green State (los que no están aquí son Red)
const GREEN_STATES = [
  'MO', 'VA', 'CA', 'AR', 'TX', 'NY', 'FL', 'MS', 'LA', 'NC', 
  'NM', 'AL', 'TN', 'AZ', 'OK', 'MI', 'NE', 'MN', 'NV', 'ND', 
  'IA', 'AK', 'SD'
];

const STATE_NAMES = crmHelpers.STATE_NAMES || {};

// Función para determinar si un estado es Green o Red
function getStateType(stateCode) {
  const code = stateCode.toUpperCase().trim();
  return GREEN_STATES.includes(code) ? 'Green' : 'Red';
}

// Función para obtener nombre completo del estado
function getStateName(stateCode) {
  if (crmHelpers.getStateName) {
    return crmHelpers.getStateName(stateCode);
  }
  return STATE_NAMES[stateCode?.toUpperCase?.().trim?.()] || stateCode;
}

// Mapeo de códigos de área (LADA) a estados
const AREA_CODE_TO_STATE = {
  '201': 'NJ', '202': 'DC', '203': 'CT', '205': 'AL', '206': 'WA', '207': 'ME', '208': 'ID', '209': 'CA',
  '210': 'TX', '212': 'NY', '213': 'CA', '214': 'TX', '215': 'PA', '216': 'OH', '217': 'IL', '218': 'MN',
  '219': 'IN', '220': 'OH', '223': 'PA', '224': 'IL', '225': 'LA', '227': 'VA', '228': 'MS', '229': 'GA',
  '231': 'MI', '234': 'OH', '235': 'MN', '239': 'FL', '240': 'MD', '242': 'BS', '248': 'MI', '251': 'AL',
  '252': 'NC', '253': 'WA', '254': 'TX', '256': 'AL', '260': 'IN', '262': 'WI', '267': 'PA', '269': 'MI',
  '270': 'KY', '272': 'PA', '274': 'WI', '276': 'VA', '279': 'CA', '281': 'TX', '283': 'OH', '301': 'MD',
  '302': 'DE', '303': 'CO', '304': 'WV', '305': 'FL', '307': 'WY', '308': 'NE', '309': 'IL', '310': 'CA',
  '312': 'IL', '313': 'MI', '314': 'MO', '315': 'NY', '316': 'KS', '317': 'IN', '318': 'LA', '319': 'IA',
  '320': 'MN', '321': 'FL', '323': 'CA', '325': 'TX', '326': 'OH', '330': 'OH', '331': 'IL', '332': 'NY',
  '334': 'AL', '336': 'NC', '337': 'LA', '339': 'MA', '341': 'CA', '346': 'TX', '347': 'NY', '351': 'MA',
  '352': 'FL', '360': 'WA', '361': 'TX', '364': 'KY', '380': 'OH', '385': 'UT', '386': 'FL', '401': 'RI',
  '402': 'NE', '404': 'GA', '405': 'OK', '406': 'MT', '407': 'FL', '408': 'CA', '409': 'TX', '410': 'MD',
  '412': 'PA', '413': 'MA', '414': 'WI', '415': 'CA', '417': 'MO', '419': 'OH', '423': 'TN', '424': 'CA',
  '425': 'WA', '430': 'TX', '432': 'TX', '434': 'VA', '435': 'UT', '440': 'OH', '442': 'CA', '443': 'MD',
  '445': 'PA', '447': 'IL', '458': 'OR', '469': 'TX', '470': 'GA', '475': 'CT', '478': 'GA', '479': 'AR',
  '480': 'AZ', '484': 'PA', '501': 'AR', '502': 'KY', '503': 'OR', '504': 'LA', '505': 'NM', '507': 'MN',
  '508': 'MA', '509': 'WA', '510': 'CA', '512': 'TX', '513': 'OH', '515': 'IA', '516': 'NY', '517': 'MI',
  '518': 'NY', '520': 'AZ', '530': 'CA', '531': 'NE', '534': 'WI', '539': 'OK', '540': 'VA', '541': 'OR',
  '551': 'NJ', '559': 'CA', '561': 'FL', '562': 'CA', '563': 'IA', '564': 'WA', '567': 'OH', '570': 'PA',
  '571': 'VA', '572': 'OK', '573': 'MO', '574': 'IN', '575': 'NM', '580': 'OK', '582': 'PA', '585': 'NY',
  '586': 'MI', '601': 'MS', '602': 'AZ', '603': 'NH', '605': 'SD', '606': 'KY', '607': 'NY', '608': 'WI',
  '609': 'NJ', '610': 'PA', '612': 'MN', '614': 'OH', '615': 'TN', '616': 'MI', '617': 'MA', '618': 'IL',
  '619': 'CA', '620': 'KS', '623': 'AZ', '626': 'CA', '628': 'CA', '629': 'TN', '630': 'IL', '631': 'NY',
  '636': 'MO', '641': 'IA', '646': 'NY', '650': 'CA', '651': 'MN', '657': 'CA', '660': 'MO', '661': 'CA',
  '662': 'MS', '667': 'MD', '669': 'CA', '678': 'GA', '679': 'MI', '681': 'WV', '682': 'TX', '701': 'ND',
  '702': 'NV', '703': 'VA', '704': 'NC', '706': 'GA', '707': 'CA', '708': 'IL', '712': 'IA', '713': 'TX',
  '714': 'CA', '715': 'WI', '716': 'NY', '717': 'PA', '718': 'NY', '719': 'CO', '720': 'CO', '724': 'PA',
  '725': 'NV', '726': 'TX', '727': 'FL', '730': 'IL', '731': 'TN', '732': 'NJ', '734': 'MI', '737': 'TX',
  '740': 'OH', '747': 'CA', '754': 'FL', '757': 'VA', '760': 'CA', '762': 'GA', '763': 'MN', '764': 'CA',
  '765': 'IN', '769': 'MS', '770': 'GA', '772': 'FL', '773': 'IL', '774': 'MA', '775': 'NV', '779': 'IL',
  '781': 'MA', '785': 'KS', '786': 'FL', '801': 'UT', '802': 'VT', '803': 'SC', '804': 'VA', '805': 'CA',
  '806': 'TX', '808': 'HI', '810': 'MI', '812': 'IN', '813': 'FL', '814': 'PA', '815': 'IL', '816': 'MO',
  '817': 'TX', '818': 'CA', '828': 'NC', '830': 'TX', '831': 'CA', '832': 'TX', '835': 'PA', '838': 'WA',
  '840': 'CA', '843': 'SC', '845': 'NY', '847': 'IL', '848': 'NJ', '850': 'FL', '856': 'NJ', '857': 'MA',
  '858': 'CA', '859': 'KY', '860': 'CT', '862': 'NJ', '863': 'FL', '864': 'SC', '865': 'TN', '870': 'AR',
  '872': 'IL', '878': 'PA', '901': 'TN', '903': 'TX', '904': 'FL', '906': 'MI', '907': 'AK', '908': 'NJ',
  '909': 'CA', '910': 'NC', '912': 'GA', '913': 'KS', '914': 'NY', '915': 'TX', '916': 'CA', '917': 'NY',
  '918': 'OK', '919': 'NC', '920': 'WI', '925': 'CA', '928': 'AZ', '930': 'IN', '931': 'TN', '934': 'NY',
  '936': 'TX', '937': 'OH', '938': 'AL', '940': 'TX', '941': 'FL', '945': 'TX', '947': 'MI', '949': 'CA',
  '951': 'CA', '952': 'MN', '954': 'FL', '956': 'TX', '959': 'CT', '970': 'CO', '971': 'OR', '972': 'TX',
  '973': 'NJ', '978': 'MA', '979': 'TX', '980': 'NC', '984': 'NC', '985': 'LA', '986': 'ID', '989': 'MI'
};

// Función para detectar estado por código de área
function detectStateByAreaCode(phone) {
  // Extraer solo los números
  const digits = phone.replace(/\D/g, '');
  
  // Si empieza con 1 (código de país), quitarlo
  const nationalNumber = digits.startsWith('1') && digits.length === 11 
    ? digits.slice(1) 
    : digits;
  
  // Tomar los primeros 3 dígitos (código de área)
  const areaCode = nationalNumber.slice(0, 3);
  
  return AREA_CODE_TO_STATE[areaCode] || null;
}

// Función para actualizar el badge de State Type
function updateStateTypeBadge(stateCell, badgeCell) {
  const stateCode = stateCell.textContent.trim();
  const stateType = getStateType(stateCode);
  const stateName = getStateName(stateCode);
  
  badgeCell.innerHTML = `<span class="type-badge ${stateType.toLowerCase()}" title="${stateName} (${stateCode}) - ${stateType} State">${stateType}</span>`;
}

// Selector de mes
const monthSelector = document.getElementById('monthSelector');
if (monthSelector) {
  monthSelector.addEventListener('change', (e) => {
    const selectedMonth = e.target.options[e.target.selectedIndex].text;
    console.log('Mes seleccionado:', selectedMonth);
    // Aquí se conectará con la base de datos para cargar los datos del mes seleccionado
    // Por ahora solo recargamos la animación de contadores como demo
    animateDashboardCounters();
  });
}

// Navegación entre Dashboard y Leads
const leadsBtn = document.getElementById('leadsBtn');
const dashboardGrid = document.querySelector('.dashboard-grid');
const leadsView = document.getElementById('leadsView');
let isLeadsView = false;
let allLeadsCache = [];
let leadSearchIndex = [];
let currentLeadSearchQuery = '';
let leadSearchDebounceTimer = null;
let leadsLoaded = false;
let leadsRequestInFlight = null;
let leadSearchSuggestionBox = null;
let leadSearchSuggestionShell = null;
let leadSearchSuggestionMatches = [];
let leadSearchSuggestionActiveIndex = -1;

function consumeTransferredLeadSearchQuery() {
  try {
    const raw = localStorage.getItem(LEAD_SEARCH_TRANSFER_KEY);
    localStorage.removeItem(LEAD_SEARCH_TRANSFER_KEY);
    return String(raw || '').trim();
  } catch (_error) {
    return '';
  }
}

function setLeadSearchQuery(query, { syncInput = true } = {}) {
  currentLeadSearchQuery = String(query || '').trim();
  if (syncInput && homeSearchInput) {
    homeSearchInput.value = currentLeadSearchQuery;
  }
}

function buildLeadsSearchIndex(leads) {
  if (typeof crmHelpers.buildLeadSearchIndex === 'function') {
    return crmHelpers.buildLeadSearchIndex(leads);
  }
  const source = Array.isArray(leads) ? leads : [];
  return source.map((lead, position) => ({
    lead,
    position,
    textBlob: String(lead?.full_name || '').toLowerCase(),
    numericBlob: String(lead?.case_id || '')
  }));
}

function searchLeadsByQuery(query) {
  if (!currentLeadSearchQuery && !query) {
    return allLeadsCache.slice();
  }
  const normalizedQuery = String(query ?? currentLeadSearchQuery ?? '').trim();
  if (!normalizedQuery) return allLeadsCache.slice();
  if (typeof crmHelpers.searchLeads === 'function') {
    return crmHelpers.searchLeads(leadSearchIndex, normalizedQuery);
  }
  return allLeadsCache.filter((lead) => String(lead?.full_name || '').toLowerCase().includes(normalizedQuery.toLowerCase()));
}

function updateLeadsCounter(filteredCount) {
  const countEl = document.getElementById('leadsCount');
  if (!countEl) return;
  const safeFilteredCount = Number.isFinite(filteredCount) ? filteredCount : allLeadsCache.length;
  if (currentLeadSearchQuery) {
    countEl.textContent = `(${safeFilteredCount}/${allLeadsCache.length})`;
    return;
  }
  countEl.textContent = `(${allLeadsCache.length})`;
}

function getLeadSearchSuggestionPalette() {
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

function ensureLeadSearchSuggestionBox() {
  if (leadSearchSuggestionBox || !homeSearchInput) return leadSearchSuggestionBox;

  const shell = homeSearchInput.closest('.home-search-shell');
  if (!shell) return null;
  leadSearchSuggestionShell = shell;

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
  leadSearchSuggestionBox = box;

  const reposition = () => {
    if (!leadSearchSuggestionBox || leadSearchSuggestionBox.style.display === 'none') return;
    positionLeadSearchSuggestionBox();
  };
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);

  return leadSearchSuggestionBox;
}

function positionLeadSearchSuggestionBox() {
  if (!leadSearchSuggestionBox || !leadSearchSuggestionShell) return;
  const rect = leadSearchSuggestionShell.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const viewportPadding = 8;
  const top = rect.bottom + 8;
  const left = Math.max(viewportPadding, rect.left);
  const availableWidth = Math.max(220, window.innerWidth - left - viewportPadding);
  const width = Math.min(rect.width, availableWidth);
  const availableHeight = Math.max(140, window.innerHeight - top - viewportPadding);

  leadSearchSuggestionBox.style.left = `${left}px`;
  leadSearchSuggestionBox.style.top = `${top}px`;
  leadSearchSuggestionBox.style.width = `${Math.max(220, width)}px`;
  leadSearchSuggestionBox.style.maxHeight = `${Math.min(360, availableHeight)}px`;
}

function hideLeadSearchSuggestions() {
  if (!leadSearchSuggestionBox) return;
  leadSearchSuggestionBox.style.display = 'none';
  leadSearchSuggestionBox.innerHTML = '';
  leadSearchSuggestionMatches = [];
  leadSearchSuggestionActiveIndex = -1;
}

function navigateToLeadFromSuggestion(leadId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const numericLeadId = Number(leadId);
  if (!Number.isFinite(numericLeadId) || numericLeadId <= 0) return;
  hideLeadSearchSuggestions();
  window.location.assign(`/client.html?id=${numericLeadId}`);
}

function setLeadSearchSuggestionActive(nextIndex) {
  if (!leadSearchSuggestionBox) return;
  const buttons = Array.from(leadSearchSuggestionBox.querySelectorAll('[data-suggest-index]'));
  if (!buttons.length) return;

  let target = Number(nextIndex);
  if (!Number.isFinite(target)) target = -1;
  if (target < 0) target = buttons.length - 1;
  if (target >= buttons.length) target = 0;

  leadSearchSuggestionActiveIndex = target;
  const palette = getLeadSearchSuggestionPalette();
  buttons.forEach((button, index) => {
    button.style.background = index === target ? palette.itemHover : 'transparent';
  });
}

function renderLeadSearchSuggestions(matches) {
  const box = ensureLeadSearchSuggestionBox();
  if (!box) return;

  const query = String(currentLeadSearchQuery || '').trim();
  if (!query) {
    hideLeadSearchSuggestions();
    return;
  }

  const list = Array.isArray(matches) ? matches.slice(0, LEAD_SEARCH_SUGGESTION_LIMIT) : [];
  if (!list.length) {
    hideLeadSearchSuggestions();
    return;
  }

  const palette = getLeadSearchSuggestionPalette();
  box.style.background = palette.background;
  box.style.border = palette.border;
  box.style.boxShadow = palette.shadow;

  leadSearchSuggestionMatches = list;
  leadSearchSuggestionActiveIndex = -1;

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
      setLeadSearchSuggestionActive(Number(button.dataset.suggestIndex));
    });
    button.addEventListener('pointerdown', (event) => {
      navigateToLeadFromSuggestion(button.dataset.leadId, event);
    });
    button.addEventListener('mousedown', (event) => {
      navigateToLeadFromSuggestion(button.dataset.leadId, event);
    });
    button.addEventListener('click', (event) => {
      navigateToLeadFromSuggestion(button.dataset.leadId, event);
    });
  });

  positionLeadSearchSuggestionBox();
  box.style.display = 'block';
}

function openActiveLeadSearchSuggestion() {
  if (leadSearchSuggestionActiveIndex < 0 || leadSearchSuggestionActiveIndex >= leadSearchSuggestionMatches.length) {
    return false;
  }
  const targetLead = leadSearchSuggestionMatches[leadSearchSuggestionActiveIndex];
  if (!targetLead?.id) return false;
  hideLeadSearchSuggestions();
  openLeadById(targetLead.id);
  return true;
}

function showLeadsView() {
  if (dashboardGrid) dashboardGrid.classList.add('hidden');
  if (leadsView) {
    leadsView.classList.remove('hidden');
    // Animar entrada
    leadsView.animate([
      { opacity: 0, transform: 'translateY(20px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], {
      duration: 400,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
    });
    
    // Inicializar State Types
    initializeStateTypes();
  }
  isLeadsView = true;
  // Cambiar el estado del botón
  if (leadsBtn) {
    leadsBtn.style.background = 'var(--accent)';
    leadsBtn.style.color = '#000';
  }
}

// Función para inicializar todos los State Types
function initializeStateTypes() {
  const rows = document.querySelectorAll('.lead-row');
  rows.forEach(row => {
    const stateCell = row.querySelector('.lead-state');
    const badgeCell = row.querySelector('td:nth-child(10)');
    if (stateCell && badgeCell) {
      updateStateTypeBadge(stateCell, badgeCell);
    }
  });
}

function showDashboardView() {
  if (leadsView) leadsView.classList.add('hidden');
  if (dashboardGrid) {
    dashboardGrid.classList.remove('hidden');
    // Animar entrada
    dashboardGrid.animate([
      { opacity: 0, transform: 'translateY(20px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], {
      duration: 400,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
    });
  }
  isLeadsView = false;
  // Restaurar estado del botón
  if (leadsBtn) {
    leadsBtn.style.background = '';
    leadsBtn.style.color = '';
  }
}

function applyDashboardRouteFromHash() {
  const route = (window.location.hash || '').replace('#', '').toLowerCase();
  if (route === 'leads') {
    showLeadsView();
  } else {
    showDashboardView();
  }
}

if (leadsBtn) {
  leadsBtn.addEventListener('click', () => {
    showLeadsView();
    if (window.location.hash !== '#leads') {
      window.location.hash = 'leads';
    }
  });
}

window.addEventListener('hashchange', () => {
  if (getSession()) {
    applyDashboardRouteFromHash();
  }
});

function ensureLeadsViewForSearch() {
  if (!isLeadsView) {
    showLeadsView();
  }
  if (window.location.hash !== '#leads') {
    window.location.hash = 'leads';
  }
}

function scheduleLeadSearch(query) {
  if (leadSearchDebounceTimer) {
    clearTimeout(leadSearchDebounceTimer);
  }
  leadSearchDebounceTimer = setTimeout(async () => {
    setLeadSearchQuery(query, { syncInput: false });
    if (!currentLeadSearchQuery) {
      hideLeadSearchSuggestions();
      if (isLeadsView) {
        renderFilteredLeads();
      }
      return;
    }

    await loadLeads();
    const matches = searchLeadsByQuery(currentLeadSearchQuery);
    renderLeadSearchSuggestions(matches);
    if (isLeadsView) {
      renderLeadsRows(matches);
    }
  }, LEAD_SEARCH_DEBOUNCE_MS);
}

async function runLeadSearchSubmit() {
  const query = String(homeSearchInput?.value || '').trim();
  if (!query) {
    setLeadSearchQuery('', { syncInput: false });
    hideLeadSearchSuggestions();
    if (isLeadsView) renderFilteredLeads();
    return;
  }

  if (openActiveLeadSearchSuggestion()) {
    return;
  }

  setLeadSearchQuery(query, { syncInput: false });
  await loadLeads();

  const matches = searchLeadsByQuery(query);
  if (matches.length === 1) {
    hideLeadSearchSuggestions();
    openLeadById(matches[0].id);
    return;
  }

  hideLeadSearchSuggestions();
  ensureLeadsViewForSearch();
  renderLeadsRows(matches);
}

if (homeSearchInput) {
  homeSearchInput.addEventListener('focus', async () => {
    if (getSession()) {
      await loadLeads();
      if (currentLeadSearchQuery) {
        renderLeadSearchSuggestions(searchLeadsByQuery(currentLeadSearchQuery));
      }
    }
  });

  homeSearchInput.addEventListener('input', (event) => {
    scheduleLeadSearch(event.target.value);
  });

  homeSearchInput.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (leadSearchSuggestionMatches.length > 0) {
        setLeadSearchSuggestionActive(leadSearchSuggestionActiveIndex + 1);
      }
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (leadSearchSuggestionMatches.length > 0) {
        setLeadSearchSuggestionActive(leadSearchSuggestionActiveIndex - 1);
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void runLeadSearchSubmit();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setLeadSearchQuery('', { syncInput: true });
      hideLeadSearchSuggestions();
      if (isLeadsView) renderFilteredLeads();
    }
  });

  document.addEventListener('click', (event) => {
    const shell = homeSearchInput.closest('.home-search-shell');
    if (!shell) return;
    const clickedInsideSuggestions = Boolean(leadSearchSuggestionBox && leadSearchSuggestionBox.contains(event.target));
    if (!shell.contains(event.target) && !clickedInsideSuggestions) {
      hideLeadSearchSuggestions();
    }
  });
}

// Select all checkbox
const selectAllCheckbox = document.querySelector('.select-all');
if (selectAllCheckbox) {
  selectAllCheckbox.addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.lead-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
  });
}

// ============================================
// MODAL NUEVO LEAD
// ============================================

const newLeadModal = document.getElementById('newLeadModal');
const newLeadForm = document.getElementById('newLeadForm');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelLeadBtn = document.getElementById('cancelLeadBtn');
const createLeadBtn = document.querySelector('.create-lead-btn');

// Elementos del buscador de estados (declarados aquí para estar disponibles en todas las funciones)
const stateSearchInput = document.getElementById('leadStateSearch');
const stateHiddenInput = document.getElementById('leadState');
const stateSuggestions = document.getElementById('stateSuggestions');
const stateDetected = document.getElementById('stateDetected');
const phoneInput = document.getElementById('leadPhone');
const duplicateAlert = document.getElementById('duplicateAlert');
const duplicateSummary = document.getElementById('duplicateSummary');
const duplicateList = document.getElementById('duplicateList');
const openDuplicateBtn = document.getElementById('openDuplicateBtn');
const linkAndCreateBtn = document.getElementById('linkAndCreateBtn');
const forceCreateBtn = document.getElementById('forceCreateBtn');

let duplicateMatches = [];
let duplicateDecision = null;
let duplicatePhone = null;

function normalizePhoneForLead(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const normalizedDigits = digits.length === 11 && digits.startsWith('1')
    ? digits.slice(1)
    : digits;

  if (normalizedDigits.length !== 10) {
    return null;
  }

  return `${normalizedDigits.slice(0, 3)}-${normalizedDigits.slice(3, 6)}-${normalizedDigits.slice(6)}`;
}

function clearDuplicateAlert() {
  duplicateMatches = [];
  duplicateDecision = null;
  duplicatePhone = null;

  if (duplicateAlert) duplicateAlert.classList.add('hidden');
  if (duplicateSummary) duplicateSummary.textContent = '';
  if (duplicateList) duplicateList.innerHTML = '';
}

function openLeadById(leadId) {
  if (!leadId) return;
  window.location.href = `/client.html?id=${leadId}`;
}

function triggerNewLeadSubmit() {
  if (!newLeadForm) return;
  if (typeof newLeadForm.requestSubmit === 'function') {
    newLeadForm.requestSubmit();
    return;
  }
  newLeadForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function renderDuplicateAlert(matches, normalizedPhone) {
  if (!duplicateAlert || !duplicateSummary || !duplicateList) {
    return;
  }

  duplicateMatches = Array.isArray(matches) ? matches : [];
  duplicateDecision = null;
  duplicatePhone = normalizedPhone;

  const total = duplicateMatches.length;
  duplicateSummary.textContent = `Encontramos ${total} lead${total === 1 ? '' : 's'} con el telefono ${normalizedPhone}.`;

  duplicateList.innerHTML = duplicateMatches.map((lead) => {
    const stateType = lead.state_type || (lead.state_code ? getStateType(lead.state_code) : '-');
    return `
      <button type="button" class="duplicate-item duplicate-open-link" data-id="${lead.id}">
        <span class="duplicate-item-name">${escapeHtml(lead.full_name || 'Sin nombre')} · Case #${lead.case_id || '-'}</span>
        <span class="duplicate-item-meta">${escapeHtml(lead.phone || '-')} · ${escapeHtml(lead.state_code || '-')} · ${escapeHtml(stateType)} · ${escapeHtml(lead.status || '-')}</span>
      </button>
    `;
  }).join('');

  duplicateList.querySelectorAll('.duplicate-open-link').forEach((button) => {
    button.addEventListener('click', () => {
      const leadId = Number(button.dataset.id);
      openLeadById(leadId);
    });
  });

  duplicateAlert.classList.remove('hidden');
}

async function findPhoneDuplicates(phone) {
  const response = await fetch(`/api/leads/duplicates?phone=${encodeURIComponent(phone)}`);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'No se pudo validar duplicados.');
  }

  return data;
}

// Abrir modal
if (createLeadBtn && newLeadModal) {
  createLeadBtn.addEventListener('click', () => {
    newLeadModal.classList.remove('hidden');
    
    // Limpiar el buscador de estados al abrir
    if (stateSearchInput) stateSearchInput.value = '';
    if (stateHiddenInput) stateHiddenInput.value = '';
    if (stateSuggestions) stateSuggestions.classList.add('hidden');
    if (stateDetected) stateDetected.classList.add('hidden');
    clearDuplicateAlert();
    
    document.getElementById('leadName').focus();
  });
}

// Cerrar modal
function closeModal() {
  if (newLeadModal) {
    newLeadModal.classList.add('hidden');
    newLeadForm.reset();
    
    // Limpiar el buscador de estados
    if (stateSearchInput) stateSearchInput.value = '';
    if (stateHiddenInput) stateHiddenInput.value = '';
    if (stateSuggestions) stateSuggestions.classList.add('hidden');
    if (stateDetected) stateDetected.classList.add('hidden');
    clearDuplicateAlert();
  }
}

if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
if (cancelLeadBtn) cancelLeadBtn.addEventListener('click', closeModal);

// Cerrar al hacer click fuera
if (newLeadModal) {
  newLeadModal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
}

// Cerrar con Escape
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && newLeadModal && !newLeadModal.classList.contains('hidden')) {
    closeModal();
  }
});

// ============================================
// BUSCADOR DE ESTADOS CON AUTOCOMPLETADO
// ============================================

let selectedStateIndex = -1;

// Mostrar sugerencias
function showStateSuggestions(query) {
  if (!query || query.length < 1) {
    stateSuggestions.classList.add('hidden');
    return;
  }
  
  const queryLower = query.toLowerCase();
  const matches = Object.entries(STATE_NAMES).filter(([code, name]) => {
    return code.toLowerCase().includes(queryLower) || 
           name.toLowerCase().includes(queryLower);
  });
  
  if (matches.length === 0) {
    stateSuggestions.classList.add('hidden');
    return;
  }
  
  stateSuggestions.innerHTML = matches.map(([code, name], index) => `
    <div class="state-suggestion-item" data-code="${code}" data-index="${index}">
      <span class="state-suggestion-name">${name}</span>
      <span class="state-suggestion-code">${code}</span>
    </div>
  `).join('');
  
  stateSuggestions.classList.remove('hidden');
  selectedStateIndex = -1;
  
  // Agregar event listeners a las sugerencias
  stateSuggestions.querySelectorAll('.state-suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      selectState(item.dataset.code, item.querySelector('.state-suggestion-name').textContent);
    });
  });
}

// Seleccionar estado
function selectState(code, name) {
  stateSearchInput.value = `${name} (${code})`;
  stateHiddenInput.value = code;
  stateSuggestions.classList.add('hidden');
  
  // Mostrar badge de green/red
  const stateType = GREEN_STATES.includes(code) ? 'Green' : 'Red';
  showDetectedState(`Estado: ${name} (${code}) - ${stateType}`);
}

// Mostrar estado detectado
function showDetectedState(message) {
  stateDetected.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M5 13l4 4L19 7"/>
    </svg>
    ${message}
  `;
  stateDetected.classList.remove('hidden');
}

// Event listeners para el buscador
if (stateSearchInput) {
  stateSearchInput.addEventListener('input', (e) => {
    showStateSuggestions(e.target.value);
  });
  
  stateSearchInput.addEventListener('keydown', (e) => {
    const items = stateSuggestions.querySelectorAll('.state-suggestion-item');
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedStateIndex = Math.min(selectedStateIndex + 1, items.length - 1);
      updateActiveSuggestion(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedStateIndex = Math.max(selectedStateIndex - 1, -1);
      updateActiveSuggestion(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedStateIndex >= 0 && items[selectedStateIndex]) {
        items[selectedStateIndex].click();
      }
    } else if (e.key === 'Escape') {
      stateSuggestions.classList.add('hidden');
    }
  });
  
  // Cerrar sugerencias al hacer click fuera
  document.addEventListener('click', (e) => {
    if (!stateSearchInput.contains(e.target) && !stateSuggestions.contains(e.target)) {
      stateSuggestions.classList.add('hidden');
    }
  });
}

function updateActiveSuggestion(items) {
  items.forEach((item, index) => {
    item.classList.toggle('active', index === selectedStateIndex);
  });
}

// Detección automática por código de área
if (phoneInput) {
  phoneInput.addEventListener('input', (e) => {
    clearDuplicateAlert();
    const phone = e.target.value;
    const detectedState = detectStateByAreaCode(phone);
    
    if (detectedState && !stateHiddenInput.value) {
      const stateName = STATE_NAMES[detectedState];
      const stateType = GREEN_STATES.includes(detectedState) ? 'Green' : 'Red';
      
      // Auto-completar el campo
      stateSearchInput.value = `${stateName} (${detectedState})`;
      stateHiddenInput.value = detectedState;
      showDetectedState(`Detectado por código de área: ${stateName} (${detectedState}) - ${stateType}`);
    }
  });
}

if (openDuplicateBtn) {
  openDuplicateBtn.addEventListener('click', () => {
    const firstMatch = duplicateMatches[0];
    if (firstMatch?.id) {
      openLeadById(firstMatch.id);
    }
  });
}

if (linkAndCreateBtn) {
  linkAndCreateBtn.addEventListener('click', () => {
    if (!duplicateMatches.length) return;
    duplicateDecision = 'link';
    triggerNewLeadSubmit();
  });
}

if (forceCreateBtn) {
  forceCreateBtn.addEventListener('click', () => {
    if (!duplicateMatches.length) return;
    duplicateDecision = 'force';
    triggerNewLeadSubmit();
  });
}

// ============================================
// CREAR LEAD
// ============================================
if (newLeadForm) {
  newLeadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const fullName = document.getElementById('leadName').value.trim();
    const phone = document.getElementById('leadPhone').value.trim();
    const stateCode = stateHiddenInput ? stateHiddenInput.value : '';
    const isTest = document.getElementById('isTestLead').checked;
    const normalizedPhone = normalizePhoneForLead(phone);
    
    if (!fullName || !phone) {
      alert('Por favor completa todos los campos obligatorios.');
      return;
    }

    if (!normalizedPhone) {
      alert('Ingresa un teléfono válido de 10 dígitos (ej: 305-555-0123).');
      if (phoneInput) phoneInput.focus();
      return;
    }
    
    if (!stateCode) {
      alert('Por favor selecciona un estado.');
      stateSearchInput.focus();
      return;
    }
    
    try {
      if (!duplicateDecision) {
        const duplicateData = await findPhoneDuplicates(normalizedPhone);
        const matches = Array.isArray(duplicateData.matches) ? duplicateData.matches : [];
        if (matches.length > 0) {
          renderDuplicateAlert(matches, normalizedPhone);
          return;
        }
      }

      // Obtener el usuario actual para asignar el lead
      const session = getSession();
      const assignedTo = session ? (session.username || session.name || 'Usuario') : 'Usuario';
      
      const payload = { fullName, phone: normalizedPhone, stateCode, isTest, assignedTo };
      if (duplicateDecision === 'link' && duplicateMatches.length > 0) {
        const baseLead = duplicateMatches[0];
        payload.relatedLeadId = baseLead.id;
        payload.notes = `Telefono compartido detectado con lead #${baseLead.case_id || baseLead.id}.`;
      }
      console.log('Enviando datos:', payload);
      
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Error del servidor:', errorData);
        throw new Error(errorData.message || 'Error al crear el lead');
      }
      
      const data = await response.json();
      const lead = data.lead;
      
      // Cerrar modal
      closeModal();
      
      // Redirigir a detalle iniciando siempre en pestaña de información
      window.location.href = `/client.html?id=${lead.id}&tab=lead`;
      
    } catch (error) {
      console.error('Error:', error);
      alert(error.message || 'No se pudo crear el lead. Intenta de nuevo.');
    }
  });
}

// ============================================
// CARGAR LEADS EXISTENTES
// ============================================

function renderLeadsRows(leads) {
  const tbody = document.getElementById('leadsTableBody');
  if (!tbody) return;

  const rows = Array.isArray(leads) ? leads : [];
  updateLeadsCounter(rows.length);

  if (allLeadsCache.length === 0) {
    tbody.innerHTML = `
      <tr class="lead-row empty-state">
        <td colspan="12" class="empty-message">
          <div class="empty-content">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <p>No hay leads registrados</p>
            <span>Haz clic en "Nuevo Lead" para agregar uno</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr class="lead-row empty-state">
        <td colspan="12" class="empty-message">
          <div class="empty-content">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="11" cy="11" r="7"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <p>No se encontraron coincidencias</p>
            <span>Busca por nombre, SSN/ITIN, telefono, ID o Case ID (${escapeHtml(currentLeadSearchQuery)})</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const leadMapById = new Map(allLeadsCache.map((lead) => [Number(lead.id), lead]));
  tbody.innerHTML = rows.map((lead) => `
    <tr class="lead-row" data-id="${lead.id}">
      <td><input type="checkbox" class="lead-checkbox"></td>
      <td class="lead-name">
        <a href="/client.html?id=${lead.id}" class="name-link">
          <div class="name-avatar">
            <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(lead.full_name)}&background=random&color=fff&size=32" alt="">
            <span>${escapeHtml(lead.full_name)}</span>
          </div>
        </a>
      </td>
      <td class="lead-case">${lead.case_id}</td>
      <td>${getLeadBadgesCell(lead, leadMapById)}</td>
      <td class="lead-user">${escapeHtml(lead.assigned_to || '-')}</td>
      <td class="lead-date">${formatDate(lead.created_at)}</td>
      <td class="lead-date">${formatDate(lead.updated_at)}</td>
      <td class="lead-phone">${escapeHtml(lead.phone || '-')}</td>
      <td class="lead-email">${escapeHtml(lead.email || '-')}</td>
      <td class="lead-state">${lead.state_code || '-'}</td>
      <td>${getStateTypeBadge(lead.state_code, lead.state_type)}</td>
      <td class="lead-campaign">${escapeHtml(lead.source || '-')}</td>
      <td class="lead-actions">
        <button class="action-btn delete-btn" data-id="${lead.id}" data-name="${escapeHtml(lead.full_name)}" title="Eliminar lead">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const leadId = btn.dataset.id;
      const leadName = btn.dataset.name;

      if (confirm(`¿Estás seguro de eliminar el lead "${leadName}"?\n\nEsta acción no se puede deshacer.`)) {
        try {
          const response = await fetch(`/api/leads/${leadId}`, { method: 'DELETE' });
          if (response.ok) {
            await loadLeads(true);
            showToast('Lead eliminado correctamente', 'success');
          } else {
            showToast('Error al eliminar el lead', 'error');
          }
        } catch (error) {
          console.error('Error:', error);
          showToast('Error al eliminar el lead', 'error');
        }
      }
    });
  });
}

function renderFilteredLeads() {
  const matches = searchLeadsByQuery(currentLeadSearchQuery);
  renderLeadsRows(matches);
}

async function loadLeads(forceReload = false) {
  if (leadsLoaded && !forceReload) {
    renderFilteredLeads();
    return allLeadsCache;
  }

  if (leadsRequestInFlight) {
    return leadsRequestInFlight;
  }

  leadsRequestInFlight = (async () => {
    try {
      const response = await fetch('/api/leads');
      if (!response.ok) throw new Error('Error al cargar leads');

      const data = await response.json();
      allLeadsCache = Array.isArray(data.leads) ? data.leads : [];
      leadSearchIndex = buildLeadsSearchIndex(allLeadsCache);
      leadsLoaded = true;

      renderFilteredLeads();
      return allLeadsCache;
    } catch (error) {
      console.error('Error cargando leads:', error);
      updateLeadsCounter(0);
      return [];
    } finally {
      leadsRequestInFlight = null;
    }
  })();

  return leadsRequestInFlight;
}

// Helpers
function escapeHtml(text) {
  if (crmHelpers.escapeHtml) {
    return crmHelpers.escapeHtml(text);
  }
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  if (crmHelpers.formatDateEs) {
    return crmHelpers.formatDateEs(dateString);
  }
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES');
}

function getStatusBadge(status, isTest) {
  if (crmHelpers.getStatusBadgeHtml) {
    return crmHelpers.getStatusBadgeHtml(status, isTest);
  }
  if (isTest) {
    return '<span class="status-badge test">Test</span>';
  }
  const statusClass = {
    'New Lead': 'new',
    'Submitted to UW': 'submitted',
    'Docs Back': 'docs',
    'Sent to Debt Manager': 'manager',
    'Callback Requested': 'callback'
  }[status] || 'new';
  return `<span class="status-badge ${statusClass}">${escapeHtml(status)}</span>`;
}

function getStateTypeBadge(stateCode, stateType) {
  if (crmHelpers.getStateTypeBadgeHtml) {
    return crmHelpers.getStateTypeBadgeHtml(stateCode, stateType);
  }
  if (!stateCode) return '-';
  const typeClass = stateType === 'Green' ? 'green' : 'red';
  const stateName = getStateName(stateCode);
  return `<span class="type-badge ${typeClass}" title="${stateName} (${stateCode}) - ${stateType} State">${stateType}</span>`;
}

function getRelatedLeadBadge(lead, leadMapById) {
  const relatedLeadId = Number(lead?.related_lead_id);
  if (!Number.isInteger(relatedLeadId) || relatedLeadId <= 0) {
    return '';
  }

  const relatedLead = leadMapById?.get(relatedLeadId);
  if (!relatedLead) {
    return '';
  }
  const relatedLabel = `Relacionado con #${escapeHtml(String(relatedLead.case_id || relatedLeadId))}`;

  return `
    <a class="relation-badge" href="/client.html?id=${relatedLeadId}" title="Abrir lead relacionado">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4"/>
        <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19"/>
      </svg>
      <span>${relatedLabel}</span>
    </a>
  `;
}

function getLeadBadgesCell(lead, leadMapById) {
  return `
    <div class="lead-badges-inline">
      ${getStatusBadge(lead.status, lead.is_test)}
      ${getRelatedLeadBadge(lead, leadMapById)}
    </div>
  `;
}
// Cargar leads al mostrar la vista de leads
const originalShowLeadsView = showLeadsView;
showLeadsView = function() {
  originalShowLeadsView();
  loadLeads();
};

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(loginForm);
    const payload = {
      username: String(formData.get('username') || '').trim(),
      password: String(formData.get('password') || '')
    };

    loginStatus.textContent = 'Validando acceso...';

    try {
      const data = await requestJson('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      saveSession(data.user);
      loginStatus.textContent = data.message;
      setTimeout(() => {
        showDashboard();
        applyDashboardRouteFromHash();
      }, 240);
    } catch (error) {
      loginStatus.textContent = error.message;
    }
  });
}

applyTheme(getInitialTheme());
setToolbarExpanded(false);

const transferredLeadSearchQuery = consumeTransferredLeadSearchQuery();
const existingSession = getSession();
if (existingSession) {
  if (transferredLeadSearchQuery) {
    setLeadSearchQuery(transferredLeadSearchQuery, { syncInput: true });
    if (window.location.hash !== '#leads') {
      window.location.hash = 'leads';
    }
  }
  showDashboard();
  applyDashboardRouteFromHash();
  if (window.location.hash === '#leads' || currentLeadSearchQuery) {
    void loadLeads();
  }
} else {
  showLogin();
}

// ============================================
// RANKINGS WHEEL - Efecto ruleta para rankings laterales
// ============================================

// Bandera para evitar inicialización múltiple
let rankingsWheelInitialized = false;

function initRankingsWheel() {
  if (rankingsWheelInitialized) {
    console.log('[RankingsWheel] Ya inicializado, ignorando...');
    return;
  }
  rankingsWheelInitialized = true;
  
  console.log('[RankingsWheel] Inicializando...');
  const wheels = document.querySelectorAll('.rankings-wheel');
  console.log('[RankingsWheel] Wheels encontrados:', wheels.length);
  
  if (wheels.length === 0) {
    console.warn('[RankingsWheel] No se encontraron elementos .rankings-wheel');
    return;
  }
  
  wheels.forEach((wheel, wheelIndex) => {
    console.log(`[RankingsWheel] Procesando wheel #${wheelIndex}`);
    
    const track = wheel.querySelector('.rankings-wheel-track');
    let items = Array.from(wheel.querySelectorAll('.rankings-wheel-item'));
    
    console.log(`[RankingsWheel] Track:`, track ? 'encontrado' : 'NO encontrado');
    console.log(`[RankingsWheel] Items:`, items.length);
    
    if (!track || items.length === 0) {
      console.warn(`[RankingsWheel] Wheel #${wheelIndex}: Faltan elementos`);
      return;
    }
    
    const itemHeight = 52; // Altura de cada item
    const wheelHeight = wheel.clientHeight;
    const centerOffset = (wheelHeight - itemHeight) / 2;
    
    // Duplicar items para loop infinito perfecto
    const originalItems = items.map(item => item.cloneNode(true));
    originalItems.forEach(item => track.appendChild(item));
    items = Array.from(wheel.querySelectorAll('.rankings-wheel-item'));
    const totalOriginalItems = originalItems.length;
    
    // Posicionar el track para que el primer item esté centrado
    let baseOffset = centerOffset; // Offset base que reseteamos
    let currentOffset = 0; // Offset acumulado desde el último reset
    track.style.transform = `translateY(${baseOffset}px)`;
    
    const listHeight = totalOriginalItems * itemHeight;
    
    function updateActiveItem() {
      // Calcular el índice visual basado en cuánto nos hemos movido
      const totalPixelsMoved = -currentOffset;
      const visualIndex = Math.round(totalPixelsMoved / itemHeight);
      
      // Solo aplicar clases a los items que están dentro del rango visual (0 a totalOriginalItems-1)
      // Los items duplicados (totalOriginalItems en adelante) son para el loop, no para highlight
      const effectiveIndex = visualIndex % totalOriginalItems;
      
      items.forEach((item, index) => {
        item.classList.remove('active', 'near-top', 'near-bottom');
        
        // Calcular a qué índice original corresponde este item
        const itemOriginalIndex = index % totalOriginalItems;
        
        // Calcular distancia circular al índice activo
        let distance = itemOriginalIndex - effectiveIndex;
        // Normalizar distancia para que siempre sea la más corta
        if (distance > totalOriginalItems / 2) distance -= totalOriginalItems;
        if (distance < -totalOriginalItems / 2) distance += totalOriginalItems;
        
        if (distance === 0) {
          item.classList.add('active');
        } else if (distance === -1 || distance === -2) {
          item.classList.add('near-top'); // 1-2 items arriba
        } else if (distance === 1 || distance === 2) {
          item.classList.add('near-bottom'); // 1-2 items abajo
        }
      });
    }
    
    // Inicializar estado
    updateActiveItem();
    console.log(`[RankingsWheel] Wheel #${wheelIndex}: Iniciando auto-scroll`);
    
    // Auto-scroll lento continuo
    const autoScrollSpeed = 0.25; // pixels por frame a 60fps
    let isPaused = false;
    let animationId = null;
    
    function autoScroll() {
      if (!isPaused) {
        // Mover suavemente
        currentOffset -= autoScrollSpeed;
        
        // LOOP INFINITO: cuando nos hemos movido exactamente listHeight píxeles, reseteamos
        if (currentOffset <= -listHeight) {
          currentOffset += listHeight;
        }
        
        // Aplicar transform combinando base + offset actual
        const transformValue = baseOffset + currentOffset;
        track.style.transform = `translateY(${transformValue}px)`;
        updateActiveItem();
      }
      animationId = requestAnimationFrame(autoScroll);
    }
    
    // Iniciar auto-scroll
    animationId = requestAnimationFrame(autoScroll);
    
    // Pausar al hover
    wheel.addEventListener('mouseenter', () => {
      isPaused = true;
    });
    
    wheel.addEventListener('mouseleave', () => {
      isPaused = false;
      lastTime = Date.now();
    });
    
    // Permitir scroll manual con loop
    let isDragging = false;
    let startY = 0;
    let startOffset = 0;
    
    wheel.addEventListener('mousedown', (e) => {
      isDragging = true;
      isPaused = true;
      startY = e.clientY;
      startOffset = currentOffset;
      wheel.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const delta = e.clientY - startY;
      currentOffset = startOffset + delta;
      
      // Loop en drag
      while (currentOffset <= -listHeight) {
        currentOffset += listHeight;
        startOffset += listHeight;
      }
      while (currentOffset > 0) {
        currentOffset -= listHeight;
        startOffset -= listHeight;
      }
      
      track.style.transform = `translateY(${baseOffset + currentOffset}px)`;
      updateActiveItem();
    });
    
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        isPaused = false;
        lastTime = Date.now();
        wheel.style.cursor = 'default';
      }
    });
  });
}

// Inicializar rankings wheel cuando se muestre el dashboard
console.log('[RankingsWheel] Configurando interceptor de showDashboard');
const originalShowDashboard = showDashboard;
showDashboard = function() {
  console.log('[RankingsWheel] Dashboard mostrado, inicializando...');
  originalShowDashboard();
  // Pequeño delay para asegurar que el DOM esté listo
  setTimeout(initRankingsWheel, 300);
};

// Si ya estamos en el dashboard (sesión existente), inicializar ahora
document.addEventListener('DOMContentLoaded', () => {
  console.log('[RankingsWheel] DOMContentLoaded, verificando dashboard...');
  const dashboard = document.getElementById('dashboardView');
  const isVisible = dashboard && !dashboard.classList.contains('hidden');
  console.log('[RankingsWheel] Dashboard visible:', isVisible);
  console.log('[RankingsWheel] Elemento dashboard:', dashboard);
  
  if (isVisible) {
    console.log('[RankingsWheel] Inicializando desde DOMContentLoaded');
    setTimeout(initRankingsWheel, 500);
  }
});



