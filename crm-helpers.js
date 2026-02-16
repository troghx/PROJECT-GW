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
    WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia'
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
    return div.innerHTML;
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
    const typeClass = stateType === 'Green' ? 'green' : 'red';
    const stateName = getStateName(normalizedCode);
    return `<span class="type-badge ${typeClass}" title="${stateName} (${normalizedCode}) - ${stateType} State">${stateType}</span>`;
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

  globalScope.CrmHelpers = {
    STATE_NAMES,
    normalizeStateCode,
    getStateName,
    escapeHtml,
    formatDateEs,
    formatDateTimeEs,
    normalizeSearchText,
    onlyDigits,
    normalizePhoneDigits,
    buildLeadSearchIndex,
    searchLeads,
    getStateTypeBadgeHtml,
    getStatusBadgeHtml
  };
})(window);
