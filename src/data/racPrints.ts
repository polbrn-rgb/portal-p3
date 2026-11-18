import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, where, writeBatch, type Firestore } from 'firebase/firestore';
import { IDS_SLOTS, idPrint, type LeituraPainel, type SlotPrint } from '../domain/racPrints';
import type { UnidadeId } from '../domain/unidades';
import type { FotoReduzida } from '../lib/imagem';

// Prints do RAC: "racPrints" (resumo + miniatura + leitura) e "racPrintsDados" (a imagem), id = mes_unidade_slot.

export type PrintRac = { id: string; mes: string; unidadeId: UnidadeId; slot: SlotPrint; miniatura: string; leitura: LeituraPainel | null };

function paraPrint(id: string, x: Record<string, unknown>): PrintRac | null {
  const slot = String(x.slot ?? '');
  if (!IDS_SLOTS.includes(slot)) return null;
  return {
    id,
    mes: String(x.mes ?? ''),
    unidadeId: x.unidadeId as UnidadeId,
    slot: slot as SlotPrint,
    miniatura: String(x.miniatura ?? ''),
    leitura: (x.leitura as LeituraPainel | null) ?? null,
  };
}

/** Prints da unidade no mês (sem a imagem grande). */
export function observarPrintsDoRac(db: Firestore, mes: string, u: UnidadeId, ok: (l: PrintRac[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, 'racPrints'), where('unidadeId', '==', u), where('mes', '==', mes)),
    (s) => ok(s.docs.map((d) => paraPrint(d.id, d.data())).filter((p): p is PrintRac => p !== null)),
    erro,
  );
}

/** Grava (ou troca) o print do espaço: a imagem e o resumo vão juntos (tudo ou nada). */
export async function salvarPrintRac(db: Firestore, mes: string, u: UnidadeId, slot: SlotPrint, foto: FotoReduzida, leitura: LeituraPainel | null): Promise<void> {
  const id = idPrint(mes, u, slot);
  const lote = writeBatch(db);
  lote.set(doc(db, 'racPrintsDados', id), { mes, unidadeId: u, slot, dados: foto.dados });
  lote.set(doc(db, 'racPrints', id), { mes, unidadeId: u, slot, miniatura: foto.miniatura, leitura, tamanho: foto.dados.length, enviadoEm: serverTimestamp() });
  await lote.commit();
}

/** A imagem em tamanho cheio (base64 JPEG), para montar a apresentação. */
export async function lerImagemPrint(db: Firestore, id: string): Promise<string> {
  const s = await getDoc(doc(db, 'racPrintsDados', id));
  if (!s.exists()) throw new Error('Print não encontrado.');
  return String(s.data().dados ?? '');
}
