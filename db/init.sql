-- Tabla de leads actualizada
CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  case_id INTEGER UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  co_applicant_name VARCHAR(120),
  co_applicant_email VARCHAR(160),
  co_applicant_home_phone VARCHAR(40),
  co_applicant_cell_phone VARCHAR(40),
  co_applicant_dob DATE,
  co_applicant_ssn VARCHAR(11),
  co_applicant_currently_employed VARCHAR(60),
  co_applicant_employer_name VARCHAR(120),
  co_applicant_occupation VARCHAR(120),
  co_applicant_self_employed BOOLEAN NOT NULL DEFAULT FALSE,
  include_coapp_in_contract BOOLEAN NOT NULL DEFAULT FALSE,
  fico_score_applicant INTEGER,
  fico_score_coapp INTEGER,
  calc_total_debt NUMERIC(12,2) NOT NULL DEFAULT 0,
  calc_settlement_percent NUMERIC(5,2) NOT NULL DEFAULT 55,
  calc_program_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 25,
  calc_bank_fee NUMERIC(10,2) NOT NULL DEFAULT 9.95,
  calc_months INTEGER NOT NULL DEFAULT 48,
  calc_legal_plan_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  email VARCHAR(160),
  phone VARCHAR(40),
  home_phone VARCHAR(40),
  cell_phone VARCHAR(40),
  source VARCHAR(60),
  state_code VARCHAR(2),
  dob DATE,
  ssn VARCHAR(11),
  address_street VARCHAR(180),
  city VARCHAR(120),
  zip_code VARCHAR(10),
  best_time VARCHAR(80),
  currently_employed VARCHAR(60),
  employer_name VARCHAR(120),
  occupation VARCHAR(120),
  self_employed BOOLEAN NOT NULL DEFAULT FALSE,
  first_deposit_date DATE,
  callback_date DATE,
  callback_completed_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'New Lead',
  is_test BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  related_lead_id BIGINT,
  assigned_to VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migración: Agregar case_id si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'case_id'
  ) THEN
    ALTER TABLE leads ADD COLUMN case_id INTEGER UNIQUE;
  END IF;
END $$;

-- ============================================
-- TABLA: Budget por lead (Items, Income, Hardship)
-- ============================================
CREATE TABLE IF NOT EXISTS lead_budgets (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_budgets' AND column_name = 'data'
  ) THEN
    ALTER TABLE lead_budgets ADD COLUMN data JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_budgets' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE lead_budgets ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_budgets' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE lead_budgets ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lead_budgets_lead_id ON lead_budgets (lead_id);

-- Migración: Agregar is_test si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'is_test'
  ) THEN
    ALTER TABLE leads ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- Migración: Agregar state_code si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'state_code'
  ) THEN
    ALTER TABLE leads ADD COLUMN state_code VARCHAR(2);
  END IF;
END $$;

-- Migración: Agregar assigned_to si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'assigned_to'
  ) THEN
    ALTER TABLE leads ADD COLUMN assigned_to VARCHAR(120);
  END IF;
END $$;

-- Migración: Agregar updated_at si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE leads ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- Migración: Quitar NOT NULL de email si existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'email' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE leads ALTER COLUMN email DROP NOT NULL;
  END IF;
END $$;

-- Migración: Quitar NOT NULL de phone si existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'phone' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE leads ALTER COLUMN phone DROP NOT NULL;
  END IF;
END $$;

-- Migración: Agregar co_applicant_name si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'co_applicant_name'
  ) THEN
    ALTER TABLE leads ADD COLUMN co_applicant_name VARCHAR(120);
  END IF;
END $$;

-- Migracion: Agregar co_applicant_email si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'co_applicant_email'
  ) THEN
    ALTER TABLE leads ADD COLUMN co_applicant_email VARCHAR(160);
  END IF;
END $$;

-- Migracion: Agregar co_applicant_home_phone si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'co_applicant_home_phone'
  ) THEN
    ALTER TABLE leads ADD COLUMN co_applicant_home_phone VARCHAR(40);
  END IF;
END $$;

-- Migracion: Agregar co_applicant_cell_phone si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'co_applicant_cell_phone'
  ) THEN
    ALTER TABLE leads ADD COLUMN co_applicant_cell_phone VARCHAR(40);
  END IF;
END $$;

-- Migracion: Agregar co_applicant_dob si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'co_applicant_dob'
  ) THEN
    ALTER TABLE leads ADD COLUMN co_applicant_dob DATE;
  END IF;
END $$;

-- Migracion: Agregar co_applicant_ssn si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'co_applicant_ssn'
  ) THEN
    ALTER TABLE leads ADD COLUMN co_applicant_ssn VARCHAR(11);
  END IF;
END $$;

-- Migración: Agregar first_deposit_date si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'first_deposit_date'
  ) THEN
    ALTER TABLE leads ADD COLUMN first_deposit_date DATE;
  END IF;
END $$;

-- Migracion: Agregar callback_date si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'callback_date'
  ) THEN
    ALTER TABLE leads ADD COLUMN callback_date DATE;
  END IF;
END $$;

-- Migracion: Agregar callback_completed_at si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'callback_completed_at'
  ) THEN
    ALTER TABLE leads ADD COLUMN callback_completed_at TIMESTAMPTZ;
  END IF;
END $$;

-- Migracion: Agregar related_lead_id si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'related_lead_id'
  ) THEN
    ALTER TABLE leads ADD COLUMN related_lead_id BIGINT;
  END IF;
END $$;

-- Migracion: Intentar recuperar relaciones antiguas desde notas ("lead #<case_id>")
DO $$
BEGIN
  UPDATE leads child
  SET related_lead_id = parent.id
  FROM leads parent
  WHERE child.related_lead_id IS NULL
    AND child.notes IS NOT NULL
    AND child.notes ~* 'lead #[0-9]+'
    AND parent.case_id = substring(child.notes from 'lead #([0-9]+)')::INTEGER;
END $$;

-- Migracion: Agregar co_applicant_currently_employed si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'co_applicant_currently_employed'
  ) THEN
    ALTER TABLE leads ADD COLUMN co_applicant_currently_employed VARCHAR(60);
  END IF;
END $$;

