/**
 * LÓGICA DO MOTOR (sem acesso a Google/Firestore: só decide e converte).
 * Este arquivo também é testado automaticamente no projeto (tests/unit/motor.test.ts).
 */

/** Tem que ser igual ao VERSAO_MOTOR do Motor.gs (o diagnóstico confere: cole sempre os dois juntos). */
var VERSAO_LOGICA = '2026-11-23';

var SIGLAS_P3 = {
  TODAS: 'TODAS', '1cia': '1ª CIA', '2cia': '2ª CIA', '3cia': '3ª CIA', '4cia': '4ª CIA', '5cia': '5ª CIA',
  '6cia': '6ª CIA', ft: 'CIA FT', secop: 'Sec Op M11', gt: 'GT M11', spjmd: 'SPJMD', cfp: 'CFP', p1: 'P/1',
  p2: 'P/2', p4: 'P/4', p5: 'P/5', dejem: 'DEJEM', subfrota: 'Sub Frota', '21bpmm': '21º BPM/M', outros: 'OUTROS'
};

function siglasDestinos(destinos) {
  return (destinos || []).map(function (d) { return SIGLAS_P3[d] || d; }).join(', ');
}

/**
 * Compara a demanda com o que já foi feito e devolve a lista de ações.
 * feito = { agendaCPA, agendaCia, cfp } (cada um: { eventoId, inicio, fim, titulo, [pastaUrl] } ou vazio)
 */
function planejarAutomacao(d, feito) {
  feito = feito || {};
  var acoes = [];
  var obs = d.observacao || '';

  // Demanda excluída no portal: apaga os eventos que ela tinha (inclusive na agenda do CFP)
  // e manda a pasta do CFP para a lixeira do Drive (fica lá 30 dias, dá para recuperar).
  if (d.status === 'excluido') {
    if (feito.agendaCPA) acoes.push({ tipo: 'apagar', chave: 'agendaCPA', agenda: 'principal', eventoId: feito.agendaCPA.eventoId });
    if (feito.agendaCia) acoes.push({ tipo: 'apagar', chave: 'agendaCia', agenda: 'principal', eventoId: feito.agendaCia.eventoId });
    if (feito.cfp) acoes.push({ tipo: 'apagar', chave: 'cfp', agenda: 'cfp', eventoId: feito.cfp.eventoId });
    var pasta = feito.cfpPasta || (feito.cfp && feito.cfp.pastaUrl) || '';
    if (idDaPasta(pasta)) acoes.push({ tipo: 'apagarPasta', chave: 'cfpPasta', agenda: 'cfp', pastaId: idDaPasta(pasta) });
    return acoes;
  }

  function prazo(chave, data, titulo, descricao) {
    var atual = feito[chave];
    if (data && !atual) {
      acoes.push({ tipo: 'criar', chave: chave, agenda: 'principal', inicio: data, fim: data, titulo: titulo, descricao: descricao });
    } else if (data && atual && (atual.inicio !== data || atual.titulo !== titulo)) {
      acoes.push({ tipo: 'atualizar', chave: chave, agenda: 'principal', eventoId: atual.eventoId, inicio: data, fim: data, titulo: titulo, descricao: descricao });
    } else if (!data && atual) {
      acoes.push({ tipo: 'apagar', chave: chave, agenda: 'principal', eventoId: atual.eventoId });
    }
  }

  var cias = siglasDestinos(d.destinos);
  prazo('agendaCPA', d.prazoCPA, 'Prazo CPA: ' + d.saida, obs);
  prazo('agendaCia', d.prazoCia, 'Prazo Cia (' + cias + '): ' + d.saida, 'Cias: ' + cias + '\n\n' + obs);

  // CFP: pasta + evento na agenda do CFP + linha na aba Operações (uma vez); depois só acompanha datas/título.
  // Cada etapa fica registrada: se uma falhar, a próxima rodada continua dali sem repetir as outras.
  var cfp = feito.cfp;
  if (d.adicionarCFP && d.inicioBtl && d.terminoBtl) {
    if (cfp && !cfp.operacoes) acoes.push({ tipo: 'operacoes', chave: 'cfp', agenda: 'cfp' });
    if (!cfp) {
      acoes.push({ tipo: 'criarCFP', chave: 'cfp', agenda: 'cfp', inicio: d.inicioBtl, fim: d.terminoBtl, titulo: d.saida,
        nomePasta: d.numero + ' - ' + d.saida });
    } else if (cfp.inicio !== d.inicioBtl || cfp.fim !== d.terminoBtl || cfp.titulo !== d.saida) {
      acoes.push({ tipo: 'atualizar', chave: 'cfp', agenda: 'cfp', eventoId: cfp.eventoId, inicio: d.inicioBtl, fim: d.terminoBtl,
        titulo: d.saida, pastaUrl: cfp.pastaUrl });
    }
  }
  return acoes;
}

/** ID da pasta a partir do link do Drive (".../folders/ID" ou "...?id=ID"). '' se não der. */
function idDaPasta(url) {
  var m = /\/folders\/([\w-]+)/.exec(String(url || '')) || /[?&]id=([\w-]+)/.exec(String(url || ''));
  return m ? m[1] : '';
}

