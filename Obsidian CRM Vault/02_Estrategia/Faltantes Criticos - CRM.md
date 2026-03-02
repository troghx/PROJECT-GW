# Faltantes Criticos - CRM
Fecha: 2026-02-28
Estado: En ejecucion
Alcance: Este plan excluye integracion API de correo y API de reportes de credito.

## Resumen Ejecutivo
El CRM ya tiene base funcional fuerte, pero faltan bloques criticos para cerrar nivel produccion y operacion escalable.

## Prioridades Reales (orden de ejecucion)
1. Seguridad de acceso y sesion
- [x] Eliminar usuarios seed/demo automaticos en arranque.
- [x] Eliminar secreto JWT fallback hardcodeado.
- [x] Restringir CORS por entorno.
- [x] Definir estrategia final de sesion/token en frontend.

2. RBAC granular
- [x] Disenar tabla de permisos por accion/modulo.
- [x] Definir matriz de roles (admin/seller/supervisor/qa).
- [x] Aplicar middleware por permiso.
- [x] Conectar permisos granulares en UI admin.

3. Auditoria completa
- [x] Crear `audit_log`.
- [x] Registrar acciones criticas con before/after.
- [x] Guardar actor, request_id, ip y timestamp.
- [x] Agregar vista de consulta/export por filtros (API admin).
- [x] Exponer historial de cambios por lead en UI y permitir undo de cambios auditados.

4. Pipeline comercial y KPI
- [x] Existe base inicial de estado de lead (`status`) y opciones en UI.
- [x] Estandarizar etapas del pipeline + transiciones validas en backend.
- [x] Registrar historial de cambios por lead (`lead_stage_history` + endpoint por lead).
- [x] Implementar KPI de pipeline por API (`/api/kpi/pipeline`).
- [x] Filtros por periodo/agente/source.

5. Tareas operativas completas
- [x] Callbacks y notificaciones operativas ya existen (parcial, orientado a callback).
- [x] Extender modelo de callback a motor general de tareas.
- [x] Agregar prioridad, vencimiento, recurrencia, SLA.
- [x] Escalamiento por vencimiento.
- [x] Vistas por owner/equipo.

6. Compliance y proteccion de datos
- [x] Redaccion parcial aplicada en `audit_log` para `ssn`, `co_applicant_ssn`, tokens y credenciales.
- [ ] Cifrado o enmascarado de PII sensible (SSN, cuenta bancaria).
- [ ] Politica de acceso/export para PII.
- [ ] Redaccion de logs con datos sensibles (faltan logs operativos fuera de auditoria).
- [ ] Checklist de cumplimiento operativo.

7. Observabilidad y resiliencia
- [x] Correlacion base por request (`x-request-id`) y endpoint `/api/health` disponibles (parcial).
- [ ] Logging estructurado con correlacion por request.
- [ ] Monitoreo y alertas operativas.
- [ ] Healthchecks extendidos.
- [ ] Procedimiento backup/restore probado.

8. QA y entrega continua
- [ ] Pruebas API criticas.
- [ ] Smoke tests UI.
- [ ] Pipeline CI para validacion automatica.
- [ ] Checklist de release y rollback.

9. Pull Credit real (Fase 07 operativa)
- [ ] Endpoint backend para ejecutar soft pull por parte (`applicant` / `coapp`).
- [ ] Integracion con proveedor real (credenciales por entorno y contratos vigentes).
- [ ] Evidencia de consentimiento + permissible purpose antes del pull.
- [ ] Auditoria completa del pull (`actor`, `lead_id`, `party`, `request_id`, `resultado`).
- [ ] Manejo de errores operativos (timeout, proveedor caido, datos incompletos).

## Plan de Ataque por Bloques
1. Bloque A (inmediato): Seguridad base + RBAC inicial. (completado)
2. Bloque B: Auditoria + Tareas operativas. (completado)
3. Bloque C: Pipeline/KPI + Observabilidad. (pendiente)
4. Bloque D: QA/CI + endurecimiento final. (pendiente)

