# Atajos Operativos (PROJECT-GW)

Fecha: 2026-02-26

## Post-Pull Obligatorio (antes de levantar servidor)
1. Actualizar repo:
   - `git pull origin main`
2. Sincronizar dependencias del backend:
   - `npm install`
3. Verificar prerequisito de contratos PDF (Python):
   - Debe existir `python` en PATH (o configurar `PYTHON_BIN` en `.env`).
   - Instalar dependencia Python: `pip install pymupdf`
   - Verificar rapido: `python -c "import fitz; print('ok')"`
4. Verificar variables criticas de auth en `.env`:
   - `JWT_SECRET=...`
   - `JWT_EXPIRES_IN=12h`
   - `CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000`
5. Si aparece error `Cannot find module 'jsonwebtoken'` al correr `npm start`:
   - Ejecutar de nuevo `npm install`
   - Reintentar `npm start`
6. Si aparece error `JWT_SECRET no esta configurado`:
   - Agregar `JWT_SECRET` en `.env`
   - Reintentar `npm start`

## Arranque Diario (SIEMPRE PostgreSQL)
1. Entrar al proyecto:
   - `cd C:\Users\trolo\Desktop\PROJECT-GW`
2. Levantar PostgreSQL local (puerto `5433`):
   - `npm run db:start-local`
3. Levantar backend real:
   - `npm start`
4. Validar salud:
   - `http://localhost:3000/api/health`
   - Esperado: `{"ok":true,"message":"Server y PostgreSQL conectados."}`

## Comando Rapido (copiar/pegar)
`cd C:\Users\trolo\Desktop\PROJECT-GW; npm run db:start-local; npm start`

## Regla Clave (obligatoria)
- El proyecto se ejecuta SOLO con backend real (`server/index.js`) y PostgreSQL real.
- Comando valido para backend: `npm start`.

## Cuando Si Correr `db:init-local`
- Primera vez en la maquina.
- Cuando hay cambios de esquema en `db/init.sql`.
- Cuando la DB local se corrompio o quieres reconstruir.

Comando:
- `npm run db:init-local`

Nota:
- `db:init-local` no es para uso diario.
- El backend ejecuta migraciones al arrancar (`runMigrations()`), por eso normalmente basta con reiniciar servidor.

## Reinicio Rapido
1. Matar proceso en puerto 3000.
2. Volver a correr:
   - `npm run db:start-local`
   - `npm start`

## Verificaciones Rapidas
- Backend:
  - `http://localhost:3000/api/health`
- Leads:
  - `http://localhost:3000/api/leads`
- Notificaciones:
  - `http://localhost:3000/api/notifications?username=admin`
- Callbacks (PostgreSQL):
  - `http://localhost:3000/api/callbacks?from=2026-02-23`

## Troubleshooting Rapido (presencia / conectado)
- Sintoma: en consola del navegador aparece `POST /api/ping 404` y usuarios salen desconectados.
- Causa comun: backend viejo en memoria o arranque en modo incorrecto.
- Solucion:
  1. Confirmar que estas en backend real: usa `npm start`.
  2. Reiniciar backend en puerto 3000:
     - Cerrar proceso actual en 3000.
     - Correr de nuevo `npm run db:start-local` y `npm start`.
  3. En navegador hacer hard refresh (`Ctrl+F5`).
  4. Si sigue igual, cerrar sesion y volver a entrar para refrescar token/sesion.

## Checklist de Arranque Correcto
- En consola debe aparecer: `Servidor activo en http://localhost:3000`
- `GET /api/health` debe responder `ok: true`
- Al editar callback date en un lead, debe persistir tras recargar pantalla
- Badge de notificaciones debe reflejar callbacks desde DB (no localStorage)

## Notas de Notificaciones/Callbacks (migrado a PostgreSQL)
- La ventana de notificaciones de `client.html` ya no depende de `localStorage`.
- El calendario de callback guarda en DB via `PATCH /api/leads/:id` usando `callbackDate`.
- Datos de callbacks para badge/modal salen de `GET /api/callbacks`.

## Archivos Clave
- Backend: `server/index.js`
- Conexion DB: `server/db.js`
- Migraciones/DDL: `db/init.sql`
- Frontend lead: `client.js`
