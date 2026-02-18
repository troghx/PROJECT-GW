/**
 * CREDITORS - Integracion con panel de archivos
 * Flujo:
 * 1) El usuario sube archivo en Files panel
 * 2) Clasifica como Reporte de credito + Applicant/Co-Applicant
 * 3) Se extraen deudas y se importan automaticamente
 */

(function() {
  'use strict';

  let creditorsSectionInitialized = false;
  let currentCreditors = [];
  let currentFicoScores = { applicant: null, coapp: null };
  let creditorsParseRunId = 0;
  let aiAnalyzerUnavailable = false;
  let ficoPersistQueue = Promise.resolve();
  let columnOrder = JSON.parse(localStorage.getItem('creditorsColumnOrder') || 'null') || [
    'checkbox', 'num', 'name', 'debt', 'party', 'account', 'resp', 'status', 'type', 'months', 'pastDue', 'actions'
  ];

  const KNOWN_CREDITORS = [
    'CAPITAL ONE', 'CHASE', 'BANK OF AMERICA', 'WELLS FARGO', 'CITIBANK', 'CITI',
    'DISCOVER', 'AMERICAN EXPRESS', 'AMEX', 'SYNCHRONY', 'BARCLAYS', 'BARCLAYCARD',
    'JPMCB', 'JPMORGAN', 'USBANK', 'US BANK', 'PNC', 'TD BANK', 'BB&T', 'TRUIST',
    'REGIONS', 'FIFTH THIRD', 'HUNTINGTON', 'ALLY', 'CAPITALONE',
    'COMENITY', 'MEDICAL', 'HOSPITAL', 'CLINIC', 'COLLECTION', 'RECOVERY',
    'EQUIFAX', 'TRANSUNION', 'EXPERIAN',
    'SYNCB', 'AFFIRM', 'VERIZON', 'LVNV', 'MIDLAND', 'PORTFOLIO'
  ];

  const INVALID_PHRASES = [
    'hide details', 'show details', 'you\'re currently using', 'you have',
    'overview', 'account details', 'payment history', 'balance:',
    'credit limit:', 'terms and conditions', 'click here',
    'learn more', 'view more', 'see more', 'last activity',
    'date opened', 'date closed', 'high balance', 'highest balance',
    'monthly payment', 'amount past due', 'current payment status',
    'as agreed', 'paid on time', 'days past due',
    'total accounts', 'open accounts', 'closed accounts',
    'delinquent', 'derogatory', 'collections', 'inquiries',
    'public records', 'personal info', 'employment info',
    'report date', 'vantage score', 'credit report',
    'download pdf', 'all bureaus', 'bureau',
    'credit cards', 'total count', 'credit limit'
  ];

  const OCR_MIN_PAGE_TEXT_LENGTH = 40;
  const ENABLE_AI_ANALYZER = false;

  function normalizeMoney(value) {
    if (!value && value !== 0) return 0;
    const num = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(num) ? Number(num.toFixed(2)) : 0;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(normalizeMoney(value));
  }

  function formatMoneyInput(value) {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(normalizeMoney(value));
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? `${str.slice(0, len)}...` : str;
  }

  function normalizeDebtorParty(value) {
    const parsed = parseDebtorParty(value);
    return parsed || 'applicant';
  }

  function parseDebtorParty(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'coapp' || normalized === 'co-app' || normalized === 'co_applicant' || normalized === 'coapplicant') {
      return 'coapp';
    }
    if (normalized === 'applicant' || normalized === 'app' || normalized === 'primary') {
      return 'applicant';
    }
    return null;
  }

  function normalizeCreditScore(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return null;
    if (parsed < 300 || parsed > 850) return null;
    return parsed;
  }

  function createEmptyFicoScores() {
    return { applicant: null, coapp: null };
  }

  function normalizeFicoScores(scores) {
    const source = scores && typeof scores === 'object' ? scores : {};
    return {
      applicant: normalizeCreditScore(source.applicant),
      coapp: normalizeCreditScore(source.coapp)
    };
  }

  function getHighestFicoScore(scores) {
    const normalized = normalizeFicoScores(scores);
    const values = [normalized.applicant, normalized.coapp].filter((value) => value !== null);
    if (!values.length) return null;
    return Math.max(...values);
  }

  function getLeadSnapshotForFico(leadId) {
    const snapshot = window.currentLeadData && typeof window.currentLeadData === 'object'
      ? window.currentLeadData
      : null;
    if (!snapshot) return null;

    const requestedId = Number(leadId || 0);
    const snapshotId = Number(snapshot.id || 0);
    if (requestedId && snapshotId && requestedId !== snapshotId) return null;
    return snapshot;
  }

  function readStoredFicoScores(leadId) {
    const snapshot = getLeadSnapshotForFico(leadId);
    if (!snapshot) return createEmptyFicoScores();
    return normalizeFicoScores({
      applicant: snapshot.fico_score_applicant,
      coapp: snapshot.fico_score_coapp
    });
  }

  async function persistFicoScoresToDb(leadId, scores) {
    const normalizedLeadId = Number(leadId || 0);
    if (!normalizedLeadId) return;

    const normalized = normalizeFicoScores(scores);
    const response = await fetch(`/api/leads/${normalizedLeadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ficoScoreApplicant: normalized.applicant,
        ficoScoreCoapp: normalized.coapp
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || 'No se pudo persistir FICO en base de datos.');
    }

    if (data.lead && typeof data.lead === 'object') {
      window.currentLeadData = data.lead;
    }
  }

  function queuePersistFicoScores(leadId, scores) {
    const normalizedLeadId = Number(leadId || 0);
    if (!normalizedLeadId) return;
    const snapshot = normalizeFicoScores(scores);

    ficoPersistQueue = ficoPersistQueue
      .catch(() => {})
      .then(() => persistFicoScoresToDb(normalizedLeadId, snapshot))
      .catch((error) => {
        console.error('Error persistiendo FICO:', error);
        setStatus(error.message || 'No se pudo guardar FICO en base de datos.', 'error');
      });
  }

  function updateFicoScoreUI(scores, options = {}) {
    const normalized = normalizeFicoScores(scores);
    const highest = getHighestFicoScore(normalized);
    const valueText = highest === null ? 'Pendiente' : String(highest);

    const badgeEl = document.getElementById('creditorsFicoScore');
    if (badgeEl) {
      badgeEl.textContent = valueText;
    }

    const leadScoreEl = document.getElementById('ficoScore');
    if (leadScoreEl) {
      leadScoreEl.textContent = valueText;
      leadScoreEl.classList.toggle('pendiente', highest === null);
    }

    const applicantFicoEl = document.getElementById('creditorsApplicantFico');
    if (applicantFicoEl) {
      applicantFicoEl.textContent = normalized.applicant === null ? 'Pendiente' : String(normalized.applicant);
    }

    const coappFicoEl = document.getElementById('creditorsCoappFico');
    if (coappFicoEl) {
      coappFicoEl.textContent = normalized.coapp === null ? 'Pendiente' : String(normalized.coapp);
    }

    const coappDebtDetected = currentCreditors.some((entry) => {
      const party = parseDebtorParty(entry.debtor_party || entry.debtorParty);
      return party === 'coapp' && normalizeMoney(entry.debt_amount || entry.debtAmount) > 0;
    });
    const coappContextDetected = options.coappContextDetected === true
      || (options.coappContextDetected !== false && (coappDebtDetected || hasCreditReportForParty('coapp') || normalized.coapp !== null));
    const showPartySummary = options.showPartySummary === true
      || (options.showPartySummary !== false && shouldShowPartySummary(coappContextDetected));

    applySummaryBadgeMode(showPartySummary);
  }

  function setFicoScore(score, options = {}) {
    const {
      persist = true,
      preferHigher = true,
      party = 'applicant'
    } = options;

    const normalizedParty = parseDebtorParty(party) || 'applicant';
    const normalized = normalizeCreditScore(score);
    let nextScore = normalized;
    const previousScore = normalizeCreditScore(currentFicoScores[normalizedParty]);
    if (preferHigher && normalized !== null && previousScore !== null) {
      nextScore = Math.max(previousScore, normalized);
    }

    currentFicoScores = {
      ...currentFicoScores,
      [normalizedParty]: nextScore
    };
    updateFicoScoreUI(currentFicoScores);

    if (persist) {
      const leadId = Number(window.currentLeadId || 0);
      if (leadId) {
        queuePersistFicoScores(leadId, currentFicoScores);
      }
    }
  }

  function setFicoScores(scores, options = {}) {
    const { persist = false } = options;
    currentFicoScores = normalizeFicoScores(scores);
    updateFicoScoreUI(currentFicoScores);

    if (persist) {
      const leadId = Number(window.currentLeadId || 0);
      if (leadId) {
        queuePersistFicoScores(leadId, currentFicoScores);
      }
    }
  }

  function getStoredLeadFiles() {
    const leadId = Number(window.currentLeadId || 0);
    if (!leadId) return [];

    try {
      if (typeof window.getLeadFilesMetadata === 'function') {
        const sharedFiles = window.getLeadFilesMetadata(leadId);
        if (Array.isArray(sharedFiles) && sharedFiles.length) {
          return sharedFiles;
        }
      }
    } catch (_error) {
      // Fallback a localStorage.
    }

    const sharedStore = window.__sharedLeadFilesByLeadId && typeof window.__sharedLeadFilesByLeadId === 'object'
      ? window.__sharedLeadFilesByLeadId
      : null;
    if (sharedStore && Array.isArray(sharedStore[leadId]) && sharedStore[leadId].length) {
      return sharedStore[leadId];
    }

    try {
      const filesKey = `lead_files_${leadId}`;
      const files = JSON.parse(localStorage.getItem(filesKey) || '[]');
      return Array.isArray(files) ? files : [];
    } catch (_error) {
      return [];
    }
  }

  function hasCreditReportForParty(party) {
    const targetParty = parseDebtorParty(party);
    if (!targetParty) return false;
    const files = getStoredLeadFiles();

    return files.some((file) => {
      const category = String(file?.documentCategory || '').trim().toLowerCase();
      if (category !== 'credit_report') return false;

      const fileParty = parseDebtorParty(file?.creditReportParty || file?.debtorParty);
      return fileParty === targetParty;
    });
  }

  function getPartyLabel(value) {
    const party = parseDebtorParty(value);
    if (party === 'coapp') return 'Co-Applicant';
    if (party === 'applicant') return 'Applicant';
    return '';
  }

  function getPartyClass(value) {
    const party = parseDebtorParty(value);
    if (party === 'coapp') return 'badge-party-coapp';
    if (party === 'applicant') return 'badge-party-applicant';
    return '';
  }

  function setStatus(message, tone = 'neutral') {
    const el = document.getElementById('creditorsStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `status-text ${tone}`.trim();
  }

  function isValidCreditorName(name) {
    if (!name || name.length < 3 || name.length > 120) return false;

    const lower = name.toLowerCase();
    for (const phrase of INVALID_PHRASES) {
      if (lower.includes(phrase)) return false;
    }

    if (!/[a-zA-Z]/.test(name)) return false;
    if (/^[\d\$\%\&\*]/.test(name)) return false;
    if (/^\d+$/.test(name.replace(/\s/g, ''))) return false;

    return true;
  }

  function isNoiseCreditorLine(line) {
    const normalized = String(line || '').trim().toLowerCase();
    if (!normalized) return true;

    return (
      normalized === 'accounts' ||
      normalized === 'overview' ||
      normalized === 'account details' ||
      normalized === 'payment history' ||
      normalized === 'creditor information' ||
      normalized === 'credit cards' ||
      normalized === 'other' ||
      normalized === 'bureau' ||
      normalized === 'account summary' ||
      normalized.startsWith('you\'re currently using') ||
      normalized.startsWith('you have ') ||
      normalized.startsWith('report date') ||
      normalized.startsWith('personal info')
    );
  }

  function normalizeCreditorNameLine(line) {
    let normalized = String(line || '').replace(/\s{2,}/g, ' ').trim();
    if (!normalized) return '';

    normalized = normalized.replace(/\s+\$[0-9,].*$/i, '').trim();
    normalized = normalized.replace(/\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b[\s\S]*$/i, '').trim();
    normalized = normalized.replace(/\s+(?:in good standing|closed|charge off|collection\/charge-off)\b[\s\S]*$/i, '').trim();

    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length >= 4 && words.length % 2 === 0) {
      const half = words.length / 2;
      const left = words.slice(0, half).join(' ').toLowerCase();
      const right = words.slice(half).join(' ').toLowerCase();
      if (left === right) {
        normalized = words.slice(0, half).join(' ');
      }
    }

    const dedupeWords = normalized.split(/\s+/).filter(Boolean);
    if (dedupeWords.length === 6) {
      const left = dedupeWords.slice(0, 3);
      const right = dedupeWords.slice(3);
      if (left[0]?.toLowerCase() === right[0]?.toLowerCase() && left[1]?.toLowerCase() === right[1]?.toLowerCase()) {
        const tail = (left[2] || '').length >= (right[2] || '').length ? left[2] : right[2];
        normalized = [left[0], left[1], tail].filter(Boolean).join(' ');
      }
    }

    return normalized;
  }

  function extractCurrencyValues(line) {
    const values = [];
    const regex = /\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g;
    let match;
    while ((match = regex.exec(String(line || ''))) !== null) {
      values.push(normalizeMoney(match[1]));
    }
    return values.filter((value) => value > 0);
  }

  function extractCurrencyValuesIncludingZero(line) {
    const values = [];
    const regex = /\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g;
    let match;
    while ((match = regex.exec(String(line || ''))) !== null) {
      const amount = normalizeMoney(match[1]);
      if (Number.isFinite(amount) && amount >= 0) {
        values.push(amount);
      }
    }
    return values;
  }

  function looksLikeBankName(line) {
    const upper = line.toUpperCase();

    for (const bank of KNOWN_CREDITORS) {
      if (upper.includes(bank)) return true;
    }

    if (/^[A-Z][A-Z\s&.\-]{4,}$/.test(line) && line.split(/\s+/).length >= 2) return true;
    if (/\b(BANK|CREDIT UNION|FINANCIAL|SERVICES|CARD|LOAN|MORTGAGE|AUTO|CREDIT)$/.test(upper)) return true;

    return false;
  }

  function normalizeAccountToken(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/[^A-Z0-9X*]/g, '')
      .trim();
  }

  function getAccountQualityScore(value) {
    const token = normalizeAccountToken(value);
    if (!token) return -1;

    const compact = token.replace(/[X*]/g, '');
    const digits = compact.replace(/[^0-9]/g, '');
    const hasMask = /[X*]/.test(token);

    let score = 0;
    score += compact.length * 4;
    score += digits.length * 6;
    if (!hasMask) score += 50;
    if (hasMask) score -= 20;
    return score;
  }

  function choosePreferredAccountNumber(currentValue, candidateValue) {
    const current = String(currentValue || '').trim();
    const candidate = String(candidateValue || '').trim();
    if (!candidate) return current;
    if (!current) return candidate;

    const currentScore = getAccountQualityScore(current);
    const candidateScore = getAccountQualityScore(candidate);

    if (candidateScore > currentScore) return candidate;
    if (candidateScore < currentScore) return current;

    return candidate.length > current.length ? candidate : current;
  }

  function extractAccountNumbers(line) {
    const source = String(line || '');
    const regex = /Account\s*(?:Number|#)\s*[:\s]*([A-Za-z0-9\-*X]+)/gi;
    const values = [];
    let match;
    while ((match = regex.exec(source)) !== null) {
      const token = String(match[1] || '').trim();
      if (token) values.push(token);
    }
    return values;
  }

  function extractAccountNumber(line) {
    const tokens = extractAccountNumbers(line);
    return tokens.reduce((best, token) => choosePreferredAccountNumber(best, token), '');
  }

  function accountTokensLikelySame(tokenA, tokenB) {
    const a = normalizeAccountToken(tokenA);
    const b = normalizeAccountToken(tokenB);
    if (!a || !b) return false;
    if (a === b) return true;

    const compactA = a.replace(/[X*]/g, '');
    const compactB = b.replace(/[X*]/g, '');
    if (!compactA || !compactB) return false;
    if (compactA === compactB) return true;

    if (
      compactA.length >= 6 &&
      compactB.length >= 6 &&
      (compactA.includes(compactB) || compactB.includes(compactA))
    ) {
      return true;
    }

    const lastA = compactA.slice(-4);
    const lastB = compactB.slice(-4);
    if (lastA && lastB && lastA.length === 4 && lastA === lastB) {
      const firstA = compactA.slice(0, 6);
      const firstB = compactB.slice(0, 6);
      if (firstA && firstB && firstA === firstB) return true;
    }

    return false;
  }

  function extractStatus(line) {
    const source = String(line || '');
    let match = source.match(/Account\s+Status[:\s]*([A-Za-z][A-Za-z\s\-\/]*)/i);

    if (!match && !/Current\s+Payment\s+Status/i.test(source)) {
      match = source.match(/(?:Current\s+Rating|(?:^|\b)Status)[:\s]*([A-Za-z][A-Za-z\s\-\/]*)/i);
    }

    if (!match) return '';

    let value = match[1].trim();
    value = value.split(/\b(?:Account\s+Status|Current\s+Rating|Open\s+Date|Last\s+Activity|Type|Responsibility|Remarks|High\s+Balance|Unpaid\s+Balance|Current\s+Payment)\b/i)[0].trim();
    return truncate(value, 40);
  }

  function extractCurrentPaymentStatus(line) {
    const match = String(line || '').match(/Current\s+Payment\s+Status[:\s]*([A-Za-z][A-Za-z\s\-\/]*)/i);
    if (!match) return '';

    let value = match[1].trim();
    value = value.split(/\b(?:Monthly\s+Payment|Amount\s+Past\s+Due|Payment\s+History|Terms?\s+Count|Month(?:'s|s)?\s+Reviewed|Current\s+Payment\s+Status)\b/i)[0].trim();
    return truncate(value, 40);
  }

  function extractType(line) {
    const source = String(line || '');
    if (/Term\s+Source\s+Type/i.test(source)) return '';

    const match = source.match(/(?:^|\b)Type[:\s]+([A-Za-z][A-Za-z\s/&\-]*)/i);
    if (!match) return '';

    let value = match[1].trim();
    value = value.split(/\bType\b/i)[0].trim();
    value = value.split(/\b(?:Responsibility|High\s+Balance|High\s+Credit|Monthly\s+Payment|Current\s+Payment|Amount\s+Past\s+Due|Month(?:'s|s)?\s+Reviewed)\b/i)[0].trim();
    if (/^(?:provided|source|terms?|count|overview)$/i.test(value)) return '';
    if (/(?:term source|terms count|payment history|account details)/i.test(value)) return '';
    return truncate(value, 40);
  }

  function extractResponsibility(line) {
    const match = String(line || '').match(/Responsibility[:\s]*([A-Za-z][A-Za-z\s-]*)/i);
    if (!match) return '';

    let value = match[1].trim();
    value = value
      .split(/\b(?:Type|Month(?:'s|s)?\s+Reviewed|Remarks|Account\s+Status|Current\s+Payment|Open\s+Date|Last\s+Activity|Terms?\s+Count|Responsibility)\b/i)[0]
      .trim();
    const lowered = value.toLowerCase();
    const idxIndividual = lowered.indexOf('individual');
    const idxJoint = lowered.indexOf('joint');
    if (idxIndividual >= 0 && (idxJoint < 0 || idxIndividual <= idxJoint)) return 'Individual';
    if (idxJoint >= 0) return 'Joint';
    if (lowered.includes('authorized')) return 'Authorized';
    return truncate(value, 15);
  }

  function extractMonthsReviewed(line) {
    const match = line.match(/Month(?:'s|s)?\s*Reviewed[:\s]*(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  function extractBalance(line) {
    const patterns = [
      /^\s*Balance[:\s]*\$?([0-9,]+\.?\d*)/i,
      /^\s*(?:Current|Account)\s+Balance[:\s]*\$?([0-9,]+\.?\d*)/i,
      /^\s*Unpaid\s+Balance[:\s]*\$?([0-9,]+\.?\d*)/i,
      /^\s*Payoff(?:\s+Balance|\s+Amount)?[:\s]*\$?([0-9,]+\.?\d*)/i
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) return normalizeMoney(match[1]);
    }

    return 0;
  }

  function extractPastDue(line) {
    const explicitAmount = String(line || '').match(/Amount\s+Past\s+Due[:\s]*\$?([0-9,]+\.?\d*)/i);
    if (explicitAmount) return normalizeMoney(explicitAmount[1]);

    const labeledPastDue = String(line || '').match(/Past\s+Due:\s*\$?([0-9,]+\.?\d*)/i);
    return labeledPastDue ? normalizeMoney(labeledPastDue[1]) : 0;
  }

  function extractLooseMoneyValues(line) {
    const values = [];
    const regex = /(?:\$?\s*)([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]{2,6}(?:\.[0-9]{1,2}))/g;
    let match;

    while ((match = regex.exec(String(line || ''))) !== null) {
      const amount = normalizeMoney(match[1]);
      if (amount > 0 && amount <= 999999) {
        values.push(amount);
      }
    }

    return values;
  }

  function buildCandidateLines(text) {
    const normalized = String(text || '')
      .replace(/\r/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/\t/g, ' ');

    const withHints = normalized
      .replace(/(Account\s*(?:Number|#)|Account\s+Status|Type\s*:|Responsibility\s*:|Months?['\s]*Reviewed|(?:Amount\s+)?Past\s+Due|(?:Current\s+)?Balance\s*:)/gi, '\n$1')
      // Mantener saltos de linea; solo colapsar espacios consecutivos.
      .replace(/[ ]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n');

    return withHints
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  function extractHighestCreditScore(rawText) {
    const text = String(rawText || '');
    if (!text.trim()) return null;

    const extractScores = (chunk) => {
      const values = [];
      const matches = String(chunk || '').match(/\b([3-8]\d{2})\b/g) || [];
      matches.forEach((token) => {
        const score = normalizeCreditScore(token);
        if (score !== null) values.push(score);
      });
      return values;
    };

    const bureauBlockMatch = text.match(/Bureau([\s\S]{0,220}?)(?:VantageScore|Report date|Personal info|Account summary)/i);
    if (bureauBlockMatch && bureauBlockMatch[1]) {
      let bureauScores = extractScores(bureauBlockMatch[1]);
      if (/300\s+500\s+660\s+850/.test(bureauBlockMatch[1])) {
        bureauScores = bureauScores.filter((score) => ![300, 500, 660, 850].includes(score));
      }
      if (bureauScores.length) {
        return Math.max(...bureauScores);
      }
    }

    const lines = buildCandidateLines(text).slice(0, 260);
    let best = null;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.includes('$')) continue;

      const prev = String(lines[i - 1] || '');
      const next = String(lines[i + 1] || '');
      const context = `${prev} ${line} ${next}`.toLowerCase();
      const hasScoreContext = /(fico|vantage\s*score|credit score|all bureaus|bureau)/i.test(context);
      if (!hasScoreContext) continue;

      let scores = extractScores(line);
      if (!scores.length && /(bureau|score)/i.test(line)) {
        scores = scores.concat(extractScores(next));
      }
      if (!scores.length) continue;

      if (/300\s+500\s+660\s+850/.test(context)) {
        scores = scores.filter((score) => ![300, 500, 660, 850].includes(score));
      }
      if (!scores.length) continue;

      const candidate = Math.max(...scores);
      best = best === null ? candidate : Math.max(best, candidate);
    }

    return best;
  }

  function finalizeCreditor(creditor) {
    creditor.creditorName = creditor.creditorName.replace(/\s+/g, ' ').trim();

    if (creditor.debtAmount === 0 && creditor.pastDue > 0) {
      creditor.debtAmount = creditor.pastDue;
      if ((creditor.debtSourceRank || 0) < 2) {
        creditor.debtSourceRank = 2; // fallback: past due
      }
    }

    creditor.isIncluded = creditor.debtAmount > 0;
  }

  function isLikelyCreditorLine(line) {
    const value = String(line || '').replace(/\s+/g, ' ').trim();
    if (!value) return false;
    if (value.length < 3 || value.length > 120) return false;
    if (!/[A-Za-z]/.test(value)) return false;

    if (
      /---\s*page\s*break\s*---/i.test(value) ||
      /^(?:cc|br|rf|vs|n\/a)(?:\s+(?:cc|br|rf|vs|n\/a))*$/i.test(value) ||
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b.*\d{4}/i.test(value) ||
      /(?:in good standing|voluntary surrender|bankruptcy|repossession|collection or charge off|you['’]re currently using|you['’]ve made|you have|hide details|days past due|no data available|credit score significantly|credit score|\blimit\b|account|balance|credit limit|highest balance|high balance|high credit|monthly payment|payment history|terms count|open date|last activity|report date|account summary|account details|current payment|month(?:'s|s)? reviewed|remarks|collection agency|creditor information|public records|inquiries|personal info|download pdf|bureau|overview)/i.test(value) ||
      /(?:po box|\(\d{3}\)\s*\d{3}-\d{4}|,\s*[A-Z]{2}\b|\b(?:st|ave|rd|blvd|apt|suite|fl)\b\s*\d*)/i.test(value) ||
      /^\$?[0-9,.\s-]+$/.test(value) ||
      value.includes('%')
    ) {
      return false;
    }

    const normalized = normalizeCreditorNameLine(value);
    if (!isValidCreditorName(normalized) || isNoiseCreditorLine(normalized)) return false;
    if (looksLikeBankName(normalized)) return true;

    const letters = value.match(/[A-Za-z]/g) || [];
    const uppercaseLetters = value.match(/[A-Z]/g) || [];
    const upperRatio = letters.length ? uppercaseLetters.length / letters.length : 0;
    const words = value.split(/\s+/).filter(Boolean);

    if (upperRatio >= 0.55 && words.length <= 7) return true;
    if (value.includes('/') && words.length <= 7) return true;
    if (words.length >= 2 && words.length <= 6 && /^[A-Za-z0-9/&.\-\s]+$/.test(value)) return true;

    return false;
  }

  function scoreCreditorCandidate(rawLine, normalizedLine) {
    let score = 0;
    if (looksLikeBankName(normalizedLine)) score += 6;
    if (normalizedLine.includes('/')) score += 3;
    if (/\$/.test(rawLine)) score += 2;
    const words = normalizedLine.split(/\s+/).filter(Boolean).length;
    if (words >= 2 && words <= 6) score += 1;
    return score;
  }

  function mergeCreditorNameFragments(lines, lineIndex, candidateName) {
    const candidate = normalizeCreditorNameLine(candidateName);
    if (!candidate) return '';

    const candidateWords = candidate.split(/\s+/).filter(Boolean).length;
    const shouldTryMerge = candidateWords <= 2 || candidate.length <= 16;
    if (!shouldTryMerge) return candidate;

    const previousRaw = String(lines[lineIndex - 1] || '').trim();
    const previous = normalizeCreditorNameLine(previousRaw);
    if (!previous) return candidate;
    if (!isLikelyCreditorLine(previous)) return candidate;
    if (/\$/.test(previousRaw)) return candidate;

    const merged = normalizeCreditorNameLine(`${previous} ${candidate}`);
    if (!isValidCreditorName(merged)) return candidate;
    if (merged.length > 70) return candidate;
    return merged;
  }

  function findCreditorNameAround(lines, accountIndex) {
    const start = Math.max(0, accountIndex - 18);
    let bestCandidate = '';
    let bestScore = -Infinity;
    let bestIndex = -1;

    for (let i = accountIndex - 1; i >= start; i -= 1) {
      const rawLine = String(lines[i] || '');
      if (bestCandidate && /^(?:Account ID:?|Creditor information|Collections|Hard inquiries|Public records|Creditors)$/i.test(rawLine.trim())) {
        break;
      }

      const candidate = normalizeCreditorNameLine(rawLine);
      if (!isLikelyCreditorLine(candidate)) continue;
      const score = scoreCreditorCandidate(rawLine, candidate) - ((accountIndex - i) * 0.12);
      if (score > bestScore) {
        bestCandidate = candidate;
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestCandidate) {
      return mergeCreditorNameFragments(lines, bestIndex, bestCandidate);
    }

    const forwardEnd = Math.min(lines.length - 1, accountIndex + 10);
    for (let i = accountIndex + 1; i <= forwardEnd; i += 1) {
      const candidate = normalizeCreditorNameLine(lines[i]);
      if (!isLikelyCreditorLine(candidate)) continue;
      return candidate;
    }

    return '';
  }

  function extractHeaderDebtNearAccount(lines, accountIndex) {
    const monthPattern = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i;
    const start = Math.max(0, accountIndex - 14);
    const end = Math.min(lines.length - 1, accountIndex + 5);
    let best = 0;
    let hasExplicitBalanceLabel = false;
    let explicitBalanceMode = 'balance';

    for (let i = start; i <= end; i += 1) {
      const line = lines[i];
      if (/^balance:/i.test(line)) {
        hasExplicitBalanceLabel = true;
        if (/highest balance/i.test(line)) explicitBalanceMode = 'highest';
        else if (/credit limit/i.test(line)) explicitBalanceMode = 'credit-limit';
        else explicitBalanceMode = 'balance';
      }

      if (/credit limit|highest balance|high balance|high credit|monthly payment|term source|terms count|payment history|times 30\/60\/90/i.test(line)) {
        continue;
      }

      const balance = extractBalance(line);
      if (balance > best) best = balance;

      const currencyValues = extractCurrencyValuesIncludingZero(line);
      if (currencyValues.length && isLikelyCreditorLine(line)) {
        best = Math.max(best, currencyValues[0]);
      }

      if (hasExplicitBalanceLabel && /^(?:\$?\s*[0-9,]+(?:\.[0-9]{1,2})?\s*){2,4}$/i.test(line)) {
        const nearValues = extractCurrencyValuesIncludingZero(line);
        if (nearValues.length) {
          if (explicitBalanceMode === 'highest' && nearValues.length >= 2) {
            return Math.min(nearValues[0], nearValues[1]);
          }
          return nearValues[0];
        }
      }

      if (!currencyValues.length && /\d+\.\d{2}/.test(line) && !monthPattern.test(line)) {
        const looseValues = extractLooseMoneyValues(line);
        if (looseValues.length && /^(?:\$?\s*[0-9,]+(?:\.[0-9]{1,2})?\s*){1,4}$/.test(line)) {
          best = Math.max(best, looseValues[0]);
        }
      }
    }

    return best;
  }

  function findDuplicateCreditorIndex(entry, existingEntries) {
    const normalizeKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const nameKey = normalizeKey(entry.creditorName);
    const entryStatus = String(entry.accountStatus || '').toLowerCase().trim();

    return existingEntries.findIndex((prev) => {
      if (normalizeKey(prev.creditorName) !== nameKey) return false;

      const prevStatus = String(prev.accountStatus || '').toLowerCase().trim();
      if (prevStatus && entryStatus && prevStatus !== entryStatus) return false;

      if (entry.accountNumber && prev.accountNumber) {
        return accountTokensLikelySame(entry.accountNumber, prev.accountNumber);
      }

      return Math.abs(normalizeMoney(prev.debtAmount) - normalizeMoney(entry.debtAmount)) <= 0.01;
    });
  }

  function isCoappIncludedByToggle() {
    const directToggle = document.getElementById('includeCoAppToggle');
    if (directToggle) return Boolean(directToggle.checked);
    if (typeof window.isCoappIncludedInContract === 'function') {
      return Boolean(window.isCoappIncludedInContract());
    }
    return false;
  }

  function shouldShowPartySummary(coappContextDetected) {
    return Boolean(coappContextDetected) && isCoappIncludedByToggle();
  }

  function isCoappCreditorEntry(entry) {
    const party = parseDebtorParty(entry?.debtor_party || entry?.debtorParty);
    return party === 'coapp';
  }

  function isCreditorEntryActive(entry) {
    if (!entry) return false;
    if (!isCoappCreditorEntry(entry)) return true;
    return isCoappIncludedByToggle();
  }

  function getActiveCreditors(entries = currentCreditors) {
    if (!Array.isArray(entries)) return [];
    return entries.filter((entry) => isCreditorEntryActive(entry));
  }

  function applySummaryBadgeMode(showPartySummary) {
    const normalizedShow = Boolean(showPartySummary);
    const mainSummaryEl = document.getElementById('creditorsMainSummaryBadges');
    if (mainSummaryEl) {
      mainSummaryEl.classList.toggle('hidden', normalizedShow);
      mainSummaryEl.hidden = normalizedShow;
    }

    const partySummaryEl = document.getElementById('creditorsPartySummaryBadges');
    if (partySummaryEl) {
      partySummaryEl.classList.toggle('hidden', !normalizedShow);
      partySummaryEl.hidden = !normalizedShow;
    }
  }

  function normalizeCreditorNameKey(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function isLikelyTradelineBoundary(lines, lineIndex, currentCreditorName) {
    const line = String(lines[lineIndex] || '').trim();
    if (!line) return false;

    if (/^Creditor information$/i.test(line)) return true;
    if (/^Account ID:?$/i.test(line)) return true;

    if (/^\$[0-9,]+\.\d{2}$/.test(line)) {
      const nextLine = String(lines[lineIndex + 1] || '').trim();
      const nextNextLine = String(lines[lineIndex + 2] || '').trim();
      if (!nextLine || !/[A-Za-z]/.test(nextLine)) return false;
      if (/^(?:Account Number|Account details|Payment history|Overview|Type|Responsibility)\b/i.test(nextLine)) return false;

      const sameCreditorFamily = normalizeCreditorNameKey(nextLine).includes(normalizeCreditorNameKey(currentCreditorName));
      const likelyHeaderContext =
        /\d{4}/.test(nextLine) ||
        /^(?:open|closed|charge off|collection|in good standing)$/i.test(nextNextLine) ||
        /^Overview$/i.test(nextNextLine);

      if (sameCreditorFamily && likelyHeaderContext) return true;
      if (likelyHeaderContext && /[A-Z]/.test(nextLine)) return true;
    }

    return false;
  }

  function parseCreditReport(text, source = 'Reporte') {
    const lines = buildCandidateLines(text);
    const creditors = [];
    const accountIndexes = [];

    for (let i = 0; i < lines.length; i += 1) {
      if (!/Account\s*(?:Number|#)\b/i.test(lines[i])) continue;

      const lineAccounts = extractAccountNumbers(lines[i]);
      if (!lineAccounts.length) continue;
      const accountNumber = lineAccounts.reduce((best, token) => choosePreferredAccountNumber(best, token), '');
      if (!accountNumber) continue;

      const isMaskedAccount = /[x*]/i.test(accountNumber);
      if (isMaskedAccount) {
        const prevAccount = extractAccountNumber(lines[i - 1] || '');
        const nextAccount = extractAccountNumber(lines[i + 1] || '');
        const hasNearbyUnmasked = (prevAccount && !/[x*]/i.test(prevAccount)) || (nextAccount && !/[x*]/i.test(nextAccount));
        if (hasNearbyUnmasked) continue;
      }

      accountIndexes.push(i);
    }

    for (let index = 0; index < accountIndexes.length; index += 1) {
      const accountIndex = accountIndexes[index];
      const nextAccountIndex = accountIndexes[index + 1] ?? lines.length;
      const blockStart = Math.max(0, accountIndex - 24);
      let blockEnd = Math.min(lines.length - 1, Math.min(accountIndex + 90, nextAccountIndex - 1));
      const creditorName = findCreditorNameAround(lines, accountIndex);
      if (!creditorName) continue;

      for (let cursor = accountIndex + 10; cursor <= blockEnd; cursor += 1) {
        const line = String(lines[cursor] || '').trim();
        if (/^(?:Credit cards|Other|Collections|Installment|Auto|Mortgage|Public records|Hard inquiries|Inquiries)$/i.test(line) || /^Total count\b/i.test(line)) {
          blockEnd = cursor - 1;
          break;
        }

        if (cursor > accountIndex + 8 && isLikelyTradelineBoundary(lines, cursor, creditorName)) {
          blockEnd = cursor - 1;
          break;
        }
      }

      let accountNumber = '';
      const accountScanStart = Math.max(blockStart, accountIndex - 2);
      const accountScanEnd = Math.min(blockEnd, accountIndex + 12);
      for (let cursor = accountScanStart; cursor <= accountScanEnd; cursor += 1) {
        const candidates = extractAccountNumbers(lines[cursor] || '');
        for (const candidate of candidates) {
          accountNumber = choosePreferredAccountNumber(accountNumber, candidate);
        }
      }
      if (!accountNumber) continue;

      const creditor = {
        sourceReport: source,
        creditorName,
        accountNumber,
        accountStatus: '',
        accountType: '',
        responsibility: '',
        currentPaymentStatus: '',
        monthsReviewed: null,
        debtAmount: 0,
        debtSourceRank: 0,
        pastDue: 0,
        isIncluded: true
      };

      let waitingBalanceValues = false;
      let waitingBalanceMode = 'balance';
      let hasExplicitDebtSignal = false;

      for (let cursor = accountIndex; cursor <= blockEnd; cursor += 1) {
        const line = lines[cursor];

        if (cursor > accountIndex + 8 && isLikelyTradelineBoundary(lines, cursor, creditorName)) {
          break;
        }

        if (!creditor.accountStatus) {
          const status = extractStatus(line);
          if (status) creditor.accountStatus = status;
        }

        if (!creditor.currentPaymentStatus) {
          const currentStatus = extractCurrentPaymentStatus(line);
          if (currentStatus) creditor.currentPaymentStatus = currentStatus;
        }

        if (!creditor.accountType) {
          const type = extractType(line);
          if (type) creditor.accountType = type;
        }

        if (!creditor.responsibility) {
          const resp = extractResponsibility(line);
          if (resp) creditor.responsibility = resp;
        }

        const months = extractMonthsReviewed(line);
        if (months !== null) {
          creditor.monthsReviewed = creditor.monthsReviewed === null
            ? months
            : Math.min(creditor.monthsReviewed, months);
        }

        const pastDue = extractPastDue(line);
        if (pastDue > creditor.pastDue) creditor.pastDue = pastDue;

        if (/^balance:\s*(?:credit limit:|highest balance:)?\s*$/i.test(line) || /^balance:\s*(?:credit limit|highest balance)/i.test(line)) {
          if (/highest balance/i.test(line)) waitingBalanceMode = 'highest';
          else if (/credit limit/i.test(line)) waitingBalanceMode = 'credit-limit';
          else waitingBalanceMode = 'balance';
          waitingBalanceValues = true;
          continue;
        }

        if (waitingBalanceValues) {
          let nearValues = extractCurrencyValuesIncludingZero(line);
          if (!nearValues.length && /\d+\.\d{2}/.test(line) && !/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(line)) {
            nearValues = extractLooseMoneyValues(line);
          }

          if (nearValues.length) {
            let candidate = nearValues[0];
            if (waitingBalanceMode === 'highest' && nearValues.length >= 2) {
              candidate = Math.min(nearValues[0], nearValues[1]);
            }

            if (creditor.debtSourceRank < 3 || creditor.debtAmount <= 0) {
              creditor.debtAmount = candidate;
            } else {
              creditor.debtAmount = Math.min(creditor.debtAmount, candidate);
            }
            creditor.debtSourceRank = 3; // explicit balance section
            hasExplicitDebtSignal = true;
            waitingBalanceValues = false;
          }
        }

        if (/credit limit|highest balance|high balance|high credit|monthly payment|term source|terms count|payment history|times 30\/60\/90/i.test(line)) {
          continue;
        }

        const balance = extractBalance(line);
        if (balance > creditor.debtAmount) {
          if (creditor.debtSourceRank < 3 || creditor.debtAmount <= 0) {
            creditor.debtAmount = balance;
          } else {
            creditor.debtAmount = Math.min(creditor.debtAmount, balance);
          }
          creditor.debtSourceRank = 3; // explicit balance label
          hasExplicitDebtSignal = true;
        }
      }

      if (!creditor.accountStatus && creditor.currentPaymentStatus) {
        creditor.accountStatus = creditor.currentPaymentStatus;
      } else if (creditor.currentPaymentStatus) {
        const cps = creditor.currentPaymentStatus.toLowerCase();
        const currentStatus = creditor.accountStatus.toLowerCase();
        if (!/closed/.test(currentStatus)) {
          if (/(collection|charge[-\s]?off)/.test(cps)) {
            creditor.accountStatus = 'Collection/Charge-off';
          } else if (/(past due|delinquent|late)/.test(cps)) {
            creditor.accountStatus = 'Past Due';
          } else if (/(as agreed|good standing|current)/.test(cps) && /open/.test(currentStatus)) {
            creditor.accountStatus = 'Good Standing';
          }
        }
      }

      const headerDebt = extractHeaderDebtNearAccount(lines, accountIndex);
      if (!hasExplicitDebtSignal && headerDebt > creditor.debtAmount) {
        creditor.debtAmount = headerDebt;
        if (creditor.debtSourceRank < 1) {
          creditor.debtSourceRank = 1; // fallback: header debt
        }
      }

      finalizeCreditor(creditor);
      if (!creditor.isIncluded) continue;
      const duplicateIndex = findDuplicateCreditorIndex(creditor, creditors);
      if (duplicateIndex >= 0) {
        const prev = creditors[duplicateIndex];
        prev.accountNumber = choosePreferredAccountNumber(prev.accountNumber, creditor.accountNumber);
        if (!prev.accountStatus && creditor.accountStatus) prev.accountStatus = creditor.accountStatus;
        if (!prev.accountType && creditor.accountType) prev.accountType = creditor.accountType;
        if (!prev.responsibility && creditor.responsibility) prev.responsibility = creditor.responsibility;
        if (creditor.monthsReviewed !== null) {
          prev.monthsReviewed = prev.monthsReviewed === null
            ? creditor.monthsReviewed
            : Math.min(prev.monthsReviewed, creditor.monthsReviewed);
        }
        prev.pastDue = Math.max(normalizeMoney(prev.pastDue), normalizeMoney(creditor.pastDue));

        const prevRank = Number(prev.debtSourceRank || 0);
        const nextRank = Number(creditor.debtSourceRank || 0);
        if (nextRank > prevRank) {
          prev.debtAmount = normalizeMoney(creditor.debtAmount);
          prev.debtSourceRank = nextRank;
        } else if (nextRank === prevRank) {
          if (nextRank >= 3) {
            prev.debtAmount = Math.min(normalizeMoney(prev.debtAmount), normalizeMoney(creditor.debtAmount));
          } else {
            prev.debtAmount = Math.max(normalizeMoney(prev.debtAmount), normalizeMoney(creditor.debtAmount));
          }
        }
        finalizeCreditor(prev);
        continue;
      }
      creditors.push(creditor);
    }

    return creditors;
  }

  function normalizeMonthsReviewed(value) {
    if (value === undefined || value === null || value === '') return null;

    const values = [];
    if (Array.isArray(value)) {
      value.forEach((item) => {
        const num = Number(item);
        if (Number.isInteger(num) && num >= 0 && num <= 999) values.push(num);
      });
    } else {
      const matches = String(value).match(/\d+/g) || [];
      matches.forEach((token) => {
        const num = Number(token);
        if (Number.isInteger(num) && num >= 0 && num <= 999) values.push(num);
      });
    }

    if (!values.length) return null;
    return Math.min(...values);
  }

  function normalizeExtractedEntry(entry, sourceName, party) {
    const debtAmount = normalizeMoney(entry.debtAmount || entry.debt_amount || entry.latestDebt || entry.recentDebt || entry.balance);
    const monthsReviewed = normalizeMonthsReviewed(entry.monthsReviewed || entry.months_reviewed || entry.months);
    const accountStatus = String(entry.accountStatus || entry.account_status || '').trim();
    const currentPaymentStatus = String(entry.currentPaymentStatus || entry.current_payment_status || '').trim();
    let responsibility = String(entry.responsibility || entry.responsability || '').trim();
    if (responsibility) {
      const lowered = responsibility.toLowerCase();
      const idxIndividual = lowered.indexOf('individual');
      const idxJoint = lowered.indexOf('joint');
      if (idxIndividual >= 0 && (idxJoint < 0 || idxIndividual <= idxJoint)) responsibility = 'Individual';
      else if (idxJoint >= 0) responsibility = 'Joint';
      else if (lowered.includes('authorized')) responsibility = 'Authorized';
    }

    return {
      sourceReport: entry.sourceReport || entry.source_report || sourceName,
      creditorName: String(entry.creditorName || entry.creditor_name || entry.creditor || entry.name || '').trim(),
      accountNumber: String(entry.accountNumber || entry.account_number || '').trim(),
      accountStatus: accountStatus || currentPaymentStatus,
      accountType: String(entry.accountType || entry.account_type || '').trim(),
      responsibility,
      currentPaymentStatus,
      debtSourceRank: Number(entry.debtSourceRank || entry.debt_source_rank || 0),
      monthsReviewed,
      debtAmount,
      pastDue: normalizeMoney(entry.pastDue || entry.past_due),
      isIncluded: debtAmount > 0,
      debtorParty: party
    };
  }

  async function parseCreditReportWithAI(text, sourceName, party) {
    if (!ENABLE_AI_ANALYZER) return [];
    if (aiAnalyzerUnavailable) return [];

    const response = await fetch('/api/creditors/analyze-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        sourceReport: sourceName
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if ([404, 501, 503].includes(response.status)) {
        aiAnalyzerUnavailable = true;
        return [];
      }
      throw new Error(data.message || 'La IA no pudo analizar el reporte.');
    }

    const entries = Array.isArray(data.creditors) ? data.creditors : [];
    return entries
      .map((entry) => normalizeExtractedEntry(entry, sourceName, party))
      .filter((entry) => entry.creditorName && normalizeMoney(entry.debtAmount) > 0);
  }

  function getStatusBadge(status) {
    const s = String(status || '').toLowerCase();
    let cls = 'badge-status-open';
    if (s.includes('closed')) cls = 'badge-status-closed';
    else if (s.includes('charge') || s.includes('off')) cls = 'badge-status-chargeoff';
    else if (s.includes('collection')) cls = 'badge-status-collection';
    return `<span class="badge ${cls}">${escapeHtml(truncate(status || '-', 12))}</span>`;
  }

  function renderRow(entry, index) {
    const isIncluded = entry.is_included !== false;
    const party = parseDebtorParty(entry.debtor_party || entry.debtorParty);
    const partyLabel = getPartyLabel(party);
    const partyClass = party === 'coapp' ? 'badge-party-coapp' : 'badge-party-applicant';
    const checkbox = `<button type="button" class="row-checkbox ${isIncluded ? 'is-checked' : ''}" aria-label="Incluir deuda" aria-pressed="${isIncluded ? 'true' : 'false'}" data-id="${entry.id || ''}"></button>`;
    const deleteBtn = `<button class="btn-delete" data-id="${entry.id}">x</button>`;

    return `
      <tr class="${isIncluded ? 'included' : 'excluded'}">
        <td class="col-checkbox">${checkbox}</td>
        <td class="col-num">${index + 1}</td>
        <td class="col-name" title="${escapeHtml(entry.creditor_name || entry.creditorName || '')}">
          <span class="creditor-name">${escapeHtml(truncate(entry.creditor_name || entry.creditorName || '-', 28))}</span>
        </td>
        <td class="col-debt">${formatCurrency(entry.debt_amount || entry.debtAmount || 0)}</td>
        <td class="col-party">${partyLabel ? `<span class="badge ${partyClass}">${escapeHtml(partyLabel)}</span>` : '-'}</td>
        <td class="col-account">
          ${entry.account_number || entry.accountNumber ? `
            <span class="account-num">${escapeHtml(entry.account_number || entry.accountNumber)}</span>
            <button class="btn-copy-account" data-account="${escapeHtml(entry.account_number || entry.accountNumber)}" title="Copiar número">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
          ` : '-'}
        </td>
        <td class="col-resp">${entry.responsibility ? `<span class="badge badge-resp">${escapeHtml(entry.responsibility)}</span>` : '-'}</td>
        <td class="col-status">${entry.account_status || entry.accountStatus ? getStatusBadge(entry.account_status || entry.accountStatus) : '-'}</td>
        <td class="col-type">${entry.account_type || entry.accountType ? `<span class="badge badge-type">${escapeHtml(truncate(entry.account_type || entry.accountType, 12))}</span>` : '-'}</td>
        <td class="col-months">${entry.months_reviewed || entry.monthsReviewed ? `<span class="badge badge-months">${entry.months_reviewed || entry.monthsReviewed}</span>` : '-'}</td>
        <td class="col-past-due">${normalizeMoney(entry.past_due || entry.pastDue) > 0 ? formatCurrency(entry.past_due || entry.pastDue) : '-'}</td>
        <td class="col-actions">${deleteBtn}</td>
      </tr>
    `;
  }

  function updateSummary() {
    const activeCreditors = getActiveCreditors(currentCreditors);
    let totalDebt = 0;
    let includedDebt = 0;
    let pastDueTotal = 0;
    let applicantDebt = 0;
    let coappDebt = 0;

    activeCreditors.forEach((entry) => {
      const debt = normalizeMoney(entry.debt_amount || entry.debtAmount);
      const included = entry.is_included !== false;
      const party = parseDebtorParty(entry.debtor_party || entry.debtorParty);

      totalDebt += debt;
      if (included) includedDebt += debt;
      pastDueTotal += normalizeMoney(entry.past_due || entry.pastDue);

      if (party === 'coapp') coappDebt += debt;
      if (party === 'applicant') applicantDebt += debt;
    });

    const elTotal = document.getElementById('creditorsTotalDebt');
    const elIncluded = document.getElementById('creditorsIncludedAmount');
    const elCount = document.getElementById('creditorsAccountsCount');
    const elPastDue = document.getElementById('creditorsPastDueTotal');
    const elPartyTotal = document.getElementById('creditorsPartyTotalDebt');
    const elPartyCount = document.getElementById('creditorsPartyAccountsCount');
    const elApplicant = document.getElementById('creditorsApplicantDebt');
    const elCoapp = document.getElementById('creditorsCoappDebt');

    if (elTotal) elTotal.textContent = formatCurrency(totalDebt);
    if (elIncluded) elIncluded.textContent = formatCurrency(includedDebt);
    if (elCount) elCount.textContent = String(activeCreditors.length);
    if (elPastDue) elPastDue.textContent = formatCurrency(pastDueTotal);
    if (elPartyTotal) elPartyTotal.textContent = formatCurrency(totalDebt);
    if (elPartyCount) elPartyCount.textContent = String(activeCreditors.length);
    if (elApplicant) elApplicant.textContent = formatCurrency(applicantDebt);
    if (elCoapp) elCoapp.textContent = formatCurrency(coappDebt);

    const coappDebtDetected = currentCreditors.some((entry) => isCoappCreditorEntry(entry) && normalizeMoney(entry.debt_amount || entry.debtAmount) > 0);
    const coappContextDetected = coappDebtDetected || hasCreditReportForParty('coapp') || normalizeCreditScore(currentFicoScores.coapp) !== null;
    const showPartySummary = shouldShowPartySummary(coappContextDetected);

    applySummaryBadgeMode(showPartySummary);
    updateFicoScoreUI(currentFicoScores, { coappContextDetected, showPartySummary });
  }

  // Definición de columnas para reordenamiento
  const columnDefs = {
    checkbox: { class: 'col-checkbox', label: '', html: '<button class="btn-header-icon" id="creditorsSelectAllBtn" title="Seleccionar todos"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M9 12l2 2 4-4"/></svg></button>' },
    num: { class: 'col-num', label: '#' },
    name: { class: 'col-name', label: 'ACREEDOR' },
    debt: { class: 'col-debt', label: 'DEUDA' },
    party: { class: 'col-party', label: 'PARTE' },
    account: { class: 'col-account', label: 'CUENTA' },
    resp: { class: 'col-resp', label: 'RESP.' },
    status: { class: 'col-status', label: 'STATUS' },
    type: { class: 'col-type', label: 'TIPO' },
    months: { class: 'col-months', label: 'MESES' },
    pastDue: { class: 'col-past-due', label: 'VENCIDO' },
    actions: { class: 'col-actions', label: '', html: '<button class="btn-header-icon btn-delete-icon" id="creditorsDeleteAllBtn" title="Eliminar todas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' }
  };

  async function handleBulkSelectAll() {
    const activeCreditors = getActiveCreditors(currentCreditors);
    if (!activeCreditors.length) {
      setStatus('No hay deudas activas para seleccionar.', 'error');
      return;
    }

    const allSelected = activeCreditors.every((creditor) => creditor.is_included);
    const newState = !allSelected;
    const leadId = window.currentLeadId;

    try {
      setStatus(newState ? 'Seleccionando todos...' : 'Deseleccionando todos...', 'neutral');

      for (const creditor of activeCreditors) {
        if (creditor.is_included !== newState) {
          const response = await fetch(`/api/leads/${leadId}/creditors/${creditor.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isIncluded: newState })
          });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.message || 'No se pudo actualizar una cuenta.');
          }
        }
      }

      await loadSaved({ silent: true });
      syncCalculatorFromIncludedDebt({ persist: true, toast: false });
      setStatus(newState ? 'Todos seleccionados.' : 'Todos deseleccionados.', 'success');
    } catch (error) {
      console.error('Error seleccionando todos:', error);
      setStatus('No se pudo actualizar selección.', 'error');
    }
  }

  async function handleBulkDeleteAll() {
    const activeCreditors = getActiveCreditors(currentCreditors);
    if (!activeCreditors.length) {
      setStatus('No hay deudas activas para eliminar.', 'error');
      return;
    }

    const count = activeCreditors.length;
    if (!confirm(`¿Eliminar todas las ${count} deudas? Esta acción no se puede deshacer.`)) {
      return;
    }

    const leadId = window.currentLeadId;

    try {
      setStatus(`Eliminando ${count} deudas...`, 'neutral');

      for (const creditor of activeCreditors) {
        const response = await fetch(`/api/leads/${leadId}/creditors/${creditor.id}`, { method: 'DELETE' });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || 'No se pudo eliminar una cuenta.');
        }
      }

      await loadSaved({ silent: true });
      syncCalculatorFromIncludedDebt({ persist: true, toast: false });
      setStatus(`${count} deudas eliminadas.`, 'success');
    } catch (error) {
      console.error('Error eliminando todos:', error);
      setStatus('No se pudieron eliminar todas las deudas.', 'error');
    }
  }

  function bindHeaderBulkActions() {
    const selectAllBtn = document.getElementById('creditorsSelectAllBtn');
    if (selectAllBtn) {
      selectAllBtn.setAttribute('draggable', 'false');
      selectAllBtn.onclick = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await handleBulkSelectAll();
      };
      selectAllBtn.onmousedown = (event) => event.stopPropagation();
    }

    const deleteAllBtn = document.getElementById('creditorsDeleteAllBtn');
    if (deleteAllBtn) {
      deleteAllBtn.setAttribute('draggable', 'false');
      deleteAllBtn.onclick = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await handleBulkDeleteAll();
      };
      deleteAllBtn.onmousedown = (event) => event.stopPropagation();
    }
  }

  function renderTableHeader() {
    const thead = document.getElementById('creditorsTableHead');
    if (!thead) return;
    
    const tr = document.createElement('tr');
    tr.id = 'creditorsHeaderRow';
    
    columnOrder.forEach((colKey, index) => {
      const col = columnDefs[colKey];
      const th = document.createElement('th');
      th.className = col.class;
      th.draggable = true;
      th.dataset.column = colKey;
      th.dataset.index = index;
      th.innerHTML = col.html || col.label;
      
      // Eventos drag & drop premium
      th.addEventListener('dragstart', handleDragStart);
      th.addEventListener('dragover', handleDragOver);
      th.addEventListener('drop', handleDrop);
      th.addEventListener('dragenter', handleDragEnter);
      th.addEventListener('dragleave', handleDragLeave);
      th.addEventListener('dragend', handleDragEnd);
      
      // Tooltip de arrastre
      th.title = `Arrastra para reordenar: ${col.label || colKey}`;
      
      tr.appendChild(th);
    });
    
    thead.innerHTML = '';
    thead.appendChild(tr);
    bindHeaderBulkActions();
  }

  let draggedCol = null;
  let dragSourceEl = null;
  let dragGhost = null;

  function handleDragStart(e) {
    draggedCol = this.dataset.column;
    dragSourceEl = this;
    
    // Efecto de elevación suave
    requestAnimationFrame(() => {
      this.classList.add('dragging');
    });
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedCol);
    
    // Feedback táctil (si está disponible)
    if (navigator.vibrate) {
      navigator.vibrate(15);
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const targetTh = e.currentTarget;
    if (targetTh === dragSourceEl) return;
    
    // Indicador de posición suave
    const rect = targetTh.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const isAfter = e.clientX > midX;
    
    // Guardar dirección para el drop
    targetTh.dataset.dropPosition = isAfter ? 'after' : 'before';
  }

  function handleDragEnter(e) {
    e.preventDefault();
    const targetTh = e.currentTarget;
    if (targetTh !== dragSourceEl) {
      targetTh.classList.add('drag-over');
      
      // Sonido suave de hover (opcional, muy sutil)
      // Solo si el usuario ha interactuado previamente
    }
  }

  function handleDragLeave(e) {
    const targetTh = e.currentTarget;
    // Verificar que realmente salió del elemento (no entró a un hijo)
    if (!targetTh.contains(e.relatedTarget)) {
      targetTh.classList.remove('drag-over');
      delete targetTh.dataset.dropPosition;
    }
  }

  function handleDragEnd(e) {
    // Limpiar todos los estados
    document.querySelectorAll('#creditorsHeaderRow th').forEach(th => {
      th.classList.remove('dragging', 'drag-over');
      delete th.dataset.dropPosition;
    });
    draggedCol = null;
    dragSourceEl = null;
  }

  function handleDrop(e) {
    e.preventDefault();
    const targetTh = e.currentTarget;
    targetTh.classList.remove('drag-over');
    
    const targetCol = targetTh.dataset.column;
    if (!draggedCol || draggedCol === targetCol) {
      handleDragEnd(e);
      return;
    }
    
    // Calcular índices
    const fromIndex = columnOrder.indexOf(draggedCol);
    let toIndex = columnOrder.indexOf(targetCol);
    
    // Ajustar según posición del cursor (antes o después del target)
    const dropPosition = targetTh.dataset.dropPosition;
    if (dropPosition === 'after' && fromIndex < toIndex) {
      toIndex++;
    } else if (dropPosition === 'before' && fromIndex > toIndex) {
      toIndex--;
    }
    
    // Reordenar array
    columnOrder.splice(fromIndex, 1);
    columnOrder.splice(toIndex, 0, draggedCol);
    
    // Guardar preferencia
    localStorage.setItem('creditorsColumnOrder', JSON.stringify(columnOrder));
    
    // Feedback de éxito
    if (navigator.vibrate) {
      navigator.vibrate([20, 30, 20]);
    }
    
    // Animar el cambio
    animateColumnReorder(fromIndex, toIndex, () => {
      renderTableHeader();
      renderSaved();
      
      // Animación de entrada suave
      requestAnimationFrame(() => {
        const headers = document.querySelectorAll('#creditorsHeaderRow th');
        headers.forEach((th, i) => {
          th.style.opacity = '0';
          th.style.transform = 'translateY(-5px)';
          setTimeout(() => {
            th.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            th.style.opacity = '1';
            th.style.transform = 'translateY(0)';
          }, i * 30);
        });
      });
    });
  }

  function animateColumnReorder(fromIndex, toIndex, callback) {
    // Animación fluida del reordenamiento
    const tbody = document.getElementById('creditorsSavedBody');
    if (!tbody || !tbody.children.length) {
      callback();
      return;
    }
    
    // Aplicar transición a todas las celdas
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      cells.forEach(cell => {
        cell.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease';
      });
    });
    
    // Ejecutar callback después de la transición
    setTimeout(callback, 50);
  }

  function renderSaved() {
    const tbody = document.getElementById('creditorsSavedBody');
    if (!tbody) return;

    // Asegurar que el header esté renderizado
    renderTableHeader();

    if (!currentCreditors.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="12" class="empty-cell">
            <div class="creditors-empty-status">
              <span class="status-text" id="creditorsStatus">Sube reportes de crédito desde Archivos para extraer deudas automáticamente.</span>
            </div>
          </td>
        </tr>
      `;
      updateSummary();
      return;
    }

    tbody.innerHTML = currentCreditors.map((entry, index) => renderRowOrdered(entry, index)).join('');
    updateSummary();

    tbody.querySelectorAll('.row-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('click', handleToggle);
    });

    tbody.querySelectorAll('td.col-checkbox').forEach((cell) => {
      cell.addEventListener('click', (event) => {
        if (event.target.closest('.row-checkbox')) return;
        const checkbox = cell.querySelector('.row-checkbox');
        if (!checkbox) return;
        checkbox.click();
      });
    });

    tbody.querySelectorAll('.btn-delete').forEach((button) => {
      button.addEventListener('click', handleDelete);
    });
  }

  function renderRowOrdered(entry, index) {
    const partyLabel = getPartyLabel(entry.debtor_party || entry.debtorParty);
    const partyClass = getPartyClass(entry.debtor_party || entry.debtorParty);
    const isActive = isCreditorEntryActive(entry);
    const rawIncluded = entry.is_included !== false;
    const isIncluded = isActive && rawIncluded;
    const checkbox = `<button type="button" class="row-checkbox ${isIncluded ? 'is-checked' : ''}" data-id="${entry.id}" aria-label="${isActive ? 'Incluir deuda' : 'Cuenta coapp desactivada'}" aria-pressed="${isIncluded ? 'true' : 'false'}" ${isActive ? '' : 'disabled'}></button>`;
    const deleteBtn = `<button class="btn-delete" data-id="${entry.id}" ${isActive ? '' : 'disabled title="Cuenta coapp desactivada por toggle"'}>×</button>`;
    
    const cells = {
      checkbox: `<td class="col-checkbox">${checkbox}</td>`,
      num: `<td class="col-num">${index + 1}</td>`,
      name: `<td class="col-name" title="${escapeHtml(entry.creditor_name || entry.creditorName || '')}"><span class="creditor-name">${escapeHtml(truncate(entry.creditor_name || entry.creditorName || '-', 28))}</span></td>`,
      debt: `<td class="col-debt">${formatCurrency(entry.debt_amount || entry.debtAmount || 0)}</td>`,
      party: `<td class="col-party">${partyLabel ? `<span class="badge ${partyClass}">${escapeHtml(partyLabel)}</span>` : '-'}</td>`,
      account: `<td class="col-account">${entry.account_number || entry.accountNumber ? `<span class="account-num">${escapeHtml(entry.account_number || entry.accountNumber)}</span><button class="btn-copy-account" data-account="${escapeHtml(entry.account_number || entry.accountNumber)}" title="Copiar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>` : '-'}</td>`,
      resp: `<td class="col-resp">${entry.responsibility ? `<span class="badge badge-resp">${escapeHtml(entry.responsibility)}</span>` : '-'}</td>`,
      status: `<td class="col-status">${entry.account_status || entry.accountStatus ? getStatusBadge(entry.account_status || entry.accountStatus) : '-'}</td>`,
      type: `<td class="col-type">${entry.account_type || entry.accountType ? `<span class="badge badge-type">${escapeHtml(truncate(entry.account_type || entry.accountType, 12))}</span>` : '-'}</td>`,
      months: `<td class="col-months">${entry.months_reviewed || entry.monthsReviewed ? `<span class="badge badge-months">${entry.months_reviewed || entry.monthsReviewed}</span>` : '-'}</td>`,
      pastDue: `<td class="col-past-due">${normalizeMoney(entry.past_due || entry.pastDue) > 0 ? formatCurrency(entry.past_due || entry.pastDue) : '-'}</td>`,
      actions: `<td class="col-actions">${deleteBtn}</td>`
    };
    
    return `<tr class="${isIncluded ? 'included' : 'excluded'} ${isActive ? '' : 'coapp-inactive'}">${columnOrder.map(key => cells[key]).join('')}</tr>`;
  }
  async function loadSaved(options = {}) {
    const { silent = false } = options;

    try {
      const leadId = window.currentLeadId;
      if (!leadId) return;

      const response = await fetch(`/api/leads/${leadId}/creditors`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'No se pudieron cargar los creditors.');
      }

      setFicoScores(readStoredFicoScores(leadId), { persist: false });
      currentCreditors = Array.isArray(data.creditors) ? data.creditors : [];
      renderSaved();

      if (!silent) {
        setStatus(
          currentCreditors.length
            ? `Creditors cargados: ${currentCreditors.length}`
            : 'Sin creditors guardados para este lead.',
          'success'
        );
      }
    } catch (error) {
      console.error('Error cargando creditors:', error);
      if (!silent) {
        setStatus(error.message || 'Error cargando creditors.', 'error');
      }
    }
  }

  async function importEntries(entries) {
    if (!entries.length) return { createdCount: 0, skippedCount: 0 };

    const leadId = window.currentLeadId;
    if (!leadId) throw new Error('No hay lead seleccionado.');

    const response = await fetch(`/api/leads/${leadId}/creditors/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries, replaceExisting: false })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || 'No se pudieron importar los creditors.');
    }

    await loadSaved({ silent: true });
    syncCalculatorFromIncludedDebt({ persist: true, toast: false });
    return data;
  }

  function isImageReportFile(fileName, mimeType) {
    const name = String(fileName || '').toLowerCase();
    const mime = String(mimeType || '').toLowerCase();
    return mime.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(name);
  }

  async function createOcrWorker() {
    const ocr = window.Tesseract;
    if (!ocr || typeof ocr.createWorker !== 'function') {
      throw new Error('OCR no disponible en este navegador.');
    }

    return ocr.createWorker('eng', 1, {
      workerPath: 'vendor/worker.min.js'
    });
  }

  async function extractPdfPageWithOCR(page, worker) {
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    await page.render({ canvasContext: ctx, viewport }).promise;
    const result = await worker.recognize(canvas);
    canvas.width = 1;
    canvas.height = 1;

    return String(result?.data?.text || '');
  }

  async function extractImageWithOCR(file) {
    const worker = await createOcrWorker();
    try {
      const result = await worker.recognize(file);
      return String(result?.data?.text || '');
    } finally {
      await worker.terminate().catch(() => {});
    }
  }

  async function extractPdfNativeText(page) {
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });
    const pageWidth = Math.max(1, Number(viewport?.width || 1000));
    const rowTolerance = 2.5;
    const columnGapThreshold = Math.max(70, pageWidth * 0.16);
    const wordGapThreshold = Math.max(8, pageWidth * 0.012);

    const rows = [];

    content.items.forEach((item) => {
      const str = String(item?.str || '').replace(/\s+/g, ' ').trim();
      if (!str) return;

      const x = Number(item?.transform?.[4] || 0);
      const y = Number(item?.transform?.[5] || 0);
      const width = Number(item?.width || 0);

      let row = null;
      for (const candidate of rows) {
        if (Math.abs(candidate.y - y) <= rowTolerance) {
          row = candidate;
          break;
        }
      }

      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }

      row.items.push({ x, y, width, str });
    });

    rows.sort((a, b) => b.y - a.y);

    const lines = [];
    for (const row of rows) {
      const items = row.items.sort((a, b) => a.x - b.x);
      if (!items.length) continue;

      const columns = [[]];
      let previous = null;

      for (const token of items) {
        if (previous) {
          const previousEndX = previous.x + Math.max(previous.width, previous.str.length * 4);
          const gap = token.x - previousEndX;

          if (gap > columnGapThreshold) {
            columns.push([]);
          } else if (gap > wordGapThreshold) {
            columns[columns.length - 1].push(' ');
          }
        }

        columns[columns.length - 1].push(token.str);
        previous = token;
      }

      columns.forEach((columnTokens) => {
        const line = columnTokens.join('').replace(/\s+/g, ' ').trim();
        if (line) lines.push(line);
      });
    }

    return lines.join('\n');
  }

  async function extractPDF(file, options = {}) {
    const pdfjs = window.pdfjsLib;
    if (!pdfjs) throw new Error('PDF.js no disponible.');

    pdfjs.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

    const buffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;

    let text = '';
    let worker = null;
    let ocrActive = false;

    try {
      for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
        const page = await pdf.getPage(pageIndex);
        let pageText = await extractPdfNativeText(page);
        const nativeLength = pageText.replace(/\s+/g, ' ').trim().length;

        if (nativeLength < OCR_MIN_PAGE_TEXT_LENGTH) {
          try {
            if (!worker) {
              worker = await createOcrWorker();
              if (!ocrActive && typeof options.onOcrActivated === 'function') {
                options.onOcrActivated();
              }
              ocrActive = true;
            }

            const ocrText = await extractPdfPageWithOCR(page, worker);
            if (ocrText.replace(/\s+/g, ' ').trim().length > nativeLength) {
              pageText = ocrText;
            }
          } catch (_ocrError) {
            // Si OCR falla, conservamos el texto nativo de PDF.
          }
        }

        text += `${pageText}\n--- PAGE BREAK ---\n`;
      }
    } finally {
      if (worker) {
        await worker.terminate().catch(() => {});
      }
    }

    return text;
  }

  async function processCreditReportUpload(file, storedFile = {}) {
    const parseRunId = ++creditorsParseRunId;
    const sourceName = file?.name || storedFile?.name || 'Reporte';
    const sourceType = file?.type || storedFile?.type || '';
    const party = normalizeDebtorParty(storedFile.creditReportParty || storedFile.debtorParty);

    setStatus(`Analizando ${sourceName}...`, 'loading');

    let text = '';
    if (/\.pdf$/i.test(sourceName)) {
      text = await extractPDF(file, {
        onOcrActivated: () => {
          setStatus(`Analizando ${sourceName} con OCR...`, 'loading');
        }
      });
    } else if (/\.txt$/i.test(sourceName)) {
      text = await file.text();
    } else if (isImageReportFile(sourceName, sourceType)) {
      setStatus(`Analizando ${sourceName} con OCR...`, 'loading');
      text = await extractImageWithOCR(file);
    } else {
      setStatus(`Archivo no compatible para extracción: ${sourceName}`, 'error');
      return;
    }

    if (parseRunId !== creditorsParseRunId) return;

    const extractedFicoScore = extractHighestCreditScore(text);
    if (extractedFicoScore !== null) {
      setFicoScore(extractedFicoScore, { persist: true, preferHigher: true, party });
    }

    let parsed = [];
    let parsedWithAI = false;

    try {
      parsed = await parseCreditReportWithAI(text, sourceName, party);
      parsedWithAI = parsed.length > 0;
    } catch (aiError) {
      // Fallback silencioso al parser local.
    }

    if (!parsed.length) {
      parsed = parseCreditReport(text, sourceName)
        .filter((entry) => normalizeMoney(entry.debtAmount) > 0)
        .map((entry) => normalizeExtractedEntry(entry, sourceName, party));
    }

    if (parseRunId !== creditorsParseRunId) return;

    if (!parsed.length) {
      setStatus(`No se detectaron deudas útiles en ${sourceName}.`, 'error');
      return;
    }

    const result = await importEntries(parsed);
    setStatus(
      `Importado ${sourceName}: ${result.createdCount || 0} cuentas (${result.skippedCount || 0} duplicadas)${parsedWithAI ? ' [IA]' : ''}.`,
      'success'
    );
  }

  async function handleLeadFileUploaded(event) {
    const detail = event?.detail || {};
    const leadId = Number(detail.leadId || 0);
    const currentLeadId = Number(window.currentLeadId || 0);
    const storedFile = detail.storedFile || {};
    const category = String(storedFile.documentCategory || '').toLowerCase();

    if (!leadId || !currentLeadId || leadId !== currentLeadId) return;
    if (category !== 'credit_report') return;
    updateSummary();
    if (!detail.file) {
      setStatus('No fue posible leer el archivo recién subido.', 'error');
      return;
    }

    try {
      await processCreditReportUpload(detail.file, storedFile);
    } catch (error) {
      console.error('Error procesando reporte de crédito:', error);
      setStatus(error.message || 'Error procesando reporte de crédito.', 'error');
    }
  }

  function handleLeadFileDeleted(event) {
    const detail = event?.detail || {};
    const leadId = Number(detail.leadId || 0);
    const currentLeadId = Number(window.currentLeadId || 0);
    const deletedFile = detail.deletedFile || {};
    const category = String(deletedFile.documentCategory || '').toLowerCase();

    if (!leadId || !currentLeadId || leadId !== currentLeadId) return;
    if (category && category !== 'credit_report') return;

    updateSummary();
  }

  async function handleToggle(event) {
    const creditorId = event?.target?.dataset?.id;
    if (!creditorId) return;

    const creditor = currentCreditors.find((entry) => String(entry.id) === String(creditorId));
    if (!creditor) return;
    if (!isCreditorEntryActive(creditor)) {
      setStatus('Cuenta coapp desactivada por toggle.', 'neutral');
      return;
    }

    try {
      const leadId = window.currentLeadId;
      const response = await fetch(`/api/leads/${leadId}/creditors/${creditorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isIncluded: !creditor.is_included })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'No se pudo actualizar inclusion.');
      }

      creditor.is_included = !creditor.is_included;
      renderSaved();
      syncCalculatorFromIncludedDebt({ persist: true, toast: false });
    } catch (error) {
      console.error('Error cambiando inclusion:', error);
      setStatus(error.message || 'No se pudo actualizar la cuenta.', 'error');
    }
  }

  async function handleDelete(event) {
    const creditorId = event?.target?.dataset?.id;
    if (!creditorId) return;
    const creditor = currentCreditors.find((entry) => String(entry.id) === String(creditorId));
    if (!creditor) return;
    if (!isCreditorEntryActive(creditor)) {
      setStatus('Cuenta coapp desactivada por toggle.', 'neutral');
      return;
    }
    if (!confirm('¿Eliminar creditor?')) return;

    try {
      const leadId = window.currentLeadId;
      const response = await fetch(`/api/leads/${leadId}/creditors/${creditorId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'No se pudo eliminar el creditor.');
      }

      await loadSaved({ silent: true });
      syncCalculatorFromIncludedDebt({ persist: true, toast: false });
      setStatus('Creditor eliminado.', 'success');
    } catch (error) {
      console.error('Error eliminando creditor:', error);
      setStatus(error.message || 'Error eliminando creditor.', 'error');
    }
  }

  function syncCalculatorFromIncludedDebt(options = {}) {
    const { persist = true, toast = false } = options;
    const totalIncludedDebt = getActiveCreditors(currentCreditors)
      .filter((entry) => entry.is_included !== false)
      .reduce((sum, entry) => sum + normalizeMoney(entry.debt_amount || entry.debtAmount), 0);

    const totalDebtInput = document.getElementById('calcTotalDebt');
    if (!totalDebtInput) return false;

    totalDebtInput.value = formatMoneyInput(totalIncludedDebt);
    if (typeof window.calculateAll === 'function') {
      window.calculateAll();
    }

    if (persist && typeof window.queuePersistCalculatorConfig === 'function') {
      window.queuePersistCalculatorConfig();
    }

    if (toast) {
      setStatus(`Total aplicado a calculadora: ${formatCurrency(totalIncludedDebt)}`, 'success');
    }

    return true;
  }

  function applyTotalToCalculator() {
    const synced = syncCalculatorFromIncludedDebt({ persist: true, toast: true });
    if (!synced) {
      setStatus('No se encontro calcTotalDebt para aplicar el total.', 'error');
    }
  }

  function handleCoappIncludeToggleChanged() {
    renderSaved();
  }

  function init() {
    if (creditorsSectionInitialized) return;
    creditorsSectionInitialized = true;
    window.__creditorsPipeline = 'redesign';

    window.addEventListener('lead:file-uploaded', handleLeadFileUploaded);
    window.addEventListener('lead:file-deleted', handleLeadFileDeleted);
    window.addEventListener('lead:coapp-include-toggle-changed', handleCoappIncludeToggleChanged);

    const leadId = Number(window.currentLeadId || 0);
    setFicoScores(readStoredFicoScores(leadId), { persist: false });

    const applyTotalBtn = document.getElementById('creditorsApplyTotalBtn');
    if (applyTotalBtn) {
      applyTotalBtn.addEventListener('click', applyTotalToCalculator);
    }

    // Botones Copiar Cuenta (delegación de eventos)
    const savedBody = document.getElementById('creditorsSavedBody');
    if (savedBody) {
      savedBody.addEventListener('click', async (e) => {
        const copyBtn = e.target.closest('.btn-copy-account');
        if (!copyBtn) return;
        
        const account = copyBtn.dataset.account;
        if (!account) return;
        
        try {
          await navigator.clipboard.writeText(account);
          copyBtn.classList.add('copied');
          copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>';
          setStatus('Número de cuenta copiado', 'success');
          
          setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
          }, 1500);
        } catch (err) {
          setStatus('No se pudo copiar', 'error');
        }
      });
    }

    loadSaved({ silent: true });
  }

  window.initCreditorsRedesign = init;
  window.loadSavedCreditors = loadSaved;
})();


