# Fase 06 - Correos + Roles + Cuenta Admin Outlook
Fecha: 2026-02-24
Estado: En progreso (actualizado 2026-02-25)

## Objetivo de la fase
Hacer funcional el boton `Correos` de la toolbar para ver historial de correos enviados desde la plataforma, con visibilidad por rol:
- `Admin`: ve todos los correos.
- `Seller`: ve correos de su autoria o relacionados con sus leads.

Tambien formalizar cuentas con roles (`Admin`, `Seller`) y preparar cuenta de administrador vinculada a correo real de empresa (Outlook).

---

## Estado actual (checkpoint 2026-02-25)
### Completado
- `Paso 2` (modelo de correos en PostgreSQL): tabla `sent_emails` y indices activos.
- Endpoints de historial y borrado de correos activos:
  - `GET /api/emails`
  - `DELETE /api/emails/:id`
  - `POST /api/emails/bulk-delete`
- Endpoint de envio interno (registro + permisos por rol) activo:
  - `POST /api/emails/send`
- UI del lead (`client.html`) ya permite:
  - abrir panel `Correos`,
  - `Crear nuevo correo` con composer interno,
  - `Enviar contrato` con modal separado + vista previa del contrato.
- Desde la toolbar dentro de `client.html`, el boton `Correos` ya navega a `index.html#emails`.

### Pendiente para cerrar envio real con Outlook (delegated)
- Configuracion corporativa en Microsoft Entra ID (por parte de la empresa).
- Datos requeridos para integracion:
  1. `TENANT_ID`
  2. `CLIENT_ID`
  3. `CLIENT_SECRET`
  4. `REDIRECT_URI` (ejemplo local: `http://localhost:3000/api/outlook/callback`)
- Permisos delegados requeridos en la app de Entra:
  - `Mail.Send`
  - `offline_access`
  - `User.Read`
  - `openid`
  - `profile`
- Definir consentimiento admin de tenant para esos scopes.

### Siguiente implementacion al recibir credenciales
1. Crear flujo OAuth delegated:
   - `GET /api/outlook/connect`
   - `GET /api/outlook/callback`
2. Guardar tokens por usuario (backend, no en frontend).
3. Cambiar `POST /api/emails/send` para enviar por Microsoft Graph (`/me/sendMail`) y registrar `status/provider_message_id`.
4. Mantener fallback a registro `failed` con `error_message` para auditoria.

---

## Alcance funcional
1. Roles y permisos visibles en backend/frontend.
2. Modulo de correos con registro en PostgreSQL.
3. Vista de correos desde el boton `Correos` en la toolbar (index/client).
4. Integracion de envio de correo (Outlook) con auditoria.
5. Cuenta admin con email real de empresa (sin exponer credenciales en git).

---

## Matriz inicial de roles
### Admin
- Ver todos los correos.
- Filtrar por usuario/lead/estado/fecha.
- Ver detalle completo (to/cc/subject/status/error).
- Reintentar envio fallido.
- Gestionar cuentas/roles de usuarios.

### Seller
- Ver correos:
  - enviados por el mismo usuario, o
  - ligados a leads asignados a ese usuario.
- Ver detalle basico + estado.
- Enviar correo solo en su contexto permitido.

---

## Plan por orden (implementacion recomendada)

## Paso 1 - Normalizar identidad y roles (base segura)
### Backend
- Crear tabla `app_users` en `db/init.sql`:
  - `id`, `username` (unique, lowercase), `display_name`, `role` (`admin|seller`), `email`, `is_active`, `password_hash`, `created_at`, `updated_at`.
- Mantener compatibilidad temporal con `AUTH_USERS` y migrar gradualmente.
- Ajustar login para devolver:
  - `username` tecnico (estable, lowercase)
  - `displayName`
  - `role`
  - `email`

### Frontend
- Guardar sesion con esos campos (no depender de displayName para permisos).
- Alinear usuario actual:
  - `admin` => rol `admin`
  - `elliot` => rol `seller`

### Criterio de salida
- Roles confiables en sesion y backend sin romper login actual.

---

## Paso 2 - Modelo de correos (PostgreSQL)
### DB
- Crear tabla `sent_emails`:
  - `id`
  - `lead_id` (nullable)
  - `author_username` (usuario de la app que lo envio)
  - `from_email`
  - `to_email`
  - `cc_emails` (jsonb)
  - `subject`
  - `body_preview`
  - `provider` (`outlook_smtp|graph|mock`)
  - `provider_message_id`
  - `status` (`queued|sent|failed`)
  - `error_message`
  - `created_at`, `sent_at`
- Indices:
  - por `author_username, created_at desc`
  - por `lead_id, created_at desc`
  - por `status`

### API
- `GET /api/emails`
  - Admin: todo
  - Seller: filtro por autoria o lead asignado.
- `GET /api/emails/:id`
  - validacion por rol.

### Criterio de salida
- Historial de correos accesible por API con control de acceso por rol.

---

## Paso 3 - Hacer funcional boton Correos (UI)
### Toolbar
- Conectar boton `Correos` (index/client) a modal/panel unico.
- Lista con:
  - Fecha
  - Autor
  - Destinatario
  - Asunto
  - Estado (sent/failed/queued)
  - Lead relacionado (si aplica)

### Detalle
- Vista detalle con subject/body preview/error.
- Enlaces rapidos a lead cuando exista `lead_id`.

### Criterio de salida
- El boton abre historial real desde PostgreSQL y respeta permisos de rol.

---

## Paso 4 - Envio real Outlook (seguro)
### Integracion
- Opcion inicial rapida: SMTP Outlook (`smtp.office365.com:587`) con variables de entorno.
- Opcion robusta corporativa: Microsoft Graph (OAuth2 app registration).

### Seguridad
- Credenciales solo en `.env` (nunca hardcode ni commit).
- Registrar solo metadatos en DB, no secretos.

### API
- `POST /api/emails/send`
  - valida permisos por rol
  - intenta envio provider
  - registra resultado en `sent_emails`

### Criterio de salida
- Envio funcional + auditoria completa por correo.

---

## Paso 5 - Cuenta Admin con correo real de empresa
### Accion
- Crear/actualizar usuario admin en `app_users` con:
  - role = `admin`
  - email = correo Outlook real de empresa
- Mantener `elliot` como `seller`.

### Nota
- Correo admin real ya definido: `Elliot.Perez@cerodeuda.com`.

### Criterio de salida
- Admin autenticado con rol y correo real listos para uso en modulo de correos.

---

## Dependencias
- PostgreSQL activo (`5433`) y backend real (`npm start`).
- Migraciones aplicadas desde `db/init.sql`.
- Definir proveedor de envio (SMTP vs Graph) antes de cerrar Paso 4.

---

## Riesgos y mitigaciones
- Riesgo: romper login actual al mover usuarios a DB.
  - Mitigacion: modo compatibilidad temporal (`AUTH_USERS` fallback).
- Riesgo: permisos inconsistentes por usar displayName.
  - Mitigacion: usar `username` tecnico lowercase como ID unico.
- Riesgo: credenciales Outlook expuestas.
  - Mitigacion: solo `.env`, rotacion y no commit.

---

## Entregables medibles
1. Migracion DB (`app_users`, `sent_emails`) + indices.
2. Endpoints de correos con RBAC.
3. UI de historial de correos conectada al boton `Correos`.
4. Envio Outlook con registro de estado.
5. Cuenta admin real configurada.
