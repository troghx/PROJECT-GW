const path = require('path');
const fs = require('fs/promises');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const { pool } = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = path.join(__dirname, '..');
const ADMIN_USER = 'admin';
const ADMIN_PASSWORD = '1234';

app.use(cors());
app.use(express.json());
app.use(express.static(ROOT_DIR));

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

const LEAD_SELECT_COLUMNS = `
  id, case_id, full_name, co_applicant_name, co_applicant_email, co_applicant_home_phone, co_applicant_cell_phone, co_applicant_dob, co_applicant_ssn,
  co_applicant_currently_employed, co_applicant_employer_name, co_applicant_occupation, co_applicant_self_employed,
  calc_total_debt, calc_settlement_percent, calc_program_fee_percent, calc_bank_fee, calc_months, calc_legal_plan_enabled,
  email, phone, home_phone, cell_phone,
  source, state_code, dob, ssn, address_street, city, zip_code, best_time,
  currently_employed, employer_name, occupation, self_employed,
  status, is_test, notes, related_lead_id, assigned_to, first_deposit_date, created_at, updated_at
`;

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

async function runMigrations() {
  const sqlPath = path.join(ROOT_DIR, 'db', 'init.sql');
  const sql = await fs.readFile(sqlPath, 'utf8');
  await pool.query(sql);
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, message: 'Server y PostgreSQL conectados.' });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Sin conexion a PostgreSQL.' });
  }
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

  try {
    const { rows } = await pool.query(
      `SELECT id, owner_username, name, content, created_at, updated_at
       FROM note_templates
       WHERE owner_username = $1
       ORDER BY lower(name) ASC, id DESC
       LIMIT 300`,
      [ownerUsername]
    );
    return res.json({ templates: rows });
  } catch (error) {
    console.error('Error al obtener templates de notas:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los templates.' });
  }
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

  try {
    const { rows } = await pool.query(
      `INSERT INTO note_templates (owner_username, name, content)
       VALUES ($1, $2, $3)
       RETURNING id, owner_username, name, content, created_at, updated_at`,
      [normalizedOwnerUsername.value, normalizedName.value, normalizedContent.value]
    );
    return res.status(201).json({ template: rows[0] });
  } catch (error) {
    console.error('Error al crear template de nota:', error);
    return res.status(500).json({ message: 'No se pudo crear el template.' });
  }
});

app.patch('/api/note-templates/:id', async (req, res) => {
  const templateId = Number(req.params.id);
  const ownerUsername = resolveRequestUsername(req, 'admin').toLowerCase();

  if (!Number.isInteger(templateId) || templateId <= 0) {
    return res.status(400).json({ message: 'ID de template invalido.' });
  }

  const updates = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
    const normalizedName = normalizeTemplateName(req.body?.name, 'name');
    if (!normalizedName.ok) {
      return res.status(400).json({ message: normalizedName.message });
    }
    updates.push(`name = $${updates.length + 1}`);
    values.push(normalizedName.value);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'content')) {
    const normalizedContent = normalizeTemplateContent(req.body?.content, 'content');
    if (!normalizedContent.ok) {
      return res.status(400).json({ message: normalizedContent.message });
    }
    updates.push(`content = $${updates.length + 1}`);
    values.push(normalizedContent.value);
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: 'No hay campos para actualizar.' });
  }

  values.push(templateId);

  try {
    const { rows } = await pool.query(
      `UPDATE note_templates
       SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${values.length} AND owner_username = $${values.length + 1}
       RETURNING id, owner_username, name, content, created_at, updated_at`,
      [...values, ownerUsername]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Template no encontrado.' });
    }

    return res.json({ template: rows[0] });
  } catch (error) {
    console.error('Error al actualizar template de nota:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el template.' });
  }
});

