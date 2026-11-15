import { ehDataISO, formatarData, hojeISO } from './datas';

// Operações → Controle de Operações: o registro das operações do ano (antiga aba "Operações" do numerador)
// e o pedido do Relatório de Indicadores, que o motor (Apps Script) gera em Word a partir do modelo.

export type DadosControle = {
  nome: string;
  inicio: string;
  termino: string;
  objetivo: string;
  ordem: string;
  origem: string;
  opm: string;
  observacao: string;
};

export type OperacaoControle = DadosControle & { id: string; fonte: 'planilha' | 'portal'; excluida?: boolean };

export const OPM_PADRAO = '8º BPM/M';
export const PREFIXO_RELATORIO = '8BPMM-';
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

export function controleVazio(): DadosControle {
  return { nome: '', inicio: '', termino: '', objetivo: '', ordem: '', origem: '', opm: OPM_PADRAO, observacao: '' };
}

/** Mesmo id do motor (idControleOperacao no Logica.gs): a operação nunca entra duas vezes. */
export function idControleOperacao(nome: string, inicio: string): string {
  const slug = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${inicio || 'sem-data'}_${slug || 'operacao'}`;
}

export type ErrosControle = Partial<Record<'nome' | 'inicio' | 'termino', string>>;

export function validarControle(d: DadosControle): ErrosControle {
  const e: ErrosControle = {};
  if (!d.nome.trim()) e.nome = 'Informe o nome da operação.';
  if (!ehDataISO(d.inicio)) e.inicio = 'Informe a data de início.';
  if (d.termino && !ehDataISO(d.termino)) e.termino = 'Data inválida.';
  else if (d.termino && ehDataISO(d.inicio) && d.termino < d.inicio) e.termino = 'O término não pode ser antes do início.';
  return e;
}

/** A operação aparece no relatório do mês "AAAA-MM" quando cruza com ele (igual ao script antigo). */
export function cruzaMes(o: Pick<DadosControle, 'inicio' | 'termino'>, mes: string): boolean {
  const ini = `${mes}-01`;
  const fim = `${mes}-31`;
  return !!o.inicio && o.inicio <= fim && !(o.termino && o.termino < ini);
}

export function mesDe(iso: string): string {
  return iso.slice(0, 7);
}

/** Mês de referência sugerido: o mês passado. */
export function mesAnterior(hoje = hojeISO()): string {
  const [a, m] = hoje.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

/** "2026-10" -> "OUT/2026" */
export function rotuloMes(mes: string): string {
  const [a, m] = mes.split('-');
  return MESES[Number(m) - 1] ? `${MESES[Number(m) - 1]}/${a}` : mes;
}

export function periodoControle(o: Pick<DadosControle, 'inicio' | 'termino'>): string {
  if (!o.termino) return `A partir de ${formatarData(o.inicio)}`;
  if (o.termino === o.inicio) return formatarData(o.inicio);
  return `${formatarData(o.inicio)} a ${formatarData(o.termino)}`;
}

/** As do mês (ou todas), da mais recente para a mais antiga. */
export function filtrarControle(lista: OperacaoControle[], mes: string | null): OperacaoControle[] {
  return lista
    .filter((o) => !o.excluida && (!mes || cruzaMes(o, mes)))
    .sort((a, b) => (a.inicio === b.inicio ? a.nome.localeCompare(b.nome) : a.inicio < b.inicio ? 1 : -1));
}

export type PedidoRelatorio = { mes: string; numero: string };
export type ErrosRelatorio = Partial<Record<'mes' | 'numero', string>>;

export function validarPedidoRelatorio(p: PedidoRelatorio): ErrosRelatorio {
  const e: ErrosRelatorio = {};
  if (!/^\d{4}-\d{2}$/.test(p.mes)) e.mes = 'Escolha o mês de referência.';
  if (!p.numero.trim()) e.numero = 'Informe o número do relatório (ex.: 2085/03/26).';
  return e;
}

export type StatusRelatorio = 'pedido' | 'pronto' | 'erro';
export type Relatorio = PedidoRelatorio & {
  id: string;
  status: StatusRelatorio;
  url?: string;
  qtdOperacoes?: number;
  erro?: string;
  pedidoEm: Date | null;
};
