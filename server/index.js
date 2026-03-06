const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const crypto = require('crypto');
const { spawn } = require('child_process');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const deepl = require('deepl-node');

// Cargar .env desde el directorio padre (raíz del proyecto)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_API_PATHS = new Set(['/health', '/auth/login', '/auth/refresh', '/auth/logout']);
const ACCESS_TOKEN_EXPIRES_IN = cleanText(process.env.JWT_EXPIRES_IN, 40) || '15m';

// Configurar DeepL si hay API Key
let deeplTranslator = null;
if (process.env.DEEPL_API_KEY) {
  deeplTranslator = new deepl.Translator(process.env.DEEPL_API_KEY);
  console.log('[Sistema] DeepL API configurada correctamente.');
}
const REFRESH_COOKIE_NAME = 'project_gw_refresh_token';
const REFRESH_COOKIE_PATH = '/api/auth';
const REFRESH_TOKEN_TTL_DAYS = parsePositiveInt(process.env.REFRESH_TOKEN_TTL_DAYS, 14, 1, 60);
const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_BYTES = 48;
const DEFAULT_CORS_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

function buildCorsOptions() {
  const configuredRaw = cleanText(process.env.CORS_ORIGIN, 4000);
  const configuredOrigins = configuredRaw
    .split(',')
    .map((value) => cleanText(value, 300))
    .filter(Boolean);
  const fallbackOrigins = Array.from(DEFAULT_CORS_ORIGINS);
  const allowAll = configuredOrigins.includes('*');
  const allowedOrigins = allowAll
    ? []
    : new Set(configuredOrigins.length ? configuredOrigins : fallbackOrigins);

  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowAll || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error('Origen no permitido por CORS.'));
    }
  };
}

app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: '20mb' }));
app.use(express.static(ROOT_DIR));
app.use((req, res, next) => {
  const incomingRequestId = cleanText(req.headers?.['x-request-id'], 120);
  const generatedId = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `req-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  const requestId = incomingRequestId || generatedId;
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

function getJwtSecret() {
  const configuredSecret = cleanText(process.env.JWT_SECRET, 500);
  if (!configuredSecret) {
    throw new Error('JWT_SECRET no esta configurado. Define JWT_SECRET en .env');
  }
  return configuredSecret;
}

function buildAuthToken(user) {
  const normalizedId = Number(user?.id);
  const normalizedSessionId = Number(user?.sessionId);
  return jwt.sign(
    {
      id: Number.isInteger(normalizedId) && normalizedId > 0 ? normalizedId : undefined,
      sid: Number.isInteger(normalizedSessionId) && normalizedSessionId > 0 ? normalizedSessionId : undefined,
      username: cleanText(user?.username, 120).toLowerCase(),
      displayName: cleanText(user?.displayName || user?.username, 120),
      email: cleanText(user?.email, 160).toLowerCase(),
      role: normalizeRoleValue(user?.role)
    },
    getJwtSecret(),
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
}

function readBearerToken(req) {
  const headerValue = String(req.headers?.authorization || '').trim();
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

async function requireAuth(req, res, next) {
  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ message: 'No autorizado. Inicia sesion.' });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    const userId = Number(payload?.id);
    const sessionId = Number(payload?.sid);
    const username = cleanText(payload?.username, 120).toLowerCase();
    const displayName = cleanText(payload?.displayName, 120);
    const email = cleanText(payload?.email, 160).toLowerCase();
    const hasValidUserId = Number.isInteger(userId) && userId > 0;
    const hasValidSessionId = Number.isInteger(sessionId) && sessionId > 0;

    if (!hasValidUserId || !hasValidSessionId) {
      return res.status(401).json({ message: 'Sesion invalida u obsoleta. Inicia sesion nuevamente.' });
    }

    const { rows } = await pool.query(
      `SELECT s.id AS session_id, s.user_id, s.revoked_at, s.refresh_token_expires_at,
              u.username, u.display_name, u.email, u.role, u.is_active
       FROM auth_sessions s
       JOIN app_users u ON u.id = s.user_id
       WHERE s.id = $1
       LIMIT 1`,
      [sessionId]
    );

    if (!rows.length) {
      return res.status(401).json({ message: 'Sesion no encontrada. Inicia sesion nuevamente.' });
    }

    const row = rows[0];
    const dbUserId = Number(row.user_id);
    if (!Number.isInteger(dbUserId) || dbUserId !== userId) {
      return res.status(401).json({ message: 'Sesion invalida. Inicia sesion nuevamente.' });
    }
    if (!row.is_active) {
      return res.status(401).json({ message: 'Tu usuario esta inactivo.' });
    }
    if (row.revoked_at) {
      return res.status(401).json({ message: 'Sesion cerrada. Inicia sesion nuevamente.' });
    }
    if (row.refresh_token_expires_at && new Date(row.refresh_token_expires_at).getTime() <= Date.now()) {
      return res.status(401).json({ message: 'Sesion expirada. Inicia sesion nuevamente.' });
    }

    const dbUsername = normalizeUsername(row.username);
    const dbDisplayName = cleanText(row.display_name || row.username, 120);
    const dbEmail = cleanText(row.email, 160).toLowerCase();
    const role = inferRoleFromIdentity({
      role: row.role,
      username: dbUsername,
      displayName: dbDisplayName,
      email: dbEmail
    });

    req.auth = {
      id: dbUserId,
      sessionId,
      username: dbUsername,
      displayName: dbDisplayName,
      email: dbEmail,
      role,
      tokenRole: inferRoleFromIdentity({
        role: payload?.role,
        username,
        displayName,
        email
      })
    };
    return next();
  } catch (error) {
    if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Sesion expirada o invalida. Inicia sesion nuevamente.' });
    }
    console.error('Error al validar sesion:', error);
    return res.status(401).json({ message: 'Sesion expirada o invalida. Inicia sesion nuevamente.' });
  }
}

app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (PUBLIC_API_PATHS.has(req.path)) return next();
  return void requireAuth(req, res, next);
});

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
const NOTE_COLOR_TAGS = new Set(['yellow', 'red', 'green', 'blue', 'gray']);
const FILE_DOCUMENT_CATEGORIES = new Set([
  'official_document',
  'credit_report',
  'income_proof',
  'bank_statement',
  'contract',
  'other'
]);
const FILE_ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
const FILE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const CONTRACT_TEMPLATE_PATH = path.join(ROOT_DIR, 'reference', 'contrato ejemplo.pdf');
const CONTRACT_GENERATOR_SCRIPT_PATH = path.join(ROOT_DIR, 'scripts', 'generate_contract_pdf.py');
const CONTRACT_MAX_CREDITORS = 36;
const CONTRACT_LEGAL_MONTHLY_FEE = 24.99;
let sentEmailsSchemaReady = false;
let sentEmailsSchemaPromise = null;
const PERMISSION_CATALOG = [
  { key: 'users.manage', module: 'usuarios', label: 'Gestionar usuarios', description: 'Crear, editar, activar o desactivar usuarios.' },
  { key: 'users.permissions.manage', module: 'usuarios', label: 'Gestionar permisos', description: 'Asignar o revocar permisos granulares por usuario.' },
  { key: 'leads.view_all', module: 'leads', label: 'Ver todos los leads', description: 'Acceso global al listado de leads.' },
  { key: 'leads.view_assigned', module: 'leads', label: 'Ver leads asignados', description: 'Ver leads asignados al usuario.' },
  { key: 'leads.create', module: 'leads', label: 'Crear leads', description: 'Crear nuevos leads.' },
  { key: 'leads.edit', module: 'leads', label: 'Editar leads', description: 'Modificar datos de leads.' },
  { key: 'leads.assign', module: 'leads', label: 'Asignar leads', description: 'Reasignar leads a otros usuarios.' },
  { key: 'leads.delete', module: 'leads', label: 'Eliminar leads', description: 'Eliminar leads del sistema.' },
  { key: 'notes.manage', module: 'leads', label: 'Gestionar notas', description: 'Crear, editar y eliminar notas de leads.' },
  { key: 'emails.view_all', module: 'correos', label: 'Ver todos los correos', description: 'Acceso global al historial de correos.' },
  { key: 'emails.send', module: 'correos', label: 'Enviar/registrar correos', description: 'Registrar y enviar correos desde el CRM.' },
  { key: 'emails.delete', module: 'correos', label: 'Eliminar correos', description: 'Eliminar correos individuales o en lote.' },
  { key: 'callbacks.view_all', module: 'operacion', label: 'Ver callbacks globales', description: 'Ver callbacks de todos los asesores.' },
  { key: 'callbacks.complete_assigned', module: 'operacion', label: 'Completar callbacks asignados', description: 'Completar callbacks de leads asignados.' },
  { key: 'files.manage', module: 'documentos', label: 'Gestionar archivos', description: 'Subir, consultar y eliminar archivos de leads.' },
  { key: 'tasks.manage', module: 'operacion', label: 'Gestionar tareas', description: 'Crear y actualizar tareas operativas.' },
  { key: 'audit.view', module: 'auditoria', label: 'Ver auditoria', description: 'Consultar y exportar bitacora de auditoria.' }
];
const PERMISSION_KEYS = new Set(PERMISSION_CATALOG.map((entry) => entry.key));
const ROLE_PERMISSION_MATRIX = {
  admin: {
    'users.manage': true,
    'users.permissions.manage': true,
    'leads.view_all': true,
    'leads.view_assigned': true,
    'leads.create': true,
    'leads.edit': true,
    'leads.assign': true,
    'leads.delete': true,
    'notes.manage': true,
    'emails.view_all': true,
    'emails.send': true,
    'emails.delete': true,
    'callbacks.view_all': true,
    'callbacks.complete_assigned': true,
    'files.manage': true,
    'tasks.manage': true,
    'audit.view': true
  },
  supervisor: {
    'users.manage': false,
    'users.permissions.manage': false,
    'leads.view_all': true,
    'leads.view_assigned': true,
    'leads.create': true,
    'leads.edit': true,
    'leads.assign': true,
    'leads.delete': true,
    'notes.manage': true,
    'emails.view_all': true,
    'emails.send': true,
    'emails.delete': true,
    'callbacks.view_all': true,
    'callbacks.complete_assigned': true,
    'files.manage': true,
    'tasks.manage': true,
    'audit.view': true
  },
  seller: {
    'users.manage': false,
    'users.permissions.manage': false,
    'leads.view_all': false,
    'leads.view_assigned': true,
    'leads.create': true,
    'leads.edit': true,
    'leads.assign': false,
    'leads.delete': false,
    'notes.manage': true,
    'emails.view_all': false,
    'emails.send': true,
    'emails.delete': false,
    'callbacks.view_all': false,
    'callbacks.complete_assigned': true,
    'files.manage': true,
    'tasks.manage': true,
    'audit.view': false
  }
};

const AUDIT_REDACTED_KEYS = new Set([
  'pin',
  'pin_hash',
  'pin_salt',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'refresh_token_hash',
  'authorization',
  'cookie',
  'ssn',
  'co_applicant_ssn'
]);

const VALID_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC', 'PR'
]);
const ZIP_LOOKUP_TIMEOUT_MS = 5000;
const ZIP_LOOKUP_CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const zipLookupCache = new Map();
const CREDIT_REPORT_AI_TIMEOUT_MS = 25000;
const CREDIT_REPORT_AI_MAX_TEXT_CHARS = 120000;
const CREDIT_REPORT_AI_MODEL = process.env.GEMINI_MODEL || 'gemini-pro';
const HARDSHIP_AI_TIMEOUT_MS = 10000;
const HARDSHIP_AI_MAX_RETRIES = 1;
const HARDSHIP_AI_MAX_TEXT_CHARS = 5000;
const HARDSHIP_AI_MODEL = process.env.GEMINI_MODEL || 'gemini-pro';
const HARDSHIP_REASON_LABELS = {
  loss_of_income: 'Loss of Income',
  medical: 'Medical Issues',
  divorce: 'Divorce / Separation',
  inflation: 'Inflation / Cost of Living',
  business_failure: 'Business Failure',
  unexpected_expenses: 'Unexpected Expenses',
  other: 'Other'
};
const PIPELINE_STAGE_CATALOG = [
  { key: 'new', label: 'Nuevo', order: 1, terminal: false },
  { key: 'contact', label: 'Contacto', order: 2, terminal: false },
  { key: 'docs', label: 'Documentos', order: 3, terminal: false },
  { key: 'underwriting', label: 'Underwriting', order: 4, terminal: false },
  { key: 'closing', label: 'Cierre', order: 5, terminal: false },
  { key: 'won', label: 'Ganado', order: 6, terminal: true },
  { key: 'lost', label: 'Perdido', order: 7, terminal: true }
];
const PIPELINE_STATUS_CATALOG = [
  { key: 'new_lead', label: 'New Lead', stageKey: 'new' },
  { key: 'new', label: 'New', stageKey: 'new' },
  { key: 'new_duplicate', label: 'New Duplicate', stageKey: 'new' },
  { key: 'test', label: 'Test', stageKey: 'new' },

  { key: 'attempting_contact_typo', label: 'Attempring contact', stageKey: 'contact' },
  { key: 'warm', label: 'Warm', stageKey: 'contact' },
  { key: 'contacted_warm', label: 'Contacted Warm', stageKey: 'contact' },
  { key: 'meeting', label: 'Meeting', stageKey: 'contact' },
  { key: 'nurture', label: 'Nurture', stageKey: 'contact' },
  { key: 'hotlist', label: 'Hotlist', stageKey: 'contact' },
  { key: 'ca_hold', label: 'CA Hold', stageKey: 'contact' },
  { key: 'looking_for_a_loan', label: 'Looking for a loan', stageKey: 'contact' },

  { key: 'docs_sent', label: 'Docs sent', stageKey: 'docs' },
  { key: 'docs_back', label: 'Docs back', stageKey: 'docs' },

  { key: 'submitted_to_uw', label: 'Submitted to UW', stageKey: 'underwriting' },

  { key: 'sent_to_debtmanager', label: 'Sent to DebtManager', stageKey: 'closing' },

  { key: 'banking', label: 'Banking', stageKey: 'won' },
  { key: 'transferred_to_cccf', label: 'Transferred to CCCF', stageKey: 'won' },

  { key: 'uw_reject', label: 'UW Reject', stageKey: 'lost' },
  { key: 'bad_number', label: 'Bad number', stageKey: 'lost' },
  { key: 'bad_state', label: 'bad state', stageKey: 'lost' },
  { key: 'dead', label: 'Dead', stageKey: 'lost' },
  { key: 'dnc', label: 'DNC', stageKey: 'lost' },
  { key: 'not_interested', label: 'Not interested', stageKey: 'lost' },
  { key: 'nq_debt_type', label: 'NQ Debt type', stageKey: 'lost' },
  { key: 'nq_language', label: 'NQ language', stageKey: 'lost' },
  { key: 'nq_cant_afford', label: 'NQ Can\'t afford', stageKey: 'lost' },
  { key: 'nq_debt_amount', label: 'NQ Debt Amount', stageKey: 'lost' }
];
const PIPELINE_STATUS_ALIAS_TO_KEY = new Map([
  ['attempting contact', 'attempting_contact_typo']
]);
const PIPELINE_STAGE_TRANSITIONS = new Map([
  ['new', new Set(['new', 'contact', 'docs', 'lost'])],
  ['contact', new Set(['contact', 'docs', 'underwriting', 'closing', 'won', 'lost'])],
  ['docs', new Set(['contact', 'docs', 'underwriting', 'closing', 'won', 'lost'])],
  ['underwriting', new Set(['contact', 'docs', 'underwriting', 'closing', 'won', 'lost'])],
  ['closing', new Set(['contact', 'docs', 'closing', 'won', 'lost'])],
  ['won', new Set(['won', 'closing', 'contact', 'lost'])],
  ['lost', new Set(['lost', 'contact', 'new'])]
]);
const PIPELINE_STAGE_BY_KEY = new Map(PIPELINE_STAGE_CATALOG.map((entry) => [entry.key, entry]));
const PIPELINE_STATUS_BY_KEY = new Map(PIPELINE_STATUS_CATALOG.map((entry) => [entry.key, entry]));
const PIPELINE_STATUS_BY_TOKEN = new Map(
  PIPELINE_STATUS_CATALOG.map((entry) => [normalizePipelineStatusToken(entry.label), entry])
);
const PIPELINE_WON_STAGE_KEYS = new Set(['won']);
const PIPELINE_LOST_STAGE_KEYS = new Set(['lost']);
const TASK_TYPE_VALUES = new Set(['general', 'callback']);
const TASK_PRIORITY_VALUES = new Set(['low', 'normal', 'high', 'urgent']);
const TASK_STATUS_VALUES = new Set(['pending', 'in_progress', 'completed', 'cancelled', 'escalated']);
const TASK_RECURRENCE_RULE_VALUES = new Set(['none', 'daily', 'weekly', 'monthly']);
const TASK_LIST_LIMIT_DEFAULT = 500;
const TASK_LIST_LIMIT_MAX = 1000;
const TASK_DEFAULT_SLA_MINUTES = parsePositiveInt(process.env.TASK_DEFAULT_SLA_MINUTES, 1440, 30, 10080);
const TASK_ESCALATION_INTERVAL_MS = parsePositiveInt(process.env.TASK_ESCALATION_INTERVAL_MS, 120000, 30000, 3600000);
const TASK_ESCALATION_COOLDOWN_MINUTES = parsePositiveInt(process.env.TASK_ESCALATION_COOLDOWN_MINUTES, 30, 5, 1440);
let taskEscalationIntervalHandle = null;
let taskEscalationInProgress = false;

const LEAD_SELECT_COLUMNS = `
  id, case_id, full_name, co_applicant_name, co_applicant_email, co_applicant_home_phone, co_applicant_cell_phone, co_applicant_dob, co_applicant_ssn,
  co_applicant_currently_employed, co_applicant_employer_name, co_applicant_occupation, co_applicant_self_employed,
  include_coapp_in_contract, fico_score_applicant, fico_score_coapp,
  calc_total_debt, calc_settlement_percent, calc_program_fee_percent, calc_bank_fee, calc_months, calc_legal_plan_enabled, calc_payment_frequency,
  email, phone, home_phone, cell_phone,
  source, state_code, dob, ssn, address_street, city, zip_code, best_time,
  currently_employed, employer_name, occupation, self_employed,
  status, is_test, notes, related_lead_id, assigned_to, first_deposit_date, callback_date, callback_completed_at, created_at, updated_at
`;
const LEAD_AUDIT_UNDOABLE_COLUMNS = new Set([
  'full_name',
  'co_applicant_name',
  'co_applicant_email',
  'co_applicant_home_phone',
  'co_applicant_cell_phone',
  'co_applicant_dob',
  'co_applicant_ssn',
  'co_applicant_currently_employed',
  'co_applicant_employer_name',
  'co_applicant_occupation',
  'co_applicant_self_employed',
  'include_coapp_in_contract',
  'fico_score_applicant',
  'fico_score_coapp',
  'calc_total_debt',
  'calc_settlement_percent',
  'calc_program_fee_percent',
  'calc_bank_fee',
  'calc_months',
  'calc_legal_plan_enabled',
  'calc_payment_frequency',
  'email',
  'phone',
  'home_phone',
  'cell_phone',
  'source',
  'state_code',
  'dob',
  'ssn',
  'address_street',
  'city',
  'zip_code',
  'best_time',
  'currently_employed',
  'employer_name',
  'occupation',
  'self_employed',
  'status',
  'is_test',
  'notes',
  'related_lead_id',
  'assigned_to',
  'first_deposit_date',
  'callback_date',
  'callback_completed_at'
]);
const LEAD_AUDIT_IGNORED_DIFF_FIELDS = new Set([
  'calc_total_debt',
  'state_type',
  'updated_at',
  'created_at'
]);
const LEAD_AUDIT_PAYMENT_FIELDS = new Set([
  'first_deposit_date',
  'calc_settlement_percent',
  'calc_program_fee_percent',
  'calc_bank_fee',
  'calc_months',
  'calc_legal_plan_enabled',
  'calc_payment_frequency'
]);

function getStateTypeFromCode(stateCode) {
  const normalized = String(stateCode || '').toUpperCase().trim();
  if (GREEN_STATES_SET.has(normalized)) return 'Green';
  if (NOT_ELIGIBLE_STATES_SET.has(normalized)) return 'Not Eligible';
  return 'Red';
}

function getProgramFeePercentForState(stateCode) {
  return getStateTypeFromCode(stateCode) === 'Green' ? 25 : 29.5;
}

function applyLeadDerivedFields(lead) {
  if (!lead || typeof lead !== 'object') return lead;
  lead.state_type = getStateTypeFromCode(lead.state_code);
  const stageKey = getLeadStageKey(lead.status);
  const stage = stageKey ? PIPELINE_STAGE_BY_KEY.get(stageKey) || null : null;
  lead.pipeline_stage_key = stageKey;
  lead.pipeline_stage_label = stage?.label || null;
  return lead;
}

async function createNotification(recipientUsername, type, title, body, leadId) {
  const normalizedRecipient = cleanText(recipientUsername, 120).toLowerCase();
  if (!normalizedRecipient) return;
  await pool.query(
    `INSERT INTO notifications (recipient_username, type, title, body, lead_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [normalizedRecipient, type, title.slice(0, 120), body.slice(0, 500), leadId || null]
  );
}

async function createLeadAssignmentNotification(recipientUsername, lead) {
  const normalizedRecipient = cleanText(recipientUsername, 120).toLowerCase();
  if (!normalizedRecipient) return;

  const caseLabel = lead?.case_id ? `Caso #${lead.case_id}` : `Lead #${lead?.id || ''}`;
  const leadName = cleanText(lead?.full_name, 120) || 'Sin nombre';
  const singleTitle = 'Se te asigno un lead';
  const singleBody = `${caseLabel} - ${leadName} fue asignado a ti.`;
  const groupedTitle = 'se te han asignado leads';
  const groupedBody = 'Tienes nuevos leads asignados. Abre la pantalla de Leads para marcarlos.';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: unreadAssignmentRows } = await client.query(
      `SELECT id, type
       FROM notifications
       WHERE lower(recipient_username) = $1
         AND read_at IS NULL
         AND type IN ('lead_assigned', 'leads_assigned')
       ORDER BY created_at DESC`,
      [normalizedRecipient]
    );

    const hasGroupedUnread = unreadAssignmentRows.some((row) => row.type === 'leads_assigned');
    if (hasGroupedUnread) {
      await client.query(
        `DELETE FROM notifications
         WHERE lower(recipient_username) = $1
           AND read_at IS NULL
           AND type = 'lead_assigned'`,
        [normalizedRecipient]
      );
      await client.query('COMMIT');
      return;
    }

    const unreadSingleIds = unreadAssignmentRows
      .filter((row) => row.type === 'lead_assigned')
      .map((row) => Number(row.id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (unreadSingleIds.length >= 2) {
      await client.query(
        `DELETE FROM notifications
         WHERE id = ANY($1::bigint[])`,
        [unreadSingleIds]
      );
      await client.query(
        `INSERT INTO notifications (recipient_username, type, title, body, lead_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [normalizedRecipient, 'leads_assigned', groupedTitle, groupedBody, null]
      );
      await client.query('COMMIT');
      return;
    }

    await client.query(
      `INSERT INTO notifications (recipient_username, type, title, body, lead_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [normalizedRecipient, 'lead_assigned', singleTitle.slice(0, 120), singleBody.slice(0, 500), lead?.id || null]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function cleanText(value, maxLength) {
  const text = String(value || '').trim();
  return text.slice(0, maxLength);
}

function normalizeUsername(value) {
  return cleanText(value, 120).toLowerCase();
}

function createPinHash(pin, saltHex = crypto.randomBytes(16).toString('hex')) {
  const hashHex = crypto.scryptSync(String(pin || ''), saltHex, 64).toString('hex');
  return { pinSalt: saltHex, pinHash: hashHex };
}

function verifyPinHash(pin, pinSalt, pinHash) {
  if (!pinSalt || !pinHash) return false;
  try {
    const computed = Buffer.from(crypto.scryptSync(String(pin || ''), String(pinSalt), 64).toString('hex'), 'hex');
    const expected = Buffer.from(String(pinHash), 'hex');
    if (computed.length !== expected.length) return false;
    return crypto.timingSafeEqual(computed, expected);
  } catch (_error) {
    return false;
  }
}

function hashRefreshToken(refreshToken) {
  return crypto.createHash('sha256').update(String(refreshToken || '')).digest('hex');
}

function createRefreshToken() {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

function getRefreshCookieBaseOptions() {
  const env = cleanText(process.env.NODE_ENV, 40).toLowerCase();
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env === 'production',
    path: REFRESH_COOKIE_PATH
  };
}

function setRefreshTokenCookie(res, refreshToken) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...getRefreshCookieBaseOptions(),
    maxAge: REFRESH_TOKEN_TTL_MS
  });
}

function clearRefreshTokenCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieBaseOptions());
}

function parseCookiesFromRequest(req) {
  const headerValue = String(req.headers?.cookie || '').trim();
  if (!headerValue) return {};

  return headerValue
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex <= 0) return acc;
      const key = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      if (!key) return acc;
      try {
        acc[key] = decodeURIComponent(value);
      } catch (_error) {
        acc[key] = value;
      }
      return acc;
    }, {});
}

function readRefreshToken(req) {
  const cookies = parseCookiesFromRequest(req);
  const cookieToken = cleanText(cookies[REFRESH_COOKIE_NAME], 700);
  const headerToken = cleanText(req.headers?.['x-refresh-token'], 700);
  return cookieToken || headerToken || '';
}

function getRequestIp(req) {
  const forwarded = cleanText(req.headers?.['x-forwarded-for'], 200);
  if (forwarded) {
    const firstIp = forwarded.split(',')[0];
    return cleanText(firstIp, 80) || null;
  }
  const remoteAddress = cleanText(req.socket?.remoteAddress, 80);
  return remoteAddress || null;
}

function normalizeAuditEntityId(value) {
  if (value === undefined || value === null) return null;
  const text = cleanText(value, 120);
  return text || null;
}

function toAuditSafeValue(value, depth = 0) {
  if (value === undefined || value === null) return null;
  if (depth > 5) return '[MAX_DEPTH]';

  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isNaN(timestamp) ? null : value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return `[BUFFER:${value.length}]`;
  }

  const primitiveType = typeof value;
  if (primitiveType === 'string') return value.slice(0, 4000);
  if (primitiveType === 'number') return Number.isFinite(value) ? value : null;
  if (primitiveType === 'boolean') return value;
  if (primitiveType === 'bigint') return String(value);

  if (Array.isArray(value)) {
    return value.slice(0, 200).map((entry) => toAuditSafeValue(entry, depth + 1));
  }

  if (primitiveType === 'object') {
    const out = {};
    const entries = Object.entries(value).slice(0, 250);
    entries.forEach(([rawKey, rawValue]) => {
      const key = cleanText(rawKey, 120);
      if (!key) return;
      const normalizedKey = key.toLowerCase();
      if (AUDIT_REDACTED_KEYS.has(normalizedKey)) {
        out[key] = '[REDACTED]';
        return;
      }
      out[key] = toAuditSafeValue(rawValue, depth + 1);
    });
    return out;
  }

  return null;
}

async function writeAuditLog({
  req,
  action,
  entityType,
  entityId = null,
  before = null,
  after = null,
  metadata = null,
  client = pool
}) {
  const normalizedAction = cleanText(action, 120).toLowerCase();
  const normalizedEntityType = cleanText(entityType, 80).toLowerCase();
  if (!normalizedAction || !normalizedEntityType) return;

  const actorId = Number(req?.auth?.id);
  const actorUserId = Number.isInteger(actorId) && actorId > 0 ? actorId : null;
  const actorUsername = cleanText(req?.auth?.username, 120).toLowerCase() || null;
  const requestId = cleanText(req?.requestId || req?.headers?.['x-request-id'], 120) || null;
  const routePath = cleanText(
    `${req?.baseUrl || ''}${req?.route?.path || req?.path || req?.originalUrl || ''}`,
    200
  ) || null;
  const beforeSafe = toAuditSafeValue(before);
  const afterSafe = toAuditSafeValue(after);
  const metadataSafe = toAuditSafeValue(metadata);

  const values = [
    actorUserId,
    actorUsername,
    normalizedAction,
    normalizedEntityType,
    normalizeAuditEntityId(entityId),
    requestId,
    getRequestIp(req),
    cleanText(req?.method, 10) || null,
    routePath,
    beforeSafe === null ? null : JSON.stringify(beforeSafe),
    afterSafe === null ? null : JSON.stringify(afterSafe),
    metadataSafe === null ? null : JSON.stringify(metadataSafe)
  ];

  try {
    await client.query(
      `INSERT INTO audit_log (
         actor_user_id, actor_username, action, entity_type, entity_id, request_id,
         ip_address, http_method, route_path, before_data, after_data, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb)`,
      values
    );
  } catch (error) {
    console.error('Error al registrar audit_log:', error);
  }
}

function mapAuthUserForClient(user) {
  return {
    id: Number(user?.id),
    username: normalizeUsername(user?.username),
    displayName: cleanText(user?.displayName || user?.display_name || user?.username, 120),
    role: normalizeRoleValue(user?.role) || 'seller',
    email: cleanText(user?.email, 160).toLowerCase() || null
  };
}

async function createAuthSession(userId, req, client = pool) {
  const refreshToken = createRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
  const ipAddress = getRequestIp(req);
  const userAgent = cleanText(req.headers?.['user-agent'], 300) || null;

  const { rows } = await client.query(
    `INSERT INTO auth_sessions (
       user_id, refresh_token_hash, refresh_token_expires_at,
       created_ip, created_user_agent, last_seen_at
     ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     RETURNING id, refresh_token_expires_at`,
    [userId, refreshTokenHash, expiresAt, ipAddress, userAgent]
  );

  return {
    id: Number(rows[0].id),
    refreshToken,
    refreshTokenExpiresAt: rows[0].refresh_token_expires_at
  };
}