/** "2026-11-20" -> Date local (meia-noite). */
function dataLocal(iso) {
  var p = String(iso).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

/** Data seguinte (o fim de evento de dia inteiro no Google é exclusivo). */
function diaSeguinte(iso) {
  var d = dataLocal(iso);
  d.setDate(d.getDate() + 1);
  return d;
}

// ---------- Conversão entre o formato do Firestore (REST) e objetos comuns ----------

function valorParaJs(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(valorParaJs);
  if ('mapValue' in v) return camposParaJs(v.mapValue.fields || {});
  return null;
}

function camposParaJs(fields) {
  var o = {};
  Object.keys(fields || {}).forEach(function (k) { o[k] = valorParaJs(fields[k]); });
  return o;
}

function jsParaValor(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === 'string') return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(jsParaValor) } };
  var fields = {};
  Object.keys(x).forEach(function (k) { if (x[k] !== undefined) fields[k] = jsParaValor(x[k]); });
  return { mapValue: { fields: fields } };
}

// ---------- E-mails encaminhados do funcional -> aba Demandas Pendentes ----------

/** "Fulano <8BPMMP3@policiamilitar.sp.gov.br>" -> "8bpmmp3@policiamilitar.sp.gov.br" */
function enderecoEmail(de) {
  var m = /<([^>]+)>/.exec(String(de || ''));
  return (m ? m[1] : String(de || '')).trim().toLowerCase();
}

/** Só entra no portal o que foi encaminhado pela caixa funcional. */
function ehDoFuncional(de, funcional) {
  return enderecoEmail(de) === String(funcional || '').trim().toLowerCase();
}

/** Tira "ENC:", "Fwd:", "FW:" e "TR:" do começo do assunto. */
function limparAssunto(assunto) {
  var a = String(assunto || '').replace(/^\s*((enc|fwd?|tr)\s*:\s*)+/i, '').trim();
  return a || '(sem assunto)';
}

/** Quem mandou o e-mail original: a primeira linha "De:" (ou "From:") do texto encaminhado. */
function remetenteOriginal(corpo) {
  var m = /^[ \t>*]*(?:De|From)[ \t*]*:[ \t*]*(.+)$/im.exec(String(corpo || ''));
  return m ? m[1].replace(/\*/g, '').trim() : '';
}

var LIMITE_TEXTO_EMAIL = 20000;

function limparTexto(corpo) {
  var t = String(corpo || '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length <= LIMITE_TEXTO_EMAIL) return t;
  return t.slice(0, LIMITE_TEXTO_EMAIL) + '\n\n[… texto cortado: abra o e-mail no Gmail para ver tudo]';
}

/**
 * Item da aba Demandas Pendentes a partir de um e-mail.
 * m = { assunto, corpo, dataEntrada (AAAA-MM-DD), recebidoEm (ISO), link }; anexos = [{ nome, url }]
 */
function pendenteDoEmail(m, anexos) {
  return {
    tipo: 'email',
    status: 'pendente',
    dataEntrada: m.dataEntrada,
    recebidoEm: m.recebidoEm,
    assunto: limparAssunto(m.assunto),
    texto: limparTexto(m.corpo),
    remetente: remetenteOriginal(m.corpo),
    linkGmail: m.link || '',
    anexos: anexos || []
  };
}

// ---------- Checklist Operações: planilha de resultados e banco de efetivo ----------

/** Dias da operação, do início ao término (AAAA-MM-DD), no máximo 60. */
function diasDaOperacao(inicio, termino) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio || '')) return [];
  var fim = /^\d{4}-\d{2}-\d{2}$/.test(termino || '') ? termino : inicio;
  if (fim < inicio) return [inicio];
  var dias = [];
  var d = new Date(inicio + 'T12:00:00Z');
  while (dias.length < 60) {
    var iso = d.toISOString().slice(0, 10);
    dias.push(iso);
    if (iso >= fim) break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dias;
}

/**
 * Indicadores da planilha modelo (colunas A e B, a partir da linha 8).
 * Linha com número na coluna A e nome na B = indicador; linha só com texto = título do grupo.
 */
function camposDaPlanilha(valoresAB, linhaInicial) {
  var inicio = linhaInicial || 8;
  var campos = [];
  var grupo = '';
  for (var i = inicio - 1; i < valoresAB.length; i++) {
    var a = String(valoresAB[i][0] === null || valoresAB[i][0] === undefined ? '' : valoresAB[i][0]).trim();
    var b = String(valoresAB[i][1] === null || valoresAB[i][1] === undefined ? '' : valoresAB[i][1]).trim();
    if (/^\d+$/.test(a) && b) {
      campos.push({ linha: i + 1, rotulo: b, grupo: grupo });
    } else if (b || a) {
      grupo = b || a;
    }
  }
  return campos;
}

/** Mesma regra do portal: "123456-7" / "1234567" / "123456" -> "123456". */
function normalizarRE(re) {
  var n = String(re === null || re === undefined ? '' : re).replace(/\D/g, '');
  return n.length > 6 ? n.slice(0, 6) : n;
}

