---
tipo: roadmap-ejecucion
proyecto: PROJECT-GW
fase: "Fase 06"
estado: en-progreso
fecha: 2026-02-24
---

# PROJECT-GW - Fase 06: Correos + Roles

## Objetivo
Activar el botón `Correos` con historial real desde PostgreSQL y controlarlo por rol (`Admin` / `Seller`).

## Checklist de fase
- [x] Definir alcance funcional de la fase (roles, vista, envíos, auditoría).
- [x] Definir roles iniciales objetivo: `Admin` y `Seller`.
- [x] Actualizar cuenta demo seller a `Demo Seller`.
- [x] Registrar correo de primera cuenta admin real: `Elliot.Perez@cerodeuda.com`.
- [ ] Crear modelo DB para usuarios (`app_users`) y mover autenticación a DB.
- [ ] Crear modelo DB de correos enviados (`sent_emails`) con índices.
- [ ] Implementar endpoints de correos con control por rol.
- [ ] Conectar botón `Correos` (toolbar) a panel/modal de historial.
- [ ] Integrar envío real Outlook (SMTP o Graph) y registrar estado (`sent/failed`).
- [ ] Aplicar permisos finales:
  - [ ] Admin ve todos los correos.
  - [ ] Seller ve solo autoría propia o leads asignados.
- [ ] Pruebas E2E con `admin` y `elliot`.

## Estado actual (hoy)
- Backend actualizado para que:
  - `admin` use rol `Admin` y correo `Elliot.Perez@cerodeuda.com`.
  - `elliot` use displayName `Demo Seller` y rol `Seller`.
- Login ahora devuelve: `username`, `displayName`, `role`, `email`.

## Orden de implementación
1. Migración DB de usuarios (`app_users`).
2. Migración DB de correos (`sent_emails`).
3. API de correos + filtros por rol.
4. UI del botón `Correos` en toolbar (index/client).
5. Integración Outlook + auditoría.
6. QA por rol y hardening.

## Notas
- Mantener PostgreSQL real (`npm run db:start-local` + `npm start`).
- No usar `start:mock` para esta fase.
## Avance 2026-02-24 (Auth UX)
- [x] Login permite acceso por usuario o correo.
- [x] Login migrado a PIN de 6 digitos.
- [x] UI de login con 6 circulos y keypad numerico tipo iPhone (compacto).
- [x] Captura de PIN por teclado fisico y por click en keypad.
- [x] Credenciales demo actualizadas: admin PIN 112233, elliot PIN 654321.


