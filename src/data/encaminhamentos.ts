import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  documentId,
  getDocs,
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

async function decidir(
  db: Firestore,
  e: Encaminhamento,
  mudanca: Record<string, unknown>,
  acao: string,
  aceita: boolean,
) {
  const agora = serverTimestamp();
  const lote = writeBatch(db);
  lote.update(doc(db, 'encaminhamentos', e.id), { ...mudanca, atualizadoEm: agora });
  // A demanda guarda quais Cias tiveram a resposta aceita (para a situação "Cias responderam").
  lote.update(doc(db, 'demandas', e.demandaId), {
    ciasAceitas: aceita ? arrayUnion(e.unidadeId) : arrayRemove(e.unidadeId),
  });
  lote.set(doc(collection(db, 'demandas', e.demandaId, 'historico')), { acao, unidade: e.unidadeId, em: agora });
  await lote.commit();
}

export function aceitarResposta(db: Firestore, e: Encaminhamento): Promise<void> {
  return decidir(db, e, { status: 'aceito', aceitoEm: serverTimestamp() }, 'resposta_aceita', true);
}

export function devolverResposta(db: Firestore, e: Encaminhamento, motivo: string): Promise<void> {
  return decidir(db, e, { status: 'devolvido', motivoDevolucao: motivo.trim() }, 'resposta_devolvida', false);
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

/**
 * Encaminhamentos que ainda aparecem para as Cias mas cuja demanda não existe mais (apagada fora da
 * lixeira, ex.: direto no Firebase) ou foi excluída: são apagados. Roda quando a P/3 abre o portal.
 * Devolve quantos saíram.
 */
export async function limparEncaminhamentosOrfaos(db: Firestore): Promise<number> {
  const abertos = await getDocs(query(collection(db, 'encaminhamentos'), where('status', 'in', [...STATUS_PENDENTES, 'respondido'])));
  const ids = [...new Set(abertos.docs.map((d) => String(d.data().demandaId ?? '')).filter(Boolean))];
  const vivas = new Set<string>();
  for (let i = 0; i < ids.length; i += 30) {
    const r = await getDocs(query(collection(db, 'demandas'), where(documentId(), 'in', ids.slice(i, i + 30))));
    r.docs.forEach((d) => d.data().status !== 'excluido' && vivas.add(d.id));
  }
  const orfaos = abertos.docs.filter((d) => !vivas.has(String(d.data().demandaId ?? '')));
  for (let i = 0; i < orfaos.length; i += 400) {
    const lote = writeBatch(db);
    orfaos.slice(i, i + 400).forEach((d) => lote.delete(d.ref));
    await lote.commit();
  }
  return orfaos.length;
}
