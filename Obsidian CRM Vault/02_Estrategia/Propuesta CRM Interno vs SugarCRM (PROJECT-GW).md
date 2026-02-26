---
tipo: propuesta-comercial
proyecto: PROJECT-GW
estado: borrador
fecha: 2026-02-23
---

# Propuesta CRM Interno vs SugarCRM (PROJECT-GW)

## 1) Objetivo
Presentar una alternativa interna a SugarCRM, con mejor ajuste al proceso operativo actual y un costo mensual competitivo en MXN.

## 2) Supuestos de usuarios (licencias)
- En SugarCRM, "usuario" = persona interna con acceso/login (vendedor, supervisor, underwriter, admin, etc.).
- No se cobra por cada cliente/lead creado.
- Base actual estimada: 50 usuarios.
  - 23 vendedores
  - 4 supervisores
  - 3 underwriters
  - 20 adicionales (Tijuana y otras areas)
- Escenarios de crecimiento: 60 y 70 usuarios (incluyendo India).

## 3) Benchmark de referencia (SugarCRM)
Fuente: pagina oficial de precios SugarCRM ES.  
Tipo de cambio de referencia para este analisis: 1 EUR = 20.3064 MXN (23-feb-2026).  
Nota: precios y tipo de cambio pueden variar; usar este documento como estimado comercial.

### Costos mensuales aproximados en MXN (solo licencia)
| Plan Sugar | EUR/usuario/mes | 50 usuarios | 60 usuarios | 70 usuarios |
|---|---:|---:|---:|---:|
| Sell Standard | 59 | $59,904 | $71,885 | $83,865 |
| Sell Advanced | 85 | $86,302 | $103,563 | $120,823 |
| Sell Premier | 135 | $137,068 | $164,482 | $191,895 |
| Serve | 80 | $81,226 | $97,471 | $113,716 |
| Enterprise | 85 | $86,302 | $103,563 | $120,823 |
| Enterprise+ | 120 | $121,838 | $146,206 | $170,574 |

## 4) Lo que ya puede entregar PROJECT-GW
Con base en el codigo actual del proyecto:
- Gestion de leads completa (alta, edicion, eliminacion, filtros, duplicados).
- Notas por lead y plantillas de notas.
- Archivos por lead (carga, listado, descarga).
- Modulo de creditors y analisis/importacion de reportes.
- Modulo bancario por lead.
- Modulo de budget por lead.
- API backend propia (Express + PostgreSQL) y control de evolucion funcional.

## 5) Ventajas de negocio frente a Sugar (para tu empresa)
- Flujo mas alineado al proceso real del equipo (menos friccion operativa).
- Cambios funcionales rapidos a solicitud de negocio.
- Control interno de datos y roadmap.
- Menor costo mensual total frente a licencias enterprise de terceros.

## 6) Brechas a cerrar para reemplazo total
- Fortalecer autenticacion y control de roles/permisos.
- Endurecer seguridad y manejo de secretos.
- Backups, monitoreo, alertas y politicas de recuperacion.
- Bitacora/auditoria y documentacion operativa.
- SLA y mesa de soporte definidos.

## 7) Propuesta economica competitiva (recomendada)
### Esquema mensual
- **$44,900 MXN/mes** hasta 50 usuarios.
- **$750 MXN/mes** por usuario adicional.

### Comparativo directo vs Sugar Sell Advanced
- 50 usuarios:
  - Sugar aprox: $86,302 MXN/mes
  - PROJECT-GW propuesto: $44,900 MXN/mes
  - Ahorro estimado: **48.0%**
- 60 usuarios:
  - Sugar aprox: $103,563 MXN/mes
  - PROJECT-GW propuesto: $52,400 MXN/mes
  - Ahorro estimado: **49.4%**
- 70 usuarios:
  - Sugar aprox: $120,823 MXN/mes
  - PROJECT-GW propuesto: $59,900 MXN/mes
  - Ahorro estimado: **50.4%**

## 8) Alcance sugerido de la mensualidad
- Hosting y operacion base del sistema.
- Mantenimiento correctivo y ajustes menores.
- Soporte funcional/tecnico en horario laboral.
- Bolsa mensual de mejoras evolutivas pequenas.

## 9) Siguientes pasos sugeridos
1. Validar internamente el numero oficial de usuarios por rol.
2. Elegir modelo de soporte (horario, tiempos de respuesta, alcance).
3. Acordar SLA y plan de hardening (4-8 semanas).
4. Presentar piloto de 30 dias con KPIs (adopcion, tiempo de ciclo, productividad).

## 10) Sensibilidad de ganancia mensual (info extra)
Supuestos para este cuadro:
- Costo Neon estimado: **$7,000 MXN/mes**
- Sueldo actual: **$15,000 MXN/mes**
- Formula neta del proyecto: `Precio mensual - Costo Neon`

| Plan mensual propuesto | Neta del proyecto (antes de impuestos) | Diferencia vs sueldo actual | Multiplo de tu sueldo (neta/sueldo) | Total mensual si mantienes sueldo + proyecto |
|---:|---:|---:|---:|---:|
| $39,900 | $32,900 | +$17,900 | 2.19x | $47,900 |
| $42,000 | $35,000 | +$20,000 | 2.33x | $50,000 |
| $44,900 | $37,900 | +$22,900 | 2.53x | $52,900 |
| $49,900 | $42,900 | +$27,900 | 2.86x | $57,900 |

Nota:
- Este cuadro no incluye ISR/IVA ni otros costos operativos (soporte, herramientas, contingencias).

---

## Fuentes
- SugarCRM Pricing ES: https://www.sugarcrm.com/es/pricing/
- Definiciones/licencias Sugar (documentacion): https://support.sugarcrm.com/documentation/subscription/sugar_sell_serve_subscriptions/
- EUR/MXN (referencia de mercado): https://mx.investing.com/currencies/eur-mxn

## 11) Fase activa (implementacion)
- Ver nota operativa: [[PROJECT-GW - Fase 06 Correos y Roles]]

