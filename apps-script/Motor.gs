/**
 * MOTOR DO PORTAL P3 (Apps Script na conta 8bpmmp3@gmail.com)
 *
 * Roda na hora em que o portal salva (app da web) e, de reserva, a cada 5 minutos.
 * Procura demandas marcadas com "automacaoPendente" no Firestore e:
 *  - Prazo CPA / Prazo Cia -> evento de dia inteiro na agenda principal (como o painel do numerador);
 *  - Adicionar e gerar pasta CFP -> pasta (com P3 e CFP), evento na agenda do CFP com o link da pasta
 *    e linha na aba Operações.
 * Se o prazo ou as datas mudarem, move o evento em vez de criar outro.
 * Também traz para a aba "Demandas Pendentes" os e-mails encaminhados pela caixa funcional
 * e copia a agenda do CFP para a página do CFP no portal.
 * Instalação: veja LEIAME.md nesta pasta.
 */
var CONFIG_P3 = {
  PROJETO: 'portal-p3',
  AGENDA_CFP: '3be42784b6e4ea29cd4d52fab39246f1bc670a94b01486464a4e904a85945506@group.calendar.google.com',
  PASTA_CFP: '1rqCpo4l64qmFG1FhPUWF1ivCL6DYffjo',
  PLANILHA_OPERACOES: '1cY1jbA7AGNLN66tTqH0CyuwHe9X-Xz_DVdcv0xWjado', // Numerador 2026 (aba "Operações")
  ABA_OPERACOES: 'Operações',
  POR_RODADA: 10,
  // Demandas Pendentes: só entram e-mails encaminhados por esta caixa
  EMAIL_FUNCIONAL: '8bpmmp3@policiamilitar.sp.gov.br',
  ETIQUETA_GMAIL: 'Portal P3', // marca no Gmail os e-mails já trazidos
  PASTA_ANEXOS: '', // vazio = cria a pasta "Portal P3 - Anexos" no Drive na primeira vez
  // Checklist Operações
  PLANILHA_RESULTADO_MODELO: '1mI3hKilIloD0i3KYdvSXRLoNXgWpwoKBXdWUG-AIse0',
  PLANILHA_EFETIVO: '1IlTIPxp0rR4rzjFygxtldvQja4GgCsap2kLIK28z8Ck',
  ABA_EFETIVO: 'BD Efetivo', // lida primeiro; as outras abas com RE e NOME DE GUERRA completam
  HORA_EFETIVO: 5, // atualização diária do banco de efetivo
  // Página do CFP: eventos da agenda do CFP de X dias atrás até Y dias à frente
  AGENDA_CFP_DIAS_ANTES: 60,
  AGENDA_CFP_DIAS_DEPOIS: 365,
  // Aperfeiçoamento: EAP (cada EAP nova vira uma cópia zerada do modelo, nesta pasta)
  PLANILHA_EAP_MODELO: '12qEDEI1sdN_7FMZCLCs4gUWxfkokXdPGtT_rP4oxbdI',
  PASTA_EAP: '13eaHfoeX8BvK8wZQ_0Gt1aN207x_FRTk',
  // Operações → Controle de Operações: Relatório de Indicadores (mesmos IDs do script "Relatório P/3" do numerador)
  RELATORIO_MODELO: '1jt9sR10f2JsPQ57wmj0TrE3WeXyjsS89', // Modelo_Relatorio_Indicadores.docx
  RELATORIO_PASTA: '1cMxp1KcboYj_1VSib3DJPgFiTE_jnU0j', // onde os relatórios são salvos
  PLANILHA_INDICADORES: '1kLHkeia6NozgBm8nCvDal4xLC6M2CtWdkXmeNVsOZXM',
  ABA_INDICADORES: 'BTL',
  FAIXA_CRIMES: 'C36:E44', // 9 linhas: Homicídio ... Roubo a Banco
  FAIXA_PRODUTIVIDADE: 'C50:E57', // 8 linhas: Flagrante de tráfico ... Veículos vistoriados
  PREFIXO_RELATORIO: '8BPMM-',
  // Operações → Documentos Mensais: cópia de cada mês (uma subpasta por mês)
  PASTA_DOCS_MENSAIS_ARQUIVO: '1mkm8R8dTpYF1jp1C2kStpONI1eN95EpN',
  // Aperfeiçoamento → ICC: modelo das planilhas (cada ICC nova é uma cópia zerada, na mesma pasta)
  PLANILHA_ICC_MODELO: '1G5kd6AldoiYL8kV-mckAUf67aIBGy9LdhKzLiLNPJxw'
};

/** Rode UMA vez pelo editor: liga o motor a cada 5 minutos. */
function instalarAutomacao() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processarPendentes') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processarPendentes').timeBased().everyMinutes(5).create();
  // O resumo diário por e-mail foi retirado: apaga o gatilho antigo, se ainda existir.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarResumoDiario' || t.getHandlerFunction() === 'sincronizarEfetivo') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sincronizarEfetivo').timeBased().atHour(CONFIG_P3.HORA_EFETIVO).everyDays(1).create();
  testarConexao();
  sincronizarEfetivo();
  sincronizarAgendaCfp();
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
  ok('E-mails do funcional (últimos 2 dias)', function () {
    return GmailApp.search('from:' + CONFIG_P3.EMAIL_FUNCIONAL + ' newer_than:2d', 0, 50).length + ' conversa(s)';
  });
  ok('Modelo de resultados', function () { return DriveApp.getFileById(CONFIG_P3.PLANILHA_RESULTADO_MODELO).getName(); });
  ok('Banco de efetivo', function () { return SpreadsheetApp.openById(CONFIG_P3.PLANILHA_EFETIVO).getName(); });
  ok('Modelo do relatório (Word)', function () { return DriveApp.getFileById(CONFIG_P3.RELATORIO_MODELO).getName(); });
  ok('Pasta dos relatórios', function () { return DriveApp.getFolderById(CONFIG_P3.RELATORIO_PASTA).getName(); });
  ok('Pasta de arquivo dos Documentos Mensais', function () { return DriveApp.getFolderById(CONFIG_P3.PASTA_DOCS_MENSAIS_ARQUIVO).getName(); });
  ok('Documentos Mensais (formato das planilhas)', function () {
    var cfg = obterDoc_('config/documentosMensais');
    if (!cfg) throw new Error('a P/3 ainda não abriu Operações → Documentos Mensais no portal');
    return cfg.documentos.filter(function (d) { return d.celulas; }).map(function (d) {
      try { conferirDocMensal_(d); return '✅ ' + d.nome; } catch (e) { return '❌ ' + d.nome + ': ' + e.message; }
    }).join(' | ');
  });
  ok('Modelo da planilha da ICC', function () {
    var ss = SpreadsheetApp.openById(CONFIG_P3.PLANILHA_ICC_MODELO);
    abaIcc_(ss);
    return ss.getName();
  });
  ok('Planilha de indicadores', function () {
    var ss = SpreadsheetApp.openById(CONFIG_P3.PLANILHA_INDICADORES);
    if (!ss.getSheetByName(CONFIG_P3.ABA_INDICADORES)) throw new Error('aba ' + CONFIG_P3.ABA_INDICADORES + ' não encontrada');
    return ss.getName();
  });
  ok('Firestore (chave)', function () {
    var p = consultarPendentes_();
    return p.length + ' demanda(s) esperando' + (p.length ? ': nº ' + p.map(function (d) { return d.dados.numero; }).join(', ') : '');
  });
  Logger.log(linhas.join('\n'));
}

