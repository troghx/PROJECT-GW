/**
 * CREDIT REPORT AUTO EXTRACTOR
 * Procesa automáticamente reportes de crédito al subirlos
 * Extrae deudas vía OCR + Gemini y las importa a creditors
 */

(function() {
  'use strict';

  // Estado del procesador
  const state = {
    isProcessing: false,
    currentJob: null,
    queue: []
  };

  // Utilidades
  const utils = {
    sleep: (ms) => new Promise(r => setTimeout(r, ms)),
    
    formatCurrency: (value) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return '$0.00';
      return '$' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },

    normalizeMoney: (value) => {
      if (value === null || value === undefined) return 0;
      const str = String(value).replace(/[$,\s]/g, '');
      const num = parseFloat(str);
      return Number.isFinite(num) ? num : 0;
    },

    log: (msg, type = 'info') => {
      const prefix = '[CreditReportAI]';
      if (type === 'error') console.error(prefix, msg);
      else if (type === 'warn') console.warn(prefix, msg);
      else console.log(prefix, msg);
    },

    cleanCreditorName: (name) => {
      if (!name) return name;
      let cleaned = name;
      cleaned = cleaned.replace(/^(?:not\s+available|no\s+data\s+available|data\s+not\s+available)\b[:\s-]*/i, '').trim();
      // Remover "CIUDAD,ESTADO ZIP" al inicio (ej: "COLUMBUS,OH43218 TBOM/MILESTONE")
      cleaned = cleaned.replace(/^[A-Z]+[,\s]*[A-Z]{2}\s*\d{5}(-\d{4})?\s*/i, '');
      // Remover PO BOX
      cleaned = cleaned.replace(/^P\.?O\.?\s*BOX\s+\d+\s*/i, '');
      // Remover dirección con calle al inicio
      cleaned = cleaned.replace(/^\d+\s+[A-Z\s]+(ST|AVE|BLVD|DR|RD|LN|CT|WAY)\s*/i, '');
      // Remover ZIP codes sueltos
      cleaned = cleaned.replace(/\b\d{5}(-\d{4})?\b/g, '').trim();
      // Remover etiquetas de contacto del PDF
      cleaned = cleaned.replace(/\bBY\s*MAIL\s*ONLY\b/gi, '').trim();
      cleaned = cleaned.replace(/\bBYMAILONLY\b/gi, '').trim();
      cleaned = cleaned.replace(/\bBY\s*PHONE\s*ONLY\b/gi, '').trim();
      cleaned = cleaned.replace(/\bDO\s*NOT\s*CONTACT\b/gi, '').trim();
      // Remover teléfonos
      cleaned = cleaned.replace(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '').trim();
      // Remover prefijos de sección del PDF
      cleaned = cleaned.replace(/^(?:Auto\s+loans?\s+|Credit\s+cards?\s+|Student\s+loans?\s+|Personal\s+loans?\s+|Installment\s+loans?\s+|Mortgages?\s+|Collections?\s+|Other\s+accounts?\s+)/i, '').trim();
      // Dedup última palabra repetida
      const words = cleaned.split(/\s+/).filter(Boolean);
      if (words.length >= 2) {
        const last = words[words.length - 1].toLowerCase();
        const prev = words[words.length - 2].toLowerCase();
        if (last === prev || (prev.startsWith(last) && last.length >= 3) || (last.startsWith(prev) && prev.length >= 3)) {
          const keep = words[words.length - 1].length >= words[words.length - 2].length ? words[words.length - 1] : words[words.length - 2];
          words.splice(words.length - 2, 2, keep);
          cleaned = words.join(' ');
        }
      }
      return cleaned.trim() || name;
    },

    isAddressLine: (line) => {
      if (/\b\d{5}(-\d{4})?\b/.test(line)) return true;
      if (/\bP\.?O\.?\s*BOX\b/i.test(line)) return true;
      if (/[A-Z]+[,\s]+[A-Z]{2}\s*\d{4,5}/i.test(line)) return true;
      if (/^[A-Z]{2}$/.test(line.trim())) return true;
      if (/^\d+\s+[A-Z]/i.test(line) && /\b(ST|AVE|BLVD|DR|RD|LN|CT|WAY|PL|CIR|HWY|PKWY|STE|SUITE|APT|UNIT|FLOOR|FL)\b/i.test(line)) return true;
      return false;
    },

    normalizeLifecycleStatus: (raw) => {
      const value = String(raw || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s/.-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!value) return '';
      if (/\bclosed\b/.test(value)) return 'Closed';
      if (/\bcharge\s*off\b|\bcharged\s*off\b|\bcollection\b|\btransferred\b|\brefinanced\b/.test(value)) return 'Closed';
      if (/\bpast\s*due\b|\bdelinquent\b|\blate\b/.test(value)) return 'Past Due';
      if (/\bpaid\b/.test(value)) return 'Paid';
      if (/\bgood\s*standing\b|\bas\s*agreed\b|\bcurrent\b/.test(value)) return 'Good Standing';
      if (/\bopen\b/.test(value)) {
        const openDateOnly = /\bopen\s+date\b/.test(value) && !/\bstatus\b|\boverview\b/.test(value);
        if (!openDateOnly) return 'Open';
      }
      return '';
    }
  };

  // ============================================
  // OCR ENGINE - Tesseract.js
  // ============================================
  const OCREngine = {
    worker: null,
    isReady: false,

    async init() {
      if (this.isReady) return true;
      if (!window.Tesseract) {
        utils.log('Tesseract.js no disponible', 'error');
        return false;
      }
      
      try {
        utils.log('Inicializando OCR worker...');
        this.worker = await Tesseract.createWorker('eng');
        this.isReady = true;
        utils.log('OCR listo');
        return true;
      } catch (err) {
        utils.log('Error inicializando OCR: ' + err.message, 'error');
        return false;
      }
    },

    async terminate() {
      if (this.worker) {
        await this.worker.terminate();
        this.worker = null;
        this.isReady = false;
      }
    },

    async recognize(imageDataUrl, onProgress) {
      if (!this.isReady) {
        await this.init();
      }
      if (!this.worker) {
        throw new Error('OCR no disponible');
      }

      const result = await this.worker.recognize(imageDataUrl);
      return result?.data?.text || '';
    }
  };

  // ============================================
  // PDF PROCESSOR - Extrae texto + OCR fallback
  // ============================================
  const PDFProcessor = {
    async extractText(file, options = {}) {
      const { useOCR = true, onStatus } = options;
      const pdfjs = window.pdfjsLib;
      
      if (!pdfjs) {
        throw new Error('PDF.js no disponible');
      }

      if (pdfjs.GlobalWorkerOptions) {
        pdfjs.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      }

      onStatus?.('Leyendo PDF...');
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buffer }).promise;
      
      const rows = [];
      let usedOCR = false;
      const minTextLength = 80;
      // Tolerancia Y: items con diferencia <= este valor se agrupan en la misma línea
      const Y_TOLERANCE = 2;

      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
        onStatus?.(`Procesando página ${pageNo}/${pdf.numPages}...`);

        const page = await pdf.getPage(pageNo);
        const textContent = await page.getTextContent();

        // Recolectar items con coordenadas exactas
        const items = [];
        textContent.items.forEach((item) => {
          const str = String(item?.str || '').trim();
          if (!str) return;
          const y = Number(item?.transform?.[5] || 0);
          const x = Number(item?.transform?.[4] || 0);
          items.push({ x, y, str });
        });

        // Ordenar por Y descendente para agrupar por tolerancia
        items.sort((a, b) => b.y - a.y);

        // Agrupar items en líneas usando tolerancia Y
        const lineGroups = [];
        let currentGroup = null;
        items.forEach((item) => {
          if (!currentGroup || Math.abs(currentGroup.refY - item.y) > Y_TOLERANCE) {
            currentGroup = { refY: item.y, items: [] };
            lineGroups.push(currentGroup);
          }
          currentGroup.items.push(item);
        });

        const pageRows = [];
        lineGroups.forEach((group) => {
          const line = group.items
            .sort((a, b) => a.x - b.x)
            .map((item) => item.str)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (line) pageRows.push(line);
        });

        const pageText = pageRows.join('\n');

        // Si poco texto y OCR habilitado, usar OCR
        if (useOCR && pageText.length < minTextLength) {
          onStatus?.(`Página ${pageNo}: Usando OCR...`);
          try {
            const imageDataUrl = await this.renderPageToImage(page, 2);
            const ocrText = await OCREngine.recognize(imageDataUrl);
            if (ocrText.trim()) {
              rows.push(...ocrText.split('\n').filter(l => l.trim()));
              usedOCR = true;
            }
          } catch (err) {
            utils.log(`OCR falló página ${pageNo}: ${err.message}`, 'warn');
            rows.push(...pageRows);
          }
        } else {
          rows.push(...pageRows);
        }
        
        rows.push(''); // Separador
      }

      return {
        text: rows.join('\n'),
        usedOCR,
        pages: pdf.numPages
      };
    },

    async renderPageToImage(page, scale = 2) {
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      // Fondo blanco para OCR
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      await page.render({ canvasContext: ctx, viewport }).promise;
      return canvas.toDataURL('image/png');
    }
  };

  // ============================================
  // GEMINI AI - Análisis de reporte
  // ============================================
  const GeminiAnalyzer = {
    async analyze(text, sourceReport = 'Reporte') {
      const MAX_CHARS = 120000;
      const boundedText = text.slice(0, MAX_CHARS);
      
      // Intentar usar el backend primero
      try {
        const response = await fetch('/api/creditors/analyze-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: boundedText,
            sourceReport
          })
        });

        if (response.ok) {
          const data = await response.json();
          const rawCreditors = data.creditors || [];
          // Limpiar nombres que puedan venir con direcciones pegadas
          rawCreditors.forEach(c => {
            if (c.creditorName) {
              c.creditorName = utils.cleanCreditorName(c.creditorName);
            }
          });
          return rawCreditors;
        }
        
        // Si el backend no tiene Gemini configurado, hacer análisis local
        if (response.status === 503) {
          utils.log('Backend sin Gemini, usando análisis local...', 'warn');
          return this.parseLocally(boundedText);
        }
        
        throw new Error(`Error del servidor: ${response.status}`);
      } catch (err) {
        utils.log('Fallback a parser local: ' + err.message, 'warn');
        return this.parseLocally(boundedText);
      }
    },

    parseLocally(text) {
      // Parser local como fallback cuando Gemini no esta disponible
      const creditors = [];
      const quickCreditors = [];
      const lines = text.split('\n');

      // Metodo rapido: detectar monto + nombre cercano
      const debtPattern = /\$([\d,]+\.\d{2})/;
      const seenAccounts = new Set();
      const invalidCreditorLine = /Remarks|Due|Date|Bankruptcy|Repossession|Past|Status|Type|Responsibility|Account|Balance|Current|Payment|Address|Phone|Fax|Report|Overview|Summary|Credit\s+Score|FICO|Inquir|Not\s+available|No\s+data\s+available/i;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const debtMatch = line.match(debtPattern);
        if (!debtMatch) continue;

        const debtAmount = parseFloat(debtMatch[1].replace(/,/g, ''));
        let creditorName = null;

        for (let j = Math.max(0, i - 5); j < i; j++) {
          const prevLine = lines[j].trim();
          if (
            /^[A-Z][A-Z0-9\s&/'-]{2,40}$/.test(prevLine) &&
            !utils.isAddressLine(prevLine) &&
            !invalidCreditorLine.test(prevLine) &&
            /[A-Z]{2,}/.test(prevLine)
          ) {
            creditorName = prevLine;
            break;
          }
        }

        if (creditorName && debtAmount > 0) {
          const key = creditorName.toLowerCase();
          if (!seenAccounts.has(key)) {
            seenAccounts.add(key);
            quickCreditors.push({
              creditorName,
              debtAmount,
              accountNumber: '',
              accountStatus: '',
              accountType: '',
              responsibility: 'Individual',
              monthsReviewed: null,
              creditLimit: 0,
              pastDue: 0,
              sourceReport: 'LocalParser',
              isIncluded: true
            });
          }
        }
      }

      const patterns = {
        creditorName: /^[A-Z][A-Z0-9\s&.,'-]+(?:BANK|CREDIT|LOAN|MORTGAGE|AUTO|FINANCE|FUND|UNION|EXPRESS|ONE|CAPITAL|DISCOVER|AMEX|CHASE|WELLS|BOFA|CITI|JPMCB|USBANK|PNC)$/i,
        balance: /Balance[:\s]*\$?([\d,]+\.?\d*)/i,
        accountBalance: /Account\s+Balance[:\s]*\$?([\d,]+\.?\d*)/i,
        currentBalance: /Current\s+Balance[:\s]*\$?([\d,]+\.?\d*)/i,
        amountDue: /Amount\s+Due[:\s]*\$?([\d,]+\.?\d*)/i,
        accountNumber: /Account\s+(?:Number|#)[:\s]*([\dXx\-]+)/i,
        statusOpen: /\b(?:Account\s+Status|Status)\b[:\s]*Open\b/i,
        statusClosed: /\b(?:Account\s+Status|Status)\b[:\s]*Closed\b/i,
        statusChargeOff: /Charge[-\s]?Off|Charged\s+Off/i,
        statusCollection: /Collection|In\s+Collection/i,
        statusGoodStanding: /Good\s+Standing|As\s+Agreed/i,
        statusPastDue: /Past\s+Due|Delinquent|Late/i,
        typeCreditCard: /Credit\s+Card|Credit\s+Line/i,
        typeAuto: /Auto|Vehicle|Car\s+Loan|Automobile/i,
        typeMortgage: /Mortgage|Home\s+Loan|Real\s+Estate/i,
        typePersonal: /Personal\s+Loan/i,
        typeStudent: /Student\s+Loan|Education/i,
        responsibility: /Responsibility[:\s]*(Individual|Joint|Authorized\s+User|Co-signer)/i,
        monthsReviewed: /Month['\s]*s?\s+Reviewed[:\s]*(\d+)/i,
        creditLimit: /Credit\s+Limit[:\s]*\$?([\d,]+\.?\d*)/i,
        highCredit: /High\s+(?:Credit|Balance)[:\s]*\$?([\d,]+\.?\d*)/i,
        pastDue: /Past\s+Due|Amount\s+Past\s+Due[:\s]*\$?([\d,]+\.?\d*)/i,
        invalidCreditor: /Remarks|Due\s+Date|Bankruptcy|Repossession|Foreclosure|Charge\s+Off|Past\s+Due|Days\s+Late|Payment\s+History|Account\s+Status|Type:|Responsibility:|Not\s+available|No\s+data\s+available/i
      };

      let currentCreditor = null;
      let linesSinceHeader = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (!currentCreditor && patterns.invalidCreditor.test(line)) continue;

        if (patterns.creditorName.test(line) && line.length > 3 && line.length < 60) {
          if (currentCreditor && currentCreditor.creditorName) {
            creditors.push(this.finalizeCreditor(currentCreditor));
          }

          currentCreditor = {
            creditorName: line.replace(/\s+/g, ' ').trim(),
            debtAmount: 0,
            accountNumber: '',
            accountStatus: '',
            accountType: '',
            responsibility: 'Individual',
            monthsReviewed: null,
            creditLimit: 0,
            pastDue: 0,
            sourceReport: 'LocalParser'
          };
          linesSinceHeader = 0;
          continue;
        }

        if (!currentCreditor) continue;
        linesSinceHeader += 1;

        // Ventana amplia para no perder Account Status / Current Payment Status
        if (linesSinceHeader > 45) {
          creditors.push(this.finalizeCreditor(currentCreditor));
          currentCreditor = null;
          continue;
        }

        const nextLine = (lines[i + 1] || '').trim();
        const nextTwoLines = (lines[i + 2] || '').trim();
        const statusContext = `${line} ${nextLine} ${nextTwoLines}`.replace(/\s+/g, ' ').trim();

        const balanceMatch = line.match(patterns.balance) || line.match(patterns.currentBalance) || line.match(patterns.accountBalance);
        if (balanceMatch && !currentCreditor.debtAmount) {
          currentCreditor.debtAmount = utils.normalizeMoney(balanceMatch[1]);
        }

        const accountMatch = line.match(patterns.accountNumber);
        if (accountMatch && !currentCreditor.accountNumber) {
          currentCreditor.accountNumber = accountMatch[1];
        }

        const limitMatch = line.match(patterns.creditLimit) || line.match(patterns.highCredit);
        if (limitMatch && !currentCreditor.creditLimit) {
          currentCreditor.creditLimit = utils.normalizeMoney(limitMatch[1]);
        }

        const monthsMatch = line.match(patterns.monthsReviewed);
        if (monthsMatch && currentCreditor.monthsReviewed === null) {
          currentCreditor.monthsReviewed = parseInt(monthsMatch[1], 10);
        }

        const respMatch = line.match(patterns.responsibility);
        if (respMatch && currentCreditor.responsibility === 'Individual') {
          currentCreditor.responsibility = respMatch[1];
        }

        if (/^Account\s+Status\s*:?\s*$/i.test(line)) {
          const explicitStatus = utils.normalizeLifecycleStatus(`${nextLine} ${nextTwoLines}`);
          if (explicitStatus) currentCreditor.accountStatus = explicitStatus;
        }

        const lifecycleStatus = utils.normalizeLifecycleStatus(statusContext);
        if (lifecycleStatus && (!currentCreditor.accountStatus || lifecycleStatus === 'Closed')) {
          currentCreditor.accountStatus = lifecycleStatus;
        }

        if (patterns.statusChargeOff.test(statusContext) || patterns.statusCollection.test(statusContext)) {
          currentCreditor.accountStatus = 'Closed';
        } else if (patterns.statusClosed.test(statusContext)) {
          currentCreditor.accountStatus = 'Closed';
        } else if (patterns.statusPastDue.test(statusContext) && currentCreditor.accountStatus !== 'Closed') {
          currentCreditor.accountStatus = 'Past Due';
        } else if (patterns.statusGoodStanding.test(statusContext) && !currentCreditor.accountStatus) {
          currentCreditor.accountStatus = 'Good Standing';
        } else if (patterns.statusOpen.test(statusContext) && !/open\s+date/i.test(statusContext) && !currentCreditor.accountStatus) {
          currentCreditor.accountStatus = 'Open';
        }

        if (patterns.typeCreditCard.test(line)) currentCreditor.accountType = 'Credit Card';
        else if (patterns.typeAuto.test(line)) currentCreditor.accountType = 'Auto Loan';
        else if (patterns.typeMortgage.test(line)) currentCreditor.accountType = 'Mortgage';
        else if (patterns.typePersonal.test(line)) currentCreditor.accountType = 'Personal Loan';
        else if (patterns.typeStudent.test(line)) currentCreditor.accountType = 'Student Loan';

        if (/(collection|charge[-\s]?off)/i.test(statusContext) && !currentCreditor.accountType) {
          currentCreditor.accountType = 'Collection';
        }
      }

      if (currentCreditor && currentCreditor.creditorName) {
        creditors.push(this.finalizeCreditor(currentCreditor));
      }

      const seen = new Set();
      const uniqueCreditors = creditors
        .filter(c => c.creditorName && c.debtAmount > 0)
        .filter(c => {
          const t = String(c.accountType || '').toLowerCase();
          if (/mortgage|home\s*loan|conventional|real\s+estate/.test(t)) return false;
          return true;
        })
        .filter(c => {
          const key = `${String(c.creditorName || '').toLowerCase().trim()}|${String(c.accountNumber || '').toLowerCase().trim()}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      if (uniqueCreditors.length > 0) {
        return uniqueCreditors;
      }

      if (quickCreditors.length > 0) {
        utils.log(`Parser local encontro ${quickCreditors.length} deudas por patron de montos`);
        const quickSeen = new Set();
        return quickCreditors
          .filter(c => c.creditorName && c.debtAmount > 0)
          .filter(c => {
            const key = String(c.creditorName || '').toLowerCase().trim();
            if (quickSeen.has(key)) return false;
            quickSeen.add(key);
            return true;
          });
      }

      return [];
    },

    finalizeCreditor(c) {
      // Limpiar nombre de acreedor: remover direcciones/ZIP pegados
      if (c.creditorName) {
        c.creditorName = utils.cleanCreditorName(c.creditorName);
      }
      // Asegurar que debtAmount sea el más relevante
      if (!c.debtAmount && c.creditLimit) {
        c.debtAmount = c.creditLimit;
      }

      const statusSignal = `${c.accountStatus || ''} ${c.currentPaymentStatus || ''}`;
      const normalizedStatus = utils.normalizeLifecycleStatus(statusSignal);
      if (normalizedStatus) {
        c.accountStatus = normalizedStatus;
      }
      if (/(collection|charge[-\s]?off|transferred|refinanced)/i.test(statusSignal)) {
        c.accountStatus = 'Closed';
      }
      if (String(c.accountType || '').toLowerCase() === 'collection') {
        c.accountStatus = 'Closed';
      }

      c.isIncluded = c.debtAmount > 0;
      return c;
    }
  };

  // ============================================
  // UI MANAGER - Notificaciones y progreso
  // ============================================
  const UIManager = {
    showProgress(message, progress = null) {
      // Usar el status de creditors si está disponible
      const statusEl = document.getElementById('creditorsStatus');
      if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = 'status-text loading';
      }
      
      utils.log(message);
    },

    showSuccess(message) {
      const statusEl = document.getElementById('creditorsStatus');
      if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = 'status-text success';
      }
      
      // También mostrar toast si existe
      if (window.showToast) {
        window.showToast(message, 'success');
      }
    },

    showError(message) {
      const statusEl = document.getElementById('creditorsStatus');
      if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = 'status-text error';
      }
      
      if (window.showToast) {
        window.showToast(message, 'error');
      }
    }
  };

  // ============================================
  // CREDITOR IMPORTER - Importa al backend
  // ============================================
  const CreditorImporter = {
    async importCreditors(leadId, creditors, party = 'applicant') {
      if (!creditors.length) return { success: 0, failed: 0 };

      let success = 0;
      let failed = 0;

      for (const creditor of creditors) {
        try {
          const payload = {
            creditorName: creditor.creditorName,
            originalCreditor: creditor.originalCreditor || creditor.creditorName,
            accountNumber: creditor.accountNumber || '',
            dateLastPayment: creditor.dateLastPayment || creditor.date_last_payment || creditor.lastPaymentDate || creditor.last_activity || '',
            accountStatus: creditor.accountStatus || '',
            accountType: creditor.accountType || '',
            responsibility: creditor.responsibility || 'Individual',
            monthsReviewed: creditor.monthsReviewed || null,
            debtAmount: creditor.debtAmount || 0,
            pastDue: creditor.pastDue || 0,
            creditLimit: creditor.creditLimit || 0,
            balance: creditor.debtAmount || 0,
            debtorParty: party, // applicant o coapp
            isIncluded: creditor.debtAmount > 0,
            sourceReport: creditor.sourceReport || 'Auto-Extract'
          };

          const response = await fetch(`/api/leads/${leadId}/creditors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (response.ok || response.status === 409) {
            success++;
          } else {
            failed++;
          }
        } catch (err) {
          failed++;
          utils.log(`Error importando creditor: ${err.message}`, 'error');
        }
      }

      return { success, failed };
    }
  };

  // ============================================
  // MAIN PROCESSOR - Orquesta todo el flujo
  // ============================================
  const CreditReportProcessor = {
    async process(file, leadId, options = {}) {
      const { party = 'applicant', onStatus } = options;
      
      state.isProcessing = true;
      state.currentJob = { file, leadId, party };

      try {
        // Paso 1: Extraer texto del PDF (con OCR si es necesario)
        onStatus?.('Extrayendo texto del PDF...');
        const extraction = await PDFProcessor.extractText(file, {
          useOCR: true,
          onStatus
        });

        if (!extraction.text.trim()) {
          throw new Error('No se pudo extraer texto del PDF');
        }

        utils.log(`Texto extraído: ${extraction.text.length} chars. OCR usado: ${extraction.usedOCR}`);

        // Paso 2: Analizar con Gemini (o parser local)
        onStatus?.('Analizando reporte con IA...');
        const creditors = await GeminiAnalyzer.analyze(extraction.text, file.name);

        if (!creditors.length) {
          throw new Error('No se detectaron deudas en el reporte');
        }

        utils.log(`Deudas detectadas: ${creditors.length}`);

        // Paso 3: Importar al lead
        onStatus?.(`Importando ${creditors.length} deudas...`);
        const result = await CreditorImporter.importCreditors(leadId, creditors, party);

        // Paso 4: Recargar lista de creditors si existe la función global
        if (window.loadCreditorsData) {
          await window.loadCreditorsData();
        } else if (window.loadSavedCreditors) {
          await window.loadSavedCreditors();
        }

        return {
          success: true,
          creditorsFound: creditors.length,
          imported: result.success,
          failed: result.failed,
          usedOCR: extraction.usedOCR,
          details: creditors
        };

      } catch (err) {
        utils.log('Error procesando reporte: ' + err.message, 'error');
        return { success: false, error: err.message };
      } finally {
        state.isProcessing = false;
        state.currentJob = null;
      }
    }
  };

  // ============================================
  // INTEGRATION - Hook al sistema de archivos
  // ============================================
  function shouldSkipLegacyPipeline() {
    return window.__creditorsPipeline === 'redesign' || typeof window.initCreditorsRedesign === 'function';
  }

  function initIntegration() {
    // Escuchar evento de archivo subido
    window.addEventListener('lead:file-uploaded', async (e) => {
      if (shouldSkipLegacyPipeline()) {
        return;
      }

      const { storedFile, metadata, leadId } = e.detail;
      
      // Solo procesar si es reporte de crédito
      if (metadata.documentCategory !== 'credit_report') {
        return;
      }

      utils.log('Detectado reporte de crédito, iniciando procesamiento automático...');

      // Convertir dataUrl a File
      let file;
      try {
        const base64Data = storedFile.data.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: storedFile.type });
        file = new File([blob], storedFile.name, { type: storedFile.type });
      } catch (err) {
        utils.log('Error convirtiendo archivo: ' + err.message, 'error');
        return;
      }

      const party = metadata.creditReportParty || 'applicant';

      // Procesar
      const result = await CreditReportProcessor.process(file, leadId, {
        party,
        onStatus: (msg) => UIManager.showProgress(msg)
      });

      if (result.success) {
        UIManager.showSuccess(
          `¡Reporte procesado! ${result.imported} deudas importadas (${party})`
        );
        
        // Cambiar a pestaña de creditors si existe
        setTimeout(() => {
          const creditorsTab = document.querySelector('[data-tab="creditors"]');
          if (creditorsTab) creditorsTab.click();
        }, 500);
      } else {
        UIManager.showError(`Error: ${result.error}`);
      }
    });

    // Exponer API global para uso manual
    window.CreditReportAI = {
      process: CreditReportProcessor.process.bind(CreditReportProcessor),
      status: () => state,
      utils,
      // Función para procesar archivo manualmente
      async processFile(file, leadId, party = 'applicant') {
        return CreditReportProcessor.process(file, leadId, {
          party,
          onStatus: (msg) => UIManager.showProgress(msg)
        });
      }
    };

    utils.log('Credit Report Auto-Extractor inicializado');
  }

  // Inicializar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIntegration);
  } else {
    initIntegration();
  }
})();