async function revokeAuthSessionById(sessionId, reason = 'logout', client = pool) {
  const normalizedSessionId = Number(sessionId);
  if (!Number.isInteger(normalizedSessionId) || normalizedSessionId <= 0) return 0;
  const { rowCount } = await client.query(
    `UPDATE auth_sessions
     SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
         revoked_reason = COALESCE(revoked_reason, $2),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [normalizedSessionId, cleanText(reason, 160) || 'logout']
  );
  return Number(rowCount || 0);
}

async function revokeAuthSessionByRefreshToken(refreshToken, reason = 'logout', client = pool) {
  const tokenHash = hashRefreshToken(refreshToken);
  if (!tokenHash) return 0;
  const { rowCount } = await client.query(
    `UPDATE auth_sessions
     SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
         revoked_reason = COALESCE(revoked_reason, $2),
         updated_at = CURRENT_TIMESTAMP
     WHERE refresh_token_hash = $1`,
    [tokenHash, cleanText(reason, 160) || 'logout']
  );
  return Number(rowCount || 0);
}

async function rotateAuthSessionByRefreshToken(refreshToken, req) {
  const tokenHash = hashRefreshToken(refreshToken);
  if (!tokenHash) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT s.id AS session_id, s.user_id, s.revoked_at, s.refresh_token_expires_at,
              u.id AS user_id_ref, u.username, u.display_name, u.role, u.email, u.is_active
       FROM auth_sessions s
       JOIN app_users u ON u.id = s.user_id
       WHERE s.refresh_token_hash = $1
       LIMIT 1
       FOR UPDATE`,
      [tokenHash]
    );

    if (!rows.length) {
      await client.query('ROLLBACK');
      return null;
    }

    const current = rows[0];
    const expiresAt = new Date(current.refresh_token_expires_at).getTime();
    if (!current.is_active || current.revoked_at || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      await revokeAuthSessionById(current.session_id, 'refresh_expired_or_revoked', client);
      await client.query('COMMIT');
      return null;
    }

    const nextSession = await createAuthSession(current.user_id, req, client);
    await client.query(
      `UPDATE auth_sessions
       SET revoked_at = CURRENT_TIMESTAMP,
           revoked_reason = 'refresh_rotated',
           replaced_by_session_id = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [current.session_id, nextSession.id]
    );

    await client.query(
      `UPDATE app_users
       SET last_seen_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [current.user_id]
    );

    await client.query(
      `DELETE FROM auth_sessions
       WHERE user_id = $1
         AND revoked_at IS NOT NULL
         AND updated_at < CURRENT_TIMESTAMP - INTERVAL '30 days'`,
      [current.user_id]
    );

    await client.query('COMMIT');
    return {
      session: nextSession,
      user: mapAuthUserForClient({
        id: current.user_id_ref,
        username: current.username,
        displayName: current.display_name,
        role: current.role,
        email: current.email
      })
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function getBootstrapAdminSeed() {
  const username = normalizeUsername(process.env.BOOTSTRAP_ADMIN_USERNAME);
  const pin = String(process.env.BOOTSTRAP_ADMIN_PIN || '').replace(/\D/g, '');
  const displayName = cleanText(process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME || username, 120) || username;
  const email = cleanText(process.env.BOOTSTRAP_ADMIN_EMAIL, 160).toLowerCase() || null;

  const hasAnySeedInput = Boolean(username || pin || displayName || email);
  if (!hasAnySeedInput || (!username && !pin)) return null;

  if (!username) {
    throw new Error('BOOTSTRAP_ADMIN_USERNAME es obligatorio si configuras BOOTSTRAP_ADMIN_PIN.');
  }
  if (pin.length !== 6) {
    throw new Error('BOOTSTRAP_ADMIN_PIN debe tener 6 digitos.');
  }

  return {
    username,
    pin,
    displayName: displayName || username,
    role: 'admin',
    email
  };
}

async function ensureBootstrapAdminSeed() {
  const bootstrapAdmin = getBootstrapAdminSeed();
  if (!bootstrapAdmin) return;

  const { rows } = await pool.query(
    `SELECT id, pin_salt, pin_hash
     FROM app_users
     WHERE username = $1
     LIMIT 1`,
    [bootstrapAdmin.username]
  );

  if (rows.length === 0) {
    const credentials = createPinHash(bootstrapAdmin.pin);
    await pool.query(
      `INSERT INTO app_users (
         username, display_name, role, email, pin_salt, pin_hash, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
      [
        bootstrapAdmin.username,
        bootstrapAdmin.displayName,
        bootstrapAdmin.role,
        bootstrapAdmin.email,
        credentials.pinSalt,
        credentials.pinHash
      ]
    );
    return;
  }

  const current = rows[0];
  const updates = [];
  const values = [];

  if (!current.pin_salt || !current.pin_hash) {
    const credentials = createPinHash(bootstrapAdmin.pin);
    updates.push(`pin_salt = $${updates.length + 1}`);
    values.push(credentials.pinSalt);
    updates.push(`pin_hash = $${updates.length + 1}`);
    values.push(credentials.pinHash);
  }

  updates.push(`display_name = COALESCE(NULLIF(display_name, ''), $${updates.length + 1})`);
  values.push(bootstrapAdmin.displayName);
  updates.push(`role = COALESCE(NULLIF(role, ''), $${updates.length + 1})`);
  values.push(bootstrapAdmin.role);
  updates.push(`email = COALESCE(email, $${updates.length + 1})`);
  values.push(bootstrapAdmin.email);

  values.push(current.id);
  await pool.query(
    `UPDATE app_users
     SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${values.length}`,
    values
  );
}

async function findAuthUser(identifier, pin) {
  const normalizedIdentifier = cleanText(identifier, 160).toLowerCase();
  const normalizedPin = String(pin || '').replace(/\D/g, '');
  if (!normalizedIdentifier || normalizedPin.length !== 6) return null;

  const { rows } = await pool.query(
    `SELECT id, username, display_name, role, email, pin_salt, pin_hash, is_active
     FROM app_users
     WHERE username = $1 OR lower(coalesce(email, '')) = $1
     LIMIT 1`,
    [normalizedIdentifier]
  );

  if (!rows.length) return null;
  const authUser = rows[0];
  if (!authUser.is_active) return null;
  if (!verifyPinHash(normalizedPin, authUser.pin_salt, authUser.pin_hash)) return null;

  return {
    id: Number(authUser.id),
    username: normalizeUsername(authUser.username),
    displayName: cleanText(authUser.display_name || authUser.username, 120),
    role: normalizeRoleValue(authUser.role) || 'seller',
    email: cleanText(authUser.email, 160).toLowerCase() || null
  };
}

function normalizeRoleValue(roleValue) {
  const normalizedRole = String(roleValue || '').trim().toLowerCase();
  if (normalizedRole === 'admin') return 'admin';
  if (normalizedRole === 'supervisor') return 'supervisor';
  if (normalizedRole === 'seller') return 'seller';
  return '';
}

function inferRoleFromIdentity({ role }) {
  const explicitRole = normalizeRoleValue(role);
  if (explicitRole) return explicitRole;
  return '';
}

function isAdminRole(roleValue) {
  return normalizeRoleValue(roleValue) === 'admin';
}

function hasGlobalAccessRole(roleValue) {
  const role = normalizeRoleValue(roleValue);
  return role === 'admin' || role === 'supervisor';
}

function normalizePermissionKey(permissionKey) {
  const normalized = cleanText(permissionKey, 120).toLowerCase();
  if (!normalized || !PERMISSION_KEYS.has(normalized)) return '';
  return normalized;
}

function getRolePermissionBaseMap(roleValue) {
  const normalizedRole = normalizeRoleValue(roleValue) || 'seller';
  const base = ROLE_PERMISSION_MATRIX[normalizedRole] || ROLE_PERMISSION_MATRIX.seller;
  return { ...base };
}

function getRolePermissionBaseValue(roleValue, permissionKey) {
  const normalizedKey = normalizePermissionKey(permissionKey);
  if (!normalizedKey) return false;
  const base = getRolePermissionBaseMap(roleValue);
  return Boolean(base[normalizedKey]);
}

function buildPermissionMatrixForRoles() {
  const roles = ['admin', 'supervisor', 'seller'];
  const matrix = {};
  roles.forEach((role) => {
    matrix[role] = getRolePermissionBaseMap(role);
  });
  return matrix;
}

async function getEffectivePermissionSetForUser(userId, roleValue, client = pool) {
  const normalizedUserId = Number(userId);
  const normalizedRole = normalizeRoleValue(roleValue) || 'seller';
  const effectiveMap = getRolePermissionBaseMap(normalizedRole);

  const { rows: roleRows } = await client.query(
    `SELECT permission_key, allowed
     FROM role_permissions
     WHERE role = $1`,
    [normalizedRole]
  );
  roleRows.forEach((row) => {
    const key = normalizePermissionKey(row.permission_key);
    if (!key) return;
    effectiveMap[key] = Boolean(row.allowed);
  });

  if (Number.isInteger(normalizedUserId) && normalizedUserId > 0) {
    const { rows: userRows } = await client.query(
      `SELECT permission_key, allowed
       FROM user_permissions
       WHERE user_id = $1`,
      [normalizedUserId]
    );
    userRows.forEach((row) => {
      const key = normalizePermissionKey(row.permission_key);
      if (!key) return;
      effectiveMap[key] = Boolean(row.allowed);
    });
  }

  return new Set(
    Object.entries(effectiveMap)
      .filter(([, allowed]) => Boolean(allowed))
      .map(([key]) => key)
  );
}

function hasPermissionInSet(permissionSet, permissionKey) {
  const normalizedKey = normalizePermissionKey(permissionKey);
  if (!normalizedKey) return false;
  if (!(permissionSet instanceof Set)) return false;
  return permissionSet.has(normalizedKey);
}

function hasAuthPermission(authContext, permissionKey) {
  const normalizedKey = normalizePermissionKey(permissionKey);
  if (!normalizedKey) return false;
  if (!authContext || typeof authContext !== 'object') return false;
  if (hasPermissionInSet(authContext.permissionSet, normalizedKey)) return true;

  if (Array.isArray(authContext.permissions)) {
    const normalizedPermissions = authContext.permissions
      .map((value) => normalizePermissionKey(value))
      .filter(Boolean);
    if (normalizedPermissions.includes(normalizedKey)) return true;
  }

  return getRolePermissionBaseValue(authContext.role, normalizedKey);
}

async function hydrateAuthPermissions(req) {
  if (!req?.auth || typeof req.auth !== 'object') return new Set();
  if (req.auth.permissionSet instanceof Set) return req.auth.permissionSet;

  const permissionSet = await getEffectivePermissionSetForUser(req.auth.id, req.auth.role);
  req.auth.permissionSet = permissionSet;
  req.auth.permissions = Array.from(permissionSet).sort((a, b) =>
    a.localeCompare(b, 'es', { sensitivity: 'base' })
  );
  return permissionSet;
}

async function hasRequestPermission(req, permissionKey) {
  await hydrateAuthPermissions(req);
  return hasAuthPermission(req.auth, permissionKey);
}

function requirePermission(permissionKey, errorMessage = 'No tienes permisos para realizar esta accion.') {
  return async (req, res, next) => {
    try {
      const allowed = await hasRequestPermission(req, permissionKey);
      if (!allowed) {
        return res.status(403).json({ message: errorMessage });
      }
      return next();
    } catch (error) {
      console.error(`Error validando permiso ${permissionKey}:`, error);
      return res.status(500).json({ message: 'No se pudo validar permisos.' });
    }
  };
}

async function buildPermissionRowsForUser(userId, roleValue, client = pool) {
  const normalizedUserId = Number(userId);
  const normalizedRole = normalizeRoleValue(roleValue) || 'seller';
  const roleBase = getRolePermissionBaseMap(normalizedRole);

  const { rows: roleRows } = await client.query(
    `SELECT permission_key, allowed
     FROM role_permissions
     WHERE role = $1`,
    [normalizedRole]
  );
  roleRows.forEach((row) => {
    const key = normalizePermissionKey(row.permission_key);
    if (!key) return;
    roleBase[key] = Boolean(row.allowed);
  });

  const userOverrideMap = new Map();
  if (Number.isInteger(normalizedUserId) && normalizedUserId > 0) {
    const { rows: userRows } = await client.query(
      `SELECT permission_key, allowed
       FROM user_permissions
       WHERE user_id = $1`,
      [normalizedUserId]
    );
    userRows.forEach((row) => {
      const key = normalizePermissionKey(row.permission_key);
      if (!key) return;
      userOverrideMap.set(key, Boolean(row.allowed));
    });
  }

  return PERMISSION_CATALOG.map((permission) => {
    const key = permission.key;
    const roleAllowed = Boolean(roleBase[key]);
    const overrideAllowed = userOverrideMap.has(key) ? userOverrideMap.get(key) : null;
    const effectiveAllowed = overrideAllowed === null ? roleAllowed : Boolean(overrideAllowed);
    return {
      key,
      module: permission.module,
      label: permission.label,
      description: permission.description,
      roleAllowed,
      overrideAllowed,
      effectiveAllowed
    };
  });
}

async function buildClientUserPayload(user, client = pool) {
  const mappedUser = mapAuthUserForClient(user);
  const permissionSet = await getEffectivePermissionSetForUser(mappedUser.id, mappedUser.role, client);
  return {
    ...mappedUser,
    permissions: Array.from(permissionSet).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  };
}

function normalizeUserRoleForMutation(value) {
  const normalized = normalizeRoleValue(value);
  if (!normalized) return { ok: false, message: 'role debe ser admin, supervisor o seller.' };
  return { ok: true, value: normalized };
}

function normalizeRequiredUsername(value) {
  const normalized = normalizeUsername(value);
  if (!normalized) {
    return { ok: false, message: 'username es obligatorio.' };
  }
  if (!/^[a-z0-9._-]{3,40}$/.test(normalized)) {
    return { ok: false, message: 'username debe tener 3-40 caracteres [a-z0-9._-].' };
  }
  return { ok: true, value: normalized };
}

function normalizePinForMutation(value, fieldName = 'pin') {
  const normalizedPin = String(value || '').replace(/\D/g, '');
  if (normalizedPin.length !== 6) {
    return { ok: false, message: `${fieldName} debe tener 6 digitos.` };
  }
  return { ok: true, value: normalizedPin };
}

function parsePositiveInt(value, fallback, min = 1, max = 500) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseNonNegativeInt(value, fallback = 0, max = 50000) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(max, parsed);
}

function formatDateToIsoDay(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function buildKpiDateRange(query = {}) {
  const fromRaw = cleanText(query.from, 20);
  const toRaw = cleanText(query.to, 20);
  const periodRaw = cleanText(query.period, 12).toLowerCase();
  const periodDays = periodRaw === '7d' ? 7 : periodRaw === '90d' ? 90 : 30;

  let from = null;
  let to = null;

  if (fromRaw) {
    if (!isValidISODate(fromRaw)) {
      return { ok: false, message: 'Parametro from invalido. Usa YYYY-MM-DD.' };
    }
    from = new Date(`${fromRaw}T00:00:00Z`);
  }

  if (toRaw) {
    if (!isValidISODate(toRaw)) {
      return { ok: false, message: 'Parametro to invalido. Usa YYYY-MM-DD.' };
    }
    to = new Date(`${toRaw}T00:00:00Z`);
  }

  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (!to) to = todayUtc;
  if (!from) {
    from = new Date(to.getTime() - ((periodDays - 1) * 24 * 60 * 60 * 1000));
  }

  if (from.getTime() > to.getTime()) {
    return { ok: false, message: 'Parametro from no puede ser mayor que to.' };
  }

  const toExclusive = new Date(to.getTime() + (24 * 60 * 60 * 1000));
  return {
    ok: true,
    from,
    to,
    toExclusive,
    fromIso: formatDateToIsoDay(from),
    toIso: formatDateToIsoDay(to)
  };
}

function normalizeAuditDateFilter(value, fieldName) {
  const raw = cleanText(value, 60);
  if (!raw) return { ok: true, value: null, isDateOnly: false };

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { ok: true, value: raw, isDateOnly: true };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, message: `${fieldName} es invalido. Usa YYYY-MM-DD o ISO datetime.` };
  }

  return { ok: true, value: parsed.toISOString(), isDateOnly: false };
}

function buildAuditFiltersFromQuery(query = {}) {
  const fromFilter = normalizeAuditDateFilter(query.from, 'from');
  if (!fromFilter.ok) return fromFilter;
  const toFilter = normalizeAuditDateFilter(query.to, 'to');
  if (!toFilter.ok) return toFilter;

  const actorUsername = cleanText(query.actor || query.actor_username, 120).toLowerCase() || null;
  const action = cleanText(query.action, 120).toLowerCase() || null;
  const entityType = cleanText(query.entityType || query.entity_type, 80).toLowerCase() || null;
  const entityId = cleanText(query.entityId || query.entity_id, 120) || null;
  const requestId = cleanText(query.requestId || query.request_id, 120) || null;

  return {
    ok: true,
    value: {
      from: fromFilter,
      to: toFilter,
      actorUsername,
      action,
      entityType,
      entityId,
      requestId
    }
  };
}

function buildAuditWhereClause(filters) {
  const conditions = [];
  const params = [];
  const pushParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters?.from?.value) {
    if (filters.from.isDateOnly) {
      const token = pushParam(filters.from.value);
      conditions.push(`created_at >= ${token}::date`);
    } else {
      const token = pushParam(filters.from.value);
      conditions.push(`created_at >= ${token}::timestamptz`);
    }
  }

  if (filters?.to?.value) {
    if (filters.to.isDateOnly) {
      const token = pushParam(filters.to.value);
      conditions.push(`created_at < (${token}::date + INTERVAL '1 day')`);
    } else {
      const token = pushParam(filters.to.value);
      conditions.push(`created_at <= ${token}::timestamptz`);
    }
  }

  if (filters?.actorUsername) {
    const token = pushParam(filters.actorUsername);
    conditions.push(`lower(coalesce(actor_username, '')) = ${token}`);
  }

  if (filters?.action) {
    const token = pushParam(filters.action);
    conditions.push(`action = ${token}`);
  }

  if (filters?.entityType) {
    const token = pushParam(filters.entityType);
    conditions.push(`entity_type = ${token}`);
  }

  if (filters?.entityId) {
    const token = pushParam(filters.entityId);
    conditions.push(`entity_id = ${token}`);
  }

  if (filters?.requestId) {
    const token = pushParam(filters.requestId);
    conditions.push(`request_id = ${token}`);
  }

  return {
    whereSql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  };
}

function toCsvCell(value) {
  if (value === undefined || value === null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const flat = String(text).replace(/\r?\n/g, ' ');
  if (/[",\n]/.test(flat)) {
    return `"${flat.replace(/"/g, '""')}"`;
  }
  return flat;
}

function buildAuditCsv(rows) {
  const headers = [
    'id',
    'created_at',
    'actor_user_id',
    'actor_username',
    'action',
    'entity_type',
    'entity_id',
    'request_id',
    'ip_address',
    'http_method',
    'route_path',
    'before_data',
    'after_data',
    'metadata'
  ];

  const lines = [headers.join(',')];
  rows.forEach((row) => {
    const line = headers.map((header) => toCsvCell(row?.[header])).join(',');
    lines.push(line);
  });
  return lines.join('\n');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAuditComparableValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? Number(value) : null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return String(value);
  return JSON.stringify(value);
}

function auditValuesDiffer(beforeValue, afterValue) {
  return normalizeAuditComparableValue(beforeValue) !== normalizeAuditComparableValue(afterValue);
}

function buildLeadAuditDiffEntries(beforeData, afterData) {
  if (!isPlainObject(beforeData) || !isPlainObject(afterData)) return [];
  const keys = new Set([
    ...Object.keys(beforeData || {}),
    ...Object.keys(afterData || {})
  ]);

  const changes = [];
  keys.forEach((rawKey) => {
    const field = cleanText(rawKey, 120).toLowerCase();
    if (!field) return;
    if (LEAD_AUDIT_IGNORED_DIFF_FIELDS.has(field)) return;
    const beforeValue = Object.prototype.hasOwnProperty.call(beforeData, rawKey)
      ? beforeData[rawKey]
      : beforeData[field];
    const afterValue = Object.prototype.hasOwnProperty.call(afterData, rawKey)
      ? afterData[rawKey]
      : afterData[field];
    if (!auditValuesDiffer(beforeValue, afterValue)) return;
    changes.push({
      field,
      before: beforeValue ?? null,
      after: afterValue ?? null,
      undoable: LEAD_AUDIT_UNDOABLE_COLUMNS.has(field) && beforeValue !== '[REDACTED]'
    });
  });

  changes.sort((a, b) => a.field.localeCompare(b.field, 'es', { sensitivity: 'base' }));
  return changes;
}

function getUndoableLeadFieldsFromAudit(beforeData, afterData) {
  return buildLeadAuditDiffEntries(beforeData, afterData)
    .filter((entry) => entry.undoable)
    .map((entry) => entry.field);
}

function buildLeadUndoChangesFromAudit(beforeData, afterData) {
  const changes = {};
  buildLeadAuditDiffEntries(beforeData, afterData)
    .filter((entry) => entry.undoable)
    .forEach((entry) => {
      changes[entry.field] = entry.before ?? null;
    });
  return changes;
}

function mapLeadAuditLogRow(row) {
  const beforeData = isPlainObject(row?.before_data) ? row.before_data : null;
  const afterData = isPlainObject(row?.after_data) ? row.after_data : null;
  const changedFields = buildLeadAuditDiffEntries(beforeData, afterData);
  const undoableFields = changedFields.filter((entry) => entry.undoable).map((entry) => entry.field);
  const canUndo = row?.action === 'lead.update' && undoableFields.length > 0;

  return {
    id: Number(row?.id || 0),
    action: cleanText(row?.action, 120).toLowerCase(),
    entityType: cleanText(row?.entity_type, 80).toLowerCase(),
    entityId: cleanText(row?.entity_id, 120) || null,
    actorUserId: Number(row?.actor_user_id || 0) || null,
    actorUsername: cleanText(row?.actor_username, 120) || null,
    requestId: cleanText(row?.request_id, 120) || null,
    ipAddress: cleanText(row?.ip_address, 80) || null,
    httpMethod: cleanText(row?.http_method, 10) || null,
    routePath: cleanText(row?.route_path, 200) || null,
    before: beforeData,
    after: afterData,
    metadata: isPlainObject(row?.metadata) ? row.metadata : null,
    createdAt: row?.created_at || null,
    changedFields,
    undoableFields,
    canUndo
  };
}

function normalizeLeadAuditFieldList(fields = []) {
  if (!Array.isArray(fields)) return [];
  return fields
    .map((field) => cleanText(field, 120).toLowerCase())
    .filter(Boolean);
}

function isPaymentAuditFieldGroup(fields = []) {
  const normalized = normalizeLeadAuditFieldList(fields);
  if (!normalized.length) return false;
  return normalized.every((field) => LEAD_AUDIT_PAYMENT_FIELDS.has(field));
}

async function writeOrMergeLeadPaymentAuditLog({
  req,
  entityId,
  before,
  after,
  changedFields,
  client = pool
}) {
  const normalizedChangedFields = normalizeLeadAuditFieldList(changedFields);
  if (!isPaymentAuditFieldGroup(normalizedChangedFields)) {
    return false;
  }

  const normalizedEntityId = normalizeAuditEntityId(entityId);
  if (!normalizedEntityId) return false;

  const actorId = Number(req?.auth?.id);
  const actorUserId = Number.isInteger(actorId) && actorId > 0 ? actorId : null;
  const actorUsername = cleanText(req?.auth?.username, 120).toLowerCase() || null;

  try {
    const { rows } = await client.query(
      `SELECT id, before_data, after_data
       FROM audit_log
       WHERE action = 'lead.update'
         AND entity_type = 'lead'
         AND entity_id = $1
         AND (
           ($2::bigint IS NOT NULL AND actor_user_id = $2)
           OR ($2::bigint IS NULL AND $3::text IS NOT NULL AND lower(actor_username) = lower($3))
         )
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [normalizedEntityId, actorUserId, actorUsername]
    );

    const lastEntry = rows[0] || null;
    const lastBefore = isPlainObject(lastEntry?.before_data) ? lastEntry.before_data : null;
    const lastAfter = isPlainObject(lastEntry?.after_data) ? lastEntry.after_data : null;
    const lastFields = buildLeadAuditDiffEntries(lastBefore, lastAfter).map((entry) => entry.field);
    const canMergeWithLast = Boolean(lastEntry?.id) && isPaymentAuditFieldGroup(lastFields);

    if (canMergeWithLast) {
      const mergedBefore = lastBefore || before;
      const mergedAfter = after;
      const mergedFields = buildLeadAuditDiffEntries(mergedBefore, mergedAfter)
        .map((entry) => entry.field)
        .filter((field) => LEAD_AUDIT_PAYMENT_FIELDS.has(field));

      if (!mergedFields.length) {
        await client.query('DELETE FROM audit_log WHERE id = $1', [Number(lastEntry.id)]);
        return true;
      }

      const routePath = cleanText(
        `${req?.baseUrl || ''}${req?.route?.path || req?.path || req?.originalUrl || ''}`,
        200
      ) || null;
      const metadataSafe = toAuditSafeValue({
        changedFields: mergedFields,
        mergeMode: 'same_user_payment_overwrite'
      });

      await client.query(
        `UPDATE audit_log
         SET request_id = $1,
             ip_address = $2,
             http_method = $3,
             route_path = $4,
             before_data = $5::jsonb,
             after_data = $6::jsonb,
             metadata = $7::jsonb,
             created_at = CURRENT_TIMESTAMP
         WHERE id = $8`,
        [
          cleanText(req?.requestId || req?.headers?.['x-request-id'], 120) || null,
          getRequestIp(req),
          cleanText(req?.method, 10) || null,
          routePath,
          JSON.stringify(toAuditSafeValue(mergedBefore)),
          JSON.stringify(toAuditSafeValue(mergedAfter)),
          metadataSafe === null ? null : JSON.stringify(metadataSafe),
          Number(lastEntry.id)
        ]
      );

      return true;
    }
  } catch (error) {
    console.error('Error al consolidar auditoria de pagos:', error);
  }

  await writeAuditLog({
    req,
    action: 'lead.update',
    entityType: 'lead',
    entityId,
    before,
    after,
    metadata: {
      changedFields: normalizedChangedFields
    },
    client
  });

  return true;
}

function getEmailAccessContext(req) {
  if (req.auth?.username) {
    const username = cleanText(req.auth.username, 120).toLowerCase();
    const displayName = cleanText(req.auth.displayName, 120).toLowerCase();
    const email = cleanText(req.auth.email, 160).toLowerCase();
    const role = inferRoleFromIdentity({
      role: req.auth.role,
      username,
      displayName,
      email
    });
    const identities = Array.from(new Set([username, displayName].filter(Boolean)));
    return {
      username,
      displayName,
      email,
      role,
      identities,
      permissions: Array.isArray(req.auth.permissions) ? req.auth.permissions : []
    };
  }

  const username = cleanText(req.query.username || req.body?.username, 120).toLowerCase();
  const displayName = cleanText(req.query.displayName || req.body?.displayName || req.body?.name, 120).toLowerCase();
  const email = cleanText(req.query.email || req.body?.email, 160).toLowerCase();
  const role = inferRoleFromIdentity({
    role: req.query.role || req.body?.role,
    username,
    displayName,
    email
  });
  const identities = Array.from(new Set([username, displayName].filter(Boolean)));
  return { username, displayName, email, role, identities, permissions: [] };
}

function isValidEmailAddress(value) {
  const normalized = cleanText(value, 200).toLowerCase();
  if (!normalized) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function normalizeEmailAddressRequired(value, fieldName) {
  const normalized = cleanText(value, 200).toLowerCase();
  if (!normalized) {
    return { ok: false, message: `${fieldName} es obligatorio.` };
  }
  if (!isValidEmailAddress(normalized)) {
    return { ok: false, message: `${fieldName} no tiene un formato valido.` };
  }
  return { ok: true, value: normalized };
}

function normalizeEmailAddressOptional(value, fieldName) {
  const normalized = cleanText(value, 200).toLowerCase();
  if (!normalized) return { ok: true, value: null };
  if (!isValidEmailAddress(normalized)) {
    return { ok: false, message: `${fieldName} no tiene un formato valido.` };
  }
  return { ok: true, value: normalized };
}

function normalizeCcEmails(value) {
  let rawValues = [];
  if (Array.isArray(value)) {
    rawValues = value;
  } else if (typeof value === 'string') {
    rawValues = value.split(/[,\n;]+/g);
  } else if (value !== undefined && value !== null) {
    rawValues = [value];
  }

  const seen = new Set();
  const normalized = [];

  for (const item of rawValues) {
    const email = cleanText(item, 200).toLowerCase();
    if (!email) continue;
    if (!isValidEmailAddress(email)) {
      return { ok: false, message: `ccEmails contiene un correo invalido: ${email}` };
    }
    if (seen.has(email)) continue;
    seen.add(email);
    normalized.push(email);
  }

  return { ok: true, value: normalized.slice(0, 20) };
}

function normalizeEmailStatus(value) {
  const normalized = cleanText(value, 20).toLowerCase();
  if (normalized === 'failed') return 'failed';
  if (normalized === 'queued') return 'queued';
  return 'sent';
}

async function ensureSentEmailsSchema() {
  if (sentEmailsSchemaReady) return;
  if (sentEmailsSchemaPromise) {
    await sentEmailsSchemaPromise;
    return;
  }

  sentEmailsSchemaPromise = (async () => {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS sent_emails (
         id BIGSERIAL PRIMARY KEY,
         lead_id BIGINT REFERENCES leads(id) ON DELETE SET NULL,
         author_username VARCHAR(120) NOT NULL,
         from_email VARCHAR(200),
         to_email VARCHAR(200) NOT NULL,
         cc_emails JSONB NOT NULL DEFAULT '[]'::jsonb,
         subject VARCHAR(240) NOT NULL DEFAULT '',
         body_preview TEXT NOT NULL DEFAULT '',
         provider VARCHAR(40) NOT NULL DEFAULT 'mock',
         provider_message_id VARCHAR(180),
         status VARCHAR(20) NOT NULL DEFAULT 'queued',
         error_message TEXT,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         sent_at TIMESTAMPTZ
       )`
    );
    await pool.query('CREATE INDEX IF NOT EXISTS idx_sent_emails_author_created ON sent_emails (author_username, created_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_sent_emails_lead_created ON sent_emails (lead_id, created_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_sent_emails_status ON sent_emails (status)');
    sentEmailsSchemaReady = true;
  })();

  try {
    await sentEmailsSchemaPromise;
  } finally {
    if (!sentEmailsSchemaReady) {
      sentEmailsSchemaPromise = null;
    }
  }
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

  return { ok: false, message: 'state/stateCode debe ser un estado valido (ej: CA).' };
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

function normalizeNullableCreditScore(value, fieldName) {
  if (value === undefined) return { ok: true, provided: false, value: null };
  if (value === null) return { ok: true, provided: true, value: null };

  const raw = String(value).trim();
  if (!raw) return { ok: true, provided: true, value: null };

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 300 || parsed > 850) {
    return { ok: false, message: `${fieldName} debe ser un entero entre 300 y 850.` };
  }

  return { ok: true, provided: true, value: parsed };
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

const BUDGET_MONEY_PATHS = [
  ['budgetItems', 'housing', 'housingPayment'],
  ['budgetItems', 'housing', 'homeOwnersInsurance'],
  ['budgetItems', 'housing', 'secondaryHousePayment'],
  ['budgetItems', 'transportation', 'autoPayments'],
  ['budgetItems', 'transportation', 'autoInsurance'],
  ['budgetItems', 'transportation', 'repairsMaintenance'],
  ['budgetItems', 'transportation', 'gasoline'],
  ['budgetItems', 'transportation', 'parking'],
  ['budgetItems', 'transportation', 'commuting'],
  ['budgetItems', 'food', 'groceries'],
  ['budgetItems', 'food', 'eatingOut'],
  ['budgetItems', 'utilities', 'averageEnergy'],
  ['budgetItems', 'utilities', 'averagePhone'],
  ['budgetItems', 'utilities', 'averageWater'],
  ['budgetItems', 'utilities', 'averageInternet'],
  ['budgetItems', 'otherExpenses'],
  ['income', 'applicant', 'netMonthlyIncome'],
  ['income', 'applicant', 'socialSecurity'],
  ['income', 'applicant', 'alimony'],
  ['income', 'applicant', 'retirement'],
  ['income', 'applicant', 'totalHouseholdIncome'],
  ['income', 'applicant', 'fixedIncome'],
  ['income', 'applicant', 'unemployment'],
  ['income', 'applicant', 'childSupport'],
  ['income', 'applicant', 'other'],
  ['income', 'coapp', 'netMonthlyIncome'],
  ['income', 'coapp', 'socialSecurity'],
  ['income', 'coapp', 'alimony'],
  ['income', 'coapp', 'retirement'],
  ['income', 'coapp', 'totalHouseholdIncome'],
  ['income', 'coapp', 'fixedIncome'],
  ['income', 'coapp', 'unemployment'],
  ['income', 'coapp', 'childSupport'],
  ['income', 'coapp', 'other']
];

function createDefaultBudgetData() {
  return {
    budgetItems: {
      housing: {
        housingType: '',
        housingPayment: 0,
        homeOwnersInsurance: 0,
        secondaryHousePayment: 0
      },
      transportation: {
        autoPayments: 0,
        autoInsurance: 0,
        repairsMaintenance: 0,
        gasoline: 0,
        parking: 0,
        commuting: 0
      },
      food: {
        groceries: 0,
        eatingOut: 0
      },
      utilities: {
        averageEnergy: 0,
        averagePhone: 0,
        averageWater: 0,
        averageInternet: 0
      },
      otherExpenses: 0
    },
    income: {
      applicant: {
        netMonthlyIncome: 0,
        socialSecurity: 0,
        alimony: 0,
        retirement: 0,
        totalHouseholdIncome: 0,
        fixedIncome: 0,
        unemployment: 0,
        childSupport: 0,
        other: 0
      },
      coapp: {
        netMonthlyIncome: 0,
        socialSecurity: 0,
        alimony: 0,
        retirement: 0,
        totalHouseholdIncome: 0,
        fixedIncome: 0,
        unemployment: 0,
        childSupport: 0,
        other: 0
      }
    },
    hardship: {
      hardshipReason: '',
      detailedReasonEs: '',
      detailedReasonEn: ''
    }
  };
}

function getValueByPath(source, path, fallback = undefined) {
  let cursor = source;
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object' || !(key in cursor)) return fallback;
    cursor = cursor[key];
  }
  return cursor;
}

