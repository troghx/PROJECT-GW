const loginForm = document.getElementById('loginForm');
const loginStatus = document.getElementById('loginStatus');
const loginIdentifierInput = document.getElementById('loginIdentifierInput');
const loginPinInput = document.getElementById('loginPinInput');
const pinInputShell = document.getElementById('pinInputShell');
const loginPinPad = document.getElementById('loginPinPad');
const loginPinDots = Array.from(document.querySelectorAll('#pinDots .pin-dot'));
const quoteText = document.getElementById('quoteText');
const quoteContainer = quoteText ? quoteText.closest('.quote-container') : null;
const pageBg = document.querySelector('.page-bg');
const authShell = document.getElementById('authShell');
const dashboardView = document.getElementById('dashboardView');
const themeSwitch = document.getElementById('themeSwitch');
const accountBtn = document.getElementById('accountBtn');
const sessionHandleTag = document.getElementById('sessionHandleTag');
const accountMenu = document.getElementById('accountMenu');
const manageUsersBtn = document.getElementById('manageUsersBtn');
const toolbarToggle = document.getElementById('toolbarToggle');
const toolbarWrap = document.getElementById('toolbarWrap');
const homeSearchInput = document.getElementById('homeSearch');
const leadsSpecificSearch = document.getElementById('leadsSpecificSearch');

if (leadsSpecificSearch) {
  leadsSpecificSearch.addEventListener('input', (event) => {
    scheduleLeadSearch(event.target.value);
  });
  leadsSpecificSearch.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setLeadSearchQuery('');
      leadsSpecificSearch.blur();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runLeadSearchSubmit();
    }
  });
}
const crmHelpers = window.CrmHelpers || {};
const usersAdminView = document.getElementById('usersAdminView');
const usersAdminLayout = document.getElementById('usersAdminLayout');
const refreshUsersAdminBtn = document.getElementById('refreshUsersAdminBtn');
const usersAdminToggleCreateBtn = document.getElementById('usersAdminToggleCreateBtn');
const usersAdminActiveTotal = document.getElementById('usersAdminActiveTotal');
const usersAdminCategoryRail = document.getElementById('usersAdminCategoryRail');
const usersAdminList = document.getElementById('usersAdminList');
const usersAdminStatus = document.getElementById('usersAdminStatus');
const usersAdminFormPanel = document.getElementById('usersAdminFormPanel');
const usersAdminForm = document.getElementById('usersAdminForm');
const usersAdminFormTitle = document.getElementById('usersAdminFormTitle');
const usersAdminId = document.getElementById('usersAdminId');
const usersAdminUsername = document.getElementById('usersAdminUsername');
const usersAdminDisplayName = document.getElementById('usersAdminDisplayName');
const usersAdminEmail = document.getElementById('usersAdminEmail');
const usersAdminRole = document.getElementById('usersAdminRole');
const usersAdminPin = document.getElementById('usersAdminPin');
const usersAdminIsActive = document.getElementById('usersAdminIsActive');
const usersAdminResetBtn = document.getElementById('usersAdminResetBtn');

const notifBtn = document.getElementById('notifBtn');
let notifPanel = document.getElementById('notifPanel');
let notifBadge = document.getElementById('notifBadge');
let notifList = document.getElementById('notifList');
let notifMarkAll = document.getElementById('notifMarkAll');
let adminUsersCache = [];
let usersAdminFormOpen = false;
let usersAdminRoleMenu = null;
let usersAdminPermissionsMenu = null;
let usersAdminPermissionCatalog = [];
let usersAdminPermissionByRoleMatrix = {};
let usersAdminActiveCategory = 'all';

const SESSION_KEY = 'project_gw_session';
const AUTH_TOKEN_KEY = 'project_gw_auth_token';
const THEME_KEY = 'project_gw_theme';
const COLOR_KEY = 'project_gw_accent_color';
const LEAD_SEARCH_TRANSFER_KEY = 'project_gw_leads_search_query';
const LEAD_SEARCH_DEBOUNCE_MS = 70;
const LEAD_SEARCH_SUGGESTION_LIMIT = 8;
const LEAD_SEARCH_SUGGESTION_Z_INDEX = 2147483000;
const ACCENT_COLORS_BY_THEME = {
  light: ['verde', 'oceano', 'coral', 'morado', 'dorado', 'rosa'],
  dark: ['fuego', 'veneno', 'azul']
};
const ACCENT_COLOR_DEFAULT_BY_THEME = {
  light: 'verde',
  dark: 'azul'
};
const ACCENT_COLOR_NAMES = Array.from(new Set([
  ...ACCENT_COLORS_BY_THEME.light,
  ...ACCENT_COLORS_BY_THEME.dark
]));
const LOGIN_PIN_LENGTH = 6;
const LOGIN_BACKGROUND_ROTATE_MS = 6000;
const LOGIN_BACKGROUND_FADE_OUT_MS = 220;
const LOGIN_BACKGROUND_FADE_IN_MS = 260;
const LOGIN_BACKGROUND_IMAGES = [
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=2100&q=80',
  'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=2100&q=80',
  'https://images.unsplash.com/photo-1497215842964-222b430dc094?auto=format&fit=crop&w=2100&q=80',
  'https://images.unsplash.com/photo-1497366412874-3415097a27e7?auto=format&fit=crop&w=2100&q=80',
  'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=2100&q=80'
];
let authRefreshPromise = null;

function saveAuthToken(tokenValue) {
  const token = String(tokenValue || '').trim();
  if (!token) return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function getAuthToken() {
  return String(localStorage.getItem(AUTH_TOKEN_KEY) || '').trim();
}

function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function ensureAuthFetchPatched() {
  if (window.__crmAuthFetchPatched) return;
  window.__crmAuthFetchPatched = true;

  const nativeFetch = window.fetch.bind(window);
  const refreshAuthToken = async () => {
    if (authRefreshPromise) return authRefreshPromise;

    authRefreshPromise = (async () => {
      const response = await nativeFetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.token || !data?.user) {
        throw new Error(typeof data?.message === 'string' ? data.message : 'No se pudo renovar la sesion.');
      }
      saveAuthToken(data.token);
      saveSession(data.user);
      return data;
    })();

    try {
      return await authRefreshPromise;
    } finally {
      authRefreshPromise = null;
    }
  };

  window.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === 'string'
      ? input
      : (input instanceof Request ? input.url : String(input || ''));
    const parsedUrl = new URL(requestUrl, window.location.origin);
    const sameOrigin = parsedUrl.origin === window.location.origin;
    const isApiRequest = sameOrigin && parsedUrl.pathname.startsWith('/api/');
    const isPublicAuthRoute = parsedUrl.pathname === '/api/auth/login'
      || parsedUrl.pathname === '/api/auth/refresh'
      || parsedUrl.pathname === '/api/auth/logout'
      || parsedUrl.pathname === '/api/health';

    if (!isApiRequest || isPublicAuthRoute) {
      return nativeFetch(input, {
        ...init,
        credentials: init.credentials || 'same-origin'
      });
    }

    const performRequest = async () => {
      const headers = new Headers(
        init.headers || (input instanceof Request ? input.headers : undefined)
      );
      const token = getAuthToken();
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      return nativeFetch(input, {
        ...init,
        headers,
        credentials: init.credentials || 'same-origin'
      });
    };

    let response = await performRequest();
    if (response.status === 401) {
      try {
        await refreshAuthToken();
      } catch (_error) {
        clearSession();
        showLogin();
        return response;
      }

      response = await performRequest();
      if (response.status === 401) {
        clearSession();
        showLogin();
      }
    }
    return response;
  };
}

ensureAuthFetchPatched();

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
  'La verdadera riqueza no se mide en números, sino en las vidas que tocas con autenticidad.',
  'El coraje no es la ausencia del miedo, sino la decisión de que algo más importa.',
  'Cada amanecer es una invitación sin firmar. Tú decides qué harás con ella.',
  'Las palabras que dices hoy pueden ser el ancla que alguien necesitaba para no hundirse.',
  'La disciplina es amor propio hecho acción, repetida hasta volverse arte.',
  'No buscamos clientes; encontramos personas que merecen un nuevo comienzo.',
  'Hay una diferencia entre trabajar duro y trabajar con propósito. Elige la segunda.',
  'El éxito más silencioso es el de quien alivia una carga que nadie más vio.',
  'En cada conversación hay una oportunidad de cambiar el rumbo de una historia.',
  'Los días difíciles construyen la resistencia que los días fáciles nunca podrían.',
  'Servir con excelencia es el arte de hacer lo ordinario de manera extraordinaria.',
  'La confianza se construye gota a gota. Cuídala como si no hubiera manera de rehacerla.',
  'Detrás de cada número hay una familia, una historia, un sueño que merece ser rescatado.',
  'El propósito más poderoso no es el que te mueve a ti, sino el que mueve a otros a través de ti.',
  'Hay días en que el simple hecho de aparecer ya es un acto de valentía. Aparece.',
  'Lo que haces cuando nadie mira define quién eres cuando todos miran.',
  'La empatía no es sentir lo que el otro siente; es recordar que también tiene derecho de sentirlo.',
  'Un momento de escucha verdadera vale más que mil palabras de consuelo vacío.',
  'El detalle que parece insignificante para ti puede ser el mundo entero para quien lo recibe.',
  'No medimos nuestro impacto en transacciones; lo medimos en transformaciones.',
  'La perseverancia es silenciosa. No anuncia su llegada; solo aparece, día tras día.',
  'Cuando el camino se nubla, el propósito es la brújula que nunca pierde el norte.',
  'Cada problema resuelto es una puerta que se abre donde antes había un muro.',
  'La grandeza no grita. Se construye en silencio, con hechos que hablan por sí solos.',
  'Nadie llega solo a donde quiere llegar. El arte está en ser el impulso de alguien más.',
  'La paciencia no es esperar; es mantener la calidad de tu trabajo mientras el tiempo hace lo suyo.',
  'Tu mejor versión no compite con nadie más, solo con quien fuiste ayer.',
  'Hay una forma de dar que no cuesta dinero: tu presencia, tu atención, tu tiempo.',
  'El trabajo bien hecho no necesita aplausos; ya lleva su recompensa adentro.',
  'Cada persona que ayudas a levantarse suma una historia más de valentía al mundo.',
  'La diferencia entre ordinario y extraordinario es ese pequeño extra que muy pocos están dispuestos a dar.',
  'Al final del día, no preguntes cuánto lograste. Pregunta cuánto importó.',
  'Meow',
];

const MEOW_QUOTE = 'Meow';
const MEOW_EVERY_N_QUOTES = 3;
const regularQuotes = quotes.filter((quote) => quote !== MEOW_QUOTE);
let regularQuoteIndex = 0;
let displayedQuoteCount = 0;
let loginBackgroundIndex = 0;
let loginBackgroundTransitionTimer = null;

if (quoteText && regularQuotes.length) {
  const initialQuote = String(quoteText.textContent || '').trim();
  const initialIndex = regularQuotes.indexOf(initialQuote);
  if (initialIndex >= 0) {
    regularQuoteIndex = (initialIndex + 1) % regularQuotes.length;
    displayedQuoteCount = 1;
  }
}

function getNextQuoteText() {
  displayedQuoteCount += 1;

  if (displayedQuoteCount % MEOW_EVERY_N_QUOTES === 0) {
    return MEOW_QUOTE;
  }

  if (!regularQuotes.length) {
    return MEOW_QUOTE;
  }

  const nextQuote = regularQuotes[regularQuoteIndex % regularQuotes.length];
  regularQuoteIndex = (regularQuoteIndex + 1) % regularQuotes.length;
  return nextQuote;
}

function syncQuoteVariant(quoteValue) {
  if (!quoteContainer) return;
  const normalizedQuote = String(quoteValue || '').trim();
  quoteContainer.classList.toggle('quote-meow', normalizedQuote === MEOW_QUOTE);
}

function rotateQuote() {
  if (!quoteText || authShell.classList.contains('hidden')) {
    return;
  }

  const nextQuote = getNextQuoteText();
  quoteText.animate([{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], {
    duration: 620,
    easing: 'ease-out'
  });
  quoteText.textContent = nextQuote;
  syncQuoteVariant(nextQuote);
}

syncQuoteVariant(quoteText ? quoteText.textContent : '');

setInterval(rotateQuote, 5200);

function applyLoginBackground(index, { animate = false } = {}) {
  if (!pageBg || !LOGIN_BACKGROUND_IMAGES.length) return;
  if (document.body.classList.contains('home-active')) return;

  const safeIndex = ((Number(index) || 0) + LOGIN_BACKGROUND_IMAGES.length) % LOGIN_BACKGROUND_IMAGES.length;
  loginBackgroundIndex = safeIndex;

  const nextImage = LOGIN_BACKGROUND_IMAGES[safeIndex];
  if (!animate) {
    pageBg.style.opacity = '1';
    pageBg.style.backgroundImage = `url('${nextImage}')`;
    return;
  }

  if (loginBackgroundTransitionTimer) {
    clearTimeout(loginBackgroundTransitionTimer);
    loginBackgroundTransitionTimer = null;
  }

  pageBg.style.opacity = '0.62';
  loginBackgroundTransitionTimer = setTimeout(() => {
    pageBg.style.backgroundImage = `url('${nextImage}')`;
    pageBg.style.opacity = '1';
    loginBackgroundTransitionTimer = null;
  }, LOGIN_BACKGROUND_FADE_OUT_MS);
}

function rotateLoginBackground() {
  if (!authShell || authShell.classList.contains('hidden')) return;
  if (document.body.classList.contains('home-active')) return;
  const nextIndex = (loginBackgroundIndex + 1) % LOGIN_BACKGROUND_IMAGES.length;
  applyLoginBackground(nextIndex, { animate: true });
}

setInterval(rotateLoginBackground, LOGIN_BACKGROUND_ROTATE_MS);

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && !String(url).includes('/api/auth/login')) {
      throw new Error('Sesion expirada. Inicia sesion nuevamente.');
    }
    const message = typeof data.message === 'string' ? data.message : 'Error en la solicitud.';
    throw new Error(message);
  }

  return data;
}

function sanitizeLoginPin(value) {
  return String(value || '').replace(/\D/g, '').slice(0, LOGIN_PIN_LENGTH);
}

function renderLoginPinDots(value = '') {
  const pinValue = sanitizeLoginPin(value);
  loginPinDots.forEach((dot, index) => {
    dot.classList.toggle('filled', index < pinValue.length);
  });
}

function setLoginPin(value) {
  if (!loginPinInput) return;
  const pinValue = sanitizeLoginPin(value);
  if (loginPinInput.value !== pinValue) {
    loginPinInput.value = pinValue;
  }
  renderLoginPinDots(pinValue);
}

function appendLoginPinDigit(digit) {
  if (!loginPinInput) return;
  const currentPin = sanitizeLoginPin(loginPinInput.value);
  if (currentPin.length >= LOGIN_PIN_LENGTH) return;
  setLoginPin(`${currentPin}${digit}`);
}

function removeLastLoginPinDigit() {
  if (!loginPinInput) return;
  const currentPin = sanitizeLoginPin(loginPinInput.value);
  if (!currentPin.length) return;
  setLoginPin(currentPin.slice(0, -1));
}

function clearLoginPin() {
  setLoginPin('');
}

function focusLoginPinInput() {
  if (!loginPinInput) return;
  loginPinInput.focus({ preventScroll: true });
}

function initLoginPinAuth() {
  if (!loginForm || !loginPinInput) return;

  renderLoginPinDots(loginPinInput.value);

  loginPinInput.addEventListener('input', () => {
    setLoginPin(loginPinInput.value);
  });

  loginPinInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      loginForm.requestSubmit();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      clearLoginPin();
      return;
    }

    if (
      event.key === 'Backspace'
      || event.key === 'Delete'
      || event.key === 'Tab'
      || event.key.startsWith('Arrow')
    ) {
      return;
    }

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      appendLoginPinDigit(event.key);
      return;
    }

    if (event.key.length === 1) {
      event.preventDefault();
    }
  });

  if (pinInputShell) {
    pinInputShell.addEventListener('click', () => {
      focusLoginPinInput();
    });
    pinInputShell.addEventListener('keydown', (event) => {
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        appendLoginPinDigit(event.key);
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        removeLastLoginPinDigit();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        clearLoginPin();
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        focusLoginPinInput();
      }
    });
  }

  if (loginPinPad) {
    loginPinPad.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-pin-digit], button[data-pin-action]');
      if (!button) return;

      const digit = button.dataset.pinDigit;
      const action = button.dataset.pinAction;

      if (digit && /^\d$/.test(digit)) {
        appendLoginPinDigit(digit);
      } else if (action === 'backspace') {
        removeLastLoginPinDigit();
      } else if (action === 'clear') {
        clearLoginPin();
      }

      focusLoginPinInput();
    });
  }
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
  syncNotifDotTarget();
}

function normalizePreferenceOwner(owner) {
  return String(owner || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '_');
}

function resolvePreferenceOwner(owner) {
  if (typeof owner === 'string') {
    return normalizePreferenceOwner(owner);
  }
  if (owner && typeof owner === 'object') {
    return normalizePreferenceOwner(owner.username || owner.name || '');
  }
  const session = getSession();
  return normalizePreferenceOwner(session?.username || session?.name || '');
}

function buildScopedPreferenceKey(baseKey, owner) {
  const normalizedOwner = normalizePreferenceOwner(owner);
  return normalizedOwner ? `${baseKey}__${normalizedOwner}` : baseKey;
}

function readScopedPreference(baseKey, owner) {
  const normalizedOwner = resolvePreferenceOwner(owner);
  if (normalizedOwner) {
    const scoped = localStorage.getItem(buildScopedPreferenceKey(baseKey, normalizedOwner));
    if (scoped) {
      return scoped;
    }
  }
  return localStorage.getItem(baseKey);
}

function writeScopedPreference(baseKey, value, owner) {
  const normalizedOwner = resolvePreferenceOwner(owner);
  if (normalizedOwner) {
    localStorage.setItem(buildScopedPreferenceKey(baseKey, normalizedOwner), value);
  }
  localStorage.setItem(baseKey, value);
}

function applyTheme(theme, { owner } = {}) {
  const selected = theme === 'light' ? 'light' : 'dark';

  document.body.classList.remove('theme-light', 'theme-dark');
  document.body.classList.add(selected === 'light' ? 'theme-light' : 'theme-dark');

  writeScopedPreference(THEME_KEY, selected, owner);
  syncAccentSwatchesForTheme(selected);

  if (themeSwitch) {
    themeSwitch.checked = selected === 'light';
    themeSwitch.setAttribute('aria-checked', selected === 'light' ? 'true' : 'false');
    themeSwitch.setAttribute(
      'aria-label',
      selected === 'light' ? 'Tema claro activo' : 'Tema oscuro activo'
    );
  }
}

