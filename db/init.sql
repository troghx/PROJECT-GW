-- Tabla de leads actualizada
CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  case_id INTEGER UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  co_applicant_name VARCHAR(120),
  email VARCHAR(160),
  phone VARCHAR(40),
  source VARCHAR(60),
  state_code VARCHAR(2),
  first_deposit_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'New Lead',
  is_test BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
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

-- Índices
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_case_id ON leads (case_id);
CREATE INDEX IF NOT EXISTS idx_leads_is_test ON leads (is_test);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads (assigned_to);

-- Secuencia para case_id empezando en 10001
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'leads_case_id_seq') THEN
    CREATE SEQUENCE leads_case_id_seq START WITH 10001;
  END IF;
END $$;