function ultimasDemandas_(quantas) {
  var r = firestore_('post', 'projects/' + CONFIG_P3.PROJETO + '/databases/(default)/documents:runQuery', {
    structuredQuery: { from: [{ collectionId: 'demandas' }], orderBy: [{ field: { fieldPath: 'numero' }, direction: 'DESCENDING' }], limit: quantas }
  });
  if (r.status !== 200) throw new Error('Firestore ' + r.status + ': ' + JSON.stringify(r.json));
  return r.json
    .filter(function (x) { return x.document; })
    .map(function (x) { return { nome: x.document.name, atualizadoEm: x.document.updateTime, dados: camposParaJs(x.document.fields) }; });
}

/** Rode pelo editor: refaz agora o que faltou na demanda mais recente (sem repetir o que já foi feito). */
function reprocessarUltima() {
  var ultima = ultimasDemandas_(1)[0];
  if (!ultima) return Logger.log('Nenhuma demanda.');
  processarDemanda_(ultima);
  verUltimasDemandas();
}

/** Rode pelo editor: mostra as 3 demandas mais recentes como o motor as vê e o que ele faria com cada uma. */
function verUltimasDemandas() {
  ultimasDemandas_(3).forEach(function (doc) {
    var d = doc.dados;
    var a = d.automacao || {};
    Logger.log([
      'Nº ' + d.numero + ' — ' + d.saida,
      '  Prazo CPA: ' + (d.prazoCPA || '-') + ' | Prazo Cia: ' + (d.prazoCia || '-'),
      '  CFP: ' + (d.adicionarCFP ? 'sim' : 'não') + ' | Início/Término Btl: ' + (d.inicioBtl || '-') + ' / ' + (d.terminoBtl || '-'),
      '  Aguardando motor: ' + (d.automacaoPendente === true ? 'SIM' : d.automacaoPendente === false ? 'não' : 'campo ausente (portal antigo?)'),
      '  Já feito: ' + JSON.stringify({ agendaCPA: a.agendaCPA, agendaCia: a.agendaCia, cfp: a.cfp }),
      '  Último erro: ' + (a.erro || '-') + ' | Processado em: ' + (a.processadoEm || '-'),
      '  O motor faria agora: ' + JSON.stringify(planejarAutomacao(d, { agendaCPA: a.agendaCPA, agendaCia: a.agendaCia, cfp: a.cfp }).map(function (y) { return y.tipo + ' ' + y.chave; }))
    ].join('\n'));
  });
}

/**
 * Rode pelo editor (uma vez): refaz a limpeza de TODAS as demandas já excluídas no portal —
 * apaga o que sobrou nas agendas (inclusive a do CFP) e manda a pasta do CFP para a lixeira.
 * Serve para as excluídas antes desta versão. Não mexe em nenhuma demanda que não foi excluída.
 */
