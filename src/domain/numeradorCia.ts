// Numerador de cada Cia e da Força Tática.
// Igual ao da P/3 no formato do número, mas NÃO distribui para ninguém: cada página cria as suas próprias
// demandas e o prazo vai direto para a agenda dela (agendaSetores, dono = a Cia).
//
// Número: "OFÍCIO 8BPMM-001/103/27"
//   001 = sequência do tipo de saída no ano (volta para 001 todo ano)
//   103 = nº da seção: 1ª Cia 103, 2ª Cia 203 … 6ª Cia 603, Força Tática 703
//   27  = ano da data de entrada
// O contador de cada Cia/tipo/ano fica em "contadoresCia/{cia}_{ano}_{TIPO}" e é criado sozinho no 1º uso.
import { ehDataISO } from './datas';
import { PREFIXO_DOCUMENTO, anoDe, slugTipo } from './numeracao';
import type { UnidadeId } from './unidades';

export const COLECAO_DEMANDAS_CIA = 'demandasCia';
export const COLECAO_CONTADORES_CIA = 'contadoresCia';

export const SECAO_DA_UNIDADE: Record<UnidadeId, string> = {
  '1cia': '103',
  '2cia': '203',
  '3cia': '303',
  '4cia': '403',
  '5cia': '503',
  '6cia': '603',
  ft: '703',
};

export type StatusDemandaCia = 'em_aberto' | 'concluida';
export const ROTULO_STATUS_CIA: Record<StatusDemandaCia, string> = {
  em_aberto: 'Em aberto',
  concluida: 'Concluída',
};

export type DadosDemandaCia = {
  dataEntrada: string;
  tipoSaida: string;
  /** Assunto / o que a Cia vai fazer. */
  saida: string;
  origem: string;
  numeroOrigem: string;
  /** Prazo: vira evento na agenda da Cia. */
  prazo: string;
  responsavel: string;
  observacao: string;
};

export type DemandaCia = DadosDemandaCia & {
  id: string;
  unidadeId: UnidadeId;
  ano: number;
  sequencia: number;
  numeroDocumento: string;
  status: StatusDemandaCia;
  /** Evento do prazo na agenda da Cia ('' = sem prazo). */
  agendaId: string;
  criadoPor: string;
};

export type ErrosDemandaCia = Partial<Record<keyof DadosDemandaCia, string>>;

export const LIMITE_SAIDA = 200;
export const LIMITE_OBSERVACAO = 5000;

export function demandaCiaVazia(hoje: string): DadosDemandaCia {
  return {
    dataEntrada: hoje,
    tipoSaida: 'OFÍCIO',
    saida: '',
    origem: '',
    numeroOrigem: '',
    prazo: '',
    responsavel: '',
    observacao: '',
  };
}

export function normalizarDemandaCia(d: DadosDemandaCia): DadosDemandaCia {
  return {
    dataEntrada: d.dataEntrada,
    tipoSaida: d.tipoSaida.trim(),
    saida: d.saida.trim(),
    origem: d.origem.trim(),
    numeroOrigem: d.numeroOrigem.trim(),
    prazo: d.prazo,
    responsavel: d.responsavel.trim(),
    observacao: d.observacao.trim(),
  };
}

export function validarDemandaCia(bruto: DadosDemandaCia): ErrosDemandaCia {
  const d = normalizarDemandaCia(bruto);
  const e: ErrosDemandaCia = {};
  if (!ehDataISO(d.dataEntrada)) e.dataEntrada = 'Informe a data de entrada.';
  if (!d.tipoSaida) e.tipoSaida = 'Escolha o tipo de saída.';
  if (!d.saida) e.saida = 'Informe o assunto.';
  else if (d.saida.length > LIMITE_SAIDA) e.saida = `O assunto pode ter até ${LIMITE_SAIDA} caracteres.`;
  if (d.prazo && !ehDataISO(d.prazo)) e.prazo = 'Data inválida.';
  else if (d.prazo && !e.dataEntrada && d.prazo < d.dataEntrada) e.prazo = 'O prazo não pode ser antes da entrada.';
  if (d.observacao.length > LIMITE_OBSERVACAO) e.observacao = `A observação pode ter até ${LIMITE_OBSERVACAO} caracteres.`;
  return e;
}

export function idContadorCia(unidade: UnidadeId, ano: number, tipo: string): string {
  return `${unidade}_${ano}_${slugTipo(tipo)}`;
}

/** OFÍCIO, 1ª Cia, 1, 2027-03-10 -> "OFÍCIO 8BPMM-001/103/27". */
export function formatarNumeroCia(tipo: string, unidade: UnidadeId, sequencia: number, dataEntrada: string): string {
  const ano = dataEntrada.slice(2, 4);
  return `${tipo} ${PREFIXO_DOCUMENTO}${String(sequencia).padStart(3, '0')}/${SECAO_DA_UNIDADE[unidade]}/${ano}`;
}

export { anoDe };

/** Título do evento de prazo na agenda da Cia. */
export function tituloDoPrazo(numeroDocumento: string, saida: string): string {
  return `Prazo · ${numeroDocumento} — ${saida}`.slice(0, 200);
}

/** Mais nova primeiro (ano, depois data de entrada, depois sequência). */
export function ordenarDemandasCia(lista: DemandaCia[]): DemandaCia[] {
  return [...lista].sort(
    (a, b) => b.dataEntrada.localeCompare(a.dataEntrada) || b.ano - a.ano || b.sequencia - a.sequencia,
  );
}

export function atrasadaCia(d: Pick<DemandaCia, 'prazo' | 'status'>, hoje: string): boolean {
  return d.status === 'em_aberto' && !!d.prazo && d.prazo < hoje;
}

/** Campos que a Cia pode mudar depois (o número não muda). */
export function camposAlteradosCia(a: DadosDemandaCia, b: DadosDemandaCia): (keyof DadosDemandaCia)[] {
  return (Object.keys(a) as (keyof DadosDemandaCia)[]).filter((k) => a[k] !== b[k]);
}

export function dadosDaDemandaCia(d: DemandaCia): DadosDemandaCia {
  const { dataEntrada, tipoSaida, saida, origem, numeroOrigem, prazo, responsavel, observacao } = d;
  return { dataEntrada, tipoSaida, saida, origem, numeroOrigem, prazo, responsavel, observacao };
}
