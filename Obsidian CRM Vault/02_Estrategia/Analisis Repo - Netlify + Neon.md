# Analisis Repo - Netlify + Neon

Fecha: 2026-03-05

## Conclusion ejecutiva

El proyecto **no esta listo para que Netlify lo ejecute tal cual**.

Motivo principal:

- El backend actual es un servidor `Express` tradicional que hace `app.listen(...)` y sirve archivos estaticos desde la raiz.
- `Netlify` no levanta procesos persistentes de este tipo desde el repo. Para usar Netlify hay que:
  - mover la API a `Netlify Functions`, o
  - separar frontend y backend, dejando el frontend en Netlify y el backend en otro host.

La parte de base de datos **si tiene compatibilidad inicial con Neon**:

- `server/db.js` ya activa `ssl` cuando `PGHOST` contiene `.neon.tech`.

## Esenciales para quedarse en el repo

Estos archivos/directorios si forman parte del producto o del despliegue base:

- `package.json`
- `package-lock.json`
- `.gitignore`
- `.env.example`
- `README.md`
- `index.html`
- `client.html`
- `styles.css`
- `app.js`
- `client.js`
- `crm-helpers.js`
- `quick-actions.js`
- `budget.css`
- `budget.js`
- `hardship-assist.js`
- `credit-report-auto-extract.js`
- `credit-report-viewer.html`
- `credit-report-viewer.js`
- `creditors-compact.css`
- `creditors-final.css`
- `creditors-redesign.css`
- `creditors-redesign.js`
- `server/`
- `db/init.sql`
- `vendor/`
- `reference/CD logo.png`

## Esenciales solo si se conserva la funcion de contratos PDF

Si el CRM seguira generando contratos desde backend, estos archivos deben quedarse:

- `scripts/generate_contract_pdf.py`
- `reference/contrato ejemplo.pdf`

Si esa funcionalidad se va a desactivar o reimplementar, estos dos archivos podrian salir despues.

## Mantener, pero no son estrictamente necesarios para produccion

Sirven para desarrollo, mantenimiento o documentacion interna:

- `scripts/init-postgres.ps1`
- `scripts/start-postgres.ps1`
- `scripts/stop-postgres.ps1`
- `Obsidian CRM Vault/`
- `AGENTS.md`
- `PROJECT_GUIDELINES.md`
- `INTEGRACION_CREDITORS.md`

## Candidatos fuertes para retirar del repo

No aparecen como parte del runtime productivo o son artefactos de trabajo local:

- `.env`
- `.local/`
- `node_modules/`
- `server.log`
- `server-error.log`
- `server-run.out.log`
- `server-run.err.log`
- `server-run3.out.log`
- `server-run3.err.log`
- `server-run4.out.log`
- `server-run4.err.log`
- `server-run5.out.log`
- `server-run5.err.log`
- `server-run6.out.log`
- `server-run6.err.log`
- `server-mock-test.out.log`
- `server-mock-test.err.log`
- `shutdown.bat`
- `hardship-assist.js.bak`
- `creditors-redesign.html`
- `creditors-override.css`
- `glass-ui.css`
- `edge-components.css`
- `edge-dom.html`
- `edge-dom-final.html`
- `edge-dom-check2.html`
- `edge-dom-tab-lead.html`
- `analyze_credit_reports.py`
- `report1_raw.txt`
- `report2_raw.txt`
- `Estados EU.xlsx`
- `Atajos.md`
- `Atajos.txt`
- `Barra_Unificada_Handoff.txt`
- `Fase 07 - Pull Credit (Soft Pull + Array).md`
- `Fase_Correos_Roles_Obsidian.md`
- `GEMINI.md`
- `CLAUDE.md`
- `ToDo.md`
- `agents/`

## Candidatos fuertes para mover fuera del repo o archivar

La carpeta `reference/` mezcla activos reales con material de referencia, pruebas y documentos sensibles. Para repo productivo, yo dejaria solo lo que usa la app:

- Mantener:
  - `reference/CD logo.png`
  - `reference/contrato ejemplo.pdf` solo si sigue activa la generacion de contratos

- Mover fuera del repo o a un almacenamiento privado:
  - capturas de pantalla de UI
  - PDFs de ejemplo
  - PDFs con nombres de personas
  - archivos `file_*.pdf`
  - `jsonextractor.txt`
  - `negromate.png`
  - cualquier documento que sea muestra, evidencia o material de trabajo

## Observaciones tecnicas relevantes

- `server/index.js` carga `.env` desde la raiz del proyecto. Para produccion debe depender de variables de entorno del proveedor y **no** de un `.env` commiteado.
- El frontend depende de archivos estaticos servidos por el backend (`express.static(ROOT_DIR)`), por lo que hoy frontend y backend estan acoplados en el mismo proceso.
- `client.html` usa:
  - `vendor/pdf.min.js`
  - `vendor/tesseract.min.js`
  - `credit-report-auto-extract.js`
  - `hardship-assist.js`
  - `budget.js`
  - `creditors-redesign.js`
- `index.html` usa:
  - `styles.css`
  - `crm-helpers.js`
  - `app.js`
  - `quick-actions.js`

## Recomendacion antes de limpiar

No borraria nada todavia sin hacer esta secuencia:

1. Definir si el backend se ira a `Netlify Functions` o a otro host.
2. Confirmar si contratos PDF seguiran activos.
3. Confirmar si el flujo de OCR / credit report viewer seguira activo.
4. Sacar del repo primero lo obvio y seguro:
   - logs
   - `.env`
   - `.local`
   - `node_modules`
   - `.bak`
   - variantes `edge-dom*`
   - docs operativas internas que no afecten runtime
5. Revisar despues la carpeta `reference/` archivo por archivo, porque ahi puede haber material sensible.

## Mi dictamen practico

Si el objetivo es dejar un repo limpio para despliegue, hoy lo separaria asi:

- **Core de app:** si se queda.
- **Desarrollo local:** puede quedarse, pero no es obligatorio para produccion.
- **Artefactos / backups / docs internas / pruebas:** los sacaria del repo.
- **Bloqueador actual:** Netlify no puede correr este backend `Express` tal como esta.