function limparExcluidas() {
  var excluidas = consultar_('demandas', 'status', 'excluido', 500);
  var limpas = 0;
  excluidas.forEach(function (doc) {
    var d = doc.dados;
    var auto = d.automacao || {};
    var feito = { agendaCPA: auto.agendaCPA || null, agendaCia: auto.agendaCia || null, cfp: auto.cfp || null, cfpPasta: auto.cfpPasta || null };
    var acoes = planejarAutomacao(d, feito).map(function (a) { return a.tipo + ' ' + a.chave; });
    if (!acoes.length) return;
    processarDemanda_(doc);
    limpas++;
    Logger.log('Nº ' + d.numero + ' — ' + d.saida + ': ' + acoes.join(', '));
  });
  sincronizarAgendaCfp_(true);
  Logger.log(excluidas.length + ' demanda(s) excluída(s); ' + limpas + ' tinham algo para limpar. Página do CFP atualizada.');
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
    try {
      importarEmails_();
    } catch (e) {
      // Falha no Gmail não pode travar a agenda: registra e tenta de novo na próxima rodada.
      console.error('E-mails: ' + e.message);
    }
    for (var i = 0; i < 3; i++) {
      var pendentes = consultarPendentes_();
      if (!pendentes.length) break;
      pendentes.forEach(processarDemanda_);
    }
    try {
      processarPlanilhas_();
      gravarResultados_();
    } catch (e2) {
      console.error('Planilhas de resultado: ' + e2.message);
    }
    try {
      sincronizarAgendaCfp_(false);
    } catch (e3) {
      console.error('Agenda do CFP: ' + e3.message);
    }
    try {
      processarEap_();
    } catch (e4) {
      console.error('EAP: ' + e4.message);
    }
    try {
      sincronizarControleOperacoes_(false);
    } catch (e5) {
      console.error('Controle de Operações: ' + e5.message);
    }
    try {
      processarRelatorios_();
    } catch (e6) {
      console.error('Relatório: ' + e6.message);
    }
    try {
      processarDocsMensais_();
    } catch (e7) {
      console.error('Documentos Mensais: ' + e7.message);
    }
    try {
      processarIcc_();
    } catch (e8) {
      console.error('ICC: ' + e8.message);
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

/** Texto do evento do CFP: link da pasta + número da demanda (a página do CFP lê os dois daqui). */
function descricaoCfp_(pastaUrl, numero) {
  return '📂 PASTA CFP:\n' + pastaUrl + (numero ? '\n\nNº ' + numero : '');
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
      var desc = a.pastaUrl ? descricaoCfp_(a.pastaUrl, d.numero) : a.descricao || '';
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
    var evCfp = cal.createAllDayEvent(a.titulo, dataLocal(a.inicio), diaSeguinte(a.fim), { description: descricaoCfp_(feito.cfpPasta, d.numero) });
    feito.cfp = { eventoId: evCfp.getId(), inicio: a.inicio, fim: a.fim, titulo: a.titulo, pastaUrl: feito.cfpPasta, operacoes: false };
    // 3) linha na aba Operações
    adicionarOperacao_(d);
    feito.cfp.operacoes = true;
  } else if (a.tipo === 'apagarPasta') {
    // Vai para a lixeira do Drive. Se já tinham apagado na mão, segue sem erro.
    var alvo = null;
    try {
      alvo = DriveApp.getFolderById(a.pastaId);
    } catch (e) {
      alvo = null;
    }
    if (alvo && !alvo.isTrashed()) alvo.setTrashed(true);
    feito.cfpPasta = null;
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

// ---------- E-mails do funcional -> aba Demandas Pendentes ----------

var FOLGA_EMAILS_MS = 10 * 60 * 1000;

/**
 * Traz os e-mails que a caixa funcional encaminhou desde a última busca.
 * Cada e-mail vira um documento com id fixo ("email_" + id da mensagem): nunca entra duas vezes.
 * Se algum falhar, a marca de tempo não avança e a próxima rodada tenta de novo.
 */
function importarEmails_() {
  var props = PropertiesService.getScriptProperties();
  var agora = Date.now();
  // Primeira vez: busca as últimas 24 horas.
  var desde = (Number(props.getProperty('EMAILS_DESDE')) || agora - 24 * 3600 * 1000) - FOLGA_EMAILS_MS;
  var busca = 'from:' + CONFIG_P3.EMAIL_FUNCIONAL + ' after:' + Math.floor(desde / 1000) + ' -in:trash -in:spam';
  var etiqueta = GmailApp.getUserLabelByName(CONFIG_P3.ETIQUETA_GMAIL) || GmailApp.createLabel(CONFIG_P3.ETIQUETA_GMAIL);
  var erros = [];
  var novos = 0;
  GmailApp.search(busca, 0, 50).forEach(function (conversa) {
    conversa.getMessages().forEach(function (msg) {
      if (msg.getDate().getTime() < desde || !ehDoFuncional(msg.getFrom(), CONFIG_P3.EMAIL_FUNCIONAL)) return;
      try {
        if (importarEmail_(msg, conversa)) novos++;
      } catch (e) {
        erros.push(msg.getSubject() + ': ' + e.message);
      }
    });
    conversa.addLabel(etiqueta);
  });
  if (erros.length) throw new Error(erros.join(' | '));
  props.setProperty('EMAILS_DESDE', String(agora));
  return novos;
}

function caminhoDocs_() {
  return 'projects/' + CONFIG_P3.PROJETO + '/databases/(default)/documents';
}

/** true = entrou agora; false = já estava no portal. */
function importarEmail_(msg, conversa) {
  var id = 'email_' + msg.getId();
  var existe = firestore_('get', caminhoDocs_() + '/caixaEntrada/' + id + '?mask.fieldPaths=status');
  if (existe.status === 200) return false;
  var item = pendenteDoEmail({
    assunto: msg.getSubject(),
    corpo: msg.getPlainBody(),
    dataEntrada: Utilities.formatDate(msg.getDate(), 'America/Sao_Paulo', 'yyyy-MM-dd'),
    recebidoEm: msg.getDate().toISOString(),
    link: conversa.getPermalink()
  }, salvarAnexos_(msg));
  var r = firestore_('post', caminhoDocs_() + '/caixaEntrada?documentId=' + id, { fields: jsParaValor(item).mapValue.fields });
  if (r.status === 409) return false;
  if (r.status !== 200) throw new Error('Firestore ' + r.status + ': ' + JSON.stringify(r.json));
  return true;
}

function pastaAnexos_() {
  var props = PropertiesService.getScriptProperties();
  var id = CONFIG_P3.PASTA_ANEXOS || props.getProperty('PASTA_ANEXOS');
  if (id) return DriveApp.getFolderById(id);
  var pasta = DriveApp.createFolder('Portal P3 - Anexos');
  props.setProperty('PASTA_ANEXOS', pasta.getId());
  return pasta;
}

/** Anexos vão para o Drive da P/3; o portal guarda só o nome e o link. */
function salvarAnexos_(msg) {
  var lista = msg.getAttachments({ includeInlineImages: false });
  if (!lista.length) return [];
  var pasta = pastaAnexos_();
  return lista.map(function (a) {
    var arquivo = pasta.createFile(a.copyBlob()).setName(a.getName());
    return { nome: a.getName(), url: arquivo.getUrl() };
  });
}

/** Rode pelo editor para buscar os e-mails agora e ver quantos entraram. */
function testarEmails() {
  Logger.log(importarEmails_() + ' e-mail(s) novo(s) na aba Demandas Pendentes.');
}

// ---------- Firestore: consultas e gravações simples ----------

function consultar_(colecao, campo, valor, limite) {
  var r = firestore_('post', caminhoDocs_() + ':runQuery', {
    structuredQuery: {
      from: [{ collectionId: colecao }],
      where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: jsParaValor(valor) } },
      limit: limite || 20
    }
  });
  if (r.status !== 200) throw new Error('Firestore ' + r.status + ': ' + JSON.stringify(r.json));
  return r.json
    .filter(function (x) { return x.document; })
    .map(function (x) {
      return { nome: x.document.name, id: x.document.name.split('/').pop(), dados: camposParaJs(x.document.fields) };
    });
}

function obterDoc_(caminho) {
  var r = firestore_('get', caminhoDocs_() + '/' + caminho);
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error('Firestore ' + r.status + ': ' + JSON.stringify(r.json));
  return camposParaJs(r.json.fields);
}

/** Grava só os campos de "obj" (os outros campos do documento ficam como estão). Cria se não existir. */
function gravarCampos_(caminho, obj) {
  var mascara = Object.keys(obj).map(function (k) { return 'updateMask.fieldPaths=' + encodeURIComponent(k); }).join('&');
  var r = firestore_('patch', caminhoDocs_() + '/' + caminho + '?' + mascara, { fields: jsParaValor(obj).mapValue.fields });
  if (r.status !== 200) throw new Error('Firestore ' + r.status + ': ' + JSON.stringify(r.json));
}

// ---------- Planilha de resultados (Checklist Operações) ----------

function idDaPasta_(url) {
  var m = /folders\/([\w-]+)/.exec(url || '') || /[?&]id=([\w-]+)/.exec(url || '');
  return m ? m[1] : '';
}

function pastaDaDemanda_(d) {
  var a = d.automacao || {};
  return a.cfpPasta || (a.cfp && a.cfp.pastaUrl) || '';
}

/** Gera as planilhas pedidas no checklist e atualiza datas/protocolos das que mudaram. */
function processarPlanilhas_() {
  consultar_('operacoes', 'planilha.status', 'pedida').forEach(function (op) {
    try {
      gerarPlanilha_(op);
    } catch (e) {
      gravarCampos_('operacoes/' + op.id, { planilha: { status: 'erro', erro: e.message } });
    }
  });
  consultar_('operacoes', 'planilhaDesatualizada', true).forEach(function (op) {
    try {
      if (op.dados.planilha && op.dados.planilha.status === 'pronta') atualizarCabecalho_(op);
      gravarCampos_('operacoes/' + op.id, { planilhaDesatualizada: false });
    } catch (e) {
      console.error('Planilha nº ' + op.id + ': ' + e.message);
    }
  });
}

function gerarPlanilha_(op) {
  var d = obterDoc_('demandas/' + op.id);
  if (!d) throw new Error('Demanda nº ' + op.id + ' não encontrada');
  var pastaId = idDaPasta_(pastaDaDemanda_(d));
  if (!pastaId) throw new Error('A pasta do CFP ainda não foi gerada (marque "Adicionar e gerar pasta CFP" na demanda)');
  var copia = DriveApp.getFileById(CONFIG_P3.PLANILHA_RESULTADO_MODELO)
    .makeCopy('Resultados - Nº ' + d.numero + ' - ' + d.saida, DriveApp.getFolderById(pastaId));
  var aba = SpreadsheetApp.openById(copia.getId()).getSheets()[0];
  var dias = diasDaOperacao(d.inicioBtl, d.terminoBtl);
  escreverCabecalho_(aba, dias, op.dados.protocolos || {});
  var campos = camposDaPlanilha(aba.getRange(1, 1, aba.getLastRow(), 2).getValues());
  gravarCampos_('operacoes/' + op.id, {
    planilha: {
      status: 'pronta',
      id: copia.getId(),
      url: copia.getUrl(),
      campos: campos,
      observacao: aba.getRange('B1').getDisplayValue(),
      dias: dias,
      saida: d.saida
    },
    planilhaDesatualizada: false
  });
}

/** Linha 1 = datas (a partir da coluna C), linha 2 = protocolo do Mapa Força de cada dia. */
function escreverCabecalho_(aba, dias, protocolos) {
  var precisa = 2 + Math.max(dias.length, 1);
  if (aba.getMaxColumns() < precisa) {
    var antes = aba.getMaxColumns();
    aba.insertColumnsAfter(antes, precisa - antes);
    aba.getRange(1, 3, aba.getMaxRows(), 1).copyTo(aba.getRange(1, antes + 1, aba.getMaxRows(), precisa - antes), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  }
  // Limpa datas antigas (se a operação ficou mais curta).
  var ultima = aba.getLastColumn();
  if (ultima > 2 + dias.length) aba.getRange(1, 3 + dias.length, 2, ultima - 2 - dias.length).clearContent();
  if (!dias.length) return;
  aba.getRange(1, 3, 1, dias.length).setValues([dias.map(dataLocal)]).setNumberFormat('dd/MM/yyyy');
  aba.getRange(2, 3, 1, dias.length).setValues([dias.map(function (dia) { return protocolos[dia] || ''; })]);
}

function atualizarCabecalho_(op) {
  var d = obterDoc_('demandas/' + op.id);
  if (!d) return;
  var dias = diasDaOperacao(d.inicioBtl, d.terminoBtl);
  escreverCabecalho_(SpreadsheetApp.openById(op.dados.planilha.id).getSheets()[0], dias, op.dados.protocolos || {});
  var p = op.dados.planilha;
  p.dias = dias;
  gravarCampos_('operacoes/' + op.id, { planilha: p });
}

/** Lançamentos da Sala de Operações -> coluna do dia na planilha (como o portal antigo fazia). */
function gravarResultados_() {
  consultar_('resultados', 'gravado', false).forEach(function (r) {
    var res = r.dados;
    try {
      var op = obterDoc_('operacoes/' + res.numero);
      if (!op || !op.planilha || !op.planilha.id) throw new Error('planilha da operação não encontrada');
      var aba = SpreadsheetApp.openById(op.planilha.id).getSheets()[0];
      var datas = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
      var col = -1;
      for (var i = 2; i < datas.length && col < 0; i++) {
        if (datas[i] instanceof Date && Utilities.formatDate(datas[i], 'America/Sao_Paulo', 'yyyy-MM-dd') === res.dia) col = i + 1;
      }
      if (col < 0) throw new Error('o dia ' + res.dia + ' não está na linha 1 da planilha');
      aba.getRange(3, col).setValue(res.protocoloResultado || '');
      Object.keys(res.valores || {}).forEach(function (linha) {
        aba.getRange(Number(linha), col).setValue(Number(res.valores[linha]));
      });
      gravarCampos_('resultados/' + r.id, { gravado: true, gravadoEm: new Date().toISOString(), erro: '' });
    } catch (e) {
      // Fica "não gravado" para tentar de novo; o erro aparece para a Sala.
      gravarCampos_('resultados/' + r.id, { erro: e.message });
    }
  });
}

// ---------- Agenda do CFP -> página do CFP no portal ----------

var MEIA_HORA_MS = 30 * 60 * 1000;

/**
 * Lê a agenda do CFP e grava os eventos em agendaCfp/eventos (a página do CFP mostra só isso).
 * Evento criado, mudado ou apagado direto na agenda aparece no portal na próxima rodada (até 5 min).
 * Para não gastar gravações, só grava se a agenda mudou (ou a cada meia hora, para o "conferido às").
 */
function sincronizarAgendaCfp_(forcar) {
  var cal = agenda_('cfp');
  var tz = cal.getTimeZone() || 'America/Sao_Paulo';
  var iso = function (dt) { return Utilities.formatDate(dt, tz, 'yyyy-MM-dd'); };
  var hoje = new Date();
  var de = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - CONFIG_P3.AGENDA_CFP_DIAS_ANTES);
  var ate = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + CONFIG_P3.AGENDA_CFP_DIAS_DEPOIS + 1);

  var eventos = ordenarMissoes(cal.getEvents(de, ate).map(function (ev) {
    var inicio;
    var fim;
    if (ev.isAllDayEvent()) {
      inicio = iso(ev.getAllDayStartDate());
      var ultimo = ev.getAllDayEndDate(); // no Google o fim é o dia seguinte ao último
      ultimo.setDate(ultimo.getDate() - 1);
      fim = iso(ultimo);
    } else {
      inicio = iso(ev.getStartTime());
      fim = iso(new Date(ev.getEndTime().getTime() - 1)); // termina 00:00 = acabou no dia anterior
    }
    return missaoDaAgenda({ id: ev.getId(), titulo: ev.getTitle(), descricao: ev.getDescription(), inicio: inicio, fim: fim });
  }));

  var props = PropertiesService.getScriptProperties();
  var resumo = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(eventos), Utilities.Charset.UTF_8));
  var ultimaGravacao = Number(props.getProperty('AGENDA_CFP_GRAVADA_EM')) || 0;
  if (!forcar && resumo === props.getProperty('AGENDA_CFP_RESUMO') && Date.now() - ultimaGravacao < MEIA_HORA_MS) return eventos.length;

  gravarCampos_('agendaCfp/eventos', { eventos: eventos, conferidoEm: new Date().toISOString() });
  props.setProperty('AGENDA_CFP_RESUMO', resumo);
  props.setProperty('AGENDA_CFP_GRAVADA_EM', String(Date.now()));
  return eventos.length;
}

