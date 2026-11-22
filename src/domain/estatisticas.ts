import type { Demanda } from './demanda';
import type { Andamento } from './encaminhamento';
import { ROTULO_SITUACAO, situacaoDaDemanda, type Situacao } from './situacao';

// Painel estatístico (o "Dashboard" do numerador antigo), calculado das demandas do ano.

export type Barra = { rotulo: string; valor: number };

/** Só o que o painel usa de cada demanda (é o que fica guardado no aparelho). */
export const CAMPOS_ESTATISTICA = [
  'numero',
  'dataEntrada',
  'status',
  'prazoCPA',
  'prazoCia',
  'destinos',
  'ciasAceitas',
  'responsavel',
  'categoria',
  'tipoSaida',
] as const;

export type DemandaEstatistica = Pick<Demanda, 'id' | 'numero' | 'dataEntrada' | 'status' | 'prazoCPA' | 'prazoCia' | 'responsavel' | 'categoria' | 'tipoSaida'> &
  Partial<Pick<Demanda, 'destinos' | 'ciasAceitas'>>;

export function resumoEstatistico(d: Demanda): DemandaEstatistica {
  const r: Record<string, unknown> = { id: d.id };
  for (const c of CAMPOS_ESTATISTICA) if (d[c] !== undefined) r[c] = d[c];
  return r as DemandaEstatistica;
}

/** É do ano pela data de entrada (o mesmo critério da busca no banco). */
export function ehDoAno(d: Pick<Demanda, 'dataEntrada'>, ano: number): boolean {
  return typeof d.dataEntrada === 'string' && d.dataEntrada >= `${ano}-01-01` && d.dataEntrada <= `${ano}-12-31`;
}

/**
 * Junta à lista guardada as demandas que mudaram desde a última vez: troca as que já estavam,
 * acrescenta as novas e tira as que deixaram de ser do ano (data de entrada editada).
 */
export function juntarMudancas(
  guardada: readonly DemandaEstatistica[],
  mudadas: readonly DemandaEstatistica[],
  ano: number,
): DemandaEstatistica[] {
  const porId = new Map(guardada.map((d) => [d.id, d]));
  for (const d of mudadas) {
    if (ehDoAno(d, ano)) porId.set(d.id, d);
    else porId.delete(d.id);
  }
  return [...porId.values()];
}

export type Estatisticas = {
  total: number;
  doMes: number;
  emAberto: number;
  venceHoje: number;
  atrasadas: number;
  porStatus: Barra[];
  porMes: Barra[];
  porDiaSemana: Barra[];
  porResponsavel: Barra[];
  porCategoria: Barra[];
  porTipoSaida: Barra[];
};

export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const ORDEM_STATUS: Situacao[] = ['concluido', 'em_aberto', 'respondida', 'vence_hoje', 'cia_atrasada', 'atrasado'];

/** Conta por um campo de texto, do maior para o menor (empate: ordem alfabética). Vazio vira "Não informado". */
function contar(lista: readonly DemandaEstatistica[], campo: (d: DemandaEstatistica) => string): Barra[] {
  const c = new Map<string, number>();
  for (const d of lista) {
    const k = campo(d).trim() || 'Não informado';
    c.set(k, (c.get(k) ?? 0) + 1);
  }
  return [...c.entries()]
    .map(([rotulo, valor]) => ({ rotulo, valor }))
    .sort((a, b) => b.valor - a.valor || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

export function montarEstatisticas(
  demandas: readonly DemandaEstatistica[],
  hoje: string,
  andamentoDe: (d: DemandaEstatistica) => Andamento | undefined = () => undefined,
): Estatisticas {
  const lista = demandas.filter((d) => d.status !== 'excluido');
  const mesAtual = hoje.slice(0, 7);
  const porMes = MESES.map((rotulo) => ({ rotulo, valor: 0 }));
  const porDia = DIAS_SEMANA.map((rotulo) => ({ rotulo, valor: 0 }));
  const status = new Map<Situacao, number>();

  for (const d of lista) {
    const [a, m, dia] = d.dataEntrada.split('-').map(Number);
    if (a && m && dia) {
      porMes[m - 1].valor++;
      porDia[new Date(a, m - 1, dia).getDay()].valor++;
    }
    const s = situacaoDaDemanda(d, hoje, andamentoDe(d));
    status.set(s, (status.get(s) ?? 0) + 1);
  }

  return {
    total: lista.length,
    doMes: lista.filter((d) => d.dataEntrada.startsWith(mesAtual)).length,
    emAberto: lista.filter((d) => d.status !== 'concluido').length,
    venceHoje: status.get('vence_hoje') ?? 0,
    atrasadas: status.get('atrasado') ?? 0,
    porStatus: ORDEM_STATUS.filter((s) => status.get(s)).map((s) => ({ rotulo: ROTULO_SITUACAO[s], valor: status.get(s)! })),
    porMes,
    porDiaSemana: porDia,
    porResponsavel: contar(lista, (d) => d.responsavel),
    porCategoria: contar(lista, (d) => d.categoria),
    porTipoSaida: contar(lista, (d) => d.tipoSaida),
  };
}
