# Integración del Rediseño de Creditors

## Resumen
Se ha creado un rediseño completo de la sección de Creditors con:
- Extracción mejorada de reportes de crédito (soporta Responsibility, Months Reviewed)
- UI moderna estilo "Liquid Glass"
- Visualización en cards en lugar de tabla densa

## Archivos Creados

1. **creditors-redesign.html** - Nuevo HTML de la sección
2. **creditors-redesign.css** - Estilos liquid glass
3. **creditors-redesign.js** - JavaScript con parsing mejorado

## Cambios en Base de Datos

Ejecutar en PostgreSQL:

```sql
-- Agregar nuevas columnas a lead_creditors
ALTER TABLE lead_creditors 
ADD COLUMN IF NOT EXISTS responsibility VARCHAR(60),
ADD COLUMN IF NOT EXISTS months_reviewed INTEGER;
```

O ejecutar: `npm run db:init-local`

## Integración Paso a Paso

### 1. Actualizar client.html

Buscar y reemplazar la sección `#creditorsSection` (línea ~6358):

```html
<!-- REEMPLAZAR TODO DESDE -->
<div id="creditorsSection" class="lead-content-grid hidden" style="grid-template-columns: 1fr;">
  <div class="lead-info-card lead-info-card-wide creditors-main-card">
    <!-- ... todo el contenido actual ... -->
  </div>
</div>
<!-- HASTA EL CIERRE DEL DIV -->
```

Con el contenido de `creditors-redesign.html`.

### 2. Agregar CSS

Agregar al final de `client.html` dentro del `<style>`:

```html
<style>
/* [Pegar todo el contenido de creditors-redesign.css] */
</style>
```

### 3. Actualizar JavaScript

En `client.js`, buscar la función `initCreditorsSection` y reemplazarla con:

```javascript
function initCreditorsSection() {
  if (creditorsSectionInitialized) return;
  creditorsSectionInitialized = true;
  
  // Inicializar nuevo diseño
  if (window.initCreditorsRedesign) {
    window.initCreditorsRedesign();
  }
}
```

Y agregar al final del archivo:

```html
<script src="creditors-redesign.js"></script>
```

### 4. Actualizar Backend

Los cambios ya están aplicados en `server/index.js`:
- ✅ `normalizeCreditorPayload` soporta `responsibility` y `months_reviewed`
- ✅ Endpoints INSERT/UPDATE/PATCH actualizados
- ✅ `mapCreditorRow` incluye nuevos campos

### 5. Actualizar DB

```bash
npm run db:init-local
```

## Campos Extraídos del Reporte

El nuevo parser extrae automáticamente:

1. **creditorName** - Nombre del acreedor (CAPITAL ONE BANK)
2. **accountNumber** - Número de cuenta (5156768017592034)
3. **accountStatus** - Estado (Open, Closed, Charge Off, Collection)
4. **accountType** - Tipo (Credit Card, Charge Account, Unsecured)
5. **responsibility** - Responsabilidad (Individual, Joint, Authorized User)
6. **monthsReviewed** - Meses revisados (23) - **toma el número más bajo**
7. **debtAmount** - Deuda más reciente (calculada de balance/past due/unpaid)
8. **balance** - Balance actual
9. **pastDue** - Monto vencido
10. **monthlyPayment** - Pago mensual

## Uso

1. Ir a la pestaña "Creditors" de un lead
2. Arrastrar un PDF de reporte de crédito o pegar texto
3. El sistema detectará automáticamente las cuentas
4. Revisar las cards extraídas
5. Click en "Importar" para guardar

## Características de la Nueva UI

- **Cards visuales** en lugar de tabla densa
- **Badges** para status, tipo, responsibility, months
- **Toggle switches** para incluir/excluir
- **Drag & drop** de PDFs
- **Resumen visual** con totales destacados
- **Tema oscuro/claro** compatible