function getInitialTheme(owner) {
  const savedTheme = readScopedPreference(THEME_KEY, owner);
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function normalizeThemeMode(themeValue) {
  return themeValue === 'light' ? 'light' : 'dark';
}

function getCurrentThemeMode() {
  return document.body.classList.contains('theme-light') ? 'light' : 'dark';
}

function getAccentStorageKeyForTheme(themeMode) {
  return `${COLOR_KEY}_${normalizeThemeMode(themeMode)}`;
}

function getAllowedAccentColors(themeMode = getCurrentThemeMode()) {
  const normalizedTheme = normalizeThemeMode(themeMode);
  return Array.isArray(ACCENT_COLORS_BY_THEME[normalizedTheme])
    ? ACCENT_COLORS_BY_THEME[normalizedTheme]
    : ACCENT_COLORS_BY_THEME.dark;
}

function getDefaultAccentColor(themeMode = getCurrentThemeMode()) {
  const normalizedTheme = normalizeThemeMode(themeMode);
  return ACCENT_COLOR_DEFAULT_BY_THEME[normalizedTheme] || 'azul';
}

function coerceAccentColorForTheme(color, themeMode = getCurrentThemeMode()) {
  const allowed = getAllowedAccentColors(themeMode);
  return allowed.includes(color) ? color : getDefaultAccentColor(themeMode);
}

function syncAccentSwatchesForTheme(themeMode = getCurrentThemeMode()) {
  const normalizedTheme = normalizeThemeMode(themeMode);
  const allowed = new Set(getAllowedAccentColors(normalizedTheme));
  document.querySelectorAll('.accent-swatch[data-color]').forEach((button) => {
    const color = String(button.dataset.color || '').trim().toLowerCase();
    const explicitTheme = String(button.dataset.theme || '').trim().toLowerCase();
    const shouldShow = explicitTheme
      ? explicitTheme === normalizedTheme
      : allowed.has(color);
    button.hidden = !shouldShow;
    button.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    button.tabIndex = shouldShow ? 0 : -1;
  });
}

function applyAccentColor(color, { owner, theme } = {}) {
  const themeMode = normalizeThemeMode(theme || getCurrentThemeMode());
  syncAccentSwatchesForTheme(themeMode);
  const normalizedColor = String(color || '').trim().toLowerCase().slice(0, 40);
  const selected = coerceAccentColorForTheme(normalizedColor, themeMode);
  ACCENT_COLOR_NAMES.forEach((c) => document.body.classList.remove(`color-${c}`));
  document.body.classList.add(`color-${selected}`);
  writeScopedPreference(getAccentStorageKeyForTheme(themeMode), selected, owner);
  writeScopedPreference(COLOR_KEY, selected, owner);
  document.querySelectorAll('.accent-swatch[data-color]').forEach((btn) => {
    const isActive = btn.dataset.color === selected;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-checked', String(isActive));
  });
}

function getInitialAccentColor(owner, theme = getCurrentThemeMode()) {
  const themeMode = normalizeThemeMode(theme);
  const savedByTheme = readScopedPreference(getAccentStorageKeyForTheme(themeMode), owner);
  if (savedByTheme) {
    return coerceAccentColorForTheme(savedByTheme, themeMode);
  }
  const saved = readScopedPreference(COLOR_KEY, owner);
  return coerceAccentColorForTheme(saved, themeMode);
}

// ---- Notificaciones ----
let _notifOpen = false;
let _notifListEventsBound = false;
let _notifUnreadCount = 0;
const NOTIF_EMPTY_TEXT = 'ni un grillo por estas lineas zzzz';

function _syncNotifRefs() {
  if (!notifPanel) notifPanel = document.getElementById('notifPanel');
  if (!notifBadge) notifBadge = document.getElementById('notifBadge');
  if (!notifList) notifList = document.getElementById('notifList');
  if (!notifMarkAll) notifMarkAll = document.getElementById('notifMarkAll');
}

function _renderNotifEmptyState() {
  if (!notifList) return;
  notifList.innerHTML = `<p class="notif-empty">${NOTIF_EMPTY_TEXT}</p>`;
}

function isToolbarExpanded() {
  return Boolean(toolbarWrap && toolbarWrap.classList.contains('expanded'));
}

function syncNotifDotTarget() {
  _syncNotifRefs();
  const hasUnread = _notifUnreadCount > 0;
  const showInNotifButton = hasUnread && isToolbarExpanded();
  const showInToggleButton = hasUnread && !isToolbarExpanded();

  if (notifBadge) {
    notifBadge.textContent = '';
    notifBadge.classList.toggle('visible', showInNotifButton);
  }
  if (toolbarToggle) {
    toolbarToggle.classList.toggle('has-notif-dot', showInToggleButton);
  }
}

function _notifTimeAgo(isoDate) {
  const diff = Date.now() - new Date(isoDate).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ahora mismo';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

function _notifIcon(type) {
  if (type === 'lead_assigned' || type === 'leads_assigned') {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>';
}

function _positionNotifPanel() {
  _syncNotifRefs();
  if (!notifPanel || !notifBtn) return;
  const rect = notifBtn.getBoundingClientRect();
  const panelWidth = notifPanel.offsetWidth || Number.parseFloat(window.getComputedStyle(notifPanel).width) || 392;
  const vpPad = 8;
  let left = rect.right - panelWidth;
  if (left < vpPad) left = vpPad;
  const top = rect.bottom + 8;
  notifPanel.style.left = `${left}px`;
  notifPanel.style.top = `${top}px`;
}

function renderNotifications(data) {
  _syncNotifRefs();
  if (!notifBadge) return;
  const { notifications = [], unreadCount = 0 } = data || {};
  _notifUnreadCount = Number(unreadCount) > 0 ? Number(unreadCount) : 0;
  syncNotifDotTarget();

  if (!notifList) return;

  if (!notifications.length) {
    _renderNotifEmptyState();
    return;
  }

  const esc = crmHelpers.escapeHtml
    ? (t) => crmHelpers.escapeHtml(t)
    : (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  notifList.innerHTML = notifications.map((n) => {
    const unread = !n.read_at;
    const normalizedType = String(n.type || 'info').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const normalizedLeadId = Number(n.lead_id);
    const leadIdAttr = Number.isInteger(normalizedLeadId) && normalizedLeadId > 0 ? String(normalizedLeadId) : '';
    return `<div class="notif-item${unread ? ' unread' : ''}" data-id="${n.id}" data-type="${normalizedType}" data-lead-id="${leadIdAttr}">
      <div class="notif-icon">${_notifIcon(n.type)}</div>
      <div class="notif-content">
        <p class="notif-title">${esc(n.title)}</p>
        <p class="notif-body">${esc(n.body)}</p>
        <p class="notif-time">${_notifTimeAgo(n.created_at)}</p>
      </div>
      <button class="notif-item-delete" type="button" data-delete-id="${n.id}" aria-label="Eliminar notificación">
        <svg viewBox="0 0 14 14" aria-hidden="true"><line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/></svg>
      </button>
    </div>`;
  }).join('');
}

async function refreshNotifications() {
  const session = getSession();
  if (!session?.username) return;
  try {
    const data = await requestJson(`/api/notifications?username=${encodeURIComponent(session.username)}`);
    renderNotifications(data);
  } catch (_) {}
}

async function _markAllNotificationsRead() {
  _syncNotifRefs();
  const session = getSession();
  if (!session?.username) return;
  try {
    await requestJson('/api/notifications/read', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: session.username })
    });
    _notifUnreadCount = 0;
    syncNotifDotTarget();
    if (notifList) notifList.querySelectorAll('.notif-item.unread').forEach((el) => el.classList.remove('unread'));
  } catch (_) {}
}

async function _deleteNotification(id) {
  _syncNotifRefs();
  const session = getSession();
  if (!session?.username) return;
  const item = notifList?.querySelector(`.notif-item[data-id="${id}"]`);
  if (item) {
    item.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    item.style.opacity = '0';
    item.style.transform = 'translateX(12px)';
    setTimeout(() => {
      item.remove();
      if (notifList && !notifList.querySelector('.notif-item')) {
        _renderNotifEmptyState();
      }
    }, 200);
  }
  try {
    await requestJson(`/api/notifications/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: session.username })
    });
  } catch (_) {}
}

function _bindNotifListEvents() {
  _syncNotifRefs();
  if (!notifList || _notifListEventsBound) return;
  _notifListEventsBound = true;
  notifList.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('[data-delete-id]');
    if (deleteBtn) {
      e.stopPropagation();
      void _deleteNotification(deleteBtn.dataset.deleteId);
      return;
    }
    const item = e.target.closest('.notif-item[data-id]');
    if (!item) return;

    const notifType = String(item.dataset.type || '').toLowerCase();
    if (notifType === 'leads_assigned' || notifType === 'lead_assigned') {
      const session = getSession();
      const username = String(session?.username || '').trim();
      if (username) {
        setLeadSearchQuery(username, { syncInput: true });
        if (searchClearBtn) searchClearBtn.classList.add('has-text');
      }
      setNotifPanelOpen(false);
      showLeadsView();
      if (window.location.hash !== '#leads') {
        window.location.hash = 'leads';
      }
      return;
    }

    if (!item.dataset.leadId) return;
    setNotifPanelOpen(false);
    window.location.href = `/client.html?id=${item.dataset.leadId}`;
  });
}

function setNotifPanelOpen(open) {
  _notifOpen = open;
  _syncNotifRefs();
  if (!notifPanel || !notifBtn) return;
  if (open) {
    _bindNotifListEvents();
    _positionNotifPanel();
    notifPanel.classList.add('visible');
    notifBtn.setAttribute('aria-expanded', 'true');
    void refreshNotifications().then(() => {
      if (_notifOpen) void _markAllNotificationsRead();
    });
  } else {
    notifPanel.classList.remove('visible');
    notifBtn.setAttribute('aria-expanded', 'false');
  }
}

function showDashboard() {
  authShell.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  document.body.classList.add('home-active');
  updateSessionHandleTag();
  syncManageUsersButtonVisibility();
  if (loginBackgroundTransitionTimer) {
    clearTimeout(loginBackgroundTransitionTimer);
    loginBackgroundTransitionTimer = null;
  }
  if (pageBg) pageBg.style.opacity = '1';
  if (pageBg) pageBg.style.backgroundImage = '';
}

function showLogin() {
  dashboardView.classList.add('hidden');
  if (calendarView) calendarView.classList.add('hidden');
  if (emailsView) emailsView.classList.add('hidden');
  if (usersAdminView) usersAdminView.classList.add('hidden');
  if (scheduleTaskModal) scheduleTaskModal.classList.add('hidden');
  authShell.classList.remove('hidden');
  document.body.classList.remove('home-active');
  applyLoginBackground(loginBackgroundIndex);
  loginStatus.textContent = '';
  if (loginForm) loginForm.reset();
  clearLoginPin();
  setTimeout(() => {
    if (loginIdentifierInput) loginIdentifierInput.focus();
  }, 0);
  _notifUnreadCount = 0;
  syncNotifDotTarget();
  setAccountMenu(false);
  setToolbarExpanded(false);
  isLeadsView = false;
  isCalendarView = false;
  isEmailsView = false;
  scheduleTasks = [];
  scheduleTasksLoaded = false;
  scheduleOwnerKey = '';
  scheduleScope = 'mine';
  scheduleOwnerFilter = '';
  scheduleOwnerMembers = [];
  scheduleOwnerMembersLoaded = false;
  scheduleOwnerMembersPromise = null;
  scheduleOwnerSearchTerm = '';
  scheduleOwnerMenuOpen = false;
  scheduleDeleteTaskInFlight = null;
  scheduleCompleteLeadInFlight = null;
  scheduleTaskModalOpen = false;
  scheduleTaskDraftType = 'general';
  scheduleTaskSubmitInFlight = false;
  scheduleTaskLeadMatches = [];
  scheduleTaskLeadActiveIndex = -1;
  scheduleTaskLeadLoadPromise = null;
  scheduleNotes = [];
  allEmailsCache = [];
  emailsLoaded = false;
  selectedEmailIds = new Set();
  updateEmailsCounter(0);
  updateSessionHandleTag(null);
  syncManageUsersButtonVisibility();
  closeUsersAdminRoleMenu();
  closeUsersAdminPermissionsMenu();
}

function saveSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  updateSessionHandleTag(user);
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
  clearAuthToken();
  updateSessionHandleTag(null);
}

function getSessionHandleLabel(session = getSession()) {
  const displayName = String(session?.displayName || session?.name || '').trim();
  const username = String(session?.username || session?.name || '').trim();
  const handleBase = displayName || username;
  if (!handleBase) return '';
  return `@${handleBase}`;
}

function getSessionRoleBadgeMeta(session = getSession()) {
  const role = getSessionIdentity(session).role;
  if (role === 'admin') return { key: 'admin', label: 'Admin' };
  if (role === 'supervisor') return { key: 'supervisor', label: 'Sup' };
  if (role === 'seller') return { key: 'seller', label: 'Seller' };
  return { key: '', label: '' };
}

function updateSessionHandleTag(session = getSession()) {
  if (!sessionHandleTag) return;
  const nextHandle = getSessionHandleLabel(session);
  const roleMeta = getSessionRoleBadgeMeta(session);
  sessionHandleTag.textContent = '';
  sessionHandleTag.classList.toggle('hidden', !nextHandle);
  sessionHandleTag.classList.remove('role-admin', 'role-supervisor', 'role-seller');
  if (nextHandle) {
    const handleText = document.createElement('span');
    handleText.className = 'session-handle-text';
    handleText.textContent = nextHandle;
    sessionHandleTag.appendChild(handleText);

    if (roleMeta.label) {
      const roleBadge = document.createElement('span');
      roleBadge.className = `session-role-badge ${roleMeta.key}`;
      roleBadge.textContent = roleMeta.label;
      sessionHandleTag.appendChild(roleBadge);
      sessionHandleTag.classList.add(`role-${roleMeta.key}`);
    }

    sessionHandleTag.setAttribute('title', roleMeta.label ? `${nextHandle} - ${roleMeta.label}` : nextHandle);
  } else {
    sessionHandleTag.removeAttribute('title');
  }
}

function normalizeSessionRole(roleValue) {
  const normalizedRole = String(roleValue || '').trim().toLowerCase();
  if (normalizedRole === 'admin' || normalizedRole === 'administrador') return 'admin';
  if (normalizedRole === 'supervisor' || normalizedRole === 'supervisora') return 'supervisor';
  if (normalizedRole === 'seller' || normalizedRole === 'agente') return 'seller';
  return '';
}

function getSessionIdentity(session = getSession()) {
  const username = String(session?.username || session?.name || '').trim();
  const displayName = String(session?.displayName || session?.name || '').trim();
  const email = String(session?.email || '').trim();
  const permissions = Array.isArray(session?.permissions)
    ? session.permissions
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
    : [];
  let role = normalizeSessionRole(session?.role);
  const usernameLower = username.toLowerCase();
  const displayNameLower = displayName.toLowerCase();

  if (!role) {
    if (usernameLower === 'admin' || displayNameLower === 'admin' || email.toLowerCase() === 'elliot.perez@cerodeuda.com') {
      role = 'admin';
    } else if (usernameLower === 'elliot' || displayNameLower === 'demo seller') {
      role = 'seller';
    }
  }

  return {
    username,
    displayName,
    email,
    role,
    permissions
  };
}

function isCurrentSessionAdmin() {
  return getSessionIdentity().role === 'admin';
}

function hasCurrentSessionGlobalAccess() {
  return hasCurrentSessionPermission('emails.view_all')
    || hasCurrentSessionPermission('leads.view_all');
}

function hasCurrentSessionPermission(permissionKey) {
  const normalizedKey = String(permissionKey || '').trim().toLowerCase();
  if (!normalizedKey) return false;
  const identity = getSessionIdentity();
  if (identity.permissions.includes(normalizedKey)) return true;

  if (normalizedKey === 'emails.view_all' || normalizedKey === 'emails.delete' || normalizedKey === 'leads.view_all' || normalizedKey === 'leads.delete') {
    return identity.role === 'admin' || identity.role === 'supervisor';
  }
  if (normalizedKey === 'emails.send' || normalizedKey === 'leads.create' || normalizedKey === 'leads.edit' || normalizedKey === 'notes.manage') {
    return identity.role === 'admin' || identity.role === 'supervisor' || identity.role === 'seller';
  }
  if (normalizedKey === 'callbacks.view_all' || normalizedKey === 'audit.view') {
    return identity.role === 'admin' || identity.role === 'supervisor';
  }
  if (normalizedKey === 'callbacks.complete_assigned' || normalizedKey === 'tasks.manage' || normalizedKey === 'files.manage') {
    return identity.role === 'admin' || identity.role === 'supervisor' || identity.role === 'seller';
  }
  if (normalizedKey === 'users.manage' || normalizedKey === 'users.permissions.manage') {
    return identity.role === 'admin';
  }
  return false;
}

function userEscapeHtml(text) {
  if (crmHelpers.escapeHtml) return crmHelpers.escapeHtml(text);
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function syncManageUsersButtonVisibility() {
  if (!manageUsersBtn) return;
  manageUsersBtn.classList.toggle('hidden', !hasCurrentSessionPermission('users.manage'));
}

function normalizeAdminUserRole(roleValue) {
  const normalizedRole = String(roleValue || '').trim().toLowerCase();
  if (normalizedRole === 'admin') return 'admin';
  if (normalizedRole === 'supervisor') return 'supervisor';
  if (normalizedRole === 'seller' || normalizedRole === 'agent' || normalizedRole === 'vendedor') return 'seller';
  return 'seller';
}

function getAdminRoleRank(roleValue) {
  const role = normalizeAdminUserRole(roleValue);
  if (role === 'admin') return 3;
  if (role === 'supervisor') return 2;
  return 1;
}

function getAdminRoleLabel(roleValue) {
  const role = normalizeAdminUserRole(roleValue);
  if (role === 'admin') return 'Administrador';
  if (role === 'supervisor') return 'Supervisor';
  return 'Agent/Vendedor';
}

function normalizeUsersAdminCategory(categoryValue) {
  const normalized = String(categoryValue || '').trim().toLowerCase();
  if (normalized === 'admin' || normalized === 'supervisor' || normalized === 'seller') return normalized;
  return 'all';
}

function renderUsersAdminCategoryRail(groupedUsers = {}) {
  if (!usersAdminCategoryRail) return;
  const countAdmin = Array.isArray(groupedUsers.admin) ? groupedUsers.admin.length : 0;
  const countSupervisor = Array.isArray(groupedUsers.supervisor) ? groupedUsers.supervisor.length : 0;
  const countSeller = Array.isArray(groupedUsers.seller) ? groupedUsers.seller.length : 0;
  const countAll = countAdmin + countSupervisor + countSeller;
  const categories = [
    { key: 'all', label: 'Todos', count: countAll },
    { key: 'admin', label: 'Administradores', count: countAdmin },
    { key: 'supervisor', label: 'Supervisores', count: countSupervisor },
    { key: 'seller', label: 'Agents/Vendedores', count: countSeller }
  ];

  usersAdminCategoryRail.innerHTML = categories.map((category) => {
    const isActive = usersAdminActiveCategory === category.key;
    return `
      <button
        class="users-admin-category-btn${isActive ? ' is-active' : ''}"
        type="button"
        data-users-admin-category="${category.key}"
        aria-pressed="${isActive ? 'true' : 'false'}"
      >
        <span>${category.label}</span>
        <small>${category.count}</small>
      </button>
    `;
  }).join('');
}

function getAdminRoleTransitions(currentRoleValue) {
  const currentRole = normalizeAdminUserRole(currentRoleValue);
  const allRoles = ['admin', 'supervisor', 'seller'];
  return allRoles
    .filter((role) => role !== currentRole)
    .sort((a, b) => getAdminRoleRank(b) - getAdminRoleRank(a));
}

function setUsersAdminFormOpen(isOpen, { focusUsername = false } = {}) {
  usersAdminFormOpen = Boolean(isOpen);
  if (usersAdminLayout) usersAdminLayout.classList.toggle('form-open', usersAdminFormOpen);
  if (usersAdminView) usersAdminView.classList.toggle('form-open', usersAdminFormOpen);
  if (usersAdminToggleCreateBtn) {
    usersAdminToggleCreateBtn.classList.toggle('is-open', usersAdminFormOpen);
    usersAdminToggleCreateBtn.setAttribute('aria-expanded', usersAdminFormOpen ? 'true' : 'false');
  }
  if (usersAdminFormPanel) {
    usersAdminFormPanel.setAttribute('aria-hidden', usersAdminFormOpen ? 'false' : 'true');
  }
  if (!usersAdminFormOpen) {
    closeUsersAdminRoleMenu();
    closeUsersAdminPermissionsMenu();
  } else if (focusUsername && usersAdminUsername && !usersAdminUsername.disabled) {
    window.requestAnimationFrame(() => usersAdminUsername.focus());
  }
}

function setUsersAdminStatus(message) {
  if (!usersAdminStatus) return;
  const text = String(message || '').trim();
  usersAdminStatus.textContent = text;
  usersAdminStatus.classList.toggle('hidden', !text);
}

function resetUsersAdminForm(user = null) {
  if (!usersAdminForm) return;
  const hasUser = Boolean(user && user.id);

  if (usersAdminId) usersAdminId.value = hasUser ? String(user.id) : '';
  if (usersAdminUsername) {
    usersAdminUsername.value = hasUser ? String(user.username || '') : '';
    usersAdminUsername.disabled = hasUser;
  }
  if (usersAdminDisplayName) usersAdminDisplayName.value = hasUser ? String(user.display_name || '') : '';
  if (usersAdminEmail) usersAdminEmail.value = hasUser ? String(user.email || '') : '';
  if (usersAdminRole) usersAdminRole.value = hasUser ? normalizeAdminUserRole(user.role || 'seller') : 'seller';
  if (usersAdminPin) usersAdminPin.value = '';
  if (usersAdminIsActive) usersAdminIsActive.checked = hasUser ? Boolean(user.is_active) : true;
  if (usersAdminFormTitle) usersAdminFormTitle.textContent = hasUser ? `Editar usuario @${user.username}` : 'Nuevo usuario';
}

function closeUsersAdminRoleMenu() {
  if (!usersAdminRoleMenu) return;
  usersAdminRoleMenu.classList.add('hidden');
}

function closeUsersAdminPermissionsMenu() {
  if (!usersAdminPermissionsMenu) return;
  usersAdminPermissionsMenu.classList.add('hidden');
}

function getUsersAdminPermissionModuleLabel(moduleValue) {
  const moduleKey = String(moduleValue || '').trim().toLowerCase();
  if (moduleKey === 'usuarios') return 'Usuarios';
  if (moduleKey === 'leads') return 'Leads';
  if (moduleKey === 'correos') return 'Correos';
  if (moduleKey === 'operacion') return 'Operacion';
  if (moduleKey === 'documentos') return 'Documentos';
  return moduleKey ? moduleKey.charAt(0).toUpperCase() + moduleKey.slice(1) : 'General';
}

async function loadUsersAdminPermissionCatalog() {
  if (usersAdminPermissionCatalog.length) return usersAdminPermissionCatalog;
  const data = await requestJson('/api/admin/permissions/catalog', { cache: 'no-store' });
  usersAdminPermissionCatalog = Array.isArray(data?.permissions) ? data.permissions : [];
  usersAdminPermissionByRoleMatrix = data?.roleMatrix && typeof data.roleMatrix === 'object'
    ? data.roleMatrix
    : {};
  return usersAdminPermissionCatalog;
}

function ensureUsersAdminPermissionsMenu() {
  if (usersAdminPermissionsMenu && document.body.contains(usersAdminPermissionsMenu)) {
    return usersAdminPermissionsMenu;
  }

  const menu = document.createElement('div');
  menu.className = 'users-admin-permissions-menu hidden';
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', 'Permisos del usuario');
  menu.addEventListener('click', (event) => {
    event.stopPropagation();
    const closeBtn = event.target.closest('[data-permissions-close]');
    if (closeBtn) {
      closeUsersAdminPermissionsMenu();
      return;
    }

    const refreshBtn = event.target.closest('[data-permissions-refresh]');
    if (refreshBtn) {
      const userId = Number(menu.dataset.userId || 0);
      const anchorUser = adminUsersCache.find((entry) => Number(entry.id) === userId);
      if (!anchorUser) return;
      void openUsersAdminPermissionsMenu(refreshBtn, anchorUser, { forceReload: true });
    }
  });

  menu.addEventListener('change', async (event) => {
    const checkbox = event.target instanceof HTMLInputElement
      ? event.target
      : null;
    if (!checkbox || !checkbox.matches('.users-admin-permission-checkbox[data-permission-key]')) return;

    const userId = Number(menu.dataset.userId || 0);
    const permissionKey = String(checkbox.dataset.permissionKey || '').trim().toLowerCase();
    const roleAllowed = checkbox.dataset.roleAllowed === 'true';
    if (!Number.isInteger(userId) || userId <= 0 || !permissionKey) return;

    checkbox.disabled = true;
    try {
      const allowedPayload = checkbox.checked === roleAllowed ? null : checkbox.checked;
      const data = await requestJson(`/api/admin/users/${userId}/permissions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permissionKey,
          allowed: allowedPayload
        })
      });

      const targetUser = data?.user || adminUsersCache.find((entry) => Number(entry.id) === userId);
      const permissionRows = Array.isArray(data?.permissions) ? data.permissions : [];
      renderUsersAdminPermissionsMenu(menu, targetUser, permissionRows);
      showToast(data?.message || 'Permiso actualizado.', 'success');
    } catch (error) {
      checkbox.checked = !checkbox.checked;
      showToast(error.message || 'No se pudo actualizar el permiso.', 'error');
    } finally {
      checkbox.disabled = false;
    }
  });

  document.body.appendChild(menu);
  usersAdminPermissionsMenu = menu;
  return usersAdminPermissionsMenu;
}

function positionUsersAdminPermissionsMenu(anchorEl, menuEl) {
  if (!anchorEl || !menuEl) return;
  const rect = anchorEl.getBoundingClientRect();
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const margin = 12;

  const menuWidth = Math.min(420, Math.max(320, Math.floor(vw * 0.42)));
  menuEl.style.width = `${menuWidth}px`;
  const measuredHeight = menuEl.offsetHeight || 420;

  let left = rect.right + 8;
  if (left + menuWidth > vw - margin) {
    left = rect.left - menuWidth - 8;
  }
  if (left < margin) left = margin;

  let top = rect.top;
  if (top + measuredHeight > vh - margin) {
    top = vh - measuredHeight - margin;
  }
  if (top < margin) top = margin;

  menuEl.style.left = `${Math.round(left)}px`;
  menuEl.style.top = `${Math.round(top)}px`;
}

