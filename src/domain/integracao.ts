// Produção dos pelotões → Documentos Mensais.
//
// Ao abrir um Documento Mensal, os campos que existem na produção diária já vêm somados do mês de referência.
// A Cia confere (pode corrigir) e envia para a P/3, como antes. Regra: só pré-preenche se a produção do mês
// estiver COMPLETA (todos os dias, turno do dia e da noite; na FT só o do dia). Faltando algum turno, nada é
// pré-preenchido (a Cia preenche à mão) e a Cia e a P/3 veem o alerta com os dias que faltam.
// Quem confere, corrige e envia é sempre a Cia: o que vem da produção é só ponto de partida.
//
// Campos que não existem na produção (crimes, naturezas de BO, escolas, EAP...) continuam digitados pela Cia.
import { diasDoMes, pendencias, somarItens, type Itens, type PendenciaDia, type Producao } from './producao';
import { colunasPelotao, comCampo, linhasPelotao, prodDigitadaAParte, PRODUTIVIDADE, somarMeses, valorDoCampo, type RacDados } from './rac';
import type { UnidadeId } from './unidades';

type Lancs = readonly Pick<Producao, 'data' | 'pelotao' | 'itens' | 'taloes'>[];
type Fonte = { calc: (soma: Itens, lancs: Lancs) => number; /** Precisa da natureza em todos os flagrantes do mês. */ natureza?: boolean };

const item = (...ids: (keyof Itens)[]): Fonte => ({ calc: (s) => Math.round(ids.reduce((t, id) => t + s[id], 0) * 1000) / 1000 });
const flagrantes = (trafico: boolean): Fonte => ({
  natureza: true,
  calc: (_, l) => l.flatMap((x) => x.taloes).filter((t) => (t.natureza === 'trafico') === trafico).length,
});

/** Documento → campo → de onde vem na produção. */
export const DA_PRODUCAO: Record<string, Record<string, Fonte>> = {
  // Apreendidos = pela delegacia + removidos ao pátio. Duas rodas: motos e ciclomotores.
  'veiculos-apreendidos': {
    v4: item('veiculosApreendidos', 'carrosRemovidos'),
    v2: item('motosApreendidas', 'motosRemovidas', 'cicloRem'),
    cam: item('caminhoesApreendidos', 'caminhoesRemovidos'),
  },
  'vistoria-ciclomotores': Object.fromEntries(
    (['bike', 'ciclo', 'auto'] as const).flatMap((t) =>
      (['vist', 'rem', 'loc', 'aut'] as const).map((a) => [`${t}_${a}`, item(`${t}${a[0].toUpperCase()}${a.slice(1)}` as keyof Itens)]),
    ),
  ),
  'escoltas-fundacao-casa': {
    recebidos: item('escoltasRecebidas'),
    atendidos: item('escoltasAtendidas'),
    naoAtendidos: { calc: (s) => Math.max(0, s.escoltasRecebidas - s.escoltasAtendidas) },
  },
  'atividades-transito': { autAi: item('ai'), autAit: item('ait'), autTrv: item('trv') },
  // Só as colunas do ano atual (o ano anterior vem da produção quando houver um ano de lançamentos).
  'avaliacao-periodica': {
    trafico_atu: flagrantes(true),
    flagrantes_atu: flagrantes(false),
    atos_atu: item('atosInfracionais'),
    procurados_atu: item('procurados'),
    armasFogo_atu: item('armas'),
    armasBrancas_atu: item('armasBrancas'),
    abordadas_atu: item('pessoasAbordadas'),
    veiculos_atu: item('veiculosVistoriados', 'motosVistoriadas'),
  },
};

/** Colunas "ano anterior": as mesmas contas, sobre a produção do mesmo mês do ano anterior. */
export const DA_PRODUCAO_ANO_ANTERIOR: Record<string, Record<string, Fonte>> = {
  'avaliacao-periodica': Object.fromEntries(
    Object.entries(DA_PRODUCAO['avaliacao-periodica']).map(([campo, f]) => [campo.replace(/_atu$/, '_ant'), f]),
  ),
};

export const temIntegracao = (docId: string): boolean => docId in DA_PRODUCAO;

export type SituacaoProducaoMes = {
  completa: boolean;
  pendencias: PendenciaDia[];
  turnosFaltando: number;
};

/** A produção do mês está completa? Conta todos os dias do mês (não só depois do primeiro lançamento). */
export function situacaoProducaoMes(lancs: Lancs, mes: string, unidade: UnidadeId, hoje: string): SituacaoProducaoMes {
  // Mês ainda em andamento: os dias de hoje em diante não contam, mas também não está fechado.
  const fechado = diasDoMes(mes).every((d) => d < hoje);
  const p = pendencias(lancs, mes, hoje, `${mes}-01`, unidade);
  const turnos = p.reduce((s, x) => s + Number(x.faltaDia) + Number(x.faltaNoite), 0);
  return { completa: fechado && p.length === 0, pendencias: p, turnosFaltando: turnos };
}

export type PreenchimentoProducao = SituacaoProducaoMes & {
  /** Campo → valor somado (vazio se a produção não estiver completa). */
  valores: Record<string, number>;
  avisos: string[];
};

