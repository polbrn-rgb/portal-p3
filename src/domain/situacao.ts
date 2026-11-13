import type { Demanda } from './demanda';
import { siglaDoDestino } from './unidades';

// Os status da planilha que dependem da data são calculados na hora, não gravados.
export type Situacao = 'concluido' | 'atrasado' | 'vence_hoje' | 'cia_atrasada' | 'em_aberto';

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  concluido: 'Concluído',
  atrasado: 'Atrasado',
  vence_hoje: 'Vence Hoje',
  cia_atrasada: 'Cia Atrasada',
  em_aberto: 'Em aberto',
};

/** Prioridade: Concluído > Atrasado > Vence Hoje > Cia Atrasada > Em aberto. */
export function situacaoDaDemanda(
  d: Pick<Demanda, 'status' | 'prazoCPA' | 'prazoCia'>,
  hoje: string,
): Situacao {
  if (d.status === 'concluido') return 'concluido';
  if (d.prazoCPA && d.prazoCPA < hoje) return 'atrasado';
  if (d.prazoCPA && d.prazoCPA === hoje) return 'vence_hoje';
  if (d.prazoCia && d.prazoCia < hoje) return 'cia_atrasada';
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
): T[] {
  const termo = normalizarTexto(texto.trim());
  return lista.filter((d) => {
    if (situacao !== 'todas' && situacaoDaDemanda(d, hoje) !== situacao) return false;
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