function renderUsersAdminPermissionsMenu(menu, user, permissionRows = []) {
  const safeUser = user || {};
  const username = userEscapeHtml(String(safeUser.username || ''));
  const displayName = userEscapeHtml(String(safeUser.display_name || safeUser.displayName || safeUser.username || ''));
  const role = normalizeAdminUserRole(safeUser.role || 'seller');
  const roleLabel = userEscapeHtml(getAdminRoleLabel(role));

  const grouped = new Map();
  permissionRows.forEach((permission) => {
    const moduleLabel = getUsersAdminPermissionModuleLabel(permission.module);
    if (!grouped.has(moduleLabel)) grouped.set(moduleLabel, []);
    grouped.get(moduleLabel).push(permission);
  });

  const moduleEntries = Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'es', { sensitivity: 'base' }))
    .map(([moduleLabel, list]) => {
      const rowsMarkup = list
        .sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'es', { sensitivity: 'base' }))
        .map((permission) => {
          const effectiveAllowed = Boolean(permission.effectiveAllowed);
          const roleAllowed = Boolean(permission.roleAllowed);
          const hasOverride = permission.overrideAllowed === true || permission.overrideAllowed === false;
          const stateClass = effectiveAllowed ? 'is-on' : 'is-off';
          return `
            <label class="users-admin-permission-row ${stateClass}">
              <input
                class="users-admin-permission-checkbox"
                type="checkbox"
                data-permission-key="${userEscapeHtml(permission.key)}"
                data-role-allowed="${roleAllowed ? 'true' : 'false'}"
                ${effectiveAllowed ? 'checked' : ''}
              />
              <span class="users-admin-permission-copy">
                <strong>${userEscapeHtml(permission.label || permission.key)}</strong>
                <small>${userEscapeHtml(permission.description || '')}</small>
              </span>
              <span class="users-admin-permission-flags">
                <span class="users-admin-permission-base">Base: ${roleAllowed ? 'ON' : 'OFF'}</span>
                ${hasOverride ? '<span class="users-admin-permission-override">Override</span>' : ''}
              </span>
            </label>
          `;
        }).join('');

      return `
        <section class="users-admin-permission-group">
          <h5>${moduleLabel}</h5>
          <div class="users-admin-permission-group-body">
            ${rowsMarkup}
          </div>
        </section>
      `;
    }).join('');

  menu.dataset.userId = String(safeUser.id || '');
  menu.innerHTML = `
    <header class="users-admin-permissions-head">
      <div class="users-admin-permissions-title-wrap">
        <p class="users-admin-permissions-title">Permisos de ${displayName}</p>
        <p class="users-admin-permissions-subtitle">@${username} · ${roleLabel}</p>
      </div>
      <button class="users-admin-permissions-close modal-close-mac" type="button" data-permissions-close aria-label="Cerrar panel de permisos" title="Cerrar panel de permisos"></button>
    </header>
    <div class="users-admin-permissions-body">
      ${moduleEntries || '<p class="users-admin-permission-empty">No hay permisos disponibles.</p>'}
    </div>
    <footer class="users-admin-permissions-footer">
      <button class="users-admin-permissions-refresh" type="button" data-permissions-refresh>Recargar</button>
      <span>Tip: si un valor coincide con la base de rol, se elimina el override.</span>
    </footer>
  `;
}

async function openUsersAdminPermissionsMenu(anchorEl, user, { forceReload = false } = {}) {
  const menu = ensureUsersAdminPermissionsMenu();
  const userId = Number(user?.id || 0);
  if (!Number.isInteger(userId) || userId <= 0) return;

  closeUsersAdminRoleMenu();
  closeUsersAdminPermissionsMenu();
  menu.dataset.userId = String(userId);
  menu.innerHTML = '<div class="users-admin-permissions-loading">Cargando permisos...</div>';
  menu.classList.remove('hidden');
  positionUsersAdminPermissionsMenu(anchorEl, menu);

  try {
    if (forceReload) {
      usersAdminPermissionCatalog = [];
      usersAdminPermissionByRoleMatrix = {};
    }
    await loadUsersAdminPermissionCatalog();
    const data = await requestJson(`/api/admin/users/${userId}/permissions`, { cache: 'no-store' });
    const permissionRows = Array.isArray(data?.permissions) ? data.permissions : [];
    renderUsersAdminPermissionsMenu(menu, data?.user || user, permissionRows);
    positionUsersAdminPermissionsMenu(anchorEl, menu);
  } catch (error) {
    menu.innerHTML = `
      <div class="users-admin-permissions-error">
        <strong>No se pudieron cargar permisos.</strong>
        <p>${userEscapeHtml(error.message || 'Intenta nuevamente.')}</p>
      </div>
    `;
    positionUsersAdminPermissionsMenu(anchorEl, menu);
  }
}

function ensureUsersAdminRoleMenu() {
  if (usersAdminRoleMenu && document.body.contains(usersAdminRoleMenu)) {
    return usersAdminRoleMenu;
  }

  const menu = document.createElement('div');
  menu.className = 'users-admin-role-menu hidden';
  menu.setAttribute('role', 'menu');
  menu.addEventListener('click', async (event) => {
    event.stopPropagation();
    const optionBtn = event.target.closest('.users-admin-role-menu-btn[data-next-role]');
    if (!optionBtn) return;

    const userId = Number(menu.dataset.userId || 0);
    const nextRole = normalizeAdminUserRole(optionBtn.dataset.nextRole || '');
    if (!Number.isInteger(userId) || userId <= 0) return;

    closeUsersAdminRoleMenu();
    await updateUserRoleFromBadge(userId, nextRole);
  });
  document.body.appendChild(menu);
  usersAdminRoleMenu = menu;
  return usersAdminRoleMenu;
}

function positionUsersAdminRoleMenu(anchorEl, menuEl) {
  if (!anchorEl || !menuEl) return;
  const rect = anchorEl.getBoundingClientRect();
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const margin = 10;

  const menuWidth = menuEl.offsetWidth || 220;
  const menuHeight = menuEl.offsetHeight || 120;

  let left = rect.right - menuWidth;
  if (left < margin) left = margin;
  if (left + menuWidth > vw - margin) left = vw - margin - menuWidth;

  let top = rect.bottom + 8;
  if (top + menuHeight > vh - margin) {
    top = Math.max(margin, rect.top - menuHeight - 8);
  }

  menuEl.style.left = `${Math.round(left)}px`;
  menuEl.style.top = `${Math.round(top)}px`;
}

function openUsersAdminRoleMenu(anchorEl, user) {
  const menu = ensureUsersAdminRoleMenu();
  const userId = Number(user?.id || 0);
  if (!Number.isInteger(userId) || userId <= 0) return;

  const currentRole = normalizeAdminUserRole(user?.role || 'seller');
  const transitions = getAdminRoleTransitions(currentRole);
  if (!transitions.length) return;

  const transitionButtons = transitions.map((nextRole) => {
    const currentRank = getAdminRoleRank(currentRole);
    const nextRank = getAdminRoleRank(nextRole);
    const actionLabel = nextRank > currentRank ? 'Upgrade a' : 'Downgrade a';
    return `
      <button class="users-admin-role-menu-btn" type="button" data-next-role="${nextRole}">
        <span>${actionLabel}</span>
        <strong>${userEscapeHtml(getAdminRoleLabel(nextRole))}</strong>
      </button>
    `;
  }).join('');

  menu.dataset.userId = String(userId);
  menu.innerHTML = `
    <p class="users-admin-role-menu-title">Cambiar rol</p>
    ${transitionButtons}
  `;
  menu.classList.remove('hidden');
  closeUsersAdminPermissionsMenu();
  positionUsersAdminRoleMenu(anchorEl, menu);
}

async function updateUserRoleFromBadge(userId, nextRoleValue) {
  const userIdNum = Number(userId);
  if (!Number.isInteger(userIdNum) || userIdNum <= 0) return;

  const nextRole = normalizeAdminUserRole(nextRoleValue);
  const targetUser = adminUsersCache.find((entry) => Number(entry.id) === userIdNum);
  if (!targetUser) return;

  const targetUsername = String(targetUser.username || '').trim().toLowerCase();
  const identity = getSessionIdentity();
  const selfUsername = String(identity.username || '').trim().toLowerCase();
  if (selfUsername && targetUsername && selfUsername === targetUsername && nextRole !== 'admin') {
    showToast('No puedes degradar tu propio usuario admin.', 'error');
    return;
  }

  try {
    await requestJson(`/api/admin/users/${userIdNum}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: nextRole })
    });
    showToast(`Rol actualizado a ${getAdminRoleLabel(nextRole)}.`, 'success');
    await loadAdminUsers({ silent: true });

    const editingId = Number(usersAdminId?.value || 0);
    if (editingId === userIdNum) {
      const refreshedUser = adminUsersCache.find((entry) => Number(entry.id) === userIdNum);
      if (refreshedUser) resetUsersAdminForm(refreshedUser);
    }
  } catch (error) {
    showToast(error.message || 'No se pudo actualizar el rol del usuario.', 'error');
  }
}

function renderAdminUsersList(users = []) {
  if (!usersAdminList) return;
  if (usersAdminActiveTotal) {
    const activeCount = users.filter((user) => Boolean(user?.is_active)).length;
    usersAdminActiveTotal.textContent = String(activeCount);
  }

  const groupedUsers = {
    admin: [],
    supervisor: [],
    seller: []
  };

  users.forEach((user) => {
    const role = normalizeAdminUserRole(user.role);
    groupedUsers[role].push(user);
  });

  Object.keys(groupedUsers).forEach((roleKey) => {
    groupedUsers[roleKey].sort((a, b) => {
      const nameA = String(a.display_name || a.username || '').toLowerCase();
      const nameB = String(b.display_name || b.username || '').toLowerCase();
      return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
    });
  });

  usersAdminActiveCategory = normalizeUsersAdminCategory(usersAdminActiveCategory);
  renderUsersAdminCategoryRail(groupedUsers);

  if (!users.length) {
    usersAdminList.innerHTML = '<p class="users-admin-status">No hay usuarios registrados.</p>';
    return;
  }

  const orderedGroups = ['admin', 'supervisor', 'seller'];
  const selectedUsers = usersAdminActiveCategory === 'all'
    ? orderedGroups.flatMap((roleKey) => groupedUsers[roleKey] || [])
    : (groupedUsers[usersAdminActiveCategory] || []);

  if (!selectedUsers.length) {
    usersAdminList.innerHTML = '<p class="users-admin-group-empty">Sin usuarios en esta categoria.</p>';
    return;
  }

  usersAdminList.innerHTML = selectedUsers.map((user) => {
    const role = normalizeAdminUserRole(user.role);
    const roleClass = role;
    const inactiveClass = user.is_active ? '' : ' inactive';
    const displayNameRaw = String(user.display_name || user.username || '').trim();
    const displayName = userEscapeHtml(displayNameRaw);
    const username = userEscapeHtml(String(user.username || ''));
    const email = userEscapeHtml(String(user.email || 'Sin email'));
    const lastLoginRaw = user.last_login_at ? new Date(user.last_login_at) : null;
    const lastLogin = lastLoginRaw && !Number.isNaN(lastLoginRaw.getTime())
      ? lastLoginRaw.toLocaleString('es-ES')
      : 'Nunca';
    const stateMeta = user.is_active ? '' : '<span class="users-admin-item-state">Inactivo</span>';

    const lastSeenRaw = user.last_seen_at ? new Date(user.last_seen_at) : null;
    const isOnline = lastSeenRaw && !Number.isNaN(lastSeenRaw.getTime())
      && (Date.now() - lastSeenRaw.getTime()) < 90000;
    const presenceClass = isOnline ? 'online' : 'offline';
    const presenceLabel = isOnline ? 'En línea' : 'Desconectado';

    return `
      <article class="users-admin-item${inactiveClass}">
        <div class="users-admin-item-head">
          <span class="users-admin-item-name">
            <span class="users-admin-presence-dot ${presenceClass}" title="${presenceLabel}" aria-label="${presenceLabel}"></span>
            <span class="users-admin-item-display">${displayName}</span>
            <span class="users-admin-item-sep" aria-hidden="true">&middot;</span>
            <span class="users-admin-item-handle">@${username}</span>
            <span class="users-admin-item-sep" aria-hidden="true">&middot;</span>
            <span class="users-admin-item-email">${email}</span>
          </span>
          <div class="users-admin-item-actions">
            <button
              class="users-admin-role ${roleClass}"
              type="button"
              data-role-user-id="${user.id}"
              aria-label="Cambiar rol de ${displayName}"
            >
              ${userEscapeHtml(getAdminRoleLabel(role))}
            </button>
            <button class="users-admin-item-btn users-admin-permissions-btn" type="button" data-permissions-user-id="${user.id}" aria-label="Configurar permisos de ${displayName}" title="Permisos">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l7 4v6c0 5-3.5 9.7-7 10-3.5-.3-7-5-7-10V6l7-4z"/><path d="M9.5 12.5l2 2 3-3"/></svg>
            </button>
            <button class="users-admin-item-btn users-admin-edit-btn" type="button" data-user-id="${user.id}" aria-label="Editar ${displayName}" title="Editar">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>
        </div>
        <div class="users-admin-item-meta users-admin-item-meta-row">
          <span>Ultimo login: ${userEscapeHtml(lastLogin)}</span>
          ${stateMeta}
        </div>
      </article>
    `;
  }).join('');
}

async function loadAdminUsers({ silent = false } = {}) {
  if (!hasCurrentSessionPermission('users.manage')) return [];
  try {
    if (!silent) setUsersAdminStatus('Cargando usuarios...');
    const data = await requestJson('/api/admin/users', { cache: 'no-store' });
    adminUsersCache = Array.isArray(data.users) ? data.users : [];
    renderAdminUsersList(adminUsersCache);
    setUsersAdminStatus('');
    return adminUsersCache;
  } catch (error) {
    setUsersAdminStatus(error.message || 'No se pudieron cargar usuarios.');
    return [];
  }
}

if (themeSwitch) {
  themeSwitch.addEventListener('change', () => {
    const nextTheme = themeSwitch.checked ? 'light' : 'dark';
    const currentSession = getSession();
    applyTheme(nextTheme, { owner: currentSession });
    applyAccentColor(getInitialAccentColor(currentSession, nextTheme), {
      owner: currentSession,
      theme: nextTheme
    });
  });
}

if (accountMenu) {
  accountMenu.addEventListener('click', (event) => {
    const swatch = event.target.closest('.accent-swatch[data-color]');
    if (swatch) applyAccentColor(swatch.dataset.color);
  });
}

if (manageUsersBtn) {
  manageUsersBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    setAccountMenu(false);
    if (window.location.hash !== '#admin-users') {
      window.location.hash = 'admin-users';
    } else {
      showUsersAdminView();
    }
  });
}

if (refreshUsersAdminBtn) {
  refreshUsersAdminBtn.addEventListener('click', () => {
    void loadAdminUsers();
  });
}

if (usersAdminToggleCreateBtn) {
  usersAdminToggleCreateBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const nextOpen = !usersAdminFormOpen;
    if (nextOpen) {
      resetUsersAdminForm(null);
    }
    setUsersAdminFormOpen(nextOpen, { focusUsername: nextOpen });
  });
}

if (usersAdminView) {
  usersAdminView.addEventListener('click', (event) => {
    const categoryBtn = event.target.closest('.users-admin-category-btn[data-users-admin-category]');
    if (categoryBtn) {
      const nextCategory = normalizeUsersAdminCategory(categoryBtn.dataset.usersAdminCategory);
      if (nextCategory !== usersAdminActiveCategory) {
        usersAdminActiveCategory = nextCategory;
        renderAdminUsersList(adminUsersCache);
      }
      return;
    }

    const roleBtn = event.target.closest('.users-admin-role[data-role-user-id]');
    if (roleBtn) {
      event.stopPropagation();
      const userId = Number(roleBtn.dataset.roleUserId || 0);
      const selectedUser = adminUsersCache.find((entry) => Number(entry.id) === userId);
      if (!selectedUser) return;
      openUsersAdminRoleMenu(roleBtn, selectedUser);
      return;
    }

    const permissionsBtn = event.target.closest('.users-admin-permissions-btn[data-permissions-user-id]');
    if (permissionsBtn) {
      event.stopPropagation();
      const userId = Number(permissionsBtn.dataset.permissionsUserId || 0);
      const selectedUser = adminUsersCache.find((entry) => Number(entry.id) === userId);
      if (!selectedUser) return;
      void openUsersAdminPermissionsMenu(permissionsBtn, selectedUser);
      return;
    }

    const editBtn = event.target.closest('.users-admin-item-btn[data-user-id]');
    if (!editBtn) return;
    const userId = Number(editBtn.dataset.userId || 0);
    const selectedUser = adminUsersCache.find((entry) => Number(entry.id) === userId);
    if (!selectedUser) return;
    resetUsersAdminForm(selectedUser);
    setUsersAdminFormOpen(true);
  });
}

if (usersAdminResetBtn) {
  usersAdminResetBtn.addEventListener('click', () => {
    resetUsersAdminForm(null);
    setUsersAdminFormOpen(true, { focusUsername: true });
  });
}

if (usersAdminForm) {
  usersAdminForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const userId = Number(usersAdminId?.value || 0);
    const isEditing = Number.isInteger(userId) && userId > 0;

    const payload = {
      displayName: String(usersAdminDisplayName?.value || '').trim(),
      email: String(usersAdminEmail?.value || '').trim(),
      role: String(usersAdminRole?.value || 'seller').trim().toLowerCase(),
      isActive: Boolean(usersAdminIsActive?.checked)
    };
    const pin = String(usersAdminPin?.value || '').replace(/\D/g, '');
    if (pin) payload.pin = pin;
    if (!isEditing) {
      payload.username = String(usersAdminUsername?.value || '').trim().toLowerCase();
      if (!payload.pin) {
        showToast('PIN obligatorio para crear usuario.', 'error');
        usersAdminPin?.focus();
        return;
      }
    }

    try {
      if (isEditing) {
        await requestJson(`/api/admin/users/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showToast('Usuario actualizado.', 'success');
      } else {
        await requestJson('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        showToast('Usuario creado.', 'success');
      }
      resetUsersAdminForm(null);
      setUsersAdminFormOpen(true, { focusUsername: true });
      await loadAdminUsers({ silent: true });
    } catch (error) {
      showToast(error.message || 'No se pudo guardar el usuario.', 'error');
    }
  });
}

if (notifBtn) {
  notifBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setNotifPanelOpen(!_notifOpen);
  });
}

_bindNotifListEvents();

document.addEventListener('click', (e) => {
  _syncNotifRefs();
  if (!_notifOpen) return;
  if (notifPanel && notifPanel.contains(e.target)) return;
  if (notifBtn && notifBtn.contains(e.target)) return;
  setNotifPanelOpen(false);
});

let _appResizeTicking = false;
window.addEventListener('resize', () => {
  if (!_appResizeTicking) {
    window.requestAnimationFrame(() => {
      closeUsersAdminRoleMenu();
      closeUsersAdminPermissionsMenu();
      if (_notifOpen) _positionNotifPanel();
      if (isCalendarView) {
        renderScheduleMonth();
        renderScheduleNotes();
      }
      _appResizeTicking = false;
    });
    _appResizeTicking = true;
  }
});

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
  closeUsersAdminRoleMenu();
  closeUsersAdminPermissionsMenu();
  setAccountMenu(false);
  setToolbarExpanded(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeUsersAdminRoleMenu();
    closeUsersAdminPermissionsMenu();
    setAccountMenu(false);
    setToolbarExpanded(false);
  }
});

// Botón de cerrar sesión
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async (event) => {
    event.stopPropagation();
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin'
      });
    } catch (_error) {
      // Ignorar fallo de logout remoto y cerrar sesion local
    } finally {
      clearSession();
      showLogin();
    }
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

// 2026 Program Guidelines: Greenwise, Red (Excel Law) y Not Eligible.
const GREEN_STATES = [
  'AK', 'AL', 'AR', 'AZ', 'CA', 'FL', 'IN', 'LA', 'MA', 'MD',
  'MI', 'MO', 'MS', 'NC', 'NE', 'NM', 'NY', 'OK', 'SD', 'TX'
];
const NOT_ELIGIBLE_STATES = [
  'CO', 'CT', 'DC', 'OR', 'PR', 'RI', 'WI', 'WV'
];
const GREEN_STATES_SET = new Set(GREEN_STATES);
const NOT_ELIGIBLE_STATES_SET = new Set(NOT_ELIGIBLE_STATES);

const STATE_NAMES = crmHelpers.STATE_NAMES || {};

