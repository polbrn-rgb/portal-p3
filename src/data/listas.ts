import { doc, onSnapshot, runTransaction, type Firestore } from 'firebase/firestore';
import { lerListas, type ChaveLista, type ItemLista, type Listas } from '../domain/listasConfig';

// Listas do numerador em config/listas: a P/3 lê; só o Administrador grava (regras).
const REF = 'config/listas';

export function observarListas(db: Firestore, aoMudar: (l: Listas) => void, aoFalhar: (e: Error) => void): () => void {
  return onSnapshot(doc(db, REF), (s) => aoMudar(lerListas(s.data())), aoFalhar);
}

/**
 * Muda uma lista numa transação (lê a versão atual do banco antes): duas pessoas mexendo ao mesmo tempo
 * não apagam a mudança uma da outra. "mudar" devolve a lista nova ou a mensagem de erro.
 */
export async function alterarLista(
  db: Firestore,
  chave: ChaveLista,
  mudar: (lista: ItemLista[]) => ItemLista[] | string,
): Promise<string> {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, REF);
    const atuais = lerListas((await tx.get(ref)).data());
    const nova = mudar(atuais[chave]);
    if (typeof nova === 'string') return nova;
    tx.set(ref, { ...atuais, [chave]: nova });
    return '';
  });
}
