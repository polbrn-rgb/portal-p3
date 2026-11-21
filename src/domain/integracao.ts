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
import { colunasPelotao, comCampo, linhasPelotao, prodDigitadaAParte, valorDoCampo, type RacDados } from './rac';
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
export function preencherDaProducao(docId: string, campos: readonly string[], lancs: Lancs, mes: string, unidade: UnidadeId, hoje: string): PreenchimentoProducao {
  const situacao = situacaoProducaoMes(lancs, mes, unidade, hoje);
  const fontes = DA_PRODUCAO[docId] ?? {};
  const valores: Record<string, number> = {};
  const avisos: string[] = [];
  if (!situacao.completa) return { ...situacao, valores, avisos };
  const soma = somarItens(lancs);
  const semNatureza = lancs.flatMap((l) => l.taloes).filter((t) => !t.natureza).length;
  let pulouNatureza = false;
  for (const campo of campos) {
    const f = fontes[campo];
    if (!f) continue;
    if (f.natureza && semNatureza) {
      pulouNatureza = true;
      continue;
    }
    valores[campo] = f.calc(soma, lancs);
  }
  if (pulouNatureza)
    avisos.push(`${semNatureza} flagrante(s) do mês sem a natureza da ocorrência: os flagrantes de tráfico e outros não foram pré-preenchidos.`);
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
): SituacaoProducaoMes & { rac: RacDados; daProducao: Record<string, number> } {
  const daProducao: Record<string, number> = {};
  if (d.unidade === 'btl') return { completa: false, pendencias: [], turnosFaltando: 0, rac: d, daProducao };
  const u = d.unidade;
  const situacao = situacaoProducaoMes(lancs, d.mes, u, hoje);
  if (!situacao.completa) return { ...situacao, rac: d, daProducao };
  const somaPel = (pel: string) => somarItens(lancs.filter((l) => l.pelotao === pel));
  const total = somarItens(lancs);
  for (const l of linhasPelotao(u))
    for (const c of colunasPelotao(u)) daProducao[`pelotoes.${l.id}.${c.id}`] = c.id === 're' || c.id === 'rpm' ? 0 : somaPel(c.id)[l.id];
  for (const id of prodDigitadaAParte(u)) daProducao[`producao.${id}.atual`] = total[id];
  let rac = d;
  for (const [campo, v] of Object.entries(daProducao)) if (valorDoCampo(rac, campo) === null) rac = comCampo(rac, campo, v);
  return { ...situacao, rac, daProducao };
}
