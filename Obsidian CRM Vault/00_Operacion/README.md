# PROJECT-GW

Base CRM con frontend web + backend Express + PostgreSQL local.

## Requisitos
- Node.js 20+
- PostgreSQL 17 instalado en `C:\Program Files\PostgreSQL\17\bin`

## Inicio rapido
1. Inicializar PostgreSQL local del proyecto:
   - `npm run db:init-local`
2. Levantar servidor backend + frontend estatico:
   - `npm start`
3. Abrir en navegador:
   - `http://localhost:3000`

## Comandos de base de datos
- Iniciar PostgreSQL local: `npm run db:start-local`
- Detener PostgreSQL local: `npm run db:stop-local`

## Variables de entorno
Usa `.env` (ya incluido para entorno local) o copia de `.env.example`.

## Endpoints
- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/leads`
- `POST /api/leads`