// Función para determinar tipo de estado según guidelines 2026
function getStateType(stateCode) {
  const code = String(stateCode || '').toUpperCase().trim();
  if (GREEN_STATES_SET.has(code)) return 'Green';
  if (NOT_ELIGIBLE_STATES_SET.has(code)) return 'Not Eligible';
  return 'Red';
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
  '781': 'MA', '785': 'KS', '786': 'FL', '787': 'PR', '801': 'UT', '802': 'VT', '803': 'SC', '804': 'VA', '805': 'CA',
  '806': 'TX', '808': 'HI', '810': 'MI', '812': 'IN', '813': 'FL', '814': 'PA', '815': 'IL', '816': 'MO',
  '817': 'TX', '818': 'CA', '828': 'NC', '830': 'TX', '831': 'CA', '832': 'TX', '835': 'PA', '838': 'WA',
  '840': 'CA', '843': 'SC', '845': 'NY', '847': 'IL', '848': 'NJ', '850': 'FL', '856': 'NJ', '857': 'MA',
  '858': 'CA', '859': 'KY', '860': 'CT', '862': 'NJ', '863': 'FL', '864': 'SC', '865': 'TN', '870': 'AR',
  '872': 'IL', '878': 'PA', '901': 'TN', '903': 'TX', '904': 'FL', '906': 'MI', '907': 'AK', '908': 'NJ',
  '909': 'CA', '910': 'NC', '912': 'GA', '913': 'KS', '914': 'NY', '915': 'TX', '916': 'CA', '917': 'NY',
  '918': 'OK', '919': 'NC', '920': 'WI', '925': 'CA', '928': 'AZ', '930': 'IN', '931': 'TN', '934': 'NY',
  '936': 'TX', '937': 'OH', '938': 'AL', '939': 'PR', '940': 'TX', '941': 'FL', '945': 'TX', '947': 'MI', '949': 'CA',
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
const calendarBtn = document.getElementById('calendarBtn');
const emailsBtn = document.getElementById('emailsBtn');
const dashboardGrid = document.querySelector('.dashboard-grid');
const leadsView = document.getElementById('leadsView');
const calendarView = document.getElementById('calendarView');
const emailsView = document.getElementById('emailsView');
const searchClearBtn = document.getElementById('searchClearBtn');
const calendarMonthLabel = document.getElementById('calendarMonthLabel');
const calendarMonthGrid = document.getElementById('calendarMonthGrid');
const calendarPrevMonthBtn = document.getElementById('calendarPrevMonthBtn');
const calendarNextMonthBtn = document.getElementById('calendarNextMonthBtn');
const calendarTodayBtn = document.getElementById('calendarTodayBtn');
const calendarSelectedDateLabel = document.getElementById('calendarSelectedDateLabel');
const calendarAgendaList = document.getElementById('calendarAgendaList');
const calendarOverdueCount = document.getElementById('calendarOverdueCount');
const calendarTodayCount = document.getElementById('calendarTodayCount');
const calendarUpcomingCount = document.getElementById('calendarUpcomingCount');
const calendarOwnerPicker = document.getElementById('calendarOwnerPicker');
const calendarOwnerBadge = document.getElementById('calendarOwnerBadge');
const calendarOwnerMenu = document.getElementById('calendarOwnerMenu');
const calendarCreateTaskBtn = document.getElementById('calendarCreateTaskBtn');
const calendarCreateCallbackBtn = document.getElementById('calendarCreateCallbackBtn');
const calendarNotesBoard = document.getElementById('calendarNotesBoard');
const calendarAddNoteBtn = document.getElementById('calendarAddNoteBtn');
const scheduleTaskModal = document.getElementById('scheduleTaskModal');
const scheduleTaskCloseBtn = document.getElementById('scheduleTaskCloseBtn');
const scheduleTaskForm = document.getElementById('scheduleTaskForm');
const scheduleTaskModalTitle = document.getElementById('scheduleTaskModalTitle');
const scheduleTaskOwnerInput = document.getElementById('scheduleTaskOwnerInput');
const scheduleTaskDateInput = document.getElementById('scheduleTaskDateInput');
const scheduleTaskTitleInput = document.getElementById('scheduleTaskTitleInput');
const scheduleTaskLeadSearchInput = document.getElementById('scheduleTaskLeadSearchInput');
const scheduleTaskLeadIdInput = document.getElementById('scheduleTaskLeadIdInput');
const scheduleTaskLeadSuggestions = document.getElementById('scheduleTaskLeadSuggestions');
const scheduleTaskLeadLink = document.getElementById('scheduleTaskLeadLink');
const scheduleTaskLeadHint = document.getElementById('scheduleTaskLeadHint');
const scheduleTaskCancelBtn = document.getElementById('scheduleTaskCancelBtn');
const scheduleTaskSubmitBtn = document.getElementById('scheduleTaskSubmitBtn');
const emailsTableBody = document.getElementById('emailsTableBody');
const emailsCount = document.getElementById('emailsCount');
const emailsRoleHint = document.getElementById('emailsRoleHint');
const emailsSelectAll = document.getElementById('emailsSelectAll');
const emailsDeleteSelectedBtn = document.getElementById('emailsDeleteSelectedBtn');
const emailsSelectionCount = document.getElementById('emailsSelectionCount');
const emailsRefreshBtn = document.getElementById('emailsRefreshBtn');
let isLeadsView = false;
let isCalendarView = false;
let isEmailsView = false;
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
let leadActionsMenuDocumentBound = false;
let leadAssigneeMenuDocumentBound = false;
let leadAssigneeMenuElement = null;
let leadAssignableMembers = [];
let leadAssignableMembersLoaded = false;
let leadAssignableMembersPromise = null;
let leadAssigneeUpdateInFlight = false;
let scheduleViewDate = new Date();
let scheduleSelectedDateKey = new Date().toISOString().slice(0, 10);
let scheduleTasks = [];
let scheduleOwnerKey = '';
let scheduleScope = 'mine';
let scheduleTasksLoaded = false;
let scheduleNotes = [];
let scheduleInteractionsBound = false;
let scheduleNoteDragState = null;
let scheduleCompleteLeadInFlight = null;
let scheduleDeleteTaskInFlight = null;
let scheduleOwnerFilter = '';
let scheduleOwnerMembers = [];
let scheduleOwnerMembersLoaded = false;
let scheduleOwnerMembersPromise = null;
let scheduleOwnerSearchTerm = '';
let scheduleOwnerMenuOpen = false;
let scheduleTaskModalOpen = false;
let scheduleTaskDraftType = 'general';
let scheduleTaskSubmitInFlight = false;
let scheduleTaskLeadMatches = [];
let scheduleTaskLeadActiveIndex = -1;
let scheduleTaskLeadLoadPromise = null;
let allEmailsCache = [];
let emailsLoaded = false;
let emailsRequestInFlight = null;
let emailsInteractionsBound = false;
let selectedEmailIds = new Set();
const SCHEDULE_CALLBACKS_FROM = '2000-01-01';
const SCHEDULE_NOTES_KEY = 'project_gw_schedule_notes_v1';
const SCHEDULE_NOTE_MAX_LENGTH = 220;
const SCHEDULE_NOTE_COLORS = ['yellow', 'pink', 'blue', 'green'];
const EMAILS_FETCH_LIMIT = 200;
const LEADS_COLUMN_WIDTHS_KEY = 'project_gw_leads_column_widths_v1';
const LEADS_COLUMN_MIN_WIDTHS = [30, 130, 78, 90, 86, 76, 76, 88, 64, 56, 64, 64, 40];
const LEADS_COLUMN_DEFAULT_RATIOS = [3, 16.5, 10, 12, 9.5, 7.5, 7.5, 8.5, 4.5, 5, 6, 6, 4];
const LEADS_RESIZABLE_COLUMN_INDEXES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
let leadColumnWidths = null;
let leadsColumnResizeInitialized = false;

function getLeadsTableElement() {
  return document.querySelector('#leadsView .leads-table');
}

function normalizeLeadsColumnWidths(widths) {
  if (!Array.isArray(widths)) return null;
  if (widths.length !== LEADS_COLUMN_MIN_WIDTHS.length) return null;
  const normalized = widths.map((value, index) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return LEADS_COLUMN_MIN_WIDTHS[index];
    return Math.max(LEADS_COLUMN_MIN_WIDTHS[index], Math.round(parsed));
  });
  return normalized;
}

function getDefaultLeadsColumnWidths(table) {
  const referenceWidth = Math.max(980, Math.floor(table?.getBoundingClientRect().width || 1080));
  const raw = LEADS_COLUMN_DEFAULT_RATIOS.map((ratio) => Math.round((referenceWidth * ratio) / 100));
  return normalizeLeadsColumnWidths(raw);
}

function loadLeadsColumnWidths(table) {
  if (Array.isArray(leadColumnWidths) && leadColumnWidths.length === LEADS_COLUMN_MIN_WIDTHS.length) {
    return leadColumnWidths;
  }

  try {
    const raw = localStorage.getItem(LEADS_COLUMN_WIDTHS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const normalized = normalizeLeadsColumnWidths(parsed);
      if (normalized) {
        leadColumnWidths = normalized;
        return leadColumnWidths;
      }
    }
  } catch (_error) {
    // Ignorar corrupt local state y reconstruir defaults
  }

  leadColumnWidths = getDefaultLeadsColumnWidths(table);
  return leadColumnWidths;
}

function saveLeadsColumnWidths() {
  try {
    if (Array.isArray(leadColumnWidths)) {
      localStorage.setItem(LEADS_COLUMN_WIDTHS_KEY, JSON.stringify(leadColumnWidths));
    }
  } catch (_error) {
    // Ignorar errores de almacenamiento local
  }
}

function getLeadsColumnMaxWidth(table) {
  const containerWidth = Math.floor(table?.parentElement?.getBoundingClientRect().width || window.innerWidth || 1280);
  return Math.max(140, Math.floor(containerWidth * 0.55));
}

function applyLeadsColumnWidths() {
  const table = getLeadsTableElement();
  if (!table) return;

  const widths = loadLeadsColumnWidths(table);
  widths.forEach((width, index) => {
    const finalWidth = `${Math.max(LEADS_COLUMN_MIN_WIDTHS[index], Math.round(width))}px`;
    table.querySelectorAll(`tr > *:nth-child(${index + 1})`).forEach((cell) => {
      cell.style.width = finalWidth;
      cell.style.minWidth = finalWidth;
      cell.style.maxWidth = finalWidth;
    });
  });
}

function setLeadsColumnWidth(index, width, { persist = true } = {}) {
  const table = getLeadsTableElement();
  if (!table) return;

  const widths = loadLeadsColumnWidths(table).slice();
  const maxWidth = getLeadsColumnMaxWidth(table);
  widths[index] = Math.min(maxWidth, Math.max(LEADS_COLUMN_MIN_WIDTHS[index], Math.round(width)));
  leadColumnWidths = widths;
  applyLeadsColumnWidths();
  if (persist) {
    saveLeadsColumnWidths();
  }
}

function autoFitLeadsColumn(index) {
  const table = getLeadsTableElement();
  if (!table) return;

  const cells = Array.from(table.querySelectorAll(`tr > *:nth-child(${index + 1})`));
  if (!cells.length) return;

  let maxContentWidth = LEADS_COLUMN_MIN_WIDTHS[index];

  cells.forEach((cell) => {
    const prevWidth = cell.style.width;
    const prevMinWidth = cell.style.minWidth;
    const prevMaxWidth = cell.style.maxWidth;

    cell.style.width = 'auto';
    cell.style.minWidth = '0';
    cell.style.maxWidth = 'none';
    maxContentWidth = Math.max(maxContentWidth, Math.ceil(cell.scrollWidth + 16));

    cell.style.width = prevWidth;
    cell.style.minWidth = prevMinWidth;
    cell.style.maxWidth = prevMaxWidth;
  });

  setLeadsColumnWidth(index, maxContentWidth);
}

function initializeLeadsColumnResize() {
  const table = getLeadsTableElement();
  if (!table) return;

  if (!leadsColumnResizeInitialized) {
    const headerCells = Array.from(table.querySelectorAll('thead th'));

    headerCells.forEach((headerCell, index) => {
      if (!LEADS_RESIZABLE_COLUMN_INDEXES.has(index)) return;
      if (headerCell.querySelector('.col-resize-handle')) return;

      headerCell.classList.add('col-resizable');

      const handle = document.createElement('span');
      handle.className = 'col-resize-handle';
      handle.title = 'Arrastra para ajustar ancho. Doble clic para autoajustar.';
      headerCell.appendChild(handle);

      handle.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
        autoFitLeadsColumn(index);
      });

      handle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });

      handle.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();

        const startX = event.clientX;
        const startWidth = loadLeadsColumnWidths(table)[index];

        const onMouseMove = (moveEvent) => {
          const delta = moveEvent.clientX - startX;
          setLeadsColumnWidth(index, startWidth + delta, { persist: false });
        };

        const onMouseUp = () => {
          document.body.classList.remove('leads-col-resizing');
          saveLeadsColumnWidths();
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };

        document.body.classList.add('leads-col-resizing');
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    });

    leadsColumnResizeInitialized = true;
  }

  applyLeadsColumnWidths();
}

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
  if (syncInput) {
    if (homeSearchInput) {
      homeSearchInput.value = currentLeadSearchQuery;
    }
    const leadsSpecificSearch = document.getElementById('leadsSpecificSearch');
    if (leadsSpecificSearch) {
      leadsSpecificSearch.value = currentLeadSearchQuery;
    }
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
      border: '1px solid rgba(20, 20, 22, 0.12)',
      shadow: '0 14px 34px rgba(20, 20, 22, 0.16)',
      itemBorder: '1px solid rgba(20, 20, 22, 0.08)',
      itemHover: 'rgba(59, 130, 246, 0.12)',
      textPrimary: 'rgba(20, 20, 22, 0.95)',
      textSecondary: 'rgba(20, 20, 22, 0.62)'
    };
  }

  return {
    background: 'rgba(14, 14, 16, 0.96)',
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
  box.className = 'lead-suggestion-box';
  box.style.position = 'fixed';
  box.style.top = '0';
  box.style.left = '0';
  box.style.zIndex = String(LEAD_SEARCH_SUGGESTION_Z_INDEX);

  document.body.appendChild(box);
  leadSearchSuggestionBox = box;

  let _searchRepositionTicking = false;
  const reposition = () => {
    if (!_searchRepositionTicking) {
      window.requestAnimationFrame(() => {
        if (leadSearchSuggestionBox && leadSearchSuggestionBox.classList.contains('visible')) {
          positionLeadSearchSuggestionBox();
        }
        _searchRepositionTicking = false;
      });
      _searchRepositionTicking = true;
    }
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
  const top = rect.bottom + 6;
  const left = Math.max(viewportPadding, rect.left);
  const availableWidth = Math.max(240, window.innerWidth - left - viewportPadding);
  const width = Math.min(rect.width, availableWidth);
  const availableHeight = Math.max(140, window.innerHeight - top - viewportPadding);

  leadSearchSuggestionBox.style.left = `${left}px`;
  leadSearchSuggestionBox.style.top = `${top}px`;
  leadSearchSuggestionBox.style.width = `${Math.max(240, width)}px`;
  leadSearchSuggestionBox.style.maxHeight = `${Math.min(380, availableHeight)}px`;
}

function hideLeadSearchSuggestions() {
  if (!leadSearchSuggestionBox) return;
  leadSearchSuggestionBox.classList.remove('visible');
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
  buttons.forEach((button, index) => {
    button.classList.toggle('active', index === target);
    if (index === target) {
      button.scrollIntoView({ block: 'nearest' });
    }
  });
}

function highlightSearchMatch(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(
    new RegExp(`(${escapedQuery})`, 'gi'),
    '<mark class="lead-suggestion-match">$1</mark>'
  );
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

  leadSearchSuggestionMatches = list;
  leadSearchSuggestionActiveIndex = -1;

  box.innerHTML = `
    <div class="lead-suggestion-header">
      <span class="lead-suggestion-header-label">Resultados</span>
      <span class="lead-suggestion-count">${list.length < LEAD_SEARCH_SUGGESTION_LIMIT ? list.length : `${list.length}+`}</span>
    </div>
    ${list.map((lead, index) => {
      const initials = String(lead.full_name || '?').split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
      const nameHighlighted = highlightSearchMatch(lead.full_name || 'Sin nombre', query);
      const metaStr = [
        lead.case_id ? `#${escapeHtml(String(lead.case_id))}` : null,
        lead.phone ? escapeHtml(lead.phone) : null,
        lead.state_code ? escapeHtml(lead.state_code) : null
      ].filter(Boolean).join(' · ');
      return `
        <button
          type="button"
          class="lead-suggestion-item"
          data-suggest-index="${index}"
          data-lead-id="${lead.id}"
        >
          <span class="lead-suggestion-item__avatar">${initials}</span>
          <span class="lead-suggestion-item__body">
            <span class="lead-suggestion-item__name">${nameHighlighted}</span>
            <span class="lead-suggestion-item__meta">${metaStr}</span>
          </span>
        </button>
      `;
    }).join('')}
  `;

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
  box.classList.add('visible');
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

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseIsoDateLocal(isoDate) {
  const raw = String(isoDate || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
}

function normalizeScheduleDateKey(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIsoDateLocal(value);
  }

  const raw = String(value || '').trim();
  if (!raw) return '';

  const directMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch && parseIsoDateLocal(directMatch[1])) {
    return directMatch[1];
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return toIsoDateLocal(parsed);
  }

  return '';
}

function toIsoDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatScheduleDateLabel(isoDate) {
  const date = parseIsoDateLocal(isoDate);
  if (!date) return 'Fecha invalida';
  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function getScheduleOwner(sessionOverride = null) {
  const session = sessionOverride || getSession();
  return normalizePreferenceOwner(session?.username || session?.name || '');
}

function getScheduleNotesOwnerKey(sessionOverride = null) {
  if (scheduleScope === 'team' && scheduleOwnerFilter) {
    return normalizePreferenceOwner(scheduleOwnerFilter);
  }
  return getScheduleOwner(sessionOverride);
}

function normalizeScheduleOwnerUsername(value) {
  return String(value || '').trim().toLowerCase().slice(0, 120);
}

function getCurrentScheduleUsername(sessionOverride = null) {
  const session = sessionOverride || getSession();
  const identity = getSessionIdentity(session);
  return normalizeScheduleOwnerUsername(identity.username || identity.displayName || session?.name || '');
}

function buildScheduleMemberLabel(member) {
  const username = normalizeScheduleOwnerUsername(member?.username);
  const displayName = String(member?.displayName || '').trim();
  if (displayName && username && displayName.toLowerCase() !== username) {
    return `${displayName} (@${username})`;
  }
  if (username) return `@${username}`;
  if (displayName) return displayName;
  return '@usuario';
}

function getScheduleOwnerScopeCacheKey(ownerKey) {
  const teamFilterToken = scheduleScope === 'team'
    ? (scheduleOwnerFilter || 'all')
    : ownerKey;
  return `${ownerKey}::${scheduleScope}::${teamFilterToken}`;
}

function getScheduleOwnerLabelByUsername(username) {
  const normalized = normalizeScheduleOwnerUsername(username);
  if (!normalized) return '';
  const member = scheduleOwnerMembers.find((entry) => entry.username === normalized);
  return buildScheduleMemberLabel({
    username: normalized,
    displayName: member?.displayName || normalized
  });
}

async function loadScheduleOwnerMembers({ force = false } = {}) {
  const identity = getSessionIdentity();
  const ownUsername = getCurrentScheduleUsername();
  const ownDisplayName = String(identity.displayName || identity.username || 'Usuario').trim();
  if (!hasCurrentSessionPermission('callbacks.view_all')) {
    scheduleOwnerMembers = ownUsername
      ? [{ username: ownUsername, displayName: ownDisplayName }]
      : [];
    scheduleOwnerMembersLoaded = true;
    return scheduleOwnerMembers;
  }

  if (!force && scheduleOwnerMembersLoaded) {
    return scheduleOwnerMembers;
  }
  if (scheduleOwnerMembersPromise) {
    return scheduleOwnerMembersPromise;
  }

  scheduleOwnerMembersPromise = (async () => {
    const membersMap = new Map();
    const pushMember = (usernameValue, displayNameValue = '') => {
      const username = normalizeScheduleOwnerUsername(usernameValue);
      if (!username) return;
      if (!membersMap.has(username)) {
        membersMap.set(username, {
          username,
          displayName: String(displayNameValue || '').trim() || username
        });
      }
    };

    try {
      const data = await requestJson('/api/users', { cache: 'no-store' });
      const members = Array.isArray(data?.members) ? data.members : [];
      if (members.length) {
        members.forEach((member) => {
          pushMember(member?.username, member?.displayName || member?.display_name || member?.username);
        });
      } else {
        const users = Array.isArray(data?.users) ? data.users : [];
        users.forEach((entry) => {
          const label = String(entry || '').trim();
          if (!label) return;
          pushMember(label, label);
        });
      }
    } catch (_error) {
      // Fallback al usuario actual cuando no se puede cargar catalogo
    } finally {
      pushMember(ownUsername, ownDisplayName);
      scheduleOwnerMembers = Array.from(membersMap.values()).sort((a, b) =>
        a.username.localeCompare(b.username, 'es', { sensitivity: 'base' })
      );
      scheduleOwnerMembersLoaded = true;
      scheduleOwnerMembersPromise = null;
    }

    return scheduleOwnerMembers;
  })();

  return scheduleOwnerMembersPromise;
}

function getCurrentScheduleSelectionValue() {
  if (scheduleScope === 'mine') return 'mine';
  if (scheduleOwnerFilter) return `user:${normalizeScheduleOwnerUsername(scheduleOwnerFilter)}`;
  return 'team';
}

function getCurrentScheduleSelectionLabel(sessionOverride = null) {
  const session = sessionOverride || getSession();
  const identity = getSessionIdentity(session);
  const ownUsername = getCurrentScheduleUsername(session);
  const ownLabel = getScheduleOwnerLabelByUsername(ownUsername)
    || `@${String(identity.username || identity.displayName || 'usuario').trim()}`;

  if (scheduleScope === 'mine') return `Mi agenda (${ownLabel})`;
  if (scheduleOwnerFilter) {
    const selectedLabel = getScheduleOwnerLabelByUsername(scheduleOwnerFilter)
      || `@${normalizeScheduleOwnerUsername(scheduleOwnerFilter)}`;
    return `Agenda de ${selectedLabel}`;
  }
  return 'Agenda de equipo';
}

function buildScheduleOwnerPickerOptions(query = '', sessionOverride = null) {
  const session = sessionOverride || getSession();
  const ownUsername = getCurrentScheduleUsername(session);
  const canViewTeam = hasCurrentSessionPermission('callbacks.view_all');
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const ownLabel = getScheduleOwnerLabelByUsername(ownUsername) || `@${ownUsername || 'usuario'}`;
  const options = [{
    value: 'mine',
    label: `Mi agenda (${ownLabel})`,
    searchable: `mi agenda ${ownUsername}`
  }];

  if (!canViewTeam) {
    return normalizedQuery
      ? options.filter((entry) => entry.searchable.includes(normalizedQuery))
      : options;
  }

  options.push({
    value: 'team',
    label: 'Agenda de equipo',
    searchable: 'agenda equipo all'
  });

  scheduleOwnerMembers.forEach((member) => {
    const username = normalizeScheduleOwnerUsername(member?.username);
    if (!username || username === ownUsername) return;
    const label = `Agenda de ${buildScheduleMemberLabel(member)}`;
    options.push({
      value: `user:${username}`,
      label,
      searchable: `${label.toLowerCase()} ${username} ${String(member?.displayName || '').trim().toLowerCase()}`
    });
  });

  if (!normalizedQuery) return options;
  return options.filter((entry) => entry.searchable.includes(normalizedQuery));
}

function renderScheduleOwnerMenu(sessionOverride = null) {
  if (!calendarOwnerMenu) return;
  if (!scheduleOwnerMenuOpen) {
    calendarOwnerMenu.classList.add('hidden');
    return;
  }

  const currentValue = getCurrentScheduleSelectionValue();
  const options = buildScheduleOwnerPickerOptions(scheduleOwnerSearchTerm, sessionOverride);
  if (!options.length) {
    calendarOwnerMenu.innerHTML = '<div class="schedule-owner-empty">Sin coincidencias</div>';
    calendarOwnerMenu.classList.remove('hidden');
    return;
  }

  calendarOwnerMenu.innerHTML = options.map((entry) => {
    const isActive = entry.value === currentValue;
    return `
      <button type="button" class="schedule-owner-option${isActive ? ' is-active' : ''}" data-owner-value="${escapeHtml(entry.value)}" role="option" aria-selected="${isActive ? 'true' : 'false'}">
        ${escapeHtml(entry.label)}
      </button>
    `;
  }).join('');
  calendarOwnerMenu.classList.remove('hidden');
}

function closeScheduleOwnerMenu({ restoreSelection = true, sessionOverride = null } = {}) {
  scheduleOwnerMenuOpen = false;
  scheduleOwnerSearchTerm = '';
  if (calendarOwnerPicker) calendarOwnerPicker.classList.remove('is-open');
  if (calendarOwnerMenu) calendarOwnerMenu.classList.add('hidden');
  if (restoreSelection && calendarOwnerBadge) {
    calendarOwnerBadge.value = getCurrentScheduleSelectionLabel(sessionOverride);
  }
}

function openScheduleOwnerMenu({ clearCurrent = false, sessionOverride = null } = {}) {
  if (!calendarOwnerBadge || !calendarOwnerMenu) return;
  if (!hasCurrentSessionPermission('callbacks.view_all')) {
    closeScheduleOwnerMenu({ restoreSelection: true, sessionOverride });
    return;
  }

  scheduleOwnerMenuOpen = true;
  if (calendarOwnerPicker) calendarOwnerPicker.classList.add('is-open');
  if (clearCurrent) {
    calendarOwnerBadge.value = '';
    scheduleOwnerSearchTerm = '';
  } else {
    scheduleOwnerSearchTerm = String(calendarOwnerBadge.value || '').trim();
  }
  renderScheduleOwnerMenu(sessionOverride);
}

function applyScheduleOwnerSelection(rawSelection) {
  const nextSelection = String(rawSelection || '').trim();
  if (!nextSelection || nextSelection === 'mine') {
    scheduleScope = 'mine';
    scheduleOwnerFilter = '';
  } else if (nextSelection === 'team') {
    scheduleScope = 'team';
    scheduleOwnerFilter = '';
  } else if (nextSelection.startsWith('user:')) {
    const selectedOwner = normalizeScheduleOwnerUsername(nextSelection.slice(5));
    if (!selectedOwner) return false;
    scheduleScope = 'team';
    scheduleOwnerFilter = selectedOwner;
  } else {
    return false;
  }
  scheduleTasksLoaded = false;
  hydrateScheduleForCurrentUser({ forceTasks: true });
  return true;
}

function syncScheduleOwnerSelector(sessionOverride = null, { preserveSearch = false } = {}) {
  if (!calendarOwnerBadge) return;
  const session = sessionOverride || getSession();
  const canViewTeam = hasCurrentSessionPermission('callbacks.view_all');

  calendarOwnerBadge.readOnly = !canViewTeam;
  calendarOwnerBadge.setAttribute(
    'title',
    canViewTeam
      ? 'Busca y selecciona la agenda que quieres administrar'
      : 'Tu agenda personal'
  );

  if (!canViewTeam) {
    closeScheduleOwnerMenu({ restoreSelection: true, sessionOverride: session });
    return;
  }

  if (!preserveSearch || !scheduleOwnerMenuOpen) {
    calendarOwnerBadge.value = getCurrentScheduleSelectionLabel(session);
    scheduleOwnerSearchTerm = '';
  }
  if (scheduleOwnerMenuOpen) {
    renderScheduleOwnerMenu(session);
  }
}

function getScheduleCreationOwnerUsername() {
  if (scheduleScope === 'team' && scheduleOwnerFilter) {
    return normalizeScheduleOwnerUsername(scheduleOwnerFilter);
  }
  return getCurrentScheduleUsername();
}

function getScheduleCreationOwnerLabel() {
  const ownerUsername = getScheduleCreationOwnerUsername();
  if (!ownerUsername) return '';
  return getScheduleOwnerLabelByUsername(ownerUsername) || `@${ownerUsername}`;
}

function formatScheduleLeadPrimaryLabel(lead) {
  const name = String(lead?.full_name || lead?.name || '').trim() || 'Sin nombre';
  const caseId = String(lead?.case_id || lead?.caseId || '').trim();
  return caseId ? `${name} · Case #${caseId}` : name;
}

