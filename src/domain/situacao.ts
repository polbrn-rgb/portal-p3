import type { Demanda } from './demanda';
import type { Andamento } from './encaminhamento';
import { siglaDoDestino, unidadesParaEncaminhar } from './unidades';

// Os status da planilha que dependem da data são calculados na hora, não gravados.
export type Situacao = 'concluido' | 'atrasado' | 'vence_hoje' | 'cia_atrasada' | 'respondida' | 'em_aberto';

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  concluido: 'Concluído',
  atrasado: 'Atrasado',
  vence_hoje: 'Vence Hoje',
  cia_atrasada: 'Cia Atrasada',
  respondida: 'Cias responderam',
  em_aberto: 'Em aberto',
};

type BaseSituacao = Pick<Demanda, 'status' | 'prazoCPA' | 'prazoCia'> & Partial<Pick<Demanda, 'destinos' | 'ciasAceitas'>>;

/** Quantas Cias a demanda tem e quantas já responderam (resposta enviada ou aceita). */
export function contarRespostas(d: BaseSituacao, andamento: Andamento): { total: number; responderam: number } {
  const unidades = unidadesParaEncaminhar(d.destinos ?? []);
  const aceitas = (d.ciasAceitas ?? []).filter((u) => unidades.includes(u)).length;
  return { total: unidades.length, responderam: Math.min(unidades.length, andamento.respondidas + aceitas) };
}

/**
 * Prioridade: Concluído > Atrasado > Vence Hoje > Cia Atrasada > Cias responderam > Em aberto.
 * `andamento`: respostas das Cias (sem a informação, vale só o prazo).
 * "Cias responderam" só aparece quando TODAS as Cias da demanda enviaram resposta (ou tiveram aceite).
 */
export function situacaoDaDemanda(d: BaseSituacao, hoje: string, andamento?: Andamento): Situacao {
  if (d.status === 'concluido') return 'concluido';
  if (d.prazoCPA && d.prazoCPA < hoje) return 'atrasado';
  if (d.prazoCPA && d.prazoCPA === hoje) return 'vence_hoje';
  const respostas = andamento ? contarRespostas(d, andamento) : undefined;
  const todasResponderam = !!respostas && respostas.total > 0 && andamento!.pendentes === 0 && respostas.responderam >= respostas.total;
  if (!todasResponderam && d.prazoCia && d.prazoCia < hoje) return 'cia_atrasada';
  if (todasResponderam) return 'respondida';
  return 'em_aberto';
}

export function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Busca por número, assunto, nº de origem/saída, responsável, categoria e destino (sem acento). */
export function filtrarDemandas<T extends Demanda>(
  lista: readonly T[],
  texto: string,
  situacao: Situacao | 'todas',
  hoje: string,
  andamentoDe: (d: T) => Andamento | undefined = () => undefined,
): T[] {
  const termo = normalizarTexto(texto.trim());
  return lista.filter((d) => {
    if (situacao !== 'todas' && situacaoDaDemanda(d, hoje, andamentoDe(d)) !== situacao) return false;
    if (!termo) return true;
    const alvo = [
      String(d.numero),
      d.saida,
      d.numeroOrigem,
      d.numeroSaida,
      d.responsavel,
      d.categoria,
      d.tipoSaida,
      ...d.destinos.map(siglaDoDestino),
    ].join(' ');
    return normalizarTexto(alvo).includes(termo);
  });
}
