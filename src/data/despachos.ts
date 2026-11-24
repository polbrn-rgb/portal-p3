import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, where, type Firestore, type Timestamp } from 'firebase/firestore';
import { COLECAO_DESPACHOS_CGP, type DespachoCgp } from '../domain/despacho';
import type { UnidadeId } from '../domain/unidades';

// Despachos do CGP (ver domain/despacho.ts): o CGP grava; a Cia e o CGP leem e baixam o PDF; só a Cia apaga.

const quando = (t: unknown): Date | null => (t as Timestamp | null | undefined)?.toDate?.() ?? null;

export async function salvarDespacho(db: Firestore, d: Omit<DespachoCgp, 'id' | 'criadoEm'>): Promise<string> {
  const ref = await addDoc(collection(db, COLECAO_DESPACHOS_CGP), {
    unidadeId: d.unidadeId,
    missaoId: d.missaoId,
    numero: d.numero,
    titulo: d.titulo,
    data: d.data,
    pelotao: d.pelotao.trim(),
    texto: d.texto.trim(),
    assinante: d.assinante.trim(),
    assinatura: d.assinatura,
    criadoPor: d.criadoPor,
    criadoEm: serverTimestamp(),
  });
  return ref.id;
}

export function excluirDespacho(db: Firestore, id: string): Promise<void> {
  return deleteDoc(doc(db, COLECAO_DESPACHOS_CGP, id));
}

/** Despachos da Cia (mais novo primeiro). */
export function observarDespachosCgp(db: Firestore, unidade: UnidadeId, ok: (l: DespachoCgp[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, COLECAO_DESPACHOS_CGP), where('unidadeId', '==', unidade)),
    (s) =>
      ok(
        s.docs
          .map((x) => {
            const d = x.data({ serverTimestamps: 'estimate' });
            return {
              id: x.id,
              unidadeId: d.unidadeId,
              missaoId: d.missaoId ?? '',
              numero: d.numero ?? '',
              titulo: d.titulo ?? '',
              data: d.data ?? '',
              pelotao: d.pelotao ?? '',
              texto: d.texto ?? '',
              assinante: d.assinante ?? '',
              assinatura: d.assinatura ?? '',
              criadoPor: d.criadoPor ?? '',
              criadoEm: quando(d.criadoEm),
            } satisfies DespachoCgp;
          })
          .sort((a, b) => (b.criadoEm?.getTime() ?? 0) - (a.criadoEm?.getTime() ?? 0)),
      ),
    erro,
  );
}