/** Rode pelo editor (o instalarAutomacao já roda): copia a agenda do CFP para o portal agora. */
function sincronizarAgendaCfp() {
  Logger.log('Agenda do CFP: ' + sincronizarAgendaCfp_(true) + ' evento(s) levados para o portal.');
}

// ---------- Banco de efetivo (busca por RE no portal) ----------

/** Gatilho diário (e pelo editor): copia o banco de efetivo da planilha para o portal. */
function sincronizarEfetivo() {
  var ss = SpreadsheetApp.openById(CONFIG_P3.PLANILHA_EFETIVO);
  var abas = ss.getSheets().sort(function (a, b) {
    return (b.getName() === CONFIG_P3.ABA_EFETIVO) - (a.getName() === CONFIG_P3.ABA_EFETIVO);
  });
  var porRE = {};
  var resumo = [];
  abas.forEach(function (aba) {
    var linhas = aba.getLastRow();
    var colunas = aba.getLastColumn();
    if (linhas < 2 || colunas < 2) return;
    var lidos = linhasDoEfetivo(aba.getRange(1, 1, Math.min(linhas, 5000), Math.min(colunas, 30)).getValues());
    var novos = 0;
    lidos.forEach(function (p) {
      if (!porRE[p.chave]) { porRE[p.chave] = p; novos++; }
    });
    if (lidos.length) resumo.push(aba.getName() + ': ' + novos + ' novo(s) de ' + lidos.length);
  });
  var chaves = Object.keys(porRE);
  for (var i = 0; i < chaves.length; i += 400) {
    var writes = chaves.slice(i, i + 400).map(function (k) {
      var p = porRE[k];
      return {
        update: {
          name: caminhoDocs_() + '/efetivo/' + k,
          fields: jsParaValor({ re: p.re, posto: p.posto, nomeGuerra: p.nomeGuerra, telefone: p.telefone, nomeCompleto: p.nomeCompleto, email: p.email }).mapValue.fields
        }
      };
    });
    var r = firestore_('post', caminhoDocs_() + ':commit', { writes: writes });
    if (r.status !== 200) throw new Error('Firestore ' + r.status + ': ' + JSON.stringify(r.json));
  }
  Logger.log('Banco de efetivo: ' + chaves.length + ' policiais. ' + resumo.join(' | '));
}

