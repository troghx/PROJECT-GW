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
      `SELECT id, case_id, full_name, email, phone, source, state_code, status, 
              is_test, notes, assigned_to, created_at, updated_at
       FROM leads
       ORDER BY created_at DESC
       LIMIT 100`
    );

    // Agregar state_type a cada lead
    const leadsWithStateType = rows.map(lead => ({
      ...lead,
      state_type: GREEN_STATES.includes(lead.state_code?.toUpperCase()) ? 'Green' : 'Red'
    }));

    res.json({ leads: leadsWithStateType });
  } catch (error) {
    console.error('Error al obtener leads:', error);
    res.status(500).json({ message: 'Error al obtener leads.' });
  }
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

  try {
    // Obtener el siguiente case_id
    const { rows: seqRows } = await pool.query(
      `SELECT nextval('leads_case_id_seq') as next_id`
    );
    const caseId = seqRows[0].next_id;

    const { rows } = await pool.query(
      `INSERT INTO leads (case_id, full_name, phone, is_test, state_code, assigned_to, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, case_id, full_name, phone, is_test, state_code, assigned_to, status, created_at, updated_at`,
      [caseId, fullName, phone, isTest, stateCode, assignedTo, isTest ? 'Test' : 'New Lead']
    );

    const lead = rows[0];
    lead.state_type = GREEN_STATES.includes(lead.state_code?.toUpperCase()) ? 'Green' : 'Red';

    res.status(201).json({ lead });
  } catch (error) {
    console.error('Error al crear lead:', error.message);
    res.status(500).json({ message: 'No se pudo crear el lead.', detail: error.message });
  }
});

// Obtener un lead específico por ID
app.get('/api/leads/:id', async (req, res) => {
  const leadId = req.params.id;
  
  try {
    const { rows } = await pool.query(
      `SELECT id, case_id, full_name, co_applicant_name, email, phone, source, state_code, status, 
              is_test, notes, assigned_to, created_at, updated_at
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

// Actualizar un lead
app.patch('/api/leads/:id', async (req, res) => {
  const leadId = req.params.id;
  const { fullName, coApplicantName } = req.body;
  
  try {
    let updateFields = [];
    let values = [];
    let paramIndex = 1;
    
    if (fullName !== undefined) {
      updateFields.push(`full_name = $${paramIndex}`);
      values.push(fullName.trim());
      paramIndex++;
    }
    
    if (coApplicantName !== undefined) {
      updateFields.push(`co_applicant_name = $${paramIndex}`);
      values.push(coApplicantName.trim());
      paramIndex++;
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No hay campos para actualizar.' });
    }
    
    values.push(leadId);
    
    const { rows } = await pool.query(
      `UPDATE leads 
       SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramIndex}
       RETURNING id, case_id, full_name, co_applicant_name, email, phone, source, state_code, status, 
                 is_test, notes, assigned_to, created_at, updated_at`,
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

// Eliminar un lead
app.delete('/api/leads/:id', async (req, res) => {
  const leadId = req.params.id;
  
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM leads WHERE id = $1`,
      [leadId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: 'Lead no encontrado.' });
    }

    res.json({ message: 'Lead eliminado correctamente.' });
  } catch (error) {
    console.error('Error al eliminar lead:', error);
    res.status(500).json({ message: 'Error al eliminar lead.' });
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
