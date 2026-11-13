import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type QuerySnapshot,
} from 'firebase/firestore';
import { STATUS_PENDENTES, type Encaminhamento } from '../domain/encaminhamento';
import type { UnidadeId } from '../domain/unidades';

// Recebe o Firestore por parâmetro para poder ser testado no emulador.

function lista(s: QuerySnapshot): Encaminhamento[] {
  return s.docs.map((d) => ({ ...(d.data() as Omit<Encaminhamento, 'id'>), id: d.id }));
}

type Ouvinte = (lista: Encaminhamento[]) => void;
type Falha = (erro: Error) => void;

// ---------- P/3 ----------

/** Tudo que ainda não foi finalizado (pendente na Cia ou aguardando aceite). São poucos. */
export function observarAbertosP3(db: Firestore, aoMudar: Ouvinte, aoFalhar: Falha): () => void {
  const q = query(collection(db, 'encaminhamentos'), where('status', 'in', [...STATUS_PENDENTES, 'respondido']));
  return onSnapshot(q, (s) => aoMudar(lista(s)), aoFalhar);
}

export function observarDaDemanda(db: Firestore, demandaId: string, aoMudar: Ouvinte, aoFalhar: Falha): () => void {
  const q = query(collection(db, 'encaminhamentos'), where('demandaId', '==', demandaId));
  return onSnapshot(q, (s) => aoMudar(lista(s)), aoFalhar);
}

async function decidir(db: Firestore, e: Encaminhamento, mudanca: Record<string, unknown>, acao: string) {
  const agora = serverTimestamp();
  const lote = writeBatch(db);
  lote.update(doc(db, 'encaminhamentos', e.id), { ...mudanca, atualizadoEm: agora });
  lote.set(doc(collection(db, 'demandas', e.demandaId, 'historico')), { acao, unidade: e.unidadeId, em: agora });
  await lote.commit();
}

export function aceitarResposta(db: Firestore, e: Encaminhamento): Promise<void> {
  return decidir(db, e, { status: 'aceito', aceitoEm: serverTimestamp() }, 'resposta_aceita');
}

export function devolverResposta(db: Firestore, e: Encaminhamento, motivo: string): Promise<void> {
  return decidir(db, e, { status: 'devolvido', motivoDevolucao: motivo.trim() }, 'resposta_devolvida');
}

// ---------- Cia ----------

/** Os 100 encaminhamentos mais recentes da Cia, em tempo real. */
export function observarDaUnidade(db: Firestore, unidade: UnidadeId, aoMudar: Ouvinte, aoFalhar: Falha): () => void {
  const q = query(
    collection(db, 'encaminhamentos'),
    where('unidadeId', '==', unidade),
    orderBy('numero', 'desc'),
    limit(100),
  );
  return onSnapshot(q, (s) => aoMudar(lista(s)), aoFalhar);
}

export async function marcarVisualizado(db: Firestore, e: Encaminhamento): Promise<void> {
  if (e.status !== 'novo') return;
  await updateDoc(doc(db, 'encaminhamentos', e.id), { status: 'visualizado', lidoEm: serverTimestamp() });
}

export async function marcarEmAndamento(db: Firestore, e: Encaminhamento): Promise<void> {
  await updateDoc(doc(db, 'encaminhamentos', e.id), { status: 'em_andamento', atualizadoEm: serverTimestamp() });
}

export async function responder(db: Firestore, e: Encaminhamento, resposta: string, respondidoPor: string): Promise<void> {
  await updateDoc(doc(db, 'encaminhamentos', e.id), {
    status: 'respondido',
    resposta: resposta.trim(),
    respondidoPor: respondidoPor.trim(),
    respondidoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });
}
