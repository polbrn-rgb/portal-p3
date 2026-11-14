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

// ---------- Resumo diário por e-mail ----------

var PENDENTES_P3 = ['novo', 'visualizado', 'em_andamento', 'devolvido'];

function somarDiasIso(iso, dias) {
  var d = dataLocal(iso);
  d.setDate(d.getDate() + dias);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function dataBr(iso) {
  if (!iso) return '';
  var p = String(iso).split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

function porPrazo(a, b) {
  return String(a.prazo || '9').localeCompare(String(b.prazo || '9')) || a.numero - b.numero;
}

/** Separa as pendências do dia: atrasadas, vencem hoje, próximos 3 dias, aguardando aceite e por Cia. */
function montarResumoDiario(demandas, encs, hoje) {
  var r = { atrasadas: [], venceHoje: [], proximos: [], aguardandoAceite: [], porCia: {} };
  var limite = somarDiasIso(hoje, 3);
  demandas.forEach(function (d) {
    var item = { numero: d.numero, saida: d.saida, prazo: d.prazoCPA };
    if (!d.prazoCPA) return;
    if (d.prazoCPA < hoje) r.atrasadas.push(item);
    else if (d.prazoCPA === hoje) r.venceHoje.push(item);
    else if (d.prazoCPA <= limite) r.proximos.push(item);
  });
  encs.forEach(function (e) {
    var sigla = SIGLAS_P3[e.unidadeId] || e.unidadeId;
    var item = { numero: e.numero, saida: e.saida, prazo: e.prazoCia, sigla: sigla };
    if (e.status === 'respondido') {
      r.aguardandoAceite.push(item);
      return;
    }
    if (PENDENTES_P3.indexOf(e.status) < 0) return;
    var c = (r.porCia[e.unidadeId] = r.porCia[e.unidadeId] || { sigla: sigla, pendentes: [], atrasadas: [] });
    c.pendentes.push(item);
    if (e.prazoCia && e.prazoCia < hoje) c.atrasadas.push(item);
  });
  [r.atrasadas, r.venceHoje, r.proximos, r.aguardandoAceite].forEach(function (l) { l.sort(porPrazo); });
  Object.keys(r.porCia).forEach(function (u) { r.porCia[u].pendentes.sort(porPrazo); r.porCia[u].atrasadas.sort(porPrazo); });
  return r;
}

function escaparHtml(t) {
  return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function blocoHtml(titulo, cor, itens, extra) {
  if (!itens.length) return '';
  var linhas = itens.map(function (i) {
    return '<li><b>Nº ' + i.numero + '</b> ' + escaparHtml(i.saida) + (extra ? ' — ' + escaparHtml(extra(i)) : '') + '</li>';
  }).join('');
  return '<h3 style="color:' + cor + ';margin:16px 0 4px">' + titulo + ' (' + itens.length + ')</h3><ul style="margin:0;padding-left:18px">' + linhas + '</ul>';
}

function rodapeHtml(url) {
  return url ? '<p style="margin-top:20px"><a href="' + url + '" style="background:#1a2935;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Abrir o Portal P3</a></p>' : '';
}

function htmlResumoP3(r, hoje, url) {
  var porCia = Object.keys(SIGLAS_P3).filter(function (u) { return r.porCia[u]; }).map(function (u) {
    var c = r.porCia[u];
    return '<tr><td>' + c.sigla + '</td><td style="text-align:center">' + c.pendentes.length + '</td><td style="text-align:center;color:' +
      (c.atrasadas.length ? '#8a1c1c' : 'inherit') + '">' + c.atrasadas.length + '</td></tr>';
  }).join('');
  var corpo = blocoHtml('Atrasadas', '#8a1c1c', r.atrasadas, function (i) { return 'prazo CPA ' + dataBr(i.prazo); }) +
    blocoHtml('Vencem hoje', '#9a3412', r.venceHoje) +
    blocoHtml('Próximos 3 dias', '#1d4f86', r.proximos, function (i) { return dataBr(i.prazo); }) +
    blocoHtml('Respostas aguardando seu aceite', '#1d5c1a', r.aguardandoAceite, function (i) { return i.sigla; }) +
    (porCia ? '<h3 style="margin:16px 0 4px">Pendências por Cia</h3><table cellpadding="6" style="border-collapse:collapse">' +
      '<tr><th align="left">Cia</th><th>Pendentes</th><th>Atrasadas</th></tr>' + porCia + '</table>' : '');
  return '<div style="font-family:Segoe UI,Arial,sans-serif;color:#1a2935">' +
    '<h2 style="margin:0 0 4px">Portal P3 — pendências de ' + dataBr(hoje) + '</h2>' +
    (corpo || '<p>Nenhuma pendência. 👍</p>') + rodapeHtml(url) + '</div>';
}

function htmlResumoCia(c, hoje, url) {
  return '<div style="font-family:Segoe UI,Arial,sans-serif;color:#1a2935">' +
    '<h2 style="margin:0 0 4px">' + c.sigla + ' — demandas pendentes em ' + dataBr(hoje) + '</h2>' +
    blocoHtml('Atrasadas', '#8a1c1c', c.atrasadas, function (i) { return 'prazo ' + dataBr(i.prazo); }) +
    blocoHtml('Pendentes', '#1a2935', c.pendentes, function (i) { return i.prazo ? 'prazo ' + dataBr(i.prazo) : 'sem prazo'; }) +
    rodapeHtml(url) + '</div>';
}

function assuntoResumoP3(r, hoje) {
  var partes = [];
  if (r.atrasadas.length) partes.push(r.atrasadas.length + ' atrasada(s)');
  if (r.venceHoje.length) partes.push(r.venceHoje.length + ' vence(m) hoje');
  if (r.aguardandoAceite.length) partes.push(r.aguardandoAceite.length + ' aguardando aceite');
  return 'Portal P3 — ' + dataBr(hoje) + (partes.length ? ' — ' + partes.join(', ') : ' — sem pendências');
}