app.delete('/api/note-templates/:id', async (req, res) => {
  const templateId = Number(req.params.id);
  const ownerUsername = resolveRequestUsername(req, 'admin').toLowerCase();

  if (!Number.isInteger(templateId) || templateId <= 0) {
    return res.status(400).json({ message: 'ID de template invalido.' });
  }

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM note_templates WHERE id = $1 AND owner_username = $2`,
      [templateId, ownerUsername]
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: 'Template no encontrado.' });
    }

    return res.json({ message: 'Template eliminado correctamente.' });
  } catch (error) {
    console.error('Error al eliminar template de nota:', error);
    return res.status(500).json({ message: 'No se pudo eliminar el template.' });
  }
});

app.get('/api/leads/:id/notes', async (req, res) => {
  const leadId = Number(req.params.id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({ message: 'ID de lead invalido.' });
  }

  try {
    const { rows: leadRows } = await pool.query(
      `SELECT id, notes, assigned_to, created_at, updated_at
       FROM leads
       WHERE id = $1
       LIMIT 1`,
      [leadId]
    );

    if (leadRows.length === 0) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    const { rows } = await pool.query(
      `SELECT id, lead_id, content, author_username, color_tag, created_at, updated_at
       FROM lead_notes
       WHERE lead_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 300`,
      [leadId]
    );

    const lead = leadRows[0];
    const legacyNotes = cleanText(lead.notes, 5000);
    const notes = [...rows];

    if (legacyNotes && !rows.some((note) => String(note.content || '').trim() === legacyNotes)) {
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
  } catch (error) {
    console.error('Error al obtener notas del lead:', error);
    return res.status(500).json({ message: 'No se pudieron cargar las notas.' });
  }
});

app.post('/api/leads/:id/notes', async (req, res) => {
  const leadId = Number(req.params.id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({ message: 'ID de lead invalido.' });
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

  try {
    const { rows: leadRows } = await pool.query(
      `SELECT id FROM leads WHERE id = $1 LIMIT 1`,
      [leadId]
    );
    if (leadRows.length === 0) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO lead_notes (lead_id, content, author_username, color_tag)
       VALUES ($1, $2, $3, $4)
       RETURNING id, lead_id, content, author_username, color_tag, created_at, updated_at`,
      [leadId, content, normalizedAuthor.value, normalizedColorTag.value]
    );

    await pool.query(
      `UPDATE leads
       SET updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [leadId]
    );

    return res.status(201).json({ note: rows[0] });
  } catch (error) {
    console.error('Error al crear nota del lead:', error);
    return res.status(500).json({ message: 'No se pudo crear la nota.' });
  }
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

  const body = req.body || {};
  const updates = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(body, 'content')) {
    const content = cleanText(body.content, 5000);
    if (!content) {
      return res.status(400).json({ message: 'content es obligatorio.' });
    }
    updates.push(`content = $${updates.length + 1}`);
    values.push(content);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'colorTag') || Object.prototype.hasOwnProperty.call(body, 'color_tag')) {
    const rawColorTag = pickFirstDefined(body, ['colorTag', 'color_tag']);
    const normalizedColorTag = normalizeNoteColorTag(rawColorTag, 'colorTag');
    if (!normalizedColorTag.ok) {
      return res.status(400).json({ message: normalizedColorTag.message });
    }
    updates.push(`color_tag = $${updates.length + 1}`);
    values.push(normalizedColorTag.value);
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: 'No hay campos para actualizar.' });
  }

  values.push(noteId);
  values.push(leadId);

  try {
    const { rows } = await pool.query(
      `UPDATE lead_notes
       SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${values.length - 1} AND lead_id = $${values.length}
       RETURNING id, lead_id, content, author_username, color_tag, created_at, updated_at`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Nota no encontrada.' });
    }

    await pool.query(
      `UPDATE leads
       SET updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [leadId]
    );

    return res.json({ note: rows[0] });
  } catch (error) {
    console.error('Error al actualizar nota del lead:', error);
    return res.status(500).json({ message: 'No se pudo actualizar la nota.' });
  }
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

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM lead_notes
       WHERE id = $1 AND lead_id = $2`,
      [noteId, leadId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: 'Nota no encontrada.' });
    }

    await pool.query(
      `UPDATE leads
       SET updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [leadId]
    );

    return res.json({ message: 'Nota eliminada correctamente.' });
  } catch (error) {
    console.error('Error al eliminar nota del lead:', error);
    return res.status(500).json({ message: 'No se pudo eliminar la nota.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const username = cleanText(req.body?.username, 64).toLowerCase();
  const password = String(req.body?.password || '');

  if (!username || !password) {
    return res.status(400).json({ message: 'Usuario y clave son obligatorios.' });
  }

  try {
    await pool.query('SELECT 1');
  } catch (error) {
    return res.status(500).json({ message: 'PostgreSQL no esta disponible.' });
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
  try {
    const { rows } = await pool.query(
      `SELECT ${LEAD_SELECT_COLUMNS}
       FROM leads
       ORDER BY created_at DESC
       LIMIT 100`
    );

    const leadsWithStateType = rows.map((lead) => ({
      ...lead,
      state_type: GREEN_STATES.includes(lead.state_code?.toUpperCase()) ? 'Green' : 'Red'
    }));

    res.json({ leads: leadsWithStateType });
  } catch (error) {
    console.error('Error al obtener leads:', error);
    res.status(500).json({ message: 'Error al obtener leads.' });
  }
});

app.get('/api/leads/duplicates', async (req, res) => {
  const normalizedPhone = normalizePhone(req.query?.phone, 'phone');

  if (!normalizedPhone.ok) {
    return res.status(400).json({ message: normalizedPhone.message });
  }

  if (!normalizedPhone.value || !normalizedPhone.digits) {
    return res.status(400).json({ message: 'phone es obligatorio.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT ${LEAD_SELECT_COLUMNS}
       FROM leads
       WHERE right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $1
          OR right(regexp_replace(coalesce(home_phone, ''), '\\D', '', 'g'), 10) = $1
          OR right(regexp_replace(coalesce(cell_phone, ''), '\\D', '', 'g'), 10) = $1
          OR right(regexp_replace(coalesce(co_applicant_home_phone, ''), '\\D', '', 'g'), 10) = $1
          OR right(regexp_replace(coalesce(co_applicant_cell_phone, ''), '\\D', '', 'g'), 10) = $1
       ORDER BY created_at DESC
       LIMIT 25`,
      [normalizedPhone.digits]
    );

    const matches = rows.map((lead) => ({
      ...lead,
      state_type: GREEN_STATES.includes(lead.state_code?.toUpperCase()) ? 'Green' : 'Red'
    }));

    res.json({
      phone: normalizedPhone.value,
      total: matches.length,
      matches
    });
  } catch (error) {
    console.error('Error al buscar duplicados:', error);
    res.status(500).json({ message: 'Error al buscar duplicados.' });
  }
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

  try {
    if (relatedLeadId !== null) {
      const { rows: relatedRows } = await pool.query(
        'SELECT id FROM leads WHERE id = $1 LIMIT 1',
        [relatedLeadId]
      );
      if (relatedRows.length === 0) {
        return res.status(400).json({ message: 'El lead relacionado no existe.' });
      }
    }

    const { rows: seqRows } = await pool.query(
      `SELECT nextval('leads_case_id_seq') as next_id`
    );
    const caseId = seqRows[0].next_id;

    const { rows } = await pool.query(
      `INSERT INTO leads (
         case_id, full_name, phone, home_phone, cell_phone, is_test, state_code, assigned_to, status, notes, related_lead_id,
         calc_total_debt, calc_settlement_percent, calc_program_fee_percent, calc_bank_fee, calc_months, calc_legal_plan_enabled
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING ${LEAD_SELECT_COLUMNS}`,
      [
        caseId, fullName, phone, phone, phone, isTest, stateCode, assignedTo, isTest ? 'Test' : 'New Lead', notes || '', relatedLeadId,
        0, 0, 0, 0, 48, calcLegalPlanEnabled
      ]
    );

    if (notes) {
      const initialAuthor = assignedTo || 'Sistema';
      await pool.query(
        `INSERT INTO lead_notes (lead_id, content, author_username, color_tag)
         VALUES ($1, $2, $3, $4)`,
        [rows[0].id, notes, initialAuthor, 'yellow']
      );
    }

    const lead = rows[0];
    lead.state_type = GREEN_STATES.includes(lead.state_code?.toUpperCase()) ? 'Green' : 'Red';

    res.status(201).json({ lead });
  } catch (error) {
    console.error('Error al crear lead:', error.message);
    res.status(500).json({ message: 'No se pudo crear el lead.', detail: error.message });
  }
});

app.get('/api/leads/:id', async (req, res) => {
  const leadId = req.params.id;

  try {
    const { rows } = await pool.query(
      `SELECT ${LEAD_SELECT_COLUMNS}
       FROM leads
       WHERE id = $1`,
      [leadId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    const lead = rows[0];
    lead.state_type = GREEN_STATES.includes(lead.state_code?.toUpperCase()) ? 'Green' : 'Red';

    res.json({ lead });
  } catch (error) {
    console.error('Error al obtener lead:', error);
    res.status(500).json({ message: 'Error al obtener lead.' });
  }
});

app.patch('/api/leads/:id', async (req, res) => {
  const leadId = req.params.id;
  const parsed = parseLeadPatchBody(req.body || {});

  if (!parsed.ok) {
    return res.status(400).json({ message: parsed.message });
  }

  const changes = parsed.changes;
  const entries = Object.entries(changes);

  if (entries.length === 0) {
    return res.status(400).json({ message: 'No hay campos para actualizar.' });
  }

  try {
    if (Object.prototype.hasOwnProperty.call(changes, 'related_lead_id')) {
      const nextRelatedLeadId = changes.related_lead_id;
      const normalizedLeadId = Number(leadId);

      if (nextRelatedLeadId !== null && nextRelatedLeadId === normalizedLeadId) {
        return res.status(400).json({ message: 'Un lead no puede relacionarse consigo mismo.' });
      }

      if (nextRelatedLeadId !== null) {
        const { rows: relatedRows } = await pool.query(
          'SELECT id FROM leads WHERE id = $1 LIMIT 1',
          [nextRelatedLeadId]
        );
        if (relatedRows.length === 0) {
          return res.status(400).json({ message: 'El lead relacionado no existe.' });
        }
      }
    }

    const updateFields = [];
    const values = [];

    entries.forEach(([column, value], index) => {
      updateFields.push(`${column} = $${index + 1}`);
      values.push(value);
    });

    values.push(leadId);

    const { rows } = await pool.query(
      `UPDATE leads
       SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${values.length}
       RETURNING ${LEAD_SELECT_COLUMNS}`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    const lead = rows[0];
    lead.state_type = GREEN_STATES.includes(lead.state_code?.toUpperCase()) ? 'Green' : 'Red';

    res.json({ lead, message: 'Lead actualizado correctamente.' });
  } catch (error) {
    console.error('Error al actualizar lead:', error);
    res.status(500).json({ message: 'Error al actualizar lead.' });
  }
});

app.delete('/api/leads/:id', async (req, res) => {
  const leadId = req.params.id;

  try {
    await pool.query('BEGIN');

    const { rowCount } = await pool.query(
      `DELETE FROM leads WHERE id = $1`,
      [leadId]
    );

    if (rowCount === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    await pool.query(
      `UPDATE leads
       SET related_lead_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE related_lead_id = $1`,
      [leadId]
    );

    await pool.query('COMMIT');
    res.json({ message: 'Lead eliminado correctamente.' });
  } catch (error) {
    try {
      await pool.query('ROLLBACK');
    } catch (_rollbackError) {
      // ignore rollback secondary errors
    }
    console.error('Error al eliminar lead:', error);
    res.status(500).json({ message: 'Error al eliminar lead.' });
  }
});

// ============================================
// ENDPOINTS: BANKING INFORMATION
// ============================================

// GET /api/leads/:id/banking - Obtener información bancaria del lead
app.get('/api/leads/:id/banking', async (req, res) => {
  const leadId = req.params.id;

  try {
    const { rows } = await pool.query(
      `SELECT 
        id, lead_id, routing_number, account_number, account_type, bank_name, bank_phone,
        bank_address, bank_address2, bank_city, bank_state, bank_zip,
        name_on_account, mothers_maiden_name, ss_number, relationship_to_customer,
        email, dob, address, address2,
        initial_payment_amount, payment_day_of_month,
        created_at, updated_at
       FROM banking_info
       WHERE lead_id = $1`,
      [leadId]
    );

    if (rows.length === 0) {
      return res.json({ 
        banking: null,
        message: 'No hay información bancaria registrada para este lead.'
      });
    }

    res.json({ banking: rows[0] });
  } catch (error) {
    console.error('Error al obtener información bancaria:', error);
    res.status(500).json({ message: 'Error al obtener información bancaria.' });
  }
});

// PUT /api/leads/:id/banking - Crear o reemplazar información bancaria
app.put('/api/leads/:id/banking', async (req, res) => {
  const leadId = req.params.id;
  const body = req.body || {};

  try {
    // Verificar que el lead existe
    const { rows: leadRows } = await pool.query(
      'SELECT id FROM leads WHERE id = $1 LIMIT 1',
      [leadId]
    );

    if (leadRows.length === 0) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    // Validar y limpiar datos
    const routingNumber = toNullableText(body.routingNumber || body.routing_number, 20);
    const accountNumber = toNullableText(body.accountNumber || body.account_number, 50);
    const accountType = toNullableText(body.accountType || body.account_type, 20) || 'Checking';
    const bankName = toNullableText(body.bankName || body.bank_name, 120);
    const bankPhone = toNullableText(body.bankPhone || body.bank_phone, 40);
    const bankAddress = toNullableText(body.bankAddress || body.bank_address, 180);
    const bankAddress2 = toNullableText(body.bankAddress2 || body.bank_address2, 180);
    const bankCity = toNullableText(body.bankCity || body.bank_city, 120);
    const bankState = toNullableText(body.bankState || body.bank_state, 2);
    const bankZip = toNullableText(body.bankZip || body.bank_zip, 10);
    const nameOnAccount = toNullableText(body.nameOnAccount || body.name_on_account, 120);
    const mothersMaidenName = toNullableText(body.mothersMaidenName || body.mothers_maiden_name, 120);
    const ssNumber = toNullableText(body.ssNumber || body.ss_number, 11);
    const relationshipToCustomer = toNullableText(body.relationshipToCustomer || body.relationship_to_customer, 60);
    const email = toNullableText(body.email, 160);
    const dob = isValidISODate(body.dob) ? body.dob : null;
    const address = toNullableText(body.address, 180);
    const address2 = toNullableText(body.address2, 180);
    const initialPaymentAmount = parseFloat(body.initialPaymentAmount || body.initial_payment_amount) || 0;
    const paymentDayOfMonth = Math.min(31, Math.max(1, parseInt(body.paymentDayOfMonth || body.payment_day_of_month, 10) || 1));

    // Verificar si ya existe registro
    const { rows: existingRows } = await pool.query(
      'SELECT id FROM banking_info WHERE lead_id = $1 LIMIT 1',
      [leadId]
    );

    let result;
    if (existingRows.length > 0) {
      // Actualizar
      const { rows } = await pool.query(
        `UPDATE banking_info SET
          routing_number = $1, account_number = $2, account_type = $3, bank_name = $4, bank_phone = $5,
          bank_address = $6, bank_address2 = $7, bank_city = $8, bank_state = $9, bank_zip = $10,
          name_on_account = $11, mothers_maiden_name = $12, ss_number = $13, relationship_to_customer = $14,
          email = $15, dob = $16, address = $17, address2 = $18,
          initial_payment_amount = $19, payment_day_of_month = $20,
          updated_at = CURRENT_TIMESTAMP
         WHERE lead_id = $21
         RETURNING *`,
        [
          routingNumber, accountNumber, accountType, bankName, bankPhone,
          bankAddress, bankAddress2, bankCity, bankState, bankZip,
          nameOnAccount, mothersMaidenName, ssNumber, relationshipToCustomer,
          email, dob, address, address2,
          initialPaymentAmount, paymentDayOfMonth,
          leadId
        ]
      );
      result = rows[0];
    } else {
      // Crear nuevo
      const { rows } = await pool.query(
        `INSERT INTO banking_info (
          lead_id, routing_number, account_number, account_type, bank_name, bank_phone,
          bank_address, bank_address2, bank_city, bank_state, bank_zip,
          name_on_account, mothers_maiden_name, ss_number, relationship_to_customer,
          email, dob, address, address2,
          initial_payment_amount, payment_day_of_month
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        RETURNING *`,
        [
          leadId, routingNumber, accountNumber, accountType, bankName, bankPhone,
          bankAddress, bankAddress2, bankCity, bankState, bankZip,
          nameOnAccount, mothersMaidenName, ssNumber, relationshipToCustomer,
          email, dob, address, address2,
          initialPaymentAmount, paymentDayOfMonth
        ]
      );
      result = rows[0];
    }

    res.json({ 
      banking: result, 
      message: 'Información bancaria guardada correctamente.' 
    });
  } catch (error) {
    console.error('Error al guardar información bancaria:', error);
    res.status(500).json({ message: 'Error al guardar información bancaria.' });
  }
});

// PATCH /api/leads/:id/banking - Actualizar parcialmente información bancaria
app.patch('/api/leads/:id/banking', async (req, res) => {
  const leadId = req.params.id;
  const body = req.body || {};

  try {
    // Verificar que existe el registro
    const { rows: existingRows } = await pool.query(
      'SELECT id FROM banking_info WHERE lead_id = $1 LIMIT 1',
      [leadId]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ message: 'No hay información bancaria para este lead.' });
    }

    // Construir campos a actualizar dinámicamente
    const updates = [];
    const values = [];
    let paramIndex = 1;

    const fieldMappings = {
      'routingNumber': 'routing_number',
      'routing_number': 'routing_number',
      'accountNumber': 'account_number',
      'account_number': 'account_number',
      'accountType': 'account_type',
      'account_type': 'account_type',
      'bankName': 'bank_name',
      'bank_name': 'bank_name',
      'bankPhone': 'bank_phone',
      'bank_phone': 'bank_phone',
      'bankAddress': 'bank_address',
      'bank_address': 'bank_address',
      'bankAddress2': 'bank_address2',
      'bank_address2': 'bank_address2',
      'bankCity': 'bank_city',
      'bank_city': 'bank_city',
      'bankState': 'bank_state',
      'bank_state': 'bank_state',
      'bankZip': 'bank_zip',
      'bank_zip': 'bank_zip',
      'nameOnAccount': 'name_on_account',
      'name_on_account': 'name_on_account',
      'mothersMaidenName': 'mothers_maiden_name',
      'mothers_maiden_name': 'mothers_maiden_name',
      'ssNumber': 'ss_number',
      'ss_number': 'ss_number',
      'relationshipToCustomer': 'relationship_to_customer',
      'relationship_to_customer': 'relationship_to_customer',
      'email': 'email',
      'address': 'address',
      'address2': 'address2',
      'initialPaymentAmount': 'initial_payment_amount',
      'initial_payment_amount': 'initial_payment_amount',
      'paymentDayOfMonth': 'payment_day_of_month',
      'payment_day_of_month': 'payment_day_of_month'
    };

    for (const [clientKey, dbKey] of Object.entries(fieldMappings)) {
      if (Object.prototype.hasOwnProperty.call(body, clientKey)) {
        let value = body[clientKey];
        
        // Normalizar valores
        if (['initialPaymentAmount', 'initial_payment_amount'].includes(clientKey)) {
          value = parseFloat(value) || 0;
        } else if (['paymentDayOfMonth', 'payment_day_of_month'].includes(clientKey)) {
          value = Math.min(31, Math.max(1, parseInt(value, 10) || 1));
        } else if (clientKey === 'dob') {
          value = isValidISODate(value) ? value : null;
        } else if (typeof value === 'string') {
          value = value.trim() || null;
        }

        updates.push(`${dbKey} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No hay campos para actualizar.' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(leadId);

    const { rows } = await pool.query(
      `UPDATE banking_info SET ${updates.join(', ')} WHERE lead_id = $${paramIndex} RETURNING *`,
      values
    );

    res.json({ 
      banking: rows[0], 
      message: 'Información bancaria actualizada correctamente.' 
    });
  } catch (error) {
    console.error('Error al actualizar información bancaria:', error);
    res.status(500).json({ message: 'Error al actualizar información bancaria.' });
  }
});

// ============================================
// ENDPOINTS: Bank Routing Number Lookup (API Ninjas)
// ============================================

// Buscar banco por nombre (solo cache local - API Ninjas requiere premium para búsqueda)
app.get('/api/bank-lookup/search', async (req, res) => {
  const { name } = req.query;
  
  if (!name) {
    return res.status(400).json({ message: 'Se requiere el parámetro name' });
  }
  
  try {
    // Buscar solo en cache local (API Ninjas búsqueda requiere premium)
    const { rows } = await pool.query(
      `SELECT routing_number, bank_name, city, state, zip_code, phone, address 
       FROM bank_routing_numbers 
       WHERE bank_name ILIKE $1 
       ORDER BY bank_name 
       LIMIT 20`,
      [`%${name}%`]
    );
    
    res.json({ 
      banks: rows, 
      source: 'local',
      count: rows.length,
      note: rows.length === 0 ? 'Banco no encontrado en base de datos local. Ingresa el routing number manualmente.' : null
    });
    
  } catch (error) {
    console.error('Error buscando banco:', error);
    res.status(500).json({ message: 'Error buscando información del banco.' });
  }
});

// Buscar banco por routing number (con cache local)
app.get('/api/bank-lookup/:routingNumber', async (req, res) => {
  const { routingNumber } = req.params;
  
  // Validar formato de routing number (9 dígitos)
  if (!/^\d{9}$/.test(routingNumber)) {
    return res.status(400).json({ message: 'Routing number inválido. Debe tener 9 dígitos.' });
  }
  
  try {
    // Primero buscar en cache local
    const { rows } = await pool.query(
      `SELECT routing_number, bank_name, city, state, zip_code, phone, address 
       FROM bank_routing_numbers 
       WHERE routing_number = $1 
       LIMIT 1`,
      [routingNumber]
    );
    
    if (rows.length > 0) {
      return res.json({ 
        bank: rows[0], 
        source: 'local' 
      });
    }
    
    // Si no está en cache, llamar a API Ninjas
    const API_NINJAS_KEY = 'NEEIpoP244A9BzZsVGtjCfWh34fS1C8XpPkQcfF9';
    const response = await fetch(`https://api.api-ninjas.com/v1/routingnumber?routing_number=${routingNumber}`, {
      headers: { 'X-Api-Key': API_NINJAS_KEY }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ message: 'Routing number no encontrado.' });
      }
      throw new Error(`API Ninjas error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'Routing number no encontrado.' });
    }
    
    const bank = data[0];
    
    // Guardar en cache local
    try {
      await pool.query(
        `INSERT INTO bank_routing_numbers 
         (routing_number, bank_name, city, state, zip_code, phone, address, source) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'api_ninjas')
         ON CONFLICT (routing_number) DO UPDATE SET
         bank_name = EXCLUDED.bank_name,
         city = EXCLUDED.city,
         state = EXCLUDED.state,
         zip_code = EXCLUDED.zip_code,
         phone = EXCLUDED.phone,
         address = EXCLUDED.address,
         updated_at = CURRENT_TIMESTAMP`,
        [
          bank.routing_number,
          bank.bank_name || bank.customer_name || 'Unknown Bank',
          bank.city,
          bank.state,
          bank.zip_code,
          bank.phone_number,
          bank.street_address
        ]
      );
    } catch (cacheError) {
      console.log('Error caching bank:', cacheError.message);
    }
    
    res.json({ 
      bank: bank, 
      source: 'api_ninjas' 
    });
    
  } catch (error) {
    console.error('Error buscando routing number:', error);
    res.status(500).json({ message: 'Error buscando información del banco.' });
  }
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.get('/client.html', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'client.html'));
});

async function startServer() {
  await runMigrations();

  app.listen(PORT, () => {
    console.log(`Servidor activo en http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Error de arranque:', error.message);
  process.exit(1);
});