// ---------- Aperfeiçoamento: EAP ----------

/** Cópia nova, cabeçalhos/vagas alterados, respostas das Cias e compilado pedidos no portal. */
function processarEap_() {
  consultar_('eap', 'planilha.status', 'pedida').forEach(function (e) {
    try {
      criarPlanilhaEap_(e);
    } catch (err) {
      gravarCampos_('eap/' + e.id, { planilha: { status: 'erro', erro: err.message } });
    }
  });
  consultar_('eap', 'planilhaDesatualizada', true).forEach(function (e) {
    try {
      if (e.dados.planilha && e.dados.planilha.status === 'pronta') prepararAbasEap_(SpreadsheetApp.openById(e.dados.planilha.id), e.dados, false);
      gravarCampos_('eap/' + e.id, { planilhaDesatualizada: false });
    } catch (err) {
      console.error('EAP ' + e.id + ': ' + err.message);
    }
  });
  consultar_('eapRespostas', 'gravado', false).forEach(gravarRespostaEap_);
  consultar_('eap', 'compilado.status', 'pedido').forEach(function (e) {
    try {
      var n = compilarEap_(SpreadsheetApp.openById(e.dados.planilha.id));
      gravarCampos_('eap/' + e.id, { compilado: { status: 'pronto', registros: n, em: new Date().toISOString() } });
    } catch (err) {
      gravarCampos_('eap/' + e.id, { compilado: { status: 'erro', erro: err.message } });
    }
  });
}

function nomeArquivoEap_(eap) {
  return 'EAP ' + eap.ano + ' - EAD ' + MESES_EXTENSO[eap.mesEad - 1] + ' - PRESENCIAL ' + MESES_EXTENSO[eap.mesPresencial - 1];
}

function criarPlanilhaEap_(e) {
  var copia = DriveApp.getFileById(CONFIG_P3.PLANILHA_EAP_MODELO).makeCopy(nomeArquivoEap_(e.dados), DriveApp.getFolderById(CONFIG_P3.PASTA_EAP));
  prepararAbasEap_(SpreadsheetApp.openById(copia.getId()), e.dados, true);
  gravarCampos_('eap/' + e.id, { planilha: { status: 'pronta', id: copia.getId(), url: copia.getUrl() }, planilhaDesatualizada: false });
}

function abaEap_(ss, nome) {
  var alvo = String(nome).toUpperCase().trim();
  return ss.getSheets().filter(function (a) { return a.getName().toUpperCase().trim() === alvo; })[0] || null;
}

function lerBlocosEap_(aba) {
  var n = aba.getMaxRows();
  var colA = aba.getRange(1, 1, n, 1).getValues().map(function (r) { return r[0]; });
  var fundos = aba.getRange(1, 2, n, 1).getBackgrounds().map(function (r) { return r[0]; });
  return localizarBlocosEap(colA, fundos);
}

/** Como o "Zerar Planilhas" do script da planilha: limpa as células brancas da linha 9 para baixo, J1:J2 e H3. */
function zerarAbaEap_(aba) {
  var linhas = aba.getMaxRows();
  var colunas = aba.getMaxColumns();
  if (linhas > 8) {
    var fundos = aba.getRange(9, 1, linhas - 8, colunas).getBackgrounds();
    var limpar = [];
    for (var i = 0; i < fundos.length; i++) {
      for (var j = 0; j < fundos[i].length; j++) {
        if (String(fundos[i][j]).toLowerCase() === '#ffffff') limpar.push(aba.getRange(i + 9, j + 1).getA1Notation());
      }
    }
    if (limpar.length) aba.getRangeList(limpar).clearContent();
  }
  try {
    aba.getRange('J1:J2').uncheck();
  } catch (e) {
    aba.getRange('J1:J2').clearContent();
  }
  aba.getRange('H3').clearContent();
}

/** Linhas 4, 5 e 6, títulos e apresentações das turmas (nas abas das Cias e do EM). */
function escreverCabecalhoEap_(aba, eap) {
  aba.getRange('A4').setValue(textoAnoEap(eap.ano));
  aba.getRange('A5').setValue(textoMesesEap(eap.mesEad, eap.mesPresencial));
  aba.getRange('A6').setValue(textoPeriodoEad(eap.eadInicio, eap.eadFim));
  var turmas = {};
  (eap.turmas || []).forEach(function (t) { turmas[t.id] = t; });
  lerBlocosEap_(aba).forEach(function (b) {
    var t = turmas[b.id];
    if (!t) return;
    aba.getRange(b.titulo, 1).setValue(tituloTurmaEap(t));
    aba.getRange(b.apresentacao, 1).setValue(textoApresentacaoEap(t.inicio));
  });
}

/** Quantas linhas de cada bloco já têm algo escrito (colunas B a K). */
function preenchidasEap_(aba, blocos) {
  var r = {};
  blocos.forEach(function (b) {
    if (!b.linhas) return;
    var v = aba.getRange(b.primeira, 2, b.linhas, 10).getValues();
    var ultima = 0;
    v.forEach(function (l, i) { if (l.join('').trim()) ultima = i + 1; });
    r[b.id] = ultima;
  });
  return r;
}