-- Migracion: Agregar co_applicant_employer_name si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'co_applicant_employer_name'
  ) THEN
    ALTER TABLE leads ADD COLUMN co_applicant_employer_name VARCHAR(120);
  END IF;
END $$;

-- Migracion: Agregar co_applicant_occupation si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'co_applicant_occupation'
  ) THEN
    ALTER TABLE leads ADD COLUMN co_applicant_occupation VARCHAR(120);
  END IF;
END $$;

-- Migracion: Agregar y normalizar co_applicant_self_employed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'co_applicant_self_employed'
  ) THEN
    ALTER TABLE leads ADD COLUMN co_applicant_self_employed BOOLEAN;
  END IF;

  UPDATE leads SET co_applicant_self_employed = FALSE WHERE co_applicant_self_employed IS NULL;
  ALTER TABLE leads ALTER COLUMN co_applicant_self_employed SET DEFAULT FALSE;
  ALTER TABLE leads ALTER COLUMN co_applicant_self_employed SET NOT NULL;
END $$;

-- Migracion: Agregar y normalizar calc_total_debt
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'calc_total_debt'
  ) THEN
    ALTER TABLE leads ADD COLUMN calc_total_debt NUMERIC(12,2);
  END IF;

  UPDATE leads SET calc_total_debt = 0 WHERE calc_total_debt IS NULL;
  ALTER TABLE leads ALTER COLUMN calc_total_debt SET DEFAULT 0;
  ALTER TABLE leads ALTER COLUMN calc_total_debt SET NOT NULL;
END $$;

-- Migracion: Agregar y normalizar calc_settlement_percent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'calc_settlement_percent'
  ) THEN
    ALTER TABLE leads ADD COLUMN calc_settlement_percent NUMERIC(5,2);
  END IF;

  UPDATE leads
  SET calc_settlement_percent = 55
  WHERE calc_settlement_percent IS NULL
    OR calc_settlement_percent <= 0;
  ALTER TABLE leads ALTER COLUMN calc_settlement_percent SET DEFAULT 55;
  ALTER TABLE leads ALTER COLUMN calc_settlement_percent SET NOT NULL;
END $$;

-- Migracion: Agregar y normalizar calc_program_fee_percent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'calc_program_fee_percent'
  ) THEN
    ALTER TABLE leads ADD COLUMN calc_program_fee_percent NUMERIC(5,2);
  END IF;

  UPDATE leads
  SET calc_program_fee_percent = 25
  WHERE calc_program_fee_percent IS NULL
    OR calc_program_fee_percent <= 0;
  ALTER TABLE leads ALTER COLUMN calc_program_fee_percent SET DEFAULT 25;
  ALTER TABLE leads ALTER COLUMN calc_program_fee_percent SET NOT NULL;
END $$;

-- Migracion: Agregar y normalizar calc_bank_fee
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'calc_bank_fee'
  ) THEN
    ALTER TABLE leads ADD COLUMN calc_bank_fee NUMERIC(10,2);
  END IF;

  UPDATE leads
  SET calc_bank_fee = 9.95
  WHERE calc_bank_fee IS NULL
    OR calc_bank_fee <= 0;
  ALTER TABLE leads ALTER COLUMN calc_bank_fee SET DEFAULT 9.95;
  ALTER TABLE leads ALTER COLUMN calc_bank_fee SET NOT NULL;
END $$;

-- Migracion: Agregar y normalizar calc_months
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'calc_months'
  ) THEN
    ALTER TABLE leads ADD COLUMN calc_months INTEGER;
  END IF;

  UPDATE leads SET calc_months = 48 WHERE calc_months IS NULL;
  ALTER TABLE leads ALTER COLUMN calc_months SET DEFAULT 48;
  ALTER TABLE leads ALTER COLUMN calc_months SET NOT NULL;
END $$;

-- Migracion: Agregar y normalizar calc_legal_plan_enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'calc_legal_plan_enabled'
  ) THEN
    ALTER TABLE leads ADD COLUMN calc_legal_plan_enabled BOOLEAN;
  END IF;

  UPDATE leads SET calc_legal_plan_enabled = FALSE WHERE calc_legal_plan_enabled IS NULL;
  ALTER TABLE leads ALTER COLUMN calc_legal_plan_enabled SET DEFAULT FALSE;
  ALTER TABLE leads ALTER COLUMN calc_legal_plan_enabled SET NOT NULL;
END $$;

-- Migracion: Agregar y normalizar include_coapp_in_contract
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'include_coapp_in_contract'
  ) THEN
    ALTER TABLE leads ADD COLUMN include_coapp_in_contract BOOLEAN;
  END IF;

  UPDATE leads SET include_coapp_in_contract = FALSE WHERE include_coapp_in_contract IS NULL;
  ALTER TABLE leads ALTER COLUMN include_coapp_in_contract SET DEFAULT FALSE;
  ALTER TABLE leads ALTER COLUMN include_coapp_in_contract SET NOT NULL;
END $$;

-- Migracion: Agregar fico_score_applicant y fico_score_coapp
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'fico_score_applicant'
  ) THEN
    ALTER TABLE leads ADD COLUMN fico_score_applicant INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'fico_score_coapp'
  ) THEN
    ALTER TABLE leads ADD COLUMN fico_score_coapp INTEGER;
  END IF;

  UPDATE leads
  SET fico_score_applicant = NULL
  WHERE fico_score_applicant IS NOT NULL
    AND (fico_score_applicant < 300 OR fico_score_applicant > 850);

  UPDATE leads
  SET fico_score_coapp = NULL
  WHERE fico_score_coapp IS NOT NULL
    AND (fico_score_coapp < 300 OR fico_score_coapp > 850);
END $$;

-- Migracion: Asegurar checks de rango para FICO
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_fico_score_applicant_range_chk'
  ) THEN
    ALTER TABLE leads
    ADD CONSTRAINT leads_fico_score_applicant_range_chk
    CHECK (fico_score_applicant IS NULL OR (fico_score_applicant BETWEEN 300 AND 850));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_fico_score_coapp_range_chk'
  ) THEN
    ALTER TABLE leads
    ADD CONSTRAINT leads_fico_score_coapp_range_chk
    CHECK (fico_score_coapp IS NULL OR (fico_score_coapp BETWEEN 300 AND 850));
  END IF;