/** Valores do documento que saem da produção da Cia no mês (só se a produção estiver completa). */
export function preencherDaProducao(
  docId: string,
  campos: readonly string[],
  lancs: Lancs,
  mes: string,
  unidade: UnidadeId,
  hoje: string,
  /** Produção do mesmo mês do ano anterior (colunas "ano anterior"); só entra se esse mês estiver completo. */
  anoAnterior?: Lancs,
): PreenchimentoProducao {
  const situacao = situacaoProducaoMes(lancs, mes, unidade, hoje);
  const valores: Record<string, number> = {};
  const avisos: string[] = [];
  const aplicar = (fontes: Record<string, Fonte>, l: Lancs, quando: string) => {
    const soma = somarItens(l);
    const semNatureza = l.flatMap((x) => x.taloes).filter((t) => !t.natureza).length;
    let pulou = false;
    for (const campo of campos) {
      const f = fontes[campo];
      if (!f) continue;
      if (f.natureza && semNatureza) pulou = true;
      else valores[campo] = f.calc(soma, l);
    }
    if (pulou) avisos.push(`${semNatureza} flagrante(s) ${quando} sem a natureza da ocorrência: os flagrantes de tráfico e outros não foram pré-preenchidos.`);
  };
  if (situacao.completa) aplicar(DA_PRODUCAO[docId] ?? {}, lancs, 'do mês');
  const fontesAnt = DA_PRODUCAO_ANO_ANTERIOR[docId];
  if (fontesAnt && anoAnterior && situacaoProducaoMes(anoAnterior, somarMeses(mes, -12), unidade, hoje).completa)
    aplicar(fontesAnt, anoAnterior, 'do mesmo mês do ano anterior');
  return { ...situacao, valores, avisos };
}

/** Campos em que o envio ficou diferente do que veio da produção. */
export function divergencias(daProducao: Record<string, number> | undefined, valores: Record<string, unknown>): string[] {
  if (!daProducao) return [];
  return Object.keys(daProducao).filter((c) => Number(valores[c]) !== daProducao[c]);
}

// ---------- RAC ----------

/**
 * Produtividade mensal do RAC tirada da produção: a tabela por pelotão (Pel A–D; na FT, Pel A e B) e os itens que
 * a Cia digita à parte. Ronda Escolar e RPM entram no resultado do pelotão na produção, então as colunas RE e RPM
 * vêm com 0 (a Cia ajusta se separar). Só com a produção do mês completa; só nos campos ainda vazios.
 * Devolve o RAC preenchido e o valor de cada campo que veio da produção (para mostrar o que a Cia mudou).
 */
export function racDaProducao(
  d: RacDados,
  lancs: Lancs,
  hoje: string,
  /** Produção do mês anterior e do mesmo mês do ano anterior (colunas de comparação); só entram se completas. */
  comparar: { mesAnterior?: Lancs; anoAnterior?: Lancs } = {},
): SituacaoProducaoMes & { rac: RacDados; daProducao: Record<string, number> } {
  const daProducao: Record<string, number> = {};
  if (d.unidade === 'btl') return { completa: false, pendencias: [], turnosFaltando: 0, rac: d, daProducao };
  const u = d.unidade;
  const situacao = situacaoProducaoMes(lancs, d.mes, u, hoje);
  if (situacao.completa) {
    const somaPel = (pel: string) => somarItens(lancs.filter((l) => l.pelotao === pel));
    const total = somarItens(lancs);
    for (const l of linhasPelotao(u))
      for (const c of colunasPelotao(u)) daProducao[`pelotoes.${l.id}.${c.id}`] = c.id === 're' || c.id === 'rpm' ? 0 : somaPel(c.id)[l.id];
    for (const id of prodDigitadaAParte(u)) daProducao[`producao.${id}.atual`] = total[id];
  }
  for (const [coluna, l, mes] of [
    ['mesAnterior', comparar.mesAnterior, somarMeses(d.mes, -1)],
    ['anoAnterior', comparar.anoAnterior, somarMeses(d.mes, -12)],
  ] as const) {
    if (!l || !situacaoProducaoMes(l, mes, u, hoje).completa) continue;
    const total = somarItens(l);
    for (const p of PRODUTIVIDADE) daProducao[`producao.${p.id}.${coluna}`] = total[p.id];
  }
  let rac = d;
  for (const [campo, v] of Object.entries(daProducao)) if (valorDoCampo(rac, campo) === null) rac = comCampo(rac, campo, v);
  return { ...situacao, rac, daProducao };
}

// ---------- ICC → Plano Diretor ----------

/**
 * Policiais da Cia que participaram da ICC no mês: soma das respostas da Cia às ICC com prazo naquele mês.
 * null = não houve ICC no mês (ou a Cia não respondeu): o campo fica para a Cia preencher.
 */
export function iccDoMes(
  iccs: readonly { id: string; prazo: string }[],
  respostas: readonly ({ iccId: string } & Record<'oficiais' | 'sargentos' | 'cabos', number>)[],
  mes: string,
): number | null {
  const doMes = new Set(iccs.filter((i) => i.prazo.slice(0, 7) === mes).map((i) => i.id));
  const r = respostas.filter((x) => doMes.has(x.iccId));
  return r.length ? r.reduce((s, x) => s + (x.oficiais || 0) + (x.sargentos || 0) + (x.cabos || 0), 0) : null;
}
