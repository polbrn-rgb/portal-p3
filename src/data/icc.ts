import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, type Firestore } from 'firebase/firestore';
import { idRespostaIcc, validarIcc, type DadosIcc, type Icc, type QuantidadesIcc, type RespostaIcc } from '../domain/icc';
import type { UnidadeId } from '../domain/unidades';
import { enviarArquivo } from './arquivos';

// Aperfeiçoamento → ICC ("iccs") e as respostas das Cias ("respostasIcc", id = icc_unidade).

function paraIcc(id: string, x: Partial<Icc>): Icc {
  return { id, numero: x.numero ?? '', prazo: x.prazo ?? '', status: x.status === 'encerrada' ? 'encerrada' : 'aberta', arquivo: x.arquivo!, planilha: x.planilha };
}

function paraResposta(id: string, x: Partial<RespostaIcc>): RespostaIcc {
  return {
    id,
    iccId: x.iccId ?? '',
    unidadeId: x.unidadeId as UnidadeId,
    oficiais: x.oficiais ?? 0,
    sargentos: x.sargentos ?? 0,
    cabos: x.cabos ?? 0,
    respondidoPor: x.respondidoPor ?? '',
    gravado: x.gravado === true,
    erro: x.erro || undefined,
  };
}

/** Envia o PDF e cria a ICC; o motor cria a planilha (cópia zerada do modelo). */
export async function criarIcc(db: Firestore, d: DadosIcc, pdf: File, aoProgredir?: (feito: number) => void): Promise<string> {
  const erro = Object.values(validarIcc(d, pdf))[0];
  if (erro) throw new Error(erro);
  const arquivo = await enviarArquivo(db, pdf, aoProgredir);
  const ref = doc(collection(db, 'iccs'));
  await setDoc(ref, { numero: d.numero.trim(), prazo: d.prazo, status: 'aberta', arquivo, planilha: { status: 'pedida' }, criadoEm: serverTimestamp() });
  return ref.id;
}

export async function alterarPrazoIcc(db: Firestore, id: string, prazo: string): Promise<void> {
  await updateDoc(doc(db, 'iccs', id), { prazo });
}

export async function encerrarIcc(db: Firestore, id: string): Promise<void> {
  await updateDoc(doc(db, 'iccs', id), { status: 'encerrada' });
}

export function observarIccs(db: Firestore, ok: (l: Icc[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(collection(db, 'iccs'), (s) => ok(s.docs.map((d) => paraIcc(d.id, d.data())).sort((a, b) => Number(b.numero) - Number(a.numero))), erro);
}

/** Cias: só as abertas. */
export function observarIccsAbertas(db: Firestore, ok: (l: Icc[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, 'iccs'), where('status', '==', 'aberta')),
    (s) => ok(s.docs.map((d) => paraIcc(d.id, d.data())).sort((a, b) => Number(b.numero) - Number(a.numero))),
    erro,
  );
}

export function observarRespostasDaIcc(db: Firestore, iccId: string, ok: (l: RespostaIcc[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(query(collection(db, 'respostasIcc'), where('iccId', '==', iccId)), (s) => ok(s.docs.map((d) => paraResposta(d.id, d.data()))), erro);
}

export function observarRespostasIccDaUnidade(db: Firestore, u: UnidadeId, ok: (l: RespostaIcc[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(query(collection(db, 'respostasIcc'), where('unidadeId', '==', u)), (s) => ok(s.docs.map((d) => paraResposta(d.id, d.data()))), erro);
}

export async function enviarRespostaIcc(db: Firestore, iccId: string, u: UnidadeId, q: QuantidadesIcc, respondidoPor: string): Promise<void> {
  if (!respondidoPor.trim()) throw new Error('Informe quem preencheu.');
  await setDoc(doc(db, 'respostasIcc', idRespostaIcc(iccId, u)), {
    iccId,
    unidadeId: u,
    ...q,
    respondidoPor: respondidoPor.trim(),
    gravado: false,
    erro: '',
    enviadoEm: serverTimestamp(),
  });
}
