/**
 * MOTOR DO PORTAL P3 (Apps Script na conta 8bpmmp3@gmail.com)
 *
 * Roda na hora em que o portal salva (app da web) e, de reserva, a cada 5 minutos.
 * Procura demandas marcadas com "automacaoPendente" no Firestore e:
 *  - Prazo CPA / Prazo Cia -> evento de dia inteiro na agenda principal (como o painel do numerador);
 *  - Adicionar e gerar pasta CFP -> pasta (com P3 e CFP), evento na agenda do CFP com o link da pasta
 *    e linha na aba Operações.
 * Se o prazo ou as datas mudarem, move o evento em vez de criar outro.
 * Instalação: veja LEIAME.md nesta pasta.
 */
var CONFIG_P3 = {
  PROJETO: 'portal-p3',
  AGENDA_CFP: '3be42784b6e4ea29cd4d52fab39246f1bc670a94b01486464a4e904a85945506@group.calendar.google.com',
  PASTA_CFP: '1rqCpo4l64qmFG1FhPUWF1ivCL6DYffjo',
  PLANILHA_OPERACOES: 'COLE_AQUI_O_ID_DA_PLANILHA_DO_NUMERADOR', // a que tem a aba "Operações"
  ABA_OPERACOES: 'Operações',
  POR_RODADA: 10
};

/** Rode UMA vez pelo editor: liga o motor a cada 5 minutos. */
function instalarAutomacao() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processarPendentes') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processarPendentes').timeBased().everyMinutes(5).create();
  testarConexao();
}

/** Confere a chave e o acesso ao Firestore (mostra no registro de execução). */
function testarConexao() {
  var pendentes = consultarPendentes_();
  Logger.log('Conexão OK. Demandas aguardando agenda/pasta: ' + pendentes.length);
}

/**
 * Rode pelo editor quando algo não funcionar: mostra no registro em qual conta e em quais
 * agendas/pastas o motor está gravando, e quantas demandas estão esperando.
 */
function diagnostico() {
  var linhas = [];
  var ok = function (rotulo, fn) {
    try { linhas.push('✅ ' + rotulo + ': ' + fn()); } catch (e) { linhas.push('❌ ' + rotulo + ': ' + e.message); }
  };
  ok('Agenda dos prazos (principal)', function () { var c = CalendarApp.getDefaultCalendar(); return c.getName() + ' (' + c.getId() + ')'; });
  ok('Agenda do CFP', function () { var c = CalendarApp.getCalendarById(CONFIG_P3.AGENDA_CFP); if (!c) throw new Error('sem acesso ou ID errado'); return c.getName(); });
  ok('Pasta do CFP', function () { return DriveApp.getFolderById(CONFIG_P3.PASTA_CFP).getName(); });
  ok('Planilha Operações', function () {
    if (CONFIG_P3.PLANILHA_OPERACOES.indexOf('COLE_AQUI') === 0) throw new Error('ID não preenchido no CONFIG_P3');
    var ss = SpreadsheetApp.openById(CONFIG_P3.PLANILHA_OPERACOES);
    if (!ss.getSheetByName(CONFIG_P3.ABA_OPERACOES)) throw new Error('aba Operações não encontrada em ' + ss.getName());
    return ss.getName();
  });
  ok('Gatilho de 5 minutos', function () {
    var n = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'processarPendentes'; }).length;
    if (!n) throw new Error('não instalado: rode instalarAutomacao');
    return 'instalado';
  });
  ok('Firestore (chave)', function () {
    var p = consultarPendentes_();
    return p.length + ' demanda(s) esperando' + (p.length ? ': nº ' + p.map(function (d) { return d.dados.numero; }).join(', ') : '');
  });
  Logger.log(linhas.join('\n'));
}

/** Gatilho de reserva (a cada 5 min): se outra rodada estiver trabalhando, deixa para ela. */
function processarPendentes() {
  rodarMotor_(1000);
}

/**
 * Chamado pelo portal logo depois de salvar (app da web). Espera a vez se outra rodada estiver
 * trabalhando, para não deixar demanda para trás. Não recebe nem devolve dados: só faz o motor rodar.
 */
function doPost() {
  rodarMotor_(25000);
  return ContentService.createTextOutput('ok');
}

function doGet() {
  return doPost();
}