END $$;

-- Migracion: Agregar home_phone si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'home_phone'
  ) THEN
    ALTER TABLE leads ADD COLUMN home_phone VARCHAR(40);
  END IF;
END $$;

-- Migracion: Agregar cell_phone si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'cell_phone'
  ) THEN
    ALTER TABLE leads ADD COLUMN cell_phone VARCHAR(40);
  END IF;
END $$;

-- Migracion: Agregar dob si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'dob'
  ) THEN
    ALTER TABLE leads ADD COLUMN dob DATE;
  END IF;
END $$;

-- Migracion: Agregar ssn si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'ssn'
  ) THEN
    ALTER TABLE leads ADD COLUMN ssn VARCHAR(11);
  END IF;
END $$;

-- Migracion: Agregar address_street si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'address_street'
  ) THEN
    ALTER TABLE leads ADD COLUMN address_street VARCHAR(180);
  END IF;
END $$;

-- Migracion: Agregar city si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'city'
  ) THEN
    ALTER TABLE leads ADD COLUMN city VARCHAR(120);
  END IF;
END $$;

-- Migracion: Agregar zip_code si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'zip_code'
  ) THEN
    ALTER TABLE leads ADD COLUMN zip_code VARCHAR(10);
  END IF;
END $$;

-- Migracion: Agregar best_time si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'best_time'
  ) THEN
    ALTER TABLE leads ADD COLUMN best_time VARCHAR(80);
  END IF;
END $$;

-- Migracion: Agregar currently_employed si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'currently_employed'
  ) THEN
    ALTER TABLE leads ADD COLUMN currently_employed VARCHAR(60);
  END IF;
END $$;

-- Migracion: Agregar employer_name si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'employer_name'
  ) THEN
    ALTER TABLE leads ADD COLUMN employer_name VARCHAR(120);
  END IF;
END $$;

-- Migracion: Agregar occupation si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'occupation'
  ) THEN
    ALTER TABLE leads ADD COLUMN occupation VARCHAR(120);
  END IF;
END $$;

-- Migracion: Agregar y normalizar self_employed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'self_employed'
  ) THEN
    ALTER TABLE leads ADD COLUMN self_employed BOOLEAN;
  END IF;

  UPDATE leads SET self_employed = FALSE WHERE self_employed IS NULL;
  ALTER TABLE leads ALTER COLUMN self_employed SET DEFAULT FALSE;
  ALTER TABLE leads ALTER COLUMN self_employed SET NOT NULL;
END $$;

-- Notas individuales por lead (historial)
CREATE TABLE IF NOT EXISTS lead_notes (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_username VARCHAR(120) NOT NULL DEFAULT 'Sistema',
  color_tag VARCHAR(16) NOT NULL DEFAULT 'yellow',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migracion: Agregar author_username si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_notes' AND column_name = 'author_username'
  ) THEN
    ALTER TABLE lead_notes ADD COLUMN author_username VARCHAR(120);
  END IF;
END $$;

-- Migracion: Agregar created_at si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_notes' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE lead_notes ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- Migracion: Agregar updated_at si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_notes' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE lead_notes ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- Migracion: Agregar color_tag si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_notes' AND column_name = 'color_tag'
  ) THEN
    ALTER TABLE lead_notes ADD COLUMN color_tag VARCHAR(16);
  END IF;
END $$;

-- Migracion: Normalizar campos NOT NULL en lead_notes
DO $$
BEGIN
  UPDATE lead_notes SET content = '' WHERE content IS NULL;
  UPDATE lead_notes SET author_username = 'Sistema' WHERE author_username IS NULL OR btrim(author_username) = '';
  UPDATE lead_notes
  SET color_tag = 'yellow'
  WHERE color_tag IS NULL
    OR btrim(color_tag) = ''
    OR lower(btrim(color_tag)) NOT IN ('yellow', 'red', 'green', 'blue', 'gray');
  UPDATE lead_notes
  SET color_tag = lower(btrim(color_tag))
  WHERE color_tag IS NOT NULL;
  ALTER TABLE lead_notes ALTER COLUMN author_username SET DEFAULT 'Sistema';
  ALTER TABLE lead_notes ALTER COLUMN color_tag SET DEFAULT 'yellow';
  ALTER TABLE lead_notes ALTER COLUMN content SET NOT NULL;
  ALTER TABLE lead_notes ALTER COLUMN author_username SET NOT NULL;
  ALTER TABLE lead_notes ALTER COLUMN color_tag SET NOT NULL;
END $$;

-- Migracion: Convertir notas legacy de leads.notes en historial
DO $$
BEGIN
  INSERT INTO lead_notes (lead_id, content, author_username, created_at, updated_at)
  SELECT
    l.id,
    btrim(l.notes),
    COALESCE(NULLIF(btrim(l.assigned_to), ''), 'Sistema'),
    COALESCE(l.updated_at, l.created_at, NOW()),
    COALESCE(l.updated_at, l.created_at, NOW())
  FROM leads l
  WHERE l.notes IS NOT NULL
    AND btrim(l.notes) <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM lead_notes n
      WHERE n.lead_id = l.id
        AND btrim(n.content) = btrim(l.notes)
    );
END $$;

-- Templates de notas por usuario/cuenta
CREATE TABLE IF NOT EXISTS note_templates (
  id BIGSERIAL PRIMARY KEY,
  owner_username VARCHAR(120) NOT NULL DEFAULT 'admin',
  name VARCHAR(120) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migracion: Agregar owner_username si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'note_templates' AND column_name = 'owner_username'
  ) THEN
    ALTER TABLE note_templates ADD COLUMN owner_username VARCHAR(120);
  END IF;
END $$;

-- Migracion: Agregar name si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'note_templates' AND column_name = 'name'
  ) THEN
    ALTER TABLE note_templates ADD COLUMN name VARCHAR(120);
  END IF;
END $$;

-- Migracion: Agregar content si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'note_templates' AND column_name = 'content'
  ) THEN
    ALTER TABLE note_templates ADD COLUMN content TEXT;
  END IF;
END $$;

