import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore';
import { ehNatureza, idProducao, lerItens, normalizarTalao, type Itens, type PelotaoId, type Producao, type Talao } from '../domain/producao';
import type { UnidadeId } from '../domain/unidades';

// Produção diária dos pelotões (ver domain/producao.ts). Coleção "producao", id "{cia}_{dia}_{pelotão}":
// um lançamento por pelotão por dia. A Cia lança e corrige o dela; a P/3 lê todos.

export const COLECAO_PRODUCAO = 'producao';
/** Histórico: cada gravação e cada exclusão vira um registro que ninguém altera nem apaga (o banco não perde nada). */
export const COLECAO_HISTORICO_PRODUCAO = 'producaoHistorico';

const quando = (t: unknown): Date | null => (t as Timestamp | null | undefined)?.toDate?.() ?? null;

export function paraProducao(id: string, x: DocumentData): Producao {
  return {
    id,
    unidadeId: x.unidadeId,
    data: x.data ?? '',
    mes: x.mes ?? '',
    pelotao: x.pelotao,
    itens: lerItens(x.itens),
    taloes: Array.isArray(x.taloes)
      ? x.taloes
          .filter((t: Partial<Talao>) => t && typeof t.numero === 'string')
          .map((t: Partial<Talao>) => ({ numero: t.numero ?? '', bopc: t.bopc ?? '', data: t.data ?? '', natureza: ehNatureza(t.natureza) ? t.natureza : '' }))
      : [],
    lancadoPor: x.lancadoPor ?? '',
    lancadoEm: quando(x.lancadoEm),
    atualizadoPor: x.atualizadoPor ?? '',
    atualizadoEm: quando(x.atualizadoEm),
  };
}

/**
 * Grava o lançamento do pelotão no dia (cria ou substitui). Quem lançou primeiro e quando continuam
 * guardados; quem alterou por último também.
 */
export async function salvarProducao(
  db: Firestore,
  p: { unidade: UnidadeId; data: string; pelotao: PelotaoId; itens: Itens; taloes: readonly Talao[]; por: string },
): Promise<string> {
  const ref = doc(db, COLECAO_PRODUCAO, idProducao(p.unidade, p.data, p.pelotao));
  const itens = { ...p.itens };
  const taloes = p.taloes.map((t) => ({ numero: normalizarTalao(t.numero), bopc: normalizarTalao(t.bopc ?? ''), data: t.data, natureza: t.natureza }));
  await runTransaction(db, async (tx) => {
    const atual = await tx.get(ref);
    const antes = atual.exists() ? atual.data() : null;
    tx.set(doc(collection(db, COLECAO_HISTORICO_PRODUCAO)), {
      producaoId: ref.id,
      unidadeId: p.unidade,
      mes: p.data.slice(0, 7),
      acao: antes ? 'corrigido' : 'lancado',
      itens,
      taloes,
      por: p.por,
      em: serverTimestamp(),
    });
    tx.set(ref, {
      unidadeId: p.unidade,
      data: p.data,
      mes: p.data.slice(0, 7),
      pelotao: p.pelotao,
      itens,
      taloes,
      lancadoPor: antes ? antes.lancadoPor : p.por,
      lancadoEm: antes ? antes.lancadoEm : serverTimestamp(),
      atualizadoPor: p.por,
      atualizadoEm: serverTimestamp(),
    });
  });
  return ref.id;
}

/** Apaga o lançamento; o que ele tinha continua no histórico (com quem apagou). */
export async function excluirProducao(db: Firestore, l: Pick<Producao, 'id' | 'unidadeId' | 'mes' | 'itens' | 'taloes'>, por: string): Promise<void> {
  const lote = writeBatch(db);
  lote.delete(doc(db, COLECAO_PRODUCAO, l.id));
  lote.set(doc(collection(db, COLECAO_HISTORICO_PRODUCAO)), {
    producaoId: l.id,
    unidadeId: l.unidadeId,
    mes: l.mes,
    acao: 'excluido',
    itens: { ...l.itens },
    taloes: l.taloes.map((t) => ({ ...t })),
    por,
    em: serverTimestamp(),
  });
  await lote.commit();
}

/** Lançamentos de uma Cia no mês ('AAAA-MM'). */
export function observarProducaoDaCia(
  db: Firestore,
  unidade: UnidadeId,
  mes: string,
  ok: (l: Producao[]) => void,
  erro: (e: Error) => void,
): () => void {
  return onSnapshot(
    query(collection(db, COLECAO_PRODUCAO), where('unidadeId', '==', unidade), where('mes', '==', mes)),
    (s) => ok(s.docs.map((d) => paraProducao(d.id, d.data({ serverTimestamps: 'estimate' })))),
    erro,
  );
}

/**
 * Dia do primeiro lançamento da unidade (null = ainda não lançou nada). As pendências contam a partir dele.
 */
export function observarPrimeiroLancamento(
  db: Firestore,
  unidade: UnidadeId,
  ok: (data: string | null) => void,
  erro: (e: Error) => void,
): () => void {
  return onSnapshot(
    query(collection(db, COLECAO_PRODUCAO), where('unidadeId', '==', unidade), orderBy('data'), limit(1)),
    (s) => ok(s.empty ? null : String(s.docs[0].data().data ?? '') || null),
    erro,
  );
}

/** P/3: o primeiro lançamento de cada unidade (todas as respostas juntas). */
export function observarPrimeirosLancamentos(
  db: Firestore,
  unidades: readonly UnidadeId[],
  ok: (porUnidade: Partial<Record<UnidadeId, string | null>>) => void,
  erro: (e: Error) => void,
): () => void {
  const r: Partial<Record<UnidadeId, string | null>> = {};
  const parar = unidades.map((u) =>
    observarPrimeiroLancamento(
      db,
      u,
      (data) => {
        r[u] = data;
        if (unidades.every((x) => x in r)) ok({ ...r });
      },
      erro,
    ),
  );
  return () => parar.forEach((p) => p());
}

/** P/3: os lançamentos de todas as unidades no mês. */
export function observarProducaoDoMes(db: Firestore, mes: string, ok: (l: Producao[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, COLECAO_PRODUCAO), where('mes', '==', mes)),
    (s) => ok(s.docs.map((d) => paraProducao(d.id, d.data({ serverTimestamps: 'estimate' })))),
    erro,
  );
}
