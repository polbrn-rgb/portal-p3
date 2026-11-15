import {
  collection,
  doc,
  getDoc,
  getDocs,
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
  planejarEdicao,
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

/**
 * Grava o pedido no checklist e as solicitações das Cias, tudo junto. Serve para enviar e para editar:
 * Cia nova recebe a solicitação; Cia desmarcada perde a dela; a que já respondeu mantém os policiais
 * e volta a ficar pendente só se mudou o que ela precisa mandar (quantidades ou dados novos).
 */
export async function enviarSolicitacao(
  db: Firestore,
  d: Demanda,
  pedido: PedidoEfetivo,
  anterior?: PedidoEfetivo,
): Promise<void> {
  const campos = [...pedido.campos];
  const quantidades = Object.fromEntries(ciasDoPedido(pedido).map((c) => [c, { ...quantidadesVazias(), ...pedido.quantidades[c] }]));
  const existentes = (await getDocs(query(collection(db, 'solicitacoesEfetivo'), where('numero', '==', d.id)))).docs.map((x) =>
    paraSolicitacao(x.id, x.data()),
  );
  const plano = planejarEdicao(existentes, pedido);
  const agora = serverTimestamp();
  const lote = writeBatch(db);
  const efetivo: Record<string, unknown> = { prazo: pedido.prazo, campos, quantidades, enviadaEm: anterior?.enviadaEm ?? agora };
  if (anterior) efetivo.editadaEm = agora;
  // mergeFields: o pedido inteiro é trocado (uma Cia desmarcada não fica para trás); o resto do checklist fica.
  lote.set(doc(db, 'operacoes', d.id), { efetivo, efetivoOk: true, atualizadoEm: agora }, { mergeFields: ['efetivo', 'efetivoOk', 'atualizadoEm'] });
  for (const a of plano.apagar) lote.delete(doc(db, 'solicitacoesEfetivo', a.id));
  for (const a of plano.atualizar) {
    lote.update(doc(db, 'solicitacoesEfetivo', a.id), {
      saida: d.saida,
      inicio: d.inicioBtl,
      termino: d.terminoBtl,
      prazo: pedido.prazo,
      quantidades: quantidades[a.unidadeId],
      campos,
      ...(a.reabrir ? { status: 'enviada' } : {}),
      atualizadoEm: agora,
    });
  }
  for (const cia of plano.criar) {
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
