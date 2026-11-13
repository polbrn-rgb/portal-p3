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