function setValueByPath(target, path, value) {
  let cursor = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (!cursor[key] || typeof cursor[key] !== 'object') {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = value;
}

function normalizeBudgetData(raw) {
  const base = createDefaultBudgetData();
  const source = raw && typeof raw === 'object' ? raw : {};

  for (const path of BUDGET_MONEY_PATHS) {
    const normalized = normalizeMoney(getValueByPath(source, path, 0), path.join('.'));
    setValueByPath(base, path, normalized.ok ? normalized.value : 0);
  }

  const housingType = String(getValueByPath(source, ['budgetItems', 'housing', 'housingType'], '') || '').trim().toLowerCase();
  base.budgetItems.housing.housingType = ['rent', 'own'].includes(housingType) ? housingType : '';

  base.hardship.hardshipReason = cleanText(getValueByPath(source, ['hardship', 'hardshipReason'], ''), 80);
  base.hardship.detailedReasonEs = cleanText(getValueByPath(source, ['hardship', 'detailedReasonEs'], ''), 5000);
  base.hardship.detailedReasonEn = cleanText(getValueByPath(source, ['hardship', 'detailedReasonEn'], ''), 5000);

  return base;
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
  const fromAuth = req.auth?.username;
  const fromHeader = req.headers?.['x-user'];
  const fromBody = req.body?.username;
  const fromQuery = req.query?.username;
  const candidate = [fromAuth, fromHeader, fromBody, fromQuery]
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

function normalizePipelineStatusToken(value) {
  return cleanText(value, 120)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function resolvePipelineStatusDefinition(value) {
  const token = normalizePipelineStatusToken(value);
  if (!token) return null;

  const direct = PIPELINE_STATUS_BY_TOKEN.get(token);
  if (direct) return direct;

  const aliasKey = PIPELINE_STATUS_ALIAS_TO_KEY.get(token);
  if (!aliasKey) return null;
  return PIPELINE_STATUS_BY_KEY.get(aliasKey) || null;
}

function normalizeLeadStatusLabel(value, fieldName = 'status') {
  const text = cleanText(value, 120);
  if (!text) {
    return { ok: false, message: `${fieldName} es obligatorio.` };
  }

  const definition = resolvePipelineStatusDefinition(text);
  if (!definition) {
    return {
      ok: false,
      message: `${fieldName} no es valido. Usa un status del catalogo de pipeline.`
    };
  }

  return { ok: true, value: definition.label, definition };
}

function getAllowedNextStageKeys(fromStageKey) {
  const normalized = cleanText(fromStageKey, 40).toLowerCase();
  const allowed = PIPELINE_STAGE_TRANSITIONS.get(normalized);
  if (allowed instanceof Set && allowed.size > 0) return allowed;
  return new Set(PIPELINE_STAGE_CATALOG.map((entry) => entry.key));
}

function getAllowedNextStatusLabels(fromStatusValue) {
  const fromDefinition = resolvePipelineStatusDefinition(fromStatusValue);
  const fromStageKey = fromDefinition?.stageKey || '';
  const allowedStageKeys = getAllowedNextStageKeys(fromStageKey);
  return PIPELINE_STATUS_CATALOG
    .filter((entry) => allowedStageKeys.has(entry.stageKey))
    .map((entry) => entry.label);
}

function validateLeadStatusTransition(fromStatusValue, toStatusValue) {
  const fromDefinition = resolvePipelineStatusDefinition(fromStatusValue);
  const normalizedTarget = normalizeLeadStatusLabel(toStatusValue, 'status');
  if (!normalizedTarget.ok) return normalizedTarget;

  const toDefinition = normalizedTarget.definition;
  const fromToken = normalizePipelineStatusToken(fromDefinition?.label || fromStatusValue);
  const toToken = normalizePipelineStatusToken(toDefinition.label);
  if (fromToken && fromToken === toToken) {
    return {
      ok: true,
      from: fromDefinition,
      to: toDefinition,
      changed: false,
      allowedNextStatuses: getAllowedNextStatusLabels(fromDefinition?.label || '')
    };
  }

  if (!fromDefinition) {
    return {
      ok: true,
      from: null,
      to: toDefinition,
      changed: true,
      allowedNextStatuses: getAllowedNextStatusLabels('')
    };
  }

  const allowedStageKeys = getAllowedNextStageKeys(fromDefinition.stageKey);
  if (!allowedStageKeys.has(toDefinition.stageKey)) {
    return {
      ok: false,
      message: `Transicion de status no permitida (${fromDefinition.label} -> ${toDefinition.label}).`,
      from: fromDefinition,
      to: toDefinition,
      allowedNextStatuses: getAllowedNextStatusLabels(fromDefinition.label)
    };
  }

  return {
    ok: true,
    from: fromDefinition,
    to: toDefinition,
    changed: true,
    allowedNextStatuses: getAllowedNextStatusLabels(fromDefinition.label)
  };
}

function getLeadStageKey(statusValue) {
  return resolvePipelineStatusDefinition(statusValue)?.stageKey || null;
}

function isPipelineWonStatus(statusValue) {
  const stageKey = getLeadStageKey(statusValue);
  return stageKey ? PIPELINE_WON_STAGE_KEYS.has(stageKey) : false;
}

function isPipelineLostStatus(statusValue) {
  const stageKey = getLeadStageKey(statusValue);
  return stageKey ? PIPELINE_LOST_STAGE_KEYS.has(stageKey) : false;
}

async function recordLeadStageHistory({
  leadId,
  fromStatus = null,
  toStatus,
  req = null,
  reason = null,
  client = pool
}) {
  const normalizedLeadId = Number(leadId);
  if (!Number.isInteger(normalizedLeadId) || normalizedLeadId <= 0) return;

  const normalizedTo = normalizeLeadStatusLabel(toStatus, 'status');
  if (!normalizedTo.ok) return;

  const normalizedFrom = fromStatus ? normalizeLeadStatusLabel(fromStatus, 'status') : null;
  const fromLabel = normalizedFrom?.ok ? normalizedFrom.value : toNullableText(fromStatus, 120);
  const toLabel = normalizedTo.value;

  const actorId = Number(req?.auth?.id);
  const actorUserId = Number.isInteger(actorId) && actorId > 0 ? actorId : null;
  const actorUsername = cleanText(req?.auth?.username, 120).toLowerCase() || null;
  const requestId = cleanText(req?.requestId || req?.headers?.['x-request-id'], 120) || null;
  const reasonText = toNullableText(reason, 240);

  await client.query(
    `INSERT INTO lead_stage_history (
       lead_id, from_status, to_status, from_stage_key, to_stage_key,
       changed_by_user_id, changed_by_username, request_id, change_reason
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      normalizedLeadId,
      fromLabel,
      toLabel,
      getLeadStageKey(fromLabel),
      getLeadStageKey(toLabel),
      actorUserId,
      actorUsername,
      requestId,
      reasonText
    ]
  );
}

function mapLeadStageHistoryRow(row) {
  const fromStatus = cleanText(row?.from_status, 120) || null;
  const toStatus = cleanText(row?.to_status, 120) || null;
  const fromStageKey = cleanText(row?.from_stage_key, 40).toLowerCase() || null;
  const toStageKey = cleanText(row?.to_stage_key, 40).toLowerCase() || null;
  const fromStage = fromStageKey ? PIPELINE_STAGE_BY_KEY.get(fromStageKey) || null : null;
  const toStage = toStageKey ? PIPELINE_STAGE_BY_KEY.get(toStageKey) || null : null;

  return {
    id: Number(row?.id || 0),
    leadId: Number(row?.lead_id || 0),
    fromStatus,
    toStatus,
    fromStageKey,
    toStageKey,
    fromStageLabel: fromStage?.label || null,
    toStageLabel: toStage?.label || null,
    changedByUserId: Number(row?.changed_by_user_id || 0) || null,
    changedByUsername: cleanText(row?.changed_by_username, 120) || null,
    requestId: cleanText(row?.request_id, 120) || null,
    reason: cleanText(row?.change_reason, 240) || null,
    createdAt: row?.created_at || null
  };
}

function normalizeTaskType(value, { required = false, fieldName = 'taskType' } = {}) {
  if (value === undefined) {
    if (required) return { ok: false, message: `${fieldName} es obligatorio.` };
    return { ok: true, provided: false, value: 'general' };
  }
  const normalized = cleanText(value, 40).toLowerCase();
  if (!normalized) {
    if (required) return { ok: false, message: `${fieldName} es obligatorio.` };
    return { ok: true, provided: true, value: 'general' };
  }
  if (!TASK_TYPE_VALUES.has(normalized)) {
    return { ok: false, message: `${fieldName} debe ser general o callback.` };
  }
  return { ok: true, provided: true, value: normalized };
}

function normalizeTaskPriority(value, { required = false, fieldName = 'priority' } = {}) {
  if (value === undefined) {
    if (required) return { ok: false, message: `${fieldName} es obligatorio.` };
    return { ok: true, provided: false, value: 'normal' };
  }
  const normalized = cleanText(value, 20).toLowerCase();
  if (!normalized) {
    if (required) return { ok: false, message: `${fieldName} es obligatorio.` };
    return { ok: true, provided: true, value: 'normal' };
  }
  if (!TASK_PRIORITY_VALUES.has(normalized)) {
    return { ok: false, message: `${fieldName} debe ser low, normal, high o urgent.` };
  }
  return { ok: true, provided: true, value: normalized };
}

function normalizeTaskStatus(value, { required = false, fieldName = 'status' } = {}) {
  if (value === undefined) {
    if (required) return { ok: false, message: `${fieldName} es obligatorio.` };
    return { ok: true, provided: false, value: 'pending' };
  }
  const normalized = cleanText(value, 20).toLowerCase();
  if (!normalized) {
    if (required) return { ok: false, message: `${fieldName} es obligatorio.` };
    return { ok: true, provided: true, value: 'pending' };
  }
  if (!TASK_STATUS_VALUES.has(normalized)) {
    return { ok: false, message: `${fieldName} debe ser pending, in_progress, completed, cancelled o escalated.` };
  }
  return { ok: true, provided: true, value: normalized };
}

function normalizeTaskRecurrenceRule(value, { required = false, fieldName = 'recurrenceRule' } = {}) {
  if (value === undefined) {
    if (required) return { ok: false, message: `${fieldName} es obligatorio.` };
    return { ok: true, provided: false, value: 'none' };
  }
  const normalized = cleanText(value, 20).toLowerCase();
  if (!normalized) {
    if (required) return { ok: false, message: `${fieldName} es obligatorio.` };
    return { ok: true, provided: true, value: 'none' };
  }
  if (!TASK_RECURRENCE_RULE_VALUES.has(normalized)) {
    return { ok: false, message: `${fieldName} debe ser none, daily, weekly o monthly.` };
  }
  return { ok: true, provided: true, value: normalized };
}

function normalizeTaskDateOnly(value, { fieldName = 'date', required = false } = {}) {
  if (value === undefined) {
    if (required) return { ok: false, message: `${fieldName} es obligatorio.` };
    return { ok: true, provided: false, value: null };
  }
  if (value === null || String(value).trim() === '') {
    if (required) return { ok: false, message: `${fieldName} es obligatorio.` };
    return { ok: true, provided: true, value: null };
  }
  const normalized = String(value).trim();
  if (!isValidISODate(normalized)) {
    return { ok: false, message: `${fieldName} debe tener formato YYYY-MM-DD.` };
  }
  return { ok: true, provided: true, value: normalized };
}

function normalizeTaskTimestamp(value, { fieldName = 'timestamp', required = false } = {}) {
  if (value === undefined) {
    if (required) return { ok: false, message: `${fieldName} es obligatorio.` };
    return { ok: true, provided: false, value: null };
  }
  if (value === null || String(value).trim() === '') {
    if (required) return { ok: false, message: `${fieldName} es obligatorio.` };
    return { ok: true, provided: true, value: null };
  }
  const parsed = new Date(String(value).trim());
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, message: `${fieldName} debe ser una fecha/hora valida.` };
  }
  return { ok: true, provided: true, value: parsed.toISOString() };
}

function normalizeTaskRecurrenceInterval(value, { fieldName = 'recurrenceInterval' } = {}) {
  if (value === undefined) return { ok: true, provided: false, value: 1 };
  if (value === null || String(value).trim() === '') return { ok: true, provided: true, value: 1 };
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
    return { ok: false, message: `${fieldName} debe ser un entero entre 1 y 365.` };
  }
  return { ok: true, provided: true, value: parsed };
}

function normalizeTaskSlaMinutes(value, { fieldName = 'slaMinutes' } = {}) {
  if (value === undefined) return { ok: true, provided: false, value: null };
  if (value === null || String(value).trim() === '') return { ok: true, provided: true, value: null };
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 525600) {
    return { ok: false, message: `${fieldName} debe ser un entero entre 1 y 525600.` };
  }
  return { ok: true, provided: true, value: parsed };
}

function normalizeTaskMetadata(value, { fieldName = 'metadata' } = {}) {
  if (value === undefined) return { ok: true, provided: false, value: {} };
  if (value === null || value === '') return { ok: true, provided: true, value: {} };

  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch (_error) {
      return { ok: false, message: `${fieldName} debe ser un JSON valido.` };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: `${fieldName} debe ser un objeto JSON.` };
  }

  return { ok: true, provided: true, value: toAuditSafeValue(parsed) || {} };
}

function normalizeTaskOwnerUsername(value, { required = false, fallback = null, fieldName = 'ownerUsername' } = {}) {
  if (value === undefined) {
    const normalizedFallback = cleanText(fallback, 120);
    if (normalizedFallback) return { ok: true, provided: false, value: normalizedFallback };
    if (required) return { ok: false, message: `${fieldName} es obligatorio.` };
    return { ok: true, provided: false, value: null };
  }

  const normalized = cleanText(value, 120);
  if (normalized) return { ok: true, provided: true, value: normalized };

  const normalizedFallback = cleanText(fallback, 120);
  if (normalizedFallback) return { ok: true, provided: true, value: normalizedFallback };
  if (required) return { ok: false, message: `${fieldName} es obligatorio.` };
  return { ok: true, provided: true, value: null };
}

function normalizeTaskOwnerTeam(value) {
  if (value === undefined) return { ok: true, provided: false, value: null };
  const normalized = cleanText(value, 120);
  return { ok: true, provided: true, value: normalized || null };
}

function normalizeDateOnlyForApi(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function normalizeTimestampForApi(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function getTaskDueTimestamp(task) {
  const dueAt = normalizeTimestampForApi(task?.due_at ?? task?.dueAt);
  if (dueAt) {
    const dueAtMs = new Date(dueAt).getTime();
    if (Number.isFinite(dueAtMs)) return dueAtMs;
  }

  const dueDate = normalizeDateOnlyForApi(task?.due_date ?? task?.dueDate);
  if (!dueDate) return null;
  const dueDateMs = new Date(`${dueDate}T23:59:59Z`).getTime();
  return Number.isFinite(dueDateMs) ? dueDateMs : null;
}

function deriveTaskSlaStatus(row) {
  const slaDueAt = normalizeTimestampForApi(row?.sla_due_at ?? row?.slaDueAt);
  if (!slaDueAt) return null;

  const slaDueMs = new Date(slaDueAt).getTime();
  if (!Number.isFinite(slaDueMs)) return null;

  const completedAt = normalizeTimestampForApi(row?.completed_at ?? row?.completedAt);
  if (completedAt) {
    const completedMs = new Date(completedAt).getTime();
    if (Number.isFinite(completedMs) && completedMs <= slaDueMs) return 'met';
    return 'breached';
  }

  return Date.now() > slaDueMs ? 'breached' : 'pending';
}

function mapLeadTaskRow(row) {
  const status = cleanText(row?.status, 20).toLowerCase() || 'pending';
  const completedAt = normalizeTimestampForApi(row?.completed_at);
  const dueTimestamp = getTaskDueTimestamp(row);
  const isClosed = status === 'completed' || status === 'cancelled';
  const isOverdue = !isClosed && Number.isFinite(dueTimestamp) && dueTimestamp < Date.now();

  return {
    id: Number(row?.id || 0),
    taskType: cleanText(row?.task_type, 40).toLowerCase() || 'general',
    title: cleanText(row?.title, 180) || 'Task',
    description: cleanText(row?.description, 5000) || '',
    priority: cleanText(row?.priority, 20).toLowerCase() || 'normal',
    status,
    ownerUsername: cleanText(row?.owner_username, 120) || null,
    ownerTeam: cleanText(row?.owner_team, 120) || null,
    relatedLeadId: Number(row?.related_lead_id || 0) || null,
    leadCaseId: Number(row?.lead_case_id || 0) || null,
    leadName: cleanText(row?.lead_full_name, 120) || null,
    dueDate: normalizeDateOnlyForApi(row?.due_date),
    dueAt: normalizeTimestampForApi(row?.due_at),
    completedAt,
    recurrenceRule: cleanText(row?.recurrence_rule, 20).toLowerCase() || 'none',
    recurrenceInterval: Number(row?.recurrence_interval || 1) || 1,
    recurrenceEndDate: normalizeDateOnlyForApi(row?.recurrence_end_date),
    slaMinutes: Number.isInteger(Number(row?.sla_minutes)) ? Number(row.sla_minutes) : null,
    slaDueAt: normalizeTimestampForApi(row?.sla_due_at),
    slaBreachedAt: normalizeTimestampForApi(row?.sla_breached_at),
    slaStatus: deriveTaskSlaStatus(row),
    escalatedAt: normalizeTimestampForApi(row?.escalated_at),
    escalatedToUsername: cleanText(row?.escalated_to_username, 120) || null,
    escalationLevel: Number(row?.escalation_level || 0) || 0,
    sourceCallbackDate: normalizeDateOnlyForApi(row?.source_callback_date),
    metadata: row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata
      : {},
    createdByUserId: Number(row?.created_by_user_id || 0) || null,
    createdByUsername: cleanText(row?.created_by_username, 120) || null,
    createdAt: normalizeTimestampForApi(row?.created_at),
    updatedAt: normalizeTimestampForApi(row?.updated_at),
    isOverdue
  };
}

function getTaskActorLabel(req) {
  const displayName = cleanText(req?.auth?.displayName, 120);
  const username = cleanText(req?.auth?.username, 120);
  return displayName || username || 'sistema';
}

function buildTaskDueAtFromDate(isoDate) {
  if (!isValidISODate(isoDate)) return null;
  return `${isoDate}T23:59:00.000Z`;
}

function computeTaskSlaDueAt({
  explicitSlaDueAt = null,
  slaMinutes = null,
  anchorTimestamp = null
} = {}) {
  if (explicitSlaDueAt) return explicitSlaDueAt;
  if (!Number.isInteger(slaMinutes) || slaMinutes <= 0) return null;

  const anchor = anchorTimestamp
    ? new Date(anchorTimestamp)
    : new Date();
  if (Number.isNaN(anchor.getTime())) return null;
  return new Date(anchor.getTime() + (slaMinutes * 60 * 1000)).toISOString();
}

function canAccessTaskByOwner(authContext, ownerUsername) {
  if (hasAuthPermission(authContext, 'callbacks.view_all')) return true;
  const identities = getAuthIdentities(authContext);
  const owner = cleanText(ownerUsername, 120).toLowerCase();
  return Boolean(owner && identities.includes(owner));
}

function parseBooleanQuery(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'si', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseTaskFilterList(rawValue, allowedSet) {
  const raw = cleanText(rawValue, 300).toLowerCase();
  if (!raw) return [];
  return Array.from(new Set(
    raw
      .split(',')
      .map((entry) => cleanText(entry, 40).toLowerCase())
      .filter((entry) => allowedSet.has(entry))
  ));
}

function computeNextRecurringDue({ dueDate, dueAt, recurrenceRule, recurrenceInterval }) {
  const interval = Number.isInteger(Number(recurrenceInterval)) ? Number(recurrenceInterval) : 1;
  if (!TASK_RECURRENCE_RULE_VALUES.has(recurrenceRule) || recurrenceRule === 'none') return null;

  const anchor = dueAt
    ? new Date(dueAt)
    : (dueDate ? new Date(`${dueDate}T12:00:00Z`) : null);
  if (!anchor || Number.isNaN(anchor.getTime())) return null;

  const next = new Date(anchor.getTime());
  if (recurrenceRule === 'daily') {
    next.setUTCDate(next.getUTCDate() + interval);
  } else if (recurrenceRule === 'weekly') {
    next.setUTCDate(next.getUTCDate() + (7 * interval));
  } else if (recurrenceRule === 'monthly') {
    next.setUTCMonth(next.getUTCMonth() + interval);
  }

  if (Number.isNaN(next.getTime())) return null;
  return {
    dueDate: next.toISOString().slice(0, 10),
    dueAt: dueAt ? next.toISOString() : null
  };
}

async function createNextRecurringTask(taskRow, { req = null, client = pool } = {}) {
  const recurrenceRule = cleanText(taskRow?.recurrence_rule, 20).toLowerCase();
  if (!TASK_RECURRENCE_RULE_VALUES.has(recurrenceRule) || recurrenceRule === 'none') return null;

  const recurrenceInterval = Number(taskRow?.recurrence_interval || 1);
  const dueDate = normalizeDateOnlyForApi(taskRow?.due_date);
  const dueAt = normalizeTimestampForApi(taskRow?.due_at);
  const nextDue = computeNextRecurringDue({ dueDate, dueAt, recurrenceRule, recurrenceInterval });
  if (!nextDue) return null;

  const recurrenceEndDate = normalizeDateOnlyForApi(taskRow?.recurrence_end_date);
  if (recurrenceEndDate && nextDue.dueDate > recurrenceEndDate) {
    return null;
  }

  const createdByUserId = Number(req?.auth?.id);
  const normalizedCreatedByUserId = Number.isInteger(createdByUserId) && createdByUserId > 0
    ? createdByUserId
    : null;
  const createdByUsername = cleanText(req?.auth?.username, 120).toLowerCase()
    || cleanText(taskRow?.created_by_username, 120).toLowerCase()
    || null;
  const metadata = {
    ...(taskRow?.metadata && typeof taskRow.metadata === 'object' ? taskRow.metadata : {}),
    recurring_from_task_id: Number(taskRow?.id || 0) || null
  };
  const slaMinutes = Number(taskRow?.sla_minutes || 0);
  const nextSlaDueAt = computeTaskSlaDueAt({
    explicitSlaDueAt: null,
    slaMinutes: Number.isInteger(slaMinutes) && slaMinutes > 0 ? slaMinutes : null,
    anchorTimestamp: nextDue.dueAt || buildTaskDueAtFromDate(nextDue.dueDate)
  });

  const { rows } = await client.query(
    `INSERT INTO lead_tasks (
       task_type,
       title,
       description,
       priority,
       status,
       owner_username,
       owner_team,
       related_lead_id,
       due_date,
       due_at,
       recurrence_rule,
       recurrence_interval,
       recurrence_end_date,
       sla_minutes,
       sla_due_at,
       metadata,
       created_by_user_id,
       created_by_username
     ) VALUES (
       $1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9,
       $10, $11, $12, $13, $14, $15::jsonb, $16, $17
     )
     RETURNING *`,
    [
      cleanText(taskRow?.task_type, 40).toLowerCase() || 'general',
      cleanText(taskRow?.title, 180) || 'Task',
      toNullableText(taskRow?.description, 5000),
      cleanText(taskRow?.priority, 20).toLowerCase() || 'normal',
      cleanText(taskRow?.owner_username, 120) || 'sistema',
      toNullableText(taskRow?.owner_team, 120),
      Number(taskRow?.related_lead_id || 0) || null,
      nextDue.dueDate,
      nextDue.dueAt,
      recurrenceRule,
      recurrenceInterval,
      recurrenceEndDate,
      Number.isInteger(slaMinutes) && slaMinutes > 0 ? slaMinutes : null,
      nextSlaDueAt,
      JSON.stringify(metadata),
      normalizedCreatedByUserId,
      createdByUsername
    ]
  );

  return rows[0] || null;
}

async function syncCallbackTaskFromLead(lead, { req = null, client = pool } = {}) {
  const leadId = Number(lead?.id || 0);
  if (!Number.isInteger(leadId) || leadId <= 0) return null;

  const callbackDate = normalizeDateOnlyForApi(lead?.callback_date);
  if (!callbackDate) {
    await client.query(
      `DELETE FROM lead_tasks
       WHERE task_type = 'callback'
         AND related_lead_id = $1`,
      [leadId]
    );
    return null;
  }

  const callbackCompletedAt = normalizeTimestampForApi(lead?.callback_completed_at);
  const dueAt = buildTaskDueAtFromDate(callbackDate);
  const ownerUsername = cleanText(lead?.assigned_to, 120) || 'sistema';
  const actorUsername = cleanText(req?.auth?.username, 120).toLowerCase() || null;
  const actorUserId = Number(req?.auth?.id);
  const normalizedActorUserId = Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null;
  const caseLabel = Number(lead?.case_id || 0) || null;
  const leadName = cleanText(lead?.full_name, 120) || `Lead #${leadId}`;
  const description = caseLabel
    ? `Callback del caso #${caseLabel}.`
    : `Callback del lead #${leadId}.`;

  let taskStatus = 'pending';
  if (callbackCompletedAt) {
    taskStatus = 'completed';
  } else if (callbackDate < formatDateToIsoDay(new Date())) {
    taskStatus = 'escalated';
  }

  const metadata = {
    callback_source: 'lead.callback_date',
    caseId: caseLabel,
    leadName
  };

  const { rows } = await client.query(
    `INSERT INTO lead_tasks (
       task_type,
       title,
       description,
       priority,
       status,
       owner_username,
       owner_team,
       related_lead_id,
       due_date,
       due_at,
       completed_at,
       recurrence_rule,
       recurrence_interval,
       sla_minutes,
       sla_due_at,
       source_callback_date,
       metadata,
       created_by_user_id,
       created_by_username
     ) VALUES (
       'callback', $1, $2, 'normal', $3, $4, NULL, $5, $6, $7, $8,
       'none', 1, 1440, $9, $10, $11::jsonb, $12, $13
     )
     ON CONFLICT (related_lead_id) WHERE (task_type = 'callback' AND related_lead_id IS NOT NULL)
     DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       status = EXCLUDED.status,
       owner_username = EXCLUDED.owner_username,
       due_date = EXCLUDED.due_date,
       due_at = EXCLUDED.due_at,
       completed_at = EXCLUDED.completed_at,
       sla_due_at = EXCLUDED.sla_due_at,
       source_callback_date = EXCLUDED.source_callback_date,
       metadata = EXCLUDED.metadata,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      `Callback - ${leadName}`,
      description,
      taskStatus,
      ownerUsername,
      leadId,
      callbackDate,
      dueAt,
      callbackCompletedAt,
      dueAt,
      callbackDate,
      JSON.stringify(metadata),
      normalizedActorUserId,
      actorUsername
    ]
  );

  return rows[0] || null;
}

async function markCallbackTaskCompletedByLeadId(leadId, completedAt = null, client = pool) {
  const normalizedLeadId = Number(leadId);
  if (!Number.isInteger(normalizedLeadId) || normalizedLeadId <= 0) return null;

  const { rows } = await client.query(
    `UPDATE lead_tasks
     SET status = 'completed',
         completed_at = COALESCE($2::timestamptz, completed_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     WHERE task_type = 'callback'
       AND related_lead_id = $1
     RETURNING *`,
    [normalizedLeadId, completedAt]
  );

  return rows[0] || null;
}

async function getTaskEscalationTargets(client = pool) {
  const { rows } = await client.query(
    `SELECT username
     FROM app_users
     WHERE is_active = TRUE
       AND role IN ('supervisor', 'admin')
     ORDER BY CASE role WHEN 'supervisor' THEN 0 ELSE 1 END, lower(username) ASC
     LIMIT 200`
  );

  return rows
    .map((row) => cleanText(row.username, 120).toLowerCase())
    .filter(Boolean);
}

function pickTaskEscalationTarget(ownerUsername, targets) {
  const owner = cleanText(ownerUsername, 120).toLowerCase();
  const firstNonOwner = targets.find((entry) => entry !== owner);
  return firstNonOwner || targets[0] || null;
}

async function runTaskEscalationSweep({ limit = 200 } = {}) {
  if (taskEscalationInProgress) {
    return { ok: true, skipped: true, escalated: 0 };
  }

  taskEscalationInProgress = true;
  try {
    const escalationTargets = await getTaskEscalationTargets();
    if (!escalationTargets.length) {
      return { ok: true, skipped: false, escalated: 0 };
    }

    const boundedLimit = parsePositiveInt(limit, 200, 1, 500);
    const { rows: candidates } = await pool.query(
      `SELECT id, title, owner_username, related_lead_id
       FROM lead_tasks
       WHERE status IN ('pending', 'in_progress', 'escalated')
         AND completed_at IS NULL
         AND (
           (sla_due_at IS NOT NULL AND sla_due_at < CURRENT_TIMESTAMP)
           OR (sla_due_at IS NULL AND due_at IS NOT NULL AND due_at < CURRENT_TIMESTAMP)
           OR (sla_due_at IS NULL AND due_at IS NULL AND due_date IS NOT NULL AND due_date < CURRENT_DATE)
         )
         AND (
           escalated_at IS NULL
           OR escalated_at <= CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 minute')
         )
       ORDER BY COALESCE(sla_due_at, due_at, due_date::timestamp, created_at) ASC, id ASC
       LIMIT $2`,
      [TASK_ESCALATION_COOLDOWN_MINUTES, boundedLimit]
    );

    let escalatedCount = 0;
    for (const row of candidates) {
      const escalationTarget = pickTaskEscalationTarget(row.owner_username, escalationTargets);
      if (!escalationTarget) continue;

      const { rows: updatedRows } = await pool.query(
        `UPDATE lead_tasks
         SET status = 'escalated',
             escalated_at = CURRENT_TIMESTAMP,
             escalated_to_username = $2,
             escalation_level = LEAST(escalation_level + 1, 10),
             sla_breached_at = COALESCE(sla_breached_at, CURRENT_TIMESTAMP),
             owner_team = COALESCE(owner_team, 'supervision'),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND completed_at IS NULL
         RETURNING id, title, related_lead_id, owner_username, escalation_level`,
        [row.id, escalationTarget]
      );

      if (!updatedRows.length) continue;
      escalatedCount += 1;

      const updated = updatedRows[0];
      const title = cleanText(updated.title, 120) || 'Task escalada';
      const body = `Task escalada automaticamente. Owner original: ${cleanText(updated.owner_username, 120) || 'sin owner'}. Nivel ${Number(updated.escalation_level || 0)}.`;
      await createNotification(
        escalationTarget,
        'task_escalated',
        title,
        body,
        Number(updated.related_lead_id || 0) || null
      ).catch(() => {});
    }

    return { ok: true, skipped: false, escalated: escalatedCount };
  } catch (error) {
    console.error('Error en escalamiento automatico de tareas:', error);
    return { ok: false, skipped: false, escalated: 0 };
  } finally {
    taskEscalationInProgress = false;
  }
}

function startTaskEscalationLoop() {
  if (taskEscalationIntervalHandle) {
    clearInterval(taskEscalationIntervalHandle);
    taskEscalationIntervalHandle = null;
  }

  taskEscalationIntervalHandle = setInterval(() => {
    runTaskEscalationSweep().catch((error) => {
      console.error('Error ejecutando barrido de escalamiento:', error);
    });
  }, TASK_ESCALATION_INTERVAL_MS);

  if (typeof taskEscalationIntervalHandle.unref === 'function') {
    taskEscalationIntervalHandle.unref();
  }

  runTaskEscalationSweep().catch((error) => {
    console.error('Error ejecutando escalamiento inicial:', error);
  });
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

  const callbackDate = pickFirstDefined(body, ['callbackDate', 'callback_date']);
  if (callbackDate !== undefined) {
    if (callbackDate === null || String(callbackDate).trim() === '') {
      changes.callback_date = null;
      changes.callback_completed_at = null;
    } else {
      const normalized = String(callbackDate).trim();
      if (!isValidISODate(normalized)) {
        return { ok: false, message: 'callbackDate debe tener formato YYYY-MM-DD.' };
      }
      changes.callback_date = normalized;
      changes.callback_completed_at = null;
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

  const calcPaymentFrequency = pickFirstDefined(body, ['calcPaymentFrequency', 'calc_payment_frequency', 'paymentFrequency']);
  if (calcPaymentFrequency !== undefined) {
    const allowed = ['monthly', 'bimonthly', 'biweekly'];
    const normalized = String(calcPaymentFrequency || '').toLowerCase().trim();
    if (!allowed.includes(normalized)) {
      return { ok: false, status: 400, message: `calcPaymentFrequency debe ser uno de: ${allowed.join(', ')}` };
    }
    changes.calc_payment_frequency = normalized;
  }

  const includeCoappInContract = pickFirstDefined(body, ['includeCoappInContract', 'include_coapp_in_contract']);
  if (includeCoappInContract !== undefined) {
    const normalizedIncludeCoapp = normalizeBoolean(includeCoappInContract, 'includeCoappInContract');
    if (!normalizedIncludeCoapp.ok) return normalizedIncludeCoapp;
    changes.include_coapp_in_contract = normalizedIncludeCoapp.value;
  }

  const ficoScoreApplicant = pickFirstDefined(body, ['ficoScoreApplicant', 'fico_score_applicant']);
  if (ficoScoreApplicant !== undefined) {
    const normalizedFicoScoreApplicant = normalizeNullableCreditScore(ficoScoreApplicant, 'ficoScoreApplicant');
    if (!normalizedFicoScoreApplicant.ok) return normalizedFicoScoreApplicant;
    changes.fico_score_applicant = normalizedFicoScoreApplicant.value;
  }

  const ficoScoreCoapp = pickFirstDefined(body, ['ficoScoreCoapp', 'fico_score_coapp']);
  if (ficoScoreCoapp !== undefined) {
    const normalizedFicoScoreCoapp = normalizeNullableCreditScore(ficoScoreCoapp, 'ficoScoreCoapp');
    if (!normalizedFicoScoreCoapp.ok) return normalizedFicoScoreCoapp;
    changes.fico_score_coapp = normalizedFicoScoreCoapp.value;
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

  const status = pickFirstDefined(body, ['status', 'leadStatus']);
  if (status !== undefined) {
    const normalizedStatus = normalizeLeadStatusLabel(status, 'status');
    if (!normalizedStatus.ok) return normalizedStatus;
    changes.status = normalizedStatus.value;
  }

  const assignedTo = pickFirstDefined(body, ['assignedTo', 'assigned_to']);
  if (assignedTo !== undefined) {
    changes.assigned_to = toNullableText(assignedTo, 120);
  }

  return { ok: true, changes };
}

function parsePositiveInteger(value) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
}

function getAuthIdentities(authContext = {}) {
  return Array.from(new Set(
    [authContext?.username, authContext?.displayName]
      .map((value) => cleanText(value, 120).toLowerCase())
      .filter(Boolean)
  ));
}

function canAccessAssignedLead(authContext, assignedToValue) {
  if (hasAuthPermission(authContext, 'leads.view_all') || hasGlobalAccessRole(authContext?.role)) return true;
  const identities = getAuthIdentities(authContext);
  if (!identities.length) return false;
  const assignedTo = cleanText(assignedToValue, 120).toLowerCase();
  if (!assignedTo) return true;
  return identities.includes(assignedTo);
}

function canSetLeadAssignee(authContext, nextAssignedToValue) {
  if (hasAuthPermission(authContext, 'leads.assign') || hasGlobalAccessRole(authContext?.role)) return true;
  const identities = getAuthIdentities(authContext);
  if (!identities.length) return false;
  const nextAssignedTo = cleanText(nextAssignedToValue, 120).toLowerCase();
  if (!nextAssignedTo) return false;
  return identities.includes(nextAssignedTo);
}

function normalizeOptionalMoney(value, fieldName) {
  if (value === undefined) return { ok: true, provided: false, value: 0 };
  const normalized = normalizeMoney(value, fieldName);
  if (!normalized.ok) return normalized;
  return { ok: true, provided: true, value: normalized.value };
}

function normalizeOptionalBoolean(value, fieldName) {
  if (value === undefined) return { ok: true, provided: false, value: false };
  const normalized = normalizeBoolean(value, fieldName);
  if (!normalized.ok) return normalized;
  return { ok: true, provided: true, value: normalized.value };
}

function computeCreditorDebtAmount({ debtAmount, unpaidBalance, pastDue, balance }) {
  if (Number.isFinite(debtAmount) && debtAmount >= 0) {
    return Number(debtAmount.toFixed(2));
  }
  const candidates = [unpaidBalance, pastDue, balance]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (!candidates.length) return 0;
  return Number(Math.max(...candidates).toFixed(2));
}

function normalizeMonthsReviewed(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { ok: true, value: null, provided: false };
  }
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0 || num > 999) {
    return { ok: false, message: 'monthsReviewed debe ser un entero entre 0 y 999.' };
  }
  return { ok: true, value: num, provided: true };
}

function normalizeLastPaymentDateText(value) {
  if (value === undefined || value === null) return { ok: true, value: null };

  const raw = String(value).trim();
  if (!raw) return { ok: true, value: null };

  function toMonthYear(month, year) {
    const mm = Number(month);
    let yy = Number(year);
    if (!Number.isInteger(mm) || mm < 1 || mm > 12) return null;
    if (!Number.isInteger(yy)) return null;
    if (yy < 100) yy += yy >= 70 ? 1900 : 2000;
    if (yy < 1900 || yy > 2100) return null;
    return `${String(mm).padStart(2, '0')}/${String(yy)}`;
  }

  function toUsDate(month, day, year) {
    const mm = Number(month);
    const dd = Number(day);
    let yy = Number(year);
    if (!Number.isInteger(mm) || mm < 1 || mm > 12) return null;
    if (!Number.isInteger(dd) || dd < 1 || dd > 31) return null;
    if (!Number.isInteger(yy)) return null;
    if (yy < 100) yy += yy >= 70 ? 1900 : 2000;
    if (yy < 1900 || yy > 2100) return null;

    const candidateIso = `${String(yy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    if (!isValidISODate(candidateIso)) return null;
    return `${String(mm).padStart(2, '0')}/${String(dd).padStart(2, '0')}/${String(yy)}`;
  }

  const normalized = raw
    .replace(/\u00a0/g, ' ')
    .replace(/\b(?:date\s+of\s+last\s+payment|last\s+payment\s+date|date\s+last\s+payment|last\s+payment|last\s+activity|activity\s+date)\b[:\s-]*/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const isoMatch = normalized.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const formatted = toUsDate(isoMatch[2], isoMatch[3], isoMatch[1]);
    if (formatted) return { ok: true, value: formatted };
  }

  const fullUsMatch = normalized.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (fullUsMatch) {
    const formatted = toUsDate(fullUsMatch[1], fullUsMatch[2], fullUsMatch[3]);
    if (formatted) return { ok: true, value: formatted };
  }

  const monthYearMatch = normalized.match(/\b(\d{1,2})[\/\-](\d{2,4})\b/);
  if (monthYearMatch) {
    const formatted = toMonthYear(monthYearMatch[1], monthYearMatch[2]);
    if (formatted) return { ok: true, value: formatted };
  }

  const monthNameMatch = normalized.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})\b/);
  if (monthNameMatch) {
    const parsed = new Date(`${monthNameMatch[1]} ${monthNameMatch[2]}, ${monthNameMatch[3]}`);
    if (!Number.isNaN(parsed.getTime())) {
      const mm = String(parsed.getMonth() + 1).padStart(2, '0');
      const dd = String(parsed.getDate()).padStart(2, '0');
      const yy = String(parsed.getFullYear());
      return { ok: true, value: `${mm}/${dd}/${yy}` };
    }
  }

  return { ok: true, value: null };
}

function normalizeOptionalLastPaymentDateText(value) {
  if (value === undefined) return { ok: true, provided: false, value: null };
  const normalized = normalizeLastPaymentDateText(value);
  if (!normalized.ok) return normalized;
  return { ok: true, provided: true, value: normalized.value };
}

function normalizeResponsibility(value) {
  if (value === undefined || value === null) return { ok: true, value: null };
  const text = String(value).trim();
  if (!text) return { ok: true, value: null };
  const normalized = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  return { ok: true, value: normalized.slice(0, 60) };
}

function normalizeDebtSourceRank(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { ok: true, value: 0 };
  }
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0 || num > 10) {
    return { ok: false, message: 'debtSourceRank debe ser un entero entre 0 y 10.' };
  }
  return { ok: true, value: num };
}

function extractFirstJsonBlock(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch && fencedMatch[1]) return fencedMatch[1].trim();

  const arrayStart = raw.indexOf('[');
  const objectStart = raw.indexOf('{');

  let start = -1;
  if (arrayStart >= 0 && objectStart >= 0) start = Math.min(arrayStart, objectStart);
  else if (arrayStart >= 0) start = arrayStart;
  else if (objectStart >= 0) start = objectStart;
  if (start < 0) return raw;

  let end = Math.max(raw.lastIndexOf(']'), raw.lastIndexOf('}'));
  if (end <= start) return raw.slice(start);

  return raw.slice(start, end + 1).trim();
}

function parseAiJsonResponse(text) {
  const candidate = extractFirstJsonBlock(text);
  if (!candidate) return null;

  try {
    return JSON.parse(candidate);
  } catch (_error) {
    return null;
  }
}

function extractGeminiCandidateText(payload) {
  return (payload?.candidates || [])
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => part?.text || '')
    .find((value) => String(value || '').trim().length > 0) || '';
}

function normalizeHardshipAiText(value, maxLength = HARDSHIP_AI_MAX_TEXT_CHARS) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, maxLength);
}

function normalizeHardshipSourceLang(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'es' || normalized === 'en') return normalized;
  return '';
}

function resolveHardshipReasonLabel(reasonValue, reasonLabelValue) {
  const explicitLabel = cleanText(reasonLabelValue, 120);
  if (explicitLabel) return explicitLabel;
  const reasonKey = cleanText(reasonValue, 80).toLowerCase();
  return HARDSHIP_REASON_LABELS[reasonKey] || 'General Hardship';
}

async function translateHardshipNarrative({ sourceLang, text, hardshipReasonLabel }) {
  const normalizedSourceLang = normalizeHardshipSourceLang(sourceLang);
  const sourceText = normalizeHardshipAiText(text);

  if (!sourceText || sourceText.length < 2) {
    const error = new Error('El texto para traducir es insuficiente.');
    error.code = 'AI_BAD_REQUEST';
    throw error;
  }

  if (!deeplTranslator) {
    const error = new Error('DeepL API no configurada. Agregue DEEPL_API_KEY al archivo .env');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }

  const targetLang = normalizedSourceLang === 'es' ? 'en-US' : 'es';
  const result = await deeplTranslator.translateText(sourceText, normalizedSourceLang === 'es' ? 'es' : 'en', targetLang);
  console.log(`[Sistema] Texto traducido exitosamente usando DeepL API (${normalizedSourceLang} -> ${targetLang})`);

  let translatedText = result.text.trim();
  const subjectEs = /^el cliente\b/i;
  const subjectEn = /^the client\b/i;
  const isTargetEs = targetLang === 'es';
  const subjectPattern = isTargetEs ? subjectEs : subjectEn;
  const subject = isTargetEs ? 'El cliente ' : 'The client ';

  if (subjectPattern.test(translatedText)) {
    translatedText = translatedText.replace(subjectPattern, '').trim();
    translatedText = translatedText.replace(/^(comenta que|reports that|indica que|states that|dice que|says that)/i, (match) => match.toLowerCase());
    translatedText = `${subject}${translatedText}`;
  } else if (!/^(the |el |la |los |las )/i.test(translatedText)) {
    translatedText = translatedText.charAt(0).toLowerCase() + translatedText.slice(1);
    translatedText = `${subject}${translatedText}`;
  }

  return { translatedText, source: 'deepl' };
}