function setScheduleTaskLeadSelection(lead) {
  if (!scheduleTaskLeadIdInput || !scheduleTaskLeadSearchInput || !scheduleTaskLeadHint || !scheduleTaskLeadLink) return;
  const leadId = Number(lead?.id || 0);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    scheduleTaskLeadIdInput.value = '';
    if (scheduleTaskLeadLink) {
      scheduleTaskLeadLink.classList.add('hidden');
      scheduleTaskLeadLink.removeAttribute('href');
    }
    scheduleTaskLeadHint.textContent = 'Sin lead seleccionado.';
    return;
  }

  scheduleTaskLeadIdInput.value = String(leadId);
  scheduleTaskLeadSearchInput.value = formatScheduleLeadPrimaryLabel(lead);
  scheduleTaskLeadHint.textContent = `Lead seleccionado: ${formatScheduleLeadPrimaryLabel(lead)}`;
  scheduleTaskLeadLink.href = `/client.html?id=${leadId}`;
  scheduleTaskLeadLink.classList.remove('hidden');
}

function closeScheduleTaskLeadSuggestions() {
  scheduleTaskLeadMatches = [];
  scheduleTaskLeadActiveIndex = -1;
  if (scheduleTaskLeadSuggestions) {
    scheduleTaskLeadSuggestions.classList.add('hidden');
    scheduleTaskLeadSuggestions.innerHTML = '';
  }
}

function renderScheduleTaskLeadSuggestions(query = '') {
  if (!scheduleTaskLeadSuggestions) return;
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const leadsPool = Array.isArray(allLeadsCache) ? allLeadsCache : [];

  const matches = leadsPool
    .filter((lead) => {
      if (!normalizedQuery) return true;
      const fullName = String(lead?.full_name || '').toLowerCase();
      const caseId = String(lead?.case_id || '').toLowerCase();
      const phone = String(lead?.phone || '').toLowerCase();
      const email = String(lead?.email || '').toLowerCase();
      return fullName.includes(normalizedQuery)
        || caseId.includes(normalizedQuery)
        || phone.includes(normalizedQuery)
        || email.includes(normalizedQuery);
    })
    .slice(0, 12);

  scheduleTaskLeadMatches = matches;
  scheduleTaskLeadActiveIndex = matches.length ? 0 : -1;
  if (!matches.length) {
    scheduleTaskLeadSuggestions.innerHTML = '<div class="schedule-task-lead-empty">Sin coincidencias</div>';
    scheduleTaskLeadSuggestions.classList.remove('hidden');
    return;
  }

  scheduleTaskLeadSuggestions.innerHTML = matches.map((lead, index) => {
    const leadId = Number(lead?.id || 0);
    const label = formatScheduleLeadPrimaryLabel(lead);
    const detail = [String(lead?.phone || '').trim(), String(lead?.email || '').trim()].filter(Boolean).join(' · ');
    return `
      <button type="button" class="schedule-task-lead-option${index === 0 ? ' is-active' : ''}" data-lead-index="${index}" data-lead-id="${leadId}">
        <span>${escapeHtml(label)}</span>
        <small>${escapeHtml(detail || `Lead #${leadId}`)}</small>
      </button>
    `;
  }).join('');
  scheduleTaskLeadSuggestions.classList.remove('hidden');
}

function setActiveScheduleTaskLeadSuggestion(nextIndex) {
  if (!scheduleTaskLeadSuggestions) return;
  if (!scheduleTaskLeadMatches.length) {
    scheduleTaskLeadActiveIndex = -1;
    return;
  }
  const clamped = Math.max(0, Math.min(scheduleTaskLeadMatches.length - 1, nextIndex));
  scheduleTaskLeadActiveIndex = clamped;
  const options = Array.from(scheduleTaskLeadSuggestions.querySelectorAll('.schedule-task-lead-option[data-lead-index]'));
  options.forEach((optionEl, optionIndex) => {
    optionEl.classList.toggle('is-active', optionIndex === clamped);
    if (optionIndex === clamped) {
      optionEl.scrollIntoView({ block: 'nearest' });
    }
  });
}

function selectScheduleTaskLeadAt(index) {
  if (!Number.isInteger(index) || index < 0 || index >= scheduleTaskLeadMatches.length) return false;
  const lead = scheduleTaskLeadMatches[index];
  setScheduleTaskLeadSelection(lead);
  closeScheduleTaskLeadSuggestions();
  return true;
}

async function ensureScheduleTaskLeadPoolLoaded() {
  if (Array.isArray(allLeadsCache) && allLeadsCache.length) return allLeadsCache;
  if (scheduleTaskLeadLoadPromise) return scheduleTaskLeadLoadPromise;

  scheduleTaskLeadLoadPromise = (async () => {
    try {
      const data = await requestJson('/api/leads', { cache: 'no-store' });
      allLeadsCache = Array.isArray(data?.leads) ? data.leads : [];
      leadSearchIndex = buildLeadsSearchIndex(allLeadsCache);
      leadsLoaded = true;
      return allLeadsCache;
    } catch (error) {
      console.error('Error cargando leads para modal de agenda:', error);
      return [];
    } finally {
      scheduleTaskLeadLoadPromise = null;
    }
  })();

  return scheduleTaskLeadLoadPromise;
}

function updateScheduleTaskSubmitUi() {
  if (!scheduleTaskSubmitBtn || !scheduleTaskTitleInput || !scheduleTaskLeadSearchInput) return;
  const actionLabel = scheduleTaskDraftType === 'callback' ? 'callback' : 'task';
  scheduleTaskSubmitBtn.textContent = scheduleTaskSubmitInFlight ? 'Guardando...' : `Guardar ${actionLabel}`;
  scheduleTaskSubmitBtn.disabled = scheduleTaskSubmitInFlight;
  scheduleTaskTitleInput.disabled = scheduleTaskSubmitInFlight;
  scheduleTaskLeadSearchInput.disabled = scheduleTaskSubmitInFlight;
  if (scheduleTaskCancelBtn) scheduleTaskCancelBtn.disabled = scheduleTaskSubmitInFlight;
}

function closeScheduleTaskModal() {
  if (!scheduleTaskModal) return;
  scheduleTaskModal.classList.add('hidden');
  scheduleTaskModalOpen = false;
  scheduleTaskSubmitInFlight = false;
  if (scheduleTaskForm) scheduleTaskForm.reset();
  closeScheduleTaskLeadSuggestions();
  setScheduleTaskLeadSelection(null);
  updateScheduleTaskSubmitUi();
}

async function submitScheduleTaskModal(event) {
  event.preventDefault();
  if (!scheduleTaskForm || scheduleTaskSubmitInFlight) return;
  if (!hasCurrentSessionPermission('tasks.manage')) {
    showToast('No tienes permisos para crear tareas.', 'error');
    return;
  }

  const targetOwner = getScheduleCreationOwnerUsername();
  if (!targetOwner) {
    showToast('No se pudo determinar el usuario dueno del evento.', 'error');
    return;
  }
  if (!parseIsoDateLocal(scheduleSelectedDateKey)) {
    showToast('Selecciona una fecha valida en el calendario.', 'error');
    return;
  }

  const title = String(scheduleTaskTitleInput?.value || '').trim();
  if (!title) {
    showToast('El titulo no puede quedar vacio.', 'error');
    scheduleTaskTitleInput?.focus();
    return;
  }

  const selectedLeadId = Number(scheduleTaskLeadIdInput?.value || 0);
  scheduleTaskSubmitInFlight = true;
  updateScheduleTaskSubmitUi();
  try {
    const payload = {
      taskType: scheduleTaskDraftType,
      title,
      dueDate: scheduleSelectedDateKey,
      ownerUsername: targetOwner,
      priority: 'normal'
    };
    if (Number.isInteger(selectedLeadId) && selectedLeadId > 0) {
      payload.relatedLeadId = selectedLeadId;
    }

    const result = await requestJson('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    closeScheduleTaskModal();
    showToast(result?.message || 'Evento creado correctamente.', 'success');
    await loadScheduleTasks({ force: true });
  } catch (error) {
    showToast(error.message || 'No se pudo crear el evento.', 'error');
    scheduleTaskSubmitInFlight = false;
    updateScheduleTaskSubmitUi();
  }
}

async function openScheduleTaskModal(taskType = 'general') {
  if (!scheduleTaskModal) return;
  if (!hasCurrentSessionPermission('tasks.manage')) {
    showToast('No tienes permisos para crear tareas.', 'error');
    return;
  }
  if (!parseIsoDateLocal(scheduleSelectedDateKey)) {
    showToast('Selecciona una fecha valida en el calendario.', 'error');
    return;
  }
  if (scheduleScope === 'team' && !scheduleOwnerFilter) {
    showToast('Selecciona una agenda de usuario especifico para crearle un evento.', 'info');
    return;
  }

  scheduleTaskDraftType = String(taskType || '').trim().toLowerCase() === 'callback' ? 'callback' : 'general';
  scheduleTaskSubmitInFlight = false;
  scheduleTaskModalOpen = true;
  scheduleTaskModal.classList.remove('hidden');

  const ownerLabel = getScheduleCreationOwnerLabel() || 'Sin usuario';
  if (scheduleTaskModalTitle) {
    scheduleTaskModalTitle.textContent = scheduleTaskDraftType === 'callback' ? 'Nuevo callback' : 'Nueva task';
  }
  if (scheduleTaskOwnerInput) scheduleTaskOwnerInput.value = ownerLabel;
  if (scheduleTaskDateInput) scheduleTaskDateInput.value = formatScheduleDateLabel(scheduleSelectedDateKey);
  if (scheduleTaskTitleInput) {
    scheduleTaskTitleInput.value = '';
    scheduleTaskTitleInput.placeholder = scheduleTaskDraftType === 'callback'
      ? 'Ej. Callback con cliente'
      : 'Ej. Seguimiento de documentos';
  }
  if (scheduleTaskLeadSearchInput) scheduleTaskLeadSearchInput.value = '';
  setScheduleTaskLeadSelection(null);
  closeScheduleTaskLeadSuggestions();
  updateScheduleTaskSubmitUi();

  await ensureScheduleTaskLeadPoolLoaded();
  renderScheduleTaskLeadSuggestions('');
  scheduleTaskLeadSearchInput?.focus();
}

function readStrictScopedPreference(baseKey, owner) {
  try {
    const normalizedOwner = resolvePreferenceOwner(owner);
    if (!normalizedOwner) return '';
    return String(localStorage.getItem(buildScopedPreferenceKey(baseKey, normalizedOwner)) || '');
  } catch (_error) {
    return '';
  }
}

function writeStrictScopedPreference(baseKey, value, owner) {
  try {
    const normalizedOwner = resolvePreferenceOwner(owner);
    if (!normalizedOwner) return;
    localStorage.setItem(buildScopedPreferenceKey(baseKey, normalizedOwner), String(value ?? ''));
  } catch (_error) {
    // Ignorar errores de almacenamiento local
  }
}

function normalizeScheduleNotes(rawNotes) {
  if (!Array.isArray(rawNotes)) return [];
  return rawNotes
    .map((note, index) => {
      const noteId = String(note?.id || `note_${Date.now()}_${index}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || `note_${Date.now()}_${index}`;
      const noteText = String(note?.text || '').slice(0, SCHEDULE_NOTE_MAX_LENGTH);
      const noteColor = SCHEDULE_NOTE_COLORS.includes(note?.color) ? note.color : 'yellow';
      const normalizedX = Number(note?.x);
      const normalizedY = Number(note?.y);
      const x = Number.isFinite(normalizedX) ? clampNumber(normalizedX, 0, 1) : Math.random() * 0.55;
      const y = Number.isFinite(normalizedY) ? clampNumber(normalizedY, 0, 1) : Math.random() * 0.45;
      return {
        id: noteId,
        text: noteText,
        color: noteColor,
        x,
        y
      };
    })
    .slice(0, 42);
}

function readScheduleNotes(owner = getScheduleNotesOwnerKey()) {
  const raw = readStrictScopedPreference(SCHEDULE_NOTES_KEY, owner);
  if (!raw) return [];
  try {
    return normalizeScheduleNotes(JSON.parse(raw));
  } catch (_error) {
    return [];
  }
}

function persistScheduleNotes(owner = getScheduleNotesOwnerKey()) {
  writeStrictScopedPreference(SCHEDULE_NOTES_KEY, JSON.stringify(scheduleNotes), owner);
}

function getScheduleBoardMetrics() {
  const boardWidth = Math.max(240, Math.floor(calendarNotesBoard?.clientWidth || 0));
  const boardHeight = Math.max(220, Math.floor(calendarNotesBoard?.clientHeight || 0));
  const noteWidth = 138;
  const noteHeight = 124;
  return {
    boardWidth,
    boardHeight,
    noteWidth,
    noteHeight,
    maxX: Math.max(0, boardWidth - noteWidth),
    maxY: Math.max(0, boardHeight - noteHeight)
  };
}

function resolveScheduleNotePixels(note, metrics) {
  const left = clampNumber((Number(note?.x) || 0) * metrics.maxX, 0, metrics.maxX);
  const top = clampNumber((Number(note?.y) || 0) * metrics.maxY, 0, metrics.maxY);
  return { left, top };
}

function getScheduleNoteTilt(noteId) {
  let hash = 0;
  const raw = String(noteId || '');
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) % 997;
  }
  return ((hash % 7) - 3) * 0.75;
}

function renderScheduleNotes() {
  if (!calendarNotesBoard) return;

  if (!scheduleNotes.length) {
    calendarNotesBoard.innerHTML = '<p class="schedule-notes-empty">Sin notas por ahora. Crea una para tu to-do.</p>';
    return;
  }

  const metrics = getScheduleBoardMetrics();
  calendarNotesBoard.innerHTML = scheduleNotes.map((note) => {
    const { left, top } = resolveScheduleNotePixels(note, metrics);
    const tilt = getScheduleNoteTilt(note.id);
    return `
      <article class="schedule-note is-${note.color}" data-note-id="${escapeHtml(note.id)}" style="left:${left}px; top:${top}px; --note-tilt:${tilt}deg;">
        <button type="button" class="schedule-note-delete" data-note-delete="${escapeHtml(note.id)}" aria-label="Eliminar post-it">
          <svg viewBox="0 0 14 14" aria-hidden="true"><line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/></svg>
        </button>
        <textarea class="schedule-note-text" data-note-text="${escapeHtml(note.id)}" maxlength="${SCHEDULE_NOTE_MAX_LENGTH}" placeholder="Escribe algo...">${escapeHtml(note.text)}</textarea>
      </article>
    `;
  }).join('');
}

function updateScheduleNotePosition(noteId, leftPx, topPx, { persist = false } = {}) {
  const metrics = getScheduleBoardMetrics();
  const clampedLeft = clampNumber(Number(leftPx) || 0, 0, metrics.maxX);
  const clampedTop = clampNumber(Number(topPx) || 0, 0, metrics.maxY);
  const index = scheduleNotes.findIndex((note) => note.id === noteId);
  if (index < 0) return;
  scheduleNotes[index] = {
    ...scheduleNotes[index],
    x: metrics.maxX > 0 ? Number((clampedLeft / metrics.maxX).toFixed(4)) : 0,
    y: metrics.maxY > 0 ? Number((clampedTop / metrics.maxY).toFixed(4)) : 0
  };
  if (persist) {
    persistScheduleNotes();
  }
}

function createScheduleNote() {
  if (scheduleNotes.length >= 42) {
    showToast('Limite de 42 post-its alcanzado.', 'info');
    return;
  }

  const metrics = getScheduleBoardMetrics();
  const randomLeft = metrics.maxX > 0 ? Math.random() * Math.min(metrics.maxX, 120) : 0;
  const randomTop = metrics.maxY > 0 ? Math.random() * Math.min(metrics.maxY, 90) : 0;
  const color = SCHEDULE_NOTE_COLORS[Math.floor(Math.random() * SCHEDULE_NOTE_COLORS.length)];
  const noteId = `note_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const note = {
    id: noteId,
    text: '',
    color,
    x: metrics.maxX > 0 ? Number((randomLeft / metrics.maxX).toFixed(4)) : 0,
    y: metrics.maxY > 0 ? Number((randomTop / metrics.maxY).toFixed(4)) : 0
  };
  scheduleNotes.unshift(note);
  persistScheduleNotes();
  renderScheduleNotes();
}

function removeScheduleNote(noteId) {
  const next = scheduleNotes.filter((note) => note.id !== noteId);
  if (next.length === scheduleNotes.length) return;
  scheduleNotes = next;
  persistScheduleNotes();
  renderScheduleNotes();
}

function normalizeScheduleTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function normalizeScheduleTask(sourceTask) {
  const callbackDate = normalizeScheduleDateKey(
    sourceTask?.dueDate
    || sourceTask?.due_date
    || sourceTask?.callbackDate
    || sourceTask?.callback_date
    || (sourceTask?.dueAt ? String(sourceTask.dueAt).slice(0, 10) : '')
    || (sourceTask?.due_at ? String(sourceTask.due_at).slice(0, 10) : '')
  );
  if (!callbackDate) return null;

  const leadId = Number(sourceTask?.relatedLeadId ?? sourceTask?.related_lead_id ?? sourceTask?.leadId);
  const taskId = Number(sourceTask?.id ?? sourceTask?.taskId);
  const callbackCompletedAt = normalizeScheduleTimestamp(
    sourceTask?.completedAt
    ?? sourceTask?.completed_at
    ?? sourceTask?.callbackCompletedAt
    ?? sourceTask?.callback_completed_at
  );
  const dueAt = normalizeScheduleTimestamp(sourceTask?.dueAt ?? sourceTask?.due_at);
  const status = String(sourceTask?.status || '').trim().toLowerCase();

  return {
    taskId: Number.isFinite(taskId) && taskId > 0 ? taskId : null,
    taskType: String(sourceTask?.taskType || sourceTask?.task_type || 'callback').trim().toLowerCase(),
    leadId: Number.isFinite(leadId) && leadId > 0 ? leadId : null,
    leadName: String(sourceTask?.leadName || sourceTask?.lead_full_name || sourceTask?.full_name || '').trim(),
    caseId: sourceTask?.leadCaseId || sourceTask?.lead_case_id || sourceTask?.caseId ? String(sourceTask?.leadCaseId || sourceTask?.lead_case_id || sourceTask?.caseId) : '',
    name: String(sourceTask?.title || sourceTask?.name || sourceTask?.leadName || '').trim() || `Task #${taskId || '-'}`,
    description: String(sourceTask?.description || '').trim(),
    priority: String(sourceTask?.priority || 'normal').trim().toLowerCase(),
    status,
    callbackDate,
    dueAt,
    callbackCompletedAt,
    assignedTo: String(sourceTask?.ownerUsername || sourceTask?.owner_username || sourceTask?.assignedTo || '').trim(),
    ownerTeam: String(sourceTask?.ownerTeam || sourceTask?.owner_team || '').trim(),
    isOverdue: sourceTask?.isOverdue === true
  };
}

function getScheduleTaskPriorityRank(priority) {
  const normalized = String(priority || '').trim().toLowerCase();
  if (normalized === 'urgent') return 1;
  if (normalized === 'high') return 2;
  if (normalized === 'normal') return 3;
  return 4;
}

