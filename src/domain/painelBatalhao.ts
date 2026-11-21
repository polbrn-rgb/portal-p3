// Painel → Estatístico do Batalhão: a produção dos pelotões de todas as Cias, ao vivo (cada lançamento da Sala de
// Operações já aparece). Os números do mês até hoje são comparados com os mesmos dias do mês anterior.
import { diasDoMes, NATUREZAS_FLAGRANTE, somarItens, totalDrogasKg, type Itens, type Producao } from './producao';
import { situacaoProducaoMes } from './integracao';
import { somarMeses, variacao } from './rac';
import { UNIDADES, type UnidadeId } from './unidades';

export type Barra = { rotulo: string; valor: number };

/** Os números que o comando acompanha (cada um é uma conta sobre os itens da produção). */
export const INDICADORES_PAINEL = [
  { id: 'abordados', rotulo: 'Pessoas abordadas', valor: (i: Itens) => i.pessoasAbordadas },
  { id: 'veiculos', rotulo: 'Veículos vistoriados (carros e motos)', valor: (i: Itens) => i.veiculosVistoriados + i.motosVistoriadas },
  { id: 'presos', rotulo: 'Presos (flagrante e mandado)', valor: (i: Itens) => i.flagrante + i.procurados },
  { id: 'adolescentes', rotulo: 'Adolescentes apreendidos', valor: (i: Itens) => i.atosInfracionais },
  { id: 'armas', rotulo: 'Armas de fogo apreendidas', valor: (i: Itens) => i.armas },
  { id: 'drogas', rotulo: 'Entorpecentes (kg)', valor: (i: Itens) => totalDrogasKg(i), decimal: true },
  { id: 'recuperados', rotulo: 'Veículos recuperados', valor: (i: Itens) => i.veiculosRecuperados },
  { id: 'autuacoes', rotulo: 'Autuações de trânsito (AIT, AI e TRV)', valor: (i: Itens) => i.ait + i.ai + i.trv },
  {
    id: 'removidos',
    rotulo: 'Veículos removidos ao pátio',
    valor: (i: Itens) => i.carrosRemovidos + i.motosRemovidas + i.caminhoesRemovidos + i.cicloRem + i.bikeRem + i.autoRem,
  },
  { id: 'ocorrencias', rotulo: 'Ocorrências atendidas', valor: (i: Itens) => i.ocorrencias },
] as const satisfies readonly { id: string; rotulo: string; valor: (i: Itens) => number; decimal?: boolean }[];
export type IndicadorPainelId = (typeof INDICADORES_PAINEL)[number]['id'];

const arred = (v: number) => Math.round(v * 1000) / 1000;
const ind = (id: IndicadorPainelId) => INDICADORES_PAINEL.find((x) => x.id === id)!;
export const ehDecimalPainel = (id: IndicadorPainelId) => 'decimal' in ind(id);

export type TotalPainel = { id: IndicadorPainelId; rotulo: string; atual: number; anterior: number; variacao: number | null };
export type CoberturaCia = { unidadeId: UnidadeId; lancamentos: number; turnosFaltando: number };

export type PainelBatalhao = {
  mes: string;
  /** Dias do mês considerados (até hoje no mês corrente; o mês todo nos meses passados). */
  ateDia: number;
  totais: TotalPainel[];
  flagrantes: { atual: number; anterior: number; variacao: number | null };
  naturezas: Barra[];
  cobertura: CoberturaCia[];
  lancamentos: number;
  ultimoLancamento: Date | null;
};

/** Até que dia do mês comparar: hoje no mês corrente; o último dia nos meses passados; 0 no futuro. */
export function diasConsiderados(mes: string, hoje: string): number {
  const dias = diasDoMes(mes);
  if (hoje.slice(0, 7) > mes) return dias.length;
  if (hoje.slice(0, 7) < mes) return 0;
  return Number(hoje.slice(8, 10));
}

const ateODia = (lancs: readonly Producao[], dia: number) => lancs.filter((l) => Number(l.data.slice(8, 10)) <= dia);

/** O painel do mês: totais do Batalhão (com o mesmo período do mês anterior), flagrantes por natureza e quem está em dia. */
export function montarPainelBatalhao(doMes: readonly Producao[], doMesAnterior: readonly Producao[], mes: string, hoje: string): PainelBatalhao {
  const ateDia = diasConsiderados(mes, hoje);
  const atual = ateODia(doMes, ateDia);
  const anterior = ateODia(doMesAnterior, Math.min(ateDia, diasDoMes(somarMeses(mes, -1)).length));
  const sa = somarItens(atual);
  const sb = somarItens(anterior);
  const totais = INDICADORES_PAINEL.map((i) => {
    const a = arred(i.valor(sa));
    const b = arred(i.valor(sb));
    return { id: i.id, rotulo: i.rotulo, atual: a, anterior: b, variacao: variacao(b, a) };
  });
  const tA = atual.flatMap((l) => l.taloes);
  const tB = anterior.flatMap((l) => l.taloes);
  const naturezas = [
    ...NATUREZAS_FLAGRANTE.map((n) => ({ rotulo: n.rotulo, valor: tA.filter((t) => t.natureza === n.id).length })),
    { rotulo: 'Sem natureza informada', valor: tA.filter((t) => !t.natureza).length },
  ]
    .filter((b) => b.valor > 0)
    .sort((x, y) => y.valor - x.valor);
  const cobertura = UNIDADES.map((u) => {
    const l = doMes.filter((x) => x.unidadeId === u.id);
    return { unidadeId: u.id, lancamentos: l.length, turnosFaltando: ateDia ? situacaoProducaoMes(l, mes, u.id, hoje).turnosFaltando : 0 };
  });
  const datas = doMes.map((l) => l.atualizadoEm ?? l.lancadoEm).filter((d): d is Date => !!d);
  return {
    mes,
    ateDia,
    totais,
    flagrantes: { atual: tA.length, anterior: tB.length, variacao: variacao(tB.length, tA.length) },
    naturezas,
    cobertura,
    lancamentos: atual.length,
    ultimoLancamento: datas.length ? new Date(Math.max(...datas.map((d) => d.getTime()))) : null,
  };
}

/** Um indicador dia a dia (1 até o último dia do mês). */
export function porDia(doMes: readonly Producao[], mes: string, id: IndicadorPainelId): Barra[] {
  const f = ind(id).valor;
  return diasDoMes(mes).map((data) => ({ rotulo: data.slice(8, 10), valor: arred(f(somarItens(doMes.filter((l) => l.data === data)))) }));
}

/** Um indicador por Cia no período considerado. */
export function porCia(doMes: readonly Producao[], mes: string, hoje: string, id: IndicadorPainelId): Barra[] {
  const f = ind(id).valor;
  const atual = ateODia(doMes, diasConsiderados(mes, hoje));
  return UNIDADES.map((u) => ({ rotulo: u.sigla, valor: arred(f(somarItens(atual.filter((l) => l.unidadeId === u.id)))) }));
}