async function translateHardshipNarrativeWithGemini({ sourceLang, text, hardshipReasonLabel }) {
  const apiKey = toNullableText(process.env.GEMINI_API_KEY, 300);
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY no esta configurada.');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }

  const normalizedSourceLang = normalizeHardshipSourceLang(sourceLang);
  if (!normalizedSourceLang) {
    const error = new Error('sourceLang debe ser es o en.');
    error.code = 'AI_BAD_REQUEST';
    throw error;
  }

  const sourceText = normalizeHardshipAiText(text);
  if (sourceText.length < 2) {
    const error = new Error('El texto para traducir es insuficiente.');
    error.code = 'AI_BAD_REQUEST';
    throw error;
  }

  const targetLang = normalizedSourceLang === 'es' ? 'en' : 'es';
  const canonicalSubject = targetLang === 'es' ? 'El cliente' : 'The client';
  const prompt = [
    'You are an expert bilingual hardship writer for debt settlement intake.',
    'Return ONLY valid JSON in this exact format:',
    '{"translatedText":""}',
    '',
    'Rules:',
    '- Translate with high semantic precision and fluent grammar.',
    '- Keep all facts, dates, amounts, debts, and timeline details.',
    '- Do not invent details.',
    '- Output must be in target language only.',
    `- Rewrite debtor references with canonical subject: "${canonicalSubject}".`,
    '- Replace personal names and pronouns tied to the debtor with the canonical subject when applicable.',
    '- Keep a coherent professional tone suitable for hardship documentation.',
    '- No markdown, no extra keys, no extra text.',
    '',
    `Hardship category: ${cleanText(hardshipReasonLabel, 120) || 'General Hardship'}`,
    `Source language: ${normalizedSourceLang === 'es' ? 'Spanish' : 'English'}`,
    `Target language: ${targetLang === 'es' ? 'Spanish' : 'English'}`,
    '',
    'Input narrative:',
    sourceText
  ].join('\n');

  const payload = await geminiRequestWithRetry(apiKey, HARDSHIP_AI_MODEL, prompt, { timeoutMs: HARDSHIP_AI_TIMEOUT_MS, maxRetries: HARDSHIP_AI_MAX_RETRIES });
  const candidateText = extractGeminiCandidateText(payload);
  const parsed = parseAiJsonResponse(candidateText);
  const translatedText = normalizeHardshipAiText(
    parsed?.translatedText || parsed?.translation || parsed?.text || candidateText
  );

  if (!translatedText) {
    throw new Error('La IA no devolvio traduccion valida.');
  }

  return translatedText;
}

async function enhanceHardshipNarrativeWithGemini({ spanishText, englishText, hardshipReasonLabel }) {
  const apiKey = toNullableText(process.env.GEMINI_API_KEY, 300);
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY no esta configurada.');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }

  const inputEs = normalizeHardshipAiText(spanishText);
  const inputEn = normalizeHardshipAiText(englishText);
  if (inputEs.length < 2 && inputEn.length < 2) {
    const error = new Error('Debes enviar texto de hardship en al menos un idioma.');
    error.code = 'AI_BAD_REQUEST';
    throw error;
  }

  const prompt = [
    'You are an expert bilingual hardship writer for debt settlement intake.',
    'Return ONLY valid JSON in this exact format:',
    '{"spanishText":"","englishText":""}',
    '',
    'Task: produce two aligned hardship narratives (Spanish and English).',
    '',
    'Rules:',
    '- Preserve factual meaning from input. Do not invent events, dates, or amounts.',
    '- Make both outputs coherent, professional, and mutually consistent.',
    '- Rewrite debtor references using canonical subject only: "El cliente" in Spanish and "The client" in English.',
    '- Remove personal names and convert pronouns related to debtor into the canonical subject.',
    '- Keep concise but complete wording appropriate for hardship review.',
    '- No markdown, no extra keys, no extra text.',
    '',
    `Hardship category: ${cleanText(hardshipReasonLabel, 120) || 'General Hardship'}`,
    '',
    'Spanish input:',
    inputEs || '[empty]',
    '',
    'English input:',
    inputEn || '[empty]'
  ].join('\n');

  const payload = await geminiRequestWithRetry(apiKey, HARDSHIP_AI_MODEL, prompt, { timeoutMs: HARDSHIP_AI_TIMEOUT_MS, maxRetries: HARDSHIP_AI_MAX_RETRIES });
  const candidateText = extractGeminiCandidateText(payload);
  const parsed = parseAiJsonResponse(candidateText);

  const outEs = normalizeHardshipAiText(
    parsed?.spanishText || parsed?.es || parsed?.detailedReasonEs || ''
  );
  const outEn = normalizeHardshipAiText(
    parsed?.englishText || parsed?.en || parsed?.detailedReasonEn || ''
  );

  if (!outEs && !outEn) {
    throw new Error('La IA no devolvio texto mejorado valido.');
  }

  return {
    spanishText: outEs || inputEs,
    englishText: outEn || inputEn
  };
}

function normalizeAiMoneyValue(value) {
  if (value === undefined || value === null) return 0;
  const normalized = Number(String(value).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(normalized) || normalized < 0) return 0;
  return Number(normalized.toFixed(2));
}

function normalizeAiMonthsReviewed(value) {
  if (value === undefined || value === null) return null;

  const candidates = [];

  if (Array.isArray(value)) {
    value.forEach((item) => {
      const num = Number(item);
      if (Number.isInteger(num) && num >= 0 && num <= 999) candidates.push(num);
    });
  } else {
    const text = String(value);
    const matches = text.match(/\d+/g) || [];
    matches.forEach((match) => {
      const num = Number(match);
      if (Number.isInteger(num) && num >= 0 && num <= 999) candidates.push(num);
    });
  }

  if (!candidates.length) return null;
  return Math.min(...candidates);
}

function cleanCreditorNameFromAddress(name) {
  if (!name) return name;
  let cleaned = name;
  cleaned = cleaned.replace(/^(?:not\s+available|no\s+data\s+available|data\s+not\s+available)\b[:\s-]*/i, '').trim();
  // Remover "CIUDAD,ESTADO ZIP" al inicio
  cleaned = cleaned.replace(/^[A-Z]+[,\s]*[A-Z]{2}\s*\d{5}(-\d{4})?\s*/i, '');
  // Remover PO BOX
  cleaned = cleaned.replace(/^P\.?O\.?\s*BOX\s+\d+\s*/i, '');
  // Remover dirección con calle al inicio
  cleaned = cleaned.replace(/^\d+\s+[A-Z\s]+(ST|AVE|BLVD|DR|RD|LN|CT|WAY)\s*/i, '');
  // Remover ZIP codes sueltos
  cleaned = cleaned.replace(/\b\d{5}(-\d{4})?\b/g, '').trim();
  // Remover etiquetas de contacto comunes del PDF (BYMAILONLY, BY MAIL ONLY, etc.)
  cleaned = cleaned.replace(/\bBY\s*MAIL\s*ONLY\b/gi, '').trim();
  cleaned = cleaned.replace(/\bBYMAILONLY\b/gi, '').trim();
  cleaned = cleaned.replace(/\bBY\s*PHONE\s*ONLY\b/gi, '').trim();
  cleaned = cleaned.replace(/\bDO\s*NOT\s*CONTACT\b/gi, '').trim();
  // Remover prefijos de sección del PDF (Auto loans, Credit cards, Student loans, etc.)
  cleaned = cleaned.replace(/^(?:Auto\s+loans?|Credit\s+cards?|Student\s+loans?|Personal\s+loans?|Installment\s+loans?|Mortgages?|Collections?|Other\s+accounts?)\s+/i, '').trim();
  // Remover números de teléfono
  cleaned = cleaned.replace(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '').trim();
  // Remover estados sueltos de 2 letras al inicio/final si están aislados
  cleaned = cleaned.replace(/\b(?:OLD BETHPAGE|BETHPAGE|JORDAN GTW?|COLUMBUS|WILMINGTON|SIOUX FALLS|SALT LAKE CITY|DALLAS|FORT WORTH|OMAHA|PHOENIX|JACKSONVILLE|RICHMOND)[,\s]*(?:[A-Z]{2})?\s*/gi, '').trim();
  // Dedup: si el nombre tiene sufijo duplicado (ej: "FINAN FINAN") remover la repetición
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const last = words[words.length - 1].toLowerCase();
    const prev = words[words.length - 2].toLowerCase();
    if (last === prev || (prev.startsWith(last) && last.length >= 3) || (last.startsWith(prev) && prev.length >= 3)) {
      // Mantener el más largo
      const keep = words[words.length - 1].length >= words[words.length - 2].length ? words[words.length - 1] : words[words.length - 2];
      words.splice(words.length - 2, 2, keep);
      cleaned = words.join(' ');
    }
  }
  return cleaned || name;
}

function cleanAccountStatus(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const lower = s.toLowerCase().replace(/[^a-z\s]/g, '').trim();
  if (/charge\s*off|charged\s*off/.test(lower)) return 'Charge Off';
  if (/collection/.test(lower)) return 'Collection';
  if (/good\s*standing|as\s*agreed|current|pays?\s*as\s*agreed/.test(lower)) return 'Good Standing';
  if (/closed/.test(lower)) return 'Closed';
  if (/past\s*due|delinquent|late/.test(lower)) return 'Past Due';
  if (/open/.test(lower) && !/open\s+date/.test(lower)) return 'Open';
  if (/paid/.test(lower)) return 'Paid';
  // Devolver limpio sin expandir - solo trim y capitalizar primera palabra
  return s.replace(/\s+/g, ' ').slice(0, 30);
}

function normalizeLifecycleAccountStatus(raw) {
  const value = String(raw || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!value) return null;
  if (/\bclosed\b/.test(value)) return 'Closed';
  if (/\bcharge\s*off\b|\bcharged\s*off\b|\bcollection\b|\btransferred\b|\brefinanced\b/.test(value)) return 'Closed';
  if (/\bpast\s*due\b|\bdelinquent\b|\blate\b/.test(value)) return 'Past Due';
  if (/\bpaid\b/.test(value)) return 'Paid';
  if (/\bgood\s*standing\b|\bas\s*agreed\b|\bcurrent\b/.test(value)) return 'Good Standing';
  if (/\bopen\b/.test(value)) {
    const openDateOnly = /\bopen\s+date\b/.test(value) && !/\bstatus\b|\boverview\b/.test(value);
    if (!openDateOnly) return 'Open';
  }
  return null;
}

function getLifecycleStatusPriority(rawStatus) {
  const lifecycle = normalizeLifecycleAccountStatus(rawStatus);
  if (!lifecycle) return 0;
  if (lifecycle === 'Closed') return 5;
  if (lifecycle === 'Past Due') return 4;
  if (lifecycle === 'Good Standing') return 3;
  if (lifecycle === 'Paid') return 2;
  if (lifecycle === 'Open') return 1;
  return 0;
}

function cleanAccountType(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  // Limpiar patrones donde Gemini concatena campos: "Credit CardType Individual" → "Credit Card"
  s = s.replace(/\bType\b.*/i, '').trim();
  // Si el valor es una responsabilidad, no es un tipo
  if (/^(?:individual|joint|authorized|cosigner)$/i.test(s)) return null;
  const lower = s.toLowerCase().replace(/[^a-z\s\/&]/g, '').trim();
  if (!lower) return null;
  if (/mortgage|home\s*loan|conventional|fha\b|va\s*loan/.test(lower)) return 'Mortgage';
  if (/credit\s*card|bank\s*card|charge\s*card/.test(lower)) return 'Credit Card';
  if (/auto(?:mobile)?|vehicle|car\s*loan/.test(lower)) return 'Auto Loan';
  if (/personal\s*loan/.test(lower)) return 'Personal Loan';
  if (/student\s*loan|education/.test(lower)) return 'Student Loan';
  if (/unsecured/.test(lower)) return 'Unsecured';
  if (/secured/.test(lower)) return 'Secured';
  if (/installment/.test(lower)) return 'Installment';
  if (/revolving|line\s*of\s*credit/.test(lower)) return 'Revolving';
  if (/charge\s*account/.test(lower)) return 'Charge Account';
  if (/collection/.test(lower)) return 'Collection';
  return s.replace(/\s+/g, ' ').slice(0, 30);
}

function normalizeAiCreditorEntry(entry, sourceReport) {
  if (!entry || typeof entry !== 'object') return null;

  let creditorName = toNullableText(
    pickFirstDefined(entry, ['creditorName', 'creditor', 'name', 'creditor_name']),
    180
  );
  if (!creditorName) return null;
  creditorName = cleanCreditorNameFromAddress(creditorName);

  const debtAmount = normalizeAiMoneyValue(
    pickFirstDefined(entry, ['debtAmount', 'latestDebt', 'recentDebt', 'balance', 'debt_amount'])
  );

  const accountType = cleanAccountType(
    pickFirstDefined(entry, ['accountType', 'type', 'account_type'])
  );

  // Filtrar cuentas mortgage
  if (accountType === 'Mortgage') return null;

  return {
    sourceReport,
    creditorName,
    accountNumber: toNullableText(pickFirstDefined(entry, ['accountNumber', 'account', 'accountNo', 'account_number']), 80),
    dateLastPayment: normalizeLastPaymentDateText(
      pickFirstDefined(entry, ['dateLastPayment', 'date_last_payment', 'lastPaymentDate', 'last_payment_date', 'lastActivity', 'last_activity', 'activityDate', 'activity_date'])
    ).value,
    accountStatus: cleanAccountStatus(
      pickFirstDefined(entry, ['accountStatus', 'status', 'account_status'])
    ),
    accountType,
    responsibility: toNullableText(pickFirstDefined(entry, ['responsibility', 'responsability']), 60),
    monthsReviewed: normalizeAiMonthsReviewed(pickFirstDefined(entry, ['monthsReviewed', 'months_reviewed', 'months'])),
    debtAmount,
    pastDue: normalizeAiMoneyValue(pickFirstDefined(entry, ['pastDue', 'past_due'])),
    creditLimit: normalizeAiMoneyValue(pickFirstDefined(entry, ['creditLimit', 'credit_limit'])),
    highCredit: normalizeAiMoneyValue(pickFirstDefined(entry, ['highCredit', 'high_credit'])),
    isIncluded: debtAmount > 0
  };
}

const GEMINI_FALLBACK_MODELS = ['gemini-2.0-flash-lite', 'gemini-2.5-flash-preview-05-20'];

async function geminiRequestWithRetry(apiKey, model, prompt, { timeoutMs = 25000, maxRetries = 4 } = {}) {
  const modelsToTry = [model, ...GEMINI_FALLBACK_MODELS.filter(m => m !== model)];
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0 }
  });

  for (const currentModel of modelsToTry) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(currentModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal
        });
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          const err = new Error('Tiempo de espera agotado en solicitud a IA.');
          err.code = 'AI_TIMEOUT';
          throw err;
        }
        throw fetchError;
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '0', 10);
        const delayMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(5000 * Math.pow(2, attempt), 60000);
        console.warn(`[Gemini][${currentModel}] 429 rate limit, reintento ${attempt + 1}/${maxRetries} en ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }

      if (response.status === 429 && attempt >= maxRetries) {
        console.warn(`[Gemini][${currentModel}] 429 persistente tras ${maxRetries} reintentos, probando siguiente modelo...`);
        break;
      }

      if (response.status === 404) {
        console.warn(`[Gemini][${currentModel}] modelo no encontrado (404), probando siguiente...`);
        break;
      }

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload) {
        const detail = payload?.error?.message || `HTTP ${response.status}`;
        const err = new Error(`Gemini API error: ${detail}`);
        err.httpStatus = response.status;
        throw err;
      }

      if (currentModel !== model) {
        console.log(`[Gemini] Exito con modelo fallback: ${currentModel}`);
      }
      return payload;
    }
  }

  const err = new Error('Limite de peticiones de IA alcanzado en todos los modelos. Intenta de nuevo en 1 minuto.');
  err.code = 'AI_RATE_LIMIT';
  err.httpStatus = 429;
  throw err;
}

async function analyzeCreditReportWithGemini({ text, sourceReport }) {
  const apiKey = toNullableText(process.env.GEMINI_API_KEY, 300);
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY no esta configurada.');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }

  const boundedText = String(text || '').slice(0, CREDIT_REPORT_AI_MAX_TEXT_CHARS);
  const prompt = [
    'Extrae cuentas de un reporte de credito y responde SOLO JSON valido.',
    'Devuelve este formato exacto:',
    '{"creditors":[{"creditorName":"","debtAmount":0,"accountNumber":"","dateLastPayment":"","accountStatus":"","accountType":"","responsibility":"","monthsReviewed":null,"pastDue":0,"creditLimit":0,"highCredit":0}]}',
    '',
    'Reglas:',
    '- No inventes datos. Si falta algo usa null o 0.',
    '- creditorName = SOLO el nombre del acreedor/banco/empresa (ej: "TBOM/MILESTONE", "CAPITAL ONE", "JPMCB CARD"). NUNCA incluir: direcciones, ciudades, estados, ZIP codes, PO BOX, números de teléfono, etiquetas de contacto como "BYMAILONLY"/"BY MAIL ONLY"/"BY PHONE ONLY", ni prefijos de sección del reporte como "Auto loans"/"Credit cards"/"Student loans"/"Collections".',
    '- debtAmount = deuda mas reciente/actual para esa cuenta (current balance, unpaid balance, amount due o equivalente).',
    '- creditLimit = limite de credito de la cuenta (Credit Limit, Credit Line). Si no existe (prestamos, auto loans, etc.) usar 0.',
    '- highCredit = credito mas alto usado (High Credit, Highest Balance). Si no existe usar 0.',
    '- dateLastPayment = fecha del ultimo pago de esa cuenta, si aparece (Date of Last Payment, Last Payment Date, Date Last Payment). Si no aparece literal, usar Last Activity/Activity Date como fallback. Formato preferido MM/DD/YYYY. Si no existe usar "".',
    '- monthsReviewed: si hay multiples valores posibles para la misma cuenta, usar SIEMPRE el menor entero.',
    '- Debe salir una fila por cuenta detectada.',
    '- accountType = SOLO el tipo de cuenta limpio: "Credit Card", "Auto Loan", "Mortgage", "Personal Loan", "Student Loan", "Installment", "Revolving", "Unsecured", "Secured", "Collection", "Charge Account". NO incluir la palabra "Type" ni otros campos.',
    '- accountStatus = SOLO el estado: "Good Standing", "Open", "Closed", "Charge Off", "Collection", "Past Due", "Paid". NO concatenar con otros campos.',
    '- responsibility = SOLO: "Individual", "Joint", "Authorized". NO mezclar con accountType.',
    '- Excluir cuentas de tipo Mortgage, Home Loan, Conventional, FHA, VA Loan.',
    '',
    `sourceReport: ${sourceReport || 'Reporte'}`,
    '--- BEGIN CREDIT REPORT TEXT ---',
    boundedText,
    '--- END CREDIT REPORT TEXT ---'
  ].join('\n');

  const payload = await geminiRequestWithRetry(apiKey, CREDIT_REPORT_AI_MODEL, prompt, { timeoutMs: CREDIT_REPORT_AI_TIMEOUT_MS });

  const candidateText = extractGeminiCandidateText(payload);

  const parsed = parseAiJsonResponse(candidateText);
  if (!parsed) {
    throw new Error('La IA no devolvio JSON valido para creditors.');
  }

  const rawEntries = Array.isArray(parsed?.creditors)
    ? parsed.creditors
    : (Array.isArray(parsed) ? parsed : []);

  return rawEntries
    .map((entry) => normalizeAiCreditorEntry(entry, sourceReport))
    .filter(Boolean);
}

function normalizeDebtorParty(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { ok: true, value: 'applicant' };
  }

  const normalized = String(value).trim().toLowerCase();
  if (['applicant', 'main', 'primary'].includes(normalized)) {
    return { ok: true, value: 'applicant' };
  }

  if (['coapp', 'co-app', 'co_applicant', 'coapplicant', 'co applicant', 'co'].includes(normalized)) {
    return { ok: true, value: 'coapp' };
  }

  return { ok: false, message: 'debtorParty debe ser applicant o coapp.' };
}

function normalizeFileDocumentCategory(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return { ok: false, message: 'documentCategory es obligatorio.' };
  }
  if (!FILE_DOCUMENT_CATEGORIES.has(normalized)) {
    return { ok: false, message: 'documentCategory no es valido.' };
  }
  return { ok: true, value: normalized };
}

function normalizeFileMimeType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return { ok: false, message: 'type es obligatorio.' };
  }
  if (!FILE_ALLOWED_MIME_TYPES.has(normalized)) {
    return { ok: false, message: `Tipo de archivo no permitido: ${normalized}` };
  }
  return { ok: true, value: normalized };
}

function normalizeFileSize(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { ok: false, message: 'size debe ser un entero valido.' };
  }
  if (parsed > FILE_MAX_SIZE_BYTES) {
    return { ok: false, message: 'Archivo muy grande (max 10MB).' };
  }
  return { ok: true, value: parsed };
}

function normalizeFileDataUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return { ok: false, message: 'data es obligatorio.' };
  }

  const match = raw.match(/^data:([a-z0-9.+/-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    return { ok: false, message: 'data debe estar en formato Data URL base64.' };
  }

  const mimeType = String(match[1] || '').toLowerCase();
  if (!FILE_ALLOWED_MIME_TYPES.has(mimeType)) {
    return { ok: false, message: `Tipo de archivo no permitido: ${mimeType}` };
  }

  const base64Payload = String(match[2] || '').replace(/\s+/g, '');
  const estimatedBytes = Math.floor((base64Payload.length * 3) / 4);
  if (estimatedBytes > FILE_MAX_SIZE_BYTES) {
    return { ok: false, message: 'Archivo muy grande (max 10MB).' };
  }

  return { ok: true, value: raw, mimeType, estimatedBytes };
}

function mapLeadFileRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    leadId: Number(row.lead_id),
    name: row.file_name || '',
    type: row.mime_type || '',
    size: Number(row.file_size || 0),
    documentCategory: row.document_category || null,
    creditReportParty: row.credit_report_party || null,
    uploadedAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function normalizeCreditorPayload(body = {}) {
  const creditorName = toNullableText(
    cleanCreditorNameFromAddress(pickFirstDefined(body, ['creditorName', 'creditor_name'])),
    180
  );
  if (!creditorName) {
    return { ok: false, message: 'creditorName es obligatorio.' };
  }

  const monthlyPayment = normalizeMoney(pickFirstDefined(body, ['monthlyPayment', 'monthly_payment']), 'monthlyPayment');
  if (!monthlyPayment.ok) return monthlyPayment;
  const balance = normalizeMoney(pickFirstDefined(body, ['balance']), 'balance');
  if (!balance.ok) return balance;
  const pastDue = normalizeMoney(pickFirstDefined(body, ['pastDue', 'past_due']), 'pastDue');
  if (!pastDue.ok) return pastDue;
  const unpaidBalance = normalizeMoney(pickFirstDefined(body, ['unpaidBalance', 'unpaid_balance']), 'unpaidBalance');
  if (!unpaidBalance.ok) return unpaidBalance;
  const creditLimit = normalizeMoney(pickFirstDefined(body, ['creditLimit', 'credit_limit']), 'creditLimit');
  if (!creditLimit.ok) return creditLimit;
  const highCredit = normalizeMoney(pickFirstDefined(body, ['highCredit', 'high_credit']), 'highCredit');
  if (!highCredit.ok) return highCredit;

  const debtAmountInput = normalizeOptionalMoney(pickFirstDefined(body, ['debtAmount', 'debt_amount']), 'debtAmount');
  if (!debtAmountInput.ok) return debtAmountInput;

  const included = normalizeOptionalBoolean(pickFirstDefined(body, ['isIncluded', 'is_included']), 'isIncluded');
  if (!included.ok) return included;
  
  const monthsReviewed = normalizeMonthsReviewed(pickFirstDefined(body, ['monthsReviewed', 'months_reviewed']));
  if (!monthsReviewed.ok) return monthsReviewed;
  
  const responsibility = normalizeResponsibility(pickFirstDefined(body, ['responsibility']));
  if (!responsibility.ok) return responsibility;

  const debtorParty = normalizeDebtorParty(pickFirstDefined(body, ['debtorParty', 'debtor_party']));
  if (!debtorParty.ok) return debtorParty;

  const debtSourceRank = normalizeDebtSourceRank(pickFirstDefined(body, ['debtSourceRank', 'debt_source_rank']));
  if (!debtSourceRank.ok) return debtSourceRank;

  const dateLastPayment = normalizeLastPaymentDateText(
    pickFirstDefined(body, ['dateLastPayment', 'date_last_payment', 'lastPaymentDate', 'last_payment_date'])
  );
  if (!dateLastPayment.ok) return dateLastPayment;

  const normalizedAccountType = cleanAccountType(
    pickFirstDefined(body, ['accountType', 'account_type'])
  );
  const normalizedAccountStatus = cleanAccountStatus(
    pickFirstDefined(body, ['accountStatus', 'account_status'])
  );
  const lifecycleAccountStatus = normalizeLifecycleAccountStatus(normalizedAccountStatus);
  const effectiveAccountStatus = normalizedAccountType === 'Collection'
    ? 'Closed'
    : (lifecycleAccountStatus || normalizedAccountStatus);

  return {
    ok: true,
    value: {
      source_report: toNullableText(pickFirstDefined(body, ['sourceReport', 'source_report']), 180),
      creditor_name: creditorName,
      original_creditor: toNullableText(
        cleanCreditorNameFromAddress(pickFirstDefined(body, ['originalCreditor', 'original_creditor'])),
        180
      ),
      account_number: toNullableText(pickFirstDefined(body, ['accountNumber', 'account_number']), 80),
      date_last_payment: dateLastPayment.value,
      account_status: toNullableText(effectiveAccountStatus, 80),
      account_type: toNullableText(normalizedAccountType, 80),
      debtor_party: debtorParty.value,
      responsibility: responsibility.value,
      months_reviewed: monthsReviewed.value,
      monthly_payment: monthlyPayment.value,
      balance: balance.value,
      past_due: pastDue.value,
      unpaid_balance: unpaidBalance.value,
      credit_limit: creditLimit.value,
      high_credit: highCredit.value,
      debt_amount: computeCreditorDebtAmount({
        debtAmount: debtAmountInput.provided ? debtAmountInput.value : undefined,
        unpaidBalance: unpaidBalance.value,
        pastDue: pastDue.value,
        balance: balance.value
      }),
      debt_source_rank: debtSourceRank.value,
      is_included: included.provided ? included.value : true,
      notes: toNullableText(pickFirstDefined(body, ['notes']), 3000),
      raw_snapshot: toNullableText(pickFirstDefined(body, ['rawSnapshot', 'raw_snapshot']), 12000)
    }
  };
}

function parseDbMoney(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return 0;
  return Number(normalized.toFixed(2));
}

function formatContractCurrency(value) {
  const amount = parseDbMoney(value);
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatContractDate(value) {
  const fallback = new Date().toISOString().slice(0, 10);
  const iso = typeof value === 'string' && isValidISODate(value) ? value : fallback;
  const dateValue = new Date(`${iso}T00:00:00`);
  const month = String(dateValue.getMonth() + 1).padStart(2, '0');
  const day = String(dateValue.getDate()).padStart(2, '0');
  const year = String(dateValue.getFullYear());
  return `${month}/${day}/${year}`;
}

function normalizeDateInputToIso(value) {
  if (value === undefined || value === null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();
  if (!raw) return '';

  const isoDate = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDate && isValidISODate(isoDate[1])) return isoDate[1];

  const usDate = raw.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (usDate) {
    const month = Number(usDate[1]);
    const day = Number(usDate[2]);
    let year = Number(usDate[3]);
    if (Number.isInteger(year) && year < 100) year += year >= 70 ? 1900 : 2000;
    const candidate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (isValidISODate(candidate)) return candidate;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return '';
}

function formatPersonDateToIso(value) {
  return normalizeDateInputToIso(value);
}

function normalizeContractSsn(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 9) return '';
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function normalizeContractPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return cleanText(value, 40);
}

function readContractBooleanFlag(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function resolveLeadBestPhone(lead = {}) {
  return cleanText(lead.cell_phone, 40) || cleanText(lead.home_phone, 40) || cleanText(lead.phone, 40);
}

function buildContractAddressLine(lead = {}) {
  const street = cleanText(lead.address_street, 180);
  const city = cleanText(lead.city, 120);
  const stateCode = cleanText(lead.state_code, 12);
  const zipCode = cleanText(lead.zip_code, 12);
  const cityStateZip = [city, stateCode, zipCode].filter(Boolean).join(' ').trim();
  if (street && cityStateZip) return `${street}, ${cityStateZip}`;
  return street || cityStateZip;
}

function computeContractMonthlyPayment(lead = {}) {
  const totalDebt = Math.max(0, parseDbMoney(lead.calc_total_debt));
  const settlementPercent = Math.max(0, Math.min(100, parseDbMoney(lead.calc_settlement_percent)));
  const programFeePercent = Math.max(0, Math.min(100, parseDbMoney(lead.calc_program_fee_percent)));
  const monthlyBankFee = Math.max(0, parseDbMoney(lead.calc_bank_fee));
  const months = Math.max(1, parsePositiveInt(lead.calc_months, 48, 1, 240));
  const legalPlanEnabled = Boolean(lead.calc_legal_plan_enabled);

  const estimatedSettlement = totalDebt * (settlementPercent / 100);
  const programFees = totalDebt * (programFeePercent / 100);
  const totalLegalFees = legalPlanEnabled ? CONTRACT_LEGAL_MONTHLY_FEE * months : 0;
  const totalBankFees = (monthlyBankFee * months) + monthlyBankFee;
  const totalProgram = estimatedSettlement + programFees + totalLegalFees + totalBankFees;
  return parseDbMoney(totalProgram / months);
}

function buildContractGeneratorPayload(lead = {}, creditors = [], budgetData = null, bankingInfo = null) {
  const includeCoapp = readContractBooleanFlag(lead.include_coapp_in_contract);
  const primaryPhone = resolveLeadBestPhone(lead);
  const coApplicantPhone = cleanText(lead.co_applicant_cell_phone, 40)
    || cleanText(lead.co_applicant_home_phone, 40)
    || '';
  const applicantDobIso = formatPersonDateToIso(lead.dob);
  const coApplicantDobIso = includeCoapp ? formatPersonDateToIso(lead.co_applicant_dob) : '';
  const firstDepositDateIso = formatPersonDateToIso(lead.first_deposit_date);
  const contractDate = formatContractDate(new Date().toISOString().slice(0, 10));
  const months = Math.max(1, parsePositiveInt(lead.calc_months, 48, 1, 240));
  const creditorsPayload = [];

  for (let index = 0; index < CONTRACT_MAX_CREDITORS; index += 1) {
    const creditor = creditors[index] || {};
    const creditorName = cleanText(creditor.creditor_name, 180);
    const accountNumber = cleanText(creditor.account_number, 80);
    const normalizedDateLastPayment = normalizeLastPaymentDateText(creditor.date_last_payment).value || '';
    const debtAmount = Math.max(
      parseDbMoney(creditor.debt_amount),
      parseDbMoney(creditor.balance),
      parseDbMoney(creditor.unpaid_balance),
      parseDbMoney(creditor.past_due)
    );
    const hasCreditorData = Boolean(creditorName || accountNumber || debtAmount > 0 || normalizedDateLastPayment);
    creditorsPayload.push({
      name: creditorName,
      account_number: accountNumber,
      balance: hasCreditorData ? parseDbMoney(debtAmount) : null,
      date_last_payment: hasCreditorData ? normalizedDateLastPayment : ''
    });
  }

  const totalDebt = Math.max(0, parseDbMoney(lead.calc_total_debt));
  const settlementPercent = Math.max(0, Math.min(100, parseDbMoney(lead.calc_settlement_percent)));
  const programFeePercent = Math.max(0, Math.min(100, parseDbMoney(lead.calc_program_fee_percent)));
  const monthlyBankFee = Math.max(0, parseDbMoney(lead.calc_bank_fee));
  const legalPlanEnabled = Boolean(lead.calc_legal_plan_enabled);

  const estimatedSettlement = totalDebt * (settlementPercent / 100);
  const programFees = totalDebt * (programFeePercent / 100);
  const totalLegalFees = legalPlanEnabled ? CONTRACT_LEGAL_MONTHLY_FEE * months : 0;
  const totalBankFees = (monthlyBankFee * months) + monthlyBankFee;
  const totalProgramCost = estimatedSettlement + programFees + totalLegalFees + totalBankFees;

  const budget = budgetData ? normalizeBudgetData(budgetData) : createDefaultBudgetData();
  const bi = budget.budgetItems || {};
  const housing = bi.housing || {};
  const transport = bi.transportation || {};
  const food = bi.food || {};
  const utilities = bi.utilities || {};

  const totalHousing = parseDbMoney(housing.housingPayment) + parseDbMoney(housing.homeOwnersInsurance) + parseDbMoney(housing.secondaryHousePayment);
  const totalTransport = parseDbMoney(transport.autoPayments) + parseDbMoney(transport.autoInsurance) + parseDbMoney(transport.repairsMaintenance) + parseDbMoney(transport.gasoline) + parseDbMoney(transport.parking) + parseDbMoney(transport.commuting);
  const totalFood = parseDbMoney(food.groceries) + parseDbMoney(food.eatingOut);
  const totalUtilities = parseDbMoney(utilities.averageEnergy) + parseDbMoney(utilities.averagePhone) + parseDbMoney(utilities.averageWater) + parseDbMoney(utilities.averageInternet);
  const otherExpenses = parseDbMoney(bi.otherExpenses);
  const totalMonthlyExpenses = totalHousing + totalTransport + totalFood + totalUtilities + otherExpenses;

  const incomeApp = budget.income?.applicant || {};
  const incomeCoapp = budget.income?.coapp || {};
  const totalIncomeApplicant = parseDbMoney(incomeApp.netMonthlyIncome) + parseDbMoney(incomeApp.socialSecurity) + parseDbMoney(incomeApp.alimony) + parseDbMoney(incomeApp.retirement) + parseDbMoney(incomeApp.totalHouseholdIncome) + parseDbMoney(incomeApp.fixedIncome) + parseDbMoney(incomeApp.unemployment) + parseDbMoney(incomeApp.childSupport) + parseDbMoney(incomeApp.other);
  const totalIncomeCoapp = parseDbMoney(incomeCoapp.netMonthlyIncome) + parseDbMoney(incomeCoapp.socialSecurity) + parseDbMoney(incomeCoapp.alimony) + parseDbMoney(incomeCoapp.retirement) + parseDbMoney(incomeCoapp.totalHouseholdIncome) + parseDbMoney(incomeCoapp.fixedIncome) + parseDbMoney(incomeCoapp.unemployment) + parseDbMoney(incomeCoapp.childSupport) + parseDbMoney(incomeCoapp.other);
  const totalMonthlyIncome = totalIncomeApplicant + totalIncomeCoapp;
  const monthlyPayment = computeContractMonthlyPayment(lead);
  const remaining = totalMonthlyIncome - totalMonthlyExpenses - monthlyPayment;
  const banking = bankingInfo || {};
  const normalizedBankAccountType = cleanText(banking.account_type, 30);
  const normalizedBankRelationship = cleanText(banking.relationship_to_customer, 60).toLowerCase();
  const bankAccountTypeLower = normalizedBankAccountType.toLowerCase();
  const bankAddressLine1 = cleanText(banking.address, 180);
  const bankAddressLine2 = cleanText(banking.address2, 180);

  return {
    lead: {
      full_name: cleanText(lead.full_name, 120),
      dob: applicantDobIso,
      ssn: normalizeContractSsn(lead.ssn),
      email: cleanText(lead.email, 160),
      address_street: cleanText(lead.address_street, 180),
      city: cleanText(lead.city, 120),
      state_code: cleanText(lead.state_code, 12),
      zip_code: cleanText(lead.zip_code, 12),
      first_deposit_date: firstDepositDateIso,
      phone: normalizeContractPhone(primaryPhone),
      cell_phone: normalizeContractPhone(lead.cell_phone),
      home_phone: normalizeContractPhone(lead.home_phone),
      include_coapp_in_contract: includeCoapp,
      co_applicant_name: includeCoapp ? cleanText(lead.co_applicant_name, 120) : '',
      co_applicant_dob: coApplicantDobIso,
      co_applicant_ssn: includeCoapp ? normalizeContractSsn(lead.co_applicant_ssn) : '',
      co_applicant_email: includeCoapp ? cleanText(lead.co_applicant_email, 160) : '',
      co_applicant_phone: includeCoapp ? normalizeContractPhone(coApplicantPhone) : ''
    },
    program: {
      program_length: String(months),
      monthly_payment: monthlyPayment,
      total_debt_enrolled: totalDebt,
      date_short: contractDate,
      settlement_percent: settlementPercent,
      program_fee_percent: programFeePercent,
      settlement_fee: parseDbMoney(programFees),
      estimated_settlement: parseDbMoney(estimatedSettlement),
      total_legal_fees: parseDbMoney(totalLegalFees),
      total_bank_fees: parseDbMoney(totalBankFees),
      total_program_cost: parseDbMoney(totalProgramCost)
    },
    banking: {
      bank_name: cleanText(banking.bank_name, 120),
      routing_number: cleanText(banking.routing_number, 32),
      account_number: cleanText(banking.account_number, 50),
      account_type: normalizedBankAccountType,
      name_on_account: cleanText(banking.name_on_account, 120),
      address: [bankAddressLine1, bankAddressLine2].filter(Boolean).join(' ').trim(),
      city: cleanText(lead.city, 120) || cleanText(banking.bank_city, 120),
      state: cleanText(lead.state_code, 12) || cleanText(banking.bank_state, 12),
      zip_code: cleanText(lead.zip_code, 12) || cleanText(banking.bank_zip, 12),
      initial_payment_amount: parseDbMoney(banking.initial_payment_amount),
      payment_day_of_month: parsePositiveInt(banking.payment_day_of_month, 0, 0, 31),
      is_checking: bankAccountTypeLower.includes('check') || bankAccountTypeLower.includes('monet'),
      is_savings: bankAccountTypeLower.includes('sav') || bankAccountTypeLower.includes('ahorro'),
      is_commercial: normalizedBankRelationship.includes('commer') || normalizedBankRelationship.includes('business'),
      is_personal: !(normalizedBankRelationship.includes('commer') || normalizedBankRelationship.includes('business'))
    },
    creditors: creditorsPayload,
    budget: {
      income: budget.income,
      totalMonthlyIncome: parseDbMoney(totalMonthlyIncome),
      expenses: {
        housing: parseDbMoney(totalHousing),
        transportation: parseDbMoney(totalTransport),
        food: parseDbMoney(totalFood),
        utilities: parseDbMoney(totalUtilities),
        other: parseDbMoney(otherExpenses)
      },
      totalMonthlyExpenses: parseDbMoney(totalMonthlyExpenses),
      remaining: parseDbMoney(remaining),
      hardship: budget.hardship,
      housingType: housing.housingType || ''
    }
  };
}

async function runContractPdfGenerator({ payload }) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-gw-contract-'));
  const payloadPath = path.join(tempDir, 'payload.json');
  const outputPath = path.join(tempDir, 'contract.pdf');
  const pythonBin = cleanText(process.env.PYTHON_BIN, 120) || 'python';

  try {
    await fs.access(CONTRACT_GENERATOR_SCRIPT_PATH);
    await fs.access(CONTRACT_TEMPLATE_PATH);
    await fs.writeFile(payloadPath, JSON.stringify(payload), 'utf-8');

    await new Promise((resolve, reject) => {
      const child = spawn(
        pythonBin,
        [
          CONTRACT_GENERATOR_SCRIPT_PATH,
          '--template',
          CONTRACT_TEMPLATE_PATH,
          '--payload',
          payloadPath,
          '--output',
          outputPath
        ],
        {
          cwd: ROOT_DIR,
          windowsHide: true
        }
      );

      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk || '');
      });

      child.on('error', (error) => {
        if (error && error.code === 'ENOENT') {
          return reject(
            new Error(
              `No se encontro el ejecutable de Python (${pythonBin}). Instala Python 3 y/o configura PYTHON_BIN en .env.`
            )
          );
        }
        reject(error);
      });

      child.on('close', (code) => {
        if (code === 0) return resolve();
        const details = cleanText(stderr, 2000);
        reject(new Error(details || `El generador de contrato fallo (exit ${code}).`));
      });
    });

    const pdfBuffer = await fs.readFile(outputPath);
    return pdfBuffer;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function mapCreditorRow(row) {
  if (!row) return row;
  return {
    ...row,
    monthly_payment: parseDbMoney(row.monthly_payment),
    balance: parseDbMoney(row.balance),
    past_due: parseDbMoney(row.past_due),
    unpaid_balance: parseDbMoney(row.unpaid_balance),
    credit_limit: parseDbMoney(row.credit_limit),
    high_credit: parseDbMoney(row.high_credit),
    debt_amount: parseDbMoney(row.debt_amount),
    is_included: Boolean(row.is_included),
    debtor_party: normalizeDebtorParty(row.debtor_party).value,
    responsibility: row.responsibility || null,
    months_reviewed: row.months_reviewed !== null ? parseInt(row.months_reviewed, 10) : null,
    date_last_payment: row.date_last_payment || null
  };
}

async function ensureLeadExists(leadId) {
  const { rows } = await pool.query(
    'SELECT id FROM leads WHERE id = $1 LIMIT 1',
    [leadId]
  );
  return rows.length > 0;
}

async function getLeadCreditorsSummary(leadId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::INTEGER AS total_count,
       COUNT(*) FILTER (WHERE is_included)::INTEGER AS included_count,
       COALESCE(SUM(debt_amount), 0) AS total_debt,
       COALESCE(SUM(debt_amount) FILTER (WHERE is_included), 0) AS included_debt,
       COALESCE(SUM(past_due) FILTER (WHERE is_included), 0) AS included_past_due
     FROM lead_creditors
     WHERE lead_id = $1`,
    [leadId]
  );

  const summary = rows[0] || {};
  return {
    totalCount: Number(summary.total_count || 0),
    includedCount: Number(summary.included_count || 0),
    totalDebt: parseDbMoney(summary.total_debt),
    includedDebt: parseDbMoney(summary.included_debt),
    includedPastDue: parseDbMoney(summary.included_past_due)
  };
}