function sortScheduleTasks(tasks) {
  tasks.sort((a, b) => {
    if (a.callbackDate !== b.callbackDate) return a.callbackDate.localeCompare(b.callbackDate);
    const priorityDiff = getScheduleTaskPriorityRank(a.priority) - getScheduleTaskPriorityRank(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    if (a.caseId !== b.caseId) return String(a.caseId).localeCompare(String(b.caseId), 'es');
    return String(a.name).localeCompare(String(b.name), 'es');
  });
  return tasks;
}

function isScheduleTaskCompleted(task) {
  const status = String(task?.status || '').trim().toLowerCase();
  return status === 'completed' || status === 'cancelled' || Boolean(String(task?.callbackCompletedAt || '').trim());
}

function getScheduleTaskState(task, todayKey) {
  if (isScheduleTaskCompleted(task)) return 'completed';
  if (task?.isOverdue === true) return 'missed';
  if (String(task?.callbackDate || '') < todayKey) return 'missed';
  return 'pending';
}

function getScheduleTaskPresentation(task, todayKey) {
  const state = getScheduleTaskState(task, todayKey);
  if (state === 'completed') return { state, statusLabel: 'Completada', statusClass: 'is-completed' };
  if (state === 'missed') return { state, statusLabel: 'Vencida', statusClass: 'is-overdue' };
  if (String(task?.status || '').trim().toLowerCase() === 'in_progress') {
    return { state, statusLabel: 'En progreso', statusClass: 'is-pending' };
  }
  if (String(task?.status || '').trim().toLowerCase() === 'escalated') {
    return { state, statusLabel: 'Escalada', statusClass: 'is-overdue' };
  }
  return { state, statusLabel: 'Pendiente', statusClass: 'is-pending' };
}

function renderScheduleMonth() {
  if (!calendarMonthGrid || !calendarMonthLabel) return;

  const viewYear = scheduleViewDate.getFullYear();
  const viewMonth = scheduleViewDate.getMonth();
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
  const mondayStartOffset = (firstDayOfMonth.getDay() + 6) % 7;
  const todayKey = toIsoDateLocal(new Date());

  calendarMonthLabel.textContent = firstDayOfMonth.toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric'
  });

  const summaryByDate = scheduleTasks.reduce((acc, task) => {
    const state = getScheduleTaskState(task, todayKey);
    const current = acc.get(task.callbackDate) || {
      count: 0,
      hasMissed: false,
      hasPending: false,
      hasCompleted: false
    };
    current.count += 1;
    if (state === 'missed') current.hasMissed = true;
    if (state === 'pending') current.hasPending = true;
    if (state === 'completed') current.hasCompleted = true;
    acc.set(task.callbackDate, current);
    return acc;
  }, new Map());

  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    let dayNumber = 0;
    let dateRef = null;
    let outsideMonth = false;

    if (index < mondayStartOffset) {
      dayNumber = daysInPrevMonth - (mondayStartOffset - index - 1);
      dateRef = new Date(viewYear, viewMonth - 1, dayNumber);
      outsideMonth = true;
    } else if (index >= mondayStartOffset + daysInMonth) {
      dayNumber = index - (mondayStartOffset + daysInMonth) + 1;
      dateRef = new Date(viewYear, viewMonth + 1, dayNumber);
      outsideMonth = true;
    } else {
      dayNumber = index - mondayStartOffset + 1;
      dateRef = new Date(viewYear, viewMonth, dayNumber);
    }

    const dateKey = toIsoDateLocal(dateRef);
    const summary = summaryByDate.get(dateKey) || null;
    const taskCount = summary?.count || 0;
    const isSelected = dateKey === scheduleSelectedDateKey;
    const isToday = dateKey === todayKey;
    const dayStatusClass = summary
      ? (summary.hasMissed ? ' has-missed' : (summary.hasPending ? ' has-pending' : (summary.hasCompleted ? ' has-completed' : '')))
      : '';

    cells.push(`
      <button type="button" class="schedule-day${outsideMonth ? ' is-outside' : ''}${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}${dayStatusClass}" data-date-key="${dateKey}">
        ${isToday ? '<span class="schedule-day-tag">HOY</span>' : '<span class="schedule-day-tag schedule-day-tag-spacer" aria-hidden="true"></span>'}
        <span class="schedule-day-number">${dayNumber}</span>
        ${taskCount > 0 ? `<span class="schedule-day-dot">${taskCount}</span>` : ''}
      </button>
    `);
  }

  calendarMonthGrid.innerHTML = cells.join('');
}

function buildScheduleTaskCard(task, { todayKey, showCompleteAction = false } = {}) {
  const caseLabel = task.caseId ? `Caso #${escapeHtml(String(task.caseId))}` : 'Caso sin ID';
  const presentation = getScheduleTaskPresentation(task, todayKey);
  const actionButtons = [];
  const priorityLabel = String(task.priority || '').trim().toLowerCase();
  const taskOwnerLabel = String(task.assignedTo || '').trim();
  const typeLabel = String(task.taskType || '').trim().toLowerCase() === 'callback' ? 'Callback' : 'Task';

  if (task.leadId) {
    actionButtons.push(`<button type="button" class="schedule-open-lead-btn" data-open-lead-id="${task.leadId}">Abrir lead</button>`);
  }

  const canCompleteToday = showCompleteAction
    && presentation.state === 'pending'
    && Number.isInteger(task.taskId)
    && task.taskId > 0;

  if (canCompleteToday) {
    const isSaving = scheduleCompleteLeadInFlight === task.taskId;
    actionButtons.push(`<button type="button" class="schedule-complete-btn" data-complete-task-id="${task.taskId}" ${isSaving ? 'disabled' : ''}>${isSaving ? 'Guardando...' : 'Marcar completada'}</button>`);
  }

  const canDeleteEvent = hasCurrentSessionPermission('callbacks.view_all')
    && Number.isInteger(task.taskId)
    && task.taskId > 0;
  if (canDeleteEvent) {
    const isDeleting = scheduleDeleteTaskInFlight === task.taskId;
    actionButtons.push(`<button type="button" class="schedule-delete-btn" data-delete-task-id="${task.taskId}" ${isDeleting ? 'disabled' : ''}>${isDeleting ? 'Eliminando...' : 'Eliminar'}</button>`);
  }

  const ownerMeta = scheduleScope === 'team' && taskOwnerLabel
    ? ` · @${escapeHtml(taskOwnerLabel)}`
    : '';
  const priorityMeta = priorityLabel ? ` · ${escapeHtml(priorityLabel.toUpperCase())}` : '';
  const leadLinkLabel = task.leadName
    ? `${task.caseId ? `Case #${escapeHtml(String(task.caseId))} · ` : ''}${escapeHtml(task.leadName)}`
    : (task.caseId ? `Case #${escapeHtml(String(task.caseId))}` : '');
  const leadLinkHtml = task.leadId
    ? `<a class="schedule-task-lead-inline" href="/client.html?id=${task.leadId}" data-open-lead-id="${task.leadId}">${leadLinkLabel || `Lead #${task.leadId}`}</a>`
    : '';
  const menuItems = [`<span class="schedule-task-menu-status">${presentation.statusLabel}</span>`];
  if (actionButtons.length) {
    menuItems.push(...actionButtons);
  }

  return `
    <article class="schedule-task-card ${presentation.statusClass}">
      <div class="schedule-task-main">
        <p class="schedule-task-title">${escapeHtml(task.name)}</p>
        <p class="schedule-task-meta">${typeLabel} · ${caseLabel} - ${escapeHtml(formatScheduleDateLabel(task.callbackDate))}${priorityMeta}${ownerMeta}</p>
        ${leadLinkHtml ? `<p class="schedule-task-lead-row">${leadLinkHtml}</p>` : ''}
      </div>
      <div class="schedule-task-side">
        <div class="schedule-task-menu" data-task-menu>
          <button type="button" class="schedule-task-menu-toggle" aria-label="Mas acciones" aria-expanded="false" data-task-menu-toggle>
            <span class="schedule-task-menu-icon" aria-hidden="true">&#8942;</span>
          </button>
          <div class="schedule-task-menu-panel">
            ${menuItems.join('')}
          </div>
        </div>
      </div>
    </article>
  `;
}

function closeScheduleTaskMenus(exceptMenu = null) {
  if (!calendarAgendaList) return;
  const menus = calendarAgendaList.querySelectorAll('[data-task-menu].is-open');
  menus.forEach((menu) => {
    if (exceptMenu && menu === exceptMenu) return;
    menu.classList.remove('is-open');
    const toggleBtn = menu.querySelector('[data-task-menu-toggle]');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
  });
}

async function markScheduleTaskCompleted(taskId) {
  const numericTaskId = Number(taskId);
  if (!Number.isInteger(numericTaskId) || numericTaskId <= 0) return;
  if (scheduleCompleteLeadInFlight) return;

  scheduleCompleteLeadInFlight = numericTaskId;
  renderScheduleAgenda();
  try {
    const result = await requestJson(`/api/tasks/${numericTaskId}/complete`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }
    });
    showToast(result?.message || 'Task marcada como completada.', 'success');
    await loadScheduleTasks({ force: true });
  } catch (error) {
    showToast(error.message || 'No se pudo marcar la task como completada.', 'error');
  } finally {
    scheduleCompleteLeadInFlight = null;
    renderScheduleAgenda();
    renderScheduleMonth();
  }
}

async function deleteScheduleTask(taskId) {
  const numericTaskId = Number(taskId);
  if (!Number.isInteger(numericTaskId) || numericTaskId <= 0) return;
  if (!hasCurrentSessionPermission('callbacks.view_all')) {
    showToast('Solo admin/sup puede eliminar eventos de agenda.', 'error');
    return;
  }
  if (scheduleDeleteTaskInFlight) return;

  const task = scheduleTasks.find((entry) => Number(entry.taskId) === numericTaskId);
  const taskLabel = String(task?.name || `Task #${numericTaskId}`).trim() || `Task #${numericTaskId}`;
  if (!window.confirm(`Eliminar evento "${taskLabel}"?`)) return;

  scheduleDeleteTaskInFlight = numericTaskId;
  renderScheduleAgenda();
  try {
    const result = await requestJson(`/api/tasks/${numericTaskId}`, {
      method: 'DELETE'
    });
    showToast(result?.message || 'Evento eliminado correctamente.', 'success');
    await loadScheduleTasks({ force: true });
  } catch (error) {
    showToast(error.message || 'No se pudo eliminar el evento.', 'error');
  } finally {
    scheduleDeleteTaskInFlight = null;
    renderScheduleAgenda();
    renderScheduleMonth();
  }
}

async function createScheduleEvent(taskType = 'general') {
  await openScheduleTaskModal(taskType);
}

function renderScheduleAgenda() {
  if (!calendarAgendaList) return;

  const todayKey = toIsoDateLocal(new Date());
  const sortedTasks = sortScheduleTasks(scheduleTasks.slice());
  const missedTasks = sortedTasks.filter((task) => getScheduleTaskState(task, todayKey) === 'missed');
  const pendingTasks = sortedTasks.filter((task) => getScheduleTaskState(task, todayKey) === 'pending');
  const selectedTasks = sortedTasks.filter((task) => task.callbackDate === scheduleSelectedDateKey);
  const selectedOpenTasks = selectedTasks.filter((task) => getScheduleTaskState(task, todayKey) !== 'completed');
  const selectedCompletedTasks = selectedTasks.filter((task) => getScheduleTaskState(task, todayKey) === 'completed');
  const todayPending = pendingTasks.filter((task) => task.callbackDate === todayKey);
  const upcomingPending = pendingTasks.filter((task) => task.callbackDate > todayKey);

  if (calendarOverdueCount) calendarOverdueCount.textContent = String(missedTasks.length);
  if (calendarTodayCount) calendarTodayCount.textContent = String(todayPending.length);
  if (calendarUpcomingCount) calendarUpcomingCount.textContent = String(upcomingPending.length);

  if (calendarSelectedDateLabel) {
    calendarSelectedDateLabel.textContent = formatScheduleDateLabel(scheduleSelectedDateKey);
  }

  if (!sortedTasks.length) {
    const selectedOwnerLabel = getScheduleOwnerLabelByUsername(scheduleOwnerFilter);
    calendarAgendaList.innerHTML = scheduleScope === 'team'
      ? (
        selectedOwnerLabel
          ? `<p class="schedule-empty-message">Aun no hay tasks asignadas a ${escapeHtml(selectedOwnerLabel)}.</p>`
          : '<p class="schedule-empty-message">Aun no hay tasks en la bandeja de equipo.</p>'
      )
      : '<p class="schedule-empty-message">Aun no hay tasks asignadas para ti.</p>';
    return;
  }

  const sections = [];

  if (selectedOpenTasks.length) {
    const canCompleteSelectedDate = scheduleSelectedDateKey === todayKey;
    sections.push(`
      <section class="schedule-task-section">
        <h4 class="schedule-task-section-title">Fecha seleccionada</h4>
        ${selectedOpenTasks.map((task) => buildScheduleTaskCard(task, { todayKey, showCompleteAction: canCompleteSelectedDate })).join('')}
      </section>
    `);
  }

  if (selectedCompletedTasks.length) {
    sections.push(`
      <section class="schedule-task-section">
        <h4 class="schedule-task-section-title">Completadas</h4>
        ${selectedCompletedTasks.map((task) => buildScheduleTaskCard(task, { todayKey })).join('')}
      </section>
    `);
  }

  if (!sections.length) {
    calendarAgendaList.innerHTML = '<p class="schedule-empty-message">No hay tasks para esta fecha.</p>';
    return;
  }

  calendarAgendaList.innerHTML = sections.join('');
}
async function loadScheduleTasks({ force = false } = {}) {
  const ownerKey = getScheduleOwner();
  const ownerScopeKey = getScheduleOwnerScopeCacheKey(ownerKey);
  const selectedTeamOwnerKey = normalizePreferenceOwner(scheduleOwnerFilter);
  if (!ownerKey) {
    scheduleTasks = [];
    scheduleTasksLoaded = false;
    renderScheduleMonth();
    renderScheduleAgenda();
    return [];
  }

  if (!force && scheduleTasksLoaded && scheduleOwnerKey === ownerScopeKey) {
    renderScheduleMonth();
    renderScheduleAgenda();
    return scheduleTasks;
  }

  scheduleOwnerKey = ownerScopeKey;

  try {
    const cacheBuster = force ? `&_=${Date.now()}` : '';
    const scopeParam = scheduleScope === 'team' ? 'team' : 'mine';
    const ownerParam = scheduleScope === 'team' && scheduleOwnerFilter
      ? `&owner=${encodeURIComponent(scheduleOwnerFilter)}`
      : '';
    const data = await requestJson(
      `/api/tasks?scope=${encodeURIComponent(scopeParam)}&from=${encodeURIComponent(SCHEDULE_CALLBACKS_FROM)}&includeCompleted=true${ownerParam}${cacheBuster}`,
      { cache: 'no-store' }
    );
    const incomingTasks = Array.isArray(data?.tasks) ? data.tasks : [];
    scheduleTasks = sortScheduleTasks(
      incomingTasks
        .map((task) => normalizeScheduleTask(task))
        .filter(Boolean)
    );
    scheduleTasksLoaded = true;
  } catch (error) {
    console.error('Error al cargar tasks generales, fallback callbacks:', error);
    try {
      const cacheBuster = force ? `&_=${Date.now()}` : '';
      const data = await requestJson(`/api/callbacks?from=${encodeURIComponent(SCHEDULE_CALLBACKS_FROM)}${cacheBuster}`, {
        cache: 'no-store'
      });
      const callbacks = Array.isArray(data?.callbacks) ? data.callbacks : [];
      scheduleTasks = sortScheduleTasks(
        callbacks
          .map((callback) => normalizeScheduleTask(callback))
          .filter(Boolean)
          .filter((callback) => (
            scheduleScope === 'team'
              ? (
                selectedTeamOwnerKey
                  ? normalizePreferenceOwner(callback.assignedTo) === selectedTeamOwnerKey
                  : true
              )
              : normalizePreferenceOwner(callback.assignedTo) === ownerKey
          ))
      );
      scheduleTasksLoaded = true;
    } catch (fallbackError) {
      console.error('Error al cargar fallback callbacks:', fallbackError);
      scheduleTasks = [];
      scheduleTasksLoaded = false;
    }
  }

  renderScheduleMonth();
  renderScheduleAgenda();
  return scheduleTasks;
}

function hydrateScheduleForCurrentUser({ forceTasks = false } = {}) {
  const session = getSession();
  const ownerKey = getScheduleOwner(session);
  const canViewTeam = hasCurrentSessionPermission('callbacks.view_all');
  if (!canViewTeam && (scheduleScope !== 'mine' || scheduleOwnerFilter)) {
    scheduleScope = 'mine';
    scheduleOwnerFilter = '';
  }

  syncScheduleOwnerSelector(session, { preserveSearch: true });
  if (canViewTeam) {
    void loadScheduleOwnerMembers().then(() => {
      syncScheduleOwnerSelector(session, { preserveSearch: true });
      renderScheduleAgenda();
    });
  }

  const ownerScopeKey = getScheduleOwnerScopeCacheKey(ownerKey);

  if (scheduleOwnerKey !== ownerScopeKey) {
    scheduleTasks = [];
    scheduleTasksLoaded = false;
  }
  scheduleOwnerKey = ownerScopeKey;

  if (!parseIsoDateLocal(scheduleSelectedDateKey)) {
    scheduleSelectedDateKey = toIsoDateLocal(new Date());
  }

  const selectedDate = parseIsoDateLocal(scheduleSelectedDateKey) || new Date();
  scheduleViewDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);

  scheduleNotes = readScheduleNotes(getScheduleNotesOwnerKey(session));
  const canCreateEvents = hasCurrentSessionPermission('tasks.manage');
  if (calendarCreateTaskBtn) calendarCreateTaskBtn.classList.toggle('hidden', !canCreateEvents);
  if (calendarCreateCallbackBtn) calendarCreateCallbackBtn.classList.toggle('hidden', !canCreateEvents);
  renderScheduleNotes();
  renderScheduleMonth();
  renderScheduleAgenda();
  void loadScheduleTasks({ force: forceTasks || !scheduleTasksLoaded });
}

function formatEmailDateTime(dateValue) {
  if (!dateValue) return '-';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getEmailStatusMeta(statusValue) {
  const normalized = String(statusValue || '').trim().toLowerCase();
  if (normalized === 'sent') return { label: 'Enviado', className: 'sent' };
  if (normalized === 'failed') return { label: 'Fallo', className: 'failed' };
  return { label: 'En proceso', className: 'queued' };
}

function updateEmailsCounter(count) {
  if (!emailsCount) return;
  const safeCount = Number.isFinite(count) ? count : 0;
  emailsCount.textContent = `(${safeCount})`;
}

function updateEmailsRoleUi() {
  const hasGlobalAccess = hasCurrentSessionPermission('emails.view_all');
  const canDeleteEmails = hasCurrentSessionPermission('emails.delete');

  if (emailsView) {
    emailsView.classList.toggle('is-admin', hasGlobalAccess);
  }

  if (emailsRoleHint) {
    emailsRoleHint.textContent = hasGlobalAccess
      ? 'Vista global de administracion'
      : 'Vista Seller: autoria y leads asignados';
  }

  if (emailsDeleteSelectedBtn) {
    emailsDeleteSelectedBtn.classList.toggle('hidden', !canDeleteEmails);
  }

  if (!hasGlobalAccess) {
    selectedEmailIds.clear();
  }
}

function syncEmailSelectionUi() {
  const hasGlobalAccess = hasCurrentSessionPermission('emails.view_all');
  const canDeleteEmails = hasCurrentSessionPermission('emails.delete');
  const availableIds = new Set(allEmailsCache.map((email) => Number(email.id)));
  selectedEmailIds = new Set(
    Array.from(selectedEmailIds).filter((id) => availableIds.has(id))
  );

  const total = allEmailsCache.length;
  const selected = selectedEmailIds.size;

  if (emailsSelectionCount) {
    emailsSelectionCount.classList.toggle('hidden', !(canDeleteEmails && selected > 0));
    emailsSelectionCount.textContent = `${selected} seleccionado${selected === 1 ? '' : 's'}`;
  }

  if (emailsDeleteSelectedBtn) {
    emailsDeleteSelectedBtn.disabled = !(canDeleteEmails && selected > 0);
  }

  if (emailsSelectAll) {
    const canSelect = hasGlobalAccess && total > 0;
    emailsSelectAll.disabled = !canSelect;
    emailsSelectAll.checked = canSelect && selected === total;
    emailsSelectAll.indeterminate = canSelect && selected > 0 && selected < total;
  }
}

function renderEmailsEmptyState(title = 'No hay correos para mostrar', subtitle = 'Cuando la plataforma envie correos, apareceran aqui.') {
  if (!emailsTableBody) return;

  emailsTableBody.innerHTML = `
    <tr class="email-row empty-state">
      <td colspan="8" class="empty-message">
        <div class="empty-content">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="5" width="18" height="14" rx="2"></rect>
            <path d="m4 7 8 6 8-6"></path>
          </svg>
          <p>${escapeHtml(title)}</p>
          <span>${escapeHtml(subtitle)}</span>
        </div>
      </td>
    </tr>
  `;
}

function renderEmailsRows(emails) {
  if (!emailsTableBody) return;

  const rows = Array.isArray(emails) ? emails : [];
  const hasGlobalAccess = hasCurrentSessionPermission('emails.view_all');
  const canDeleteEmails = hasCurrentSessionPermission('emails.delete');
  updateEmailsCounter(rows.length);
  updateEmailsRoleUi();

  if (!rows.length) {
    renderEmailsEmptyState();
    syncEmailSelectionUi();
    return;
  }

  emailsTableBody.innerHTML = rows.map((email) => {
    const emailId = Number(email.id);
    const selected = selectedEmailIds.has(emailId);
    const statusMeta = getEmailStatusMeta(email.status);
    const relatedLabel = email.lead_id
      ? `Lead #${email.lead_case_id || email.lead_id}${email.lead_full_name ? ` · ${email.lead_full_name}` : ''}`
      : (email.to_email || 'Sin lead relacionado');
    const relatedCellHtml = email.lead_id
      ? `<a class="email-related-link" href="/client.html?id=${email.lead_id}">${escapeHtml(relatedLabel)}</a>`
      : `<span class="email-related-fallback">${escapeHtml(relatedLabel)}</span>`;

    return `
      <tr class="email-row" data-email-id="${emailId}">
        <td class="emails-select-col">
          <label class="email-circle-select" title="Seleccionar correo">
            <input type="checkbox" class="email-select-checkbox email-row-select" data-email-id="${emailId}" ${selected ? 'checked' : ''} ${canDeleteEmails ? '' : 'disabled'} />
            <span class="email-select-circle" aria-hidden="true"></span>
          </label>
        </td>
        <td class="email-author">@${escapeHtml(email.author_username || '-')}</td>
        <td class="email-related">${relatedCellHtml}</td>
        <td class="email-subject" title="${escapeHtml(email.subject || '')}">${escapeHtml(email.subject || '(Sin asunto)')}</td>
        <td class="email-destination">${escapeHtml(email.to_email || '-')}</td>
        <td class="email-date">${formatEmailDateTime(email.sent_at || email.created_at)}</td>
        <td><span class="email-status-badge ${statusMeta.className}">${statusMeta.label}</span></td>
        <td class="emails-actions-col">
          ${canDeleteEmails
            ? `<button class="email-row-delete-btn" type="button" data-email-id="${emailId}" title="Eliminar correo" aria-label="Eliminar correo">Eliminar</button>`
            : '<span class="email-no-actions">-</span>'
          }
        </td>
      </tr>
    `;
  }).join('');

  syncEmailSelectionUi();
}

async function loadEmails(forceReload = false) {
  if (emailsLoaded && !forceReload) {
    renderEmailsRows(allEmailsCache);
    return allEmailsCache;
  }

  if (emailsRequestInFlight) {
    return emailsRequestInFlight;
  }

  emailsRequestInFlight = (async () => {
    try {
      const identity = getSessionIdentity();
      const params = new URLSearchParams();
      if (identity.username) params.set('username', identity.username);
      if (identity.displayName) params.set('displayName', identity.displayName);
      if (identity.email) params.set('email', identity.email);
      if (identity.role) params.set('role', identity.role);
      params.set('limit', String(EMAILS_FETCH_LIMIT));

      const data = await requestJson(`/api/emails?${params.toString()}`, { cache: 'no-store' });
      allEmailsCache = Array.isArray(data?.emails) ? data.emails : [];
      emailsLoaded = true;
      renderEmailsRows(allEmailsCache);
      return allEmailsCache;
    } catch (error) {
      console.error('Error cargando correos:', error);
      allEmailsCache = [];
      emailsLoaded = false;
      renderEmailsEmptyState('No se pudieron cargar los correos', error.message || 'Intenta actualizar nuevamente.');
      updateEmailsCounter(0);
      return [];
    } finally {
      emailsRequestInFlight = null;
    }
  })();

  return emailsRequestInFlight;
}

async function deleteEmailById(emailId) {
  const numericId = Number(emailId);
  if (!Number.isInteger(numericId) || numericId <= 0) return;
  if (!hasCurrentSessionPermission('emails.delete')) {
    showToast('No tienes permisos para eliminar correos.', 'error');
    return;
  }

  const targetEmail = allEmailsCache.find((entry) => Number(entry.id) === numericId);
  const subjectPreview = String(targetEmail?.subject || '').trim() || `ID ${numericId}`;
  if (!window.confirm(`Eliminar correo "${subjectPreview}"?`)) return;

  const identity = getSessionIdentity();
  const params = new URLSearchParams();
  if (identity.role) params.set('role', identity.role);
  if (identity.username) params.set('username', identity.username);
  if (identity.displayName) params.set('displayName', identity.displayName);
  if (identity.email) params.set('email', identity.email);
  const query = params.toString();

  await requestJson(`/api/emails/${numericId}${query ? `?${query}` : ''}`, {
    method: 'DELETE'
  });

  allEmailsCache = allEmailsCache.filter((entry) => Number(entry.id) !== numericId);
  selectedEmailIds.delete(numericId);
  renderEmailsRows(allEmailsCache);
  showToast('Correo eliminado correctamente.', 'success');
}

async function deleteSelectedEmails() {
  if (!hasCurrentSessionPermission('emails.delete')) {
    showToast('No tienes permisos para eliminar correos.', 'error');
    return;
  }

  const ids = Array.from(selectedEmailIds).filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) {
    showToast('Selecciona al menos un correo.', 'info');
    return;
  }

  if (!window.confirm(`Eliminar ${ids.length} correo${ids.length === 1 ? '' : 's'} seleccionados?`)) {
    return;
  }

  const identity = getSessionIdentity();
  const data = await requestJson('/api/emails/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ids,
      role: identity.role,
      username: identity.username,
      displayName: identity.displayName,
      email: identity.email
    })
  });

  const deletedIds = Array.isArray(data?.deletedIds) ? data.deletedIds.map((value) => Number(value)) : ids;
  const deletedSet = new Set(deletedIds);
  allEmailsCache = allEmailsCache.filter((entry) => !deletedSet.has(Number(entry.id)));
  selectedEmailIds = new Set(Array.from(selectedEmailIds).filter((id) => !deletedSet.has(id)));
  renderEmailsRows(allEmailsCache);
  showToast(`Se eliminaron ${deletedSet.size || ids.length} correos.`, 'success');
}

