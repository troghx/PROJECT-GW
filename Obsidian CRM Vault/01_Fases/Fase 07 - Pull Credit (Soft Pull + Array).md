# Fase 07 - Pull Credit (Soft Pull + Array)
Fecha: 2026-02-28
Estado: En preparacion
Dependencia: proveedor externo + credenciales sandbox/prod.

## Estado actual real
- Frontend listo para disparar flujo (seleccion `applicant/coapp`), pero sin llamada a API real.
- Mensaje actual en `client.js`: "Integracion API pendiente."
- Backend no tiene endpoint de ejecucion de soft pull; solo:
  - analisis IA de reporte (`POST /api/creditors/analyze-report`),
  - CRUD de creditors por lead.

## Objetivo de cierre
Ejecutar soft pull real desde el CRM, con trazabilidad completa y cumplimiento basico (consentimiento + manejo de PII).

## Checklist tecnico
- [ ] Definir endpoint backend de pull por parte (`applicant/coapp`).
- [ ] Integrar proveedor real (Array/A-Soft o equivalente) en sandbox.
- [ ] Agregar feature flag de activacion (`PULL_CREDIT_ENABLED`).
- [ ] Persistir resultado (score + metadata minima) por lead y party.
- [ ] Registrar auditoria del pull (`actor`, `lead_id`, `party`, `request_id`, `resultado`).
- [ ] Manejar errores operativos (timeout, upstream down, validacion incompleta).

## Checklist compliance minimo
- [ ] Capturar consentimiento explicito previo al pull.
- [ ] Guardar evidencia (usuario, timestamp, texto/version de consentimiento).
- [ ] Definir permiso granular para ejecutar pull credit.
- [ ] Enmascarar PII sensible en respuestas/logs/export.

## Bloqueantes externos
- [ ] Confirmacion de proveedor final y modalidad contratada (soft pull).
- [ ] Credenciales sandbox/prod y alcance contractual para este backend.
- [ ] Texto legal aprobado para consentimiento.

## Criterio de "Done"
- Pull credit applicant/coapp operativo en sandbox.
- Evidencia de consentimiento y auditoria disponible por lead.
- Sin PII sensible en logs operativos.
- Activacion en produccion mediante feature flag.
