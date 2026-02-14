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
  nextCaseId: 1000
};

// Datos de ejemplo
const sampleLeads = [
  { id: 1, case_id: 1001, full_name: 'Juan Pérez', phone: '555-0101', email: 'juan@example.com', source: 'Web', state_code: 'CA', status: 'New Lead', is_test: false, notes: '', assigned_to: null, first_deposit_date: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 2, case_id: 1002, full_name: 'María García', phone: '555-0102', email: 'maria@example.com', source: 'Referral', state_code: 'TX', status: 'New Lead', is_test: false, notes: '', assigned_to: null, first_deposit_date: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 3, case_id: 1003, full_name: 'Carlos López', phone: '555-0103', email: 'carlos@example.com', source: 'Web', state_code: 'NY', status: 'Test', is_test: true, notes: '', assigned_to: 'Agente 1', first_deposit_date: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

db.leads.push(...sampleLeads);
db.nextCaseId = 1004;

app.use(cors());
app.use(express.json());
app.use(express.static(ROOT_DIR));

// Lista de estados Green (los demás son Red)
const GREEN_STATES = [
  'MO', 'VA', 'CA', 'AR', 'TX', 'NY', 'FL', 'MS', 'LA', 'NC', 
  'NM', 'AL', 'TN', 'AZ', 'OK', 'MI', 'NE', 'MN', 'NV', 'ND', 
  'IA', 'AK', 'SD'
];

function cleanText(value, maxLength) {
  const text = String(value || '').trim();
  return text.slice(0, maxLength);
}

function isValidISODate(value) {
  if (typeof value !== 'string') return false;
  const iso = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso;
}

function addStateType(lead) {
  return {
    ...lead,
    state_type: GREEN_STATES.includes(lead.state_code?.toUpperCase()) ? 'Green' : 'Red'
  };
}

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, message: 'Server activo (modo MOCK - sin PostgreSQL)' });
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

app.post('/api/leads', async (req, res) => {
  const fullName = cleanText(req.body?.fullName, 120);
  const phone = cleanText(req.body?.phone, 40);
  const isTest = req.body?.isTest === true;
  const stateCode = cleanText(req.body?.stateCode, 2) || null;
  const assignedTo = cleanText(req.body?.assignedTo, 120) || null;

  if (!fullName || !phone) {
    return res.status(400).json({ message: 'Nombre y teléfono son obligatorios.' });
  }

  const caseId = db.nextCaseId++;
  const newLead = {
    id: db.leads.length + 1,
    case_id: caseId,
    full_name: fullName,
    phone: phone,
    is_test: isTest,
    state_code: stateCode,
    assigned_to: assignedTo,
    status: isTest ? 'Test' : 'New Lead',
    email: null,
    source: 'Web',
    notes: '',
    first_deposit_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  db.leads.unshift(newLead);

  res.status(201).json({ lead: addStateType(newLead) });
});

app.get('/api/leads/:id', async (req, res) => {
  const leadId = parseInt(req.params.id);
  const lead = db.leads.find(l => l.id === leadId);

  if (!lead) {
    return res.status(404).json({ message: 'Lead no encontrado.' });
  }

  res.json({ lead: addStateType(lead) });
});


app.patch('/api/leads/:id', async (req, res) => {
  const leadId = parseInt(req.params.id, 10);
  const { fullName, coApplicantName, firstDepositDate } = req.body || {};
  const lead = db.leads.find(l => l.id === leadId);

  if (!lead) {
    return res.status(404).json({ message: 'Lead no encontrado.' });
  }

  if (fullName !== undefined) {
    lead.full_name = cleanText(fullName, 120);
  }

  if (coApplicantName !== undefined) {
    lead.co_applicant_name = cleanText(coApplicantName, 120);
  }

  if (firstDepositDate !== undefined) {
    if (firstDepositDate === null || String(firstDepositDate).trim() === '') {
      lead.first_deposit_date = null;
    } else {
      const normalizedDate = String(firstDepositDate).trim();
      if (!isValidISODate(normalizedDate)) {
        return res.status(400).json({ message: 'firstDepositDate debe tener formato YYYY-MM-DD.' });
      }
      lead.first_deposit_date = normalizedDate;
    }
  }

  lead.updated_at = new Date().toISOString();

  res.json({ lead: addStateType(lead), message: 'Lead actualizado correctamente.' });
});
app.delete('/api/leads/:id', async (req, res) => {
  const leadId = parseInt(req.params.id);
  const index = db.leads.findIndex(l => l.id === leadId);

  if (index === -1) {
    return res.status(404).json({ message: 'Lead no encontrado.' });
  }

  db.leads.splice(index, 1);
  res.json({ message: 'Lead eliminado correctamente.' });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.get('/client.html', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'client.html'));
});

app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`Servidor activo en http://localhost:${PORT}`);
  console.log(`MODO MOCK: Datos almacenados en memoria`);
  console.log(`(Para usar PostgreSQL, ejecuta: npm run db:init-local)`);
  console.log(`=================================`);
});
