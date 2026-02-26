# Fase 07 - Pull Credit (Soft Pull + Array)
Fecha: 2026-02-25
Estado: En preparacion

## Objetivo de la fase
Dejar lista la transicion de Pull Credit (soft pull) desde Sugar hacia esta plataforma, con checklist tecnico/compliance y criterios de activacion controlada.

---

## Contexto operativo
1. SugarCRM no hace pull credit nativo; integra proveedores externos.
2. Los reportes de `reference/` parecen flujo de portal de terceros con tri-bureau + VantageScore 3.0.
3. Hipotesis operativa: proveedor/infra tipo Array (antes A-Soft), usado via credenciales por entorno.
4. Es posible reutilizar credenciales existentes de la empresa, pero validar contrato/Order/Client Website con el account manager.
5. Confirmar que el flujo sera `soft pull` y conservar evidencia de consentimiento + permissible purpose (FCRA).

---

## Checklist de cierre - Fase 07 (Soft Pull)
1. Confirmar proveedor final y modalidad (`soft pull`) con direccion.
2. Obtener credenciales Sandbox y Produccion:
   - `APPLICATION_KEY`
   - `CLIENT_API_TOKEN` (o equivalente)
3. Confirmar alcance contractual para nuevo frontend/backend (dominio y entorno permitidos).
4. Implementar endpoint backend para ejecutar pull por parte (`applicant` / `coapp`).
5. Guardar auditoria completa:
   - usuario interno
   - `lead_id`
   - `party`
   - `timestamp`
   - `request_id`
   - resultado
6. Agregar consentimiento explicito previo al pull y guardar evidencia.
7. Enmascarar SSN/PII en logs y respuestas; no exponer secretos.
8. Manejar errores operativos (timeouts, validacion incompleta, proveedor caido).
9. Probar flujo completo en Sandbox con casos:
   - applicant valido
   - coapp incompleto (deshabilitado)
   - coapp valido
10. Activacion controlada en Produccion con feature flag y monitoreo.

---

## Bloqueantes (solicitudes a la empresa)
1. Credenciales actuales usadas en Sugar (sandbox/prod).
2. Nombre exacto del proveedor y contacto del account manager.
3. Confirmacion de plan/producto activo y permisos para nuevo sistema.
4. Texto legal aprobado para consentimiento de soft pull.

---

## Seguridad (obligatorio)
- Nunca subir credenciales reales al repositorio.
- Mantener secretos solo en `.env`/secret manager.
- No compartir tokens por chat sin canal seguro.

---

## Siguiente paso inmediato
Abrir hilo con direccion/compliance para confirmar proveedor final + alcance contractual + texto legal de consentimiento antes de implementar endpoint productivo.
