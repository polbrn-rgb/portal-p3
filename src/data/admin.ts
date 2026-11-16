import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';
import { COLECOES_ZERAR, emLotes } from '../domain/admin';
import { ID_CONTADOR_GERAL } from '../domain/numeracao';

// Funções da aba Administrador. Recebem o banco logado com a conta do Administrador
// (as regras só deixam essa conta zerar e mudar contador).

export type Contador = { id: string; ultimo: number };

export async function lerContadores(db: Firestore): Promise<Contador[]> {
  const s = await getDocs(collection(db, 'contadores'));
  return s.docs.map((d) => ({ id: d.id, ultimo: Number(d.data().ultimo ?? 0) }));
}

/** "ultimo" = último número já usado; a próxima demanda (ou documento) recebe ultimo + 1. */
export async function definirContador(db: Firestore, id: string, ultimo: number): Promise<void> {
  await setDoc(doc(db, 'contadores', id), { ultimo });
}

async function apagar(db: Firestore, refs: DocumentReference[]): Promise<number> {
  for (const lote of emLotes(refs)) {
    const b = writeBatch(db);
    for (const r of lote) b.delete(r);
    await b.commit();
  }
  return refs.length;
}

/**
 * Etapa 1 da zeragem: apaga tudo que foi lançado (menos efetivo e configurações) e marca todas as demandas
 * como excluídas. O motor (Apps Script) então apaga os eventos delas nas agendas e manda as pastas do CFP
 * para a lixeira do Drive. As demandas só somem de vez na etapa 2.
 */
export async function iniciarZeragem(db: Firestore): Promise<{ apagados: number; demandas: number }> {
  let apagados = 0;
  for (const nome of COLECOES_ZERAR) {
    apagados += await apagar(db, (await getDocs(collection(db, nome))).docs.map((d) => d.ref));
  }
  // Partes dos arquivos (PDF). O histórico das demandas fica até a etapa 2.
  apagados += await apagar(db, (await getDocs(collectionGroup(db, 'partes'))).docs.map((d) => d.ref));

  const demandas = (await getDocs(collection(db, 'demandas'))).docs;
  const agora = serverTimestamp();
  for (const lote of emLotes(demandas)) {
    const b = writeBatch(db);
    for (const d of lote) {
      b.update(d.ref, { status: 'excluido', automacaoPendente: true, zerada: true, atualizadoEm: agora });
    }
    await b.commit();
  }
  return { apagados, demandas: demandas.length };
}

export type SituacaoZeragem = {
  total: number;
  zeradas: number;
  aguardandoMotor: number;
  novas: number;
  /** Esperando o motor e com erro na última tentativa. */
  comErro: { id: string; numero: number; erro: string }[];
  /** Última vez que o motor mexeu numa demanda zerada (ISO), '' se nunca. */
  ultimaAtividade: string;
};

/** Quantas demandas ainda esperam o motor limpar agenda/pasta, em tempo real. */
export function observarZeragem(
  db: Firestore,
  aoMudar: (situacao: SituacaoZeragem) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, 'demandas'),
    (s) => {
      const lista = s.docs.map((d) => ({ ...d.data(), id: d.id }) as Record<string, any>);
      const zeradas = lista.filter((d) => d.zerada === true);
      aoMudar({
        comErro: lista
          .filter((d) => d.automacaoPendente === true && d.automacao?.erro)
          .map((d) => ({ id: d.id, numero: Number(d.numero), erro: String(d.automacao.erro) })),
        ultimaAtividade: zeradas.reduce((m, d) => (String(d.automacao?.processadoEm ?? '') > m ? String(d.automacao.processadoEm) : m), ''),
        total: lista.length,
        zeradas: lista.filter((d) => d.zerada === true).length,
        aguardandoMotor: lista.filter((d) => d.automacaoPendente === true).length,
        novas: lista.filter((d) => d.status !== 'excluido').length,
      });
    },
    aoFalhar,
  );
}

/**
 * Desiste de limpar agenda/pasta destas demandas (o motor deixa de tentar). O que sobrar na agenda ou no Drive
 * fica para apagar à mão. Serve para quando o motor dá sempre o mesmo erro e a zeragem não anda.
 */
export async function pularLimpeza(db: Firestore, ids: readonly string[]): Promise<void> {
  for (const lote of emLotes(ids)) {
    const b = writeBatch(db);
    for (const id of lote) b.update(doc(db, 'demandas', id), { automacaoPendente: false, limpezaPulada: true });
    await b.commit();
  }
}

export class ZeragemNaoPronta extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ZeragemNaoPronta';
  }
}

/**
 * Etapa 2: depois que o motor limpou tudo, apaga as demandas (com o histórico) e todos os contadores,
 * e define de qual número o numerador continua (a próxima demanda será ultimo + 1).
 */
export async function concluirZeragem(db: Firestore, ultimo: number): Promise<number> {
  const demandas = (await getDocs(collection(db, 'demandas'))).docs;
  if (demandas.some((d) => d.data().automacaoPendente === true)) {
    throw new ZeragemNaoPronta('O motor ainda está limpando as agendas e pastas. Espere o contador chegar a zero.');
  }
  if (demandas.some((d) => d.data().status !== 'excluido')) {
    throw new ZeragemNaoPronta('Foi cadastrada demanda nova depois de iniciar a zeragem. Clique em "Zerar portal" de novo.');
  }
  await apagar(db, (await getDocs(collectionGroup(db, 'historico'))).docs.map((d) => d.ref));
  await apagar(db, demandas.map((d) => d.ref));
  const restantes = (await getDocs(collection(db, 'contadores'))).docs;
  await apagar(db, restantes.map((d) => d.ref));
  await definirContador(db, ID_CONTADOR_GERAL, ultimo);
  return demandas.length;
}
