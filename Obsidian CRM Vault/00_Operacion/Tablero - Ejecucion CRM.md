# Tablero - Ejecucion CRM
Fecha: 2026-02-28
Estado: En curso

## Sesion actual
- [x] Verificar estado del repo y confirmar que el vault previo fue removido.
- [x] Crear nuevo vault de Obsidian en el repo.
- [x] Crear estructura base de carpetas y notas operativas.
- [x] Trazar plan maestro por fases/pasos.
- [x] Documentar faltantes reales del CRM para ejecucion integral.
- [x] Abrir Obsidian con este vault para seguimiento en vivo.
- [x] Iniciar Fase 0 (hardening backend) y validar arranque/health.
- [x] Redisenar gestion de usuarios (panel deslizante + categorias plegables + cambio de rol por badge).
- [x] Cerrar Fase 0 de sesion/token: refresh rotativo, revocacion en BD, logout real e interceptor frontend con retry.
- [x] Ejecutar Fase 1 RBAC granular: modelo de permisos, matriz por rol, middleware por permiso y UI admin de permisos por usuario.
- [x] Ejecutar Fase 2 backend: `audit_log`, request-id, trazabilidad before/after, actor/ip y endpoints admin de consulta/export.
- [x] Extender Fase 2 UX: historial de cambios por lead + deshacer (`undo`) desde modal, accesible por menu radial dentro del lead.
- [x] Re-auditar estado real del proyecto contra codigo actual (backend + frontend + DB + scripts).
- [x] Confirmar cierre de Fase 0/1/2 y registrar brechas reales de Fase 3/4/5/6.
- [x] Ejecutar Fase 3 backend: catalogo formal de status/etapas + validacion de transiciones.
- [x] Ejecutar Fase 3 backend: historial de etapas por lead (`lead_stage_history`) + endpoint de consulta.
- [x] Ejecutar Fase 3 backend: KPI de pipeline con filtros por periodo/agente/source.
- [x] Ejecutar Fase 4 backend: tabla `lead_tasks` + migracion callback->task.
- [x] Ejecutar Fase 4 backend: API de tareas (crear/listar/actualizar/completar) con SLA/recurrencia.
- [x] Ejecutar Fase 4 backend: escalamiento automatico por vencimiento.
- [x] Ejecutar Fase 4 frontend: calendario conectado a `/api/tasks` con vista owner/equipo.
- [x] Auditar estado tecnico post-pull (codigo + backend + docs) y actualizar vault Obsidian.

## Siguiente bloque sugerido
1. Ejecutar Fase 5 (compliance PII):
   - enmascarado/cifrado de SSN y cuenta bancaria en lectura/serializacion,
   - politica de acceso/export de PII,
   - endurecer redaccion de logs fuera de auditoria.
2. Ejecutar Fase 07 (Pull Credit real):
   - endpoint backend de soft pull para `applicant/coapp`,
   - consentimiento explicito y trazabilidad por request,
   - persistencia de resultado y score por lead.
3. Extender Fase 3 a UI de dashboard:
   - vista KPI consumiendo `/api/kpi/pipeline`,
   - visualizacion de stage-history en lead.
4. Ejecutar Fase 6 (observabilidad y QA minima):
   - logging estructurado y alertas,
   - smoke tests automatizados + CI.

## Hallazgos de auditoria (2026-02-27)
- Fase 0 (hardening): implementada.
- Fase 1 (RBAC): implementada.
- Fase 2 (auditoria): implementada.
- Fase 3: implementada (catalogo/transiciones + historial + KPI API).
- Fase 4: implementada (motor de tareas general + escalamiento + bandeja owner/equipo).
- Fase 5: parcial (redaccion en `audit_log`, sin cifrado/mascarado integral de PII en dominio).
- Fase 6: parcial (request-id + `/api/health`, sin logging estructurado, monitoreo, backup/restore probado, tests/CI).

## Hallazgos de auditoria (2026-02-28)
- Pull Credit sigue sin integracion backend real:
  - `client.js` muestra: "Integracion API pendiente" al disparar Pull Credit.
  - En backend no existe endpoint `/api/...` para ejecutar soft pull; solo analisis de reporte (`/api/creditors/analyze-report`) y CRUD de creditors.
- Riesgo PII aun abierto:
  - `LEAD_SELECT_COLUMNS` incluye `ssn` y `co_applicant_ssn`.
  - `/api/leads/:id/banking` retorna `routing_number`, `account_number`, `ss_number` en claro.
  - Es necesario definir mascara/cifrado + politica por permiso para salida/export.
- QA/CI sigue pendiente:
  - `package.json` no tiene script `test`.
  - No existe `.github/workflows` en repo.
- Dependencia operativa externa:
  - Analisis IA de reporte depende de `GEMINI_API_KEY`; sin clave responde `503` ("IA no configurada").

## Nota de control
No se agrega boton adicional por ahora; el tracking se mantiene con checklist en estas notas.