function initializeEmailsInteractions() {
  if (emailsInteractionsBound) return;
  emailsInteractionsBound = true;

  if (emailsTableBody) {
    emailsTableBody.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.classList.contains('email-row-select')) return;

      const emailId = Number(target.dataset.emailId);
      if (!Number.isInteger(emailId) || emailId <= 0) return;
      if (!hasCurrentSessionPermission('emails.delete')) return;

      if (target.checked) {
        selectedEmailIds.add(emailId);
      } else {
        selectedEmailIds.delete(emailId);
      }
      syncEmailSelectionUi();
    });

    emailsTableBody.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const deleteBtn = target.closest('.email-row-delete-btn');
      if (!deleteBtn) return;
      const emailId = Number(deleteBtn.dataset.emailId);
      if (!Number.isInteger(emailId) || emailId <= 0) return;

      deleteEmailById(emailId).catch((error) => {
        console.error('Error eliminando correo:', error);
        showToast(error.message || 'No se pudo eliminar el correo.', 'error');
      });
    });
  }

  if (emailsSelectAll) {
    emailsSelectAll.addEventListener('change', (event) => {
      if (!hasCurrentSessionPermission('emails.delete')) return;
      const checked = Boolean(event.target.checked);
      const ids = allEmailsCache.map((email) => Number(email.id)).filter((id) => Number.isInteger(id) && id > 0);
      selectedEmailIds = checked ? new Set(ids) : new Set();

      if (emailsTableBody) {
        emailsTableBody.querySelectorAll('.email-row-select').forEach((checkbox) => {
          checkbox.checked = checked;
        });
      }
      syncEmailSelectionUi();
    });
  }

  if (emailsDeleteSelectedBtn) {
    emailsDeleteSelectedBtn.addEventListener('click', () => {
      deleteSelectedEmails().catch((error) => {
        console.error('Error en borrado masivo de correos:', error);
        showToast(error.message || 'No se pudieron eliminar los correos.', 'error');
      });
    });
  }

  if (emailsRefreshBtn) {
    emailsRefreshBtn.addEventListener('click', () => {
      loadEmails(true).catch((error) => {
        console.error('Error al refrescar correos:', error);
        showToast(error.message || 'No se pudieron actualizar los correos.', 'error');
      });
    });
  }
}

function setToolbarRouteButtonState(routeName) {
  if (leadsBtn) {
    const leadsActive = routeName === 'leads';
    leadsBtn.style.background = leadsActive ? 'var(--accent)' : '';
    leadsBtn.style.color = leadsActive ? '#000' : '';
  }
  if (calendarBtn) {
    const calendarActive = routeName === 'calendar';
    calendarBtn.style.background = calendarActive ? 'var(--accent)' : '';
    calendarBtn.style.color = calendarActive ? '#000' : '';
  }
  if (emailsBtn) {
    const emailsActive = routeName === 'emails';
    emailsBtn.style.background = emailsActive ? 'var(--accent)' : '';
    emailsBtn.style.color = emailsActive ? '#000' : '';
  }
}

function showCalendarView() {
  if (dashboardGrid) dashboardGrid.classList.add('hidden');
  if (leadsView) leadsView.classList.add('hidden');
  if (emailsView) emailsView.classList.add('hidden');
  if (usersAdminView) usersAdminView.classList.add('hidden');
  if (calendarView) {
    calendarView.classList.remove('hidden');
    calendarView.animate(
      [
        { opacity: 0, transform: 'translateY(14px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ],
      {
        duration: 360,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
      }
    );
  }
  isLeadsView = false;
  isCalendarView = true;
  isEmailsView = false;
  setToolbarRouteButtonState('calendar');
  hideLeadSearchSuggestions();
  initializeScheduleInteractions();
  hydrateScheduleForCurrentUser({ forceTasks: true });
}

function showEmailsView() {
  if (dashboardGrid) dashboardGrid.classList.add('hidden');
  if (leadsView) leadsView.classList.add('hidden');
  if (calendarView) calendarView.classList.add('hidden');
  if (usersAdminView) usersAdminView.classList.add('hidden');
  if (emailsView) {
    emailsView.classList.remove('hidden');
    emailsView.animate(
      [
        { opacity: 0, transform: 'translateY(14px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ],
      {
        duration: 360,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
      }
    );
  }

  isLeadsView = false;
  isCalendarView = false;
  isEmailsView = true;
  setToolbarRouteButtonState('emails');
  hideLeadSearchSuggestions();
  updateEmailsRoleUi();
  initializeEmailsInteractions();
  void loadEmails();
}

function showUsersAdminView() {
  if (!hasCurrentSessionPermission('users.manage')) {
    showDashboardView();
    return;
  }

  if (dashboardGrid) dashboardGrid.classList.add('hidden');
  if (leadsView) leadsView.classList.add('hidden');
  if (calendarView) calendarView.classList.add('hidden');
  if (emailsView) emailsView.classList.add('hidden');
  if (usersAdminView) {
    usersAdminView.classList.remove('hidden');
    usersAdminView.animate(
      [
        { opacity: 0, transform: 'translateY(14px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ],
      {
        duration: 360,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
      }
    );
  }

  isLeadsView = false;
  isCalendarView = false;
  isEmailsView = false;
  setToolbarRouteButtonState('admin-users');
  hideLeadSearchSuggestions();
  closeUsersAdminRoleMenu();
  closeUsersAdminPermissionsMenu();
  setUsersAdminFormOpen(false);
  void loadAdminUsers();
  resetUsersAdminForm(null);
}

function initializeScheduleInteractions() {
  if (scheduleInteractionsBound) return;
  scheduleInteractionsBound = true;

  if (calendarPrevMonthBtn) {
    calendarPrevMonthBtn.addEventListener('click', () => {
      scheduleViewDate = new Date(scheduleViewDate.getFullYear(), scheduleViewDate.getMonth() - 1, 1);
      renderScheduleMonth();
    });
  }

  if (calendarNextMonthBtn) {
    calendarNextMonthBtn.addEventListener('click', () => {
      scheduleViewDate = new Date(scheduleViewDate.getFullYear(), scheduleViewDate.getMonth() + 1, 1);
      renderScheduleMonth();
    });
  }

  if (calendarTodayBtn) {
    calendarTodayBtn.addEventListener('click', () => {
      const today = new Date();
      scheduleSelectedDateKey = toIsoDateLocal(today);
      scheduleViewDate = new Date(today.getFullYear(), today.getMonth(), 1);
      renderScheduleMonth();
      renderScheduleAgenda();
    });
  }

  if (calendarMonthGrid) {
    calendarMonthGrid.addEventListener('click', (event) => {
      const dayBtn = event.target.closest('.schedule-day[data-date-key]');
      if (!dayBtn) return;
      const nextDateKey = String(dayBtn.dataset.dateKey || '');
      if (!parseIsoDateLocal(nextDateKey)) return;
      scheduleSelectedDateKey = nextDateKey;
      const parsed = parseIsoDateLocal(nextDateKey);
      scheduleViewDate = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
      renderScheduleMonth();
      renderScheduleAgenda();
    });
  }

  if (calendarAgendaList) {
    calendarAgendaList.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const menuToggle = target.closest('[data-task-menu-toggle]');
      if (menuToggle) {
        const menu = menuToggle.closest('[data-task-menu]');
        if (!menu) return;
        const shouldOpen = !menu.classList.contains('is-open');
        closeScheduleTaskMenus();
        if (shouldOpen) {
          menu.classList.add('is-open');
          menuToggle.setAttribute('aria-expanded', 'true');
        }
        return;
      }

      const completeBtn = target.closest('[data-complete-task-id]');
      if (completeBtn) {
        const taskId = Number(completeBtn.dataset.completeTaskId);
        if (!Number.isFinite(taskId) || taskId <= 0) return;
        closeScheduleTaskMenus();
        void markScheduleTaskCompleted(taskId);
        return;
      }

      const deleteBtn = target.closest('[data-delete-task-id]');
      if (deleteBtn) {
        const taskId = Number(deleteBtn.dataset.deleteTaskId);
        if (!Number.isFinite(taskId) || taskId <= 0) return;
        closeScheduleTaskMenus();
        void deleteScheduleTask(taskId);
        return;
      }

      const openBtn = target.closest('[data-open-lead-id]');
      if (!openBtn) return;
      const leadId = Number(openBtn.dataset.openLeadId);
      if (!Number.isFinite(leadId) || leadId <= 0) return;
      closeScheduleTaskMenus();
      window.location.href = `/client.html?id=${leadId}`;
    });
  }

  if (calendarOwnerBadge) {
    calendarOwnerBadge.addEventListener('focus', () => {
      if (!hasCurrentSessionPermission('callbacks.view_all')) return;
      openScheduleOwnerMenu({ clearCurrent: true });
    });

    calendarOwnerBadge.addEventListener('input', () => {
      if (!hasCurrentSessionPermission('callbacks.view_all')) return;
      scheduleOwnerSearchTerm = String(calendarOwnerBadge.value || '').trim();
      openScheduleOwnerMenu({ clearCurrent: false });
    });

    calendarOwnerBadge.addEventListener('keydown', (event) => {
      if (!hasCurrentSessionPermission('callbacks.view_all')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeScheduleOwnerMenu({ restoreSelection: true });
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const query = String(calendarOwnerBadge.value || '').trim();
        const options = buildScheduleOwnerPickerOptions(query);
        if (!options.length) return;

        const normalizedQuery = query.toLowerCase();
        const exactMatch = options.find((option) =>
          option.label.toLowerCase() === normalizedQuery
          || option.label.toLowerCase().includes(normalizedQuery)
        );
        const chosen = exactMatch || options[0];
        if (!chosen) return;

        if (applyScheduleOwnerSelection(chosen.value)) {
          closeScheduleOwnerMenu({ restoreSelection: true });
        }
      }
    });
  }

  if (calendarOwnerMenu) {
    calendarOwnerMenu.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });

    calendarOwnerMenu.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const optionBtn = target.closest('.schedule-owner-option[data-owner-value]');
      if (!optionBtn) return;
      const nextValue = String(optionBtn.dataset.ownerValue || '');
      if (!nextValue) return;
      if (applyScheduleOwnerSelection(nextValue)) {
        closeScheduleOwnerMenu({ restoreSelection: true });
      }
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (scheduleOwnerMenuOpen && calendarOwnerPicker && !calendarOwnerPicker.contains(target)) {
      closeScheduleOwnerMenu({ restoreSelection: true });
    }

    if (!target.closest('[data-task-menu]')) {
      closeScheduleTaskMenus();
    }

    if (
      scheduleTaskModalOpen
      && scheduleTaskLeadSuggestions
      && !scheduleTaskLeadSuggestions.classList.contains('hidden')
      && scheduleTaskLeadSearchInput
      && !scheduleTaskLeadSearchInput.contains(target)
      && !scheduleTaskLeadSuggestions.contains(target)
    ) {
      closeScheduleTaskLeadSuggestions();
    }
  });

  if (calendarCreateTaskBtn) {
    calendarCreateTaskBtn.addEventListener('click', () => {
      void createScheduleEvent('general');
    });
  }

  if (calendarCreateCallbackBtn) {
    calendarCreateCallbackBtn.addEventListener('click', () => {
      void createScheduleEvent('callback');
    });
  }

  if (scheduleTaskForm) {
    scheduleTaskForm.addEventListener('submit', (event) => {
      void submitScheduleTaskModal(event);
    });
  }

  if (scheduleTaskCloseBtn) {
    scheduleTaskCloseBtn.addEventListener('click', () => {
      if (scheduleTaskSubmitInFlight) return;
      closeScheduleTaskModal();
    });
  }

  if (scheduleTaskCancelBtn) {
    scheduleTaskCancelBtn.addEventListener('click', () => {
      if (scheduleTaskSubmitInFlight) return;
      closeScheduleTaskModal();
    });
  }

  if (scheduleTaskModal) {
    scheduleTaskModal.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || scheduleTaskSubmitInFlight) return;
      if (target.matches('[data-schedule-task-close]')) {
        closeScheduleTaskModal();
      }
    });
  }

  if (scheduleTaskLeadSuggestions) {
    scheduleTaskLeadSuggestions.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });

    scheduleTaskLeadSuggestions.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const option = target.closest('.schedule-task-lead-option[data-lead-index]');
      if (!option) return;
      const optionIndex = Number(option.dataset.leadIndex);
      if (selectScheduleTaskLeadAt(optionIndex)) {
        scheduleTaskLeadSearchInput?.focus();
      }
    });
  }

  if (scheduleTaskLeadSearchInput) {
    scheduleTaskLeadSearchInput.addEventListener('focus', async () => {
      if (!scheduleTaskModalOpen) return;
      await ensureScheduleTaskLeadPoolLoaded();
      renderScheduleTaskLeadSuggestions(scheduleTaskLeadSearchInput.value);
    });

    scheduleTaskLeadSearchInput.addEventListener('input', () => {
      if (!scheduleTaskModalOpen) return;
      setScheduleTaskLeadSelection(null);
      renderScheduleTaskLeadSuggestions(scheduleTaskLeadSearchInput.value);
    });

    scheduleTaskLeadSearchInput.addEventListener('keydown', (event) => {
      if (!scheduleTaskModalOpen) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!scheduleTaskLeadMatches.length) return;
        setActiveScheduleTaskLeadSuggestion(scheduleTaskLeadActiveIndex + 1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!scheduleTaskLeadMatches.length) return;
        setActiveScheduleTaskLeadSuggestion(scheduleTaskLeadActiveIndex - 1);
        return;
      }
      if (event.key === 'Enter') {
        if (scheduleTaskLeadMatches.length > 0 && scheduleTaskLeadActiveIndex >= 0) {
          event.preventDefault();
          selectScheduleTaskLeadAt(scheduleTaskLeadActiveIndex);
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeScheduleTaskLeadSuggestions();
      }
    });
  }

  if (calendarAddNoteBtn) {
    calendarAddNoteBtn.addEventListener('click', () => {
      createScheduleNote();
    });
  }

  if (calendarNotesBoard) {
    calendarNotesBoard.addEventListener('click', (event) => {
      const deleteBtn = event.target.closest('[data-note-delete]');
      if (deleteBtn) {
        removeScheduleNote(String(deleteBtn.dataset.noteDelete || ''));
      }
    });

    calendarNotesBoard.addEventListener('input', (event) => {
      const textArea = event.target.closest('[data-note-text]');
      if (!textArea) return;
      const noteId = String(textArea.dataset.noteText || '');
      const noteIndex = scheduleNotes.findIndex((note) => note.id === noteId);
      if (noteIndex < 0) return;
      scheduleNotes[noteIndex] = {
        ...scheduleNotes[noteIndex],
        text: String(textArea.value || '').slice(0, SCHEDULE_NOTE_MAX_LENGTH)
      };
      persistScheduleNotes();
    });

    calendarNotesBoard.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const noteEl = event.target.closest('.schedule-note[data-note-id]');
      if (!noteEl) return;
      if (event.target.closest('.schedule-note-text') || event.target.closest('.schedule-note-delete')) return;
      event.preventDefault();

      const metrics = getScheduleBoardMetrics();
      const boardRect = calendarNotesBoard.getBoundingClientRect();
      const noteRect = noteEl.getBoundingClientRect();
      const noteId = String(noteEl.dataset.noteId || '');
      const startLeft = clampNumber(noteRect.left - boardRect.left, 0, metrics.maxX);
      const startTop = clampNumber(noteRect.top - boardRect.top, 0, metrics.maxY);

      scheduleNoteDragState = {
        pointerId: event.pointerId,
        noteId,
        noteElement: noteEl,
        startX: event.clientX,
        startY: event.clientY,
        originLeft: startLeft,
        originTop: startTop
      };

      noteEl.classList.add('is-dragging');
      if (typeof noteEl.setPointerCapture === 'function') {
        noteEl.setPointerCapture(event.pointerId);
      }
    });

    calendarNotesBoard.addEventListener('pointermove', (event) => {
      if (!scheduleNoteDragState || event.pointerId !== scheduleNoteDragState.pointerId) return;
      const { noteElement, startX, startY, originLeft, originTop } = scheduleNoteDragState;
      const metrics = getScheduleBoardMetrics();
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      const nextLeft = clampNumber(originLeft + deltaX, 0, metrics.maxX);
      const nextTop = clampNumber(originTop + deltaY, 0, metrics.maxY);
      noteElement.style.left = `${nextLeft}px`;
      noteElement.style.top = `${nextTop}px`;
    });

    const stopNoteDrag = (event) => {
      if (!scheduleNoteDragState || event.pointerId !== scheduleNoteDragState.pointerId) return;
      const { noteId, noteElement } = scheduleNoteDragState;
      const metrics = getScheduleBoardMetrics();
      const nextLeft = clampNumber(Number.parseFloat(noteElement.style.left) || 0, 0, metrics.maxX);
      const nextTop = clampNumber(Number.parseFloat(noteElement.style.top) || 0, 0, metrics.maxY);
      updateScheduleNotePosition(noteId, nextLeft, nextTop, { persist: true });
      noteElement.classList.remove('is-dragging');
      if (typeof noteElement.releasePointerCapture === 'function') {
        try {
          noteElement.releasePointerCapture(event.pointerId);
        } catch (_error) {
          // Ignorar
        }
      }
      scheduleNoteDragState = null;
    };

    calendarNotesBoard.addEventListener('pointerup', stopNoteDrag);
    calendarNotesBoard.addEventListener('pointercancel', stopNoteDrag);
  }
}

