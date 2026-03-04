# Atajos Operativos (PROJECT-GW)

Fecha: 2026-03-04

## Lecciones aplicadas hoy (para no repetir errores)
1. Ejecutar TODO desde la carpeta correcta:
   - `cd /d "C:\Users\Windows 10\Desktop\varios\CD\PROJECT-GW"`
2. Este archivo vive en `PROJECT-GW\Atajos.md` (no en la raiz `CD`).
3. Si `npm run db:start-local` parece colgado o da timeout, primero validar puerto `5433` antes de reintentar.
4. Mantener `npm start` en una terminal dedicada (backend real) y validar con `/api/health`.
5. Para cerrar limpio al terminar sesion, usar `shutdown.bat` (nuevo).

## Post-Pull Obligatorio (antes de levantar servidor)
1. Actualizar repo:
   - `git pull origin main`
2. Sincronizar dependencias:
   - `npm install`
3. Verificar prerequisito PDF (Python):
   - `python -c "import fitz; print('ok')"`
4. Verificar variables criticas en `.env`:
   - `JWT_SECRET=...`
   - `JWT_EXPIRES_IN=12h`
   - `CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000`

## Arranque Diario (SIEMPRE PostgreSQL real)
1. Entrar al proyecto:
   - `cd /d "C:\Users\Windows 10\Desktop\varios\CD\PROJECT-GW"`
2. Levantar PostgreSQL local (puerto `5433`):
   - `npm run db:start-local`
3. Si el paso 2 tarda mas de 30-40 segundos:
   - Validar puerto: `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5433 -State Listen -ErrorAction SilentlyContinue"`
   - Si `5433` esta en `Listen`, continuar (ya arranco).
   - Si no esta en `Listen`, ejecutar:
     - `npm run db:stop-local`
     - `npm run db:start-local`
4. Levantar backend real:
   - `npm start`
5. Validar salud:
   - `http://localhost:3000/api/health`
   - Esperado: `{"ok":true,"message":"Server y PostgreSQL conectados."}`

## Reinicio Rapido (limpio)
1. Cerrar backend + PostgreSQL:
   - `shutdown.bat`
2. Levantar de nuevo:
   - `npm run db:start-local`
   - `npm start`

## Comandos Rapidos (copiar/pegar)
1. Arranque:
   - `cd /d "C:\Users\Windows 10\Desktop\varios\CD\PROJECT-GW" && npm run db:start-local && npm start`
2. Health check:
   - `powershell -NoProfile -Command "(Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/health -TimeoutSec 8).Content"`
3. Apagado limpio:
   - `cd /d "C:\Users\Windows 10\Desktop\varios\CD\PROJECT-GW" && shutdown.bat`

## Cuando SI correr `db:init-local`
- Primera vez en la maquina.
- Cambios de esquema en `db/init.sql`.
- DB local corrupta o reconstruccion total.

Comando:
- `npm run db:init-local`

## Checklist de Arranque Correcto
- PostgreSQL escuchando en `127.0.0.1:5433`.
- Consola backend muestra: `Servidor activo en http://localhost:3000`.
- `GET /api/health` responde `ok: true`.

## Archivos Clave
- Backend: `server/index.js`
- Conexion DB: `server/db.js`
- Scripts DB: `scripts/start-postgres.ps1`, `scripts/stop-postgres.ps1`
- Apagado limpio: `shutdown.bat`