/** Acha o cabeçalho do banco de efetivo (RE e NOME DE GUERRA) nas 10 primeiras linhas. null = não achou. */
function cabecalhoDoEfetivo(valores) {
  for (var i = 0; i < Math.min(10, valores.length); i++) {
    var linha = valores[i].map(function (v) { return String(v).trim().toUpperCase(); });
    var re = linha.indexOf('RE');
    var guerra = -1;
    linha.forEach(function (v, j) { if (guerra < 0 && v.indexOf('NOME DE GUERRA') >= 0) guerra = j; });
    if (re < 0 || guerra < 0) continue;
    var col = { re: re, guerra: guerra };
    linha.forEach(function (v, j) {
      if (col.posto === undefined && /POST|GRAD/.test(v)) col.posto = j;
      if (col.tel === undefined && /TELEFONE|CELULAR/.test(v)) col.tel = j;
      if (col.nome === undefined && (/NOME COMPLETO/.test(v) || v === 'NOME')) col.nome = j;
      if (col.email === undefined && /E-?MAIL/.test(v)) col.email = j;
      if (col.opm === undefined && v === 'OPM') col.opm = j;
    });
    return { linha: i, largura: linha.length, col: col };
  }
  return null;
}

/**
 * Lê uma aba do banco de efetivo: acha o cabeçalho (RE e NOME DE GUERRA) nas 10 primeiras linhas
 * e devolve { chave, re, posto, nomeGuerra, telefone } de cada linha com RE.
 */
function linhasDoEfetivo(valores) {
  var achado = cabecalhoDoEfetivo(valores);
  var cab = achado ? achado.linha : -1;
  var col = achado ? achado.col : {};
  if (cab < 0) return [];
  var lista = [];
  for (var k = cab + 1; k < valores.length; k++) {
    var l = valores[k];
    var chave = normalizarRE(l[col.re]);
    if (chave.length < 5) continue;
    lista.push({
      chave: chave,
      re: String(l[col.re]).trim(),
      posto: col.posto === undefined ? '' : String(l[col.posto]).trim(),
      nomeGuerra: String(l[col.guerra]).trim(),
      telefone: col.tel === undefined ? '' : String(l[col.tel]).trim(),
      nomeCompleto: col.nome === undefined ? '' : String(l[col.nome]).trim(),
      email: col.email === undefined ? '' : String(l[col.email]).trim(),
      opm: col.opm === undefined ? '' : String(l[col.opm]).trim()
    });
  }
  return lista;
}

/**
 * Policial cadastrado à mão no portal (RE fora do banco) -> linha nova para a aba BD Efetivo,
 * na ordem das colunas do cabeçalho. null = a aba não tem o cabeçalho com RE e NOME DE GUERRA.
 */
function novaLinhaEfetivo(valores, p) {
  var achado = cabecalhoDoEfetivo(valores);
  if (!achado) return null;
  var linha = [];
  for (var i = 0; i < achado.largura; i++) linha.push('');
  var c = achado.col;
  linha[c.re] = p.re || '';
  linha[c.guerra] = p.nomeGuerra || '';
  if (c.posto !== undefined) linha[c.posto] = p.posto || '';
  if (c.tel !== undefined) linha[c.tel] = p.telefone || '';
  if (c.nome !== undefined) linha[c.nome] = p.nomeCompleto || '';
  return linha;
}

// ---------- Agenda do CFP -> página do CFP no portal ----------