function rodarMotor_(esperaMs) {
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(esperaMs)) return;
  try {
    // Repete enquanto houver pendentes (pega também o que foi salvo durante a rodada).
    for (var i = 0; i < 3; i++) {
      var pendentes = consultarPendentes_();
      if (!pendentes.length) break;
      pendentes.forEach(processarDemanda_);
    }
  } finally {
    trava.releaseLock();
  }
}

function processarDemanda_(doc) {
  var d = doc.dados;
  var auto = d.automacao || {};
  var feito = { agendaCPA: auto.agendaCPA || null, agendaCia: auto.agendaCia || null, cfp: auto.cfp || null, cfpPasta: auto.cfpPasta || null };
  var erros = [];

  planejarAutomacao(d, feito).forEach(function (acao) {
    try {
      executar_(acao, d, feito);
    } catch (e) {
      erros.push(acao.chave + ': ' + e.message);
    }
  });

  feito.erro = erros.join(' | ');
  feito.processadoEm = new Date().toISOString();
  // Com erro, continua pendente: o gatilho tenta de novo a cada 5 minutos até dar certo.
  gravarResultado_(doc, feito, erros.length > 0);
}

function agenda_(qual) {
  var cal = qual === 'cfp' ? CalendarApp.getCalendarById(CONFIG_P3.AGENDA_CFP) : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error('Agenda ' + qual + ' não encontrada');
  return cal;
}

function executar_(a, d, feito) {
  var cal = agenda_(a.agenda);
  if (a.tipo === 'criar') {
    var ev = cal.createAllDayEvent(a.titulo, dataLocal(a.inicio), diaSeguinte(a.fim), { description: a.descricao || '' });
    feito[a.chave] = { eventoId: ev.getId(), inicio: a.inicio, fim: a.fim, titulo: a.titulo };
  } else if (a.tipo === 'atualizar') {
    var existente = a.eventoId ? cal.getEventById(a.eventoId) : null;
    if (!existente) {
      // Apagaram o evento na mão: cria de novo.
      var desc = a.pastaUrl ? '📂 PASTA CFP:\n' + a.pastaUrl : a.descricao || '';
      existente = cal.createAllDayEvent(a.titulo, dataLocal(a.inicio), diaSeguinte(a.fim), { description: desc });
    } else {
      existente.setTitle(a.titulo);
      existente.setAllDayDates(dataLocal(a.inicio), diaSeguinte(a.fim));
    }
    var novo = { eventoId: existente.getId(), inicio: a.inicio, fim: a.fim, titulo: a.titulo };
    if (a.pastaUrl) novo.pastaUrl = a.pastaUrl;
    feito[a.chave] = novo;
  } else if (a.tipo === 'apagar') {
    var ev2 = a.eventoId ? cal.getEventById(a.eventoId) : null;
    if (ev2) ev2.deleteEvent();
    feito[a.chave] = null;
  } else if (a.tipo === 'criarCFP') {
    // 1) pasta (reaproveita se já foi criada numa tentativa anterior)
    if (!feito.cfpPasta) {
      var pasta = DriveApp.getFolderById(CONFIG_P3.PASTA_CFP).createFolder(a.nomePasta);
      pasta.createFolder('P3');
      pasta.createFolder('CFP');
      feito.cfpPasta = pasta.getUrl();
    }
    // 2) evento na agenda do CFP com o link da pasta
    var evCfp = cal.createAllDayEvent(a.titulo, dataLocal(a.inicio), diaSeguinte(a.fim), { description: '📂 PASTA CFP:\n' + feito.cfpPasta });
    feito.cfp = { eventoId: evCfp.getId(), inicio: a.inicio, fim: a.fim, titulo: a.titulo, pastaUrl: feito.cfpPasta, operacoes: false };
    // 3) linha na aba Operações
    adicionarOperacao_(d);
    feito.cfp.operacoes = true;
  } else if (a.tipo === 'operacoes') {
    adicionarOperacao_(d);
    feito.cfp.operacoes = true;
  }
}