function normalizeCreditorNameKey(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeAccountToken(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9X*]/g, '');
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

function isLikelyDuplicateCreditorEntry(entry, existing) {
  const entryParty = normalizeDebtorParty(entry.debtor_party).value;
  const existingParty = normalizeDebtorParty(existing.debtor_party).value;
  if (entryParty !== existingParty) return false;

  if (normalizeCreditorNameKey(entry.creditor_name) !== normalizeCreditorNameKey(existing.creditor_name)) {
    return false;
  }

  const entryStatus = String(entry.account_status || '').trim().toLowerCase();
  const existingStatus = String(existing.account_status || '').trim().toLowerCase();
  if (entryStatus && existingStatus && entryStatus !== existingStatus) {
    return false;
  }

  const entryAccount = String(entry.account_number || '').trim();
  const existingAccount = String(existing.account_number || '').trim();
  if (entryAccount && existingAccount) {
    return accountTokensLikelySame(entryAccount, existingAccount);
  }

  const entryDebt = parseDbMoney(entry.debt_amount);
  const existingDebt = parseDbMoney(existing.debt_amount);
  return Math.abs(entryDebt - existingDebt) <= 0.01;
}

function buildCreditorFingerprint(creditor) {
  const debtorParty = normalizeDebtorParty(creditor.debtor_party).value;
  const creditorName = normalizeCreditorNameKey(creditor.creditor_name);
  const accountNumber = normalizeAccountToken(creditor.account_number).replace(/[X*]/g, '');
  const debt = parseDbMoney(creditor.debt_amount).toFixed(2);
  return `${debtorParty}|${creditorName}|${accountNumber}|${debt}`;
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
    stateType: getStateTypeFromCode(stateCode)
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

app.use('/api/leads', async (req, res, next) => {
  const leadPathMatch = String(req.path || '').match(/^\/(\d+)(?:\/|$)/);
  if (!leadPathMatch) return next();

  const leadId = Number(leadPathMatch[1]);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({ message: 'ID de lead invalido.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, assigned_to
       FROM leads
       WHERE id = $1
       LIMIT 1`,
      [leadId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    if (!canAccessAssignedLead(req.auth, rows[0].assigned_to)) {
      return res.status(403).json({ message: 'No tienes acceso a este lead.' });
    }

    req.leadAccess = {
      id: leadId,
      assignedTo: cleanText(rows[0].assigned_to, 120) || null
    };
    return next();
  } catch (error) {
    console.error('Error validando acceso a lead:', error);
    return res.status(500).json({ message: 'No se pudo validar acceso al lead.' });
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

  const client = await pool.connect();
  try {
    const { rows: leadRows } = await client.query(
      `SELECT id FROM leads WHERE id = $1 LIMIT 1`,
      [leadId]
    );
    if (leadRows.length === 0) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO lead_notes (lead_id, content, author_username, color_tag)
       VALUES ($1, $2, $3, $4)
       RETURNING id, lead_id, content, author_username, color_tag, created_at, updated_at`,
      [leadId, content, normalizedAuthor.value, normalizedColorTag.value]
    );
    await client.query(
      `UPDATE leads SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [leadId]
    );
    await client.query('COMMIT');

    return res.status(201).json({ note: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error al crear nota del lead:', error);
    return res.status(500).json({ message: 'No se pudo crear la nota.' });
  } finally {
    client.release();
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

app.get('/api/leads/:id/files', async (req, res) => {
  const leadId = Number(req.params.id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({ message: 'ID de lead invalido.' });
  }

  try {
    const leadExists = await ensureLeadExists(leadId);
    if (!leadExists) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    const { rows } = await pool.query(
      `SELECT id, lead_id, file_name, mime_type, file_size, document_category, credit_report_party, created_at, updated_at
       FROM lead_files
       WHERE lead_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 500`,
      [leadId]
    );

    return res.json({ files: rows.map(mapLeadFileRow).filter(Boolean) });
  } catch (error) {
    console.error('Error al listar archivos del lead:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los archivos.' });
  }
});

app.post('/api/leads/:id/files', async (req, res) => {
  const leadId = Number(req.params.id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({ message: 'ID de lead invalido.' });
  }

  const fileName = cleanText(pickFirstDefined(req.body || {}, ['name', 'fileName', 'file_name']), 255);
  if (!fileName) {
    return res.status(400).json({ message: 'name es obligatorio.' });
  }

  const normalizedCategory = normalizeFileDocumentCategory(
    pickFirstDefined(req.body || {}, ['documentCategory', 'document_category'])
  );
  if (!normalizedCategory.ok) {
    return res.status(400).json({ message: normalizedCategory.message });
  }

  const normalizedData = normalizeFileDataUrl(pickFirstDefined(req.body || {}, ['data', 'dataUrl', 'data_url']));
  if (!normalizedData.ok) {
    return res.status(400).json({ message: normalizedData.message });
  }

  const providedMime = normalizeFileMimeType(pickFirstDefined(req.body || {}, ['type', 'mimeType', 'mime_type']));
  if (!providedMime.ok) {
    return res.status(400).json({ message: providedMime.message });
  }

  if (providedMime.value !== normalizedData.mimeType) {
    return res.status(400).json({ message: 'type no coincide con el contenido real del archivo.' });
  }

  const sizeInput = pickFirstDefined(req.body || {}, ['size', 'fileSize', 'file_size']);
  const resolvedSize = sizeInput === undefined ? normalizedData.estimatedBytes : sizeInput;
  const normalizedSize = normalizeFileSize(resolvedSize);
  if (!normalizedSize.ok) {
    return res.status(400).json({ message: normalizedSize.message });
  }

  if (Math.abs(normalizedSize.value - normalizedData.estimatedBytes) > 1024) {
    return res.status(400).json({ message: 'size no coincide con el contenido del archivo.' });
  }

  let creditReportParty = null;
  if (normalizedCategory.value === 'credit_report') {
    const normalizedParty = normalizeDebtorParty(
      pickFirstDefined(req.body || {}, ['creditReportParty', 'credit_report_party', 'debtorParty', 'debtor_party'])
    );
    if (!normalizedParty.ok) {
      return res.status(400).json({ message: 'creditReportParty debe ser applicant o coapp.' });
    }
    creditReportParty = normalizedParty.value;
  }

  const uploadedBy = resolveRequestUsername(req, 'Sistema');

  try {
    const leadExists = await ensureLeadExists(leadId);
    if (!leadExists) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO lead_files (
         lead_id, file_name, mime_type, file_size, document_category, credit_report_party, file_data_url, uploaded_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, lead_id, file_name, mime_type, file_size, document_category, credit_report_party, created_at, updated_at`,
      [
        leadId,
        fileName,
        providedMime.value,
        normalizedSize.value,
        normalizedCategory.value,
        creditReportParty,
        normalizedData.value,
        cleanText(uploadedBy, 120) || 'Sistema'
      ]
    );

    await pool.query(
      `UPDATE leads
       SET updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [leadId]
    );

    return res.status(201).json({ file: mapLeadFileRow(rows[0]) });
  } catch (error) {
    console.error('Error al guardar archivo del lead:', error);
    return res.status(500).json({ message: 'No se pudo guardar el archivo.' });
  }
});

app.post('/api/leads/:id/contracts/generate', async (req, res) => {
  const leadId = Number(req.params.id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({ message: 'ID de lead invalido.' });
  }

  try {
    const { rows: leadRows } = await pool.query(
      `SELECT ${LEAD_SELECT_COLUMNS}
       FROM leads
       WHERE id = $1
       LIMIT 1`,
      [leadId]
    );

    if (!leadRows.length) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    const lead = leadRows[0];
    const [{ rows: creditorRows }, { rows: budgetRows }, { rows: bankingRows }] = await Promise.all([
      pool.query(
        `SELECT
           id,
           creditor_name,
           account_number,
           date_last_payment,
           debt_amount,
           balance,
           past_due,
           unpaid_balance
         FROM lead_creditors
         WHERE lead_id = $1
           AND is_included = TRUE
         ORDER BY id ASC
         LIMIT $2`,
        [leadId, CONTRACT_MAX_CREDITORS]
      ),
      pool.query(
        `SELECT data FROM lead_budgets WHERE lead_id = $1 LIMIT 1`,
        [leadId]
      ),
      pool.query(
        `SELECT
           routing_number,
           account_number,
           account_type,
           bank_name,
           bank_city,
           bank_state,
           bank_zip,
           name_on_account,
           relationship_to_customer,
           address,
           address2,
           initial_payment_amount,
           payment_day_of_month
         FROM banking_info
         WHERE lead_id = $1
         LIMIT 1`,
        [leadId]
      )
    ]);

    const budgetData = budgetRows.length > 0 ? budgetRows[0].data : null;
    const bankingData = bankingRows.length > 0 ? bankingRows[0] : null;
    const payload = buildContractGeneratorPayload(lead, creditorRows, budgetData, bankingData);
    const pdfBuffer = await runContractPdfGenerator({ payload });
    const normalizedSize = normalizeFileSize(pdfBuffer.length);
    if (!normalizedSize.ok) {
      return res.status(400).json({ message: normalizedSize.message });
    }

    const caseLabel = lead.case_id ? `case-${lead.case_id}` : `lead-${lead.id}`;
    const timeLabel = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const fileName = `contract-${caseLabel}-${timeLabel}.pdf`;
    const dataUrl = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
    const uploadedBy = resolveRequestUsername(req, 'Sistema');

    const { rows } = await pool.query(
      `INSERT INTO lead_files (
         lead_id, file_name, mime_type, file_size, document_category, credit_report_party, file_data_url, uploaded_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, lead_id, file_name, mime_type, file_size, document_category, credit_report_party, created_at, updated_at`,
      [
        leadId,
        fileName,
        'application/pdf',
        normalizedSize.value,
        'contract',
        null,
        dataUrl,
        cleanText(uploadedBy, 120) || 'Sistema'
      ]
    );

    await pool.query(
      `UPDATE leads
       SET updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [leadId]
    );

    return res.status(201).json({
      ok: true,
      file: mapLeadFileRow(rows[0]),
      dataUrl,
      message: 'Contrato generado y guardado correctamente.'
    });
  } catch (error) {
    console.error('Error al generar contrato del lead:', error);
    const errorDetails = cleanText(error?.message, 500);
    return res.status(500).json({
      message: 'No se pudo generar el contrato.',
      details: errorDetails || null
    });
  }
});

app.get('/api/leads/:id/files/:fileId/content', async (req, res) => {
  const leadId = Number(req.params.id);
  const fileId = Number(req.params.fileId);

  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({ message: 'ID de lead invalido.' });
  }
  if (!Number.isInteger(fileId) || fileId <= 0) {
    return res.status(400).json({ message: 'ID de archivo invalido.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, lead_id, file_name, mime_type, file_size, document_category, credit_report_party, file_data_url, created_at, updated_at
       FROM lead_files
       WHERE id = $1 AND lead_id = $2
       LIMIT 1`,
      [fileId, leadId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Archivo no encontrado.' });
    }

    const row = rows[0];
    return res.json({
      file: mapLeadFileRow(row),
      dataUrl: row.file_data_url || ''
    });
  } catch (error) {
    console.error('Error al obtener contenido del archivo:', error);
    return res.status(500).json({ message: 'No se pudo leer el archivo.' });
  }
});

app.delete('/api/leads/:id/files/:fileId', async (req, res) => {
  const leadId = Number(req.params.id);
  const fileId = Number(req.params.fileId);

  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({ message: 'ID de lead invalido.' });
  }
  if (!Number.isInteger(fileId) || fileId <= 0) {
    return res.status(400).json({ message: 'ID de archivo invalido.' });
  }

  try {
    const { rows } = await pool.query(
      `DELETE FROM lead_files
       WHERE id = $1 AND lead_id = $2
       RETURNING id, lead_id, file_name, mime_type, file_size, document_category, credit_report_party, created_at, updated_at`,
      [fileId, leadId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Archivo no encontrado.' });
    }

    await pool.query(
      `UPDATE leads
       SET updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [leadId]
    );

    return res.json({
      message: 'Archivo eliminado correctamente.',
      file: mapLeadFileRow(rows[0])
    });
  } catch (error) {
    console.error('Error al eliminar archivo del lead:', error);
    return res.status(500).json({ message: 'No se pudo eliminar el archivo.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const identifier = cleanText(
    req.body?.identifier || req.body?.username || req.body?.email,
    160
  );
  const pin = String(req.body?.pin || req.body?.password || '').replace(/\D/g, '');

  if (!identifier || !pin) {
    return res.status(400).json({ message: 'Usuario/correo y PIN son obligatorios.' });
  }

  if (pin.length !== 6) {
    return res.status(400).json({ message: 'El PIN debe tener 6 digitos.' });
  }

  try {
    await pool.query('SELECT 1');
  } catch (error) {
    return res.status(500).json({ message: 'PostgreSQL no esta disponible.' });
  }

  const authUser = await findAuthUser(identifier, pin);
  if (!authUser) {
    return res.status(401).json({ message: 'Credenciales invalidas.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE app_users
       SET last_login_at = CURRENT_TIMESTAMP,
           last_seen_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [authUser.id]
    );

    const authSession = await createAuthSession(authUser.id, req, client);
    await client.query('COMMIT');

    setRefreshTokenCookie(res, authSession.refreshToken);
    const user = await buildClientUserPayload(authUser, client);
    return res.json({
      ok: true,
      message: 'Acceso correcto.',
      user,
      token: buildAuthToken({ ...user, sessionId: authSession.id })
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al iniciar sesion:', error);
    return res.status(500).json({ message: 'No se pudo crear la sesion.' });
  } finally {
    client.release();
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  const refreshToken = readRefreshToken(req);
  if (!refreshToken) {
    clearRefreshTokenCookie(res);
    return res.status(401).json({ message: 'Refresh token no disponible.' });
  }

  try {
    const rotated = await rotateAuthSessionByRefreshToken(refreshToken, req);
    if (!rotated) {
      clearRefreshTokenCookie(res);
      return res.status(401).json({ message: 'Sesion expirada. Inicia sesion nuevamente.' });
    }

    setRefreshTokenCookie(res, rotated.session.refreshToken);
    const user = await buildClientUserPayload(rotated.user);
    return res.json({
      ok: true,
      message: 'Sesion renovada.',
      user,
      token: buildAuthToken({ ...user, sessionId: rotated.session.id })
    });
  } catch (error) {
    console.error('Error al renovar sesion:', error);
    clearRefreshTokenCookie(res);
    return res.status(500).json({ message: 'No se pudo renovar la sesion.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const refreshToken = readRefreshToken(req);
  const bearerToken = readBearerToken(req);
  let revokedSessions = 0;

  try {
    if (refreshToken) {
      revokedSessions += await revokeAuthSessionByRefreshToken(refreshToken, 'logout');
    }

    if (!revokedSessions && bearerToken) {
      try {
        const payload = jwt.verify(bearerToken, getJwtSecret(), { ignoreExpiration: true });
        revokedSessions += await revokeAuthSessionById(payload?.sid, 'logout');
      } catch (_error) {
        // Ignorar token invalido; logout local igual debe continuar
      }
    }

    clearRefreshTokenCookie(res);
    return res.json({ ok: true, revokedSessions });
  } catch (error) {
    console.error('Error al cerrar sesion:', error);
    clearRefreshTokenCookie(res);
    return res.status(500).json({ message: 'No se pudo cerrar sesion.' });
  }
});

app.post('/api/ping', async (req, res) => {
  const userId = Number(req.auth?.id);
  const sessionId = Number(req.auth?.sessionId);
  const username = cleanText(req.auth?.username, 120).toLowerCase();
  const hasValidId = Number.isInteger(userId) && userId > 0;
  if (!hasValidId && !username) return res.status(401).json({ ok: false });

  try {
    let result;
    if (hasValidId) {
      result = await pool.query(
        `UPDATE app_users
         SET last_seen_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [userId]
      );
    } else {
      result = await pool.query(
        `UPDATE app_users
         SET last_seen_at = CURRENT_TIMESTAMP
         WHERE lower(username) = $1`,
        [username]
      );
    }

    if (!result?.rowCount && username) {
      result = await pool.query(
        `UPDATE app_users
         SET last_seen_at = CURRENT_TIMESTAMP
         WHERE lower(username) = $1`,
        [username]
      );
    }

    if (!result?.rowCount) {
      return res.status(404).json({ ok: false });
    }

    if (Number.isInteger(sessionId) && sessionId > 0) {
      await pool.query(
        `UPDATE auth_sessions
         SET last_seen_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND revoked_at IS NULL`,
        [sessionId]
      );
    }

    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

app.get('/api/users', async (req, res) => {
  await hydrateAuthPermissions(req);
  const access = req.auth || {};
  if (!hasAuthPermission(access, 'leads.view_all')) {
    const selfUsername = cleanText(access.username, 120).toLowerCase();
    const selfDisplayName = cleanText(access.displayName, 120) || selfUsername;
    const users = selfDisplayName ? [selfDisplayName] : [];
    const members = selfUsername ? [{
      username: selfUsername,
      displayName: selfDisplayName || selfUsername,
      role: normalizeRoleValue(access.role) || 'seller'
    }] : [];
    return res.json({ users, members });
  }

  try {
    const { rows: leadAssignedRows } = await pool.query(
      `SELECT DISTINCT assigned_to AS username
       FROM leads
       WHERE assigned_to IS NOT NULL
         AND btrim(assigned_to) <> ''
       ORDER BY assigned_to ASC
       LIMIT 500`
    );
    const { rows: appUsersRows } = await pool.query(
      `SELECT username, display_name, role
       FROM app_users
       WHERE is_active = TRUE
       ORDER BY username ASC`
    );

    const userMap = new Map();
    const membersMap = new Map();
    const pushUser = (value) => {
      const normalized = cleanText(value, 120);
      if (!normalized) return;
      const key = normalized.toLowerCase();
      if (!userMap.has(key)) userMap.set(key, normalized);
    };

    appUsersRows.forEach((user) => {
      const username = cleanText(user.username, 120).toLowerCase();
      if (username && !membersMap.has(username)) {
        membersMap.set(username, {
          username,
          displayName: cleanText(user.display_name, 120) || username,
          role: normalizeRoleValue(user.role) || 'seller'
        });
      }
      pushUser(user.display_name);
      pushUser(user.username);
    });
    leadAssignedRows.forEach((row) => pushUser(row.username));

    const users = Array.from(userMap.values()).sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );
    const members = Array.from(membersMap.values()).sort((a, b) =>
      cleanText(a.username, 120).localeCompare(cleanText(b.username, 120), 'es', { sensitivity: 'base' })
    );

    return res.json({ users, members });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    return res.status(500).json({ message: 'No se pudieron cargar usuarios.' });
  }
});

app.get('/api/admin/users', requirePermission('users.manage', 'No tienes permiso para gestionar usuarios.'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, display_name, role, email, is_active, created_at, updated_at, last_login_at, last_seen_at
       FROM app_users
       ORDER BY lower(username) ASC`
    );
    return res.json({ users: rows });
  } catch (error) {
    console.error('Error al listar usuarios admin:', error);
    return res.status(500).json({ message: 'No se pudieron cargar usuarios admin.' });
  }
});

app.post('/api/admin/users', requirePermission('users.manage', 'No tienes permiso para crear usuarios.'), async (req, res) => {
  const normalizedUsername = normalizeRequiredUsername(req.body?.username);
  if (!normalizedUsername.ok) {
    return res.status(400).json({ message: normalizedUsername.message });
  }

  const normalizedPin = normalizePinForMutation(req.body?.pin, 'pin');
  if (!normalizedPin.ok) {
    return res.status(400).json({ message: normalizedPin.message });
  }

  const normalizedRole = normalizeUserRoleForMutation(req.body?.role || 'seller');
  if (!normalizedRole.ok) {
    return res.status(400).json({ message: normalizedRole.message });
  }

  const displayName = cleanText(req.body?.displayName || req.body?.display_name || normalizedUsername.value, 120);
  const normalizedEmail = normalizeEmailAddressOptional(req.body?.email, 'email');
  if (!normalizedEmail.ok) {
    return res.status(400).json({ message: normalizedEmail.message });
  }

  try {
    const credentials = createPinHash(normalizedPin.value);
    const { rows } = await pool.query(
      `INSERT INTO app_users (
         username, display_name, role, email, pin_salt, pin_hash, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING id, username, display_name, role, email, is_active, created_at, updated_at, last_login_at`,
      [
        normalizedUsername.value,
        displayName || normalizedUsername.value,
        normalizedRole.value,
        normalizedEmail.value,
        credentials.pinSalt,
        credentials.pinHash
      ]
    );

    await writeAuditLog({
      req,
      action: 'admin.user.create',
      entityType: 'app_user',
      entityId: rows[0]?.id,
      before: null,
      after: rows[0],
      metadata: {
        createdByRole: req.auth?.role || null
      }
    });

    return res.status(201).json({
      ok: true,
      user: rows[0],
      message: 'Usuario creado correctamente.'
    });
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('duplicate')) {
      return res.status(409).json({ message: 'Username o email ya existe.' });
    }
    console.error('Error al crear usuario admin:', error);
    return res.status(500).json({ message: 'No se pudo crear el usuario.' });
  }
});

app.patch('/api/admin/users/:id', requirePermission('users.manage', 'No tienes permiso para editar usuarios.'), async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'ID de usuario invalido.' });
  }

  try {
    const { rows: targetRows } = await pool.query(
      `SELECT id, username, display_name, role, email, is_active, created_at, updated_at, last_login_at
       FROM app_users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    if (!targetRows.length) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    const targetUser = targetRows[0];
    const beforeUser = targetRows[0];
    const updates = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'displayName')
      || Object.prototype.hasOwnProperty.call(req.body || {}, 'display_name')) {
      const displayName = cleanText(req.body?.displayName || req.body?.display_name, 120);
      updates.push(`display_name = $${updates.length + 1}`);
      values.push(displayName || targetUser.username);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'role')) {
      const normalizedRole = normalizeUserRoleForMutation(req.body?.role);
      if (!normalizedRole.ok) {
        return res.status(400).json({ message: normalizedRole.message });
      }
      updates.push(`role = $${updates.length + 1}`);
      values.push(normalizedRole.value);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'email')) {
      const normalizedEmail = normalizeEmailAddressOptional(req.body?.email, 'email');
      if (!normalizedEmail.ok) {
        return res.status(400).json({ message: normalizedEmail.message });
      }
      updates.push(`email = $${updates.length + 1}`);
      values.push(normalizedEmail.value);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'isActive')
      || Object.prototype.hasOwnProperty.call(req.body || {}, 'is_active')) {
      const activeRaw = pickFirstDefined(req.body || {}, ['isActive', 'is_active']);
      const normalizedActive = normalizeBoolean(activeRaw, 'isActive');
      if (!normalizedActive.ok) {
        return res.status(400).json({ message: normalizedActive.message });
      }

      if (normalizeUsername(req.auth?.username) === normalizeUsername(targetUser.username) && !normalizedActive.value) {
        return res.status(400).json({ message: 'No puedes desactivar tu propio usuario.' });
      }

      updates.push(`is_active = $${updates.length + 1}`);
      values.push(normalizedActive.value);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'pin')) {
      const normalizedPin = normalizePinForMutation(req.body?.pin, 'pin');
      if (!normalizedPin.ok) {
        return res.status(400).json({ message: normalizedPin.message });
      }
      const credentials = createPinHash(normalizedPin.value);
      updates.push(`pin_salt = $${updates.length + 1}`);
      values.push(credentials.pinSalt);
      updates.push(`pin_hash = $${updates.length + 1}`);
      values.push(credentials.pinHash);
    }

    if (!updates.length) {
      return res.status(400).json({ message: 'No hay campos validos para actualizar.' });
    }

    const changedFields = updates
      .map((entry) => cleanText(String(entry).split('=')[0], 80).toLowerCase())
      .filter(Boolean);

    values.push(userId);
    const { rows } = await pool.query(
      `UPDATE app_users
       SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${values.length}
       RETURNING id, username, display_name, role, email, is_active, created_at, updated_at, last_login_at`,
      values
    );

    await writeAuditLog({
      req,
      action: 'admin.user.update',
      entityType: 'app_user',
      entityId: rows[0]?.id || userId,
      before: beforeUser,
      after: rows[0],
      metadata: { changedFields }
    });

    return res.json({
      ok: true,
      user: rows[0],
      message: 'Usuario actualizado correctamente.'
    });
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('duplicate')) {
      return res.status(409).json({ message: 'Username o email ya existe.' });
    }
    console.error('Error al actualizar usuario admin:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el usuario.' });
  }
});

app.get('/api/admin/permissions/catalog', requirePermission('users.permissions.manage', 'No tienes permiso para gestionar permisos.'), async (_req, res) => {
  return res.json({
    permissions: PERMISSION_CATALOG,
    roleMatrix: buildPermissionMatrixForRoles()
  });
});

app.get('/api/admin/users/:id/permissions', requirePermission('users.permissions.manage', 'No tienes permiso para gestionar permisos.'), async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'ID de usuario invalido.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, username, display_name, role, email, is_active
       FROM app_users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    const targetUser = rows[0];
    const permissionRows = await buildPermissionRowsForUser(targetUser.id, targetUser.role);
    return res.json({
      user: targetUser,
      permissions: permissionRows
    });
  } catch (error) {
    console.error('Error al obtener permisos del usuario:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los permisos del usuario.' });
  }
});

app.patch('/api/admin/users/:id/permissions', requirePermission('users.permissions.manage', 'No tienes permiso para gestionar permisos.'), async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ message: 'ID de usuario invalido.' });
  }

  const permissionKey = normalizePermissionKey(req.body?.permissionKey || req.body?.permission_key);
  if (!permissionKey) {
    return res.status(400).json({ message: 'permissionKey es invalido.' });
  }

  const allowedRaw = Object.prototype.hasOwnProperty.call(req.body || {}, 'allowed')
    ? req.body.allowed
    : req.body?.isAllowed;
  const shouldReset = allowedRaw === null || String(allowedRaw).trim().toLowerCase() === 'null';

  const actorId = Number(req.auth?.id);
  const actorUserId = Number.isInteger(actorId) && actorId > 0 ? actorId : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: targetRows } = await client.query(
      `SELECT id, username, display_name, role, email, is_active
       FROM app_users
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [userId]
    );

    if (!targetRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    const targetUser = targetRows[0];
    const beforePermissionRows = await buildPermissionRowsForUser(targetUser.id, targetUser.role, client);

    if (shouldReset) {
      await client.query(
        `DELETE FROM user_permissions
         WHERE user_id = $1
           AND permission_key = $2`,
        [userId, permissionKey]
      );
    } else {
      const normalizedAllowed = normalizeBoolean(allowedRaw, 'allowed');
      if (!normalizedAllowed.ok) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: normalizedAllowed.message });
      }

      await client.query(
        `INSERT INTO user_permissions (user_id, permission_key, allowed, updated_by_user_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, permission_key) DO UPDATE
         SET allowed = EXCLUDED.allowed,
             updated_by_user_id = EXCLUDED.updated_by_user_id,
             updated_at = CURRENT_TIMESTAMP`,
        [userId, permissionKey, normalizedAllowed.value, actorUserId]
      );
    }

    const permissionRows = await buildPermissionRowsForUser(targetUser.id, targetUser.role, client);
    await writeAuditLog({
      req,
      action: 'admin.user.permissions.update',
      entityType: 'app_user',
      entityId: targetUser.id,
      before: beforePermissionRows,
      after: permissionRows,
      metadata: {
        permissionKey,
        resetToRoleDefault: shouldReset,
        actorUserId
      },
      client
    });

    await client.query('COMMIT');
    return res.json({
      ok: true,
      user: targetUser,
      permissions: permissionRows,
      message: shouldReset ? 'Permiso restablecido a matriz por rol.' : 'Permiso actualizado.'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar permiso del usuario:', error);
    return res.status(500).json({ message: 'No se pudo actualizar el permiso.' });
  } finally {
    client.release();
  }
});

app.get('/api/admin/audit-logs', requirePermission('audit.view', 'No tienes permiso para consultar auditoria.'), async (req, res) => {
  const filtersResult = buildAuditFiltersFromQuery(req.query || {});
  if (!filtersResult.ok) {
    return res.status(400).json({ message: filtersResult.message });
  }

  const limit = parsePositiveInt(req.query.limit, 100, 1, 500);
  const offset = parseNonNegativeInt(req.query.offset, 0, 50000);
  const { whereSql, params } = buildAuditWhereClause(filtersResult.value);

  try {
    const queryParams = [...params, limit, offset];
    const limitToken = `$${params.length + 1}`;
    const offsetToken = `$${params.length + 2}`;

    const { rows } = await pool.query(
      `SELECT
         id,
         actor_user_id,
         actor_username,
         action,
         entity_type,
         entity_id,
         request_id,
         ip_address,
         http_method,
         route_path,
         before_data,
         after_data,
         metadata,
         created_at
       FROM audit_log
       ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT ${limitToken}
       OFFSET ${offsetToken}`,
      queryParams
    );

    const { rows: totalRows } = await pool.query(
      `SELECT COUNT(*)::bigint AS total
       FROM audit_log
       ${whereSql}`,
      params
    );

    const total = Number(totalRows[0]?.total || 0);
    return res.json({
      logs: rows,
      pagination: { limit, offset, total }
    });
  } catch (error) {
    console.error('Error al consultar audit_log:', error);
    return res.status(500).json({ message: 'No se pudo consultar la auditoria.' });
  }
});

app.get('/api/admin/audit-logs/export', requirePermission('audit.view', 'No tienes permiso para exportar auditoria.'), async (req, res) => {
  const filtersResult = buildAuditFiltersFromQuery(req.query || {});
  if (!filtersResult.ok) {
    return res.status(400).json({ message: filtersResult.message });
  }

  const exportLimit = parsePositiveInt(req.query.limit, 1000, 1, 5000);
  const format = cleanText(req.query.format, 12).toLowerCase() || 'csv';
  const { whereSql, params } = buildAuditWhereClause(filtersResult.value);

  try {
    const { rows } = await pool.query(
      `SELECT
         id,
         created_at,
         actor_user_id,
         actor_username,
         action,
         entity_type,
         entity_id,
         request_id,
         ip_address,
         http_method,
         route_path,
         before_data,
         after_data,
         metadata
       FROM audit_log
       ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT $${params.length + 1}`,
      [...params, exportLimit]
    );

    if (format === 'json') {
      return res.json({ logs: rows, count: rows.length });
    }

    const csv = buildAuditCsv(rows);
    const dateLabel = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=\"audit-log-${dateLabel}.csv\"`);
    return res.send(csv);
  } catch (error) {
    console.error('Error al exportar audit_log:', error);
    return res.status(500).json({ message: 'No se pudo exportar la auditoria.' });
  }
});

app.get('/api/emails', async (req, res) => {
  await hydrateAuthPermissions(req);
  const access = getEmailAccessContext(req);
  const limit = parsePositiveInt(req.query.limit, 120, 1, 500);
  const canViewAllEmails = hasAuthPermission(req.auth, 'emails.view_all');
  const canDeleteEmails = hasAuthPermission(req.auth, 'emails.delete');

  if (!canViewAllEmails && access.identities.length === 0) {
    return res.status(400).json({ message: 'username o displayName son obligatorios para Seller.' });
  }

  try {
    await ensureSentEmailsSchema();

    const params = [];
    let whereClause = '';

    if (!canViewAllEmails) {
      params.push(access.identities);
      whereClause = `
        WHERE (
          lower(coalesce(se.author_username, '')) = ANY($${params.length}::text[])
          OR (
            se.lead_id IS NOT NULL
            AND lower(coalesce(l.assigned_to, '')) = ANY($${params.length}::text[])
          )
        )
      `;
    }

    params.push(limit);
    const limitParam = `$${params.length}`;

    const { rows } = await pool.query(
      `SELECT
         se.id,
         se.lead_id,
         se.author_username,
         se.from_email,
         se.to_email,
         se.cc_emails,
         se.subject,
         se.body_preview,
         se.provider,
         se.provider_message_id,
         se.status,
         se.error_message,
         se.created_at,
         se.sent_at,
         l.case_id AS lead_case_id,
         l.full_name AS lead_full_name,
         l.assigned_to AS lead_assigned_to
       FROM sent_emails se
       LEFT JOIN leads l ON l.id = se.lead_id
       ${whereClause}
       ORDER BY coalesce(se.sent_at, se.created_at) DESC, se.id DESC
       LIMIT ${limitParam}`,
      params
    );

    return res.json({
      emails: rows,
      scope: canViewAllEmails ? 'all' : 'seller',
      canDelete: canDeleteEmails
    });
  } catch (error) {
    console.error('Error al obtener correos:', error);
    return res.status(500).json({ message: 'No se pudieron cargar los correos.' });
  }
});

app.post('/api/emails/send', async (req, res) => {
  await hydrateAuthPermissions(req);
  const access = getEmailAccessContext(req);
  const canSendEmails = hasAuthPermission(req.auth, 'emails.send');
  const canViewAllEmails = hasAuthPermission(req.auth, 'emails.view_all');
  const leadId = parsePositiveInteger(req.body?.leadId || req.body?.lead_id);
  const toEmailInput = req.body?.toEmail ?? req.body?.to_email;
  const ccInput = req.body?.ccEmails ?? req.body?.cc_emails;
  const fromInput = req.body?.fromEmail ?? req.body?.from_email ?? access.email;
  const subject = cleanText(req.body?.subject, 240);
  const bodyText = String(req.body?.body || '').trim();
  const provider = cleanText(req.body?.provider, 40) || 'platform';
  const providerMessageId = cleanText(req.body?.providerMessageId || req.body?.provider_message_id, 180);

  if (!canSendEmails) {
    return res.status(403).json({ message: 'No tienes permisos para enviar correos.' });
  }

  if (!access.username && !access.displayName && !access.email) {
    return res.status(400).json({ message: 'username/displayName/email son obligatorios para registrar correos.' });
  }

  if (!leadId) {
    return res.status(400).json({ message: 'leadId es obligatorio.' });
  }

  if (!subject) {
    return res.status(400).json({ message: 'subject es obligatorio.' });
  }

  if (!bodyText) {
    return res.status(400).json({ message: 'body es obligatorio.' });
  }

  const normalizedTo = normalizeEmailAddressRequired(toEmailInput, 'toEmail');
  if (!normalizedTo.ok) {
    return res.status(400).json({ message: normalizedTo.message });
  }

  const normalizedFrom = normalizeEmailAddressOptional(fromInput, 'fromEmail');
  if (!normalizedFrom.ok) {
    return res.status(400).json({ message: normalizedFrom.message });
  }

  const normalizedCc = normalizeCcEmails(ccInput);
  if (!normalizedCc.ok) {
    return res.status(400).json({ message: normalizedCc.message });
  }

  const authorUsername = cleanText(
    req.body?.authorUsername
      || req.body?.author_username
      || access.username
      || access.displayName
      || (access.email ? access.email.split('@')[0] : ''),
    120
  ).toLowerCase();

  if (!authorUsername) {
    return res.status(400).json({ message: 'No se pudo resolver authorUsername.' });
  }

  try {
    await ensureSentEmailsSchema();

    const { rows: leadRows } = await pool.query(
      `SELECT id, assigned_to
       FROM leads
       WHERE id = $1
       LIMIT 1`,
      [leadId]
    );
    if (!leadRows.length) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    if (!canViewAllEmails) {
      if (!access.identities.length) {
        return res.status(403).json({ message: 'No hay identidad valida para Seller.' });
      }

      const assignedTo = cleanText(leadRows[0].assigned_to, 120).toLowerCase();
      if (!assignedTo || !access.identities.includes(assignedTo)) {
        return res.status(403).json({ message: 'No tienes permisos para enviar correos de este lead.' });
      }
    }

    const requestedStatus = normalizeEmailStatus(req.body?.status);
    const status = requestedStatus;
    const sentAt = status === 'sent' ? new Date().toISOString() : null;
    const errorMessage = status === 'failed'
      ? cleanText(req.body?.errorMessage || req.body?.error_message, 2000)
      : null;
    const bodyPreview = cleanText(bodyText.replace(/\s+/g, ' '), 6000);
    const fallbackMessageId = `platform-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    const { rows } = await pool.query(
      `INSERT INTO sent_emails (
         lead_id,
         author_username,
         from_email,
         to_email,
         cc_emails,
         subject,
         body_preview,
         provider,
         provider_message_id,
         status,
         error_message,
         sent_at
       ) VALUES (
         $1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12
       )
       RETURNING
         id,
         lead_id,
         author_username,
         from_email,
         to_email,
         cc_emails,
         subject,
         body_preview,
         provider,
         provider_message_id,
         status,
         error_message,
         created_at,
         sent_at`,
      [
        leadId,
        authorUsername,
        normalizedFrom.value,
        normalizedTo.value,
        JSON.stringify(normalizedCc.value),
        subject,
        bodyPreview,
        provider,
        providerMessageId || fallbackMessageId,
        status,
        errorMessage,
        sentAt
      ]
    );

    await writeAuditLog({
      req,
      action: 'email.send',
      entityType: 'sent_email',
      entityId: rows[0]?.id,
      before: null,
      after: rows[0],
      metadata: {
        leadId,
        status
      }
    });

    return res.status(201).json({
      ok: true,
      email: rows[0],
      message: status === 'sent'
        ? 'Correo enviado y registrado correctamente.'
        : 'Correo registrado correctamente.'
    });
  } catch (error) {
    console.error('Error al registrar envio de correo:', error);
    return res.status(500).json({ message: 'No se pudo registrar el correo.' });
  }
});

app.delete('/api/emails/:id', async (req, res) => {
  const emailId = Number(req.params.id);
  if (!Number.isInteger(emailId) || emailId <= 0) {
    return res.status(400).json({ message: 'id de correo invalido.' });
  }

  const access = getEmailAccessContext(req);
  const role = access.role || 'seller';
  if (!hasGlobalAccessRole(role)) {
    return res.status(403).json({ message: 'Solo admin o supervisor puede eliminar correos.' });
  }

  try {
    await ensureSentEmailsSchema();
    const { rows } = await pool.query(
      `DELETE FROM sent_emails
       WHERE id = $1
       RETURNING
         id,
         lead_id,
         author_username,
         from_email,
         to_email,
         cc_emails,
         subject,
         body_preview,
         provider,
         provider_message_id,
         status,
         error_message,
         created_at,
         sent_at`,
      [emailId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Correo no encontrado.' });
    }

    await writeAuditLog({
      req,
      action: 'email.delete',
      entityType: 'sent_email',
      entityId: rows[0]?.id,
      before: rows[0],
      after: null,
      metadata: { deletedCount: 1 }
    });

    return res.json({ ok: true, deletedIds: [Number(rows[0].id)] });
  } catch (error) {
    console.error('Error al eliminar correo:', error);
    return res.status(500).json({ message: 'No se pudo eliminar el correo.' });
  }
});

app.post('/api/emails/bulk-delete', async (req, res) => {
  await hydrateAuthPermissions(req);
  if (!hasAuthPermission(req.auth, 'emails.delete')) {
    return res.status(403).json({ message: 'No tienes permisos para eliminar correos.' });
  }

  const ids = Array.isArray(req.body?.ids)
    ? Array.from(new Set(req.body.ids
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)))
    : [];

  if (!ids.length) {
    return res.status(400).json({ message: 'ids es obligatorio y debe contener al menos un id valido.' });
  }

  try {
    await ensureSentEmailsSchema();
    const { rows: beforeRows } = await pool.query(
      `SELECT
         id,
         lead_id,
         author_username,
         from_email,
         to_email,
         cc_emails,
         subject,
         body_preview,
         provider,
         provider_message_id,
         status,
         error_message,
         created_at,
         sent_at
       FROM sent_emails
       WHERE id = ANY($1::bigint[])`,
      [ids]
    );

    const { rows } = await pool.query(
      `DELETE FROM sent_emails
       WHERE id = ANY($1::bigint[])
       RETURNING id`,
      [ids]
    );

    const deletedIds = rows.map((row) => Number(row.id)).filter((value) => Number.isInteger(value));
    await writeAuditLog({
      req,
      action: 'email.bulk_delete',
      entityType: 'sent_email',
      entityId: null,
      before: beforeRows,
      after: { deletedIds },
      metadata: {
        requestedIds: ids,
        deletedCount: deletedIds.length
      }
    });

    return res.json({
      ok: true,
      deletedCount: deletedIds.length,
      deletedIds
    });
  } catch (error) {
    console.error('Error en borrado masivo de correos:', error);
    return res.status(500).json({ message: 'No se pudieron eliminar los correos.' });
  }
});

app.get('/api/pipeline/stages', async (req, res) => {
  await hydrateAuthPermissions(req);
  const canViewPipeline = hasAuthPermission(req.auth, 'leads.view_all') || hasAuthPermission(req.auth, 'leads.view_assigned');
  if (!canViewPipeline) {
    return res.status(403).json({ message: 'No tienes permisos para consultar pipeline.' });
  }

  const stages = PIPELINE_STAGE_CATALOG.map((stage) => ({
    key: stage.key,
    label: stage.label,
    order: stage.order,
    terminal: stage.terminal,
    nextStageKeys: Array.from(getAllowedNextStageKeys(stage.key))
  }));

  const statuses = PIPELINE_STATUS_CATALOG.map((status) => ({
    key: status.key,
    label: status.label,
    stageKey: status.stageKey,
    stageLabel: PIPELINE_STAGE_BY_KEY.get(status.stageKey)?.label || status.stageKey
  }));

  const allowedNextByStatus = {};
  PIPELINE_STATUS_CATALOG.forEach((status) => {
    allowedNextByStatus[status.label] = getAllowedNextStatusLabels(status.label);
  });

  return res.json({
    stages,
    statuses,
    allowedNextByStatus
  });
});

app.get('/api/kpi/pipeline', async (req, res) => {
  const range = buildKpiDateRange(req.query || {});
  if (!range.ok) {
    return res.status(400).json({ message: range.message });
  }

  const sourceFilter = cleanText(req.query.source, 60).toLowerCase() || null;
  const agentFilter = cleanText(req.query.agent, 120).toLowerCase() || null;

  try {
    await hydrateAuthPermissions(req);
    const canViewAllLeads = hasAuthPermission(req.auth, 'leads.view_all');
    const canViewAssignedLeads = hasAuthPermission(req.auth, 'leads.view_assigned');
    if (!canViewAllLeads && !canViewAssignedLeads) {
      return res.status(403).json({ message: 'No tienes permisos para consultar KPI.' });
    }

    const identities = canViewAllLeads ? [] : getAuthIdentities(req.auth);
    if (!canViewAllLeads && !identities.length) {
      return res.status(403).json({ message: 'No autorizado para consultar KPI.' });
    }

    const baseParams = [range.from.toISOString(), range.toExclusive.toISOString()];
    const leadConditions = [
      'created_at >= $1::timestamptz',
      'created_at < $2::timestamptz'
    ];

    if (sourceFilter) {
      baseParams.push(sourceFilter);
      leadConditions.push(`lower(coalesce(source, '')) = $${baseParams.length}`);
    }

    if (agentFilter) {
      baseParams.push(agentFilter);
      leadConditions.push(`lower(coalesce(assigned_to, '')) = $${baseParams.length}`);
    }

    if (!canViewAllLeads) {
      baseParams.push(identities);
      leadConditions.push(`(assigned_to IS NULL OR lower(coalesce(assigned_to, '')) = ANY($${baseParams.length}::text[]))`);
    }

    const leadWhereSql = leadConditions.length ? `WHERE ${leadConditions.join(' AND ')}` : '';
    const { rows: leadRows } = await pool.query(
      `SELECT id, status, source, assigned_to, created_at
       FROM leads
       ${leadWhereSql}`,
      baseParams
    );

    const stageCountMap = new Map(PIPELINE_STAGE_CATALOG.map((stage) => [stage.key, 0]));
    let unknownStageCount = 0;
    let wonLeads = 0;
    let lostLeads = 0;
    let activeLeads = 0;

    const agingBuckets = {
      '0-7': 0,
      '8-30': 0,
      '31-60': 0,
      '61+': 0
    };
    const sourceMap = new Map();
    const agentMap = new Map();
    const nowMs = Date.now();

    leadRows.forEach((lead) => {
      const statusLabel = cleanText(lead.status, 120) || '';
      const stageKey = getLeadStageKey(statusLabel);
      if (stageKey && stageCountMap.has(stageKey)) {
        stageCountMap.set(stageKey, Number(stageCountMap.get(stageKey) || 0) + 1);
      } else {
        unknownStageCount += 1;
      }

      const isWon = isPipelineWonStatus(statusLabel);
      const isLost = isPipelineLostStatus(statusLabel);
      if (isWon) wonLeads += 1;
      if (isLost) lostLeads += 1;
      if (!isWon && !isLost) {
        activeLeads += 1;
        const createdMs = new Date(lead.created_at).getTime();
        const ageDays = Number.isFinite(createdMs) ? Math.max(0, Math.floor((nowMs - createdMs) / (24 * 60 * 60 * 1000))) : 0;
        if (ageDays <= 7) agingBuckets['0-7'] += 1;
        else if (ageDays <= 30) agingBuckets['8-30'] += 1;
        else if (ageDays <= 60) agingBuckets['31-60'] += 1;
        else agingBuckets['61+'] += 1;
      }

      const sourceKey = cleanText(lead.source, 60) || 'Sin source';
      sourceMap.set(sourceKey, Number(sourceMap.get(sourceKey) || 0) + 1);

      const agentKey = cleanText(lead.assigned_to, 120) || 'Sin asignar';
      const previousAgent = agentMap.get(agentKey) || { total: 0, won: 0, lost: 0, active: 0 };
      previousAgent.total += 1;
      if (isWon) previousAgent.won += 1;
      else if (isLost) previousAgent.lost += 1;
      else previousAgent.active += 1;
      agentMap.set(agentKey, previousAgent);
    });

    const totalLeads = leadRows.length;
    const conversionRate = totalLeads > 0 ? Number(((wonLeads / totalLeads) * 100).toFixed(2)) : 0;
    const lossRate = totalLeads > 0 ? Number(((lostLeads / totalLeads) * 100).toFixed(2)) : 0;

    const stageCounts = PIPELINE_STAGE_CATALOG.map((stage) => {
      const count = Number(stageCountMap.get(stage.key) || 0);
      return {
        stageKey: stage.key,
        stageLabel: stage.label,
        count,
        sharePercent: totalLeads > 0 ? Number(((count / totalLeads) * 100).toFixed(2)) : 0
      };
    });
    if (unknownStageCount > 0) {
      stageCounts.push({
        stageKey: 'unknown',
        stageLabel: 'Sin catalogar',
        count: unknownStageCount,
        sharePercent: totalLeads > 0 ? Number(((unknownStageCount / totalLeads) * 100).toFixed(2)) : 0
      });
    }

    const sourceBreakdown = Array.from(sourceMap.entries())
      .map(([source, count]) => ({
        source,
        count,
        sharePercent: totalLeads > 0 ? Number(((count / totalLeads) * 100).toFixed(2)) : 0
      }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source, 'es', { sensitivity: 'base' }));

    const agentBreakdown = Array.from(agentMap.entries())
      .map(([agent, totals]) => ({
        agent,
        total: totals.total,
        won: totals.won,
        lost: totals.lost,
        active: totals.active,
        conversionRate: totals.total > 0 ? Number(((totals.won / totals.total) * 100).toFixed(2)) : 0
      }))
      .sort((a, b) => b.total - a.total || a.agent.localeCompare(b.agent, 'es', { sensitivity: 'base' }));

    const historyParams = [range.from.toISOString(), range.toExclusive.toISOString()];
    const historyConditions = [
      'h.created_at >= $1::timestamptz',
      'h.created_at < $2::timestamptz'
    ];
    if (sourceFilter) {
      historyParams.push(sourceFilter);
      historyConditions.push(`lower(coalesce(l.source, '')) = $${historyParams.length}`);
    }
    if (agentFilter) {
      historyParams.push(agentFilter);
      historyConditions.push(`lower(coalesce(l.assigned_to, '')) = $${historyParams.length}`);
    }
    if (!canViewAllLeads) {
      historyParams.push(identities);
      historyConditions.push(`(l.assigned_to IS NULL OR lower(coalesce(l.assigned_to, '')) = ANY($${historyParams.length}::text[]))`);
    }

    const historyWhereSql = historyConditions.length ? `WHERE ${historyConditions.join(' AND ')}` : '';
    const { rows: historyRows } = await pool.query(
      `SELECT lower(coalesce(h.changed_by_username, 'sistema')) AS actor, COUNT(*)::int AS stage_changes
       FROM lead_stage_history h
       JOIN leads l ON l.id = h.lead_id
       ${historyWhereSql}
       GROUP BY lower(coalesce(h.changed_by_username, 'sistema'))
       ORDER BY stage_changes DESC, actor ASC
       LIMIT 50`,
      historyParams
    );

    const productivity = historyRows.map((row) => ({
      actor: cleanText(row.actor, 120) || 'sistema',
      stageChanges: Number(row.stage_changes || 0)
    }));

    return res.json({
      filters: {
        from: range.fromIso,
        to: range.toIso,
        source: sourceFilter,
        agent: agentFilter
      },
      totals: {
        totalLeads,
        activeLeads,
        wonLeads,
        lostLeads,
        conversionRate,
        lossRate
      },
      stageCounts,
      aging: agingBuckets,
      sourceBreakdown,
      agentBreakdown,
      productivity
    });
  } catch (error) {
    console.error('Error al consultar KPI de pipeline:', error);
    return res.status(500).json({ message: 'No se pudo consultar KPI de pipeline.' });
  }
});

app.get('/api/leads', async (req, res) => {
  try {
    await hydrateAuthPermissions(req);
    let rows = [];
    if (hasAuthPermission(req.auth, 'leads.view_all')) {
      ({ rows } = await pool.query(
        `SELECT ${LEAD_SELECT_COLUMNS}
         FROM leads
         ORDER BY created_at DESC
         LIMIT 100`
      ));
    } else {
      const identities = getAuthIdentities(req.auth);
      if (!identities.length) {
        return res.status(403).json({ message: 'No autorizado para listar leads.' });
      }

      ({ rows } = await pool.query(
        `SELECT ${LEAD_SELECT_COLUMNS}
         FROM leads
         WHERE assigned_to IS NULL
            OR lower(coalesce(assigned_to, '')) = ANY($1::text[])
         ORDER BY created_at DESC
         LIMIT 100`,
        [identities]
      ));
    }

    const leadsWithStateType = rows.map((lead) => applyLeadDerivedFields(lead));

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
    await hydrateAuthPermissions(req);
    let rows = [];
    if (hasAuthPermission(req.auth, 'leads.view_all')) {
      ({ rows } = await pool.query(
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
      ));
    } else {
      const identities = getAuthIdentities(req.auth);
      if (!identities.length) {
        return res.status(403).json({ message: 'No autorizado para buscar duplicados.' });
      }

      ({ rows } = await pool.query(
        `SELECT ${LEAD_SELECT_COLUMNS}
         FROM leads
         WHERE (
              right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $1
           OR right(regexp_replace(coalesce(home_phone, ''), '\\D', '', 'g'), 10) = $1
           OR right(regexp_replace(coalesce(cell_phone, ''), '\\D', '', 'g'), 10) = $1
           OR right(regexp_replace(coalesce(co_applicant_home_phone, ''), '\\D', '', 'g'), 10) = $1
           OR right(regexp_replace(coalesce(co_applicant_cell_phone, ''), '\\D', '', 'g'), 10) = $1
         )
           AND (
              assigned_to IS NULL
              OR lower(coalesce(assigned_to, '')) = ANY($2::text[])
           )
         ORDER BY created_at DESC
         LIMIT 25`,
        [normalizedPhone.digits, identities]
      ));
    }

    const matches = rows.map((lead) => applyLeadDerivedFields(lead));

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
  await hydrateAuthPermissions(req);
  if (!hasAuthPermission(req.auth, 'leads.create')) {
    return res.status(403).json({ message: 'No tienes permisos para crear leads.' });
  }

  const fullName = cleanText(req.body?.fullName, 120);
  const normalizedPhone = normalizePhone(req.body?.phone, 'phone');
  if (!normalizedPhone.ok) {
    return res.status(400).json({ message: normalizedPhone.message });
  }
  const phone = normalizedPhone.value;
  const isTest = req.body?.isTest === true;
  const stateCode = cleanText(req.body?.stateCode, 2) || null;
  let assignedTo = cleanText(req.body?.assignedTo, 120) || null;
  const notes = cleanText(req.body?.notes, 1000);
  const relatedLeadIdRaw = pickFirstDefined(req.body || {}, ['relatedLeadId', 'related_lead_id']);
  const normalizedRelatedLeadId = normalizeRelatedLeadId(relatedLeadIdRaw, 'relatedLeadId');
  if (!normalizedRelatedLeadId.ok) {
    return res.status(400).json({ message: normalizedRelatedLeadId.message });
  }
  const relatedLeadId = normalizedRelatedLeadId.value;
  const calcLegalPlanEnabled = getStateTypeFromCode(stateCode) === 'Green';
  const calcProgramFeePercent = getProgramFeePercentForState(stateCode);

  if (!fullName || !phone) {
    return res.status(400).json({ message: 'Nombre y telefono son obligatorios.' });
  }

  if (!hasGlobalAccessRole(req.auth?.role)) {
    const defaultAssignee = cleanText(req.auth?.displayName || req.auth?.username, 120)
      || cleanText(req.auth?.username, 120)
      || null;

    if (assignedTo && !canSetLeadAssignee(req.auth, assignedTo)) {
      return res.status(403).json({ message: 'No puedes asignar leads a otros usuarios.' });
    }

    assignedTo = assignedTo || defaultAssignee;
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
        0, 0, calcProgramFeePercent, 0, 48, calcLegalPlanEnabled
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

    await syncCallbackTaskFromLead(lead, { req }).catch((error) => {
      console.error('Error sincronizando callback task (create):', error);
    });

    await recordLeadStageHistory({
      leadId: lead.id,
      fromStatus: null,
      toStatus: lead.status,
      req,
      reason: 'lead.create'
    }).catch((error) => {
      console.error('Error registrando stage history (create):', error);
    });

    await writeAuditLog({
      req,
      action: 'lead.create',
      entityType: 'lead',
      entityId: lead.id,
      before: null,
      after: lead,
      metadata: {
        caseId: lead.case_id,
        assignedTo: lead.assigned_to || null,
        isTest: lead.is_test === true
      }
    });

    applyLeadDerivedFields(lead);
    res.status(201).json({ lead });
  } catch (error) {
    console.error('Error al crear lead:', error.message);
    res.status(500).json({ message: 'No se pudo crear el lead.', detail: error.message });
  }
});

app.get('/api/leads/:id/audit-history', async (req, res) => {
  const leadId = parsePositiveInteger(req.params.id);
  if (!leadId) {
    return res.status(400).json({ message: 'ID de lead invalido.' });
  }

  await hydrateAuthPermissions(req);
  if (!hasAuthPermission(req.auth, 'audit.view')) {
    return res.status(403).json({ message: 'No tienes permisos para consultar historial del lead.' });
  }

  const limit = parsePositiveInt(req.query.limit, 80, 1, 300);
  try {
    const { rows: leadRows } = await pool.query(
      `SELECT id, assigned_to
       FROM leads
       WHERE id = $1
       LIMIT 1`,
      [leadId]
    );
    if (!leadRows.length) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    const lead = leadRows[0];
    if (!canAccessAssignedLead(req.auth, lead.assigned_to)) {
      return res.status(403).json({ message: 'No tienes permisos para ver historial de este lead.' });
    }

    const { rows } = await pool.query(
      `SELECT
         id,
         actor_user_id,
         actor_username,
         action,
         entity_type,
         entity_id,
         request_id,
         ip_address,
         http_method,
         route_path,
         before_data,
         after_data,
         metadata,
         created_at
       FROM audit_log
       WHERE entity_type = 'lead'
         AND entity_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [String(leadId), limit]
    );

    const history = rows.map(mapLeadAuditLogRow);
    return res.json({
      leadId,
      count: history.length,
      history
    });
  } catch (error) {
    console.error('Error al consultar historial de auditoria del lead:', error);
    return res.status(500).json({ message: 'No se pudo consultar historial de auditoria.' });
  }
});

app.get('/api/leads/:id/stage-history', async (req, res) => {
  const leadId = parsePositiveInteger(req.params.id);
  if (!leadId) {
    return res.status(400).json({ message: 'ID de lead invalido.' });
  }

  await hydrateAuthPermissions(req);
  const canViewAllLeads = hasAuthPermission(req.auth, 'leads.view_all');
  const canViewAssignedLeads = hasAuthPermission(req.auth, 'leads.view_assigned');
  if (!canViewAllLeads && !canViewAssignedLeads) {
    return res.status(403).json({ message: 'No tienes permisos para consultar historial de etapas.' });
  }

  const limit = parsePositiveInt(req.query.limit, 120, 1, 500);

  try {
    const { rows: leadRows } = await pool.query(
      `SELECT id, assigned_to
       FROM leads
       WHERE id = $1
       LIMIT 1`,
      [leadId]
    );
    if (!leadRows.length) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    const lead = leadRows[0];
    if (!canAccessAssignedLead(req.auth, lead.assigned_to)) {
      return res.status(403).json({ message: 'No tienes permisos para ver historial de este lead.' });
    }

    const { rows } = await pool.query(
      `SELECT
         id,
         lead_id,
         from_status,
         to_status,
         from_stage_key,
         to_stage_key,
         changed_by_user_id,
         changed_by_username,
         request_id,
         change_reason,
         created_at
       FROM lead_stage_history
       WHERE lead_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [leadId, limit]
    );

    return res.json({
      leadId,
      count: rows.length,
      history: rows.map(mapLeadStageHistoryRow)
    });
  } catch (error) {
    console.error('Error al consultar stage history del lead:', error);
    return res.status(500).json({ message: 'No se pudo consultar historial de etapas.' });
  }
});

app.post('/api/leads/:id/audit-history/:auditId/undo', async (req, res) => {
  const leadId = parsePositiveInteger(req.params.id);
  const auditId = parsePositiveInteger(req.params.auditId);
  if (!leadId || !auditId) {
    return res.status(400).json({ message: 'ID de lead o auditId invalido.' });
  }

  await hydrateAuthPermissions(req);
  if (!hasAuthPermission(req.auth, 'audit.view')) {
    return res.status(403).json({ message: 'No tienes permisos para deshacer cambios de leads.' });
  }
  if (!hasAuthPermission(req.auth, 'leads.edit')) {
    return res.status(403).json({ message: 'No tienes permisos para deshacer cambios de leads.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: leadRows } = await client.query(
      `SELECT ${LEAD_SELECT_COLUMNS}
       FROM leads
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [leadId]
    );
    if (!leadRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    const currentLead = leadRows[0];
    if (!canAccessAssignedLead(req.auth, currentLead.assigned_to)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'No tienes permisos para deshacer cambios en este lead.' });
    }

    const { rows: auditRows } = await client.query(
      `SELECT
         id,
         actor_user_id,
         actor_username,
         action,
         entity_type,
         entity_id,
         request_id,
         ip_address,
         http_method,
         route_path,
         before_data,
         after_data,
         metadata,
         created_at
       FROM audit_log
       WHERE id = $1
         AND entity_type = 'lead'
         AND entity_id = $2
       LIMIT 1
       FOR UPDATE`,
      [auditId, String(leadId)]
    );
    if (!auditRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Registro de auditoria no encontrado para este lead.' });
    }

    const auditEntry = mapLeadAuditLogRow(auditRows[0]);
    if (!auditEntry.canUndo) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Este registro de auditoria no se puede deshacer.' });
    }

    const undoChanges = buildLeadUndoChangesFromAudit(auditEntry.before, auditEntry.after);
    if (Object.prototype.hasOwnProperty.call(undoChanges, 'assigned_to')
      && !canSetLeadAssignee(req.auth, undoChanges.assigned_to)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'No puedes reasignar este lead al estado anterior.' });
    }

    if (Object.prototype.hasOwnProperty.call(undoChanges, 'related_lead_id')) {
      const relatedLeadId = undoChanges.related_lead_id;
      if (relatedLeadId !== null && Number(relatedLeadId) === Number(leadId)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'No se puede restaurar una relacion invalida del lead consigo mismo.' });
      }
      if (relatedLeadId !== null) {
        const { rows: relatedRows } = await client.query(
          'SELECT id FROM leads WHERE id = $1 LIMIT 1',
          [relatedLeadId]
        );
        if (!relatedRows.length) {
          await client.query('ROLLBACK');
          return res.status(400).json({ message: 'No se puede restaurar la relacion porque el lead relacionado ya no existe.' });
        }
      }
    }

    const effectiveStateCode = Object.prototype.hasOwnProperty.call(undoChanges, 'state_code')
      ? undoChanges.state_code
      : currentLead.state_code;
    undoChanges.calc_program_fee_percent = getProgramFeePercentForState(effectiveStateCode);

    const entries = Object.entries(undoChanges).filter(([column]) => LEAD_AUDIT_UNDOABLE_COLUMNS.has(column));
    if (!entries.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'No hay campos deshacibles en este registro.' });
    }

    const updateFields = [];
    const values = [];
    entries.forEach(([column, value], index) => {
      updateFields.push(`${column} = $${index + 1}`);
      values.push(value);
    });
    values.push(leadId);

    const { rows: updatedRows } = await client.query(
      `UPDATE leads
       SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${values.length}
       RETURNING ${LEAD_SELECT_COLUMNS}`,
      values
    );

    if (!updatedRows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'No se pudo deshacer el cambio del lead.' });
    }

    const updatedLead = updatedRows[0];

    await syncCallbackTaskFromLead(updatedLead, { req, client }).catch((error) => {
      console.error('Error sincronizando callback task (undo):', error);
    });

    await writeAuditLog({
      req,
      action: 'lead.undo',
      entityType: 'lead',
      entityId: leadId,
      before: currentLead,
      after: updatedLead,
      metadata: {
        sourceAuditLogId: auditId,
        sourceAction: auditEntry.action,
        undoneFields: entries.map(([column]) => column)
      },
      client
    });

    const statusChanged = normalizePipelineStatusToken(currentLead.status) !== normalizePipelineStatusToken(updatedLead.status);
    if (statusChanged) {
      await recordLeadStageHistory({
        leadId: updatedLead.id,
        fromStatus: currentLead.status,
        toStatus: updatedLead.status,
        req,
        reason: 'lead.undo',
        client
      });
    }

    applyLeadDerivedFields(updatedLead);
    await client.query('COMMIT');
    return res.json({
      ok: true,
      lead: updatedLead,
      sourceAuditLogId: auditId,
      undoneFields: entries.map(([column]) => column),
      message: 'Cambio deshecho correctamente.'
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // ignore rollback secondary errors
    }
    console.error('Error al deshacer cambio de lead desde auditoria:', error);
    return res.status(500).json({ message: 'No se pudo deshacer el cambio del lead.' });
  } finally {
    client.release();
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
    applyLeadDerivedFields(lead);

    res.json({ lead });
  } catch (error) {
    console.error('Error al obtener lead:', error);
    res.status(500).json({ message: 'Error al obtener lead.' });
  }
});