-- Migracion: Agregar created_at si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'note_templates' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE note_templates ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- Migracion: Agregar updated_at si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'note_templates' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE note_templates ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- Migracion: Normalizar campos NOT NULL en note_templates
DO $$
BEGIN
  UPDATE note_templates SET owner_username = lower(btrim(owner_username)) WHERE owner_username IS NOT NULL;
  UPDATE note_templates SET owner_username = 'admin' WHERE owner_username IS NULL OR btrim(owner_username) = '';
  UPDATE note_templates SET name = 'Template sin titulo' WHERE name IS NULL OR btrim(name) = '';
  UPDATE note_templates SET content = '' WHERE content IS NULL;
  ALTER TABLE note_templates ALTER COLUMN owner_username SET DEFAULT 'admin';
  ALTER TABLE note_templates ALTER COLUMN owner_username SET NOT NULL;
  ALTER TABLE note_templates ALTER COLUMN name SET NOT NULL;
  ALTER TABLE note_templates ALTER COLUMN content SET NOT NULL;
END $$;
-- Índices
-- Archivos por lead (compartidos para todos los usuarios)
CREATE TABLE IF NOT EXISTS lead_files (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0 CHECK (file_size >= 0 AND file_size <= 10485760),
  document_category VARCHAR(40) NOT NULL DEFAULT 'other',
  credit_report_party VARCHAR(16),
  file_data_url TEXT NOT NULL,
  uploaded_by VARCHAR(120) NOT NULL DEFAULT 'Sistema',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_files_lead_id_created_at ON lead_files (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_files_lead_id_category ON lead_files (lead_id, document_category);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_files' AND column_name = 'document_category'
  ) THEN
    ALTER TABLE lead_files ADD COLUMN document_category VARCHAR(40) NOT NULL DEFAULT 'other';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_files' AND column_name = 'credit_report_party'
  ) THEN
    ALTER TABLE lead_files ADD COLUMN credit_report_party VARCHAR(16);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_files' AND column_name = 'file_data_url'
  ) THEN
    ALTER TABLE lead_files ADD COLUMN file_data_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_files' AND column_name = 'uploaded_by'
  ) THEN
    ALTER TABLE lead_files ADD COLUMN uploaded_by VARCHAR(120) NOT NULL DEFAULT 'Sistema';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_files' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE lead_files ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_files' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE lead_files ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  UPDATE lead_files
  SET document_category = CASE
    WHEN lower(coalesce(document_category, '')) IN ('official_document', 'credit_report', 'income_proof', 'bank_statement', 'contract', 'other')
      THEN lower(document_category)
    ELSE 'other'
  END;

  UPDATE lead_files
  SET credit_report_party = CASE
    WHEN lower(coalesce(credit_report_party, '')) IN ('coapp', 'co-app', 'co_applicant', 'coapplicant', 'co applicant', 'co') THEN 'coapp'
    WHEN lower(coalesce(credit_report_party, '')) IN ('applicant', 'main', 'primary', 'app') THEN 'applicant'
    ELSE NULL
  END;
END $$;

