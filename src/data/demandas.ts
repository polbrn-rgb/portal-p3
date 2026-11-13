import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
  writeBatch,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { camposAlterados, type DadosDemanda, type Demanda, type StatusDemanda } from '../domain/demanda';

// Acesso ao banco. Recebe o Firestore por parâmetro para poder ser testado no emulador.

export const TAMANHO_PAGINA = 30;

function paraDemanda(s: QueryDocumentSnapshot): Demanda {
  return { ...(s.data() as Omit<Demanda, 'id'>), id: s.id };
}

/**
 * Cria a demanda com o próximo número, numa transação: dois cadastros ao mesmo
 * tempo nunca recebem o mesmo número. O id do documento é o próprio número.
 */
export async function criarDemanda(db: Firestore, dados: DadosDemanda): Promise<number> {
  return runTransaction(db, async (tx) => {
    const refContador = doc(db, 'contadores', 'demandas');
    const contador = await tx.get(refContador);
    const numero = (contador.exists() ? Number(contador.data().ultimo) : 0) + 1;
    const ref = doc(db, 'demandas', String(numero));

    tx.set(refContador, { ultimo: numero });
    tx.set(ref, {
      ...dados,
      numero,
      status: 'em_aberto',
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });
    tx.set(doc(collection(ref, 'historico')), { acao: 'criada', em: serverTimestamp() });
    return numero;
  }, { maxAttempts: 10 });
}

/** Grava só se algo mudou, e registra no histórico quais campos mudaram. */
export async function atualizarDemanda(
  db: Firestore,
  id: string,
  antes: DadosDemanda,
  depois: DadosDemanda,
): Promise<(keyof DadosDemanda)[]> {
  const campos = camposAlterados(antes, depois);
  if (campos.length === 0) return campos;

  const ref = doc(db, 'demandas', id);
  const lote = writeBatch(db);
  lote.update(ref, { ...depois, atualizadoEm: serverTimestamp() });
  lote.set(doc(collection(ref, 'historico')), { acao: 'editada', campos, em: serverTimestamp() });
  await lote.commit();
  return campos;
}

export async function alterarStatus(db: Firestore, id: string, status: StatusDemanda): Promise<void> {
  const ref = doc(db, 'demandas', id);
  const lote = writeBatch(db);
  lote.update(ref, { status, atualizadoEm: serverTimestamp() });
  lote.set(doc(collection(ref, 'historico')), {
    acao: status === 'concluido' ? 'concluida' : 'reaberta',
    em: serverTimestamp(),
  });
  await lote.commit();
}

export async function obterDemanda(db: Firestore, id: string): Promise<Demanda | null> {
  const s = await getDoc(doc(db, 'demandas', id));
  return s.exists() ? { ...(s.data() as Omit<Demanda, 'id'>), id: s.id } : null;
}

/** Abertas em tempo real (são poucas). Devolve a função que para de escutar. */
export function observarAbertas(
  db: Firestore,
  aoMudar: (lista: Demanda[]) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  const q = query(collection(db, 'demandas'), where('status', '==', 'em_aberto'), orderBy('numero', 'desc'));
  return onSnapshot(q, (s) => aoMudar(s.docs.map(paraDemanda)), aoFalhar);
}

/** Concluídas em páginas de 30, da mais nova para a mais antiga. */
export async function buscarConcluidas(
  db: Firestore,
  depoisDoNumero?: number,
): Promise<{ lista: Demanda[]; temMais: boolean }> {
  const partes = [
    where('status', '==', 'concluido'),
    orderBy('numero', 'desc'),
    ...(depoisDoNumero !== undefined ? [startAfter(depoisDoNumero)] : []),
    limit(TAMANHO_PAGINA),
  ];
  const s = await getDocs(query(collection(db, 'demandas'), ...partes));
  return { lista: s.docs.map(paraDemanda), temMais: s.size === TAMANHO_PAGINA };
}
