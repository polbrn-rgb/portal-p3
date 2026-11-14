import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore';
import { validarRecado } from '../domain/recado';

// Recados do Cmt do P3 para o CFP: a P/3 escreve e apaga; o CFP só lê.
export const COLECAO_RECADOS = 'recadosCfp';
const MAXIMO_NA_TELA = 10;

export type RecadoCfp = { id: string; texto: string; criadoEm: Date | null };

export async function enviarRecadoCfp(db: Firestore, texto: string): Promise<string> {
  const erro = validarRecado(texto);
  if (erro) throw new Error(erro);
  const ref = await addDoc(collection(db, COLECAO_RECADOS), { texto: texto.trim(), criadoEm: serverTimestamp() });
  return ref.id;
}

export async function apagarRecadoCfp(db: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(db, COLECAO_RECADOS, id));
}

/** Os mais novos primeiro, em tempo real. */
export function observarRecadosCfp(
  db: Firestore,
  aoMudar: (lista: RecadoCfp[]) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  const q = query(collection(db, COLECAO_RECADOS), orderBy('criadoEm', 'desc'), limit(MAXIMO_NA_TELA));
  return onSnapshot(
    q,
    (s) =>
      aoMudar(
        s.docs.map((d) => {
          // "estimate": o recado recém-enviado já aparece com a hora do aparelho.
          const dados = d.data({ serverTimestamps: 'estimate' }) as { texto: string; criadoEm?: Timestamp | null };
          return { id: d.id, texto: dados.texto, criadoEm: dados.criadoEm?.toDate() ?? null };
        }),
      ),
    aoFalhar,
  );
}
