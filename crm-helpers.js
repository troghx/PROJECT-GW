(function attachCrmHelpers(globalScope) {
  const STATE_NAMES = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
    CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
    FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
    IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
    KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
    MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
    NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
    OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
    VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
    WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia', PR: 'Puerto Rico'
  };

  function normalizeStateCode(value) {
    if (!value) return '';
    const raw = String(value).trim().toUpperCase();
    if (!raw) return '';
    const directMatch = raw.match(/^[A-Z]{2}$/);
    if (directMatch) return directMatch[0];
    const suffixMatch = raw.match(/\(([A-Z]{2})\)\s*$/);
    return suffixMatch ? suffixMatch[1] : raw;
  }

  function getStateName(stateCode) {
    const normalizedCode = normalizeStateCode(stateCode);
    return STATE_NAMES[normalizedCode] || stateCode || '';
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML.replace(/"/g, '&quot;');
  }

  function formatDateEs(dateString) {
    if (!dateString) return '-';
    const parsedDate = new Date(dateString);
    if (Number.isNaN(parsedDate.getTime())) return '-';
    return parsedDate.toLocaleDateString('es-ES');
  }

  function formatDateTimeEs(dateString) {
    if (!dateString) return '-';
    const parsedDate = new Date(dateString);
    if (Number.isNaN(parsedDate.getTime())) return '-';
    return parsedDate.toLocaleString('es-ES');
  }

  function normalizeSearchText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function normalizePhoneDigits(value) {
    const digits = onlyDigits(value);
    if (digits.length === 11 && digits.startsWith('1')) {
      return digits.slice(1);
    }
    return digits;
  }

  function normalizePhoneForLead(value) {
    const normalized = normalizePhoneDigits(value);
    if (normalized.length !== 10) return null;
    return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`;
  }

  function uniqueNonEmpty(values) {
    const seen = new Set();
    const result = [];
    values.forEach((value) => {
      const next = String(value || '').trim();
      if (!next || seen.has(next)) return;
      seen.add(next);
      result.push(next);
    });
    return result;
  }

  function buildLeadSearchIndex(leads) {
    const source = Array.isArray(leads) ? leads : [];

    return source.map((lead, position) => {
      const idDigits = onlyDigits(lead?.id);
      const caseIdDigits = onlyDigits(lead?.case_id);
      const primaryName = normalizeSearchText(lead?.full_name);
      const coApplicantName = normalizeSearchText(lead?.co_applicant_name);

      const phoneDigits = uniqueNonEmpty([
        normalizePhoneDigits(lead?.phone),
        normalizePhoneDigits(lead?.home_phone),
        normalizePhoneDigits(lead?.cell_phone),
        normalizePhoneDigits(lead?.co_applicant_home_phone),
        normalizePhoneDigits(lead?.co_applicant_cell_phone)
      ]).filter((digits) => digits.length >= 7);

      const documentDigits = uniqueNonEmpty([
        onlyDigits(lead?.ssn),
        onlyDigits(lead?.co_applicant_ssn)
      ]).filter((digits) => digits.length >= 8);

      const textBlob = uniqueNonEmpty([
        primaryName,
        coApplicantName,
        normalizeSearchText(lead?.email),
        normalizeSearchText(lead?.co_applicant_email),
        normalizeSearchText(lead?.assigned_to),
        normalizeSearchText(lead?.source),
        normalizeSearchText(lead?.state_code),
        normalizeSearchText(lead?.status)
      ]).join(' ');

      const numericBlob = uniqueNonEmpty([
        idDigits,
        caseIdDigits,
        ...phoneDigits,
        ...documentDigits
      ]).join(' ');

      return {
        lead,
        position,
        idDigits,
        caseIdDigits,
        primaryName,
        coApplicantName,
        phoneDigits,
        documentDigits,
        textBlob,
        numericBlob
      };
    });
  }

  function scoreLeadSearchEntry(entry, normalizedQuery, queryDigits) {
    let score = 0;

    if (queryDigits) {
      if (entry.idDigits === queryDigits) score += 5000;
      if (entry.caseIdDigits === queryDigits) score += 4800;
      if (entry.phoneDigits.includes(queryDigits)) score += 4600;
      if (entry.documentDigits.includes(queryDigits)) score += 4400;

      if (entry.phoneDigits.some((digits) => digits.startsWith(queryDigits))) score += 2400;
      if (entry.documentDigits.some((digits) => digits.startsWith(queryDigits))) score += 2200;
      if (entry.numericBlob.includes(queryDigits)) score += 1600;
    }

    if (normalizedQuery) {
      if (entry.primaryName === normalizedQuery) score += 4200;
      else if (entry.primaryName.startsWith(normalizedQuery)) score += 3600;
      else if (entry.primaryName.includes(normalizedQuery)) score += 3000;

      if (entry.coApplicantName === normalizedQuery) score += 3400;
      else if (entry.coApplicantName.startsWith(normalizedQuery)) score += 2800;
      else if (entry.coApplicantName.includes(normalizedQuery)) score += 2200;

      if (entry.textBlob.includes(normalizedQuery)) score += 900;
    }

    return score;
  }

  function searchLeads(indexEntries, query, options = {}) {
    const entries = Array.isArray(indexEntries) ? indexEntries : [];
    if (!entries.length) return [];

    const rawQuery = String(query || '').trim();
    const normalizedQuery = normalizeSearchText(rawQuery);
    const queryDigits = onlyDigits(rawQuery);

    if (!normalizedQuery && !queryDigits) {
      return entries.map((entry) => entry.lead);
    }

    const tokens = normalizedQuery ? normalizedQuery.split(' ').filter(Boolean) : [];
    const ranked = [];

    entries.forEach((entry) => {
      if (tokens.length) {
        const hasEveryToken = tokens.every((token) =>
          entry.textBlob.includes(token) || entry.numericBlob.includes(token)
        );
        if (!hasEveryToken) return;
      }

      if (queryDigits && !entry.numericBlob.includes(queryDigits) && !entry.textBlob.includes(queryDigits)) {
        return;
      }

      const score = scoreLeadSearchEntry(entry, normalizedQuery, queryDigits);
      if (score <= 0) return;
      ranked.push({ entry, score });
    });

    ranked.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.entry.position - b.entry.position;
    });

    const limitRaw = Number(options.limit);
    const hasLimit = Number.isFinite(limitRaw) && limitRaw > 0;
    const sliced = hasLimit ? ranked.slice(0, limitRaw) : ranked;
    return sliced.map((result) => result.entry.lead);
  }

  function getStateTypeBadgeHtml(stateCode, stateType) {
    if (!stateCode) return '-';
    const normalizedCode = normalizeStateCode(stateCode);
    const normalizedType = String(stateType || '').trim();
    const typeClass = normalizedType === 'Green'
      ? 'green'
      : (normalizedType === 'Not Eligible' ? 'not-eligible' : 'red');
    const stateName = getStateName(normalizedCode);
    return `<span class="type-badge ${typeClass}" title="${stateName} (${normalizedCode}) - ${normalizedType || 'Red'} State">${normalizedType || 'Red'}</span>`;
  }

  function getStatusBadgeHtml(status, isTest) {
    if (isTest) return '<span class="status-badge test">Test</span>';
    const statusClass = {
      'New Lead': 'new',
      'Submitted to UW': 'submitted',
      'Docs Back': 'docs',
      'Sent to Debt Manager': 'manager',
      'Callback Requested': 'callback'
    }[status] || 'new';
    return `<span class="status-badge ${statusClass}">${escapeHtml(status || '')}</span>`;
  }

  const BASE_CREDITOR_STATUS_CATALOG = [
    { nombre: 'JPMorgan Chase', estatus: 'aceptable', notas: 'Settlements often 40-50%' },
    { nombre: 'Bank of America', estatus: 'aceptable', notas: 'Requires strict validation' },
    { nombre: 'Wells Fargo', estatus: 'aceptable', notas: '' },
    { nombre: 'Citibank', estatus: 'aceptable', notas: 'Aggressive legal team' },
    { nombre: 'US Bank', estatus: 'aceptable', notas: '' },
    { nombre: 'PNC Bank', estatus: 'aceptable', notas: '' },
    { nombre: 'Truist', estatus: 'aceptable', notas: '' },
    { nombre: 'Capital One', estatus: 'aceptable', notas: 'Litigious but settles' },
    { nombre: 'American Express', estatus: 'aceptable', notas: 'Hard to negotiate' },
    { nombre: 'Discover', estatus: 'aceptable', notas: 'Sues frequently' },
    { nombre: 'Synchrony Bank', estatus: 'aceptable', notas: 'Handles Amazon/PayPal credit cards' },
    { nombre: 'Barclays', estatus: 'aceptable', notas: '' },
    { nombre: 'Credit One Bank', estatus: 'aceptable', notas: 'Subprime lender' },
    { nombre: 'Goldman Sachs', estatus: 'aceptable', notas: 'Apple Card issuer' },
    { nombre: 'Ally Bank', estatus: 'aceptable', notas: '' },
    { nombre: 'Navy Federal Credit Union', estatus: 'aceptable', notas: 'Does not sell debt usually' },
    { nombre: 'USAA', estatus: 'aceptable', notas: '' },
    { nombre: 'Citizens Bank', estatus: 'aceptable', notas: '' },
    { nombre: 'Santander Consumer USA', estatus: 'aceptable', notas: 'Auto loans mostly' },
    { nombre: 'Comenity Bank', estatus: 'aceptable', notas: 'Store cards issuer' },
    { nombre: 'Merrick Bank', estatus: 'no_aceptable', notas: 'High interest / Fees' },
    { nombre: 'First Premier Bank', estatus: 'no_aceptable', notas: 'Predatory fees' },
    { nombre: 'Credit Acceptance', estatus: 'no_aceptable', notas: 'Aggressive auto collections' },
    { nombre: 'Portfolio Recovery Associates', estatus: 'no_aceptable', notas: 'Debt Buyer' },
    { nombre: 'Midland Credit Management', estatus: 'no_aceptable', notas: 'Debt Buyer (Encore)' },
    { nombre: 'LVNV Funding', estatus: 'no_aceptable', notas: 'Debt Buyer' },
    { nombre: 'OneMain Financial', estatus: 'no_aceptable', notas: 'Secured loans risk' },
    { nombre: 'Ace Cash Express', estatus: 'no_aceptable', notas: 'Payday Lender' },
    { nombre: 'Quick Cash Loans LLC', estatus: 'no_aceptable', notas: 'Example Payday' },
    { nombre: '1st Franklin Financial', estatus: 'no_aceptable', notas: 'High-cost installment lender' }
  ];

  const GUIDELINE_ACCEPTABLE_CREDITORS_2026 = [
    '1st Virginia',
    'Ascend Loans',
    'Advance Financial 24/7',
    'Big Picture Loans',
    'Bright Lending',
    'CA Budget Finance',
    'California Check Cashing',
    'Cash & Go',
    'Cash 1',
    'Cash America',
    'Cash Call',
    'Cash Central',
    'Cash City',
    'Cash Store',
    'Check N Go',
    'Check Cashing USA',
    'CashNetUSA',
    'Check$mart',
    'ClearAir Lending',
    'Credit Fresh',
    'Credit Ninja',
    'Dollar Loan',
    'Easy Money',
    'FineDay Funds',
    'Great Plains Lending',
    'Green Funds Express',
    'iLoan',
    'King of Cash',
    'KwikCash',
    'Lendumo',
    'Little Lake Lending',
    'LoanMe',
    'Makwa',
    'Max Lend',
    'Marcus by Goldman Sachs',
    'Minto Money',
    'Mobiloans',
    'Plain Green Loans',
    'QC Financial Services',
    'Quick Cash',
    'Quick Loans',
    'RISE',
    'River Valley Loans',
    'Speedy Cash (Collections)',
    'Spot Loan',
    'WithU',
    'Hyperseed',
    'Northern Star',
    'River Fund Group',
    'Three Sticks Lending',
    'Uprova'
  ];

  const GUIDELINE_UNACCEPTABLE_CREDITORS_2026 = [
    'AAFES',
    'Group Bay Financial',
    'Prime Credit Line',
    'Home Improvement Loans',
    'Foundation Finance',
    'Advance America',
    'RC Wiley',
    'Aldous',
    'Kabbage',
    'RSVP Loans',
    'American Web Loan',
    'Aqua Finance',
    'Kubota',
    'Schewel Furniture',
    'Lenders Loans',
    'Security Finance',
    'Armed Forces Bank',
    'Lion Loans',
    'Service Finance Company',
    'Ashro',
    'Loan At Last',
    'Shoreside Loans',
    'Atlas Credit Company',
    'ATLASCREDCO',
    'Mariner Finance',
    'Southwest Financial',
    'Avail Blue',
    'Maverick Finance',
    'State Employees Credit Union',
    'Bell Finance',
    'Diamond Finance',
    'MBA Law Office',
    'SECU',
    'NC Employee CU',
    'Texas Dow CU',
    'Blue Trust Loans',
    'Microf LLC',
    'BMG Money',
    'Midnight Velvet',
    'Sun Loans',
    'Brookwood Loans',
    'Military Star',
    'Sunup Financial',
    'Buffalo Lake Lending',
    'Missouri Payday Loans',
    'Texan Credit',
    'Cash LLC',
    'Money Mart',
    'Time Investment Company',
    'Time Finance',
    'Check City',
    'Monroe & Main',
    'Titan Funding',
    'Community Credit Line',
    'My PaydayLoan',
    'Today Cash',
    'Duke Energy',
    'Nebraska Furniture',
    'Tower Finance',
    'DC SYS DIST',
    'Direct credit system',
    'NCP Finance',
    'Tower Loans',
    'Eagle Lending Loan',
    'New Credit America',
    'Toledo Finance',
    'Eagle Valley',
    'Two Jinn Bail Bonds',
    'EnerBank',
    'Noble Finance',
    'Evergreen Services',
    'OHI Payroll Payment',
    'Versara Lending',
    'Farmers Furniture',
    'Omni Financial',
    'VSA PUR MURPHY',
    'Fast Pay',
    'ON-US Check',
    'West River',
    'First Consumers Financial',
    'Pacific Finance',
    'Worth Finance',
    'First Franklin',
    'Paragon',
    'Yendo INC',
    'Goldman Sachs Loans',
    'Pay Day One',
    'Zia Credit Union',
    'Synovous Bank',
    'Green Sky',
    'Pennsylvania Teachers CU',
    'Golden Gate Funding',
    'Pentagon CU',
    'Goodleap'
  ];

  function normalizeCatalogKey(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function buildCreditorStatusCatalog() {
    const map = new Map();

    function upsert(entry) {
      const nombre = String(entry?.nombre || '').trim();
      if (!nombre) return;
      const key = normalizeCatalogKey(nombre);
      if (!key) return;

      const next = {
        nombre,
        estatus: entry?.estatus === 'no_aceptable' ? 'no_aceptable' : 'aceptable',
        notas: String(entry?.notas || '').trim()
      };

      const previous = map.get(key);
      if (!previous) {
        map.set(key, next);
        return;
      }

      if (next.estatus === 'no_aceptable' && previous.estatus !== 'no_aceptable') {
        previous.estatus = 'no_aceptable';
      }
      if (!previous.notas && next.notas) {
        previous.notas = next.notas;
      }
      if (next.nombre.length > previous.nombre.length) {
        previous.nombre = next.nombre;
      }
    }

    BASE_CREDITOR_STATUS_CATALOG.forEach(upsert);
    GUIDELINE_ACCEPTABLE_CREDITORS_2026.forEach((nombre) => upsert({ nombre, estatus: 'aceptable' }));
    GUIDELINE_UNACCEPTABLE_CREDITORS_2026.forEach((nombre) => upsert({ nombre, estatus: 'no_aceptable' }));

    return Array.from(map.values())
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'en', { sensitivity: 'base' }))
      .map((entry, index) => ({
        id: index + 1,
        nombre: entry.nombre,
        estatus: entry.estatus,
        notas: entry.notas
      }));
  }

  function normalizeCreditorComparable(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function sanitizeCreditorCatalog(entries) {
    const map = new Map();
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const nombre = String(entry?.nombre || '').trim();
      if (!nombre) return;
      const key = normalizeCatalogKey(nombre);
      if (!key) return;

      const estatus = entry?.estatus === 'no_aceptable' ? 'no_aceptable' : 'aceptable';
      const notas = String(entry?.notas || '').trim();
      const previous = map.get(key);

      if (!previous) {
        map.set(key, { nombre, estatus, notas });
        return;
      }

      if (estatus === 'no_aceptable' && previous.estatus !== 'no_aceptable') {
        previous.estatus = 'no_aceptable';
      }
      if (!previous.notas && notas) {
        previous.notas = notas;
      }
      if (nombre.length > previous.nombre.length) {
        previous.nombre = nombre;
      }
    });

    return Array.from(map.values())
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'en', { sensitivity: 'base' }))
      .map((entry, index) => ({
        id: index + 1,
        nombre: entry.nombre,
        estatus: entry.estatus,
        notas: entry.notas
      }));
  }

  let CREDITOR_STATUS_CATALOG = sanitizeCreditorCatalog(buildCreditorStatusCatalog());
  let UNACCEPTABLE_CREDITOR_ALIASES = [];
  let NORMALIZED_UNACCEPTABLE_ALIASES = [];

  const EXTRA_UNACCEPTABLE_CREDITOR_ALIASES = [
    'first premier',
    'portfolio recovery',
    'midland credit mgmt',
    'lvnv',
    'onemain',
    'quick cash loans',
    'worth finance',
    'first franklin',
    '1st franklin financi',
    '1st franklin'
  ];

  function rebuildCreditorAliasCaches() {
    UNACCEPTABLE_CREDITOR_ALIASES = CREDITOR_STATUS_CATALOG
      .filter((entry) => entry.estatus === 'no_aceptable')
      .map((entry) => entry.nombre)
      .concat(EXTRA_UNACCEPTABLE_CREDITOR_ALIASES);

    NORMALIZED_UNACCEPTABLE_ALIASES = UNACCEPTABLE_CREDITOR_ALIASES
      .map((alias) => normalizeCreditorComparable(alias))
      .filter((alias) => alias.split(' ').length >= 2 || alias.length >= 7 || alias === 'lvnv')
      .filter(Boolean);
  }

  function getCreditorStatusCatalog() {
    return CREDITOR_STATUS_CATALOG.map((entry) => ({ ...entry }));
  }

  function setCreditorStatusCatalog(entries) {
    const sanitized = sanitizeCreditorCatalog(entries);
    if (!sanitized.length) return getCreditorStatusCatalog();

    CREDITOR_STATUS_CATALOG = sanitized;
    rebuildCreditorAliasCaches();

    if (globalScope.CrmHelpers) {
      globalScope.CrmHelpers.CREDITOR_STATUS_CATALOG = getCreditorStatusCatalog();
      globalScope.CrmHelpers.UNACCEPTABLE_CREDITOR_ALIASES = [...UNACCEPTABLE_CREDITOR_ALIASES];
    }

    return getCreditorStatusCatalog();
  }

  function readStoredCreditorCatalog() {
    try {
      const raw = globalScope?.localStorage?.getItem('project_gw_creditor_catalog_v1');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  const storedCatalog = readStoredCreditorCatalog();
  if (Array.isArray(storedCatalog) && storedCatalog.length) {
    CREDITOR_STATUS_CATALOG = sanitizeCreditorCatalog(storedCatalog);
  }
  rebuildCreditorAliasCaches();

  function isUnacceptableCreditorName(value) {
    const normalizedName = normalizeCreditorComparable(value);
    if (!normalizedName) return false;
    return NORMALIZED_UNACCEPTABLE_ALIASES.some((alias) => normalizedName.includes(alias));
  }

  globalScope.CrmHelpers = {
    STATE_NAMES,
    CREDITOR_STATUS_CATALOG: getCreditorStatusCatalog(),
    UNACCEPTABLE_CREDITOR_ALIASES: [...UNACCEPTABLE_CREDITOR_ALIASES],
    normalizeStateCode,
    getStateName,
    escapeHtml,
    formatDateEs,
    formatDateTimeEs,
    normalizeSearchText,
    onlyDigits,
    normalizePhoneDigits,
    normalizePhoneForLead,
    normalizeCreditorComparable,
    isUnacceptableCreditorName,
    getCreditorStatusCatalog,
    setCreditorStatusCatalog,
    buildLeadSearchIndex,
    searchLeads,
    getStateTypeBadgeHtml,
    getStatusBadgeHtml
  };
})(window);