-- Creditors por lead (deudas importadas/manuales)
CREATE TABLE IF NOT EXISTS lead_creditors (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  source_report VARCHAR(180),
  creditor_name VARCHAR(180) NOT NULL,
  original_creditor VARCHAR(180),
  account_number VARCHAR(80),
  account_status VARCHAR(80),
  account_type VARCHAR(80),
  debtor_party VARCHAR(16) NOT NULL DEFAULT 'applicant',
  date_last_payment VARCHAR(24),
  monthly_payment NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  past_due NUMERIC(12,2) NOT NULL DEFAULT 0,
  unpaid_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0,
  high_credit NUMERIC(12,2) NOT NULL DEFAULT 0,
  debt_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_included BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  raw_snapshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_creditors_lead_id ON lead_creditors (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_creditors_lead_id_included ON lead_creditors (lead_id, is_included);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_case_id ON leads (case_id);
CREATE INDEX IF NOT EXISTS idx_leads_is_test ON leads (is_test);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads (assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_callback_date ON leads (callback_date);
CREATE INDEX IF NOT EXISTS idx_leads_callback_completed_at ON leads (callback_completed_at);
CREATE INDEX IF NOT EXISTS idx_leads_related_lead_id ON leads (related_lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id_created_at ON lead_notes (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_templates_owner_name ON note_templates (owner_username, name);
CREATE INDEX IF NOT EXISTS idx_leads_phone_dup ON leads (right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10));
CREATE INDEX IF NOT EXISTS idx_leads_home_phone_dup ON leads (right(regexp_replace(coalesce(home_phone, ''), '\D', '', 'g'), 10));
CREATE INDEX IF NOT EXISTS idx_leads_cell_phone_dup ON leads (right(regexp_replace(coalesce(cell_phone, ''), '\D', '', 'g'), 10));
CREATE INDEX IF NOT EXISTS idx_leads_coapp_home_phone_dup ON leads (right(regexp_replace(coalesce(co_applicant_home_phone, ''), '\D', '', 'g'), 10));
CREATE INDEX IF NOT EXISTS idx_leads_coapp_cell_phone_dup ON leads (right(regexp_replace(coalesce(co_applicant_cell_phone, ''), '\D', '', 'g'), 10));

-- Secuencia para case_id empezando en 10001
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'leads_case_id_seq') THEN
    CREATE SEQUENCE leads_case_id_seq START WITH 10001;
  END IF;
END $$;

DO $$
BEGIN
  -- Agregar debtor_party si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_creditors' AND column_name = 'debtor_party'
  ) THEN
    ALTER TABLE lead_creditors ADD COLUMN debtor_party VARCHAR(16) NOT NULL DEFAULT 'applicant';
  END IF;

  -- Normalizar valores posibles
  UPDATE lead_creditors
  SET debtor_party = CASE
    WHEN lower(coalesce(debtor_party, '')) IN ('coapp', 'co-app', 'co_applicant', 'coapplicant') THEN 'coapp'
    ELSE 'applicant'
  END;
END $$;



-- ============================================
-- TABLA: Información Bancaria del Cliente
-- ============================================
CREATE TABLE IF NOT EXISTS banking_info (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Datos principales de la cuenta
  routing_number VARCHAR(20),
  account_number VARCHAR(50),
  account_type VARCHAR(20) DEFAULT 'Checking', -- Checking, Savings
  bank_name VARCHAR(120),
  bank_phone VARCHAR(40),
  
  -- Dirección del banco
  bank_address VARCHAR(180),
  bank_address2 VARCHAR(180),
  bank_city VARCHAR(120),
  bank_state VARCHAR(2),
  bank_zip VARCHAR(10),
  
  -- Datos del titular
  name_on_account VARCHAR(120),
  mothers_maiden_name VARCHAR(120),
  ss_number VARCHAR(11),
  relationship_to_customer VARCHAR(60),
  
  -- Contacto adicional
  email VARCHAR(160),
  dob DATE,
  address TEXT,
  address2 TEXT,
  
  -- Configuración de pagos
  initial_payment_amount NUMERIC(12,2) DEFAULT 0,
  payment_day_of_month INTEGER DEFAULT 1 CHECK (payment_day_of_month >= 1 AND payment_day_of_month <= 31),
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migraciones para campos opcionales (por si la tabla ya existe)
DO $$
BEGIN
  -- routing_number
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'routing_number'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN routing_number VARCHAR(20);
  END IF;

  -- account_number
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'account_number'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN account_number VARCHAR(50);
  END IF;

  -- account_type
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'account_type'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN account_type VARCHAR(20) DEFAULT 'Checking';
  END IF;

  -- bank_name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'bank_name'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN bank_name VARCHAR(120);
  END IF;

  -- bank_phone
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'bank_phone'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN bank_phone VARCHAR(40);
  END IF;

  -- bank_address
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'bank_address'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN bank_address VARCHAR(180);
  END IF;

  -- bank_address2
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'bank_address2'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN bank_address2 VARCHAR(180);
  END IF;

  -- bank_city
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'bank_city'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN bank_city VARCHAR(120);
  END IF;

  -- bank_state
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'bank_state'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN bank_state VARCHAR(2);
  END IF;

  -- bank_zip
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'bank_zip'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN bank_zip VARCHAR(10);
  END IF;

  -- name_on_account
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'name_on_account'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN name_on_account VARCHAR(120);
  END IF;

  -- mothers_maiden_name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'mothers_maiden_name'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN mothers_maiden_name VARCHAR(120);
  END IF;

  -- ss_number
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'ss_number'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN ss_number VARCHAR(11);
  END IF;

  -- relationship_to_customer
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'relationship_to_customer'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN relationship_to_customer VARCHAR(60);
  END IF;

  -- email
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'email'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN email VARCHAR(160);
  END IF;

  -- dob
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'dob'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN dob DATE;
  END IF;

  -- address
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'address'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN address TEXT;
  END IF;

  -- address2
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'address2'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN address2 TEXT;
  END IF;

  -- initial_payment_amount
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'initial_payment_amount'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN initial_payment_amount NUMERIC(12,2) DEFAULT 0;
  END IF;

  -- payment_day_of_month
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'payment_day_of_month'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN payment_day_of_month INTEGER DEFAULT 1;
  END IF;

  -- created_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  -- updated_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banking_info' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE banking_info ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- Índices para banking_info
CREATE INDEX IF NOT EXISTS idx_banking_info_lead_id ON banking_info (lead_id);

-- ============================================
-- TABLA: Routing Numbers de Bancos (Cache local)
-- ============================================
CREATE TABLE IF NOT EXISTS bank_routing_numbers (
  id BIGSERIAL PRIMARY KEY,
  routing_number VARCHAR(9) NOT NULL UNIQUE,
  bank_name VARCHAR(200) NOT NULL,
  city VARCHAR(120),
  state VARCHAR(2),
  zip_code VARCHAR(10),
  phone VARCHAR(40),
  address VARCHAR(200),
  source VARCHAR(50) DEFAULT 'api_ninjas',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_bank_routing_number ON bank_routing_numbers (routing_number);
CREATE INDEX IF NOT EXISTS idx_bank_name ON bank_routing_numbers (bank_name);
CREATE INDEX IF NOT EXISTS idx_bank_city_state ON bank_routing_numbers (city, state);

-- Datos iniciales de los bancos más comunes (para respaldo rápido)
INSERT INTO bank_routing_numbers (routing_number, bank_name, city, state) VALUES
('021000021', 'JPMorgan Chase Bank', 'Tampa', 'FL'),
('322271627', 'JPMorgan Chase Bank', 'Phoenix', 'AZ'),
('121000248', 'Wells Fargo Bank', 'San Francisco', 'CA'),
('122000247', 'Wells Fargo Bank', 'Minneapolis', 'MN'),
('026009593', 'Bank of America', 'Richmond', 'VA'),
('111000025', 'Bank of America', 'Richardson', 'TX'),
('021000322', 'Bank of America', 'Richmond', 'VA'),
('021000089', 'Citibank', 'New York', 'NY'),
('022000868', 'Citibank', 'New York', 'NY'),
('084000026', 'US Bank', 'Cincinnati', 'OH'),
('043000096', 'PNC Bank', 'Pittsburgh', 'PA'),
('053000196', 'Truist Bank', 'Winston-Salem', 'NC'),
('051000017', 'Truist Bank', 'Richmond', 'VA'),
('061000104', 'Regions Bank', 'Birmingham', 'AL'),
('121042882', 'Wells Fargo Bank NA', 'Minneapolis', 'MN'),
('011000015', 'Bank of America NA', 'Richmond', 'VA'),
('031000503', 'Bank of America', 'Richmond', 'VA'),
('122105155', 'US Bank', 'St. Paul', 'MN'),
('031000053', 'PNC Bank', 'Pittsburgh', 'PA'),
('255071981', 'Truist Bank', 'Richmond', 'VA'),
('067006432', 'Wells Fargo Bank', 'Minneapolis', 'MN'),
('114000686', 'Wells Fargo Bank', 'Minneapolis', 'MN'),
('113000023', 'Bank of America', 'Houston', 'TX')
ON CONFLICT (routing_number) DO NOTHING;

-- ============================================
-- MIGRACIONES: Nuevos campos para lead_creditors (Responsibility, Months Reviewed)
-- ============================================
DO $$
BEGIN
  -- Agregar responsibility si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'lead_creditors' AND column_name = 'responsibility'
  ) THEN
    ALTER TABLE lead_creditors ADD COLUMN responsibility VARCHAR(60);
  END IF;

  -- Agregar months_reviewed si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_creditors' AND column_name = 'months_reviewed'
  ) THEN
    ALTER TABLE lead_creditors ADD COLUMN months_reviewed INTEGER;
  END IF;

  -- Agregar date_last_payment si no existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_creditors' AND column_name = 'date_last_payment'
  ) THEN
    ALTER TABLE lead_creditors ADD COLUMN date_last_payment VARCHAR(24);
  END IF;
END $$;

-- ============================================
-- TABLA: Notificaciones por usuario
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  recipient_username VARCHAR(120) NOT NULL,
  type VARCHAR(40) NOT NULL DEFAULT 'info',
  title VARCHAR(120) NOT NULL,
  body VARCHAR(500) NOT NULL DEFAULT '',
  lead_id BIGINT REFERENCES leads(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (recipient_username) WHERE read_at IS NULL;

-- ============================================
-- TABLA: Motor general de tareas operativas
-- ============================================
CREATE TABLE IF NOT EXISTS lead_tasks (
  id BIGSERIAL PRIMARY KEY,
  task_type VARCHAR(40) NOT NULL DEFAULT 'general',
  title VARCHAR(180) NOT NULL,
  description TEXT,
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  owner_username VARCHAR(120) NOT NULL,
  owner_team VARCHAR(120),
  related_lead_id BIGINT REFERENCES leads(id) ON DELETE SET NULL,
  due_date DATE,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  recurrence_rule VARCHAR(20) NOT NULL DEFAULT 'none',
  recurrence_interval INTEGER NOT NULL DEFAULT 1,
  recurrence_end_date DATE,
  sla_minutes INTEGER,
  sla_due_at TIMESTAMPTZ,
  sla_breached_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  escalated_to_username VARCHAR(120),
  escalation_level INTEGER NOT NULL DEFAULT 0,
  source_callback_date DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id BIGINT,
  created_by_username VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'task_type'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN task_type VARCHAR(40) NOT NULL DEFAULT 'general';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'description'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN description TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'priority'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN priority VARCHAR(20) NOT NULL DEFAULT 'normal';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'status'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'owner_team'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN owner_team VARCHAR(120);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'related_lead_id'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN related_lead_id BIGINT REFERENCES leads(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'due_date'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN due_date DATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'due_at'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN due_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN completed_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'recurrence_rule'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN recurrence_rule VARCHAR(20) NOT NULL DEFAULT 'none';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'recurrence_interval'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN recurrence_interval INTEGER NOT NULL DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'recurrence_end_date'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN recurrence_end_date DATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'sla_minutes'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN sla_minutes INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'sla_due_at'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN sla_due_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'sla_breached_at'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN sla_breached_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'escalated_at'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN escalated_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'escalated_to_username'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN escalated_to_username VARCHAR(120);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'escalation_level'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN escalation_level INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'source_callback_date'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN source_callback_date DATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'created_by_user_id'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN created_by_user_id BIGINT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'created_by_username'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN created_by_username VARCHAR(120);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lead_tasks' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE lead_tasks ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lead_tasks_priority_chk'
  ) THEN
    ALTER TABLE lead_tasks
      ADD CONSTRAINT lead_tasks_priority_chk
      CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lead_tasks_status_chk'
  ) THEN
    ALTER TABLE lead_tasks
      ADD CONSTRAINT lead_tasks_status_chk
      CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled', 'escalated'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lead_tasks_recurrence_rule_chk'
  ) THEN
    ALTER TABLE lead_tasks
      ADD CONSTRAINT lead_tasks_recurrence_rule_chk
      CHECK (recurrence_rule IN ('none', 'daily', 'weekly', 'monthly'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lead_tasks_recurrence_interval_chk'
  ) THEN
    ALTER TABLE lead_tasks
      ADD CONSTRAINT lead_tasks_recurrence_interval_chk
      CHECK (recurrence_interval >= 1 AND recurrence_interval <= 365);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lead_tasks_sla_minutes_chk'
  ) THEN
    ALTER TABLE lead_tasks
      ADD CONSTRAINT lead_tasks_sla_minutes_chk
      CHECK (sla_minutes IS NULL OR (sla_minutes >= 1 AND sla_minutes <= 525600));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lead_tasks_escalation_level_chk'
  ) THEN
    ALTER TABLE lead_tasks
      ADD CONSTRAINT lead_tasks_escalation_level_chk
      CHECK (escalation_level >= 0 AND escalation_level <= 10);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lead_tasks_owner_due ON lead_tasks (owner_username, due_date, due_at, status);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_owner_team_due ON lead_tasks (owner_team, due_date, due_at, status);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_status_due ON lead_tasks (status, due_at, due_date);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_related_lead ON lead_tasks (related_lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_escalation_pending
  ON lead_tasks (due_at, due_date)
  WHERE status IN ('pending', 'in_progress', 'escalated') AND completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lead_tasks_sla_due
  ON lead_tasks (sla_due_at)
  WHERE status IN ('pending', 'in_progress', 'escalated') AND completed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_tasks_callback_lead
  ON lead_tasks (related_lead_id)
  WHERE task_type = 'callback' AND related_lead_id IS NOT NULL;

INSERT INTO lead_tasks (
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
  created_by_username
)
SELECT
  'callback',
  'Callback pendiente',
  'Task generada automaticamente desde callback_date de lead.',
  'normal',
  CASE
    WHEN l.callback_completed_at IS NOT NULL THEN 'completed'
    WHEN l.callback_date < CURRENT_DATE THEN 'escalated'
    ELSE 'pending'
  END,
  COALESCE(NULLIF(btrim(l.assigned_to), ''), 'sistema'),
  NULL,
  l.id,
  l.callback_date::date,
  (l.callback_date::date::timestamp + INTERVAL '23 hours 59 minutes'),
  l.callback_completed_at,
  'none',
  1,
  1440,
  (l.callback_date::date::timestamp + INTERVAL '23 hours 59 minutes'),
  l.callback_date::date,
  jsonb_build_object('legacy_callback_sync', TRUE),
  'migration.callback'
FROM leads l
WHERE l.callback_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM lead_tasks t
    WHERE t.task_type = 'callback'
      AND t.related_lead_id = l.id
  );

