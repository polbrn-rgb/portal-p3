import type { Demanda } from './demanda';
import { unidadesParaEncaminhar, type UnidadeId } from './unidades';

export type StatusEnc = 'novo' | 'visualizado' | 'em_andamento' | 'respondido' | 'aceito' | 'devolvido' | 'cancelado';

/** Ainda depende da Cia. */
export const STATUS_PENDENTES: readonly StatusEnc[] = ['novo', 'visualizado', 'em_andamento', 'devolvido'];

export const ROTULO_ENC: Record<StatusEnc, string> = {
  novo: 'Novo',
  visualizado: 'Visualizado',
  em_andamento: 'Em andamento',
  respondido: 'Respondido',
  aceito: 'Aceito',
  devolvido: 'Devolvido',
  cancelado: 'Cancelado',
};

// O que a Cia precisa ver da demanda (copiado para o encaminhamento: a Cia nunca lê a demanda).
export type ResumoEnc = {
  numero: number;
  saida: string;
  categoria: string;
  tipoSaida: string;
  origem: string;
  numeroOrigem: string;
  prazoCia: string;
  // A observação da demanda NÃO vai para as Cias: é informação só da P/3.
  numeroDocumento?: string;
  /** PDF da demanda para a Cia baixar (enquanto a demanda não é finalizada). */
  arquivoId?: string;
  arquivoNome?: string;
};

export type Encaminhamento = ResumoEnc & {
  id: string;
  demandaId: string;
  unidadeId: UnidadeId;
  status: StatusEnc;
  resposta: string;
  respondidoPor: string;
  motivoDevolucao: string;
  /** Última mudança (Timestamp do Firestore); serve para saber quando foi finalizado. */
  atualizadoEm?: { toDate: () => Date } | null;
};

type BaseResumo = Pick<
  Demanda,
  'numero' | 'saida' | 'categoria' | 'tipoSaida' | 'origem' | 'numeroOrigem' | 'prazoCia' | 'prazoCPA'
> & { numeroDocumento?: string; arquivoId?: string; arquivoNome?: string };

export function idEncaminhamento(demandaId: string, unidadeId: UnidadeId): string {
  return `${demandaId}_${unidadeId}`;
}

/** Sem prazo próprio da Cia, vale o prazo do CPA. */
export function resumoDaDemanda(d: BaseResumo): ResumoEnc {
  return {
    numero: d.numero,
    saida: d.saida,
    categoria: d.categoria,
    tipoSaida: d.tipoSaida,
    origem: d.origem,
    numeroOrigem: d.numeroOrigem,
    prazoCia: d.prazoCia || d.prazoCPA,
    ...(d.numeroDocumento ? { numeroDocumento: d.numeroDocumento } : {}),
    ...(d.arquivoId ? { arquivoId: d.arquivoId, arquivoNome: d.arquivoNome ?? 'documento.pdf' } : {}),
  };
}

export function novoEncaminhamento(demandaId: string, unidadeId: UnidadeId, resumo: ResumoEnc) {
  return {
    ...resumo,
    demandaId,
    unidadeId,
    status: 'novo' as StatusEnc,
    resposta: '',
    respondidoPor: '',
    motivoDevolucao: '',
  };
}

export type PlanoEnc = {
  criar: UnidadeId[];
  cancelar: string[];
  reativar: string[];
  atualizarResumo: string[];
};

function mudouResumo(e: ResumoEnc, r: ResumoEnc): boolean {
  // Encaminhamento antigo ainda com a observação: atualiza para tirá-la.
  return 'observacao' in e || (Object.keys(r) as (keyof ResumoEnc)[]).some((k) => e[k] !== r[k]);
}

/**
 * Compara os destinos da demanda com os encaminhamentos que já existem:
 * Cia nova recebe encaminhamento; Cia retirada tem o dela cancelado; Cia que volta é reativada;
 * mudança no assunto/prazo é copiada para quem continua.
 */
export function planejarEncaminhamentos(d: BaseResumo & Pick<Demanda, 'destinos'>, existentes: readonly Encaminhamento[]): PlanoEnc {
  const alvo = new Set<UnidadeId>(unidadesParaEncaminhar(d.destinos));
  const resumo = resumoDaDemanda(d);
  const jaTem = new Set(existentes.map((e) => e.unidadeId));
  return {
    criar: [...alvo].filter((u) => !jaTem.has(u)),
    cancelar: existentes.filter((e) => !alvo.has(e.unidadeId) && e.status !== 'cancelado').map((e) => e.id),
    reativar: existentes.filter((e) => alvo.has(e.unidadeId) && e.status === 'cancelado').map((e) => e.id),
    atualizarResumo: existentes
      .filter((e) => alvo.has(e.unidadeId) && e.status !== 'cancelado' && mudouResumo(e, resumo))
      .map((e) => e.id),
  };
}

export type Andamento = { pendentes: number; respondidas: number };

/** Por demanda: quantas Cias ainda devem resposta e quantas responderam aguardando aceite. */
export function andamentoPorDemanda(abertos: readonly Pick<Encaminhamento, 'demandaId' | 'status'>[]): Record<string, Andamento> {
  const r: Record<string, Andamento> = {};
  for (const e of abertos) {
    const a = (r[e.demandaId] ??= { pendentes: 0, respondidas: 0 });
    if (STATUS_PENDENTES.includes(e.status)) a.pendentes++;
    else if (e.status === 'respondido') a.respondidas++;
  }
  return r;
}

/** Visão da Cia: atrasado = prazo passou e ela ainda não respondeu. */
export function encAtrasado(e: Pick<Encaminhamento, 'status' | 'prazoCia'>, hoje: string): boolean {
  return STATUS_PENDENTES.includes(e.status) && !!e.prazoCia && e.prazoCia < hoje;
}

/** Data AAAA-MM-DD (no horário do aparelho) de um Timestamp do Firestore. '' se não tiver. */
function diaDe(t: Encaminhamento['atualizadoEm']): string {
  if (!t || typeof t.toDate !== 'function') return '';
  const d = t.toDate();
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Sai da tela da Cia (só da tela: o Numerador, a resposta e o backup continuam):
 * - com prazo: um dia depois do prazo, se a Cia já respondeu (ou foi finalizada);
 * - sem prazo: no dia seguinte ao aceite/cancelamento pela P/3.
 * O que ainda depende da Cia (pendente, devolvida, atrasada) nunca sai.
 */
export function saiDaTelaDaCia(e: Pick<Encaminhamento, 'status' | 'prazoCia' | 'atualizadoEm'>, hoje: string): boolean {
  if (STATUS_PENDENTES.includes(e.status)) return false;
  if (e.prazoCia) return e.prazoCia < hoje;
  if (e.status !== 'aceito' && e.status !== 'cancelado') return false;
  const finalizado = diaDe(e.atualizadoEm);
  return !!finalizado && finalizado < hoje;
}

export type AbaUnidade = 'pendentes' | 'respondidas' | 'finalizadas';

/**
 * Aba da Cia para os pedidos que não são demandas do Numerador (solicitação de efetivo e EAP):
 * sem resposta -> Pendentes; respondido -> Respondidas. Nenhum vai para Finalizadas.
 */
export function abaDoPedido(respondido: boolean): AbaUnidade {
  return respondido ? 'respondidas' : 'pendentes';
}

export function abaDoEncaminhamento(status: StatusEnc): AbaUnidade | null {
  if (STATUS_PENDENTES.includes(status)) return 'pendentes';
  if (status === 'respondido') return 'respondidas';
  if (status === 'aceito') return 'finalizadas';
  return null;
}