/** Mesma linha que o painel do numerador colocava na aba Operações. */
function adicionarOperacao_(d) {
  if (CONFIG_P3.PLANILHA_OPERACOES.indexOf('COLE_AQUI') === 0) return;
  var aba = SpreadsheetApp.openById(CONFIG_P3.PLANILHA_OPERACOES).getSheetByName(CONFIG_P3.ABA_OPERACOES);
  if (!aba) throw new Error('Aba Operações não encontrada');
  var maiorSeq = 0;
  var total = aba.getLastRow();
  if (total >= 2) {
    aba.getRange(2, 1, total - 1, 1).getValues().forEach(function (l) {
      var n = parseInt(l[0], 10);
      if (!isNaN(n) && n > maiorSeq) maiorSeq = n;
    });
  }
  aba.insertRowBefore(2);
  var linha = aba.getRange(2, 1, 1, aba.getLastColumn());
  linha.clearFormat().setFontFamily('Roboto').setFontSize(10).setVerticalAlignment('middle');
  if (aba.getLastRow() >= 3) {
    aba.getRange(3, 1, 1, aba.getLastColumn()).copyTo(linha, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
  }
  aba.getRange('A2:G2').setValues([[maiorSeq + 1, d.saida, '8º BPM/M', d.numeroOrigem || '', d.origem || 'P/3',
    dataLocal(d.inicioBtl), dataLocal(d.terminoBtl)]]);
  ['A2', 'C2', 'E2', 'F2', 'G2'].forEach(function (c) { aba.getRange(c).setHorizontalAlignment('center'); });
}

// ---------- Firestore (REST) com a conta de serviço ----------

function token_() {
  var cache = CacheService.getScriptCache();
  var guardado = cache.get('token_firestore');
  if (guardado) return guardado;

  var bruto = PropertiesService.getScriptProperties().getProperty('CHAVE_SERVICO');
  if (!bruto) throw new Error('Falta a propriedade CHAVE_SERVICO (veja LEIAME.md).');
  var chave = JSON.parse(bruto);
  var agora = Math.floor(Date.now() / 1000);
  var b64 = function (x) { return Utilities.base64EncodeWebSafe(x).replace(/=+$/, ''); };
  var cabecalho = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var corpo = b64(JSON.stringify({
    iss: chave.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600
  }));
  var assinatura = b64(Utilities.computeRsaSha256Signature(cabecalho + '.' + corpo, chave.private_key));
  var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: cabecalho + '.' + corpo + '.' + assinatura }
  });
  var token = JSON.parse(resp.getContentText()).access_token;
  cache.put('token_firestore', token, 3000);
  return token;
}

function firestore_(metodo, caminho, corpo) {
  var resp = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/' + caminho, {
    method: metodo,
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token_() },
    payload: corpo ? JSON.stringify(corpo) : undefined,
    muteHttpExceptions: true
  });
  return { status: resp.getResponseCode(), json: JSON.parse(resp.getContentText() || '{}') };
}

function consultarPendentes_() {
  var r = firestore_('post', 'projects/' + CONFIG_P3.PROJETO + '/databases/(default)/documents:runQuery', {
    structuredQuery: {
      from: [{ collectionId: 'demandas' }],
      where: { fieldFilter: { field: { fieldPath: 'automacaoPendente' }, op: 'EQUAL', value: { booleanValue: true } } },
      limit: CONFIG_P3.POR_RODADA
    }
  });
  if (r.status !== 200) throw new Error('Firestore ' + r.status + ': ' + JSON.stringify(r.json));
  return r.json
    .filter(function (x) { return x.document; })
    .map(function (x) { return { nome: x.document.name, atualizadoEm: x.document.updateTime, dados: camposParaJs(x.document.fields) }; });
}

/**
 * Grava o que foi feito. Se a demanda foi editada enquanto o motor trabalhava, guarda os IDs dos eventos
 * mas deixa "pendente" ligado, para a próxima rodada conferir de novo (nunca duplica evento).
 */
function gravarResultado_(doc, feito, continuarPendente) {
  var mascara = 'updateMask.fieldPaths=automacao&updateMask.fieldPaths=automacaoPendente';
  var r = firestore_('patch', doc.nome + '?' + mascara + '&currentDocument.updateTime=' + encodeURIComponent(doc.atualizadoEm), {
    fields: { automacao: jsParaValor(feito), automacaoPendente: { booleanValue: !!continuarPendente } }
  });
  if (r.status === 200) return;
  firestore_('patch', doc.nome + '?updateMask.fieldPaths=automacao', { fields: { automacao: jsParaValor(feito) } });
}
