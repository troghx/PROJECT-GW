# Atajos Operativos (PROJECT-GW)

Fecha: 2026-02-23

## Arranque Diario (SIEMPRE PostgreSQL)
1. Entrar al proyecto:
   - `cd C:\Users\Windows 10\Desktop\varios\CD\PROJECT-GW`
2. Levantar PostgreSQL local (puerto `5433`):
   - `npm run db:start-local`
3. Levantar backend real:
   - `npm start`
4. Validar salud:
   - `http://localhost:3000/api/health`
   - Esperado: `{"ok":true,"message":"Server y PostgreSQL conectados."}`

## Comando Rapido (copiar/pegar)
`cd C:\Users\Windows 10\Desktop\varios\CD\PROJECT-GW; npm run db:start-local; npm start`

## Regla Clave (para no romper flujo)
- NO usar `npm run start:mock` para trabajo normal.
- `start:mock` solo sirve para pruebas aisladas sin PostgreSQL.
- Si corres `start:mock`, callbacks/notificaciones no reflejan la DB real.

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
