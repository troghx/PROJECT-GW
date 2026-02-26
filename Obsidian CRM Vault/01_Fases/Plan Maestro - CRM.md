# Plan Maestro - CRM
Fecha: 2026-02-26
Alcance: Completar CRM sin incluir integracion API de correo ni API de reportes de credito.
Referencia: [[../02_Estrategia/Faltantes Criticos - CRM|Faltantes Criticos - CRM]]

## Estado global
- Fase activa: Fase 2 en progreso.
- Prioridad de ejecucion: Seguridad -> Permisos -> Auditoria -> Operacion/KPI.

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
- [ ] Crear tabla `audit_log`.
- [ ] Registrar before/after en operaciones criticas.
- [ ] Guardar actor, request_id, ip, timestamp.
- [ ] Vista de consulta/export de auditoria.

## Fase 3 - Pipeline y KPI
- [ ] Catalogo formal de etapas y transiciones validas.
- [ ] Historial de cambios de etapa por lead.
- [ ] Tablero KPI (conversion, aging, win/loss, productividad).
- [ ] Filtros por agente/fuente/periodo.

## Fase 4 - Tareas Operativas Completas
- [ ] Tabla de tareas general (no solo callback).
- [ ] Prioridad, vencimiento, recurrencia y SLA.
- [ ] Escalamiento automatico.
- [ ] Bandeja de tareas por usuario/equipo.

## Fase 5 - Compliance y Proteccion de PII
- [ ] Cifrado/mascarado para SSN y cuenta bancaria.
- [ ] Politica de acceso y export de PII.
- [ ] Redaccion de logs sensibles.
- [ ] Checklist de cumplimiento operativo.

## Fase 6 - Observabilidad y QA
- [ ] Logging estructurado con correlacion por request.
- [ ] Monitoreo, alertas y healthchecks extendidos.
- [ ] Plan de backup/restore probado.
- [ ] Suite minima de tests + CI.

## Definicion de Hecho
- Cada fase cierra con evidencia en PR/commit + validacion funcional.
- No se avanza de fase con pendientes criticos de seguridad/datos.
