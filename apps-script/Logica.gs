/**
 * LÓGICA DO MOTOR (sem acesso a Google/Firestore: só decide e converte).
 * Este arquivo também é testado automaticamente no projeto (tests/unit/motor.test.ts).
 */

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

  // Demanda excluída no portal: só apaga os eventos que ela tinha (a pasta do Drive fica).
  if (d.status === 'excluido') {
    if (feito.agendaCPA) acoes.push({ tipo: 'apagar', chave: 'agendaCPA', agenda: 'principal', eventoId: feito.agendaCPA.eventoId });
    if (feito.agendaCia) acoes.push({ tipo: 'apagar', chave: 'agendaCia', agenda: 'principal', eventoId: feito.agendaCia.eventoId });
    if (feito.cfp) acoes.push({ tipo: 'apagar', chave: 'cfp', agenda: 'cfp', eventoId: feito.cfp.eventoId });
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

/**
 * Lê uma aba do banco de efetivo: acha o cabeçalho (RE e NOME DE GUERRA) nas 10 primeiras linhas
 * e devolve { chave, re, posto, nomeGuerra, telefone } de cada linha com RE.
 */
function linhasDoEfetivo(valores) {
  var cab = -1;
  var col = {};
  for (var i = 0; i < Math.min(10, valores.length) && cab < 0; i++) {
    var linha = valores[i].map(function (v) { return String(v).trim().toUpperCase(); });
    var re = linha.indexOf('RE');
    var guerra = -1;
    linha.forEach(function (v, j) { if (guerra < 0 && v.indexOf('NOME DE GUERRA') >= 0) guerra = j; });
    if (re >= 0 && guerra >= 0) {
      cab = i;
      col.re = re;
      col.guerra = guerra;
      linha.forEach(function (v, j) {
        if (col.posto === undefined && /POST|GRAD/.test(v)) col.posto = j;
        if (col.tel === undefined && /TELEFONE|CELULAR/.test(v)) col.tel = j;
      });
    }
  }
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
      telefone: col.tel === undefined ? '' : String(l[col.tel]).trim()
    });
  }
  return lista;
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
