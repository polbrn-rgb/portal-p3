/**
 * MOTOR DO PORTAL P3 (Apps Script na conta 8bpmmp3@gmail.com)
 *
 * A cada 5 minutos procura demandas marcadas com "automacaoPendente" no Firestore e:
 *  - Prazo CPA / Prazo Cia -> evento de dia inteiro na agenda principal (como o painel do numerador);
 *  - Adicionar e gerar pasta CFP -> pasta (com P3 e CFP), evento na agenda do CFP com o link da pasta
 *    e linha na aba Operações.
 * Se o prazo ou as datas mudarem, move o evento em vez de criar outro.
 * Instalação: veja LEIAME.md nesta pasta.
 */
var CONFIG_P3 = {
  PROJETO: 'portal-p3',
  AGENDA_CFP: '3be42784b6e4ea29cd4d52fab39246f1bc670a94b01486464a4e904a85945506@group.calendar.google.com',
  PASTA_CFP: '1_DJwdylB3VAcTDMBC-9u-K8dgajrR9x5',
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

function processarPendentes() {
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(1000)) return; // uma rodada anterior ainda está trabalhando
  try {
    consultarPendentes_().forEach(processarDemanda_);
  } finally {
    trava.releaseLock();
  }
}

function processarDemanda_(doc) {
  var d = doc.dados;
  var auto = d.automacao || {};
  var feito = { agendaCPA: auto.agendaCPA || null, agendaCia: auto.agendaCia || null, cfp: auto.cfp || null };
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
  gravarResultado_(doc, feito);
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
    var pasta = DriveApp.getFolderById(CONFIG_P3.PASTA_CFP).createFolder(a.nomePasta);
    pasta.createFolder('P3');
    pasta.createFolder('CFP');
    var url = pasta.getUrl();
    var evCfp = cal.createAllDayEvent(a.titulo, dataLocal(a.inicio), diaSeguinte(a.fim), { description: '📂 PASTA CFP:\n' + url });
    feito.cfp = { eventoId: evCfp.getId(), inicio: a.inicio, fim: a.fim, titulo: a.titulo, pastaUrl: url };
    adicionarOperacao_(d);
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
function gravarResultado_(doc, feito) {
  var mascara = 'updateMask.fieldPaths=automacao&updateMask.fieldPaths=automacaoPendente';
  var r = firestore_('patch', doc.nome + '?' + mascara + '&currentDocument.updateTime=' + encodeURIComponent(doc.atualizadoEm), {
    fields: { automacao: jsParaValor(feito), automacaoPendente: { booleanValue: false } }
  });
  if (r.status === 200) return;
  firestore_('patch', doc.nome + '?updateMask.fieldPaths=automacao', { fields: { automacao: jsParaValor(feito) } });
}
