import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { montarPendenteManual, ordenarPendentes, type DadosPendenteManual, type Pendente } from '../domain/pendente';

// Aba Demandas Pendentes (coleção "caixaEntrada", só a P/3 acessa).
// Os e-mails são gravados pelo Apps Script; SEI e Ordem Verbal, pelo portal.

export const COLECAO_PENDENTES = 'caixaEntrada';

export async function criarPendente(db: Firestore, dados: DadosPendenteManual): Promise<string> {
  const ref = await addDoc(collection(db, COLECAO_PENDENTES), {
    ...montarPendenteManual(dados, new Date()),
    status: 'pendente',
    criadoEm: serverTimestamp(),
  });
  return ref.id;
}

/** Só as que ainda esperam destino, em tempo real (são poucas). */
export function observarPendentes(
  db: Firestore,
  aoMudar: (lista: Pendente[]) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  const q = query(collection(db, COLECAO_PENDENTES), where('status', '==', 'pendente'));
  return onSnapshot(
    q,
    (s) => aoMudar(ordenarPendentes(s.docs.map((d) => ({ ...(d.data() as Omit<Pendente, 'id'>), id: d.id })))),
    aoFalhar,
  );
}

export async function obterPendente(db: Firestore, id: string): Promise<Pendente | null> {
  const s = await getDoc(doc(db, COLECAO_PENDENTES, id));
  return s.exists() ? { ...(s.data() as Omit<Pendente, 'id'>), id: s.id } : null;
}

export async function descartarPendente(db: Firestore, id: string, motivo: string): Promise<void> {
  await updateDoc(doc(db, COLECAO_PENDENTES, id), {
    status: 'descartada',
    motivoDescarte: motivo.trim(),
    resolvidoEm: serverTimestamp(),
  });
}

/** Desfaz um descarte feito por engano. */
export async function voltarParaPendentes(db: Firestore, id: string): Promise<void> {
  await updateDoc(doc(db, COLECAO_PENDENTES, id), { status: 'pendente', motivoDescarte: '' });
}
