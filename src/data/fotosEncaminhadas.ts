import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore';
import { COLECAO_FOTOS_ENCAMINHADAS, COLECAO_FOTOS_ENCAMINHADAS_DADOS, type FotoCgp, type FotoEncaminhada } from '../domain/cgp';
import type { UnidadeId } from '../domain/unidades';
import { lerFotoCgp } from './cgp';

// Fotos do CGP encaminhadas pela Cia à P/3: uma cópia com o mesmo id da foto do CGP (a mesma foto não vai duas vezes).
// A Cia vê quais encaminhou (sem a foto em tamanho cheio); só a P/3 baixa e apaga. Saem 15 dias depois de encaminhadas.

const quando = (t: unknown): Date | null => (t as Timestamp | null | undefined)?.toDate?.() ?? null;

function paraFoto(id: string, x: DocumentData): FotoEncaminhada {
  return {
    id,
    unidadeId: x.unidadeId,
    descricao: x.descricao ?? '',
    local: x.local ?? '',
    observacao: x.observacao ?? '',
    miniatura: x.miniatura ?? '',
    enviadoPor: x.enviadoPor ?? '',
    enviadoEm: quando(x.enviadoEm),
    encaminhadaPor: x.encaminhadaPor ?? '',
    encaminhadaEm: quando(x.encaminhadaEm),
  };
}

const recentes = (a: FotoEncaminhada, b: FotoEncaminhada) => (b.encaminhadaEm?.getTime() ?? 0) - (a.encaminhadaEm?.getTime() ?? 0);

/** A Cia encaminha à P/3 uma foto do CGP dela (cópia da foto e do resumo). */
export async function encaminharFotoP3(db: Firestore, f: FotoCgp, encaminhadaPor: string): Promise<void> {
  const dados = await lerFotoCgp(db, f.id);
  const lote = writeBatch(db);
  lote.set(doc(db, COLECAO_FOTOS_ENCAMINHADAS_DADOS, f.id), { unidadeId: f.unidadeId, dados });
  lote.set(doc(db, COLECAO_FOTOS_ENCAMINHADAS, f.id), {
    unidadeId: f.unidadeId,
    descricao: f.descricao,
    local: f.local,
    observacao: f.observacao,
    miniatura: f.miniatura,
    tamanho: dados.length,
    enviadoPor: f.enviadoPor,
    enviadoEm: f.enviadoEm ?? new Date(),
    encaminhadaPor,
    encaminhadaEm: serverTimestamp(),
  });
  await lote.commit();
}

/** Ids das fotos que esta Cia já encaminhou (para mostrar "Encaminhada à P/3"). */
export function observarEncaminhadasDaCia(db: Firestore, unidade: UnidadeId, ok: (ids: Set<string>) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, COLECAO_FOTOS_ENCAMINHADAS), where('unidadeId', '==', unidade)),
    (s) => ok(new Set(s.docs.map((d) => d.id))),
    erro,
  );
}

/** Todas as fotos encaminhadas à P/3, das mais novas para as mais antigas. */
export function observarFotosEncaminhadas(db: Firestore, ok: (l: FotoEncaminhada[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(
    collection(db, COLECAO_FOTOS_ENCAMINHADAS),
    (s) => ok(s.docs.map((d) => paraFoto(d.id, d.data({ serverTimestamps: 'estimate' }))).sort(recentes)),
    erro,
  );
}

/** Quantas fotos estão esperando a P/3 (contador do menu; uma leitura por consulta). */
export async function contarFotosEncaminhadas(db: Firestore): Promise<number> {
  return (await getCountFromServer(collection(db, COLECAO_FOTOS_ENCAMINHADAS))).data().count;
}

/** A foto em tamanho cheio (base64 JPEG). */
export async function lerFotoEncaminhada(db: Firestore, id: string): Promise<string> {
  const s = await getDoc(doc(db, COLECAO_FOTOS_ENCAMINHADAS_DADOS, id));
  if (!s.exists()) throw new Error('Foto não encontrada.');
  return String(s.data().dados ?? '');
}

export async function apagarFotosEncaminhadas(db: Firestore, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 200) {
    const lote = writeBatch(db);
    for (const id of ids.slice(i, i + 200)) {
      lote.delete(doc(db, COLECAO_FOTOS_ENCAMINHADAS_DADOS, id));
      lote.delete(doc(db, COLECAO_FOTOS_ENCAMINHADAS, id));
    }
    await lote.commit();
  }
}