/** Deixa cada turma com o nº de linhas das vagas da Cia (de baixo para cima, para não bagunçar as linhas). */
function ajustarLinhasEap_(aba, vagas, minimos) {
  var blocos = lerBlocosEap_(aba);
  var porId = {};
  blocos.forEach(function (b) { porId[b.id] = b; });
  var ajustes = ajustesDeLinhasEap(blocos, vagas, minimos || preenchidasEap_(aba, blocos));
  ajustes
    .sort(function (a, b) { return porId[b.id].primeira - porId[a.id].primeira; })
    .forEach(function (a) {
      var b = porId[a.id];
      var colunas = aba.getMaxColumns();
      if (a.para > a.de) {
        var ultima = b.primeira + Math.max(a.de, 1) - 1;
        aba.insertRowsAfter(ultima, a.para - a.de);
        aba.getRange(ultima, 1, 1, colunas).copyTo(aba.getRange(ultima + 1, 1, a.para - a.de, colunas), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      } else {
        aba.deleteRows(b.primeira + a.para, a.de - a.para);
      }
    });
  // Nº 1, 2, 3... em cada turma.
  lerBlocosEap_(aba).forEach(function (b) {
    if (!b.linhas) return;
    aba.getRange(b.primeira, 1, b.linhas, 1).setValues(Array.apply(null, Array(b.linhas)).map(function (_, i) { return [i + 1]; }));
  });
}

function prepararAbasEap_(ss, eap, zerar) {
  Object.keys(ABAS_EAP)
    .map(function (u) { return { u: u, nome: ABAS_EAP[u] }; })
    .concat([{ u: '', nome: 'EM' }])
    .forEach(function (x) {
      var aba = abaEap_(ss, x.nome);
      if (!aba) return;
      if (zerar) zerarAbaEap_(aba);
      escreverCabecalhoEap_(aba, eap);
      if (x.u) ajustarLinhasEap_(aba, (eap.vagas || {})[x.u] || {});
    });
  if (zerar) {
    var comp = abaEap_(ss, 'COMPILADO TURMAS');
    if (comp) comp.clear();
  }
}

/** Resposta da Cia no portal -> aba da Cia na planilha do EAP, com a assinatura em H3. */
function gravarRespostaEap_(r) {
  var res = r.dados;
  try {
    var eap = obterDoc_('eap/' + res.eapId);
    if (!eap || !eap.planilha || eap.planilha.status !== 'pronta') throw new Error('a planilha do EAP ainda não foi criada');
    var aba = abaEap_(SpreadsheetApp.openById(eap.planilha.id), ABAS_EAP[res.unidadeId]);
    if (!aba) throw new Error('a aba "' + ABAS_EAP[res.unidadeId] + '" não está na planilha');
    var dados = res.blocos || {};
    // Limpa o que a Cia tinha mandado antes e deixa linhas para todos os policiais.
    var antes = lerBlocosEap_(aba);
    antes.forEach(function (b) { if (b.linhas) aba.getRange(b.primeira, 2, b.linhas, 10).clearContent(); });
    var precisa = {};
    antes.forEach(function (b) { precisa[b.id] = ((dados[b.id] || {}).policiais || []).length; });
    ajustarLinhasEap_(aba, (eap.vagas || {})[res.unidadeId] || {}, precisa);
    lerBlocosEap_(aba).forEach(function (b) {
      if (!b.linhas) return;
      var bloco = dados[b.id] || {};
      var policiais = bloco.policiais || [];
      var linhas = [];
      for (var k = 0; k < b.linhas; k++) {
        if (policiais[k]) linhas.push(linhaPolicialEap(policiais[k], k + 1, res.unidadeId).slice(1));
        else if (k === 0 && bloco.semEfetivo) linhas.push(['', '', SEM_EFETIVO_EAP, '', '', '', '', '', '', '']);
        else linhas.push(['', '', '', '', '', '', '', '', '', '']);
      }
      aba.getRange(b.primeira, 2, b.linhas, 10).setValues(linhas);
    });
    aba.getRange('H3').setValue('Validado por: ' + String(res.respondidoPor || '').toUpperCase() + ' em ' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'));
    try {
      aba.getRange('J1').check();
    } catch (e) {
      // J1 sem caixa de seleção: a assinatura em H3 basta.
    }
    gravarCampos_('eapRespostas/' + r.id, { gravado: true, gravadoEm: new Date().toISOString(), erro: '' });
  } catch (e) {
    gravarCampos_('eapRespostas/' + r.id, { erro: e.message });
  }
}

/** Igual ao "Gerar Compilado Geral por Turmas" do script da planilha: junta as Cias por turma. */
function compilarEap_(ss) {
  var comp = abaEap_(ss, 'COMPILADO TURMAS') || ss.insertSheet('COMPILADO TURMAS');
  comp.clear();
  var nomes = Object.keys(ABAS_EAP).map(function (u) { return ABAS_EAP[u]; }).concat(['EM']);
  var blocos = [];
  var total = 0;
  nomes.forEach(function (nome) {
    var aba = abaEap_(ss, nome);
    if (!aba) return;
    lerBlocosEap_(aba).forEach(function (b, i) {
      if (!blocos[i]) {
        var cab = aba.getRange(b.titulo, 1, 3, 11);
        blocos[i] = { valores: cab.getValues(), fundos: cab.getBackgrounds(), fontes: cab.getFontColors(), pesos: cab.getFontWeights(), dados: [] };
      }
      if (!b.linhas) return;
      aba.getRange(b.primeira, 1, b.linhas, 11).getValues().forEach(function (l) {
        if (l.slice(1).join('').trim()) {
          blocos[i].dados.push(l);
          total++;
        }
      });
    });
  });
  var linha = 1;
  blocos.forEach(function (b) {
    if (!b || !b.dados.length) return;
    var cab = comp.getRange(linha, 1, 3, 11);
    cab.setValues(b.valores).setBackgrounds(b.fundos).setFontColors(b.fontes).setFontWeights(b.pesos);
    comp.getRange(linha, 1, 1, 11).mergeAcross().setHorizontalAlignment('center');
    comp.getRange(linha + 1, 1, 1, 11).mergeAcross().setHorizontalAlignment('center');
    comp.getRange(linha + 2, 1, 1, 11).setHorizontalAlignment('center');
    linha += 3;
    b.dados.forEach(function (l, i) { l[0] = i + 1; });
    var dados = comp.getRange(linha, 1, b.dados.length, 11);
    dados.setValues(b.dados).setBackground('#ffffff').setFontColor('#000000').setFontWeight('normal');
    dados.setHorizontalAlignment('center').setBorder(true, true, true, true, true, true);
    comp.getRange(linha, 1, b.dados.length, 1).setBackground('#e0e0e0');
    linha += b.dados.length + 2;
  });
  if (total) comp.autoResizeColumns(1, 11);
  return total;
}

// ---------- Operações → Controle de Operações e Relatório de Indicadores ----------

/** Todos os documentos de uma coleção (só os campos pedidos). */
function listarTodos_(colecao, campos) {
  var r = firestore_('post', caminhoDocs_() + ':runQuery', {
    structuredQuery: {
      from: [{ collectionId: colecao }],
      select: { fields: campos.map(function (c) { return { fieldPath: c }; }) }
    }
  });
  if (r.status !== 200) throw new Error('Firestore ' + r.status + ': ' + JSON.stringify(r.json));
  return r.json
    .filter(function (x) { return x.document; })
    .map(function (x) { return { id: x.document.name.split('/').pop(), dados: camposParaJs(x.document.fields || {}) }; });
}

/**
 * Traz para o portal as linhas novas da aba Operações da planilha antiga (inclusive as que o motor
 * coloca lá ao gerar a pasta do CFP). Nunca apaga nem sobrescreve o que a P/3 editou no portal:
 * só cria o que falta e preenche o Objetivo quando ele ainda está vazio no portal.
 * Só trabalha quando a aba mudou (ou quando "forcar").
 */
function sincronizarControleOperacoes_(forcar) {
  var aba = SpreadsheetApp.openById(CONFIG_P3.PLANILHA_OPERACOES).getSheetByName(CONFIG_P3.ABA_OPERACOES);
  if (!aba) throw new Error('Aba Operações não encontrada');
  var valores = aba.getDataRange().getValues();
  var props = PropertiesService.getScriptProperties();
  var resumo = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(valores), Utilities.Charset.UTF_8));
  if (!forcar && resumo === props.getProperty('CONTROLE_OPERACOES_RESUMO')) return 0;

  var existentes = {};
  listarTodos_('controleOperacoes', ['objetivo']).forEach(function (d) { existentes[d.id] = d.dados.objetivo || ''; });
  var novos = 0;
  linhasControleDaPlanilha(valores[0], valores.slice(1)).forEach(function (l) {
    if (!(l.id in existentes)) {
      var id = l.id;
      delete l.id;
      l.fonte = 'planilha';
      l.excluida = false;
      l.criadoEm = new Date().toISOString();
      gravarCampos_('controleOperacoes/' + id, l);
      existentes[id] = l.objetivo;
      novos++;
    } else if (!existentes[l.id] && l.objetivo) {
      gravarCampos_('controleOperacoes/' + l.id, { objetivo: l.objetivo });
      existentes[l.id] = l.objetivo;
    }
  });
  props.setProperty('CONTROLE_OPERACOES_RESUMO', resumo);
  return novos;
}

