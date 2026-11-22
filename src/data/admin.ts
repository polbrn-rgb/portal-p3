import {
  collection,
  collectionGroup,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
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

/**
 * Quantas demandas ainda esperam o motor limpar agenda/pasta, em tempo real.
 * Ao vivo só ficam as que esperam o motor e a última que ele mexeu; os totais são contagens feitas no
 * servidor (1 leitura a cada mil demandas), refeitas quando algo muda. Antes a tela lia o banco inteiro.
 */
export function observarZeragem(
  db: Firestore,
  aoMudar: (situacao: SituacaoZeragem) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  const demandas = collection(db, 'demandas');
  let esperando: Record<string, any>[] | null = null;
  let ultimaAtividade: string | null = null;
  let parado = false;
  let rodada = 0;

  const recontar = async () => {
    if (esperando === null || ultimaAtividade === null) return;
    const minha = ++rodada;
    const [total, zeradas, novas] = await Promise.all([
      getCountFromServer(demandas),
      getCountFromServer(query(demandas, where('zerada', '==', true))),
      getCountFromServer(query(demandas, where('status', '!=', 'excluido'))),
    ]);
    // Só vale a contagem mais recente (duas mudanças seguidas podem responder fora de ordem).
    if (parado || minha !== rodada) return;
    aoMudar({
      comErro: esperando
        .filter((d) => d.automacao?.erro)
        .map((d) => ({ id: d.id, numero: Number(d.numero), erro: String(d.automacao.erro) })),
      ultimaAtividade,
      total: total.data().count,
      zeradas: zeradas.data().count,
      aguardandoMotor: esperando.length,
      novas: novas.data().count,
    });
  };
  const mudou = () => recontar().catch((e: Error) => !parado && aoFalhar(e));

  const pararEsperando = onSnapshot(
    query(demandas, where('automacaoPendente', '==', true)),
    (s) => {
      esperando = s.docs.map((d) => ({ ...d.data(), id: d.id }));
      mudou();
    },
    aoFalhar,
  );
  // Na zeragem todas as demandas estão zeradas: a última que o motor mexeu é a última atividade da limpeza.
  const pararUltima = onSnapshot(
    query(demandas, orderBy('automacao.processadoEm', 'desc'), limit(1)),
    (s) => {
      const d = s.docs[0]?.data();
      ultimaAtividade = d?.zerada === true ? String(d.automacao?.processadoEm ?? '') : '';
      mudou();
    },
    aoFalhar,
  );
  return () => {
    parado = true;
    pararEsperando();
    pararUltima();
  };
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
