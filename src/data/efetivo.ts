import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type { Demanda } from '../domain/demanda';
import {
  ciasDoPedido,
  idSolicitacao,
  normalizarRE,
  quantidadesVazias,
  type PedidoEfetivo,
  type Policial,
  type PolicialEscalado,
  type SolicitacaoEfetivo,
} from '../domain/efetivo';
import type { UnidadeId } from '../domain/unidades';

// Banco de efetivo (coleção "efetivo", copiada da planilha pelo motor) e solicitações às Cias.

/** Busca pelo RE (com ou sem dígito). null = não está no banco. */
export async function buscarPolicial(db: Firestore, re: string): Promise<Policial | null> {
  const chave = normalizarRE(re);
  if (chave.length < 5) return null;
  const s = await getDoc(doc(db, 'efetivo', chave));
  return s.exists() ? (s.data() as Policial) : null;
}

/** Grava o pedido no checklist e cria uma solicitação para cada Cia com policial pedido, tudo junto. */
export async function enviarSolicitacao(db: Firestore, d: Demanda, pedido: PedidoEfetivo): Promise<void> {
  const lote = writeBatch(db);
  const campos = [...pedido.campos];
  lote.set(
    doc(db, 'operacoes', d.id),
    { efetivo: { ...pedido, campos, enviadaEm: serverTimestamp() }, efetivoOk: true, atualizadoEm: serverTimestamp() },
    { merge: true },
  );
  for (const cia of ciasDoPedido(pedido)) {
    lote.set(doc(db, 'solicitacoesEfetivo', idSolicitacao(d.id, cia)), {
      numero: d.id,
      unidadeId: cia,
      saida: d.saida,
      inicio: d.inicioBtl,
      termino: d.terminoBtl,
      prazo: pedido.prazo,
      quantidades: { ...quantidadesVazias(), ...pedido.quantidades[cia] },
      campos,
      status: 'enviada',
      policiais: [],
      criadoEm: serverTimestamp(),
    });
  }
  await lote.commit();
}

function paraSolicitacao(id: string, dados: unknown): SolicitacaoEfetivo {
  return { ...(dados as Omit<SolicitacaoEfetivo, 'id'>), id };
}

/** P/3: as solicitações de uma operação. */
export function observarSolicitacoesDaOperacao(
  db: Firestore,
  numero: string,
  aoMudar: (lista: SolicitacaoEfetivo[]) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  const q = query(collection(db, 'solicitacoesEfetivo'), where('numero', '==', numero));
  return onSnapshot(q, (s) => aoMudar(s.docs.map((d) => paraSolicitacao(d.id, d.data()))), aoFalhar);
}

/** Cia: as solicitações dela, a de prazo mais próximo primeiro. */
export function observarSolicitacoesDaUnidade(
  db: Firestore,
  unidade: UnidadeId,
  aoMudar: (lista: SolicitacaoEfetivo[]) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  const q = query(collection(db, 'solicitacoesEfetivo'), where('unidadeId', '==', unidade));
  return onSnapshot(
    q,
    (s) =>
      aoMudar(
        s.docs.map((d) => paraSolicitacao(d.id, d.data())).sort((a, b) => a.prazo.localeCompare(b.prazo)),
      ),
    aoFalhar,
  );
}

/** Cia envia (ou corrige) a lista de policiais. */
export async function responderSolicitacao(
  db: Firestore,
  id: string,
  policiais: PolicialEscalado[],
  respondidoPor: string,
): Promise<void> {
  await updateDoc(doc(db, 'solicitacoesEfetivo', id), {
    policiais,
    status: 'respondida',
    respondidoPor: respondidoPor.trim(),
    respondidoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });
}