/** Rode pelo editor: traz agora todas as operações da aba Operações para o portal. */
function sincronizarControleOperacoes() {
  Logger.log(sincronizarControleOperacoes_(true) + ' operação(ões) nova(s) no Controle de Operações.');
}

/** Pedidos de relatório feitos no portal -> Word na pasta dos relatórios, com o link de volta no portal. */
function processarRelatorios_() {
  var pedidos = consultar_('relatorios', 'status', 'pedido', 5);
  if (!pedidos.length) return;
  sincronizarControleOperacoes_(false); // a planilha antiga pode ter linha nova
  pedidos.forEach(function (r) {
    try {
      var res = gerarRelatorio_(r.dados);
      gravarCampos_('relatorios/' + r.id, {
        status: 'pronto', url: res.url, nomeArquivo: res.nome, qtdOperacoes: res.qtd, prontoEm: new Date().toISOString(), erro: ''
      });
    } catch (e) {
      gravarCampos_('relatorios/' + r.id, { status: 'erro', erro: e.message });
    }
  });
}

function lerTabelasIndicadores_() {
  var aba = SpreadsheetApp.openById(CONFIG_P3.PLANILHA_INDICADORES).getSheetByName(CONFIG_P3.ABA_INDICADORES);
  if (!aba) throw new Error('Aba "' + CONFIG_P3.ABA_INDICADORES + '" não encontrada na planilha de indicadores.');
  // texto exatamente como aparece na planilha
  return tabelasIndicadores(aba.getRange(CONFIG_P3.FAIXA_CRIMES).getDisplayValues(), aba.getRange(CONFIG_P3.FAIXA_PRODUTIVIDADE).getDisplayValues());
}

