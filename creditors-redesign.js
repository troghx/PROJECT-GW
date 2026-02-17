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
  let creditorsParseRunId = 0;
  let aiAnalyzerUnavailable = false;

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

  function getStoredLeadFiles() {
    const leadId = Number(window.currentLeadId || 0);
    if (!leadId) return [];

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

  function extractAccountNumber(line) {
    const match = line.match(/Account\s*(?:Number|#)\s*[:\s]*([A-Za-z0-9\-*X]+)/i);
    return match ? match[1].trim() : '';
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

  function extractType(line) {
    const source = String(line || '');
    if (/Term\s+Source\s+Type/i.test(source)) return '';

    const match = source.match(/(?:^|\b)Type[:\s]+([A-Za-z][A-Za-z\s/&\-]*)/i);
    if (!match) return '';

    let value = match[1].trim();
    value = value.split(/\bType\b/i)[0].trim();
    value = value.split(/\b(?:Responsibility|High\s+Balance|High\s+Credit|Monthly\s+Payment|Current\s+Payment|Amount\s+Past\s+Due|Month(?:'s|s)?\s+Reviewed)\b/i)[0].trim();
    return truncate(value, 40);
  }

  function extractResponsibility(line) {
    const match = String(line || '').match(/Responsibility[:\s]*([A-Za-z][A-Za-z\s-]*)/i);
    if (!match) return '';

    let value = match[1].trim();
    value = value.split(/\b(?:Type|Month(?:'s|s)?\s+Reviewed|Remarks|Account\s+Status)\b/i)[0].trim();
    const lowered = value.toLowerCase();
    if (lowered.includes('individual')) return 'Individual';
    if (lowered.includes('joint')) return 'Joint';
    if (lowered.includes('authorized')) return 'Authorized';
    return truncate(value, 15);
  }

  function extractMonthsReviewed(line) {
    const match = line.match(/Month(?:'s|s)?\s*Reviewed[:\s]*(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  function extractBalance(line) {
    const patterns = [
      /(?:Current\s+)?Balance[:\s]*\$?([0-9,]+\.?\d*)/i,
      /Unpaid\s+Balance[:\s]*\$?([0-9,]+\.?\d*)/i,
      /Payoff(?:\s+Balance|\s+Amount)?[:\s]*\$?([0-9,]+\.?\d*)/i
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

  function finalizeCreditor(creditor) {
    creditor.creditorName = creditor.creditorName.replace(/\s+/g, ' ').trim();

    if (creditor.debtAmount === 0 && creditor.pastDue > 0) {
      creditor.debtAmount = creditor.pastDue;
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
      /(?:in good standing|voluntary surrender|you['’]re currently using|you['’]ve made|you have|hide details|days past due|no data available|credit score significantly|credit score|\blimit\b|account|balance|credit limit|highest balance|high balance|high credit|monthly payment|payment history|terms count|open date|last activity|report date|account summary|account details|current payment|month(?:'s|s)? reviewed|remarks|collection agency|creditor information|public records|inquiries|personal info|download pdf|bureau|overview)/i.test(value) ||
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

  function findCreditorNameAround(lines, accountIndex) {
    const start = Math.max(0, accountIndex - 18);
    let bestCandidate = '';
    let bestScore = -Infinity;

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
      }
    }

    if (bestCandidate) {
      return bestCandidate;
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

    for (let i = start; i <= end; i += 1) {
      const line = lines[i];
      if (/^balance:/i.test(line)) {
        hasExplicitBalanceLabel = true;
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
        const firstAmount = normalizeMoney(line.match(/([0-9][0-9,]*(?:\.[0-9]{1,2})?)/)?.[1] || 0);
        if (Number.isFinite(firstAmount) && firstAmount >= 0) {
          return firstAmount;
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

  function isDuplicateCreditorEntry(entry, existingEntries) {
    const normalizeKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizeDigits = (value) => String(value || '').replace(/[^0-9]/g, '');
    const isMasked = (value) => /[x*]/i.test(String(value || ''));

    const nameKey = normalizeKey(entry.creditorName);
    const entryDebt = normalizeMoney(entry.debtAmount);
    const entryStatus = String(entry.accountStatus || '').toLowerCase().trim();
    const entryDigits = normalizeDigits(entry.accountNumber);
    const entryMasked = isMasked(entry.accountNumber);

    return existingEntries.some((prev) => {
      if (normalizeKey(prev.creditorName) !== nameKey) return false;
      if (Math.abs(normalizeMoney(prev.debtAmount) - entryDebt) > 0.01) return false;

      const prevStatus = String(prev.accountStatus || '').toLowerCase().trim();
      if (prevStatus && entryStatus && prevStatus !== entryStatus) return false;

      const prevDigits = normalizeDigits(prev.accountNumber);
      const prevMasked = isMasked(prev.accountNumber);

      if (!entryDigits || !prevDigits) return true;
      if (entryDigits === prevDigits) return true;

      const entryLast4 = entryDigits.slice(-4);
      const prevLast4 = prevDigits.slice(-4);
      if (entryLast4 && prevLast4 && entryLast4 === prevLast4) return true;

      if (entryMasked || prevMasked) {
        const entryPrefix = entryDigits.slice(0, 6);
        const prevPrefix = prevDigits.slice(0, 6);
        if (entryPrefix && prevPrefix && entryPrefix === prevPrefix) return true;
        if (entryDigits.includes(prevDigits) || prevDigits.includes(entryDigits)) return true;
      }

      return false;
    });
  }

  function parseCreditReport(text, source = 'Reporte') {
    const lines = buildCandidateLines(text);
    const creditors = [];
    const accountIndexes = [];

    for (let i = 0; i < lines.length; i += 1) {
      if (!/Account\s*(?:Number|#)\b/i.test(lines[i])) continue;
      const accountNumber = extractAccountNumber(lines[i]);
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

      for (let cursor = accountIndex + 10; cursor <= blockEnd; cursor += 1) {
        const line = String(lines[cursor] || '').trim();
        if (/^(?:Credit cards|Other|Collections|Installment|Auto|Mortgage|Public records|Hard inquiries|Inquiries)$/i.test(line) || /^Total count\b/i.test(line)) {
          blockEnd = cursor - 1;
          break;
        }
      }

      const blockLines = lines.slice(blockStart, blockEnd + 1);

      const creditorName = findCreditorNameAround(lines, accountIndex);
      if (!creditorName) continue;

      let accountNumber = '';
      const directAccountNumber = extractAccountNumber(lines[accountIndex]);
      if (directAccountNumber) {
        accountNumber = directAccountNumber;
      } else {
        for (const line of blockLines) {
          const candidate = extractAccountNumber(line);
          if (candidate) {
            accountNumber = candidate;
            break;
          }
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
        monthsReviewed: null,
        debtAmount: 0,
        pastDue: 0,
        isIncluded: true
      };

      let waitingBalanceValues = false;
      let hasExplicitDebtSignal = false;

      for (const line of blockLines) {
        if (!creditor.accountStatus) {
          const status = extractStatus(line);
          if (status) creditor.accountStatus = status;
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
          waitingBalanceValues = true;
          continue;
        }

        if (waitingBalanceValues) {
          let nearValues = extractCurrencyValuesIncludingZero(line);
          if (!nearValues.length && /\d+\.\d{2}/.test(line) && !/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(line)) {
            nearValues = extractLooseMoneyValues(line);
          }

          if (nearValues.length) {
            creditor.debtAmount = Math.max(creditor.debtAmount, nearValues[0]);
            hasExplicitDebtSignal = true;
            waitingBalanceValues = false;
          }
        }

        if (/credit limit|highest balance|high balance|high credit|monthly payment|term source|terms count|payment history|times 30\/60\/90/i.test(line)) {
          continue;
        }

        const balance = extractBalance(line);
        if (balance > creditor.debtAmount) {
          creditor.debtAmount = balance;
          hasExplicitDebtSignal = true;
        }
      }

      const headerDebt = extractHeaderDebtNearAccount(lines, accountIndex);
      if (!hasExplicitDebtSignal && headerDebt > creditor.debtAmount) {
        creditor.debtAmount = headerDebt;
      }

      finalizeCreditor(creditor);
      if (!creditor.isIncluded) continue;
      if (isDuplicateCreditorEntry(creditor, creditors)) continue;
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

    return {
      sourceReport: entry.sourceReport || entry.source_report || sourceName,
      creditorName: String(entry.creditorName || entry.creditor_name || entry.creditor || entry.name || '').trim(),
      accountNumber: String(entry.accountNumber || entry.account_number || '').trim(),
      accountStatus: String(entry.accountStatus || entry.account_status || '').trim(),
      accountType: String(entry.accountType || entry.account_type || '').trim(),
      responsibility: String(entry.responsibility || entry.responsability || '').trim(),
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
    const checkbox = `<input type="checkbox" class="row-checkbox" ${isIncluded ? 'checked' : ''} data-id="${entry.id || ''}">`;
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
        <td class="col-account">${escapeHtml(entry.account_number || entry.accountNumber || '-')}</td>
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
    let totalDebt = 0;
    let includedDebt = 0;
    let pastDueTotal = 0;
    let applicantDebt = 0;
    let coappDebt = 0;

    currentCreditors.forEach((entry) => {
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
    const elApplicant = document.getElementById('creditorsApplicantDebt');
    const elCoapp = document.getElementById('creditorsCoappDebt');
    const applicantCard = document.getElementById('creditorsApplicantCard');
    const coappCard = document.getElementById('creditorsCoappCard');

    if (elTotal) elTotal.textContent = formatCurrency(totalDebt);
    if (elIncluded) elIncluded.textContent = formatCurrency(includedDebt);
    if (elCount) elCount.textContent = String(currentCreditors.length);
    if (elPastDue) elPastDue.textContent = formatCurrency(pastDueTotal);
    if (elApplicant) elApplicant.textContent = formatCurrency(applicantDebt);
    if (elCoapp) elCoapp.textContent = formatCurrency(coappDebt);

    const coappContextActive = coappDebt > 0 || hasCreditReportForParty('coapp');
    const showApplicantCard = coappContextActive;
    const showCoappCard = coappContextActive;
    if (applicantCard) {
      applicantCard.hidden = !showApplicantCard;
      applicantCard.classList.toggle('hidden', !showApplicantCard);
    }
    if (coappCard) {
      coappCard.hidden = !showCoappCard;
      coappCard.classList.toggle('hidden', !showCoappCard);
    }
  }

  function renderSaved() {
    const tbody = document.getElementById('creditorsSavedBody');
    if (!tbody) return;

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

    tbody.innerHTML = currentCreditors.map((entry, index) => renderRow(entry, index)).join('');
    updateSummary();

    tbody.querySelectorAll('.row-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('change', handleToggle);
    });

    tbody.querySelectorAll('.btn-delete').forEach((button) => {
      button.addEventListener('click', handleDelete);
    });
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
        const content = await page.getTextContent();
        let pageText = content.items.map((item) => item.str).join(' ');
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

        text += `${pageText}\n`;
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

    try {
      const leadId = window.currentLeadId;
      await fetch(`/api/leads/${leadId}/creditors/${creditorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isIncluded: !creditor.is_included })
      });

      creditor.is_included = !creditor.is_included;
      renderSaved();
    } catch (error) {
      console.error('Error cambiando inclusion:', error);
      setStatus('No se pudo actualizar la cuenta.', 'error');
    }
  }

  async function handleDelete(event) {
    const creditorId = event?.target?.dataset?.id;
    if (!creditorId) return;
    if (!confirm('¿Eliminar creditor?')) return;

    try {
      const leadId = window.currentLeadId;
      const response = await fetch(`/api/leads/${leadId}/creditors/${creditorId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'No se pudo eliminar el creditor.');
      }

      await loadSaved({ silent: true });
      setStatus('Creditor eliminado.', 'success');
    } catch (error) {
      console.error('Error eliminando creditor:', error);
      setStatus(error.message || 'Error eliminando creditor.', 'error');
    }
  }

  function applyTotalToCalculator() {
    const totalIncludedDebt = currentCreditors
      .filter((entry) => entry.is_included !== false)
      .reduce((sum, entry) => sum + normalizeMoney(entry.debt_amount || entry.debtAmount), 0);

    const totalDebtInput = document.getElementById('calcTotalDebt');
    if (!totalDebtInput) {
      setStatus('No se encontró calcTotalDebt para aplicar el total.', 'error');
      return;
    }

    totalDebtInput.value = Number(totalIncludedDebt.toFixed(2)).toFixed(2);
    if (typeof window.calculateAll === 'function') {
      window.calculateAll();
    }

    if (typeof window.queuePersistCalculatorConfig === 'function') {
      window.queuePersistCalculatorConfig();
    }

    setStatus(`Total aplicado a calculadora: ${formatCurrency(totalIncludedDebt)}`, 'success');
  }

  function init() {
    if (creditorsSectionInitialized) return;
    creditorsSectionInitialized = true;

    window.addEventListener('lead:file-uploaded', handleLeadFileUploaded);
    window.addEventListener('lead:file-deleted', handleLeadFileDeleted);

    const applyTotalBtn = document.getElementById('creditorsApplyTotalBtn');
    if (applyTotalBtn) {
      applyTotalBtn.addEventListener('click', applyTotalToCalculator);
    }

    loadSaved({ silent: true });
  }

  window.initCreditorsRedesign = init;
  window.loadSavedCreditors = loadSaved;
})();