-- ============================================
-- TABLA: Historial de etapas del pipeline
-- ============================================
CREATE TABLE IF NOT EXISTS lead_stage_history (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_status VARCHAR(120),
  to_status VARCHAR(120) NOT NULL,
  from_stage_key VARCHAR(40),
  to_stage_key VARCHAR(40),
  changed_by_user_id BIGINT,
  changed_by_username VARCHAR(120),
  request_id VARCHAR(120),
  change_reason VARCHAR(240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead_created ON lead_stage_history (lead_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_lead_stage_history_to_stage_created ON lead_stage_history (to_stage_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_stage_history_actor_created ON lead_stage_history (changed_by_username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_stage_history_actor_id_created ON lead_stage_history (changed_by_user_id, created_at DESC);

INSERT INTO lead_stage_history (lead_id, from_status, to_status, from_stage_key, to_stage_key, change_reason)
SELECT l.id, NULL, l.status, NULL, NULL, 'migration.baseline'
FROM leads l
WHERE l.status IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM lead_stage_history h
    WHERE h.lead_id = l.id
  );

-- ============================================
-- TABLA: Historial de correos enviados
-- ============================================
CREATE TABLE IF NOT EXISTS sent_emails (
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
);

CREATE INDEX IF NOT EXISTS idx_sent_emails_author_created ON sent_emails (author_username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sent_emails_lead_created ON sent_emails (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sent_emails_status ON sent_emails (status);

-- ============================================
-- TABLA: Usuarios de la app (autenticacion + RBAC)
-- ============================================
CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(120) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'seller',
  email VARCHAR(160),
  pin_salt VARCHAR(200) NOT NULL DEFAULT '',
  pin_hash VARCHAR(300) NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'display_name'
  ) THEN
    ALTER TABLE app_users ADD COLUMN display_name VARCHAR(120) NOT NULL DEFAULT 'Usuario';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'role'
  ) THEN
    ALTER TABLE app_users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'seller';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'email'
  ) THEN
    ALTER TABLE app_users ADD COLUMN email VARCHAR(160);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'pin_salt'
  ) THEN
    ALTER TABLE app_users ADD COLUMN pin_salt VARCHAR(200) NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'pin_hash'
  ) THEN
    ALTER TABLE app_users ADD COLUMN pin_hash VARCHAR(300) NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE app_users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'last_login_at'
  ) THEN
    ALTER TABLE app_users ADD COLUMN last_login_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'last_seen_at'
  ) THEN
    ALTER TABLE app_users ADD COLUMN last_seen_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE app_users ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE app_users ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  UPDATE app_users SET username = lower(btrim(username));
  UPDATE app_users SET display_name = 'Usuario' WHERE display_name IS NULL OR btrim(display_name) = '';
  UPDATE app_users SET role = lower(btrim(role));
  UPDATE app_users SET role = 'seller' WHERE role IS NULL OR role NOT IN ('admin', 'supervisor', 'seller');
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_username_lower ON app_users ((lower(username)));
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_email_lower ON app_users ((lower(email))) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_users_role_active ON app_users (role, is_active);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  refresh_token_hash VARCHAR(128) NOT NULL UNIQUE,
  refresh_token_expires_at TIMESTAMPTZ NOT NULL,
  created_ip VARCHAR(80),
  created_user_agent VARCHAR(300),
  last_seen_at TIMESTAMPTZ,
  replaced_by_session_id BIGINT REFERENCES auth_sessions(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auth_sessions' AND column_name = 'created_ip'
  ) THEN
    ALTER TABLE auth_sessions ADD COLUMN created_ip VARCHAR(80);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auth_sessions' AND column_name = 'created_user_agent'
  ) THEN
    ALTER TABLE auth_sessions ADD COLUMN created_user_agent VARCHAR(300);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auth_sessions' AND column_name = 'last_seen_at'
  ) THEN
    ALTER TABLE auth_sessions ADD COLUMN last_seen_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auth_sessions' AND column_name = 'replaced_by_session_id'
  ) THEN
    ALTER TABLE auth_sessions ADD COLUMN replaced_by_session_id BIGINT REFERENCES auth_sessions(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auth_sessions' AND column_name = 'revoked_at'
  ) THEN
    ALTER TABLE auth_sessions ADD COLUMN revoked_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auth_sessions' AND column_name = 'revoked_reason'
  ) THEN
    ALTER TABLE auth_sessions ADD COLUMN revoked_reason VARCHAR(160);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auth_sessions' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE auth_sessions ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auth_sessions' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE auth_sessions ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active ON auth_sessions (user_id, revoked_at, refresh_token_expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_last_seen ON auth_sessions (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  actor_username VARCHAR(120),
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(120),
  request_id VARCHAR(120),
  ip_address VARCHAR(80),
  http_method VARCHAR(10),
  route_path VARCHAR(200),
  before_data JSONB,
  after_data JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'actor_user_id'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN actor_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'actor_username'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN actor_username VARCHAR(120);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'action'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN action VARCHAR(120) NOT NULL DEFAULT 'unknown';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'entity_type'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN entity_type VARCHAR(80) NOT NULL DEFAULT 'unknown';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'entity_id'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN entity_id VARCHAR(120);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'request_id'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN request_id VARCHAR(120);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'ip_address'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN ip_address VARCHAR(80);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'http_method'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN http_method VARCHAR(10);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'route_path'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN route_path VARCHAR(200);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'before_data'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN before_data JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'after_data'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN after_data JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN metadata JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_user_id ON audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_request_id ON audit_log (request_id);

CREATE TABLE IF NOT EXISTS permission_catalog (
  key VARCHAR(120) PRIMARY KEY,
  module VARCHAR(80) NOT NULL,
  label VARCHAR(120) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permission_catalog' AND column_name = 'module'
  ) THEN
    ALTER TABLE permission_catalog ADD COLUMN module VARCHAR(80) NOT NULL DEFAULT 'general';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permission_catalog' AND column_name = 'label'
  ) THEN
    ALTER TABLE permission_catalog ADD COLUMN label VARCHAR(120) NOT NULL DEFAULT 'Permiso';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permission_catalog' AND column_name = 'description'
  ) THEN
    ALTER TABLE permission_catalog ADD COLUMN description TEXT NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permission_catalog' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE permission_catalog ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'permission_catalog' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE permission_catalog ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS role_permissions (
  role VARCHAR(20) NOT NULL,
  permission_key VARCHAR(120) NOT NULL REFERENCES permission_catalog(key) ON DELETE CASCADE,
  allowed BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role, permission_key)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'role_permissions' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE role_permissions ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'role_permissions' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE role_permissions ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  permission_key VARCHAR(120) NOT NULL REFERENCES permission_catalog(key) ON DELETE CASCADE,
  allowed BOOLEAN NOT NULL,
  updated_by_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, permission_key)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_permissions' AND column_name = 'updated_by_user_id'
  ) THEN
    ALTER TABLE user_permissions ADD COLUMN updated_by_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_permissions' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE user_permissions ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_permissions' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE user_permissions ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions (role);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_key ON user_permissions (permission_key);