function gerarRelatorio_(pedido) {
  if (!/^\d{4}-\d{2}$/.test(pedido.mes || '')) throw new Error('Mês inválido');
  var operacoes = listarTodos_('controleOperacoes', ['nome', 'inicio', 'termino', 'objetivo', 'excluida']).map(function (d) { return d.dados; });
  var hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  var dados = dadosRelatorio(pedido, operacoes, lerTabelasIndicadores_(), hoje, CONFIG_P3.PREFIXO_RELATORIO);
  // abre o .docx (zip), edita só o document.xml e fecha de novo: cabeçalho, brasões e formatação ficam intactos
  var modelo = DriveApp.getFileById(CONFIG_P3.RELATORIO_MODELO).getBlob().setContentType('application/zip');
  var partes = Utilities.unzip(modelo).map(function (b) {
    if (b.getName() !== 'word/document.xml') return b;
    return Utilities.newBlob(preencherXmlRelatorio(b.getDataAsString('UTF-8'), dados), 'application/xml', 'word/document.xml');
  });
  var nome = nomeArquivoRelatorio(pedido.numero, pedido.mes);
  var zip = Utilities.zip(partes, nome).setContentType('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  var arquivo = DriveApp.getFolderById(CONFIG_P3.RELATORIO_PASTA).createFile(zip);
  return { url: arquivo.getUrl(), nome: nome, qtd: dados.OPERACOES.length };
}

// ---------- Operações → Documentos Mensais ----------

/**
 * Envios das Cias -> células da planilha (e a legenda). Antes de gravar o primeiro envio de um mês novo,
 * guarda a cópia do mês anterior na pasta de arquivo e zera a planilha. Também atende os pedidos da P/3
 * ("Arquivar e zerar" / "Arquivar cópia").
 */
function processarDocsMensais_() {
  var cfg = obterDoc_('config/documentosMensais');
  if (!cfg || !cfg.documentos) return;
  var docs = {};
  cfg.documentos.forEach(function (d) { docs[d.id] = d; });
  var estados = {};
  listarTodos_('estadoDocsMensais', ['mesRef', 'pedidoArquivar', 'arquivados']).forEach(function (e) { estados[e.id] = e.dados; });

  Object.keys(estados).forEach(function (id) {
    var e = estados[id];
    if (!e.pedidoArquivar || !docs[id]) return;
    try {
      arquivarDocMensal_(docs[id], e.pedidoArquivar, e);
      gravarCampos_('estadoDocsMensais/' + id, { pedidoArquivar: '', mesRef: proximoMes(e.pedidoArquivar), arquivados: e.arquivados || {}, erro: '' });
      e.mesRef = proximoMes(e.pedidoArquivar);
      e.pedidoArquivar = '';
    } catch (err) {
      gravarCampos_('estadoDocsMensais/' + id, { pedidoArquivar: '', erro: 'Arquivar: ' + err.message });
    }
  });

  consultar_('docsMensais', 'gravado', false, 30).forEach(function (envio) {
    var en = envio.dados;
    if (en.erro && en.erroEm && Date.now() - new Date(en.erroEm).getTime() < 30 * 60 * 1000) return; // espera para tentar de novo
    try {
      var doc = docs[en.docId];
      if (!doc || !doc.celulas) throw new Error('documento sem configuração no portal');
      var e = estados[en.docId] || {};
      var acao = acaoEnvioMensal(e.mesRef, en.mesRef);
      if (acao === 'antigo') throw new Error('o mês ' + en.mesRef + ' já foi arquivado e a planilha está em outro mês');
      if (acao === 'arquivarAntes') arquivarDocMensal_(doc, e.mesRef, e);
      gravarEnvioMensal_(doc, en);
      e.mesRef = en.mesRef;
      estados[en.docId] = e;
      gravarCampos_('estadoDocsMensais/' + en.docId, { mesRef: en.mesRef, arquivados: e.arquivados || {} });
      gravarCampos_('docsMensais/' + envio.id, { gravado: true, gravadoEm: new Date().toISOString(), erro: '' });
    } catch (err) {
      gravarCampos_('docsMensais/' + envio.id, { erro: err.message, erroEm: new Date().toISOString() });
    }
  });
}

/** Aba da Cia (ou a única), conferida pelas âncoras do mês. */
function abaDoDocMensal_(doc, u, mesRef, cache) {
  var nome = abaDaCia(doc, u);
  if (cache && cache[nome]) return cache[nome];
  var ss = SpreadsheetApp.openById(doc.planilhaId);
  var aba = nome ? ss.getSheetByName(nome) : ss.getSheets()[0];
  if (!aba) throw new Error('aba "' + nome + '" não encontrada');
  var ancoras = ancorasDoMes(doc, mesRef);
  var lidos = {};
  Object.keys(ancoras).forEach(function (c) { lidos[c] = aba.getRange(c).getDisplayValue(); });
  var erro = conferirAncoras(ancoras, lidos);
  if (erro) throw new Error((nome ? 'aba "' + nome + '": ' : '') + erro);
  if (cache) cache[nome] = aba;
  return aba;
}

function gravarEnvioMensal_(doc, en) {
  var aba = abaDoDocMensal_(doc, en.unidadeId, en.mesRef);
  var celulas = doc.celulas[en.unidadeId];
  if (!celulas) throw new Error('a ' + en.unidadeId + ' não preenche este documento');
  Object.keys(celulas).forEach(function (campo) {
    var v = (en.valores || {})[campo];
    aba.getRange(resolverCelula(celulas[campo], en.mesRef, doc.colunaJaneiro, doc.colunaTrimestre1)).setValue(v === undefined || v === null ? '' : v);
  });
  if (doc.legenda && doc.legenda.celulas && doc.legenda.celulas[en.unidadeId]) {
    aba.getRange(doc.legenda.celulas[en.unidadeId]).setValue(textoDoMes(doc.legenda.modelo, en.mesRef, en.respondidoPor));
  }
  if (doc.mes && doc.mes.celula) aba.getRange(doc.mes.celula).setValue(textoDoMes(doc.mes.modelo, en.mesRef));
}

/** Mês de referência de hoje (no mês M as Cias mandam os dados do mês M-1). */
function mesReferenciaHoje_() {
  var hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM');
  var p = hoje.split('-').map(Number);
  return p[1] === 1 ? (p[0] - 1) + '-12' : p[0] + '-' + ('0' + (p[1] - 1)).slice(-2);
}

/** Diagnóstico: confere as abas de cada documento preenchido pelo portal. */
function conferirDocMensal_(doc) {
  var mes = mesReferenciaHoje_();
  var cache = {};
  Object.keys(doc.celulas || {}).forEach(function (u) { abaDoDocMensal_(doc, u, mes, cache); });
  return Object.keys(cache).length;
}

/** Pasta do mês dentro da pasta de arquivo (ex.: "2026-10 OUT"). */
function pastaArquivoDoMes_(mesRef) {
  var raiz = DriveApp.getFolderById(CONFIG_P3.PASTA_DOCS_MENSAIS_ARQUIVO);
  var nome = mesRef + ' ' + MESES_SIGLA[Number(mesRef.slice(5)) - 1];
  var it = raiz.getFoldersByName(nome);
  return it.hasNext() ? it.next() : raiz.createFolder(nome);
}

/** Guarda a cópia do mês e, se o documento é preenchido pelo portal, zera as células das Cias e a legenda. */
function arquivarDocMensal_(doc, mesRef, estado) {
  var copia = DriveApp.getFileById(doc.planilhaId).makeCopy(nomeArquivoMensal(doc.nome, mesRef), pastaArquivoDoMes_(mesRef));
  estado.arquivados = estado.arquivados || {};
  estado.arquivados[mesRef] = copia.getUrl();
  var zerar = valoresParaZerar(doc, mesRef);
  if (!zerar.length) return; // planilha do ano todo: só a cópia
  var cache = {};
  zerar.forEach(function (x) { abaDoDocMensal_(doc, x.u, mesRef, cache).getRange(x.celula).setValue(x.valor); });
  if (doc.legenda && doc.legenda.celulas) {
    Object.keys(doc.legenda.celulas).forEach(function (u) { abaDoDocMensal_(doc, u, mesRef, cache).getRange(doc.legenda.celulas[u]).clearContent(); });
  }
  if (doc.mes && doc.mes.celula) {
    Object.keys(cache).forEach(function (n) { cache[n].getRange(doc.mes.celula).setValue(textoDoMes(doc.mes.modelo, proximoMes(mesRef))); });
  }
}

// ---------- Aperfeiçoamento → ICC ----------

/** ICC nova: cópia zerada do modelo ("ICC nº"); respostas das Cias: coluna da Cia na planilha. */
function processarIcc_() {
  consultar_('iccs', 'planilha.status', 'pedida').forEach(function (i) {
    try {
      var ss = criarPlanilhaIcc_(i.dados.numero);
      gravarCampos_('iccs/' + i.id, { planilha: { status: 'pronta', id: ss.getId(), url: ss.getUrl() } });
    } catch (err) {
      gravarCampos_('iccs/' + i.id, { planilha: { status: 'erro', erro: err.message } });
    }
  });
  consultar_('respostasIcc', 'gravado', false, 30).forEach(function (r) {
    var x = r.dados;
    if (x.erro && x.erroEm && Date.now() - new Date(x.erroEm).getTime() < 30 * 60 * 1000) return;
    try {
      var icc = obterDoc_('iccs/' + x.iccId);
      if (!icc || !icc.planilha || icc.planilha.status !== 'pronta') return; // espera a planilha ficar pronta
      var aba = abaIcc_(SpreadsheetApp.openById(icc.planilha.id));
      var cel = celulasIcc(x.unidadeId, x);
      Object.keys(cel).forEach(function (c) { aba.getRange(c).setValue(cel[c]); });
      gravarCampos_('respostasIcc/' + r.id, { gravado: true, gravadoEm: new Date().toISOString(), erro: '' });
    } catch (err) {
      gravarCampos_('respostasIcc/' + r.id, { erro: err.message, erroEm: new Date().toISOString() });
    }
  });
}

function abaIcc_(ss) {
  var aba = ss.getSheets()[0];
  var lidos = {};
  Object.keys(ANCORAS_ICC).forEach(function (c) { lidos[c] = aba.getRange(c).getDisplayValue(); });
  var erro = conferirAncoras(ANCORAS_ICC, lidos);
  if (erro) throw new Error(erro);
  return aba;
}

function criarPlanilhaIcc_(numero) {
  var modelo = DriveApp.getFileById(CONFIG_P3.PLANILHA_ICC_MODELO);
  var pastas = modelo.getParents();
  var pasta = pastas.hasNext() ? pastas.next() : DriveApp.getRootFolder();
  var nome = 'ICC ' + numero;
  var existente = pasta.getFilesByName(nome);
  var ss = SpreadsheetApp.open(existente.hasNext() ? existente.next() : modelo.makeCopy(nome, pasta));
  var aba = abaIcc_(ss);
  aba.getRange('D5:K8').clearContent(); // zera as Cias e o EM
  aba.getRange('B5').setValue(Number(numero) || numero);
  aba.setName(nome);
  return ss;
}