## Regla de ejecucion
No avanzar al siguiente bloque si quedan pendientes criticos del bloque actual.

## Actualizacion de auditoria (2026-02-28)
- Pull Credit:
  - `client.js` ya habilita UX de seleccion applicant/coapp pero muestra "Integracion API pendiente".
  - No existe endpoint backend dedicado para ejecutar pull credit; solo existe analisis IA de texto de reporte y CRUD de creditors.
- Compliance PII:
  - `LEAD_SELECT_COLUMNS` expone `ssn` y `co_applicant_ssn`.
  - `/api/leads/:id/banking` retorna `routing_number`, `account_number`, `ss_number` sin mascara/cifrado.
  - Sigue faltando politica de salida/export por permiso y criterio minimo de datos.
- QA/CI:
  - Sin script `test` en `package.json`.
  - Sin pipeline `.github/workflows`.
- Dependencias externas:
  - Analisis IA de creditors depende de `GEMINI_API_KEY`; sin clave la API responde `503`.

## Avance de implementacion (2026-02-26)
- Hardening backend aplicado:
  - JWT sin fallback inseguro.
  - CORS restringido por `CORS_ORIGIN`.
  - Seed de admin movido a variables de entorno opcionales (`BOOTSTRAP_ADMIN_*`).
  - Sesion/token real implementado:
    - `access token` con `sid` de sesion y expiracion corta.
    - `refresh token` HttpOnly con rotacion y revocacion en PostgreSQL (`auth_sessions`).
    - `logout` real con revocacion de sesion y limpieza de cookie.
    - `requireAuth` validando sesion activa/no revocada en BD.
    - Interceptor frontend con auto-refresh y retry transparente tras `401`.
- Gestion de usuarios actualizada:
  - Lista de usuarios ocupa pantalla completa por defecto.
  - Formulario de nuevo usuario se abre en panel deslizante al presionar `Nuevo usuario`.
  - Agrupacion plegable por rol: Administradores, Supervisores, Agents/Vendedores.
  - Badge de rol visible en dark/light y accionable para upgrade/downgrade.
  - Backend/migraciones actualizados para aceptar rol `supervisor`.
- RBAC granular implementado:
  - Catalogo de permisos persistido en BD (`permission_catalog`).
  - Matriz base por rol en BD (`role_permissions`) + overrides por usuario (`user_permissions`).
  - Endpoints admin para consultar y actualizar permisos por usuario.
  - Middleware por permiso aplicado a gestion de usuarios, permisos y acciones criticas (correos/leads/callbacks).
  - UI admin con boton `Permisos` por usuario y panel flotante para grant/revoke por modulo.
- Auditoria de estado real (2026-02-27):
  - Pipeline/KPI: no hay endpoints ni tablas dedicadas para KPI o historial de etapas.
  - Tareas: no existe tabla/API de tareas general (solo callback_date + endpoints `/api/callbacks`).
  - Compliance PII: SSN y datos bancarios persisten en claro en tablas de dominio; falta cifrado/mascarado de salida.
  - Observabilidad/QA: no hay suite de tests ni pipeline CI (`package.json` sin script `test`, sin `.github/workflows`).

## Actualizacion de ejecucion (2026-02-27)
- Fase 4 implementada:
  - Tabla `lead_tasks` en BD con prioridad, vencimiento, recurrencia, SLA y metadatos.
  - Endpoints: `GET /api/tasks`, `POST /api/tasks`, `PATCH /api/tasks/:id`, `PATCH /api/tasks/:id/complete`, `POST /api/tasks/escalation/run`.
  - Escalamiento automatico por barrido periodico en backend.
  - Sincronizacion callback->task desde `lead.callback_date` y completado task->lead.
  - Calendario conectado a `/api/tasks` con bandeja `mine/team` en UI.