INSERT INTO permission_catalog (key, module, label, description)
VALUES
  ('users.manage', 'usuarios', 'Gestionar usuarios', 'Crear, editar, activar o desactivar usuarios.'),
  ('users.permissions.manage', 'usuarios', 'Gestionar permisos', 'Asignar o revocar permisos granulares por usuario.'),
  ('leads.view_all', 'leads', 'Ver todos los leads', 'Acceso global al listado de leads.'),
  ('leads.view_assigned', 'leads', 'Ver leads asignados', 'Ver leads asignados al usuario.'),
  ('leads.create', 'leads', 'Crear leads', 'Crear nuevos leads.'),
  ('leads.edit', 'leads', 'Editar leads', 'Modificar datos de leads.'),
  ('leads.assign', 'leads', 'Asignar leads', 'Reasignar leads a otros usuarios.'),
  ('leads.delete', 'leads', 'Eliminar leads', 'Eliminar leads del sistema.'),
  ('notes.manage', 'leads', 'Gestionar notas', 'Crear, editar y eliminar notas de leads.'),
  ('emails.view_all', 'correos', 'Ver todos los correos', 'Acceso global al historial de correos.'),
  ('emails.send', 'correos', 'Enviar/registrar correos', 'Registrar y enviar correos desde el CRM.'),
  ('emails.delete', 'correos', 'Eliminar correos', 'Eliminar correos individuales o en lote.'),
  ('callbacks.view_all', 'operacion', 'Ver callbacks globales', 'Ver callbacks de todos los asesores.'),
  ('callbacks.complete_assigned', 'operacion', 'Completar callbacks asignados', 'Completar callbacks de leads asignados.'),
  ('files.manage', 'documentos', 'Gestionar archivos', 'Subir, consultar y eliminar archivos de leads.'),
  ('tasks.manage', 'operacion', 'Gestionar tareas', 'Crear y actualizar tareas operativas.'),
  ('audit.view', 'auditoria', 'Ver auditoria', 'Consultar y exportar bitacora de auditoria.')
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    updated_at = CURRENT_TIMESTAMP;

