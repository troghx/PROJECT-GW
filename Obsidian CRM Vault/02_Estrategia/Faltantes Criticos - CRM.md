# Faltantes Criticos - CRM
Fecha: 2026-02-26
Estado: Aprobado para ejecucion
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
- [ ] Estandarizar etapas del pipeline.
- [ ] Registrar historial de cambios por lead.
- [ ] Implementar dashboard KPI (conversion, aging, cierre, perdida).
- [ ] Filtros por periodo/agente/source.

5. Tareas operativas completas
- [ ] Extender modelo de callback a motor general de tareas.
- [ ] Agregar prioridad, vencimiento, recurrencia, SLA.
- [ ] Escalamiento por vencimiento.
- [ ] Vistas por owner/equipo.

6. Compliance y proteccion de datos
- [ ] Cifrado o enmascarado de PII sensible (SSN, cuenta bancaria).
- [ ] Politica de acceso/export para PII.
- [ ] Redaccion de logs con datos sensibles.
- [ ] Checklist de cumplimiento operativo.

7. Observabilidad y resiliencia
- [ ] Logging estructurado con correlacion por request.
- [ ] Monitoreo y alertas operativas.
- [ ] Healthchecks extendidos.
- [ ] Procedimiento backup/restore probado.

8. QA y entrega continua
- [ ] Pruebas API criticas.
- [ ] Smoke tests UI.
- [ ] Pipeline CI para validacion automatica.
- [ ] Checklist de release y rollback.

## Plan de Ataque por Bloques
1. Bloque A (inmediato): Seguridad base + RBAC inicial.
2. Bloque B: Auditoria + Tareas operativas.
3. Bloque C: Pipeline/KPI + Observabilidad.
4. Bloque D: QA/CI + endurecimiento final.

## Regla de ejecucion
No avanzar al siguiente bloque si quedan pendientes criticos del bloque actual.

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
