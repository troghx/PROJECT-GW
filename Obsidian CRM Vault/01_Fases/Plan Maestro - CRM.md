# Plan Maestro - CRM
Fecha: 2026-02-28
Alcance: Completar CRM sin incluir integracion API de correo ni API de reportes de credito.
Referencia: [[../02_Estrategia/Faltantes Criticos - CRM|Faltantes Criticos - CRM]]

## Estado global
- Fase activa: Fase 4 cerrada (motor de tareas), Fase 5 en preparacion y Fase 07 abierta para Pull Credit.
- Prioridad de ejecucion: Seguridad -> Permisos -> Auditoria -> Operacion/KPI.

## Diagnostico tecnico (2026-02-27)
- Fase 0: cerrada.
- Fase 1: cerrada.
- Fase 2: cerrada.
- Fase 3: cerrada.
- Fase 4: cerrada (tabla/API de tareas, SLA/recurrencia/escalamiento y bandeja owner/equipo).
- Fase 5: pendiente (hay redaccion parcial en auditoria, pero no cifrado/mascarado integral de PII).
- Fase 6: pendiente (request-id y health basico existen; falta observabilidad/QA end-to-end).
- Fase 07: pendiente (UX lista en frontend, pero backend de soft pull aun no implementado).

## Fase 0 - Hardening Base
- [x] Eliminar usuarios seed en produccion.
- [x] Quitar fallback de secreto JWT hardcodeado.
- [x] Restringir CORS por ambientes.
- [x] Definir manejo seguro de token/sesion.

## Fase 1 - RBAC Granular
- [x] Modelo de permisos por modulo/accion.
- [x] Matriz de roles (admin, seller, supervisor, qa).
- [x] Middleware por permiso (no solo por rol).
- [x] UI de gestion de permisos.

## Fase 2 - Auditoria End-to-End
- [x] Crear tabla `audit_log`.
- [x] Registrar before/after en operaciones criticas.
- [x] Guardar actor, request_id, ip, timestamp.
- [x] Vista de consulta/export de auditoria (API admin).
- [x] Historial por lead en UI + accion de deshacer cambios desde auditoria.

## Fase 3 - Pipeline y KPI
- [x] Catalogo formal de etapas y transiciones validas.
- [x] Historial de cambios de etapa por lead.
- [x] KPI de pipeline por API (conversion, aging, win/loss, productividad).
- [x] Filtros por agente/fuente/periodo (endpoint KPI).

## Fase 4 - Tareas Operativas Completas
- [x] Tabla de tareas general (no solo callback).
- [x] Prioridad, vencimiento, recurrencia y SLA.
- [x] Escalamiento automatico.
- [x] Bandeja de tareas por usuario/equipo.

## Fase 5 - Compliance y Proteccion de PII
- [ ] Cifrado/mascarado para SSN y cuenta bancaria. (Omitir esto)
- [ ] Politica de acceso y export de PII.
- [ ] Redaccion de logs sensibles (parcial en `audit_log`; falta cobertura integral).
- [ ] Checklist de cumplimiento operativo.

## Fase 6 - Observabilidad y QA
- [ ] Logging estructurado con correlacion por request (request-id base ya existe).
- [ ] Monitoreo, alertas y healthchecks extendidos (solo `/api/health` basico implementado).
- [ ] Plan de backup/restore probado.
- [ ] Suite minima de tests + CI.

## Fase 07 - Pull Credit (Soft Pull + Array)
- [ ] Endpoint backend de pull por `applicant/coapp`.
- [ ] Consentimiento explicito con evidencia trazable por lead.
- [ ] Integracion de proveedor (sandbox/prod) y manejo de credenciales por entorno.
- [ ] Persistencia/auditoria de request-respuesta y score resultante.
- [ ] Feature flag para activacion controlada.

## Definicion de Hecho
- Cada fase cierra con evidencia en PR/commit + validacion funcional.
- No se avanza de fase con pendientes criticos de seguridad/datos.
