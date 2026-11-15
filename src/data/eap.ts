import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { tituloEap, type DadosEap, type Eap, type ListaEap, type RespostaEap } from '../domain/eap';
import { UNIDADES } from '../domain/unidades';

// EAP: o documento da P/3 (eap/{id}) e uma resposta por Cia (eapRespostas/{id}_{cia}).
// O motor cria a cópia da planilha (planilha.status "pedida"), atualiza o cabeçalho (planilhaDesatualizada)
// e grava o que a Cia mandou (gravado == false).

export const idRespostaEap = (eapId: string, cia: string) => `${eapId}_${cia}`;

function copiaParaCia(d: DadosEap, cia: string) {
  return { titulo: tituloEap(d), prazo: d.prazo, turmas: d.turmas, vagas: d.vagas[cia as keyof typeof d.vagas] ?? {} };
}

export async function criarEap(db: Firestore, d: DadosEap): Promise<string> {
  const ref = doc(collection(db, 'eap'));
  const agora = serverTimestamp();
  const lote = writeBatch(db);
  lote.set(ref, { ...d, status: 'aberta', planilha: { status: 'pedida' }, planilhaDesatualizada: false, criadoEm: agora, atualizadoEm: agora });
  for (const u of UNIDADES) {
    lote.set(doc(db, 'eapRespostas', idRespostaEap(ref.id, u.id)), {
      eapId: ref.id,
      unidadeId: u.id,
      ...copiaParaCia(d, u.id),
      status: 'pendente',
      encerrada: false,
      blocos: {},
      respondidoPor: '',
      gravado: true,
      erro: '',
      criadoEm: agora,
    });
  }
  await lote.commit();
  return ref.id;
}

/** Editar depois de aberta: a planilha recebe o cabeçalho e as linhas novas; as Cias veem as turmas/vagas novas. */
export async function editarEap(db: Firestore, eap: Eap, d: DadosEap): Promise<void> {
  const agora = serverTimestamp();
  const lote = writeBatch(db);
  lote.update(doc(db, 'eap', eap.id), { ...d, planilhaDesatualizada: eap.planilha?.status === 'pronta', atualizadoEm: agora });
  for (const u of UNIDADES) lote.update(doc(db, 'eapRespostas', idRespostaEap(eap.id, u.id)), { ...copiaParaCia(d, u.id), atualizadoEm: agora });
  await lote.commit();
}

/** Encerrar: some da tela das Cias (a planilha fica). */
export async function encerrarEap(db: Firestore, eap: Eap): Promise<void> {
  const lote = writeBatch(db);
  lote.update(doc(db, 'eap', eap.id), { status: 'encerrada', atualizadoEm: serverTimestamp() });
  for (const u of UNIDADES) lote.update(doc(db, 'eapRespostas', idRespostaEap(eap.id, u.id)), { encerrada: true });
  await lote.commit();
}

export async function pedirCompiladoEap(db: Firestore, id: string): Promise<void> {
  await updateDoc(doc(db, 'eap', id), { compilado: { status: 'pedido' } });
}

export function observarEaps(db: Firestore, ok: (l: Eap[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, 'eap'), orderBy('criadoEm', 'desc'), limit(20)),
    (s) => ok(s.docs.map((d) => ({ ...(d.data() as Omit<Eap, 'id'>), id: d.id }))),
    erro,
  );
}

const paraResposta = (id: string, x: Record<string, unknown>) => ({ blocos: {}, ...x, id }) as RespostaEap;

export function observarRespostasDaEap(db: Firestore, eapId: string, ok: (l: RespostaEap[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, 'eapRespostas'), where('eapId', '==', eapId)),
    (s) => ok(s.docs.map((d) => paraResposta(d.id, d.data()))),
    erro,
  );
}

/** Cia: os EAP abertos para ela. */
export function observarEapDaUnidade(db: Firestore, unidade: string, ok: (l: RespostaEap[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, 'eapRespostas'), where('unidadeId', '==', unidade), where('encerrada', '==', false)),
    (s) => ok(s.docs.map((d) => paraResposta(d.id, d.data()))),
    erro,
  );
}

export async function enviarRespostaEap(db: Firestore, id: string, blocos: Record<string, ListaEap>, respondidoPor: string): Promise<void> {
  const limpo = Object.fromEntries(
    Object.entries(blocos).map(([k, b]) => [
      k,
      {
        semEfetivo: !!b.semEfetivo && !b.policiais.length,
        policiais: b.policiais.map((p) => Object.fromEntries(Object.entries(p).map(([c, v]) => [c, String(v ?? '').trim()]))),
      },
    ]),
  );
  await updateDoc(doc(db, 'eapRespostas', id), {
    blocos: limpo,
    status: 'enviada',
    respondidoPor: respondidoPor.trim(),
    respondidoEm: serverTimestamp(),
    gravado: false,
    atualizadoEm: serverTimestamp(),
  });
}
