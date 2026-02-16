/**
 * Servidor MOCK para desarrollo sin PostgreSQL
 * Almacena datos en memoria
 */
const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = path.join(__dirname, '..');
const ADMIN_USER = 'admin';
const ADMIN_PASSWORD = '1234';

// Base de datos en memoria
const db = {
  leads: [],
  leadNotes: [],
  noteTemplates: [],
  nextCaseId: 1000,
  nextLeadNoteId: 1,
  nextNoteTemplateId: 1
};

// Lista de estados Green (los demas son Red)
const GREEN_STATES = [
  'MO', 'VA', 'CA', 'AR', 'TX', 'NY', 'FL', 'MS', 'LA', 'NC',
  'NM', 'AL', 'TN', 'AZ', 'OK', 'MI', 'NE', 'MN', 'NV', 'ND',
  'IA', 'AK', 'SD'
];
const NOTE_COLOR_TAGS = new Set(['yellow', 'red', 'green', 'blue', 'gray']);

const VALID_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
]);
const ZIP_LOOKUP_TIMEOUT_MS = 5000;
const ZIP_LOOKUP_CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const zipLookupCache = new Map();

function cleanText(value, maxLength) {
  const text = String(value || '').trim();
  return text.slice(0, maxLength);
}

function toNullableText(value, maxLength) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function pickFirstDefined(source, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key];
    }
  }
  return undefined;
}

function isValidISODate(value) {
  if (typeof value !== 'string') return false;
  const iso = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso;
}

function normalizeStateCode(value) {
  if (value === undefined || value === null) return { ok: true, value: null };

  const raw = String(value).trim();
  if (!raw) return { ok: true, value: null };

  const upper = raw.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper) && VALID_STATE_CODES.has(upper)) {
    return { ok: true, value: upper };
  }

  const match = upper.match(/\(([A-Z]{2})\)\s*$/);
  if (match && VALID_STATE_CODES.has(match[1])) {
    return { ok: true, value: match[1] };
  }

  return { ok: false, message: 'state/stateCode debe ser un estado valido de USA (ej: CA).' };
}

function normalizeZipCode(value, fieldName = 'zipCode') {
  const normalizedZip = toNullableText(value, 10);
  if (normalizedZip && !/^\d{5}(-\d{4})?$/.test(normalizedZip)) {
    return { ok: false, message: `${fieldName} debe tener formato 12345 o 12345-6789.` };
  }
  return { ok: true, value: normalizedZip };
}

function normalizeSsn(value) {
  if (value === undefined || value === null) return { ok: true, value: null };

  const raw = String(value).trim();
  if (!raw || raw === '***-**-****') {
    return { ok: true, value: null };
  }

  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 9) {
    return { ok: false, message: 'ssn debe tener 9 digitos (ej: 123-45-6789).' };
  }

  return { ok: true, value: `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` };
}

function normalizeBoolean(value, fieldName) {
  if (typeof value === 'boolean') return { ok: true, value };
  if (typeof value === 'number' && (value === 0 || value === 1)) return { ok: true, value: value === 1 };
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return { ok: true, value: false };
    if (['true', '1', 'yes', 'si', 'on'].includes(normalized)) return { ok: true, value: true };
    if (['false', '0', 'no', 'off'].includes(normalized)) return { ok: true, value: false };
  }
  return { ok: false, message: `${fieldName} debe ser booleano.` };
}

function normalizeMoney(value, fieldName) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { ok: true, value: 0 };
  }
  const normalized = Number(String(value).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(normalized) || normalized < 0) {
    return { ok: false, message: `${fieldName} debe ser un numero valido mayor o igual a 0.` };
  }
  return { ok: true, value: Number(normalized.toFixed(2)) };
}

function normalizePercent(value, fieldName) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { ok: true, value: 0 };
  }
  const normalized = Number(String(value).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 100) {
    return { ok: false, message: `${fieldName} debe estar entre 0 y 100.` };
  }
  return { ok: true, value: Number(normalized.toFixed(2)) };
}

function normalizeMonths(value, fieldName) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { ok: true, value: 48 };
  }
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 6 || normalized > 120) {
    return { ok: false, message: `${fieldName} debe ser un entero entre 6 y 120.` };
  }
  return { ok: true, value: normalized };
}

function normalizeRelatedLeadId(value, fieldName = 'relatedLeadId') {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { ok: true, value: null };
  }

  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return { ok: false, message: `${fieldName} debe ser un entero positivo.` };
  }

  return { ok: true, value: normalized };
}

function normalizeTemplateName(value, fieldName = 'name') {
  const normalized = cleanText(value, 120);
  if (!normalized) {
    return { ok: false, message: `${fieldName} es obligatorio.` };
  }
  return { ok: true, value: normalized };
}

function normalizeTemplateContent(value, fieldName = 'content') {
  if (value === undefined || value === null) {
    return { ok: false, message: `${fieldName} es obligatorio.` };
  }
  const normalized = String(value).trim().slice(0, 5000);
  if (!normalized) {
    return { ok: false, message: `${fieldName} es obligatorio.` };
  }
  return { ok: true, value: normalized };
}

