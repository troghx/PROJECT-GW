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
  calc_total_debt NUMERIC(12,2) NOT NULL DEFAULT 0,
  calc_settlement_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  calc_program_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  calc_bank_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
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

  UPDATE leads SET calc_settlement_percent = 0 WHERE calc_settlement_percent IS NULL;
  ALTER TABLE leads ALTER COLUMN calc_settlement_percent SET DEFAULT 0;
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

  UPDATE leads SET calc_program_fee_percent = 0 WHERE calc_program_fee_percent IS NULL;
  ALTER TABLE leads ALTER COLUMN calc_program_fee_percent SET DEFAULT 0;
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

  UPDATE leads SET calc_bank_fee = 0 WHERE calc_bank_fee IS NULL;
  ALTER TABLE leads ALTER COLUMN calc_bank_fee SET DEFAULT 0;
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
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_case_id ON leads (case_id);
CREATE INDEX IF NOT EXISTS idx_leads_is_test ON leads (is_test);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads (assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_related_lead_id ON leads (related_lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id_created_at ON lead_notes (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_templates_owner_name ON note_templates (owner_username, name);

-- Secuencia para case_id empezando en 10001
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'leads_case_id_seq') THEN
    CREATE SEQUENCE leads_case_id_seq START WITH 10001;
  END IF;
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