app.patch('/api/leads/:id', async (req, res) => {
  await hydrateAuthPermissions(req);
  if (!hasAuthPermission(req.auth, 'leads.edit')) {
    return res.status(403).json({ message: 'No tienes permisos para editar leads.' });
  }

  const leadId = req.params.id;
  const parsed = parseLeadPatchBody(req.body || {});

  if (!parsed.ok) {
    return res.status(400).json({ message: parsed.message });
  }

  const changes = parsed.changes;
  const incomingEntries = Object.entries(changes);

  if (incomingEntries.length === 0) {
    return res.status(400).json({ message: 'No hay campos para actualizar.' });
  }

  if (
    Object.prototype.hasOwnProperty.call(changes, 'assigned_to')
    && !canSetLeadAssignee(req.auth, changes.assigned_to)
  ) {
    return res.status(403).json({ message: 'No puedes reasignar este lead a otro usuario.' });
  }

  try {
    const { rows: existingLeadRows } = await pool.query(
      `SELECT ${LEAD_SELECT_COLUMNS}
       FROM leads
       WHERE id = $1
       LIMIT 1`,
      [leadId]
    );
    if (existingLeadRows.length === 0) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    const beforeLead = existingLeadRows[0];
    let statusTransition = null;
    if (Object.prototype.hasOwnProperty.call(changes, 'status')) {
      statusTransition = validateLeadStatusTransition(beforeLead.status, changes.status);
      if (!statusTransition.ok) {
        return res.status(400).json({
          message: statusTransition.message || 'Transicion de status no permitida.',
          code: 'INVALID_STAGE_TRANSITION',
          details: {
            fromStatus: statusTransition?.from?.label || cleanText(beforeLead.status, 120) || null,
            toStatus: statusTransition?.to?.label || cleanText(changes.status, 120) || null,
            allowedNextStatuses: Array.isArray(statusTransition?.allowedNextStatuses)
              ? statusTransition.allowedNextStatuses
              : []
          }
        });
      }
      changes.status = statusTransition.to.label;
    }

    let effectiveStateCode = changes.state_code;
    if (effectiveStateCode === undefined) {
      effectiveStateCode = beforeLead.state_code;
    }

    // Regla fija de calculator: Green=25%, Red=29.5%
    changes.calc_program_fee_percent = getProgramFeePercentForState(effectiveStateCode);
    const entries = Object.entries(changes);

    if (Object.prototype.hasOwnProperty.call(changes, 'related_lead_id')) {
      const nextRelatedLeadId = changes.related_lead_id;
      const normalizedLeadId = Number(beforeLead.id);

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

    await syncCallbackTaskFromLead(lead, { req }).catch((error) => {
      console.error('Error sincronizando callback task (patch):', error);
    });

    if (changes.assigned_to && lead.assigned_to) {
      await createLeadAssignmentNotification(lead.assigned_to, lead).catch(() => {});
    }

    const auditDiffEntries = buildLeadAuditDiffEntries(beforeLead, lead);
    const trackedFields = auditDiffEntries.map((entry) => entry.field);
    if (trackedFields.length > 0) {
      const handledByPaymentMerge = await writeOrMergeLeadPaymentAuditLog({
        req,
        entityId: lead.id,
        before: beforeLead,
        after: lead,
        changedFields: trackedFields
      });

      if (!handledByPaymentMerge) {
        await writeAuditLog({
          req,
          action: 'lead.update',
          entityType: 'lead',
          entityId: lead.id,
          before: beforeLead,
          after: lead,
          metadata: {
            changedFields: trackedFields
          }
        });
      }
    }

    const statusChanged = normalizePipelineStatusToken(beforeLead.status) !== normalizePipelineStatusToken(lead.status);
    if (statusChanged) {
      await recordLeadStageHistory({
        leadId: lead.id,
        fromStatus: beforeLead.status,
        toStatus: lead.status,
        req,
        reason: statusTransition?.changed ? 'lead.patch' : 'lead.patch_legacy'
      }).catch((error) => {
        console.error('Error registrando stage history (patch):', error);
      });
    }

    applyLeadDerivedFields(lead);
    res.json({ lead, message: 'Lead actualizado correctamente.' });
  } catch (error) {
    console.error('Error al actualizar lead:', error);
    res.status(500).json({ message: 'Error al actualizar lead.' });
  }
});

// ============================================
// ENDPOINTS: Notificaciones por usuario
// ============================================

app.get('/api/notifications', async (req, res) => {
  const username = cleanText(req.auth?.username || req.query.username, 120).toLowerCase();
  if (!username) return res.status(400).json({ message: 'username requerido.' });

  try {
    const { rows } = await pool.query(
      `SELECT id, type, title, body, lead_id, read_at, created_at
       FROM notifications
       WHERE lower(recipient_username) = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [username]
    );
    const unreadCount = rows.filter((n) => !n.read_at).length;
    return res.json({ notifications: rows, unreadCount });
  } catch (error) {
    console.error('Error al obtener notificaciones:', error);
    return res.status(500).json({ message: 'Error al obtener notificaciones.' });
  }
});

app.patch('/api/notifications/read', async (req, res) => {
  const username = cleanText(req.auth?.username || req.body?.username, 120).toLowerCase();
  const ids = req.body?.ids;
  if (!username) return res.status(400).json({ message: 'username requerido.' });

  try {
    if (Array.isArray(ids) && ids.length > 0) {
      await pool.query(
        `UPDATE notifications SET read_at = NOW()
         WHERE lower(recipient_username) = $1 AND id = ANY($2::bigint[]) AND read_at IS NULL`,
        [username, ids]
      );
    } else {
      await pool.query(
        `UPDATE notifications SET read_at = NOW()
         WHERE lower(recipient_username) = $1 AND read_at IS NULL`,
        [username]
      );
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error al marcar notificaciones:', error);
    return res.status(500).json({ message: 'Error al marcar como leídas.' });
  }
});

app.delete('/api/notifications/:id', async (req, res) => {
  const notificationId = Number(req.params.id);
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    return res.status(400).json({ message: 'id de notificacion invalido.' });
  }

  const username = cleanText(req.auth?.username || req.body?.username || req.query.username, 120).toLowerCase();
  if (!username) return res.status(400).json({ message: 'username requerido.' });

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM notifications
       WHERE id = $1 AND lower(recipient_username) = $2`,
      [notificationId, username]
    );

    if (!rowCount) {
      return res.status(404).json({ message: 'Notificacion no encontrada.' });
    }

    return res.json({ ok: true, deletedId: notificationId });
  } catch (error) {
    console.error('Error al eliminar notificacion:', error);
    return res.status(500).json({ message: 'Error al eliminar notificacion.' });
  }
});

app.get('/api/tasks', async (req, res) => {
  await hydrateAuthPermissions(req);
  if (!hasAuthPermission(req.auth, 'tasks.manage')) {
    return res.status(403).json({ message: 'No tienes permisos para consultar tareas.' });
  }

  const fromDate = cleanText(req.query.from, 16);
  const toDate = cleanText(req.query.to, 16);
  if (fromDate && !isValidISODate(fromDate)) {
    return res.status(400).json({ message: 'Parametro from invalido. Usa YYYY-MM-DD.' });
  }
  if (toDate && !isValidISODate(toDate)) {
    return res.status(400).json({ message: 'Parametro to invalido. Usa YYYY-MM-DD.' });
  }
  if (fromDate && toDate && fromDate > toDate) {
    return res.status(400).json({ message: 'Parametro from no puede ser mayor que to.' });
  }

  const canViewTeam = hasAuthPermission(req.auth, 'callbacks.view_all');
  const requestedScope = cleanText(req.query.scope, 20).toLowerCase();
  const scope = requestedScope === 'team' && canViewTeam ? 'team' : 'mine';
  const includeCompleted = parseBooleanQuery(req.query.includeCompleted, true);
  const statusFilter = parseTaskFilterList(req.query.status, TASK_STATUS_VALUES);
  const priorityFilter = parseTaskFilterList(req.query.priority, TASK_PRIORITY_VALUES);
  const ownerFilter = cleanText(req.query.owner || req.query.ownerUsername, 120).toLowerCase();
  const ownerTeamFilter = cleanText(req.query.team || req.query.ownerTeam, 120).toLowerCase();
  const limit = parsePositiveInt(req.query.limit, TASK_LIST_LIMIT_DEFAULT, 1, TASK_LIST_LIMIT_MAX);
  const runEscalation = parseBooleanQuery(req.query.refreshEscalation, true);

  const conditions = ['1=1'];
  const values = [];
  const pushValue = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (fromDate) {
    const fromToken = pushValue(fromDate);
    conditions.push(`COALESCE(t.due_date, (t.due_at AT TIME ZONE 'UTC')::date, t.created_at::date) >= ${fromToken}::date`);
  }
  if (toDate) {
    const toToken = pushValue(toDate);
    conditions.push(`COALESCE(t.due_date, (t.due_at AT TIME ZONE 'UTC')::date, t.created_at::date) <= ${toToken}::date`);
  }
  if (!includeCompleted) {
    conditions.push(`t.status NOT IN ('completed', 'cancelled')`);
  }
  if (statusFilter.length) {
    const statusToken = pushValue(statusFilter);
    conditions.push(`t.status = ANY(${statusToken}::text[])`);
  }
  if (priorityFilter.length) {
    const priorityToken = pushValue(priorityFilter);
    conditions.push(`t.priority = ANY(${priorityToken}::text[])`);
  }
  if (ownerTeamFilter) {
    const teamToken = pushValue(ownerTeamFilter);
    conditions.push(`lower(coalesce(t.owner_team, '')) = ${teamToken}`);
  }

  if (scope === 'team') {
    if (ownerFilter) {
      const ownerToken = pushValue(ownerFilter);
      conditions.push(`lower(coalesce(t.owner_username, '')) = ${ownerToken}`);
    }
  } else {
    const identities = getAuthIdentities(req.auth);
    if (!identities.length) {
      return res.status(403).json({ message: 'No autorizado para consultar tu bandeja de tareas.' });
    }
    const identityToken = pushValue(identities);
    conditions.push(`lower(coalesce(t.owner_username, '')) = ANY(${identityToken}::text[])`);
  }

  try {
    let escalationResult = { ok: true, skipped: true, escalated: 0 };
    if (runEscalation) {
      escalationResult = await runTaskEscalationSweep({ limit: 120 });
    }

    const limitToken = pushValue(limit);
    const { rows } = await pool.query(
      `SELECT
         t.*,
         l.case_id AS lead_case_id,
         l.full_name AS lead_full_name
       FROM lead_tasks t
       LEFT JOIN leads l ON l.id = t.related_lead_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         CASE t.priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'normal' THEN 3
           ELSE 4
         END ASC,
         COALESCE(t.due_at, t.due_date::timestamp, t.created_at) ASC,
         t.id ASC
       LIMIT ${limitToken}`,
      values
    );

    const tasks = rows.map((row) => mapLeadTaskRow(row));
    return res.json({
      tasks,
      scope,
      canViewTeam,
      escalation: {
        executed: runEscalation,
        escalated: Number(escalationResult?.escalated || 0)
      }
    });
  } catch (error) {
    console.error('Error al obtener tareas operativas:', error);
    return res.status(500).json({ message: 'Error al obtener tareas operativas.' });
  }
});

app.post('/api/tasks', async (req, res) => {
  await hydrateAuthPermissions(req);
  if (!hasAuthPermission(req.auth, 'tasks.manage')) {
    return res.status(403).json({ message: 'No tienes permisos para crear tareas.' });
  }

  const body = req.body || {};
  const normalizedTaskType = normalizeTaskType(pickFirstDefined(body, ['taskType', 'task_type']), { required: false });
  if (!normalizedTaskType.ok) return res.status(400).json({ message: normalizedTaskType.message });

  const title = cleanText(pickFirstDefined(body, ['title']), 180);
  if (!title) {
    return res.status(400).json({ message: 'title es obligatorio.' });
  }

  const description = toNullableText(pickFirstDefined(body, ['description', 'notes']), 5000);
  const normalizedPriority = normalizeTaskPriority(pickFirstDefined(body, ['priority']));
  if (!normalizedPriority.ok) return res.status(400).json({ message: normalizedPriority.message });

  const normalizedStatus = normalizeTaskStatus(pickFirstDefined(body, ['status']));
  if (!normalizedStatus.ok) return res.status(400).json({ message: normalizedStatus.message });

  const ownerFallback = getTaskActorLabel(req);
  const normalizedOwner = normalizeTaskOwnerUsername(
    pickFirstDefined(body, ['ownerUsername', 'owner_username', 'assignedTo', 'assigned_to']),
    { required: true, fallback: ownerFallback }
  );
  if (!normalizedOwner.ok || !normalizedOwner.value) {
    return res.status(400).json({ message: normalizedOwner.message || 'ownerUsername es obligatorio.' });
  }

  const normalizedOwnerTeam = normalizeTaskOwnerTeam(
    pickFirstDefined(body, ['ownerTeam', 'owner_team'])
  );
  if (!normalizedOwnerTeam.ok) return res.status(400).json({ message: 'ownerTeam invalido.' });

  const dueDateInput = normalizeTaskDateOnly(
    pickFirstDefined(body, ['dueDate', 'due_date']),
    { fieldName: 'dueDate', required: false }
  );
  if (!dueDateInput.ok) return res.status(400).json({ message: dueDateInput.message });

  const dueAtInput = normalizeTaskTimestamp(
    pickFirstDefined(body, ['dueAt', 'due_at']),
    { fieldName: 'dueAt', required: false }
  );
  if (!dueAtInput.ok) return res.status(400).json({ message: dueAtInput.message });

  const recurrenceRuleInput = normalizeTaskRecurrenceRule(
    pickFirstDefined(body, ['recurrenceRule', 'recurrence_rule']),
    { required: false, fieldName: 'recurrenceRule' }
  );
  if (!recurrenceRuleInput.ok) return res.status(400).json({ message: recurrenceRuleInput.message });

  const recurrenceIntervalInput = normalizeTaskRecurrenceInterval(
    pickFirstDefined(body, ['recurrenceInterval', 'recurrence_interval']),
    { fieldName: 'recurrenceInterval' }
  );
  if (!recurrenceIntervalInput.ok) return res.status(400).json({ message: recurrenceIntervalInput.message });

  const recurrenceEndDateInput = normalizeTaskDateOnly(
    pickFirstDefined(body, ['recurrenceEndDate', 'recurrence_end_date']),
    { fieldName: 'recurrenceEndDate', required: false }
  );
  if (!recurrenceEndDateInput.ok) return res.status(400).json({ message: recurrenceEndDateInput.message });

  const slaMinutesInput = normalizeTaskSlaMinutes(
    pickFirstDefined(body, ['slaMinutes', 'sla_minutes']),
    { fieldName: 'slaMinutes' }
  );
  if (!slaMinutesInput.ok) return res.status(400).json({ message: slaMinutesInput.message });

  const slaDueAtInput = normalizeTaskTimestamp(
    pickFirstDefined(body, ['slaDueAt', 'sla_due_at']),
    { fieldName: 'slaDueAt', required: false }
  );
  if (!slaDueAtInput.ok) return res.status(400).json({ message: slaDueAtInput.message });

  const metadataInput = normalizeTaskMetadata(
    pickFirstDefined(body, ['metadata']),
    { fieldName: 'metadata' }
  );
  if (!metadataInput.ok) return res.status(400).json({ message: metadataInput.message });

  const relatedLeadIdRaw = pickFirstDefined(body, ['relatedLeadId', 'related_lead_id', 'leadId', 'lead_id']);
  const relatedLeadId = relatedLeadIdRaw === undefined || relatedLeadIdRaw === null || String(relatedLeadIdRaw).trim() === ''
    ? null
    : parsePositiveInteger(relatedLeadIdRaw);
  if (relatedLeadIdRaw !== undefined && relatedLeadId === null) {
    return res.status(400).json({ message: 'relatedLeadId debe ser un entero positivo.' });
  }

  let dueAt = dueAtInput.value;
  let dueDate = dueDateInput.value;
  if (dueAt && !dueDate) {
    dueDate = dueAt.slice(0, 10);
  }
  if (!dueAt && dueDate) {
    dueAt = buildTaskDueAtFromDate(dueDate);
  }

  const recurrenceRule = recurrenceRuleInput.value;
  const recurrenceInterval = recurrenceRule === 'none' ? 1 : recurrenceIntervalInput.value;
  const recurrenceEndDate = recurrenceRule === 'none' ? null : recurrenceEndDateInput.value;
  if (recurrenceRule !== 'none' && !dueDate && !dueAt) {
    return res.status(400).json({ message: 'Las tareas recurrentes requieren dueDate o dueAt.' });
  }
  if (recurrenceEndDate && dueDate && recurrenceEndDate < dueDate) {
    return res.status(400).json({ message: 'recurrenceEndDate no puede ser menor que dueDate.' });
  }

  const slaMinutes = slaMinutesInput.provided
    ? slaMinutesInput.value
    : (dueDate || dueAt ? TASK_DEFAULT_SLA_MINUTES : null);
  const slaDueAt = computeTaskSlaDueAt({
    explicitSlaDueAt: slaDueAtInput.value,
    slaMinutes: Number.isInteger(slaMinutes) && slaMinutes > 0 ? slaMinutes : null,
    anchorTimestamp: dueAt || buildTaskDueAtFromDate(dueDate)
  });

  const status = normalizedStatus.value;
  const completedAt = status === 'completed'
    ? (normalizeTimestampForApi(pickFirstDefined(body, ['completedAt', 'completed_at'])) || new Date().toISOString())
    : null;

  try {
    if (relatedLeadId !== null) {
      const { rows: leadRows } = await pool.query(
        `SELECT id
         FROM leads
         WHERE id = $1
         LIMIT 1`,
        [relatedLeadId]
      );
      if (!leadRows.length) {
        return res.status(400).json({ message: 'relatedLeadId no existe.' });
      }
    }

    const actorUserId = Number(req.auth?.id);
    const normalizedActorUserId = Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null;
    const actorUsername = cleanText(req.auth?.username, 120).toLowerCase() || null;

    const { rows } = await pool.query(
      `INSERT INTO lead_tasks (
         task_type,
         title,
         description,
         priority,
         status,
         owner_username,
         owner_team,
         related_lead_id,
         due_date,
         due_at,
         completed_at,
         recurrence_rule,
         recurrence_interval,
         recurrence_end_date,
         sla_minutes,
         sla_due_at,
         source_callback_date,
         metadata,
         created_by_user_id,
         created_by_username
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20
       )
       RETURNING *`,
      [
        normalizedTaskType.value,
        title,
        description,
        normalizedPriority.value,
        status,
        normalizedOwner.value,
        normalizedOwnerTeam.value,
        relatedLeadId,
        dueDate,
        dueAt,
        completedAt,
        recurrenceRule,
        recurrenceInterval,
        recurrenceEndDate,
        slaMinutes,
        slaDueAt,
        normalizedTaskType.value === 'callback' ? dueDate : null,
        JSON.stringify(metadataInput.value || {}),
        normalizedActorUserId,
        actorUsername
      ]
    );

    const created = rows[0];

    if (cleanText(created.task_type, 40).toLowerCase() === 'callback' && Number(created.related_lead_id || 0) > 0) {
      const callbackDate = normalizeDateOnlyForApi(created.due_date);
      const callbackCompletedAt = cleanText(created.status, 20).toLowerCase() === 'completed'
        ? normalizeTimestampForApi(created.completed_at) || new Date().toISOString()
        : null;
      await pool.query(
        `UPDATE leads
         SET callback_date = $2::date,
             callback_completed_at = $3::timestamptz,
             assigned_to = COALESCE($4, assigned_to),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [created.related_lead_id, callbackDate, callbackCompletedAt, cleanText(created.owner_username, 120) || null]
      );
    }

    await writeAuditLog({
      req,
      action: 'task.create',
      entityType: 'task',
      entityId: created.id,
      before: null,
      after: created,
      metadata: {
        taskType: created.task_type,
        ownerUsername: created.owner_username
      }
    });

    const { rows: withLeadRows } = await pool.query(
      `SELECT t.*, l.case_id AS lead_case_id, l.full_name AS lead_full_name
       FROM lead_tasks t
       LEFT JOIN leads l ON l.id = t.related_lead_id
       WHERE t.id = $1
       LIMIT 1`,
      [created.id]
    );

    return res.status(201).json({
      task: mapLeadTaskRow(withLeadRows[0] || created),
      message: 'Task creada correctamente.'
    });
  } catch (error) {
    console.error('Error al crear task:', error);
    return res.status(500).json({ message: 'Error al crear task.' });
  }
});

app.patch('/api/tasks/:id', async (req, res) => {
  const taskId = parsePositiveInteger(req.params.id);
  if (!taskId) {
    return res.status(400).json({ message: 'taskId invalido.' });
  }

  await hydrateAuthPermissions(req);
  if (!hasAuthPermission(req.auth, 'tasks.manage')) {
    return res.status(403).json({ message: 'No tienes permisos para actualizar tareas.' });
  }

  try {
    const { rows: currentRows } = await pool.query(
      `SELECT *
       FROM lead_tasks
       WHERE id = $1
       LIMIT 1`,
      [taskId]
    );
    if (!currentRows.length) {
      return res.status(404).json({ message: 'Task no encontrada.' });
    }

    const current = currentRows[0];
    if (!canAccessTaskByOwner(req.auth, current.owner_username)) {
      return res.status(403).json({ message: 'No tienes permisos para actualizar esta task.' });
    }

    const body = req.body || {};
    const updates = [];
    const values = [];
    const changedFields = [];

    const pushUpdate = (column, value, fieldLabel = column) => {
      const existingIndex = updates.findIndex((entry) => entry.startsWith(`${column} =`));
      if (existingIndex >= 0) {
        updates[existingIndex] = `${column} = $${existingIndex + 1}`;
        values[existingIndex] = value;
      } else {
        updates.push(`${column} = $${updates.length + 1}`);
        values.push(value);
      }
      if (!changedFields.includes(fieldLabel)) changedFields.push(fieldLabel);
    };

    if (Object.prototype.hasOwnProperty.call(body, 'title')) {
      const title = cleanText(body.title, 180);
      if (!title) {
        return res.status(400).json({ message: 'title no puede estar vacio.' });
      }
      pushUpdate('title', title, 'title');
    }

    if (Object.prototype.hasOwnProperty.call(body, 'description') || Object.prototype.hasOwnProperty.call(body, 'notes')) {
      const description = toNullableText(pickFirstDefined(body, ['description', 'notes']), 5000);
      pushUpdate('description', description, 'description');
    }

    if (Object.prototype.hasOwnProperty.call(body, 'priority')) {
      const normalizedPriority = normalizeTaskPriority(body.priority, { required: true });
      if (!normalizedPriority.ok) return res.status(400).json({ message: normalizedPriority.message });
      pushUpdate('priority', normalizedPriority.value, 'priority');
    }

    let incomingStatus = null;
    if (Object.prototype.hasOwnProperty.call(body, 'status')) {
      const normalizedStatus = normalizeTaskStatus(body.status, { required: true });
      if (!normalizedStatus.ok) return res.status(400).json({ message: normalizedStatus.message });
      incomingStatus = normalizedStatus.value;
      pushUpdate('status', incomingStatus, 'status');
    }

    const hasDueDateInput = Object.prototype.hasOwnProperty.call(body, 'dueDate')
      || Object.prototype.hasOwnProperty.call(body, 'due_date');
    const hasDueAtInput = Object.prototype.hasOwnProperty.call(body, 'dueAt')
      || Object.prototype.hasOwnProperty.call(body, 'due_at');
    let incomingDueDate = null;
    let incomingDueAt = null;
    if (hasDueDateInput) {
      const dueDateInput = normalizeTaskDateOnly(
        pickFirstDefined(body, ['dueDate', 'due_date']),
        { fieldName: 'dueDate', required: false }
      );
      if (!dueDateInput.ok) return res.status(400).json({ message: dueDateInput.message });
      incomingDueDate = dueDateInput.value;
      pushUpdate('due_date', incomingDueDate, 'dueDate');
    }

    if (hasDueAtInput) {
      const dueAtInput = normalizeTaskTimestamp(
        pickFirstDefined(body, ['dueAt', 'due_at']),
        { fieldName: 'dueAt', required: false }
      );
      if (!dueAtInput.ok) return res.status(400).json({ message: dueAtInput.message });
      incomingDueAt = dueAtInput.value;
      pushUpdate('due_at', incomingDueAt, 'dueAt');
    }

    if (hasDueAtInput && incomingDueAt && !hasDueDateInput) {
      pushUpdate('due_date', incomingDueAt.slice(0, 10), 'dueDate');
    }

    if (hasDueDateInput && !hasDueAtInput) {
      if (incomingDueDate) {
        pushUpdate('due_at', buildTaskDueAtFromDate(incomingDueDate), 'dueAt');
      } else {
        pushUpdate('due_at', null, 'dueAt');
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'ownerUsername')
      || Object.prototype.hasOwnProperty.call(body, 'owner_username')
      || Object.prototype.hasOwnProperty.call(body, 'assignedTo')
      || Object.prototype.hasOwnProperty.call(body, 'assigned_to')) {
      const normalizedOwner = normalizeTaskOwnerUsername(
        pickFirstDefined(body, ['ownerUsername', 'owner_username', 'assignedTo', 'assigned_to']),
        { required: true, fallback: current.owner_username }
      );
      if (!normalizedOwner.ok || !normalizedOwner.value) {
        return res.status(400).json({ message: normalizedOwner.message || 'ownerUsername invalido.' });
      }
      pushUpdate('owner_username', normalizedOwner.value, 'ownerUsername');
    }

    if (Object.prototype.hasOwnProperty.call(body, 'ownerTeam') || Object.prototype.hasOwnProperty.call(body, 'owner_team')) {
      const normalizedOwnerTeam = normalizeTaskOwnerTeam(
        pickFirstDefined(body, ['ownerTeam', 'owner_team'])
      );
      pushUpdate('owner_team', normalizedOwnerTeam.value, 'ownerTeam');
    }

    if (Object.prototype.hasOwnProperty.call(body, 'relatedLeadId')
      || Object.prototype.hasOwnProperty.call(body, 'related_lead_id')
      || Object.prototype.hasOwnProperty.call(body, 'leadId')
      || Object.prototype.hasOwnProperty.call(body, 'lead_id')) {
      const relatedLeadIdRaw = pickFirstDefined(body, ['relatedLeadId', 'related_lead_id', 'leadId', 'lead_id']);
      const relatedLeadId = relatedLeadIdRaw === null || relatedLeadIdRaw === ''
        ? null
        : parsePositiveInteger(relatedLeadIdRaw);
      if (relatedLeadIdRaw !== null && relatedLeadIdRaw !== '' && !relatedLeadId) {
        return res.status(400).json({ message: 'relatedLeadId debe ser un entero positivo.' });
      }
      if (relatedLeadId !== null) {
        const { rows: leadRows } = await pool.query(
          `SELECT id
           FROM leads
           WHERE id = $1
           LIMIT 1`,
          [relatedLeadId]
        );
        if (!leadRows.length) {
          return res.status(400).json({ message: 'relatedLeadId no existe.' });
        }
      }
      pushUpdate('related_lead_id', relatedLeadId, 'relatedLeadId');
    }

    let recurrenceRule = cleanText(current.recurrence_rule, 20).toLowerCase() || 'none';
    if (Object.prototype.hasOwnProperty.call(body, 'recurrenceRule') || Object.prototype.hasOwnProperty.call(body, 'recurrence_rule')) {
      const recurrenceRuleInput = normalizeTaskRecurrenceRule(
        pickFirstDefined(body, ['recurrenceRule', 'recurrence_rule']),
        { required: true, fieldName: 'recurrenceRule' }
      );
      if (!recurrenceRuleInput.ok) return res.status(400).json({ message: recurrenceRuleInput.message });
      recurrenceRule = recurrenceRuleInput.value;
      pushUpdate('recurrence_rule', recurrenceRule, 'recurrenceRule');
    }

    if (Object.prototype.hasOwnProperty.call(body, 'recurrenceInterval') || Object.prototype.hasOwnProperty.call(body, 'recurrence_interval')) {
      const recurrenceIntervalInput = normalizeTaskRecurrenceInterval(
        pickFirstDefined(body, ['recurrenceInterval', 'recurrence_interval']),
        { fieldName: 'recurrenceInterval' }
      );
      if (!recurrenceIntervalInput.ok) return res.status(400).json({ message: recurrenceIntervalInput.message });
      pushUpdate('recurrence_interval', recurrenceIntervalInput.value, 'recurrenceInterval');
    }

    if (Object.prototype.hasOwnProperty.call(body, 'recurrenceEndDate') || Object.prototype.hasOwnProperty.call(body, 'recurrence_end_date')) {
      const recurrenceEndDateInput = normalizeTaskDateOnly(
        pickFirstDefined(body, ['recurrenceEndDate', 'recurrence_end_date']),
        { fieldName: 'recurrenceEndDate', required: false }
      );
      if (!recurrenceEndDateInput.ok) return res.status(400).json({ message: recurrenceEndDateInput.message });
      pushUpdate('recurrence_end_date', recurrenceEndDateInput.value, 'recurrenceEndDate');
    }

    let slaMinutes = Number.isInteger(Number(current.sla_minutes)) ? Number(current.sla_minutes) : null;
    if (Object.prototype.hasOwnProperty.call(body, 'slaMinutes') || Object.prototype.hasOwnProperty.call(body, 'sla_minutes')) {
      const slaMinutesInput = normalizeTaskSlaMinutes(
        pickFirstDefined(body, ['slaMinutes', 'sla_minutes']),
        { fieldName: 'slaMinutes' }
      );
      if (!slaMinutesInput.ok) return res.status(400).json({ message: slaMinutesInput.message });
      slaMinutes = slaMinutesInput.value;
      pushUpdate('sla_minutes', slaMinutes, 'slaMinutes');
    }

    if (Object.prototype.hasOwnProperty.call(body, 'slaDueAt') || Object.prototype.hasOwnProperty.call(body, 'sla_due_at')) {
      const slaDueAtInput = normalizeTaskTimestamp(
        pickFirstDefined(body, ['slaDueAt', 'sla_due_at']),
        { fieldName: 'slaDueAt', required: false }
      );
      if (!slaDueAtInput.ok) return res.status(400).json({ message: slaDueAtInput.message });
      pushUpdate('sla_due_at', slaDueAtInput.value, 'slaDueAt');
    } else if (
      Object.prototype.hasOwnProperty.call(body, 'dueDate')
      || Object.prototype.hasOwnProperty.call(body, 'due_date')
      || Object.prototype.hasOwnProperty.call(body, 'dueAt')
      || Object.prototype.hasOwnProperty.call(body, 'due_at')
      || Object.prototype.hasOwnProperty.call(body, 'slaMinutes')
      || Object.prototype.hasOwnProperty.call(body, 'sla_minutes')
    ) {
      const anchorDueAt = incomingDueAt || normalizeTimestampForApi(current.due_at)
        || buildTaskDueAtFromDate(incomingDueDate || normalizeDateOnlyForApi(current.due_date));
      const computedSlaDueAt = computeTaskSlaDueAt({
        explicitSlaDueAt: null,
        slaMinutes,
        anchorTimestamp: anchorDueAt
      });
      pushUpdate('sla_due_at', computedSlaDueAt, 'slaDueAt');
    }

    if (Object.prototype.hasOwnProperty.call(body, 'metadata')) {
      const metadataInput = normalizeTaskMetadata(body.metadata, { fieldName: 'metadata' });
      if (!metadataInput.ok) return res.status(400).json({ message: metadataInput.message });
      pushUpdate('metadata', JSON.stringify(metadataInput.value || {}), 'metadata');
    }

    if (incomingStatus === 'completed') {
      const completedAtInput = normalizeTaskTimestamp(
        pickFirstDefined(body, ['completedAt', 'completed_at']),
        { fieldName: 'completedAt', required: false }
      );
      if (!completedAtInput.ok) return res.status(400).json({ message: completedAtInput.message });
      pushUpdate('completed_at', completedAtInput.value || new Date().toISOString(), 'completedAt');
    } else if (incomingStatus && incomingStatus !== 'completed') {
      pushUpdate('completed_at', null, 'completedAt');
    }

    if (!updates.length) {
      return res.status(400).json({ message: 'No hay campos para actualizar en la task.' });
    }

    if (recurrenceRule === 'none') {
      const hasRecurrenceRuleUpdate = updates.some((entry) => entry.startsWith('recurrence_rule ='));
      if (hasRecurrenceRuleUpdate) {
        pushUpdate('recurrence_interval', 1, 'recurrenceInterval');
        pushUpdate('recurrence_end_date', null, 'recurrenceEndDate');
      }
    }

    values.push(taskId);
    const { rows: updatedRows } = await pool.query(
      `UPDATE lead_tasks
       SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    if (!updatedRows.length) {
      return res.status(404).json({ message: 'Task no encontrada.' });
    }

    const updated = updatedRows[0];

    if (cleanText(updated.task_type, 40).toLowerCase() === 'callback' && Number(updated.related_lead_id || 0) > 0) {
      const callbackDate = normalizeDateOnlyForApi(updated.due_date);
      const callbackCompletedAt = cleanText(updated.status, 20).toLowerCase() === 'completed'
        ? normalizeTimestampForApi(updated.completed_at) || new Date().toISOString()
        : null;
      await pool.query(
        `UPDATE leads
         SET callback_date = $2::date,
             callback_completed_at = $3::timestamptz,
             assigned_to = COALESCE($4, assigned_to),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [updated.related_lead_id, callbackDate, callbackCompletedAt, cleanText(updated.owner_username, 120) || null]
      );
    }

    await writeAuditLog({
      req,
      action: 'task.update',
      entityType: 'task',
      entityId: updated.id,
      before: current,
      after: updated,
      metadata: {
        changedFields
      }
    });

    const { rows: withLeadRows } = await pool.query(
      `SELECT t.*, l.case_id AS lead_case_id, l.full_name AS lead_full_name
       FROM lead_tasks t
       LEFT JOIN leads l ON l.id = t.related_lead_id
       WHERE t.id = $1
       LIMIT 1`,
      [updated.id]
    );

    return res.json({
      task: mapLeadTaskRow(withLeadRows[0] || updated),
      message: 'Task actualizada correctamente.'
    });
  } catch (error) {
    console.error('Error al actualizar task:', error);
    return res.status(500).json({ message: 'Error al actualizar task.' });
  }
});

app.patch('/api/tasks/:id/complete', async (req, res) => {
  const taskId = parsePositiveInteger(req.params.id);
  if (!taskId) {
    return res.status(400).json({ message: 'taskId invalido.' });
  }

  await hydrateAuthPermissions(req);
  if (!hasAuthPermission(req.auth, 'tasks.manage')) {
    return res.status(403).json({ message: 'No tienes permisos para completar tareas.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: taskRows } = await client.query(
      `SELECT *
       FROM lead_tasks
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [taskId]
    );
    if (!taskRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Task no encontrada.' });
    }

    const task = taskRows[0];
    if (!canAccessTaskByOwner(req.auth, task.owner_username)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'No tienes permisos para completar esta task.' });
    }

    if (task.completed_at || cleanText(task.status, 20).toLowerCase() === 'completed') {
      await client.query('ROLLBACK');
      const { rows: existingRows } = await pool.query(
        `SELECT t.*, l.case_id AS lead_case_id, l.full_name AS lead_full_name
         FROM lead_tasks t
         LEFT JOIN leads l ON l.id = t.related_lead_id
         WHERE t.id = $1
         LIMIT 1`,
        [taskId]
      );
      return res.json({
        ok: true,
        alreadyCompleted: true,
        task: mapLeadTaskRow(existingRows[0] || task),
        message: 'La task ya estaba completada.'
      });
    }

    const completedAt = new Date().toISOString();
    const { rows: updatedRows } = await client.query(
      `UPDATE lead_tasks
       SET status = 'completed',
           completed_at = $2::timestamptz,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [taskId, completedAt]
    );
    const updated = updatedRows[0];

    let recurringTask = null;
    const recurrenceRule = cleanText(updated.recurrence_rule, 20).toLowerCase();
    if (recurrenceRule && recurrenceRule !== 'none') {
      recurringTask = await createNextRecurringTask(updated, { req, client });
    }

    if (cleanText(updated.task_type, 40).toLowerCase() === 'callback' && Number(updated.related_lead_id || 0) > 0) {
      await client.query(
        `UPDATE leads
         SET callback_completed_at = COALESCE(callback_completed_at, $2::timestamptz),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [updated.related_lead_id, completedAt]
      );
    }

    await writeAuditLog({
      req,
      action: 'task.complete',
      entityType: 'task',
      entityId: updated.id,
      before: task,
      after: updated,
      metadata: {
        recurringTaskId: recurringTask ? Number(recurringTask.id || 0) || null : null
      },
      client
    });

    await client.query('COMMIT');

    const withLeadRows = await pool.query(
      `SELECT t.*, l.case_id AS lead_case_id, l.full_name AS lead_full_name
       FROM lead_tasks t
       LEFT JOIN leads l ON l.id = t.related_lead_id
       WHERE t.id = $1
       LIMIT 1`,
      [updated.id]
    );

    let recurringWithLead = null;
    if (recurringTask?.id) {
      const recurringRows = await pool.query(
        `SELECT t.*, l.case_id AS lead_case_id, l.full_name AS lead_full_name
         FROM lead_tasks t
         LEFT JOIN leads l ON l.id = t.related_lead_id
         WHERE t.id = $1
         LIMIT 1`,
        [recurringTask.id]
      );
      recurringWithLead = recurringRows.rows[0] || recurringTask;
    }

    return res.json({
      ok: true,
      task: mapLeadTaskRow(withLeadRows.rows[0] || updated),
      recurringTask: recurringWithLead ? mapLeadTaskRow(recurringWithLead) : null,
      message: 'Task completada correctamente.'
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // ignore rollback secondary errors
    }
    console.error('Error al completar task:', error);
    return res.status(500).json({ message: 'Error al completar task.' });
  } finally {
    client.release();
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  const taskId = parsePositiveInteger(req.params.id);
  if (!taskId) {
    return res.status(400).json({ message: 'taskId invalido.' });
  }

  await hydrateAuthPermissions(req);
  if (!hasAuthPermission(req.auth, 'tasks.manage')) {
    return res.status(403).json({ message: 'No tienes permisos para eliminar tareas.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: taskRows } = await client.query(
      `SELECT *
       FROM lead_tasks
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [taskId]
    );
    if (!taskRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Task no encontrada.' });
    }

    const task = taskRows[0];
    if (!canAccessTaskByOwner(req.auth, task.owner_username)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'No tienes permisos para eliminar esta task.' });
    }

    await client.query(
      `DELETE FROM lead_tasks
       WHERE id = $1`,
      [taskId]
    );

    const isCallbackTask = cleanText(task.task_type, 40).toLowerCase() === 'callback';
    const relatedLeadId = Number(task.related_lead_id || 0) || null;
    const callbackDate = normalizeDateOnlyForApi(task.due_date);
    if (isCallbackTask && relatedLeadId && callbackDate) {
      await client.query(
        `UPDATE leads
         SET callback_date = NULL,
             callback_completed_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND callback_date = $2::date`,
        [relatedLeadId, callbackDate]
      );
    }

    await writeAuditLog({
      req,
      action: 'task.delete',
      entityType: 'task',
      entityId: taskId,
      before: task,
      after: null,
      metadata: {
        taskType: cleanText(task.task_type, 40).toLowerCase() || null,
        ownerUsername: cleanText(task.owner_username, 120) || null,
        relatedLeadId
      },
      client
    });

    await client.query('COMMIT');
    return res.json({
      ok: true,
      deletedId: taskId,
      message: 'Task eliminada correctamente.'
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // ignore rollback secondary errors
    }
    console.error('Error al eliminar task:', error);
    return res.status(500).json({ message: 'Error al eliminar task.' });
  } finally {
    client.release();
  }
});

app.post('/api/tasks/escalation/run', async (req, res) => {
  await hydrateAuthPermissions(req);
  if (!hasAuthPermission(req.auth, 'callbacks.view_all')) {
    return res.status(403).json({ message: 'No tienes permisos para ejecutar escalamiento global.' });
  }

  const limit = parsePositiveInt(req.body?.limit || req.query.limit, 200, 1, 500);
  const result = await runTaskEscalationSweep({ limit });
  if (!result.ok) {
    return res.status(500).json({ message: 'No se pudo ejecutar escalamiento automatico.' });
  }
  return res.json({
    ok: true,
    escalated: Number(result.escalated || 0),
    skipped: Boolean(result.skipped)
  });
});

app.get('/api/callbacks', async (req, res) => {
  const fromDateRaw = cleanText(req.query.from, 16);
  const fromDate = fromDateRaw || new Date().toISOString().slice(0, 10);

  if (!isValidISODate(fromDate)) {
    return res.status(400).json({ message: 'Parametro from invalido. Usa YYYY-MM-DD.' });
  }

  try {
    await hydrateAuthPermissions(req);
    const canViewAllCallbacks = hasAuthPermission(req.auth, 'callbacks.view_all');
    let rows = [];
    if (canViewAllCallbacks) {
      ({ rows } = await pool.query(
        `SELECT
           id AS lead_id,
           case_id,
           full_name,
           callback_date,
           callback_completed_at,
           assigned_to
         FROM leads
         WHERE callback_date IS NOT NULL
           AND callback_date >= $1::date
         ORDER BY callback_date ASC, case_id ASC NULLS LAST, id ASC
         LIMIT 500`,
        [fromDate]
      ));
    } else {
      const identities = getAuthIdentities(req.auth);
      if (!identities.length) {
        return res.status(403).json({ message: 'No autorizado para ver callbacks.' });
      }

      ({ rows } = await pool.query(
        `SELECT
           id AS lead_id,
           case_id,
           full_name,
           callback_date,
           callback_completed_at,
           assigned_to
         FROM leads
         WHERE callback_date IS NOT NULL
           AND callback_date >= $1::date
           AND lower(coalesce(assigned_to, '')) = ANY($2::text[])
         ORDER BY callback_date ASC, case_id ASC NULLS LAST, id ASC
         LIMIT 500`,
        [fromDate, identities]
      ));
    }

    const normalizeCallbackDateForApi = (value) => {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
      }
      const raw = String(value || '').trim();
      const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
      return match ? match[1] : null;
    };

    const normalizeTimestampForApi = (value) => {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString();
      }
      const raw = String(value || '').trim();
      if (!raw) return null;
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    };

    const callbacks = rows.map((row) => ({
      leadId: Number(row.lead_id),
      caseId: row.case_id,
      name: cleanText(row.full_name, 120) || `Lead #${row.lead_id}`,
      callbackDate: normalizeCallbackDateForApi(row.callback_date),
      callbackCompletedAt: normalizeTimestampForApi(row.callback_completed_at),
      assignedTo: cleanText(row.assigned_to, 120) || null
    })).filter((item) => Boolean(item.callbackDate));

    return res.json({ callbacks });
  } catch (error) {
    console.error('Error al obtener callbacks:', error);
    return res.status(500).json({ message: 'Error al obtener callbacks.' });
  }
});

app.patch('/api/callbacks/:leadId/complete', async (req, res) => {
  const leadId = Number(req.params.leadId);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({ message: 'leadId invalido.' });
  }

  try {
    await hydrateAuthPermissions(req);
    if (!hasAuthPermission(req.auth, 'callbacks.complete_assigned')) {
      return res.status(403).json({ message: 'No tienes permisos para completar callbacks.' });
    }

    const { rows: leadRows } = await pool.query(
      `SELECT id,
              callback_date::date AS callback_date,
              callback_completed_at,
              assigned_to,
              CURRENT_DATE::date AS server_today
       FROM leads
       WHERE id = $1
       LIMIT 1`,
      [leadId]
    );

    if (leadRows.length === 0) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    const lead = leadRows[0];
    if (!hasAuthPermission(req.auth, 'callbacks.view_all')) {
      const identities = getAuthIdentities(req.auth);
      const assignedTo = cleanText(lead.assigned_to, 120).toLowerCase();
      if (!assignedTo || !identities.includes(assignedTo)) {
        return res.status(403).json({ message: 'No tienes permisos para completar esta task.' });
      }
    }

    const callbackDate = lead.callback_date ? String(lead.callback_date).slice(0, 10) : '';
    const serverToday = lead.server_today ? String(lead.server_today).slice(0, 10) : '';

    if (!callbackDate) {
      return res.status(400).json({ message: 'Este lead no tiene task de callback.' });
    }

    if (lead.callback_completed_at) {
      return res.json({
        ok: true,
        alreadyCompleted: true,
        message: 'La task ya estaba completada.'
      });
    }

    if (callbackDate !== serverToday) {
      return res.status(400).json({
        message: `Solo puedes completar esta task el dia programado (${callbackDate}).`
      });
    }

    const { rows: updatedRows } = await pool.query(
      `UPDATE leads
       SET callback_completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND callback_date = CURRENT_DATE
         AND callback_completed_at IS NULL
       RETURNING ${LEAD_SELECT_COLUMNS}`,
      [leadId]
    );

    if (!updatedRows.length) {
      return res.status(409).json({
        message: 'No se pudo completar la task. Intenta recargar e intentar de nuevo.'
      });
    }

    const updatedLead = updatedRows[0];
    applyLeadDerivedFields(updatedLead);

    await markCallbackTaskCompletedByLeadId(updatedLead.id, updatedLead.callback_completed_at, pool).catch((error) => {
      console.error('Error sincronizando callback task completada:', error);
    });

    await writeAuditLog({
      req,
      action: 'callback.complete',
      entityType: 'lead',
      entityId: updatedLead.id,
      before: lead,
      after: updatedLead,
      metadata: {
        callbackDate,
        completedAt: updatedLead.callback_completed_at || null
      }
    });

    applyLeadDerivedFields(updatedLead);
    return res.json({
      ok: true,
      lead: updatedLead,
      message: 'Task marcada como completada.'
    });
  } catch (error) {
    console.error('Error al completar callback task:', error);
    return res.status(500).json({ message: 'Error al completar callback task.' });
  }
});

app.delete('/api/leads/:id', async (req, res) => {
  const leadId = Number(req.params.id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({ message: 'ID de lead invalido.' });
  }

  await hydrateAuthPermissions(req);
  if (!hasAuthPermission(req.auth, 'leads.delete')) {
    return res.status(403).json({ message: 'No tienes permisos para eliminar leads.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: beforeRows } = await client.query(
      `SELECT ${LEAD_SELECT_COLUMNS}
       FROM leads
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [leadId]
    );

    if (beforeRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    const beforeLead = beforeRows[0];
    await client.query(
      `DELETE FROM leads
       WHERE id = $1`,
      [leadId]
    );

    const { rowCount: deletedTaskCount } = await client.query(
      `DELETE FROM lead_tasks
       WHERE related_lead_id = $1`,
      [leadId]
    );

    const { rowCount: clearedRelatedLeadCount } = await client.query(
      `UPDATE leads
       SET related_lead_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE related_lead_id = $1`,
      [leadId]
    );

    await writeAuditLog({
      req,
      action: 'lead.delete',
      entityType: 'lead',
      entityId: leadId,
      before: beforeLead,
      after: null,
      metadata: { clearedRelatedLeadCount, deletedTaskCount },
      client
    });

    await client.query('COMMIT');
    res.json({ message: 'Lead eliminado correctamente.' });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // ignore rollback secondary errors
    }
    console.error('Error al eliminar lead:', error);
    res.status(500).json({ message: 'Error al eliminar lead.' });
  } finally {
    client.release();
  }
});

// ============================================
// ENDPOINT: HARDSHIP AI ASSIST
// ============================================

app.post('/api/hardship/assist', async (req, res) => {
  const operation = cleanText(req.body?.operation, 20).toLowerCase();
  if (!['translate', 'enhance'].includes(operation)) {
    return res.status(400).json({ message: 'operation debe ser translate o enhance.' });
  }

  const hardshipReasonLabel = resolveHardshipReasonLabel(
    req.body?.hardshipReason,
    req.body?.hardshipReasonLabel
  );

  try {
    if (operation === 'translate') {
      const sourceLang = normalizeHardshipSourceLang(req.body?.sourceLang);
      if (!sourceLang) {
        return res.status(400).json({ message: 'sourceLang debe ser es o en.' });
      }

      const translatedText = await translateHardshipNarrative({
        sourceLang,
        text: req.body?.text,
        hardshipReasonLabel
      });

      return res.json({
        operation: 'translate',
        sourceLang,
        targetLang: sourceLang === 'es' ? 'en' : 'es',
        ...translatedText
      });
    }

    const enhanced = await enhanceHardshipNarrativeWithGemini({
      spanishText: req.body?.spanishText,
      englishText: req.body?.englishText,
      hardshipReasonLabel
    });

    return res.json({
      operation: 'enhance',
      spanishText: enhanced.spanishText,
      englishText: enhanced.englishText,
      source: 'gemini'
    });
  } catch (error) {
    if (error.code === 'AI_BAD_REQUEST') {
      return res.status(400).json({ message: error.message || 'Solicitud de hardship invalida.' });
    }
    if (error.code === 'AI_NOT_CONFIGURED') {
      return res.status(503).json({ message: 'IA no configurada: falta GEMINI_API_KEY.' });
    }
    if (error.code === 'AI_TIMEOUT') {
      return res.status(504).json({ message: error.message || 'Tiempo de espera agotado en hardship AI.' });
    }
    if (error.code === 'AI_RATE_LIMIT' || error.httpStatus === 429) {
      return res.status(429).json({ message: 'Limite de peticiones alcanzado. Intenta de nuevo en unos segundos.' });
    }

    console.error('Error en hardship AI assist:', error);
    return res.status(500).json({ message: error.message || 'Error procesando hardship AI.' });
  }
});

// ============================================
// ENDPOINT: AI CREDIT REPORT ANALYZER
// ============================================

app.post('/api/creditors/analyze-report', async (req, res) => {
  const sourceReport = toNullableText(req.body?.sourceReport || req.body?.sourceName, 180) || 'Reporte';
  const reportText = String(req.body?.text || '');

  if (reportText.trim().length < 80) {
    return res.status(400).json({ message: 'El texto del reporte es insuficiente para analisis.' });
  }

  try {
    const creditors = await analyzeCreditReportWithGemini({
      text: reportText,
      sourceReport
    });

    return res.json({
      creditors,
      count: creditors.length,
      source: 'gemini'
    });
  } catch (error) {
    if (error.code === 'AI_NOT_CONFIGURED') {
      return res.status(503).json({ message: 'IA no configurada: falta GEMINI_API_KEY.' });
    }
    if (error.code === 'AI_TIMEOUT') {
      return res.status(504).json({ message: error.message || 'Tiempo de espera agotado en analisis IA.' });
    }
    if (error.code === 'AI_RATE_LIMIT' || error.httpStatus === 429) {
      return res.status(429).json({ message: 'Limite de peticiones alcanzado. Intenta de nuevo en unos segundos.' });
    }

    console.error('Error analizando reporte de credito con IA:', error);
    return res.status(500).json({ message: error.message || 'Error analizando reporte con IA.' });
  }
});

// ============================================
// ENDPOINTS: CREDITORS
// ============================================

app.get('/api/leads/:id/creditors', async (req, res) => {
  const leadId = parsePositiveInteger(req.params.id);
  if (!leadId) {
    return res.status(400).json({ message: 'ID de lead invalido.' });
  }

  try {
    const leadExists = await ensureLeadExists(leadId);
    if (!leadExists) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    const { rows } = await pool.query(
      `SELECT
         id, lead_id, source_report, creditor_name, original_creditor, account_number,
         date_last_payment, account_status, account_type, debtor_party, responsibility, months_reviewed,
         monthly_payment, balance, past_due, unpaid_balance,
         credit_limit, high_credit, debt_amount, is_included, notes, raw_snapshot,
         created_at, updated_at
       FROM lead_creditors
       WHERE lead_id = $1
       ORDER BY created_at DESC, id DESC`,
      [leadId]
    );

    const summary = await getLeadCreditorsSummary(leadId);
    return res.json({ creditors: rows.map(mapCreditorRow), summary });
  } catch (error) {
    console.error('Error al obtener creditors:', error);
    return res.status(500).json({ message: 'Error al obtener creditors.' });
  }
});

app.post('/api/leads/:id/creditors', async (req, res) => {
  const leadId = parsePositiveInteger(req.params.id);
  if (!leadId) {
    return res.status(400).json({ message: 'ID de lead invalido.' });
  }

  const normalizedCreditor = normalizeCreditorPayload(req.body || {});
  if (!normalizedCreditor.ok) {
    return res.status(400).json({ message: normalizedCreditor.message });
  }

  try {
    const leadExists = await ensureLeadExists(leadId);
    if (!leadExists) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    const payload = normalizedCreditor.value;
    const { rows } = await pool.query(
      `INSERT INTO lead_creditors (
         lead_id, source_report, creditor_name, original_creditor, account_number,
         date_last_payment, account_status, account_type, debtor_party, responsibility, months_reviewed,
         monthly_payment, balance, past_due, unpaid_balance,
         credit_limit, high_credit, debt_amount, is_included, notes, raw_snapshot
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15,
         $16, $17, $18, $19, $20, $21
       )
       RETURNING
         id, lead_id, source_report, creditor_name, original_creditor, account_number,
         date_last_payment, account_status, account_type, debtor_party, responsibility, months_reviewed,
         monthly_payment, balance, past_due, unpaid_balance,
         credit_limit, high_credit, debt_amount, is_included, notes, raw_snapshot,
         created_at, updated_at`,
      [
        leadId,
        payload.source_report,
        payload.creditor_name,
        payload.original_creditor,
        payload.account_number,
        payload.date_last_payment,
        payload.account_status,
        payload.account_type,
        payload.debtor_party,
        payload.responsibility,
        payload.months_reviewed,
        payload.monthly_payment,
        payload.balance,
        payload.past_due,
        payload.unpaid_balance,
        payload.credit_limit,
        payload.high_credit,
        payload.debt_amount,
        payload.is_included,
        payload.notes,
        payload.raw_snapshot
      ]
    );

    const summary = await getLeadCreditorsSummary(leadId);
    return res.status(201).json({
      creditor: mapCreditorRow(rows[0]),
      summary,
      message: 'Creditor agregado correctamente.'
    });
  } catch (error) {
    console.error('Error al crear creditor:', error);
    return res.status(500).json({ message: 'Error al crear creditor.' });
  }
});

app.post('/api/leads/:id/creditors/import', async (req, res) => {
  const leadId = parsePositiveInteger(req.params.id);
  if (!leadId) {
    return res.status(400).json({ message: 'ID de lead invalido.' });
  }

  const entries = Array.isArray(req.body?.entries) ? req.body.entries : null;
  if (!entries || entries.length === 0) {
    return res.status(400).json({ message: 'entries debe contener al menos un registro.' });
  }
  if (entries.length > 500) {
    return res.status(400).json({ message: 'entries excede el maximo permitido (500).' });
  }

  const replaceExisting = req.body?.replaceExisting === true;
  const normalizedEntries = [];

  for (let index = 0; index < entries.length; index += 1) {
    const normalized = normalizeCreditorPayload(entries[index] || {});
    if (!normalized.ok) {
      return res.status(400).json({ message: `Registro ${index + 1}: ${normalized.message}` });
    }
    normalizedEntries.push(normalized.value);
  }

  try {
    const leadExists = await ensureLeadExists(leadId);
    if (!leadExists) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    await pool.query('BEGIN');

    if (replaceExisting) {
      await pool.query('DELETE FROM lead_creditors WHERE lead_id = $1', [leadId]);
    }

    const existingEntries = [];
    if (!replaceExisting) {
      const { rows: existingRows } = await pool.query(
        `SELECT id, creditor_name, account_number, account_status, account_type, responsibility, months_reviewed,
                debt_amount, past_due, debtor_party, date_last_payment
         FROM lead_creditors
         WHERE lead_id = $1`,
        [leadId]
      );
      existingRows.forEach((row) => existingEntries.push(row));
    }

    const insertedRows = [];
    let skippedCount = 0;
    const sortedEntries = [...normalizedEntries].sort((a, b) => (
      getAccountQualityScore(b.account_number) - getAccountQualityScore(a.account_number)
    ));

    for (const entry of sortedEntries) {
      const duplicate = existingEntries.find((existing) => isLikelyDuplicateCreditorEntry(entry, existing));
      if (duplicate) {
        const preferredAccount = choosePreferredAccountNumber(duplicate.account_number, entry.account_number);
        const updateFields = [];
        const updateValues = [];

        if (preferredAccount && preferredAccount !== duplicate.account_number) {
          updateFields.push(`account_number = $${updateValues.length + 1}`);
          updateValues.push(preferredAccount);
          duplicate.account_number = preferredAccount;
        }

        const existingDebt = parseDbMoney(duplicate.debt_amount);
        const incomingDebt = parseDbMoney(entry.debt_amount);
        const incomingPastDue = parseDbMoney(entry.past_due);
        const incomingRank = Number(entry.debt_source_rank || 0);
        const debtLooksCurrent = incomingDebt > 0 && incomingPastDue > 0 && Math.abs(incomingDebt - incomingPastDue) <= 0.01;
        const debtGap = Math.abs(incomingDebt - existingDebt);
        const debtRatio = (incomingDebt > 0 && existingDebt > 0)
          ? (Math.max(incomingDebt, existingDebt) / Math.max(1, Math.min(incomingDebt, existingDebt)))
          : Infinity;
        const highConfidenceReparse = incomingRank >= 3 && debtGap >= 50 && debtRatio >= 1.25;
        const shouldReplaceDebt =
          incomingDebt > 0 &&
          (
            existingDebt <= 0 ||
            (debtLooksCurrent && incomingDebt < existingDebt) ||
            highConfidenceReparse
          );

        if (shouldReplaceDebt) {
          updateFields.push(`debt_amount = $${updateValues.length + 1}`);
          updateValues.push(incomingDebt);
          duplicate.debt_amount = incomingDebt;

          if (incomingPastDue > 0) {
            updateFields.push(`past_due = $${updateValues.length + 1}`);
            updateValues.push(incomingPastDue);
          }
        }

        // Actualizar credit_limit y high_credit si el incoming tiene valores y el existente no
        const incomingCreditLimit = parseDbMoney(entry.credit_limit);
        if (incomingCreditLimit > 0) {
          updateFields.push(`credit_limit = $${updateValues.length + 1}`);
          updateValues.push(incomingCreditLimit);
        }
        const incomingHighCredit = parseDbMoney(entry.high_credit);
        if (incomingHighCredit > 0) {
          updateFields.push(`high_credit = $${updateValues.length + 1}`);
          updateValues.push(incomingHighCredit);
        }

        const incomingAccountType = cleanAccountType(entry.account_type);
        const existingAccountType = cleanAccountType(duplicate.account_type);
        if (incomingAccountType && !existingAccountType) {
          updateFields.push(`account_type = $${updateValues.length + 1}`);
          updateValues.push(incomingAccountType);
          duplicate.account_type = incomingAccountType;
        }

        const incomingResponsibility = normalizeResponsibility(entry.responsibility).value;
        const existingResponsibility = normalizeResponsibility(duplicate.responsibility).value;
        if (incomingResponsibility && !existingResponsibility) {
          updateFields.push(`responsibility = $${updateValues.length + 1}`);
          updateValues.push(incomingResponsibility);
          duplicate.responsibility = incomingResponsibility;
        }

        const incomingStatusRaw = cleanAccountStatus(entry.account_status);
        const incomingStatus =
          (incomingAccountType === 'Collection' || existingAccountType === 'Collection')
            ? 'Closed'
            : incomingStatusRaw;
        const existingStatusRaw = String(duplicate.account_status || '').trim();
        const existingStatus = cleanAccountStatus(existingStatusRaw);
        const incomingLifecycleStatus = normalizeLifecycleAccountStatus(incomingStatus);
        const existingLifecycleStatus = normalizeLifecycleAccountStatus(existingStatus);
        const incomingLifecyclePriority = getLifecycleStatusPriority(incomingStatus);
        const existingLifecyclePriority = getLifecycleStatusPriority(existingStatus);
        const existingStatusLooksCorrupted = /current\s*rating|type|responsibility/i.test(existingStatusRaw) || existingStatusRaw.length > 30;
        const shouldReplaceWithLifecycleStatus =
          incomingLifecycleStatus &&
          (
            !existingLifecycleStatus ||
            existingStatus === 'Collection' ||
            existingStatus === 'Charge Off' ||
            existingStatusLooksCorrupted ||
            incomingLifecyclePriority > existingLifecyclePriority
          );

        if (incomingStatus && (shouldReplaceWithLifecycleStatus || !existingStatus || existingStatusLooksCorrupted)) {
          updateFields.push(`account_status = $${updateValues.length + 1}`);
          const nextStatus = shouldReplaceWithLifecycleStatus ? incomingLifecycleStatus : incomingStatus;
          updateValues.push(nextStatus);
          duplicate.account_status = nextStatus;
        }

        const incomingMonths = Number.isInteger(entry.months_reviewed) ? entry.months_reviewed : null;
        const existingMonths = Number.isInteger(duplicate.months_reviewed) ? duplicate.months_reviewed : null;
        if (incomingMonths !== null && (existingMonths === null || incomingMonths < existingMonths)) {
          updateFields.push(`months_reviewed = $${updateValues.length + 1}`);
          updateValues.push(incomingMonths);
          duplicate.months_reviewed = incomingMonths;
        }

        const normalizedLastPayment = normalizeLastPaymentDateText(entry.date_last_payment).value;
        const existingLastPayment = normalizeLastPaymentDateText(duplicate.date_last_payment).value;
        if (normalizedLastPayment && (!existingLastPayment || existingLastPayment !== normalizedLastPayment)) {
          updateFields.push(`date_last_payment = $${updateValues.length + 1}`);
          updateValues.push(normalizedLastPayment);
          duplicate.date_last_payment = normalizedLastPayment;
        }

        if (duplicate.id && updateFields.length > 0) {
          updateFields.push('updated_at = CURRENT_TIMESTAMP');
          updateValues.push(duplicate.id);
          await pool.query(
            `UPDATE lead_creditors
             SET ${updateFields.join(', ')}
             WHERE id = $${updateValues.length}`,
            updateValues
          );
        }
        skippedCount += 1;
        continue;
      }

      const { rows } = await pool.query(
        `INSERT INTO lead_creditors (
           lead_id, source_report, creditor_name, original_creditor, account_number,
           date_last_payment, account_status, account_type, debtor_party, responsibility, months_reviewed,
           monthly_payment, balance, past_due, unpaid_balance,
           credit_limit, high_credit, debt_amount, is_included, notes, raw_snapshot
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9, $10, $11,
           $12, $13, $14, $15,
           $16, $17, $18, $19, $20, $21
         )
         RETURNING
           id, lead_id, source_report, creditor_name, original_creditor, account_number,
           date_last_payment, account_status, account_type, debtor_party, responsibility, months_reviewed,
           monthly_payment, balance, past_due, unpaid_balance,
           credit_limit, high_credit, debt_amount, is_included, notes, raw_snapshot,
           created_at, updated_at`,
        [
          leadId,
          entry.source_report,
          entry.creditor_name,
          entry.original_creditor,
          entry.account_number,
          entry.date_last_payment,
          entry.account_status,
          entry.account_type,
          entry.debtor_party,
          entry.responsibility,
          entry.months_reviewed,
          entry.monthly_payment,
          entry.balance,
          entry.past_due,
          entry.unpaid_balance,
          entry.credit_limit,
          entry.high_credit,
          entry.debt_amount,
          entry.is_included,
          entry.notes,
          entry.raw_snapshot
        ]
      );

      insertedRows.push(rows[0]);
      existingEntries.push(rows[0]);
    }

    await pool.query('COMMIT');
    const summary = await getLeadCreditorsSummary(leadId);

    return res.status(201).json({
      created: insertedRows.map(mapCreditorRow),
      createdCount: insertedRows.length,
      skippedCount,
      summary,
      message: 'Importacion de creditors completada.'
    });
  } catch (error) {
    try {
      await pool.query('ROLLBACK');
    } catch (_rollbackError) {
      // ignore rollback secondary errors
    }
    console.error('Error al importar creditors:', error);
    return res.status(500).json({ message: 'Error al importar creditors.' });
  }
});

app.patch('/api/leads/:id/creditors/:creditorId', async (req, res) => {
  const leadId = parsePositiveInteger(req.params.id);
  const creditorId = parsePositiveInteger(req.params.creditorId);
  if (!leadId || !creditorId) {
    return res.status(400).json({ message: 'ID invalido.' });
  }

  try {
    const { rows: existingRows } = await pool.query(
      `SELECT
         id, lead_id, source_report, creditor_name, original_creditor, account_number,
         date_last_payment, account_status, account_type, debtor_party, monthly_payment, balance, past_due, unpaid_balance,
         credit_limit, high_credit, debt_amount, is_included, notes, raw_snapshot
       FROM lead_creditors
       WHERE id = $1 AND lead_id = $2
       LIMIT 1`,
      [creditorId, leadId]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ message: 'Creditor no encontrado para este lead.' });
    }

    const existing = mapCreditorRow(existingRows[0]);
    const body = req.body || {};
    const updates = [];
    const values = [];

    function pushUpdate(column, value) {
      updates.push(`${column} = $${updates.length + 1}`);
      values.push(value);
    }

    const textFieldMappings = [
      { keys: ['sourceReport', 'source_report'], column: 'source_report', maxLength: 180 },
      { keys: ['creditorName', 'creditor_name'], column: 'creditor_name', maxLength: 180 },
      { keys: ['originalCreditor', 'original_creditor'], column: 'original_creditor', maxLength: 180 },
      { keys: ['accountNumber', 'account_number'], column: 'account_number', maxLength: 80 },
      { keys: ['accountStatus', 'account_status'], column: 'account_status', maxLength: 80 },
      { keys: ['accountType', 'account_type'], column: 'account_type', maxLength: 80 },
      { keys: ['responsibility'], column: 'responsibility', maxLength: 60 },
      { keys: ['notes'], column: 'notes', maxLength: 3000 },
      { keys: ['rawSnapshot', 'raw_snapshot'], column: 'raw_snapshot', maxLength: 12000 }
    ];

    for (const mapping of textFieldMappings) {
      const rawValue = pickFirstDefined(body, mapping.keys);
      if (rawValue !== undefined) {
        const normalizedValue = toNullableText(rawValue, mapping.maxLength);
        if (mapping.column === 'creditor_name' && !normalizedValue) {
          return res.status(400).json({ message: 'creditorName no puede estar vacio.' });
        }
        pushUpdate(mapping.column, normalizedValue);
      }
    }

    const dateLastPaymentInput = normalizeOptionalLastPaymentDateText(
      pickFirstDefined(body, ['dateLastPayment', 'date_last_payment', 'lastPaymentDate', 'last_payment_date'])
    );
    if (!dateLastPaymentInput.ok) {
      return res.status(400).json({ message: dateLastPaymentInput.message });
    }
    if (dateLastPaymentInput.provided) {
      pushUpdate('date_last_payment', dateLastPaymentInput.value);
    }

    const debtorPartyRaw = pickFirstDefined(body, ['debtorParty', 'debtor_party']);
    if (debtorPartyRaw !== undefined) {
      const debtorParty = normalizeDebtorParty(debtorPartyRaw);
      if (!debtorParty.ok) return res.status(400).json({ message: debtorParty.message });
      pushUpdate('debtor_party', debtorParty.value);
    }

    const nextAmounts = {
      balance: existing.balance,
      past_due: existing.past_due,
      unpaid_balance: existing.unpaid_balance
    };
    let amountFieldUpdated = false;

    const monthlyPayment = normalizeOptionalMoney(pickFirstDefined(body, ['monthlyPayment', 'monthly_payment']), 'monthlyPayment');
    if (!monthlyPayment.ok) return res.status(400).json({ message: monthlyPayment.message });
    if (monthlyPayment.provided) pushUpdate('monthly_payment', monthlyPayment.value);

    const balance = normalizeOptionalMoney(pickFirstDefined(body, ['balance']), 'balance');
    if (!balance.ok) return res.status(400).json({ message: balance.message });
    if (balance.provided) {
      nextAmounts.balance = balance.value;
      amountFieldUpdated = true;
      pushUpdate('balance', balance.value);
    }

    const pastDue = normalizeOptionalMoney(pickFirstDefined(body, ['pastDue', 'past_due']), 'pastDue');
    if (!pastDue.ok) return res.status(400).json({ message: pastDue.message });
    if (pastDue.provided) {
      nextAmounts.past_due = pastDue.value;
      amountFieldUpdated = true;
      pushUpdate('past_due', pastDue.value);
    }

    const unpaidBalance = normalizeOptionalMoney(pickFirstDefined(body, ['unpaidBalance', 'unpaid_balance']), 'unpaidBalance');
    if (!unpaidBalance.ok) return res.status(400).json({ message: unpaidBalance.message });
    if (unpaidBalance.provided) {
      nextAmounts.unpaid_balance = unpaidBalance.value;
      amountFieldUpdated = true;
      pushUpdate('unpaid_balance', unpaidBalance.value);
    }

    const creditLimit = normalizeOptionalMoney(pickFirstDefined(body, ['creditLimit', 'credit_limit']), 'creditLimit');
    if (!creditLimit.ok) return res.status(400).json({ message: creditLimit.message });
    if (creditLimit.provided) pushUpdate('credit_limit', creditLimit.value);

    const highCredit = normalizeOptionalMoney(pickFirstDefined(body, ['highCredit', 'high_credit']), 'highCredit');
    if (!highCredit.ok) return res.status(400).json({ message: highCredit.message });
    if (highCredit.provided) pushUpdate('high_credit', highCredit.value);

    const isIncluded = normalizeOptionalBoolean(pickFirstDefined(body, ['isIncluded', 'is_included']), 'isIncluded');
    if (!isIncluded.ok) return res.status(400).json({ message: isIncluded.message });
    if (isIncluded.provided) pushUpdate('is_included', isIncluded.value);
    
    const monthsReviewed = normalizeMonthsReviewed(pickFirstDefined(body, ['monthsReviewed', 'months_reviewed']));
    if (!monthsReviewed.ok) return res.status(400).json({ message: monthsReviewed.message });
    if (monthsReviewed.provided) pushUpdate('months_reviewed', monthsReviewed.value);

    const debtAmount = normalizeOptionalMoney(pickFirstDefined(body, ['debtAmount', 'debt_amount']), 'debtAmount');
    if (!debtAmount.ok) return res.status(400).json({ message: debtAmount.message });

    if (debtAmount.provided) {
      pushUpdate('debt_amount', debtAmount.value);
    } else if (amountFieldUpdated) {
      const computedDebtAmount = computeCreditorDebtAmount({
        unpaidBalance: nextAmounts.unpaid_balance,
        pastDue: nextAmounts.past_due,
        balance: nextAmounts.balance
      });
      pushUpdate('debt_amount', computedDebtAmount);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No hay campos para actualizar.' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(creditorId);
    values.push(leadId);

    const { rows } = await pool.query(
      `UPDATE lead_creditors
       SET ${updates.join(', ')}
       WHERE id = $${values.length - 1} AND lead_id = $${values.length}
       RETURNING
         id, lead_id, source_report, creditor_name, original_creditor, account_number,
         date_last_payment, account_status, account_type, debtor_party, responsibility, months_reviewed,
         monthly_payment, balance, past_due, unpaid_balance,
         credit_limit, high_credit, debt_amount, is_included, notes, raw_snapshot,
         created_at, updated_at`,
      values
    );

    const summary = await getLeadCreditorsSummary(leadId);
    return res.json({
      creditor: mapCreditorRow(rows[0]),
      summary,
      message: 'Creditor actualizado correctamente.'
    });
  } catch (error) {
    console.error('Error al actualizar creditor:', error);
    return res.status(500).json({ message: 'Error al actualizar creditor.' });
  }
});

app.delete('/api/leads/:id/creditors/:creditorId', async (req, res) => {
  const leadId = parsePositiveInteger(req.params.id);
  const creditorId = parsePositiveInteger(req.params.creditorId);
  if (!leadId || !creditorId) {
    return res.status(400).json({ message: 'ID invalido.' });
  }

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM lead_creditors
       WHERE id = $1 AND lead_id = $2`,
      [creditorId, leadId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: 'Creditor no encontrado para este lead.' });
    }

    const summary = await getLeadCreditorsSummary(leadId);
    return res.json({ summary, message: 'Creditor eliminado correctamente.' });
  } catch (error) {
    console.error('Error al eliminar creditor:', error);
    return res.status(500).json({ message: 'Error al eliminar creditor.' });
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

    const { rows } = await pool.query(
      `INSERT INTO banking_info (
        lead_id, routing_number, account_number, account_type, bank_name, bank_phone,
        bank_address, bank_address2, bank_city, bank_state, bank_zip,
        name_on_account, mothers_maiden_name, ss_number, relationship_to_customer,
        email, dob, address, address2,
        initial_payment_amount, payment_day_of_month
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      ON CONFLICT (lead_id) DO UPDATE SET
        routing_number = EXCLUDED.routing_number,
        account_number = EXCLUDED.account_number,
        account_type = EXCLUDED.account_type,
        bank_name = EXCLUDED.bank_name,
        bank_phone = EXCLUDED.bank_phone,
        bank_address = EXCLUDED.bank_address,
        bank_address2 = EXCLUDED.bank_address2,
        bank_city = EXCLUDED.bank_city,
        bank_state = EXCLUDED.bank_state,
        bank_zip = EXCLUDED.bank_zip,
        name_on_account = EXCLUDED.name_on_account,
        mothers_maiden_name = EXCLUDED.mothers_maiden_name,
        ss_number = EXCLUDED.ss_number,
        relationship_to_customer = EXCLUDED.relationship_to_customer,
        email = EXCLUDED.email,
        dob = EXCLUDED.dob,
        address = EXCLUDED.address,
        address2 = EXCLUDED.address2,
        initial_payment_amount = EXCLUDED.initial_payment_amount,
        payment_day_of_month = EXCLUDED.payment_day_of_month,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        leadId, routingNumber, accountNumber, accountType, bankName, bankPhone,
        bankAddress, bankAddress2, bankCity, bankState, bankZip,
        nameOnAccount, mothersMaidenName, ssNumber, relationshipToCustomer,
        email, dob, address, address2,
        initialPaymentAmount, paymentDayOfMonth
      ]
    );

    res.json({
      banking: rows[0],
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
// ENDPOINTS: BUDGET
// ============================================

app.get('/api/leads/:id/budget', async (req, res) => {
  const leadId = parsePositiveInteger(req.params.id);
  if (!leadId) {
    return res.status(400).json({ message: 'ID invalido.' });
  }

  try {
    const { rows: leadRows } = await pool.query(
      'SELECT id FROM leads WHERE id = $1 LIMIT 1',
      [leadId]
    );

    if (leadRows.length === 0) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    const { rows } = await pool.query(
      `SELECT data
       FROM lead_budgets
       WHERE lead_id = $1
       LIMIT 1`,
      [leadId]
    );

    if (rows.length === 0) {
      return res.json({ budget: null, message: 'No hay budget guardado para este lead.' });
    }

    return res.json({ budget: normalizeBudgetData(rows[0].data) });
  } catch (error) {
    console.error('Error al obtener budget:', error);
    return res.status(500).json({ message: 'Error al obtener budget.' });
  }
});

app.put('/api/leads/:id/budget', async (req, res) => {
  const leadId = parsePositiveInteger(req.params.id);
  if (!leadId) {
    return res.status(400).json({ message: 'ID invalido.' });
  }

  const payload = normalizeBudgetData(req.body || {});

  try {
    const { rows: leadRows } = await pool.query(
      'SELECT id FROM leads WHERE id = $1 LIMIT 1',
      [leadId]
    );

    if (leadRows.length === 0) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO lead_budgets (lead_id, data)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (lead_id)
       DO UPDATE SET
         data = EXCLUDED.data,
         updated_at = CURRENT_TIMESTAMP
       RETURNING data, updated_at`,
      [leadId, JSON.stringify(payload)]
    );

    return res.json({
      budget: normalizeBudgetData(rows[0].data),
      updatedAt: rows[0].updated_at,
      message: 'Budget guardado correctamente.'
    });
  } catch (error) {
    console.error('Error al guardar budget:', error);
    return res.status(500).json({ message: 'Error al guardar budget.' });
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
  getJwtSecret();
  await runMigrations();
  await ensureBootstrapAdminSeed();
  startTaskEscalationLoop();

  app.listen(PORT, () => {
    console.log(`Servidor activo en http://localhost:${PORT}`);
  });
}

if (!process.env.NETLIFY && !process.env.LAMBDA_TASK_ROOT) {
  startServer().catch((error) => {
    console.error('Error de arranque:', error.message);
    process.exit(1);
  });
} else {
  // Inicialización ligera para Serverless
  getJwtSecret();
  runMigrations().catch(e => console.error("Serverless mig error:", e));
}

module.exports = app;

