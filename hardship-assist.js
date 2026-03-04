(function () {
  // Regex helper para hacer las vocales insensibles a acentos
  function noAcc(str) {
    return str
      .replace(/a/g, '[aáAÁ]')
      .replace(/e/g, '[eéEÉ]')
      .replace(/i/g, '[iíIÍ]')
      .replace(/o/g, '[oóOÓ]')
      .replace(/u/g, '[uúüUÚÜ]');
  }

  // Límites de palabra (word boundaries) robustos para español, soportando letras acentuadas.
  // \b estándar en JS falla con caracteres como 'ó' porque los considera no-palabras (\W).
  const bL = '(?<=^|[^a-zA-Z0-9_áéíóúÁÉÍÓÚñÑüÜ])';
  const bR = '(?=[^a-zA-Z0-9_áéíóúÁÉÍÓÚñÑüÜ]|$)';

  // Helper para generar una expresión regular en español (insensible a acentos y límites correctos)
  function rx(str) {
    return new RegExp(bL + noAcc(str) + bR, 'gi');
  }

  // Reglas de frases extensas para ES -> EN
  const ES_TO_EN_PHRASE_RULES = [
    [rx('comenta que'), 'reports that'],
    [rx('indica que'), 'states that'],
    [rx('menciona que'), 'mentions that'],
    [rx('dice que'), 'says that'],
    
    // Deudas, pagos y gastos
    [rx('se endeudo'), 'got into debt'],
    [rx('endeudado'), 'in debt'],
    [rx('endeudada'), 'in debt'],
    [rx('muchas deudas'), 'a lot of debt'],
    [rx('demasiadas deudas'), 'too much debt'],
    [rx('tarjetas maximizadas'), 'maxed out cards'],
    [rx('tarjetas topadas'), 'maxed out cards'],
    [rx('tarjetas al limite'), 'maxed out cards'],
    [rx('intereses altos'), 'high interest rates'],
    [rx('altos intereses'), 'high interest rates'],
    [rx('ya no puede realizar pagos'), 'can no longer make payments'],
    [rx('ya no puede hacer los pagos'), 'can no longer make payments'],
    [rx('ya no puede pagar'), 'can no longer make payments'],
    [rx('no puede realizar pagos'), 'cannot make payments'],
    [rx('no puede hacer los pagos'), 'cannot make payments'],
    [rx('no puede pagar'), 'cannot make payments'],
    [rx('esta atrasado'), 'is behind on payments'],
    [rx('esta atrasada'), 'is behind on payments'],
    [rx('atrasados con los pagos'), 'behind on payments'],
    [rx('atrasadas con los pagos'), 'behind on payments'],
    [rx('atrasado con los pagos'), 'behind on payments'],
    [rx('atrasada con los pagos'), 'behind on payments'],
    [rx('no le alcanza'), 'cannot cover monthly expenses'],
    [rx('no les alcanza'), 'cannot cover monthly expenses'],
    [rx('no nos alcanza'), 'cannot cover monthly expenses'],
    [rx('no alcanza'), 'cannot cover monthly expenses'],
    [rx('se quedo a cargo'), 'was left in charge'],
    [rx('quedo a cargo'), 'was left in charge'],
    
    // Divorcios, separaciones, ayuda
    [rx('por eso busca ayuda'), 'that is why the client seeks help'],
    [rx('por eso'), 'that is why'],
    [rx('busca ayuda'), 'seeks help'],
    [rx('pidio ayuda'), 'sought help'],
    [rx('se divorcio'), 'got divorced'],
    [rx('divorcio'), 'divorce'],
    [rx('se separo'), 'separated'],
    [rx('separacion'), 'separation'],

    // Empleos y trabajo
    [rx('se quedo sin trabajo'), 'lost employment'],
    [rx('se quedo desempleado'), 'became unemployed'],
    [rx('se quedo desempleada'), 'became unemployed'],
    [rx('perdio su trabajo'), 'lost employment'],
    [rx('perdio el trabajo'), 'lost employment'],
    [rx('perdio trabajo'), 'lost employment'],
    [rx('perdio su empleo'), 'lost employment'],
    [rx('perdio el empleo'), 'lost employment'],
    [rx('perdio empleo'), 'lost employment'],
    [rx('fue despedido'), 'was laid off'],
    [rx('fue despedida'), 'was laid off'],
    [rx('sin empleo'), 'without employment'],
    [rx('desempleados'), 'unemployed'],
    [rx('desempleadas'), 'unemployed'],
    [rx('desempleado'), 'unemployed'],
    [rx('desempleada'), 'unemployed'],
    [rx('reduccion de horas'), 'reduction in work hours'],
    [rx('le cortaron las horas'), 'had their hours cut'],
    [rx('ingresos bajaron'), 'income decreased'],
    [rx('bajaron los ingresos'), 'income decreased'],
    [rx('recorte de sueldo'), 'pay cut'],
    [rx('recorte de salario'), 'pay cut'],

    // Sustancias y mascotas
    [rx('empezo con las drogas'), 'started using drugs'],
    [rx('empezo con las dfogas'), 'started using drugs'],
    [rx('empezo a consumir'), 'started using'],
    [rx('consumo de drogas'), 'drug use'],
    [rx('consumia drogas'), 'had substance-use issues'],
    [rx('consumo de sustancias'), 'substance use'],
    [rx('dfogas'), 'drugs'],
    [rx('drogas'), 'drugs'],
    [rx('mataron a su perro'), "the client's dog was killed"],
    [new RegExp(bL + noAcc('mataron a ') + '(?:el |la |los |las )?([a-z]+)' + bR, 'gi'), "$1 was killed"],
    
    // Médicos y otros
    [rx('gastos medicos'), 'medical expenses'],
    [rx('emergencia medica'), 'medical emergency'],
    [rx('hospitalizado'), 'hospitalized'],
    [rx('hospitalizada'), 'hospitalized'],
    [rx('cirugia'), 'surgery'],
    [rx('gastos inesperados'), 'unexpected expenses'],
    [rx('costo de vida'), 'cost of living'],
    [rx('inflacion'), 'inflation'],
    [rx('fallecimiento'), 'death'],
    [rx('murio'), 'passed away'],
    [new RegExp(bL + noAcc('gasto mucho en ') + '(?:la |el |los |las )?([a-z]+)' + bR, 'gi'), 'spent a lot on $1'],
    [new RegExp(bL + noAcc('gastaron mucho en ') + '(?:la |el |los |las )?([a-z]+)' + bR, 'gi'), 'spent a lot on $1'],
    [rx('gasto mucho'), 'spent a lot'],
    [rx('gastos de veterinaria'), 'vet bills'],
    [rx('en la veterinaria'), 'at the vet'],
    [rx('tuvo cancer'), 'had cancer'],
    [rx('tiene cancer'), 'has cancer'],
    [rx('pandemia'), 'pandemic'],
    [rx('covid 19'), 'COVID-19'],
    [rx('covid-19'), 'COVID-19'],
    [rx('covid'), 'COVID-19'],
    [rx('bancarrota'), 'bankruptcy'],
    [rx('quiebra'), 'bankruptcy']
  ];

  const EN_TO_ES_PHRASE_RULES = [
    [/\breports that\b/gi, 'comenta que'],
    [/\bstates that\b/gi, 'indica que'],
    [/\bmentions that\b/gi, 'menciona que'],
    [/\bsays that\b/gi, 'dice que'],
    [/\b(?:lost employment|lost their job|lost his job|lost her job)\b/gi, 'perdió su trabajo'],
    [/\b(?:became unemployed)\b/gi, 'se quedó desempleado'],
    [/\b(?:was laid off|were laid off)\b/gi, 'fue despedido'],
    [/\bwithout employment\b/gi, 'sin empleo'],
    [/\bunemployed\b/gi, 'desempleado'],
    [/\breduction in work hours\b/gi, 'reducción de horas de trabajo'],
    [/\bhad their hours cut\b/gi, 'le cortaron las horas'],
    [/\bincome decreased\b/gi, 'los ingresos bajaron'],
    [/\bpay cut\b/gi, 'recorte de sueldo'],
    [/\bcannot cover monthly expenses\b/gi, 'no alcanza para cubrir gastos mensuales'],
    [/\bcan no longer make payments\b/gi, 'ya no puede realizar pagos'],
    [/\bcannot make payments\b/gi, 'no puede realizar pagos'],
    [/\bis behind on payments\b/gi, 'está atrasado en pagos'],
    [/\bbehind on payments\b/gi, 'atrasado con los pagos'],
    [/\bmedical expenses\b/gi, 'gastos médicos'],
    [/\bmedical emergency\b/gi, 'emergencia médica'],
    [/\bhospitalized\b/gi, 'hospitalizado'],
    [/\bsurgery\b/gi, 'cirugía'],
    [/\bunexpected expenses\b/gi, 'gastos inesperados'],
    [/\bcost of living\b/gi, 'costo de vida'],
    [/\binflation\b/gi, 'inflación'],
    [/\bgot divorced\b/gi, 'se divorció'],
    [/\bdivorce\b/gi, 'divorcio'],
    [/\bseparation\b/gi, 'separación'],
    [/\bdeath\b/gi, 'fallecimiento'],
    [/\bpassed away\b/gi, 'falleció'],
    [/\bhad substance-use issues\b/gi, 'tuvo problemas de consumo de sustancias'],
    [/\bsubstance use\b/gi, 'consumo de sustancias'],
    [/\bthe client's dog was killed\b/gi, 'mataron a su perro'],
    [/\ba lot of debt\b/gi, 'muchas deudas'],
    [/\btoo much debt\b/gi, 'demasiadas deudas'],
    [/\bgot into debt\b/gi, 'se endeudó'],
    [/\bmaxed out cards\b/gi, 'tarjetas maximizadas'],
    [/\bhigh interest rates\b/gi, 'altos intereses'],
    [/\bpandemic\b/gi, 'pandemia'],
    [/\bcovid[- ]?19\b/gi, 'COVID-19'],
    [/\bbankruptcy\b/gi, 'bancarrota']
  ];

  const ES_TO_EN_WORDS = {
    'y': 'and', 'que': 'that', 'las': 'the', 'los': 'the', 'la': 'the', 'el': 'the', 'un': 'a', 'una': 'a',
    'de': 'of', 'su': "the client's", 'sus': "the client's", 'porque': 'because', 'tambien': 'also', 
    'actualmente': 'currently', 'tiene': 'has', 'tienen': 'have', 'tuvo': 'had', 'tuvieron': 'had',
    'problema': 'problem', 'problemas': 'problems', 'trabajo': 'job', 'empleo': 'employment',
    'ingreso': 'income', 'ingresos': 'income', 'pago': 'payment', 'pagos': 'payments',
    'mensual': 'monthly', 'mensuales': 'monthly', 'gasto': 'expense', 'gastos': 'expenses', 'gastó': 'spent',
    'deuda': 'debt', 'deudas': 'debts', 'banco': 'bank', 'bancos': 'banks', 'credito': 'credit',
    'tarjeta': 'card', 'tarjetas': 'cards', 'prestamo': 'loan', 'prestamos': 'loans',
    'renta': 'rent', 'alquiler': 'rent', 'hipoteca': 'mortgage', 'familia': 'family', 'hogar': 'household',
    'enfermedad': 'illness', 'accidente': 'accident', 'medico': 'medical', 'medicos': 'medical',
    'caro': 'expensive', 'altos': 'high', 'bajo': 'low', 'bajaron': 'decreased', 'subieron': 'increased',
    'dinero': 'money', 'fondos': 'funds', 'ayuda': 'help', 'necesita': 'needs', 'esposo': 'husband',
    'esposa': 'wife', 'hijo': 'son', 'hija': 'daughter', 'hijos': 'children', 'padre': 'father', 'madre': 'mother',
    'mama': 'mother', 'mamá': 'mother', 'papa': 'father', 'papá': 'father', 'perro': 'dog', 'gato': 'cat',
    'luego': 'then', 'despues': 'afterwards', 'en': 'in', 'con': 'with', 'por': 'for', 'para': 'for', 
    'pero': 'but', 'como': 'as', 'cuando': 'when', 'donde': 'where', 'cancer': 'cancer', 'veterinaria': 'vet',
    'mataron': 'killed', 'empezo': 'started', 'empezó': 'started', 'fue': 'was', 'fueron': 'were', 
    'quedo': 'stayed', 'quedó': 'stayed', 'ya no': 'no longer', 'ya': 'already'
  };

  const EN_TO_ES_WORDS = {
    'because': 'porque', 'also': 'también', 'currently': 'actualmente', 'and': 'y',
    'has': 'tiene', 'have': 'tienen', 'had': 'tuvo', 'problem': 'problema', 'problems': 'problemas',
    'job': 'trabajo', 'employment': 'empleo', 'income': 'ingresos', 'payment': 'pago', 'payments': 'pagos',
    'monthly': 'mensual', 'expense': 'gasto', 'expenses': 'gastos', 'debt': 'deuda', 'debts': 'deudas',
    'bank': 'banco', 'banks': 'bancos', 'credit': 'crédito', 'card': 'tarjeta', 'cards': 'tarjetas',
    'loan': 'préstamo', 'loans': 'préstamos', 'rent': 'renta', 'mortgage': 'hipoteca', 'family': 'familia',
    'household': 'hogar', 'illness': 'enfermedad', 'accident': 'accidente', 'medical': 'médico',
    'expensive': 'caro', 'high': 'altos', 'low': 'bajo', 'decreased': 'bajaron', 'increased': 'subieron',
    'money': 'dinero', 'funds': 'fondos', 'help': 'ayuda', 'needs': 'necesita', 'husband': 'esposo',
    'wife': 'esposa', 'son': 'hijo', 'daughter': 'hija', 'children': 'hijos', 'father': 'padre', 'mother': 'madre',
    'a': 'un', 'the': 'el', 'that': 'que', 'of': 'de', 'dog': 'perro', 'cat': 'gato', 'then': 'luego',
    'afterwards': 'después', 'in': 'en', 'with': 'con', 'for': 'para', 'but': 'pero', 'as': 'como',
    'when': 'cuando', 'where': 'donde', 'cancer': 'cáncer', 'vet': 'veterinaria', 'killed': 'mataron',
    'started': 'empezó', 'was': 'fue', 'were': 'fueron', 'spent': 'gastó', 'no longer': 'ya no', 'stayed': 'quedó'
  };

  function normalizeText(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u0000/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function applyRules(text, rules) {
    let out = String(text || '');
    rules.forEach(([pattern, replacement]) => {
      out = out.replace(pattern, replacement);
    });
    return out;
  }

  function replaceWordMapEsToEn(text, map) {
    let out = String(text || '');
    const sortedKeys = Object.keys(map).sort((a, b) => b.length - a.length);
    sortedKeys.forEach((from) => {
      const to = map[from];
      const pattern = new RegExp(bL + noAcc(from) + bR, 'gi');
      out = out.replace(pattern, to);
    });
    return out;
  }

  function replaceWordMapEnToEs(text, map) {
    let out = String(text || '');
    const sortedKeys = Object.keys(map).sort((a, b) => b.length - a.length);
    sortedKeys.forEach((from) => {
      const to = map[from];
      const pattern = new RegExp(`\\b${from}\\b`, 'gi');
      out = out.replace(pattern, to);
    });
    return out;
  }

  function canonicalizeSpanish(text) {
    let out = normalizeText(text)
      .replace(new RegExp(bL + noAcc('yo|ella|ellos|ellas') + bR, 'gi'), 'el cliente')
      .replace(new RegExp(bL + noAcc('mi') + bR, 'gi'), 'su')
      .replace(new RegExp(bL + noAcc('mis') + bR, 'gi'), 'sus')
      .replace(/el cliente\s+el cliente/gi, 'el cliente')
      .replace(new RegExp(bL + noAcc('consumia drogas') + bR, 'gi'), 'tuvo problemas de consumo de sustancias')
      .replace(new RegExp(bL + noAcc('consumo de drogas') + bR, 'gi'), 'consumo de sustancias');

    if (!new RegExp(bL + 'el cliente' + bR, 'i').test(noAcc(out)) && out) {
      out = `El cliente ${out.replace(/^[,.\s-]+/, '')}`;
    }
    return cleanupSpanish(out);
  }

  function canonicalizeEnglish(text) {
    let out = normalizeText(text)
      .replace(/\b(he|she|they)\b/gi, 'the client')
      .replace(/\b(him|her|them)\b/gi, 'the client')
      .replace(/\b(his|her|their)\b/gi, "the client's")
      .replace(/\b(the client)\s+(the client)\b/gi, 'the client')
      .replace(/\bdrug use\b/gi, 'substance use')
      .replace(/\bused drugs\b/gi, 'had substance-use issues');

    if (!/\bthe client\b/i.test(out) && out) {
      out = `The client ${out.replace(/^[,.\s-]+/, '')}`;
    }
    return cleanupEnglish(out);
  }

  function stripLeadingSubject(text, lang) {
    if (lang === 'es') return String(text || '').replace(/^\s*el cliente\b[\s,:-]*/i, '').trim();
    return String(text || '').replace(/^\s*the client\b[\s,:-]*/i, '').trim();
  }

  function cleanupEnglish(text) {
    let out = String(text || '')
      .replace(/\s+,/g, ',')
      .replace(/\s+\./g, '.')
      .replace(/\s{2,}/g, ' ')
      .replace(/\bthe client's's\b/gi, "the client's")
      .replace(/\bthe client\s+client\b/gi, 'the client')
      .replace(/\breports that lost employment\b/gi, 'reports losing employment')
      .replace(/\bthe debts\b/gi, 'debts')
      .replace(/\bmake payments debts\b/gi, 'make debt payments')
      .replace(/\bproblems of substance use\b/gi, 'substance-use problems')
      .replace(/^\s*(?:the client\s+)+/i, 'The client ')
      .replace(/\bThe client The client\b/gi, 'The client')
      .trim();
    
    // Capitalize first letter of sentences
    out = out.replace(/(^\w|\.\s*\w)/g, c => c.toUpperCase());
    
    // Fix random capitalization in the middle of sentences
    out = out.replace(/\bReports that\b/g, 'reports that')
             .replace(/\bStates that\b/g, 'states that')
             .replace(/\bMentions that\b/g, 'mentions that')
             .replace(/\bSays that\b/g, 'says that');
             
    return out;
  }

  function cleanupSpanish(text) {
    let out = String(text || '')
      .replace(/\s+,/g, ',')
      .replace(/\s+\./g, '.')
      .replace(/\s{2,}/g, ' ')
      .replace(/\bel cliente\s+cliente\b/gi, 'el cliente')
      .replace(/^\s*(?:el cliente\s+)+/i, 'El cliente ')
      .replace(/\bEl cliente El cliente\b/gi, 'El cliente')
      .trim();
      
    // Capitalize first letter of sentences
    out = out.replace(/(^\w|\.\s*\w)/g, c => c.toUpperCase());
    
    // Fix random capitalization
    out = out.replace(/\bComenta que\b/g, 'comenta que')
             .replace(/\bIndica que\b/g, 'indica que')
             .replace(/\bMenciona que\b/g, 'menciona que')
             .replace(/\bDice que\b/g, 'dice que');

    return out;
  }

  function translateSpanishToEnglish(text) {
    const source = canonicalizeSpanish(text);
    let body = stripLeadingSubject(source, 'es');
    body = applyRules(body, ES_TO_EN_PHRASE_RULES);
    body = replaceWordMapEsToEn(body, ES_TO_EN_WORDS);
    
    if (!/^\s*The client\b/i.test(body)) {
      body = `The client ${body}`;
    }
    
    return cleanupEnglish(body);
  }

  function translateEnglishToSpanish(text) {
    const source = canonicalizeEnglish(text);
    let body = stripLeadingSubject(source, 'en');
    body = applyRules(body, EN_TO_ES_PHRASE_RULES);
    body = replaceWordMapEnToEs(body, EN_TO_ES_WORDS);
    
    if (!/^\s*El cliente\b/i.test(body)) {
      body = `El cliente ${body}`;
    }
    
    return cleanupSpanish(body);
  }

  function enhanceSpanish(text) {
    let out = canonicalizeSpanish(text)
      .replace(rx('no puede pagar'), 'no puede realizar pagos')
      .replace(rx('se quedo sin trabajo'), 'perdió su trabajo')
      .replace(rx('esta atrasado'), 'está atrasado en pagos');
    return cleanupSpanish(out);
  }

  function enhanceEnglish(text) {
    let out = canonicalizeEnglish(text)
      .replace(/\bcannot pay\b/gi, 'cannot make payments')
      .replace(/\bis late\b/gi, 'is behind on payments')
      .replace(/\blost his job\b/gi, 'lost employment')
      .replace(/\blost her job\b/gi, 'lost employment');
    return cleanupEnglish(out);
  }

  function applyContextHeuristics(text, contextReason, lang) {
    if (!contextReason) return text;
    let out = text;
    const reason = String(contextReason).toLowerCase();

    if (lang === 'en') {
      if (reason.includes('loss of income') || reason.includes('job')) {
         if (!out.toLowerCase().includes('employment') && !out.toLowerCase().includes('income')) {
             out += ' due to loss of income';
         }
      } else if (reason.includes('medical')) {
         if (!out.toLowerCase().includes('medical')) {
             out += ' due to medical expenses';
         }
      } else if (reason.includes('divorce') || reason.includes('separation')) {
         if (!out.toLowerCase().includes('divorce') && !out.toLowerCase().includes('separation')) {
             out += ' due to marital separation';
         }
      }
    } else if (lang === 'es') {
       if (reason.includes('loss of income') || reason.includes('job')) {
         if (!out.toLowerCase().includes('ingreso') && !out.toLowerCase().includes('empleo') && !out.toLowerCase().includes('trabajo')) {
             out += ' debido a la pérdida de ingresos';
         }
      } else if (reason.includes('medical')) {
         if (!out.toLowerCase().includes('medic') && !out.toLowerCase().includes('salud')) {
             out += ' debido a gastos médicos';
         }
      } else if (reason.includes('divorce') || reason.includes('separation')) {
         if (!out.toLowerCase().includes('divorci') && !out.toLowerCase().includes('separaci')) {
             out += ' debido a una separación matrimonial';
         }
      }
    }
    return out;
  }

  async function translate({ sourceLang, text, hardshipReason }) {
    const lang = String(sourceLang || '').toLowerCase() === 'en' ? 'en' : 'es';
    const input = normalizeText(text);
    if (!input) return '';

    try {
      const response = await fetch('/api/hardship/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'translate',
          sourceLang: lang,
          text: input,
          hardshipReason: hardshipReason
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'API Error');

      return data.translatedText || '';
    } catch (err) {
      console.warn('[HardshipAssist] API translate failed, falling back to local:', err);
      let translated = lang === 'es'
        ? translateSpanishToEnglish(input)
        : translateEnglishToSpanish(input);
      
      translated = applyContextHeuristics(translated, hardshipReason, lang === 'es' ? 'en' : 'es');
      return translated;
    }
  }

  async function enhance({ spanishText, englishText, focusLang, hardshipReason }) {
    const focus = String(focusLang || '').toLowerCase() === 'en' ? 'en' : 'es';
    const srcEs = normalizeText(spanishText);
    const srcEn = normalizeText(englishText);

    try {
      const response = await fetch('/api/hardship/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'enhance',
          spanishText: srcEs,
          englishText: srcEn,
          hardshipReason: hardshipReason
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'API Error');

      return {
        spanishText: data.spanishText,
        englishText: data.englishText
      };
    } catch (err) {
      console.warn('[HardshipAssist] API enhance failed, falling back to local:', err);
      let outEs = srcEs;
      let outEn = srcEn;

      if (focus === 'en') {
        const baseEn = srcEn || translateSpanishToEnglish(srcEs);
        outEn = enhanceEnglish(baseEn);
        outEn = applyContextHeuristics(outEn, hardshipReason, 'en');
        outEs = translateEnglishToSpanish(outEn);
      } else {
        const baseEs = srcEs || translateEnglishToSpanish(srcEn);
        outEs = enhanceSpanish(baseEs);
        outEs = applyContextHeuristics(outEs, hardshipReason, 'es');
        outEn = translateSpanishToEnglish(outEs);
      }

      return {
        spanishText: cleanupSpanish(outEs),
        englishText: cleanupEnglish(outEn)
      };
    }
  }

  window.HardshipAssist = {
    normalizeText,
    translate,
    enhance
  };
})();