WITH matrix(role, permission_key, allowed) AS (
  VALUES
    ('admin', 'users.manage', TRUE),
    ('admin', 'users.permissions.manage', TRUE),
    ('admin', 'leads.view_all', TRUE),
    ('admin', 'leads.view_assigned', TRUE),
    ('admin', 'leads.create', TRUE),
    ('admin', 'leads.edit', TRUE),
    ('admin', 'leads.assign', TRUE),
    ('admin', 'leads.delete', TRUE),
    ('admin', 'notes.manage', TRUE),
    ('admin', 'emails.view_all', TRUE),
    ('admin', 'emails.send', TRUE),
    ('admin', 'emails.delete', TRUE),
    ('admin', 'callbacks.view_all', TRUE),
    ('admin', 'callbacks.complete_assigned', TRUE),
    ('admin', 'files.manage', TRUE),
    ('admin', 'tasks.manage', TRUE),
    ('admin', 'audit.view', TRUE),

    ('supervisor', 'users.manage', FALSE),
    ('supervisor', 'users.permissions.manage', FALSE),
    ('supervisor', 'leads.view_all', TRUE),
    ('supervisor', 'leads.view_assigned', TRUE),
    ('supervisor', 'leads.create', TRUE),
    ('supervisor', 'leads.edit', TRUE),
    ('supervisor', 'leads.assign', TRUE),
    ('supervisor', 'leads.delete', TRUE),
    ('supervisor', 'notes.manage', TRUE),
    ('supervisor', 'emails.view_all', TRUE),
    ('supervisor', 'emails.send', TRUE),
    ('supervisor', 'emails.delete', TRUE),
    ('supervisor', 'callbacks.view_all', TRUE),
    ('supervisor', 'callbacks.complete_assigned', TRUE),
    ('supervisor', 'files.manage', TRUE),
    ('supervisor', 'tasks.manage', TRUE),
    ('supervisor', 'audit.view', TRUE),

    ('seller', 'users.manage', FALSE),
    ('seller', 'users.permissions.manage', FALSE),
    ('seller', 'leads.view_all', FALSE),
    ('seller', 'leads.view_assigned', TRUE),
    ('seller', 'leads.create', TRUE),
    ('seller', 'leads.edit', TRUE),
    ('seller', 'leads.assign', FALSE),
    ('seller', 'leads.delete', FALSE),
    ('seller', 'notes.manage', TRUE),
    ('seller', 'emails.view_all', FALSE),
    ('seller', 'emails.send', TRUE),
    ('seller', 'emails.delete', FALSE),
    ('seller', 'callbacks.view_all', FALSE),
    ('seller', 'callbacks.complete_assigned', TRUE),
    ('seller', 'files.manage', TRUE),
    ('seller', 'tasks.manage', TRUE),
    ('seller', 'audit.view', FALSE)
)
INSERT INTO role_permissions (role, permission_key, allowed)
SELECT lower(m.role), m.permission_key, m.allowed
FROM matrix m
JOIN permission_catalog pc ON pc.key = m.permission_key
ON CONFLICT (role, permission_key) DO UPDATE
SET allowed = EXCLUDED.allowed,
    updated_at = CURRENT_TIMESTAMP;