function showLeadsView() {
  if (dashboardGrid) dashboardGrid.classList.add('hidden');
  if (calendarView) calendarView.classList.add('hidden');
  if (emailsView) emailsView.classList.add('hidden');
  if (usersAdminView) usersAdminView.classList.add('hidden');
  if (leadsView) {
    leadsView.classList.remove('hidden');
    leadsView.animate([
      { opacity: 0, transform: 'translateY(20px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], {
      duration: 400,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
    });
    initializeStateTypes();
    initializeLeadsColumnResize();
  }
  isLeadsView = true;
  isCalendarView = false;
  isEmailsView = false;
  setToolbarRouteButtonState('leads');
  void loadLeads();
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
  if (calendarView) calendarView.classList.add('hidden');
  if (leadsView) leadsView.classList.add('hidden');
  if (emailsView) emailsView.classList.add('hidden');
  if (usersAdminView) usersAdminView.classList.add('hidden');
  if (dashboardGrid) {
    dashboardGrid.classList.remove('hidden');
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
  isCalendarView = false;
  isEmailsView = false;
  setToolbarRouteButtonState('dashboard');
}

function applyDashboardRouteFromHash() {
  const route = (window.location.hash || '').replace('#', '').toLowerCase();
  if (route === 'leads') {
    showLeadsView();
  } else if (route === 'calendar') {
    showCalendarView();
  } else if (route === 'emails') {
    showEmailsView();
  } else if (route === 'admin-users') {
    if (hasCurrentSessionPermission('users.manage')) {
      showUsersAdminView();
    } else {
      showDashboardView();
    }
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

if (calendarBtn) {
  calendarBtn.addEventListener('click', () => {
    showCalendarView();
    if (window.location.hash !== '#calendar') {
      window.location.hash = 'calendar';
    }
  });
}

if (emailsBtn) {
  emailsBtn.addEventListener('click', () => {
    showEmailsView();
    if (window.location.hash !== '#emails') {
      window.location.hash = 'emails';
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
  const syncClearBtn = () => {
    if (searchClearBtn) {
      searchClearBtn.classList.toggle('has-text', homeSearchInput.value.length > 0);
    }
  };

  homeSearchInput.addEventListener('focus', async () => {
    if (getSession()) {
      await loadLeads();
      if (currentLeadSearchQuery) {
        renderLeadSearchSuggestions(searchLeadsByQuery(currentLeadSearchQuery));
      }
    }
  });

  homeSearchInput.addEventListener('input', (event) => {
    syncClearBtn();
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
      syncClearBtn();
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

if (searchClearBtn && homeSearchInput) {
  searchClearBtn.addEventListener('click', () => {
    setLeadSearchQuery('', { syncInput: true });
    searchClearBtn.classList.remove('has-text');
    hideLeadSearchSuggestions();
    homeSearchInput.focus();
    if (isLeadsView) renderFilteredLeads();
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
  if (event.key === 'Escape' && scheduleTaskModalOpen && !scheduleTaskSubmitInFlight) {
    closeScheduleTaskModal();
    return;
  }
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
  
  // Mostrar badge de tipo de estado segun guidelines
  const stateType = getStateType(code);
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
      const stateType = getStateType(detectedState);
      
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
    const normalizedPhone = crmHelpers.normalizePhoneForLead(phone);
    
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

function normalizeLeadCopyText(value) {
  if (value === undefined || value === null) return '';
  const text = String(value).trim();
  if (!text || text === '-') return '';
  return text;
}

function renderLeadCopyButton(value, label) {
  const normalized = normalizeLeadCopyText(value);
  if (!normalized) return '';

  const encodedValue = encodeURIComponent(normalized);
  const safeLabel = escapeHtml(label);

  return `
    <button
      class="lead-copy-btn"
      type="button"
      data-copy-value="${encodedValue}"
      data-copy-label="${safeLabel}"
      title="Copiar ${safeLabel}"
      aria-label="Copiar ${safeLabel}"
    >
      <span class="lead-copy-icon" aria-hidden="true"></span>
    </button>
  `;
}

function renderLeadReassignButton(lead) {
  const leadId = Number(lead?.id || 0);
  if (!leadId) return '';
  const currentAssignee = String(lead?.assigned_to || '').trim();

  return `
    <button
      class="lead-reassign-btn"
      type="button"
      data-lead-id="${leadId}"
      data-current-assignee="${encodeURIComponent(currentAssignee)}"
      title="Reasignar lead"
      aria-label="Reasignar lead"
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <circle cx="6.8" cy="7.3" r="2.6" stroke="currentColor" stroke-width="1.6"/>
        <path d="M2.8 14.6c0-2 1.8-3.6 4-3.6s4 1.6 4 3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M14.1 6.6h5.5m0 0-1.7-1.7m1.7 1.7-1.7 1.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M20.1 16.5h-5.6m0 0 1.7 1.7m-1.7-1.7 1.7-1.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M16.2 8.8a4.1 4.1 0 0 1 3.9 2.8m-5.7 3.8a4.1 4.1 0 0 1-1.3-2.9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    </button>
  `;
}

function closeLeadAssigneeMenu() {
  if (!leadAssigneeMenuElement) return;
  leadAssigneeMenuElement.classList.add('hidden');
  leadAssigneeMenuElement.dataset.leadId = '';
  leadAssigneeMenuElement.dataset.currentAssignee = '';
}

function ensureLeadAssigneeMenu() {
  if (leadAssigneeMenuElement && document.body.contains(leadAssigneeMenuElement)) {
    return leadAssigneeMenuElement;
  }

  const menu = document.createElement('div');
  menu.className = 'lead-assignee-menu hidden';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Reasignar lead');
  document.body.appendChild(menu);
  leadAssigneeMenuElement = menu;
  return menu;
}

function positionLeadAssigneeMenu(anchorEl, menuEl) {
  if (!anchorEl || !menuEl) return;

  const rect = anchorEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 10;
  const menuWidth = menuEl.offsetWidth || 220;
  const menuHeight = menuEl.offsetHeight || 180;

  let left = rect.left - (menuWidth - rect.width);
  if (left + menuWidth > vw - margin) left = vw - margin - menuWidth;
  if (left < margin) left = margin;

  let top = rect.bottom + 8;
  if (top + menuHeight > vh - margin) {
    top = Math.max(margin, rect.top - menuHeight - 8);
  }

  menuEl.style.left = `${Math.round(left)}px`;
  menuEl.style.top = `${Math.round(top)}px`;
}

async function loadLeadAssignableMembers({ force = false } = {}) {
  if (!force && leadAssignableMembersLoaded) return leadAssignableMembers;
  if (leadAssignableMembersPromise) return leadAssignableMembersPromise;

  leadAssignableMembersPromise = (async () => {
    const membersMap = new Map();
    const pushMember = (usernameValue, displayNameValue = '', roleValue = '') => {
      const username = normalizeScheduleOwnerUsername(usernameValue);
      if (!username) return;
      if (!membersMap.has(username)) {
        membersMap.set(username, {
          username,
          displayName: String(displayNameValue || '').trim() || username,
          role: String(roleValue || '').trim().toLowerCase()
        });
      }
    };

    try {
      const data = await requestJson('/api/users', { cache: 'no-store' });
      const members = Array.isArray(data?.members) ? data.members : [];
      if (members.length) {
        members.forEach((member) => {
          pushMember(member?.username, member?.displayName || member?.display_name || member?.username, member?.role);
        });
      } else {
        const users = Array.isArray(data?.users) ? data.users : [];
        users.forEach((userLabel) => {
          const normalized = String(userLabel || '').trim();
          if (!normalized) return;
          pushMember(normalized, normalized, '');
        });
      }
    } catch (_error) {
      // Fallback al usuario actual
    } finally {
      const identity = getSessionIdentity();
      pushMember(identity.username, identity.displayName || identity.username, identity.role);
      leadAssignableMembers = Array.from(membersMap.values()).sort((a, b) =>
        String(a.username || '').localeCompare(String(b.username || ''), 'es', { sensitivity: 'base' })
      );
      leadAssignableMembersLoaded = true;
      leadAssignableMembersPromise = null;
    }

    return leadAssignableMembers;
  })();

  return leadAssignableMembersPromise;
}

function buildLeadAssigneeMenuMarkup({ members = [], currentAssignee = '' } = {}) {
  const normalizedCurrent = normalizeScheduleOwnerUsername(currentAssignee);
  const options = members.length
    ? members
    : [{ username: normalizeScheduleOwnerUsername(getSessionIdentity().username), displayName: getSessionIdentity().displayName || getSessionIdentity().username, role: '' }];

  return `
    <p class="lead-assignee-menu-title">Reasignar lead</p>
    <div style="padding-bottom: 8px;">
      <input type="text" class="lead-assignee-search" placeholder="Buscar agente..." autocomplete="off" style="width: 100%; padding: 6px 10px; font-size: 12px; border-radius: 6px; border: 1px solid var(--border-color, rgba(255,255,255,0.2)); background: var(--bg-secondary, rgba(0,0,0,0.3)); color: var(--text-primary, #fff);">
    </div>
    <div class="lead-assignee-menu-list">
      ${options.map((member) => {
        const username = normalizeScheduleOwnerUsername(member.username);
        if (!username) return '';
        const displayLabel = buildScheduleMemberLabel(member);
        const isActive = username === normalizedCurrent;
        return `
          <button
            class="lead-assignee-option${isActive ? ' active' : ''}"
            type="button"
            data-assignee="${escapeHtml(username)}"
          >
            <span>${escapeHtml(displayLabel)}</span>
            ${isActive ? '<strong>Actual</strong>' : ''}
          </button>
        `;
      }).join('')}
    </div>
  `;
}

async function updateLeadAssignee(leadId, nextAssignee) {
  const normalizedLeadId = Number(leadId || 0);
  const normalizedAssignee = normalizeScheduleOwnerUsername(nextAssignee);
  if (!normalizedLeadId || !normalizedAssignee) return false;
  if (leadAssigneeUpdateInFlight) return false;

  leadAssigneeUpdateInFlight = true;
  try {
    const data = await requestJson(`/api/leads/${normalizedLeadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedTo: normalizedAssignee })
    });

    const updatedLead = data?.lead || {};
    allLeadsCache = allLeadsCache.map((lead) => {
      if (Number(lead?.id) !== normalizedLeadId) return lead;
      return {
        ...lead,
        assigned_to: updatedLead?.assigned_to || normalizedAssignee,
        updated_at: updatedLead?.updated_at || lead?.updated_at
      };
    });
    leadSearchIndex = buildLeadsSearchIndex(allLeadsCache);

    const matches = searchLeadsByQuery(currentLeadSearchQuery);
    renderLeadsRows(matches);
    showToast(`Lead reasignado a @${normalizedAssignee}`, 'success');
    return true;
  } catch (error) {
    showToast(error.message || 'No se pudo reasignar el lead.', 'error');
    return false;
  } finally {
    leadAssigneeUpdateInFlight = false;
  }
}

let leadsCurrentPage = 1;
const leadsPerPage = 20;

function renderLeadsRows(leads) {
  const tbody = document.getElementById('leadsTableBody');
  if (!tbody) return;

  const rows = Array.isArray(leads) ? leads : [];
  updateLeadsCounter(rows.length);

  const totalPages = Math.ceil(rows.length / leadsPerPage) || 1;
  if (leadsCurrentPage > totalPages) leadsCurrentPage = totalPages;

  const startIndex = (leadsCurrentPage - 1) * leadsPerPage;
  const paginatedRows = rows.slice(startIndex, startIndex + leadsPerPage);

  const prevBtn = document.getElementById('leadsPrevPageBtn');
  const nextBtn = document.getElementById('leadsNextPageBtn');
  const currentText = document.getElementById('leadsCurrentPageText');
  const totalText = document.getElementById('leadsTotalPagesText');

  if (prevBtn) prevBtn.disabled = leadsCurrentPage <= 1;
  if (nextBtn) nextBtn.disabled = leadsCurrentPage >= totalPages;
  if (currentText) currentText.textContent = leadsCurrentPage;
  if (totalText) totalText.textContent = totalPages;

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
        <div class="lead-copy-inline">
          <a href="/client.html?id=${lead.id}" class="name-link">
            <div class="name-avatar">
              <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(lead.full_name)}&background=random&color=fff&size=32" alt="">
              <span>${escapeHtml(lead.full_name)}</span>
            </div>
          </a>
          ${renderLeadCopyButton(lead.full_name, 'nombre')}
        </div>
      </td>
      <td class="lead-case">
        <div class="lead-copy-inline">
          <span class="lead-copy-value">${escapeHtml(String(lead.case_id || '-'))}</span>
          ${renderLeadCopyButton(lead.case_id || lead.id, 'lead')}
        </div>
      </td>
      <td>${getLeadBadgesCell(lead, leadMapById)}</td>
      <td class="lead-user">
        <div class="lead-assignee-inline">
          <span class="lead-assignee-name">${escapeHtml(lead.assigned_to || '-')}</span>
          ${renderLeadReassignButton(lead)}
        </div>
      </td>
      <td class="lead-date">${formatDate(lead.created_at)}</td>
      <td class="lead-date">${formatDate(lead.updated_at)}</td>
      <td class="lead-phone">
        <div class="lead-copy-inline">
          <span class="lead-copy-value">${escapeHtml(lead.phone || '-')}</span>
          ${renderLeadCopyButton(lead.phone, 'telefono')}
        </div>
      </td>
      <td class="lead-email">${escapeHtml(lead.email || '-')}</td>
      <td class="lead-state">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>${lead.state_code || '-'}</span>
          ${getStateTypeBadge(lead.state_code, lead.state_type)}
        </div>
      </td>
      <td class="lead-campaign">${escapeHtml(lead.source || '-')}</td>
      <td class="lead-actions">
        <div class="lead-actions-wrap">
          <button class="action-btn lead-more-btn" type="button" title="Mas opciones" aria-label="Mas opciones">
            <span class="lead-more-dots" aria-hidden="true"></span>
          </button>
          <div class="lead-actions-menu" role="menu" aria-label="Acciones del lead">
            <button
              class="lead-menu-item lead-docs-item"
              type="button"
              role="menuitem"
              data-id="${lead.id}"
            >
              <span class="lead-menu-item-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none" focusable="false">
                  <path d="M6.4 3.2h4.8l3 3V15a1.3 1.3 0 0 1-1.3 1.3H6.4A1.3 1.3 0 0 1 5.1 15V4.5a1.3 1.3 0 0 1 1.3-1.3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                  <path d="M11.2 3.2V6.1h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M7.5 10.2h4.9M7.5 12.6h3.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg>
              </span>
              <span class="lead-menu-item-copy">
                <span class="lead-menu-item-title">Ver docs</span>
                <span class="lead-menu-item-subtitle">Abrir archivos del lead</span>
              </span>
            </button>
            <button
              class="lead-menu-item lead-delete-item"
              type="button"
              role="menuitem"
              data-id="${lead.id}"
              data-name="${escapeHtml(lead.full_name)}"
            >
              <span class="lead-menu-item-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none" focusable="false">
                  <path d="M5.7 6.1h8.6M8 6.1V4.8h4v1.3m-5.2 0v8.4a1 1 0 0 0 1 1h4.4a1 1 0 0 0 1-1V6.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M8.8 8.5v4.7M11.2 8.5v4.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg>
              </span>
              <span class="lead-menu-item-copy">
                <span class="lead-menu-item-title">Eliminar lead</span>
                <span class="lead-menu-item-subtitle">Borrar permanentemente</span>
              </span>
            </button>
          </div>
        </div>
      </td>
    </tr>
  `).join('');

  initializeLeadsColumnResize();
  applyLeadsColumnWidths();

  const closeLeadActionsMenus = () => {
    tbody.querySelectorAll('.lead-actions-wrap.open').forEach((menuWrap) => {
      menuWrap.classList.remove('open');
    });
  };

  tbody.querySelectorAll('.lead-more-btn').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const menuWrap = btn.closest('.lead-actions-wrap');
      if (!menuWrap) return;

      const willOpen = !menuWrap.classList.contains('open');
      closeLeadActionsMenus();
      if (willOpen) {
        menuWrap.classList.add('open');
      }
    });
  });

  tbody.querySelectorAll('.lead-reassign-btn').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const leadId = Number(btn.dataset.leadId || 0);
      if (!leadId) return;

      const menu = ensureLeadAssigneeMenu();
      const currentAssignee = decodeURIComponent(btn.dataset.currentAssignee || '');

      closeLeadActionsMenus();
      menu.classList.remove('hidden');
      menu.dataset.leadId = String(leadId);
      menu.dataset.currentAssignee = currentAssignee;
      menu.innerHTML = '<p class="lead-assignee-menu-title">Reasignar lead</p><div class="lead-assignee-menu-loading">Cargando usuarios...</div>';
      positionLeadAssigneeMenu(btn, menu);

      try {
        const members = await loadLeadAssignableMembers();
        menu.innerHTML = buildLeadAssigneeMenuMarkup({ members, currentAssignee });
        positionLeadAssigneeMenu(btn, menu);
        
        const searchInput = menu.querySelector('.lead-assignee-search');
        if (searchInput) {
          searchInput.focus();
          searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const items = menu.querySelectorAll('.lead-assignee-option');
            items.forEach(item => {
              const text = item.textContent.toLowerCase();
              if (text.includes(query)) {
                item.style.display = '';
              } else {
                item.style.display = 'none';
              }
            });
          });
        }
      } catch (_error) {
        menu.innerHTML = '<p class="lead-assignee-menu-title">Reasignar lead</p><div class="lead-assignee-menu-error">No se pudo cargar la lista de usuarios.</div>';
        positionLeadAssigneeMenu(btn, menu);
      }
    });
  });

  if (!leadActionsMenuDocumentBound) {
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.lead-actions-wrap')) {
        document.querySelectorAll('.lead-actions-wrap.open').forEach((menuWrap) => {
          menuWrap.classList.remove('open');
        });
      }
    });
    leadActionsMenuDocumentBound = true;
  }

  if (!leadAssigneeMenuDocumentBound) {
    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!target.closest('.lead-assignee-menu') && !target.closest('.lead-reassign-btn')) {
        closeLeadAssigneeMenu();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeLeadAssigneeMenu();
      }
    });

    leadAssigneeMenuDocumentBound = true;
  }

  const assigneeMenu = ensureLeadAssigneeMenu();
  assigneeMenu.onclick = async (event) => {
    const optionBtn = event.target.closest('.lead-assignee-option[data-assignee]');
    if (!optionBtn) return;
    event.preventDefault();
    event.stopPropagation();

    const leadId = Number(assigneeMenu.dataset.leadId || 0);
    const nextAssignee = normalizeScheduleOwnerUsername(optionBtn.dataset.assignee || '');
    const currentAssignee = normalizeScheduleOwnerUsername(assigneeMenu.dataset.currentAssignee || '');

    if (!leadId || !nextAssignee || nextAssignee === currentAssignee) {
      closeLeadAssigneeMenu();
      return;
    }

    optionBtn.disabled = true;
    optionBtn.classList.add('loading');
    const updated = await updateLeadAssignee(leadId, nextAssignee);
    if (updated) {
      closeLeadAssigneeMenu();
    } else {
      optionBtn.disabled = false;
      optionBtn.classList.remove('loading');
    }
  };

  tbody.querySelectorAll('.lead-docs-item').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeLeadActionsMenus();
      const leadId = Number(btn.dataset.id || 0);
      if (!leadId) return;
      window.location.assign(`/client.html?id=${leadId}&tab=lead&open=docs`);
    });
  });

  tbody.querySelectorAll('.lead-delete-item').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeLeadActionsMenus();

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

  tbody.querySelectorAll('.lead-copy-btn').forEach((btn) => {
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const encodedValue = btn.dataset.copyValue || '';
      const label = btn.dataset.copyLabel || 'dato';
      let textToCopy = '';

      try {
        textToCopy = normalizeLeadCopyText(decodeURIComponent(encodedValue));
      } catch (_error) {
        textToCopy = '';
      }
      if (!textToCopy) {
        showToast(`No hay ${label} para copiar`, 'info');
        return;
      }

      try {
        await navigator.clipboard.writeText(textToCopy);
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 900);
        showToast(`${label} copiado: ${textToCopy}`, 'success');
      } catch (error) {
        console.error('Error al copiar desde leads:', error);
        showToast('Error al copiar', 'error');
      }
    });
  });
}

function renderFilteredLeads() {
  const matches = searchLeadsByQuery(currentLeadSearchQuery);
  renderLeadsRows(matches);
}

document.addEventListener('DOMContentLoaded', () => {
  const prevBtn = document.getElementById('leadsPrevPageBtn');
  const nextBtn = document.getElementById('leadsNextPageBtn');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (leadsCurrentPage > 1) {
        leadsCurrentPage--;
        renderFilteredLeads();
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const matches = searchLeadsByQuery(currentLeadSearchQuery);
      const totalPages = Math.ceil(matches.length / leadsPerPage) || 1;
      if (leadsCurrentPage < totalPages) {
        leadsCurrentPage++;
        renderFilteredLeads();
      }
    });
  }
});

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
  const normalizedType = String(stateType || '').trim();
  const typeClass = normalizedType === 'Green'
    ? 'green'
    : (normalizedType === 'Not Eligible' ? 'not-eligible' : 'red');
  const stateName = getStateName(stateCode);
  return `<span class="type-badge ${typeClass}" title="${stateName} (${stateCode}) - ${normalizedType || 'Red'} State">${normalizedType || 'Red'}</span>`;
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
if (loginForm) {
  initLoginPinAuth();

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(loginForm);
    const payload = {
      identifier: String(formData.get('identifier') || '').trim(),
      pin: sanitizeLoginPin(formData.get('pin'))
    };

    if (!payload.identifier) {
      loginStatus.textContent = 'Ingresa usuario o correo.';
      return;
    }
    if (payload.pin.length !== LOGIN_PIN_LENGTH) {
      loginStatus.textContent = 'El PIN debe tener 6 digitos.';
      focusLoginPinInput();
      return;
    }

    loginStatus.textContent = 'Validando acceso...';

    try {
      const data = await requestJson('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!data?.token) {
        throw new Error('No se recibio token de sesion. Contacta al administrador.');
      }
      saveAuthToken(data.token);
      saveSession(data.user);
      applyTheme(getInitialTheme(data.user), { owner: data.user });
      applyAccentColor(getInitialAccentColor(data.user), { owner: data.user });
      void refreshNotifications();
      pingPresence();
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

const transferredLeadSearchQuery = consumeTransferredLeadSearchQuery();
const existingSession = getSession();
const existingAuthToken = getAuthToken();
const hasStoredAuth = Boolean(existingSession && existingAuthToken);
applyTheme(getInitialTheme(existingSession), { owner: existingSession });
applyAccentColor(getInitialAccentColor(existingSession), { owner: existingSession });
setToolbarExpanded(false);
if (!hasStoredAuth && (existingSession || existingAuthToken)) {
  clearSession();
}
if (hasStoredAuth) {
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

// Carga inicial de notificaciones + polling cada 60 s
if (hasStoredAuth) void refreshNotifications();
setInterval(() => { if (getSession() && getAuthToken()) void refreshNotifications(); }, 60000);

function isUsersAdminViewVisible() {
  return Boolean(usersAdminView && !usersAdminView.classList.contains('hidden'));
}

function syncCurrentUserPresenceInCache(lastSeenIso) {
  if (!Array.isArray(adminUsersCache) || !adminUsersCache.length) return;
  const normalizedLastSeen = String(lastSeenIso || '').trim();
  if (!normalizedLastSeen) return;

  const selfUsername = String(getSessionIdentity().username || '').trim().toLowerCase();
  if (!selfUsername) return;

  let didUpdate = false;
  adminUsersCache = adminUsersCache.map((user) => {
    const username = String(user?.username || '').trim().toLowerCase();
    if (username !== selfUsername) return user;
    didUpdate = true;
    return { ...user, last_seen_at: normalizedLastSeen };
  });

  if (didUpdate && isUsersAdminViewVisible()) {
    renderAdminUsersList(adminUsersCache);
  }
}

// Heartbeat de presencia — actualiza last_seen_at cada 30 s
async function pingPresence() {
  if (!getSession() || !getAuthToken()) return;
  try {
    await requestJson('/api/ping', { method: 'POST' });
    syncCurrentUserPresenceInCache(new Date().toISOString());
  } catch (_error) {
    // Ignorar fallos silenciosos de heartbeat
  }
}
if (hasStoredAuth) void pingPresence();
setInterval(() => { void pingPresence(); }, 30000);
setInterval(() => {
  if (!getSession() || !getAuthToken() || !hasCurrentSessionPermission('users.manage') || !isUsersAdminViewVisible()) return;
  void loadAdminUsers({ silent: true });
}, 30000);

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
    
    let _wheelDragTicking = false;
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      if (!_wheelDragTicking) {
        window.requestAnimationFrame(() => {
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
          _wheelDragTicking = false;
        });
        _wheelDragTicking = true;
      }
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