/** Primeiro link de pasta do Drive na descrição do evento (texto ou HTML). Vazio se não tiver. */
function pastaDaDescricao(descricao) {
  var texto = String(descricao || '').replace(/&amp;/g, '&');
  var links = texto.match(/https?:\/\/drive\.google\.com\/[^\s"'<>]+/g) || [];
  for (var i = 0; i < links.length; i++) {
    if (/\/folders\/|[?&]id=/.test(links[i])) return links[i];
  }
  return links[0] || '';
}

/** Número da demanda, se a descrição do evento trouxer ("Nº 2150"). 0 = sem número. */
function numeroDaDescricao(descricao) {
  var m = /N[º°]\.?\s*(\d{1,6})\b/i.exec(String(descricao || ''));
  return m ? Number(m[1]) : 0;
}

/**
 * Evento da agenda do CFP -> missão mostrada no portal.
 * ev = { id, titulo, descricao, inicio, fim } com datas AAAA-MM-DD (fim já é o último dia, inclusivo).
 */
function missaoDaAgenda(ev) {
  var inicio = ev.inicio;
  var fim = ev.fim && ev.fim >= inicio ? ev.fim : inicio;
  return {
    id: String(ev.id || ''),
    titulo: String(ev.titulo || '').trim() || '(sem título)',
    inicio: inicio,
    fim: fim,
    pastaUrl: pastaDaDescricao(ev.descricao),
    numero: numeroDaDescricao(ev.descricao)
  };
}

/** Ordena por início e, no mesmo dia, pelo título (a lista sai sempre igual se a agenda não mudou). */
function ordenarMissoes(lista) {
  return lista.slice().sort(function (a, b) {
    if (a.inicio !== b.inicio) return a.inicio < b.inicio ? -1 : 1;
    if (a.titulo !== b.titulo) return a.titulo < b.titulo ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ---------- Aperfeiçoamento: EAP (planilha das turmas) ----------

var MESES_EXTENSO = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
var MESES_SIGLA = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/** Abas das Cias na planilha do EAP (o EM é preenchido pela P/1, fora do portal). */
var ABAS_EAP = { '1cia': '1 Cia', '2cia': '2 Cia', '3cia': '3 Cia', '4cia': '4 Cia', '5cia': '5 Cia', '6cia': '6 Cia', ft: 'FT' };
var UNIDADE_EAP = { '1cia': '1ª CIA PM', '2cia': '2ª CIA PM', '3cia': '3ª CIA PM', '4cia': '4ª CIA PM', '5cia': '5ª CIA PM', '6cia': '6ª CIA PM', ft: 'FT' };
var OPM_EAP = '8º BPM/M';
var SEM_EFETIVO_EAP = 'SEM EFETIVO PENDENTE DE EAP';

function partesData_(iso) {
  var p = String(iso || '').split('-');
  return { ano: p[0] || '', mes: Number(p[1]) || 0, dia: p[2] || '' };
}

/** Linha 4: "ESTÁGIO DE ATUALIZAÇÃO PROFISSIONAL - 2026" */
function textoAnoEap(ano) {
  return 'ESTÁGIO DE ATUALIZAÇÃO PROFISSIONAL - ' + ano;
}

/** Linha 5: "EAD EM NOVEMBRO - PRESENCIAL EM DEZEMBRO" */
function textoMesesEap(mesEad, mesPresencial) {
  return 'EAD EM ' + MESES_EXTENSO[mesEad - 1] + ' - PRESENCIAL EM ' + MESES_EXTENSO[mesPresencial - 1];
}

/** "09 A 25NOV" (mesmo mês) ou "28OUT A 15NOV"; sep = " A " ou " á ". */
function intervaloEap_(inicio, fim, sep) {
  var a = partesData_(inicio);
  var b = partesData_(fim);
  var primeiro = a.mes === b.mes ? a.dia : a.dia + MESES_SIGLA[a.mes - 1];
  return primeiro + sep + b.dia + MESES_SIGLA[b.mes - 1];
}

/** Linha 6: "PERÍODO EAD 09 A 25NOV" */
function textoPeriodoEad(inicio, fim) {
  return 'PERÍODO EAD ' + intervaloEap_(inicio, fim, ' A ');
}

/** Título da turma: "CB/SD - TURMA 34 de 01 á 03DEZ" ou "SUBTEN SGT PM TURMA 9 de 09 á 11DEZ". */
function tituloTurmaEap(t) {
  var periodo = intervaloEap_(t.inicio, t.fim, ' á ');
  return (t.tipo === 'cbsd' ? 'CB/SD - TURMA ' : 'SUBTEN SGT PM TURMA ') + t.numero + ' de ' + periodo;
}

/** "APRESENTAÇÃO 010745DEZ26 CPA/M-11" (sempre 07h45 no CPA/M-11; muda a data). */
function textoApresentacaoEap(inicio) {
  var d = partesData_(inicio);
  return 'APRESENTAÇÃO ' + d.dia + '0745' + MESES_SIGLA[d.mes - 1] + String(d.ano).slice(-2) + ' CPA/M-11';
}

function tipoDoBlocoEap_(titulo) {
  var t = String(titulo || '').toUpperCase().trim();
  if (/^CB\s*\/\s*SD/.test(t)) return 'cbsd';
  if (/^SUBTEN|^SGT/.test(t)) return 'sgt';
  if (/TAF|TAT/.test(t)) return 'taf';
  if (/RESTRI/.test(t)) return 'restricao';
  return '';
}

/**
 * Acha as turmas na aba da Cia: cada bloco é título, apresentação, cabeçalho "Nº" e as linhas brancas (coluna B).
 * colA = valores da coluna A; fundosB = cores da coluna B (mesmo tamanho). Linhas devolvidas contam a partir de 1.
 * Ids: cbsd1..3, sgt1..2 na ordem em que aparecem; "taf" e "restricao".
 */
function localizarBlocosEap(colA, fundosB) {
  var blocos = [];
  var cont = { cbsd: 0, sgt: 0 };
  for (var i = 2; i < colA.length; i++) {
    if (String(colA[i]).trim().toUpperCase() !== 'Nº') continue;
    var tipo = tipoDoBlocoEap_(colA[i - 2]);
    if (!tipo) continue;
    var id = tipo === 'cbsd' || tipo === 'sgt' ? tipo + ++cont[tipo] : tipo;
    var primeira = i + 1;
    var qtd = 0;
    while (primeira + qtd < colA.length && String(fundosB[primeira + qtd] || '').toLowerCase() === '#ffffff') qtd++;
    blocos.push({ id: id, tipo: tipo, titulo: i - 1, apresentacao: i, cabecalho: i + 1, primeira: primeira + 1, linhas: qtd });
  }
  return blocos;
}

/** Linha do policial na planilha (colunas A a K). */
function linhaPolicialEap(p, ordem, unidadeId) {
  var v = partesData_(p.validadeIas);
  return [
    ordem,
    p.grad || '',
    p.re || '',
    p.nomeCompleto || '',
    UNIDADE_EAP[unidadeId] || '',
    OPM_EAP,
    p.email || '',
    p.celular || '',
    p.ias || '',
    v.dia ? v.dia + '/' + ('0' + v.mes).slice(-2) + '/' + v.ano : '',
    p.observacao || ''
  ];
}

/**
 * Linhas que cada bloco deve ter nesta aba: turma = vagas da Cia (mínimo 1, para caber "SEM EFETIVO");
 * nunca menos do que já foi preenchido. Devolve [{id, de, para}] só dos que mudam.
 */
function ajustesDeLinhasEap(blocos, vagas, preenchidas) {
  return blocos
    .map(function (b) {
      var minimo = Math.max(1, (preenchidas && preenchidas[b.id]) || 0);
      var alvo = b.tipo === 'cbsd' || b.tipo === 'sgt' ? Math.max(minimo, Number((vagas || {})[b.id]) || 0) : Math.max(minimo, b.linhas);
      return { id: b.id, de: b.linhas, para: alvo };
    })
    .filter(function (a) { return a.de !== a.para; });
}

// ---------- Controle de Operações e Relatório de Indicadores ----------
// Mesmo texto e mesmo modelo do script "Relatório P/3" do numerador antigo.

var MESES_EXT_REL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Id do registro: data de início + nome sem acento (o mesmo no portal e no motor, para não duplicar). */
function idControleOperacao(nome, inicio) {
  var slug = String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return (inicio || 'sem-data') + '_' + (slug || 'operacao');
}

/** Célula de data (Date da planilha ou "dd/mm/aaaa") -> "aaaa-mm-dd" ('' se não for data). */
function isoDaCelula(v) {
  var dois = function (n) { return ('0' + n).slice(-2); };
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) {
    return v.getFullYear() + '-' + dois(v.getMonth() + 1) + '-' + dois(v.getDate());
  }
  var m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(String(v || ''));
  if (!m) return '';
  var ano = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
  return ano + '-' + dois(m[2]) + '-' + dois(m[1]);
}

function semAcento_(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Linhas da aba Operações da planilha antiga -> registros do Controle de Operações.
 * Colunas: A Seq, B Operação, C OPM, D Ordem, E Origem, F Início, G Término, H (observação), I Objetivo
 * (o Objetivo é achado pelo cabeçalho, como no script do relatório).
 */
function linhasControleDaPlanilha(cabecalho, linhas) {
  var colObjetivo = (cabecalho || []).map(semAcento_).indexOf('objetivo');
  if (colObjetivo < 0) colObjetivo = 8;
  var texto = function (v) { return String(v === null || v === undefined ? '' : v).trim(); };
  var saida = [];
  (linhas || []).forEach(function (l) {
    var nome = texto(l[1]);
    var inicio = isoDaCelula(l[5]);
    if (!nome || !inicio) return;
    saida.push({
      id: idControleOperacao(nome, inicio),
      nome: nome,
      opm: texto(l[2]),
      ordem: texto(l[3]),
      origem: texto(l[4]),
      inicio: inicio,
      termino: isoDaCelula(l[6]),
      observacao: colObjetivo === 7 ? '' : texto(l[7]),
      objetivo: texto(l[colObjetivo])
    });
  });
  return saida;
}

/** "2026-09-01" -> "01SET26" */
function dataMilitar(iso) {
  var p = String(iso).split('-');
  return p[2] + MESES_SIGLA[Number(p[1]) - 1] + p[0].slice(-2);
}

/** "2026-10-10" -> "10 de outubro de 2026" */
function dataExtenso(iso) {
  var p = String(iso).split('-');
  return p[2] + ' de ' + MESES_EXT_REL[Number(p[1]) - 1] + ' de ' + p[0];
}

/** Item da lista de operações do relatório (igual ao relTextoOperacao do script antigo). */
function textoOperacaoRelatorio(nome, inicio, termino, objetivo) {
  var per;
  if (!termino) per = 'a partir de ' + dataMilitar(inicio);
  else if (inicio === termino) per = 'em ' + dataMilitar(inicio);
  else if (inicio.slice(0, 7) === termino.slice(0, 7)) per = 'de ' + inicio.slice(8, 10) + ' a ' + dataMilitar(termino);
  else per = 'de ' + dataMilitar(inicio) + ' a ' + dataMilitar(termino);
  var obj = String(objetivo || '').trim();
  return String(nome).trim() + ' – ' + per + (obj ? ', ' + obj.replace(/[;.]\s*$/, '') : '') + ';';
}

function ultimoDiaDoMes_(ano, mes) {
  return ano + '-' + ('0' + mes).slice(-2) + '-' + ('0' + new Date(ano, mes, 0).getDate()).slice(-2);
}

/** Operações (não excluídas) que cruzam o mês, em ordem de início, já no texto do relatório. */
function operacoesDoMes(lista, ano, mes) {
  var ini = ano + '-' + ('0' + mes).slice(-2) + '-01';
  var fim = ultimoDiaDoMes_(ano, mes);
  return (lista || [])
    .filter(function (o) { return !o.excluida && o.nome && o.inicio && o.inicio <= fim && !(o.termino && o.termino < ini); })
    .sort(function (a, b) { return a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0; })
    .map(function (o) { return textoOperacaoRelatorio(o.nome, o.inicio, o.termino, o.objetivo); });
}

/** Campos {{...}} do modelo em Word. tabelas = { CRI_1_ANT: '...', ... } (lidas da planilha de indicadores). */
function dadosRelatorio(pedido, operacoes, tabelas, hojeIso, prefixo) {
  var p = String(pedido.mes).split('-');
  var ano = Number(p[0]);
  var mes = Number(p[1]);
  var dados = {
    DATA_EXTENSO: dataExtenso(hojeIso),
    NUMERO: (prefixo || '') + String(pedido.numero || '').trim(),
    INICIO: dataMilitar(p[0] + '-' + p[1] + '-01'),
    FIM: dataMilitar(ultimoDiaDoMes_(ano, mes)),
    ANO_ANT: String(ano - 1),
    ANO: String(ano),
    OPERACOES: operacoesDoMes(operacoes, ano, mes)
  };
  Object.keys(tabelas || {}).forEach(function (k) { dados[k] = tabelas[k]; });
  return dados;
}

/** Valores das faixas da planilha de indicadores -> CRI_1_ANT, CRI_1_ATU, CRI_1_EVO, PRO_1_ANT... */
function tabelasIndicadores(crimes, produtividade) {
  var out = {};
  [['CRI', crimes], ['PRO', produtividade]].forEach(function (par) {
    (par[1] || []).forEach(function (linha, i) {
      out[par[0] + '_' + (i + 1) + '_ANT'] = linha[0];
      out[par[0] + '_' + (i + 1) + '_ATU'] = linha[1];
      out[par[0] + '_' + (i + 1) + '_EVO'] = linha[2];
    });
  });
  return out;
}

function nomeArquivoRelatorio(numero, mesIso) {
  var p = String(mesIso).split('-');
  return 'Relatório ' + String(numero || '').trim().replace(/\//g, '_') + ' - Avaliação Periódica de Indicadores (' +
    MESES_SIGLA[Number(p[1]) - 1] + p[0] + ').docx';
}

/** Preenche o document.xml do modelo (mesma regra do relPreencherXml do script antigo). */
function preencherXmlRelatorio(xml, dados) {
  var textoDe = function (p) {
    return (p.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) || []).map(function (t) { return t.replace(/<[^>]+>/g, ''); }).join('');
  };
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  return xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function (p) {
    var txt = textoDe(p);
    if (txt.indexOf('{{') < 0) return p;
    // junta os pedaços (runs) do parágrafo mantendo a formatação do primeiro
    var abre = p.match(/^<w:p[^>]*>/)[0];
    var ppr = (p.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
    var run = (p.match(/<w:r[ >][\s\S]*?<\/w:r>/) || [''])[0];
    var rpr = (run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
    var monta = function (t) { return abre + ppr + '<w:r>' + rpr + '<w:t xml:space="preserve">' + t + '</w:t></w:r></w:p>'; };
    if (txt.indexOf('{{OPERACAO}}') >= 0) {
      var lista = dados.OPERACOES && dados.OPERACOES.length ? dados.OPERACOES : ['Não houve operações no período.'];
      return lista.map(function (o) { return monta(txt.replace('{{OPERACAO}}', esc(o))); }).join('');
    }
    txt = txt.replace(/\{\{([A-Z0-9_]+)\}\}/g, function (m, k) { return k in dados ? esc(dados[k]) : m; });
    return monta(txt);
  });
}

// ---------- Operações → Documentos Mensais ----------
// A configuração (células de cada Cia) vem do portal (config/documentosMensais).

var MESES_NOME_DOC = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** "2026-10" -> "2026-11" */
function proximoMes(mesRef) {
  var p = String(mesRef).split('-').map(Number);
  return p[1] === 12 ? (p[0] + 1) + '-01' : p[0] + '-' + ('0' + (p[1] + 1)).slice(-2);
}

/** Troca {MES} (OUTUBRO), {Mes} (Outubro), {SIGLA} (OUT), {AA} (26), {ANO} (2026) e {QUEM}. */
function textoDoMes(modelo, mesRef, quem) {
  var p = String(mesRef).split('-');
  var i = Number(p[1]) - 1;
  return String(modelo)
    .replace(/\{MES\}/g, MESES_NOME_DOC[i].toUpperCase())
    .replace(/\{Mes\}/g, MESES_NOME_DOC[i])
    .replace(/\{SIGLA\}/g, MESES_SIGLA[i])
    .replace(/\{AA\}/g, p[0].slice(-2))
    .replace(/\{ANO\}/g, p[0])
    .replace(/\{TRI\}/g, Math.ceil((i + 1) / 3) + 'º')
    .replace(/\{ANO_ANT\}/g, String(Number(p[0]) - 1))
    .replace(/\{QUEM\}/g, String(quem || '').trim());
}

/** '' = a planilha está no formato esperado; senão, o que mudou (o motor não grava). */
function conferirAncoras(ancoras, lidos) {
  var norm = function (s) { return semAcento_(s).replace(/\s+/g, ' ').toUpperCase(); };
  var faltam = Object.keys(ancoras || {}).filter(function (c) {
    return norm(lidos[c]).indexOf(norm(ancoras[c])) < 0;
  });
  return faltam.length ? 'A planilha mudou de formato (' + faltam.map(function (c) { return c + ' devia ter "' + ancoras[c] + '"'; }).join('; ') + ')' : '';
}

/**
 * O que fazer com o envio de uma Cia, comparando o mês que está na planilha com o do envio:
 * 'gravar' | 'arquivarAntes' (planilha ainda com o mês anterior: guarda cópia e zera) | 'antigo' (mês já arquivado).
 */
function acaoEnvioMensal(mesPlanilha, mesEnvio) {
  if (!mesPlanilha || mesPlanilha === mesEnvio) return 'gravar';
  return mesPlanilha < mesEnvio ? 'arquivarAntes' : 'antigo';
}

/**
 * "{M}21" -> coluna do mês (janeiro em colunaJaneiro) + linha; "{T}10" -> coluna do trimestre
 * (1º em colunaTrimestre1). Células sem {M}/{T} ficam como estão.
 */
function resolverCelula(celula, mesRef, colunaJaneiro, colunaTrimestre1) {
  var mes = Number(String(mesRef).slice(5));
  var desloca = function (col, n) { return String.fromCharCode(String(col || 'A').charCodeAt(0) + n); };
  return String(celula)
    .replace('{M2+1}', desloca(colunaJaneiro, 2 * (mes - 1) + 1)) // duas colunas por mês (ano anterior e atual)
    .replace('{M2}', desloca(colunaJaneiro, 2 * (mes - 1)))
    .replace('{M}', desloca(colunaJaneiro, mes - 1))
    .replace('{T}', desloca(colunaTrimestre1, Math.ceil(mes / 3) - 1));
}

/** Âncoras do mês: células e textos com {M}/{SIGLA}/{AA}... resolvidos. */
function ancorasDoMes(doc, mesRef) {
  var out = {};
  Object.keys(doc.ancoras || {}).forEach(function (c) {
    out[resolverCelula(c, mesRef, doc.colunaJaneiro, doc.colunaTrimestre1)] = textoDoMes(doc.ancoras[c], mesRef);
  });
  return out;
}

/** Aba de cada Cia (uma só ou uma por Cia). */
function abaDaCia(doc, u) {
  return (doc.abas && doc.abas[u]) || doc.aba || '';
}

/** O que zerar ao arquivar: [{ u, celula, valor }] (vazio quando a planilha é do ano todo). */
function valoresParaZerar(doc, mesRef) {
  if (doc.zerar === false) return [];
  var out = [];
  Object.keys(doc.celulas || {}).forEach(function (u) {
    Object.keys(doc.celulas[u]).forEach(function (campo) {
      var v = doc.vazios && campo in doc.vazios ? doc.vazios[campo] : doc.zerarCom === 0 ? 0 : '';
      out.push({ u: u, celula: resolverCelula(doc.celulas[u][campo], mesRef, doc.colunaJaneiro, doc.colunaTrimestre1), valor: v });
    });
  });
  return out;
}

/** Todas as células que as Cias preenchem (compatibilidade). */
function celulasParaZerar(doc) {
  return valoresParaZerar(doc, '2026-01').map(function (x) { return x.celula; });
}

/**
 * Documento preenchido direto na planilha (ex.: R.R.): ao zerar, apaga o intervalo em cada aba
 * e troca o cabeçalho para o próximo mês. { abas, limpar, mes: { aba, celula, valor } | null }
 */
function zerarDireto(direto, mesRef) {
  return {
    abas: (direto.abas || []).slice(),
    limpar: direto.limpar,
    mes: direto.mes ? { aba: direto.mes.aba, celula: direto.mes.celula, valor: textoDoMes(direto.mes.modelo, proximoMes(mesRef)) } : null,
  };
}

function nomeArquivoMensal(nome, mesRef) {
  var p = String(mesRef).split('-');
  return nome + ' - ' + MESES_SIGLA[Number(p[1]) - 1] + p[0];
}

// ---------- Aperfeiçoamento → ICC ----------
// Planilha "ICC nº": linha 4 cabeçalho (QTD 1ª CIA … QTD FT, QTD EM), linhas 5 a 8 Oficiais, Subten e Sgt, Cb e Sd, Total.

var COLUNAS_ICC = { '1cia': 'D', '2cia': 'E', '3cia': 'F', '4cia': 'G', '5cia': 'H', '6cia': 'I', ft: 'J' };
var ANCORAS_ICC = { C4: 'GRADUAÇÃO', C5: 'Oficiais', C6: 'Subten e Sgt', C7: 'Cb e Sd', C8: 'Total', D4: 'QTD 1ª CIA', J4: 'QTD FT', K4: 'QTD EM' };

/** Células da Cia na planilha da ICC e os valores (o total é a soma). */
function celulasIcc(unidadeId, r) {
  var c = COLUNAS_ICC[unidadeId];
  if (!c) throw new Error('a ' + unidadeId + ' não tem coluna na planilha da ICC');
  var of = Number(r.oficiais) || 0, sg = Number(r.sargentos) || 0, cb = Number(r.cabos) || 0;
  var out = {};
  out[c + '5'] = of;
  out[c + '6'] = sg;
  out[c + '7'] = cb;
  out[c + '8'] = of + sg + cb;
  return out;
}

/**
 * Fila do motor: as que ainda não deram erro vão primeiro e as que já falharam vão por último
 * (a que falhou há mais tempo antes). Assim um erro que se repete não trava as outras demandas.
 */
function ordenarPendentes(lista) {
  var erro = function (p) { return (p.dados && p.dados.automacao && p.dados.automacao.erro) ? 1 : 0; };
  var quando = function (p) { return (p.dados && p.dados.automacao && p.dados.automacao.processadoEm) || ''; };
  return lista.slice().sort(function (a, b) {
    return erro(a) - erro(b) || (quando(a) < quando(b) ? -1 : quando(a) > quando(b) ? 1 : 0);
  });
}

/** 1 -> A, 26 -> Z, 27 -> AA */
function letraDaColuna(n) {
  var s = '';
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Células brancas (#ffffff) de um bloco de fundos em poucos retângulos A1 ("B9:F40"), para limpar
 * a aba do EAP de uma vez só (célula por célula estourava o tempo do Apps Script).
 * Junta as brancas seguidas de cada linha e as linhas seguidas com o mesmo trecho.
 */
function intervalosBrancos(fundos, linhaInicial, colunaInicial) {
  var col0 = colunaInicial || 1;
  var abertos = {};
  var saida = [];
  var branca = function (v) { return String(v).toLowerCase() === '#ffffff'; };
  for (var i = 0; i <= fundos.length; i++) {
    var trechos = {};
    var linha = i < fundos.length ? fundos[i] : [];
    for (var j = 0; j < linha.length; j++) {
      if (!branca(linha[j])) continue;
      var k = j;
      while (k + 1 < linha.length && branca(linha[k + 1])) k++;
      trechos[j + ':' + k] = [j, k];
      j = k;
    }
    Object.keys(abertos).forEach(function (ch) {
      if (!trechos[ch]) { saida.push(abertos[ch]); delete abertos[ch]; }
    });
    Object.keys(trechos).forEach(function (ch) {
      if (abertos[ch]) abertos[ch].l2 = i;
      else abertos[ch] = { c1: trechos[ch][0], c2: trechos[ch][1], l1: i, l2: i };
    });
  }
  saida.sort(function (a, b) { return a.l1 - b.l1 || a.c1 - b.c1; });
  return saida.map(function (r) {
    return letraDaColuna(r.c1 + col0) + (r.l1 + linhaInicial) + ':' + letraDaColuna(r.c2 + col0) + (r.l2 + linhaInicial);
  });
}

// ---------- Acessos individuais (login por RE) ----------
// O mesmo cálculo está em src/domain/acessos.ts (emailDeLogin); o teste confere os dois.

var DOMINIO_LOGIN_ACESSO = 'portal-p3.firebaseapp.com';

function emailDeLoginAcesso(re) {
  return 're' + normalizarRE(re) + '@' + DOMINIO_LOGIN_ACESSO;
}

/** Perfil gravado na conta (custom claims): é o que as regras do banco e o portal leem. */
function claimsDoAcesso(a) {
  var c = { perfil: a.perfil, re: normalizarRE(a.re) };
  if (a.perfil === 'unidade' || a.perfil === 'cgp') c.unidade = a.unidade;
  if (a.perfil === 'p3' && a.admin === true) c.admin = true;
  return c;
}

/** E-mail com o link de senha (primeiro acesso ou troca). */
function htmlLinkSenha(a, link, primeiro) {
  var nome = String(a.posto || '') + ' ' + String(a.nomeGuerra || a.nomeCompleto || '');
  var esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#000;max-width:560px;">' +
    '<p>' + esc(nome.trim()) + ',</p>' +
    '<p>' + (primeiro
      ? 'Seu acesso ao <b>Portal P3 (8º BPM/M)</b> foi criado. Para entrar, crie sua senha pelo botão abaixo.'
      : 'Recebemos um pedido para trocar a sua senha do <b>Portal P3 (8º BPM/M)</b>.') + '</p>' +
    '<p><a href="' + esc(link) + '" style="display:inline-block;background:#0b3d91;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">' +
    (primeiro ? 'Criar minha senha' : 'Trocar minha senha') + '</a></p>' +
    '<p>No portal, entre com o seu <b>RE</b> (com ou sem dígito) e a senha criada.</p>' +
    '<p style="color:#555;font-size:12px;">O link vale por pouco tempo. Se não foi você que pediu, ignore este e-mail.</p>' +
    '</div>';
}

// ---------- RAC: arquivar o RAC GERAL ----------

var UNIDADES_RAC = ['1cia', '2cia', '3cia', '4cia', '5cia', '6cia', 'ft', 'btl'];
var SLOTS_RAC = ['rvPainel', 'rvMapa', 'fvPainel', 'fvMapa', 'roPainel', 'roMapa', 'foPainel'];

/** Ids dos prints do mês (racPrints e racPrintsDados usam o mesmo id): apagados depois de arquivar no Drive. */
function idsPrintsDoRac(mes) {
  var ids = [];
  UNIDADES_RAC.forEach(function (u) {
    SLOTS_RAC.forEach(function (s) {
      ids.push(mes + '_' + u + '_' + s);
    });
  });
  return ids;
}

// ---------- Encaminhamentos sem demanda (limpeza diária) ----------

/**
 * Encaminhamentos abertos cuja demanda não existe mais (apagada direto no banco) ou foi excluída:
 * saem da tela da Cia. encs: [{ id, demandaId }]; statusDasDemandas: { id: status } das que existem.
 */
function encaminhamentosOrfaos(encs, statusDasDemandas) {
  return encs
    .filter(function (e) {
      var st = e.demandaId ? statusDasDemandas[e.demandaId] : undefined;
      return st === undefined || st === 'excluido';
    })
    .map(function (e) { return e.id; });
}

// ---------- Fotos: 15 dias no sistema ----------

// Iguais a src/domain/fotos.ts (o teste confere).
var FOTOS_DIAS_NO_SISTEMA = 15;
var FOTOS_PRAZO_DESDE = '2026-11-22T03:00:00.000Z';

/**
 * Hora limite (ISO): foto gravada antes dela já passou dos 15 dias e sai do sistema. As que já estavam no
 * sistema quando a regra começou contam a partir de FOTOS_PRAZO_DESDE. '' = nada vencido ainda.
 */
function limiteFotosVencidas(agoraMs) {
  var limite = agoraMs - FOTOS_DIAS_NO_SISTEMA * 24 * 60 * 60 * 1000;
  if (limite < Date.parse(FOTOS_PRAZO_DESDE)) return '';
  return new Date(limite).toISOString();
}
