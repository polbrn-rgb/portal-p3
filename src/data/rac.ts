import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, type Firestore, type WriteBatch } from 'firebase/firestore';
import { idRac, normalizarRac, UNIDADES_RAC, validarAberturaRac, type RacDados, type RacMes, type RacSalvo } from '../domain/rac';
import { IDS_SLOTS } from '../domain/racPrints';
import type { UnidadeId } from '../domain/unidades';

// RAC mensal: "racMeses" (id = mês de referência, aberto pela P/3) e "racs" (id = mes_unidade, das Cias e da FT).

function paraMes(id: string, x: Partial<RacMes>): RacMes {
  return { mes: x.mes ?? id, prazo: x.prazo ?? '', status: x.status === 'encerrado' ? 'encerrado' : 'aberto' };
}

function paraRac(id: string, x: Record<string, unknown>): RacSalvo {
  const unidade = x.unidadeId as UnidadeId;
  const mes = String(x.mes ?? '');
  return {
    ...normalizarRac(unidade, mes, x),
    id,
    status: x.status === 'enviado' ? 'enviado' : 'rascunho',
    preenchidoPor: typeof x.preenchidoPor === 'string' ? x.preenchidoPor : '',
  };
}

const maisNovoPrimeiro = (a: { mes: string }, b: { mes: string }) => b.mes.localeCompare(a.mes);

/** P/3 abre o RAC do mês de referência com o prazo das Cias. */
export async function abrirRac(db: Firestore, mes: string, prazo: string, jaAbertos: readonly string[]): Promise<void> {
  const erro = Object.values(validarAberturaRac(mes, prazo, jaAbertos))[0];
  if (erro) throw new Error(erro);
  await setDoc(doc(db, 'racMeses', mes), { mes, prazo, status: 'aberto', criadoEm: serverTimestamp() });
}

export async function alterarRac(db: Firestore, mes: string, mudanca: Partial<Pick<RacMes, 'prazo' | 'status'>>): Promise<void> {
  await updateDoc(doc(db, 'racMeses', mes), mudanca);
}

export function observarRacMeses(db: Firestore, ok: (l: RacMes[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(collection(db, 'racMeses'), (s) => ok(s.docs.map((d) => paraMes(d.id, d.data())).sort(maisNovoPrimeiro)), erro);
}

/** Cias: só os meses abertos. */
export function observarRacMesesAbertos(db: Firestore, ok: (l: RacMes[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, 'racMeses'), where('status', '==', 'aberto')),
    (s) => ok(s.docs.map((d) => paraMes(d.id, d.data())).sort(maisNovoPrimeiro)),
    erro,
  );
}

export function observarRacsDoMes(db: Firestore, mes: string, ok: (l: RacSalvo[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(query(collection(db, 'racs'), where('mes', '==', mes)), (s) => ok(s.docs.map((d) => paraRac(d.id, d.data()))), erro);
}

/** Todos os RAC da unidade (o mês aberto e o histórico). */
export function observarRacsDaUnidade(db: Firestore, u: UnidadeId, ok: (l: RacSalvo[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(query(collection(db, 'racs'), where('unidadeId', '==', u)), (s) => ok(s.docs.map((d) => paraRac(d.id, d.data())).sort(maisNovoPrimeiro)), erro);
}

/** Grava o RAC da Cia: rascunho (pode ter campo vazio) ou enviado à P/3 (já conferido na tela). */
export async function salvarRac(db: Firestore, d: RacDados, status: 'rascunho' | 'enviado', preenchidoPor: string): Promise<void> {
  if (d.unidade === 'btl') throw new Error('O RAC do Batalhão é montado pela P/3.');
  if (status === 'enviado' && !preenchidoPor.trim()) throw new Error('Informe quem preencheu.');
  await setDoc(doc(db, 'racs', idRac(d.mes, d.unidade)), {
    mes: d.mes,
    unidadeId: d.unidade,
    crimes: d.crimes,
    pelotoes: d.pelotoes,
    producao: d.producao,
    justificativas: d.justificativas,
    status,
    preenchidoPor: preenchidoPor.trim(),
    salvoEm: serverTimestamp(),
    ...(status === 'enviado' ? { enviadoEm: serverTimestamp() } : {}),
  });
}

function apagarDaUnidade(lote: WriteBatch, db: Firestore, mes: string, u: UnidadeId): void {
  const id = idRac(mes, u);
  lote.delete(doc(db, 'racs', id));
  for (const slot of IDS_SLOTS) {
    lote.delete(doc(db, 'racPrints', `${id}_${slot}`));
    lote.delete(doc(db, 'racPrintsDados', `${id}_${slot}`));
  }
}

/** P/3: apaga do banco o RAC de uma unidade no mês (números e prints). Com o mês aberto, a Cia pode refazer. */
export async function excluirRacDaUnidade(db: Firestore, mes: string, u: UnidadeId): Promise<void> {
  const lote = writeBatch(db);
  apagarDaUnidade(lote, db, mes, u);
  await lote.commit();
}

/** P/3: apaga do banco o RAC do mês inteiro (abertura, RAC de todas as unidades e prints). */
export async function excluirRacDoMes(db: Firestore, mes: string): Promise<void> {
  const lote = writeBatch(db);
  for (const u of UNIDADES_RAC) apagarDaUnidade(lote, db, mes, u);
  lote.delete(doc(db, 'racMeses', mes));
  await lote.commit();
}
