# PROJECT-GW CRM - Control General
Fecha: 2026-02-25
Estado: Activo

## Objetivo
Centralizar en este vault todo el seguimiento operativo, fases y roadmap del CRM PROJECT-GW.

## Mapa rapido
- Operacion diaria: [[00_Operacion/Atajos]]
- ToDo actual: [[00_Operacion/ToDo]]
- Contexto base: [[00_Operacion/README]]
- Fase 06 (correos/roles): [[01_Fases/PROJECT-GW - Fase 06 Correos y Roles]]
- Fase 07 (pull credit): [[01_Fases/Fase 07 - Pull Credit (Soft Pull + Array)]]
- Roadmap de faltantes CRM: [[02_Estrategia/Roadmap - Faltantes Criticos del CRM]]

## Regla de organizacion
1. Todo avance nuevo del CRM se documenta en este vault.
2. El vault del cuento queda solo para contenido narrativo.
3. Si una nota mezcla temas, se separa y se archiva la parte no-CRM en el vault correspondiente.

## Proxima revision
- Revisar progreso del roadmap y actualizar prioridades cada semana.

## Actualizacion 2026-02-26
- Seguridad base ya implementada:
  - Login con JWT.
  - Proteccion de rutas API con token.
  - Restricciones por rol (`admin` / `seller`) en leads, callbacks y usuarios.
- Usuarios migrados a DB (`app_users`) con hash + salt de PIN (sin PIN plano).
- Modulo de gestion de usuarios habilitado para admin:
  - Alta de usuario.
  - Edicion de rol/datos/PIN.
  - Activar/desactivar usuario.
- Gestion de usuarios movida a vista completa (`#admin-users`) en lugar de modal.
- Ajuste visual reciente:
  - Watermark del logo repetido como fondo sutil en `index.html` y `client.html`.