function normalizeActorUsername(value, fieldName = 'username') {
  const normalized = cleanText(value, 120);
  if (!normalized) {
    return { ok: false, message: `${fieldName} es obligatorio.` };
  }
  return { ok: true, value: normalized };
}

function normalizeNoteColorTag(value, fieldName = 'colorTag') {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { ok: true, value: 'yellow' };
  }

  const normalized = String(value).trim().toLowerCase();
  if (!NOTE_COLOR_TAGS.has(normalized)) {
    return { ok: false, message: `${fieldName} debe ser uno de: yellow, red, green, blue, gray.` };
  }

  return { ok: true, value: normalized };
}

function resolveRequestUsername(req, fallback = 'admin') {
  const fromHeader = req.headers?.['x-user'];
  const fromBody = req.body?.username;
  const fromQuery = req.query?.username;
  const candidate = [fromHeader, fromBody, fromQuery]
    .map((value) => cleanText(value, 120))
    .find((value) => Boolean(value));
  return candidate || fallback;
}

async function fetchZipLocationFromProvider(baseZip) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ZIP_LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(`https://api.zippopotam.us/us/${baseZip}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    if (response.status === 404) {
      return { ok: false, status: 404, message: 'ZIP no encontrado.' };
    }

    if (!response.ok) {
      return { ok: false, status: 502, message: 'No se pudo consultar el proveedor de ZIP.' };
    }

    const payload = await response.json();
    const place = Array.isArray(payload?.places) ? payload.places[0] : null;
    const city = cleanText(place?.['place name'], 120);
    const stateCode = String(place?.['state abbreviation'] || '').trim().toUpperCase();

    if (!city || !VALID_STATE_CODES.has(stateCode)) {
      return { ok: false, status: 422, message: 'El ZIP no devolvio ciudad/estado valido.' };
    }

    return { ok: true, value: { city, stateCode } };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, status: 504, message: 'Tiempo agotado al consultar ZIP.' };
    }
    return { ok: false, status: 502, message: 'Error consultando servicio de ZIP.' };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolveZipLocation(zipCode) {
  const normalized = normalizeZipCode(zipCode, 'zip');
  if (!normalized.ok) return normalized;
  if (!normalized.value) return { ok: false, status: 400, message: 'zip es obligatorio.' };

  const baseZip = normalized.value.slice(0, 5);
  const now = Date.now();
  const cached = zipLookupCache.get(baseZip);

  if (cached && cached.expiresAt > now) {
    return {
      ok: true,
      value: {
        zipCode: normalized.value,
        city: cached.value.city,
        stateCode: cached.value.stateCode
      }
    };
  }

  const lookup = await fetchZipLocationFromProvider(baseZip);
  if (!lookup.ok) return lookup;

  zipLookupCache.set(baseZip, {
    value: lookup.value,
    expiresAt: now + ZIP_LOOKUP_CACHE_TTL_MS
  });

  return {
    ok: true,
    value: {
      zipCode: normalized.value,
      city: lookup.value.city,
      stateCode: lookup.value.stateCode
    }
  };
}

function getPhoneDigits(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

function formatPhoneDigits(digits) {
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function normalizePhone(value, fieldName = 'telefono') {
  if (value === undefined || value === null) return { ok: true, value: null, digits: null };

  const raw = String(value).trim();
  if (!raw) return { ok: true, value: null, digits: null };

  const digits = getPhoneDigits(raw);
  if (digits.length !== 10) {
    return { ok: false, message: `${fieldName} debe tener 10 digitos (ej: 305-555-0123).` };
  }

  return { ok: true, value: formatPhoneDigits(digits), digits };
}

function parseLeadPatchBody(body = {}) {
  const changes = {};

  const fullName = pickFirstDefined(body, ['fullName', 'full_name']);
  if (fullName !== undefined) {
    const normalized = cleanText(fullName, 120);
    if (!normalized) {
      return { ok: false, message: 'fullName es obligatorio cuando se envia.' };
    }
    changes.full_name = normalized;
  }

  const coApplicantName = pickFirstDefined(body, ['coApplicantName', 'co_applicant_name']);
  if (coApplicantName !== undefined) {
    changes.co_applicant_name = toNullableText(coApplicantName, 120);
  }

  const coApplicantHomePhone = pickFirstDefined(body, ['coApplicantHomePhone', 'co_applicant_home_phone']);
  if (coApplicantHomePhone !== undefined) {
    const normalizedCoApplicantHomePhone = normalizePhone(coApplicantHomePhone, 'coApplicantHomePhone');
    if (!normalizedCoApplicantHomePhone.ok) return normalizedCoApplicantHomePhone;
    changes.co_applicant_home_phone = normalizedCoApplicantHomePhone.value;
  }

  const coApplicantCellPhone = pickFirstDefined(body, ['coApplicantCellPhone', 'co_applicant_cell_phone']);
  if (coApplicantCellPhone !== undefined) {
    const normalizedCoApplicantCellPhone = normalizePhone(coApplicantCellPhone, 'coApplicantCellPhone');
    if (!normalizedCoApplicantCellPhone.ok) return normalizedCoApplicantCellPhone;
    changes.co_applicant_cell_phone = normalizedCoApplicantCellPhone.value;
  }

  const coApplicantEmail = pickFirstDefined(body, ['coApplicantEmail', 'co_applicant_email']);
  if (coApplicantEmail !== undefined) {
    const normalizedCoApplicantEmail = toNullableText(coApplicantEmail, 160);
    if (normalizedCoApplicantEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedCoApplicantEmail)) {
      return { ok: false, message: 'coApplicantEmail no tiene un formato valido.' };
    }
    changes.co_applicant_email = normalizedCoApplicantEmail;
  }

  const coApplicantDob = pickFirstDefined(body, ['coApplicantDob', 'co_applicant_dob']);
  if (coApplicantDob !== undefined) {
    if (coApplicantDob === null || String(coApplicantDob).trim() === '') {
      changes.co_applicant_dob = null;
    } else {
      const normalizedCoApplicantDob = String(coApplicantDob).trim();
      if (!isValidISODate(normalizedCoApplicantDob)) {
        return { ok: false, message: 'coApplicantDob debe tener formato YYYY-MM-DD.' };
      }
      changes.co_applicant_dob = normalizedCoApplicantDob;
    }
  }

  const coApplicantSsn = pickFirstDefined(body, ['coApplicantSsn', 'co_applicant_ssn']);
  if (coApplicantSsn !== undefined) {
    const normalizedCoApplicantSsn = normalizeSsn(coApplicantSsn);
    if (!normalizedCoApplicantSsn.ok) return normalizedCoApplicantSsn;
    changes.co_applicant_ssn = normalizedCoApplicantSsn.value;
  }

  const coApplicantCurrentlyEmployed = pickFirstDefined(body, ['coApplicantCurrentlyEmployed', 'co_applicant_currently_employed']);
  if (coApplicantCurrentlyEmployed !== undefined) {
    changes.co_applicant_currently_employed = toNullableText(coApplicantCurrentlyEmployed, 60);
  }

  const coApplicantEmployerName = pickFirstDefined(body, ['coApplicantEmployerName', 'co_applicant_employer_name']);
  if (coApplicantEmployerName !== undefined) {
    changes.co_applicant_employer_name = toNullableText(coApplicantEmployerName, 120);
  }

  const coApplicantOccupation = pickFirstDefined(body, ['coApplicantOccupation', 'co_applicant_occupation']);
  if (coApplicantOccupation !== undefined) {
    changes.co_applicant_occupation = toNullableText(coApplicantOccupation, 120);
  }

  const coApplicantSelfEmployed = pickFirstDefined(body, ['coApplicantSelfEmployed', 'co_applicant_self_employed']);
  if (coApplicantSelfEmployed !== undefined) {
    const normalizedCoApplicantSelfEmployed = normalizeBoolean(coApplicantSelfEmployed, 'coApplicantSelfEmployed');
    if (!normalizedCoApplicantSelfEmployed.ok) return normalizedCoApplicantSelfEmployed;
    changes.co_applicant_self_employed = normalizedCoApplicantSelfEmployed.value;
  }

  const firstDepositDate = pickFirstDefined(body, ['firstDepositDate', 'first_deposit_date']);
  if (firstDepositDate !== undefined) {
    if (firstDepositDate === null || String(firstDepositDate).trim() === '') {
      changes.first_deposit_date = null;
    } else {
      const normalized = String(firstDepositDate).trim();
      if (!isValidISODate(normalized)) {
        return { ok: false, message: 'firstDepositDate debe tener formato YYYY-MM-DD.' };
      }
      changes.first_deposit_date = normalized;
    }
  }

  const calcTotalDebt = pickFirstDefined(body, ['calcTotalDebt', 'calc_total_debt', 'totalDebt']);
  if (calcTotalDebt !== undefined) {
    const normalizedCalcTotalDebt = normalizeMoney(calcTotalDebt, 'calcTotalDebt');
    if (!normalizedCalcTotalDebt.ok) return normalizedCalcTotalDebt;
    changes.calc_total_debt = normalizedCalcTotalDebt.value;
  }

  const calcSettlementPercent = pickFirstDefined(body, ['calcSettlementPercent', 'calc_settlement_percent', 'settlementPercent']);
  if (calcSettlementPercent !== undefined) {
    const normalizedCalcSettlementPercent = normalizePercent(calcSettlementPercent, 'calcSettlementPercent');
    if (!normalizedCalcSettlementPercent.ok) return normalizedCalcSettlementPercent;
    changes.calc_settlement_percent = normalizedCalcSettlementPercent.value;
  }

  const calcProgramFeePercent = pickFirstDefined(body, ['calcProgramFeePercent', 'calc_program_fee_percent', 'programFeePercent']);
  if (calcProgramFeePercent !== undefined) {
    const normalizedCalcProgramFeePercent = normalizePercent(calcProgramFeePercent, 'calcProgramFeePercent');
    if (!normalizedCalcProgramFeePercent.ok) return normalizedCalcProgramFeePercent;
    changes.calc_program_fee_percent = normalizedCalcProgramFeePercent.value;
  }

  const calcBankFee = pickFirstDefined(body, ['calcBankFee', 'calc_bank_fee', 'bankFee']);
  if (calcBankFee !== undefined) {
    const normalizedCalcBankFee = normalizeMoney(calcBankFee, 'calcBankFee');
    if (!normalizedCalcBankFee.ok) return normalizedCalcBankFee;
    changes.calc_bank_fee = normalizedCalcBankFee.value;
  }

  const calcMonths = pickFirstDefined(body, ['calcMonths', 'calc_months', 'months']);
  if (calcMonths !== undefined) {
    const normalizedCalcMonths = normalizeMonths(calcMonths, 'calcMonths');
    if (!normalizedCalcMonths.ok) return normalizedCalcMonths;
    changes.calc_months = normalizedCalcMonths.value;
  }

  const calcLegalPlanEnabled = pickFirstDefined(body, ['calcLegalPlanEnabled', 'calc_legal_plan_enabled', 'legalPlanEnabled']);
  if (calcLegalPlanEnabled !== undefined) {
    const normalizedCalcLegalPlanEnabled = normalizeBoolean(calcLegalPlanEnabled, 'calcLegalPlanEnabled');
    if (!normalizedCalcLegalPlanEnabled.ok) return normalizedCalcLegalPlanEnabled;
    changes.calc_legal_plan_enabled = normalizedCalcLegalPlanEnabled.value;
  }

  const homePhone = pickFirstDefined(body, ['homePhone', 'home_phone']);
  if (homePhone !== undefined) {
    const normalizedHomePhone = normalizePhone(homePhone, 'homePhone');
    if (!normalizedHomePhone.ok) return normalizedHomePhone;
    changes.home_phone = normalizedHomePhone.value;
  }

  const cellPhone = pickFirstDefined(body, ['cellPhone', 'cell_phone', 'phone']);
  if (cellPhone !== undefined) {
    const normalizedCellPhone = normalizePhone(cellPhone, 'cellPhone');
    if (!normalizedCellPhone.ok) return normalizedCellPhone;
    changes.cell_phone = normalizedCellPhone.value;
    changes.phone = normalizedCellPhone.value;
  }

  const email = pickFirstDefined(body, ['email']);
  if (email !== undefined) {
    const normalizedEmail = toNullableText(email, 160);
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return { ok: false, message: 'email no tiene un formato valido.' };
    }
    changes.email = normalizedEmail;
  }

  const dob = pickFirstDefined(body, ['dob']);
  if (dob !== undefined) {
    if (dob === null || String(dob).trim() === '') {
      changes.dob = null;
    } else {
      const normalizedDob = String(dob).trim();
      if (!isValidISODate(normalizedDob)) {
        return { ok: false, message: 'dob debe tener formato YYYY-MM-DD.' };
      }
      changes.dob = normalizedDob;
    }
  }

  const ssn = pickFirstDefined(body, ['ssn']);
  if (ssn !== undefined) {
    const normalizedSsn = normalizeSsn(ssn);
    if (!normalizedSsn.ok) return normalizedSsn;
    changes.ssn = normalizedSsn.value;
  }

  const addressStreet = pickFirstDefined(body, ['addressStreet', 'address_street']);
  if (addressStreet !== undefined) {
    changes.address_street = toNullableText(addressStreet, 180);
  }

  const city = pickFirstDefined(body, ['city']);
  if (city !== undefined) {
    changes.city = toNullableText(city, 120);
  }

  const zipCode = pickFirstDefined(body, ['zipCode', 'zip_code']);
  if (zipCode !== undefined) {
    const normalizedZip = normalizeZipCode(zipCode);
    if (!normalizedZip.ok) return normalizedZip;
    changes.zip_code = normalizedZip.value;
  }

  const stateValue = pickFirstDefined(body, ['state', 'stateCode', 'state_code']);
  if (stateValue !== undefined) {
    const normalizedState = normalizeStateCode(stateValue);
    if (!normalizedState.ok) return normalizedState;
    changes.state_code = normalizedState.value;
  }

  const bestTime = pickFirstDefined(body, ['bestTime', 'best_time']);
  if (bestTime !== undefined) {
    changes.best_time = toNullableText(bestTime, 80);
  }

  const currentlyEmployed = pickFirstDefined(body, ['currentlyEmployed', 'currently_employed']);
  if (currentlyEmployed !== undefined) {
    changes.currently_employed = toNullableText(currentlyEmployed, 60);
  }

  const employerName = pickFirstDefined(body, ['employerName', 'employer_name']);
  if (employerName !== undefined) {
    changes.employer_name = toNullableText(employerName, 120);
  }

  const occupation = pickFirstDefined(body, ['occupation']);
  if (occupation !== undefined) {
    changes.occupation = toNullableText(occupation, 120);
  }

  const selfEmployed = pickFirstDefined(body, ['selfEmployed', 'self_employed']);
  if (selfEmployed !== undefined) {
    const normalizedSelfEmployed = normalizeBoolean(selfEmployed, 'selfEmployed');
    if (!normalizedSelfEmployed.ok) return normalizedSelfEmployed;
    changes.self_employed = normalizedSelfEmployed.value;
  }

  const relatedLeadId = pickFirstDefined(body, ['relatedLeadId', 'related_lead_id']);
  if (relatedLeadId !== undefined) {
    const normalizedRelatedLeadId = normalizeRelatedLeadId(relatedLeadId, 'relatedLeadId');
    if (!normalizedRelatedLeadId.ok) return normalizedRelatedLeadId;
    changes.related_lead_id = normalizedRelatedLeadId.value;
  }

  const notes = pickFirstDefined(body, ['notes']);
  if (notes !== undefined) {
    if (notes === null) {
      changes.notes = '';
    } else {
      changes.notes = cleanText(notes, 5000);
    }
  }

  return { ok: true, changes };
}

function addStateType(lead) {
  return {
    ...lead,
    state_type: GREEN_STATES.includes(lead.state_code?.toUpperCase()) ? 'Green' : 'Red'
  };
}

// Datos de ejemplo
const sampleLeads = [
  {
    id: 1,
    case_id: 1001,
    full_name: 'Juan Perez',
    co_applicant_name: null,
    co_applicant_email: null,
    co_applicant_home_phone: null,
    co_applicant_cell_phone: null,
    co_applicant_dob: null,
    co_applicant_ssn: null,
    co_applicant_currently_employed: null,
    co_applicant_employer_name: null,
    co_applicant_occupation: null,
    co_applicant_self_employed: false,
    calc_total_debt: 0,
    calc_settlement_percent: 0,
    calc_program_fee_percent: 0,
    calc_bank_fee: 0,
    calc_months: 48,
    calc_legal_plan_enabled: true,
    phone: '555-0101',
    home_phone: '555-0101',
    cell_phone: '555-0101',
    email: 'juan@example.com',
    source: 'Web',
    state_code: 'CA',
    dob: null,
    ssn: null,
    address_street: null,
    city: null,
    zip_code: null,
    best_time: null,
    currently_employed: null,
    employer_name: null,
    occupation: null,
    self_employed: false,
    status: 'New Lead',
    is_test: false,
    notes: '',
    related_lead_id: null,
    assigned_to: null,
    first_deposit_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 2,
    case_id: 1002,
    full_name: 'Maria Garcia',
    co_applicant_name: null,
    co_applicant_email: null,
    co_applicant_home_phone: null,
    co_applicant_cell_phone: null,
    co_applicant_dob: null,
    co_applicant_ssn: null,
    co_applicant_currently_employed: null,
    co_applicant_employer_name: null,
    co_applicant_occupation: null,
    co_applicant_self_employed: false,
    calc_total_debt: 0,
    calc_settlement_percent: 0,
    calc_program_fee_percent: 0,
    calc_bank_fee: 0,
    calc_months: 48,
    calc_legal_plan_enabled: true,
    phone: '555-0102',
    home_phone: '555-0102',
    cell_phone: '555-0102',
    email: 'maria@example.com',
    source: 'Referral',
    state_code: 'TX',
    dob: null,
    ssn: null,
    address_street: null,
    city: null,
    zip_code: null,
    best_time: null,
    currently_employed: null,
    employer_name: null,
    occupation: null,
    self_employed: false,
    status: 'New Lead',
    is_test: false,
    notes: '',
    related_lead_id: null,
    assigned_to: null,
    first_deposit_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 3,
    case_id: 1003,
    full_name: 'Carlos Lopez',
    co_applicant_name: null,
    co_applicant_email: null,
    co_applicant_home_phone: null,
    co_applicant_cell_phone: null,
    co_applicant_dob: null,
    co_applicant_ssn: null,
    co_applicant_currently_employed: null,
    co_applicant_employer_name: null,
    co_applicant_occupation: null,
    co_applicant_self_employed: false,
    calc_total_debt: 0,
    calc_settlement_percent: 0,
    calc_program_fee_percent: 0,
    calc_bank_fee: 0,
    calc_months: 48,
    calc_legal_plan_enabled: true,
    phone: '555-0103',
    home_phone: '555-0103',
    cell_phone: '555-0103',
    email: 'carlos@example.com',
    source: 'Web',
    state_code: 'NY',
    dob: null,
    ssn: null,
    address_street: null,
    city: null,
    zip_code: null,
    best_time: null,
    currently_employed: null,
    employer_name: null,
    occupation: null,
    self_employed: false,
    status: 'Test',
    is_test: true,
    notes: '',
    related_lead_id: null,
    assigned_to: 'Agente 1',
    first_deposit_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

db.leads.push(...sampleLeads);
db.nextCaseId = 1004;

app.use(cors());
app.use(express.json());
app.use(express.static(ROOT_DIR));

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, message: 'Server activo (modo MOCK - sin PostgreSQL)' });
});

app.get('/api/zipcode/:zip', async (req, res) => {
  const resolved = await resolveZipLocation(req.params.zip);

  if (!resolved.ok) {
    const status = Number(resolved.status) || 400;
    return res.status(status).json({ message: resolved.message || 'No se pudo resolver el ZIP.' });
  }

  const { zipCode, city, stateCode } = resolved.value;

  return res.json({
    zipCode,
    city,
    stateCode,
    stateType: GREEN_STATES.includes(stateCode) ? 'Green' : 'Red'
  });
});

app.get('/api/note-templates', async (req, res) => {
  const ownerUsername = resolveRequestUsername(req, 'admin').toLowerCase();
  const templates = db.noteTemplates
    .filter((item) => String(item.owner_username || '') === ownerUsername)
    .sort((a, b) => {
      const byName = String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' });
      if (byName !== 0) return byName;
      return Number(b.id) - Number(a.id);
    })
    .slice(0, 300);

  return res.json({ templates });
});

app.post('/api/note-templates', async (req, res) => {
  const ownerUsername = resolveRequestUsername(req, 'admin').toLowerCase();
  const normalizedOwnerUsername = normalizeActorUsername(ownerUsername, 'username');
  if (!normalizedOwnerUsername.ok) {
    return res.status(400).json({ message: normalizedOwnerUsername.message });
  }

  const normalizedName = normalizeTemplateName(req.body?.name, 'name');
  if (!normalizedName.ok) {
    return res.status(400).json({ message: normalizedName.message });
  }

  const normalizedContent = normalizeTemplateContent(req.body?.content, 'content');
  if (!normalizedContent.ok) {
    return res.status(400).json({ message: normalizedContent.message });
  }

  const now = new Date().toISOString();
  const template = {
    id: db.nextNoteTemplateId++,
    owner_username: normalizedOwnerUsername.value,
    name: normalizedName.value,
    content: normalizedContent.value,
    created_at: now,
    updated_at: now
  };

  db.noteTemplates.push(template);
  return res.status(201).json({ template });
});

app.patch('/api/note-templates/:id', async (req, res) => {
  const templateId = Number(req.params.id);
  const ownerUsername = resolveRequestUsername(req, 'admin').toLowerCase();
  if (!Number.isInteger(templateId) || templateId <= 0) {
    return res.status(400).json({ message: 'ID de template invalido.' });
  }

  const template = db.noteTemplates.find((item) => item.id === templateId && String(item.owner_username || '') === ownerUsername);
  if (!template) {
    return res.status(404).json({ message: 'Template no encontrado.' });
  }

  const updates = {};
  const body = req.body || {};

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    const normalizedName = normalizeTemplateName(body.name, 'name');
    if (!normalizedName.ok) {
      return res.status(400).json({ message: normalizedName.message });
    }
    updates.name = normalizedName.value;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'content')) {
    const normalizedContent = normalizeTemplateContent(body.content, 'content');
    if (!normalizedContent.ok) {
      return res.status(400).json({ message: normalizedContent.message });
    }
    updates.content = normalizedContent.value;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No hay campos para actualizar.' });
  }

  Object.assign(template, updates);
  template.updated_at = new Date().toISOString();
  return res.json({ template });
});

app.delete('/api/note-templates/:id', async (req, res) => {
  const templateId = Number(req.params.id);
  const ownerUsername = resolveRequestUsername(req, 'admin').toLowerCase();
  if (!Number.isInteger(templateId) || templateId <= 0) {
    return res.status(400).json({ message: 'ID de template invalido.' });
  }

  const index = db.noteTemplates.findIndex((item) => item.id === templateId && String(item.owner_username || '') === ownerUsername);
  if (index === -1) {
    return res.status(404).json({ message: 'Template no encontrado.' });
  }

  db.noteTemplates.splice(index, 1);
  return res.json({ message: 'Template eliminado correctamente.' });
});

app.get('/api/leads/:id/notes', async (req, res) => {
  const leadId = Number(req.params.id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({ message: 'ID de lead invalido.' });
  }

  const lead = db.leads.find((item) => item.id === leadId);
  if (!lead) {
    return res.status(404).json({ message: 'Lead no encontrado.' });
  }

  const notes = db.leadNotes
    .filter((item) => item.lead_id === leadId)
    .map((note) => ({
      ...note,
      color_tag: normalizeNoteColorTag(note.color_tag).value
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const legacyNotes = cleanText(lead.notes, 5000);
  if (legacyNotes && !notes.some((note) => String(note.content || '').trim() === legacyNotes)) {
    notes.push({
      id: `legacy-${leadId}`,
      lead_id: leadId,
      content: legacyNotes,
      author_username: cleanText(lead.assigned_to, 120) || 'Sistema',
      color_tag: 'yellow',
      created_at: lead.updated_at || lead.created_at,
      updated_at: lead.updated_at || lead.created_at,
      is_legacy: true
    });
  }

  return res.json({ notes });
});

app.post('/api/leads/:id/notes', async (req, res) => {
  const leadId = Number(req.params.id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({ message: 'ID de lead invalido.' });
  }

  const lead = db.leads.find((item) => item.id === leadId);
  if (!lead) {
    return res.status(404).json({ message: 'Lead no encontrado.' });
  }

  const content = cleanText(req.body?.content, 5000);
  if (!content) {
    return res.status(400).json({ message: 'content es obligatorio.' });
  }

  const rawColorTag = pickFirstDefined(req.body || {}, ['colorTag', 'color_tag']);
  const normalizedColorTag = normalizeNoteColorTag(rawColorTag, 'colorTag');
  if (!normalizedColorTag.ok) {
    return res.status(400).json({ message: normalizedColorTag.message });
  }

  const authorUsername = resolveRequestUsername(req, 'Sistema');
  const normalizedAuthor = normalizeActorUsername(authorUsername, 'username');
  if (!normalizedAuthor.ok) {
    return res.status(400).json({ message: normalizedAuthor.message });
  }

  const now = new Date().toISOString();
  const note = {
    id: db.nextLeadNoteId++,
    lead_id: leadId,
    content,
    author_username: normalizedAuthor.value,
    color_tag: normalizedColorTag.value,
    created_at: now,
    updated_at: now
  };

  db.leadNotes.unshift(note);
  lead.updated_at = now;
  return res.status(201).json({ note });
});

app.patch('/api/leads/:id/notes/:noteId', async (req, res) => {
  const leadId = Number(req.params.id);
  const noteId = Number(req.params.noteId);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({ message: 'ID de lead invalido.' });
  }
  if (!Number.isInteger(noteId) || noteId <= 0) {
    return res.status(400).json({ message: 'ID de nota invalido.' });
  }

  const lead = db.leads.find((item) => item.id === leadId);
  if (!lead) {
    return res.status(404).json({ message: 'Lead no encontrado.' });
  }

  const note = db.leadNotes.find((item) => item.id === noteId && item.lead_id === leadId);
  if (!note) {
    return res.status(404).json({ message: 'Nota no encontrada.' });
  }

  const body = req.body || {};
  let hasChanges = false;

  if (Object.prototype.hasOwnProperty.call(body, 'content')) {
    const content = cleanText(body.content, 5000);
    if (!content) {
      return res.status(400).json({ message: 'content es obligatorio.' });
    }
    note.content = content;
    hasChanges = true;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'colorTag') || Object.prototype.hasOwnProperty.call(body, 'color_tag')) {
    const rawColorTag = pickFirstDefined(body, ['colorTag', 'color_tag']);
    const normalizedColorTag = normalizeNoteColorTag(rawColorTag, 'colorTag');
    if (!normalizedColorTag.ok) {
      return res.status(400).json({ message: normalizedColorTag.message });
    }
    note.color_tag = normalizedColorTag.value;
    hasChanges = true;
  }

  if (!hasChanges) {
    return res.status(400).json({ message: 'No hay campos para actualizar.' });
  }

  const now = new Date().toISOString();
  note.updated_at = now;
  lead.updated_at = now;
  return res.json({ note: { ...note, color_tag: normalizeNoteColorTag(note.color_tag).value } });
});

app.delete('/api/leads/:id/notes/:noteId', async (req, res) => {
  const leadId = Number(req.params.id);
  const noteId = Number(req.params.noteId);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({ message: 'ID de lead invalido.' });
  }
  if (!Number.isInteger(noteId) || noteId <= 0) {
    return res.status(400).json({ message: 'ID de nota invalido.' });
  }

  const lead = db.leads.find((item) => item.id === leadId);
  if (!lead) {
    return res.status(404).json({ message: 'Lead no encontrado.' });
  }

  const index = db.leadNotes.findIndex((item) => item.id === noteId && item.lead_id === leadId);
  if (index === -1) {
    return res.status(404).json({ message: 'Nota no encontrada.' });
  }

  db.leadNotes.splice(index, 1);
  lead.updated_at = new Date().toISOString();
  return res.json({ message: 'Nota eliminada correctamente.' });
});

app.post('/api/auth/login', async (req, res) => {
  const username = cleanText(req.body?.username, 64).toLowerCase();
  const password = String(req.body?.password || '');

  if (!username || !password) {
    return res.status(400).json({ message: 'Usuario y clave son obligatorios.' });
  }

  if (username !== ADMIN_USER || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: 'Credenciales invalidas.' });
  }

  return res.json({
    ok: true,
    message: 'Acceso correcto.',
    user: {
      username: 'Admin',
      role: 'Administrador'
    }
  });
});

app.get('/api/leads', async (_req, res) => {
  const leadsWithStateType = db.leads.map(addStateType);
  res.json({ leads: leadsWithStateType });
});

app.get('/api/leads/duplicates', async (req, res) => {
  const normalizedPhone = normalizePhone(req.query?.phone, 'phone');
  if (!normalizedPhone.ok) {
    return res.status(400).json({ message: normalizedPhone.message });
  }
  if (!normalizedPhone.value || !normalizedPhone.digits) {
    return res.status(400).json({ message: 'phone es obligatorio.' });
  }

  const matches = db.leads
    .filter((lead) => {
      const fields = [
        lead.phone,
        lead.home_phone,
        lead.cell_phone,
        lead.co_applicant_home_phone,
        lead.co_applicant_cell_phone
      ];
      return fields.some((phoneValue) => getPhoneDigits(phoneValue) === normalizedPhone.digits);
    })
    .map(addStateType)
    .slice(0, 25);

  res.json({
    phone: normalizedPhone.value,
    total: matches.length,
    matches
  });
});

app.post('/api/leads', async (req, res) => {
  const fullName = cleanText(req.body?.fullName, 120);
  const normalizedPhone = normalizePhone(req.body?.phone, 'phone');
  if (!normalizedPhone.ok) {
    return res.status(400).json({ message: normalizedPhone.message });
  }
  const phone = normalizedPhone.value;
  const isTest = req.body?.isTest === true;
  const stateCode = cleanText(req.body?.stateCode, 2) || null;
  const assignedTo = cleanText(req.body?.assignedTo, 120) || null;
  const notes = cleanText(req.body?.notes, 1000);
  const relatedLeadIdRaw = pickFirstDefined(req.body || {}, ['relatedLeadId', 'related_lead_id']);
  const normalizedRelatedLeadId = normalizeRelatedLeadId(relatedLeadIdRaw, 'relatedLeadId');
  if (!normalizedRelatedLeadId.ok) {
    return res.status(400).json({ message: normalizedRelatedLeadId.message });
  }
  const relatedLeadId = normalizedRelatedLeadId.value;
  const isGreenState = GREEN_STATES.includes(stateCode?.toUpperCase?.());
  const calcLegalPlanEnabled = isGreenState;

  if (!fullName || !phone) {
    return res.status(400).json({ message: 'Nombre y telefono son obligatorios.' });
  }

  if (relatedLeadId !== null) {
    const relatedLead = db.leads.find((item) => item.id === relatedLeadId);
    if (!relatedLead) {
      return res.status(400).json({ message: 'El lead relacionado no existe.' });
    }
  }

  const caseId = db.nextCaseId++;
  const newLead = {
    id: db.leads.length + 1,
    case_id: caseId,
    full_name: fullName,
    co_applicant_name: null,
    co_applicant_email: null,
    co_applicant_home_phone: null,
    co_applicant_cell_phone: null,
    co_applicant_dob: null,
    co_applicant_ssn: null,
    co_applicant_currently_employed: null,
    co_applicant_employer_name: null,
    co_applicant_occupation: null,
    co_applicant_self_employed: false,
    calc_total_debt: 0,
    calc_settlement_percent: 0,
    calc_program_fee_percent: 0,
    calc_bank_fee: 0,
    calc_months: 48,
    calc_legal_plan_enabled: calcLegalPlanEnabled,
    phone,
    home_phone: phone,
    cell_phone: phone,
    is_test: isTest,
    state_code: stateCode,
    assigned_to: assignedTo,
    status: isTest ? 'Test' : 'New Lead',
    email: null,
    source: 'Web',
    dob: null,
    ssn: null,
    address_street: null,
    city: null,
    zip_code: null,
    best_time: null,
    currently_employed: null,
    employer_name: null,
    occupation: null,
    self_employed: false,
    notes: notes || '',
    related_lead_id: relatedLeadId,
    first_deposit_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  db.leads.unshift(newLead);

  if (notes) {
    const now = new Date().toISOString();
    db.leadNotes.unshift({
      id: db.nextLeadNoteId++,
      lead_id: newLead.id,
      content: notes,
      author_username: assignedTo || 'Sistema',
      color_tag: 'yellow',
      created_at: now,
      updated_at: now
    });
  }

  res.status(201).json({ lead: addStateType(newLead) });
});

app.get('/api/leads/:id', async (req, res) => {
  const leadId = parseInt(req.params.id, 10);
  const lead = db.leads.find((item) => item.id === leadId);

  if (!lead) {
    return res.status(404).json({ message: 'Lead no encontrado.' });
  }

  res.json({ lead: addStateType(lead) });
});

app.patch('/api/leads/:id', async (req, res) => {
  const leadId = parseInt(req.params.id, 10);
  const lead = db.leads.find((item) => item.id === leadId);
  if (!lead) {
    return res.status(404).json({ message: 'Lead no encontrado.' });
  }

  const parsed = parseLeadPatchBody(req.body || {});
  if (!parsed.ok) {
    return res.status(400).json({ message: parsed.message });
  }

  const changes = parsed.changes;
  if (Object.keys(changes).length === 0) {
    return res.status(400).json({ message: 'No hay campos para actualizar.' });
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'related_lead_id')) {
    const nextRelatedLeadId = changes.related_lead_id;
    if (nextRelatedLeadId !== null && nextRelatedLeadId === leadId) {
      return res.status(400).json({ message: 'Un lead no puede relacionarse consigo mismo.' });
    }
    if (nextRelatedLeadId !== null) {
      const relatedLead = db.leads.find((item) => item.id === nextRelatedLeadId);
      if (!relatedLead) {
        return res.status(400).json({ message: 'El lead relacionado no existe.' });
      }
    }
  }

  Object.assign(lead, changes);
  lead.updated_at = new Date().toISOString();

  res.json({ lead: addStateType(lead), message: 'Lead actualizado correctamente.' });
});

app.delete('/api/leads/:id', async (req, res) => {
  const leadId = parseInt(req.params.id, 10);
  const index = db.leads.findIndex((item) => item.id === leadId);

  if (index === -1) {
    return res.status(404).json({ message: 'Lead no encontrado.' });
  }

  db.leads.splice(index, 1);
  db.leadNotes = db.leadNotes.filter((item) => item.lead_id !== leadId);

  // Limpiar relaciones colgantes contra el lead eliminado
  db.leads.forEach((item) => {
    if (item.related_lead_id === leadId) {
      item.related_lead_id = null;
      item.updated_at = new Date().toISOString();
    }
  });

  res.json({ message: 'Lead eliminado correctamente.' });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.get('/client.html', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'client.html'));
});

app.listen(PORT, () => {
  console.log('=================================');
  console.log(`Servidor activo en http://localhost:${PORT}`);
  console.log('MODO MOCK: Datos almacenados en memoria');
  console.log('(Para usar PostgreSQL, ejecuta: npm run db:init-local)');
  console.log('=================================');
});
