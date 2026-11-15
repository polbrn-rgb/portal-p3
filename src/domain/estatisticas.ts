import type { Demanda } from './demanda';
import type { Andamento } from './encaminhamento';
import { ROTULO_SITUACAO, situacaoDaDemanda, type Situacao } from './situacao';

// Painel estatístico (o "Dashboard" do numerador antigo), calculado das demandas do ano.

export type Barra = { rotulo: string; valor: number };

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
function contar(lista: readonly Demanda[], campo: (d: Demanda) => string): Barra[] {
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
  demandas: readonly Demanda[],
  hoje: string,
  andamentoDe: (d: Demanda) => Andamento | undefined = () => undefined,
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
