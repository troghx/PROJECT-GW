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
    // Tarjetas (más específicas primero)
    [rx('ya no puede realizar los pagos de las tarjetas'), 'can no longer make card payments'],
    [rx('ya no puede hacer los pagos de las tarjetas'), 'can no longer make card payments'],
    [rx('no puede realizar los pagos de las tarjetas'), 'cannot make card payments'],
    [rx('no puede hacer los pagos de las tarjetas'), 'cannot make card payments'],
    [rx('los pagos de las tarjetas'), 'card payments'],
    [rx('pagos de las tarjetas'), 'card payments'],
    // Formas verbales compuestas (ha/han + participio)
    [rx('no ha podido trabajar'), 'has not been able to work'],
    [rx('no ha podido pagar'), 'has not been able to pay'],
    [rx('no ha podido conseguir'), 'has not been able to find'],
    [rx('no ha podido'), 'has not been able to'],
    [rx('no han podido'), 'have not been able to'],
    [rx('ha podido'), 'has been able to'],
    [rx('ha tenido que'), 'has had to'],
    [rx('ha tenido'), 'has had'],
    [rx('ha estado'), 'has been'],
    [rx('ha sido'), 'has been'],
    [rx('ha perdido'), 'has lost'],
    [rx('ha buscado'), 'has sought'],
    [rx('han tenido'), 'have had'],
    [rx('ha dejado de trabajar'), 'has stopped working'],
    [rx('dejo de trabajar'), 'stopped working'],
    [rx('no puede trabajar'), 'cannot work'],
    // Pagos genéricos
    [rx('ya no puede realizar pagos'), 'can no longer make payments'],
    [rx('ya no puede hacer los pagos'), 'can no longer make payments'],
    [rx('ya no puede pagar'), 'can no longer make payments'],
    [rx('no puede realizar pagos'), 'cannot make payments'],
    [rx('no puede hacer los pagos'), 'cannot make payments'],
    [rx('para pagar'), 'to pay'],
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
    [rx('quiebra'), 'bankruptcy'],

    // Conectores (desde que, debido a que, para + infinitivo)
    [rx('desde que'), 'since'],
    [rx('desde hace'), 'for the past'],
    [rx('debido a que se divorcio'), 'because of the divorce'],
    [rx('debido a que se separo'), 'because of the separation'],
    [rx('debido a que'), 'because'],
    [rx('para cubrir'), 'to cover'],
    [rx('para pedir'), 'to request'],
    [rx('pedir prestamos'), 'take out loans'],
    [rx('pedir prestado'), 'borrow'],
    // Conectores causales (antes de word map para evitar "debido a the")
    [rx('debido a las'), 'due to'],
    [rx('debido a los'), 'due to'],
    [rx('debido a la'), 'due to'],
    [rx('debido al'), 'due to the'],
    [rx('debido a'), 'due to'],
    [rx('a causa de las'), 'because of'],
    [rx('a causa de los'), 'because of'],
    [rx('a causa de la'), 'because of'],
    [rx('a causa de'), 'because of'],
    [rx('por culpa de'), 'because of'],

    // Artículo + sustantivo (evitar "the drugs", "the debts", etc.)
    [rx('las drogas'), 'drugs'],
    [rx('la droga'), 'drugs'],
    [rx('las deudas'), 'debts'],
    [rx('los pagos'), 'payments'],
    [rx('los gastos'), 'expenses'],
    [rx('los intereses'), 'interest rates'],
    [rx('las tarjetas'), 'cards'],
    [rx('el dinero'), 'money'],
    [rx('la familia'), 'the family'],
    [rx('la renta'), 'rent'],
    [rx('el alquiler'), 'rent']
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
    [/\bbankruptcy\b/gi, 'bancarrota'],
    [/\bdue to\b/gi, 'debido a'],
    [/\bbecause of\b/gi, 'a causa de'],
    [/\breports losing employment\b/gi, 'comenta que perdió su trabajo'],
    [/\breports that the client lost employment\b/gi, 'comenta que perdió su trabajo'],
    [/\bcan no longer make card payments\b/gi, 'ya no puede hacer los pagos de las tarjetas'],
    [/\bcannot make card payments\b/gi, 'no puede hacer los pagos de las tarjetas'],
    [/\bcard payments\b/gi, 'pagos de las tarjetas'],
    [/\bdrugs?\b/gi, 'drogas'],
    [/\bseeks help\b/gi, 'busca ayuda'],
    [/\bsought help\b/gi, 'buscó ayuda'],
    [/\bspent a lot\b/gi, 'gastó mucho'],
    [/\bvet bills?\b/gi, 'gastos de veterinaria'],
    [/\bhas not been able to work\b/gi, 'no ha podido trabajar'],
    [/\bhas not been able to pay\b/gi, 'no ha podido pagar'],
    [/\bhas not been able to\b/gi, 'no ha podido'],
    [/\bhave not been able to\b/gi, 'no han podido'],
    [/\bhas been able to\b/gi, 'ha podido'],
    [/\bhas had to\b/gi, 'ha tenido que'],
    [/\bhas been\b/gi, 'ha estado'],
    [/\bcannot work\b/gi, 'no puede trabajar'],
    [/\bstopped working\b/gi, 'dejó de trabajar'],
    [/\bthat is why\b/gi, 'por eso'],
    [/\bgot into debt\b/gi, 'se endeudó'],
    [/\bin debt\b/gi, 'endeudado'],
    [/\bcannot cover monthly expenses\b/gi, 'no alcanza para cubrir gastos mensuales']
  ];

  const ES_TO_EN_WORDS = {
    'y': 'and', 'que': 'that', 'las': 'the', 'los': 'the', 'la': 'the', 'el': 'the', 'un': 'a', 'una': 'a',
    'de': 'of', 'su': "the client's", 'sus': "the client's", 'porque': 'because', 'tambien': 'also', 
    'actualmente': 'currently', 'tengo': 'has', 'tiene': 'has', 'tienen': 'have', 'tuvo': 'had', 'tuvieron': 'had',
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
    'quedo': 'stayed', 'quedó': 'stayed', 'ya no': 'no longer', 'ya': 'already',
    'pagar': 'pay', 'paga': 'pays', 'pagando': 'paying', 'mucho': 'a lot', 'muy': 'very',
    'mas': 'more', 'menos': 'less', 'todo': 'everything', 'todos': 'all', 'nada': 'nothing',
    'solo': 'only', 'ahora': 'now', 'antes': 'before', 'desde': 'since', 'hasta': 'until',
    'sin': 'without', 'ni': 'nor', 'otra': 'another', 'otro': 'another', 'cada': 'every',
    'trabajar': 'work', 'trabajando': 'working', 'trabajaba': 'was working',
    'podido': 'been able', 'puede': 'can', 'pudo': 'could', 'poder': 'be able to',
    'ha': 'has', 'han': 'have', 'sido': 'been', 'estado': 'been', 'hecho': 'done',
    'conseguir': 'find', 'conseguido': 'found', 'vivir': 'live', 'viviendo': 'living',
    'comer': 'eat', 'comprar': 'buy', 'mantener': 'maintain', 'cubrir': 'cover',
    'suficiente': 'enough', 'dificil': 'difficult', 'imposible': 'impossible',
    'situacion': 'situation', 'momento': 'moment', 'tiempo': 'time', 'meses': 'months',
    'años': 'years', 'dias': 'days', 'semanas': 'weeks'
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
    'dog': 'perro', 'cat': 'gato', 'then': 'luego',
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

  // Verbos/partículas que indican que "el" precedente es pronombre (él), no artículo
  const PRONOUN_VERB_PATTERN = '(?:comenta|indica|menciona|dice|tiene|tuvo|fue|se\\b|no\\b|ya\\b|est[aá]|perdi[oó]|trabaja|busca|pudo|puede|necesita|hizo|qued[oó]|tambi[eé]n|actualmente|le\\b)';

  function canonicalizeSpanish(text) {
    let out = normalizeText(text);

    // Pronombres estándar → "el cliente"
    out = out.replace(new RegExp(bL + noAcc('yo|ella|ellos|ellas') + bR, 'gi'), 'el cliente');

    // "el/él" como pronombre antes de verbos (no artículo antes de sustantivo)
    out = out.replace(new RegExp(bL + noAcc('el') + '(?=\\s+' + PRONOUN_VERB_PATTERN + ')', 'gi'), 'el cliente');

    // Posesivos
    out = out.replace(new RegExp(bL + noAcc('mi') + bR, 'gi'), 'su');
    out = out.replace(new RegExp(bL + noAcc('mis') + bR, 'gi'), 'sus');

    // Dedup
    out = out.replace(/el cliente\s+el cliente/gi, 'el cliente');

    // Sanitizar drogas → sustancias
    out = out.replace(new RegExp(bL + noAcc('consumia drogas') + bR, 'gi'), 'tuvo problemas de consumo de sustancias');
    out = out.replace(new RegExp(bL + noAcc('consumo de drogas') + bR, 'gi'), 'consumo de sustancias');

    if (!new RegExp(bL + noAcc('el cliente') + bR, 'i').test(out) && out) {
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
      .replace(/\bstates that lost employment\b/gi, 'states that the client lost employment')
      // "reports that got/lost/became..." → insertar sujeto faltante
      .replace(/\b(reports|states|mentions|says) that (got|lost|became|was|had|has|is|cannot|can)\b/gi, '$1 that the client $2')
      .replace(/\bthe debts\b/gi, 'debts')
      .replace(/\bmake payments debts\b/gi, 'make debt payments')
      .replace(/\bproblems of substance use\b/gi, 'substance-use problems')
      // "The client the reports..." → strip stray article from "el" pronoun leakage
      .replace(/\bthe client the (?=[a-z])/gi, 'The client ')
      .replace(/^\s*(?:the client\s+)+/i, 'The client ')
      .replace(/\bThe client The client\b/gi, 'The client')
      // Strip orphaned articles: "due to the drugs" → "due to drugs"
      .replace(/\b(due to|because of) the (?=[a-z])/gi, '$1 ')
      .trim();
    
    // "a" → "an" before vowel sounds
    out = out.replace(/\ba ([aeiou])/gi, 'an $1');

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
    const lower = out.toLowerCase();

    // No agregar contexto si el texto ya tiene una cláusula causal
    if (/\b(due to|because of?|caused by|as a result|debido a|a causa de|por culpa de)\b/i.test(out)) {
      return out;
    }

    if (lang === 'en') {
      if (reason.includes('loss of income') || reason.includes('job')) {
         if (!lower.includes('employment') && !lower.includes('income') && !lower.includes('job')) {
             out += ' due to loss of income';
         }
      } else if (reason.includes('medical')) {
         if (!lower.includes('medical') && !lower.includes('hospital') && !lower.includes('surgery')) {
             out += ' due to medical expenses';
         }
      } else if (reason.includes('divorce') || reason.includes('separation')) {
         if (!lower.includes('divorce') && !lower.includes('separation') && !lower.includes('separated')) {
             out += ' due to marital separation';
         }
      }
    } else if (lang === 'es') {
       if (reason.includes('loss of income') || reason.includes('job')) {
         if (!lower.includes('ingreso') && !lower.includes('empleo') && !lower.includes('trabajo')) {
             out += ' debido a la pérdida de ingresos';
         }
      } else if (reason.includes('medical')) {
         if (!lower.includes('medic') && !lower.includes('salud') && !lower.includes('hospital')) {
             out += ' debido a gastos médicos';
         }
      } else if (reason.includes('divorce') || reason.includes('separation')) {
         if (!lower.includes('divorci') && !lower.includes('separaci')) {
             out += ' debido a una separación matrimonial';
         }
      }
    }
    return out;
  }

  function translateLocal(input, lang, hardshipReason) {
    let translated = lang === 'es'
      ? translateSpanishToEnglish(input)
      : translateEnglishToSpanish(input);
    const targetLang = lang === 'es' ? 'en' : 'es';
    translated = applyContextHeuristics(translated, hardshipReason, targetLang);
    return translated;
  }

  async function translate({ sourceLang, text, hardshipReason, onUpgrade }) {
    const lang = String(sourceLang || '').toLowerCase() === 'en' ? 'en' : 'es';
    const input = normalizeText(text);
    if (!input) return '';

    // Traducción local instantánea
    const localResult = translateLocal(input, lang, hardshipReason);

    // Si hay callback onUpgrade, devolver local inmediatamente y mejorar en background
    if (typeof onUpgrade === 'function') {
      fetch('/api/hardship/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'translate',
          sourceLang: lang,
          text: input,
          hardshipReason: hardshipReason
        })
      })
        .then(r => r.json().then(data => ({ ok: r.ok, data })))
        .then(({ ok, data }) => {
          if (ok && data.translatedText && data.translatedText !== localResult) {
            onUpgrade(data.translatedText);
          }
        })
        .catch(() => {}); // local ya fue aplicado, silenciar error de API

      return localResult;
    }

    // Modo síncrono (sin onUpgrade): intentar API, fallback a local
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
      return data.translatedText || localResult;
    } catch (err) {
      console.warn('[HardshipAssist] API translate failed, using local:', err.message);
      return localResult;
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