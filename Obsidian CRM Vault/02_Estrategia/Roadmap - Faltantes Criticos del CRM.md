# Roadmap - Faltantes Criticos del CRM
Fecha: 2026-02-25
Fuente: Analisis funcional/técnico del estado actual de PROJECT-GW

## Lo que ya esta fuerte
- Leads + edicion + asignacion + callbacks + duplicados.
- Notas, templates, archivos por lead.
- Calendario/agenda y notificaciones.
- Correos con historial y control basico por rol.
- Modulos de banking, budget y creditors.
- Backend Express + PostgreSQL con migraciones.

## Gaps prioritarios (orden recomendado)
1. Seguridad y autenticacion real (critico)
- Migrar de `AUTH_USERS` hardcodeado a usuarios en DB.
- Hash de credenciales (no PIN plano), sesion/JWT real, expiracion/revocacion.
- Endurecer autorizacion backend por endpoint (RBAC real).

2. Gestion formal de usuarios y permisos
- Modulo admin para crear/editar/desactivar usuarios.
- Roles y permisos granulares por accion/modulo.
- Reasignacion masiva de leads.

3. Auditoria completa
- Tabla/log de auditoria para cambios criticos.
- Registrar: actor, accion, antes/despues, timestamp, entidad, IP/request_id.

4. Pipeline y reporteria comercial
- Pipeline visual por etapas con SLA.
- Motivos normalizados (loss/no qualify).
- KPI por agente/source/campana/periodo.

5. Tareas operativas completas
- Tareas generales (no solo callback): prioridad, vencimiento, owner, recurrencia.
- Recordatorios y escalamiento automatico.

## Gaps de compliance y produccion
6. Secretos y configuracion
- Quitar keys hardcodeadas del codigo y mover a `.env`/secret manager.
- Rotacion de credenciales y control de acceso a secretos.

7. Compliance credit pull (Fase 07)
- Evidencia de consentimiento y permissible purpose (FCRA).
- Enmascaramiento de SSN/PII en logs/respuestas.
- Auditoria obligatoria de cada pull.

8. Observabilidad y resiliencia
- Logging estructurado y trazabilidad por request.
- Monitoreo, alertas y healthchecks extendidos.
- Procedimiento probado de backup/restore.

9. Automatizaciones
- Reglas automáticas por estatus/tiempo sin contacto.
- Disparadores de tareas/notificaciones/escalaciones.

10. QA y entregas
- Tests de endpoints criticos + smoke tests UI.
- Checklist de release y rollback.

## Plan sugerido por fases (corto)
- Fase A (1-2 semanas): Seguridad auth/RBAC + secretos + auditoria minima.
- Fase B (1-2 semanas): Pipeline/KPI + tareas completas.
- Fase C (1-2 semanas): Automatizaciones + observabilidad + QA base.
- Fase D: Pull Credit productivo con compliance completo.

## Acciones inmediatas (esta semana)
1. Diseñar modelo `app_users` y permisos.
2. Eliminar secretos hardcodeados del backend.
3. Implementar `audit_log` para operaciones criticas.
4. Definir tablero minimo de KPI de conversion.

## Estado rapido 2026-02-26
- Gap 1 (Seguridad y autenticacion real): **Parcialmente resuelto**
  - JWT activo.
  - Middleware de auth en API.
  - RBAC base activo en backend.
  - `app_users` implementado con hash/salt de PIN.
- Gap 2 (Gestion formal de usuarios y permisos): **Parcialmente resuelto**
  - Vista admin para crear/editar/desactivar usuarios.
  - Falta granularidad fina de permisos por modulo/accion.
- Gap 3 (Auditoria completa): **Pendiente**
  - Aun falta tabla dedicada `audit_log` con before/after.
- Gap 6 (Secretos y configuracion): **En progreso**
  - Se avanzo en migracion de auth, falta terminar retiro de hardcodes restantes.

## Proximo foco recomendado
1. Implementar `audit_log` end-to-end.
2. Definir matriz de permisos granulares.
3. Completar hardening de secretos/configuracion.
