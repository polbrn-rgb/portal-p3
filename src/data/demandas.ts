import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
  writeBatch,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { camposAlterados, type DadosDemanda, type Demanda, type StatusDemanda } from '../domain/demanda';
import {
  idEncaminhamento,
  novoEncaminhamento,
  planejarEncaminhamentos,
  resumoDaDemanda,
  STATUS_PENDENTES,
  type Encaminhamento,
} from '../domain/encaminhamento';
import { unidadesParaEncaminhar } from '../domain/unidades';

// Acesso ao banco. Recebe o Firestore por parâmetro para poder ser testado no emulador.

export const TAMANHO_PAGINA = 30;

function paraDemanda(s: QueryDocumentSnapshot): Demanda {
  return { ...(s.data() as Omit<Demanda, 'id'>), id: s.id };
}

/**
 * Cria a demanda com o próximo número, numa transação: dois cadastros ao mesmo
 * tempo nunca recebem o mesmo número. O id do documento é o próprio número.
 */
export async function criarDemanda(db: Firestore, dados: DadosDemanda): Promise<number> {
  return runTransaction(db, async (tx) => {
    const refContador = doc(db, 'contadores', 'demandas');
    const contador = await tx.get(refContador);
    const numero = (contador.exists() ? Number(contador.data().ultimo) : 0) + 1;
    const ref = doc(db, 'demandas', String(numero));

    tx.set(refContador, { ultimo: numero });
    tx.set(ref, {
      ...dados,
      numero,
      status: 'em_aberto',
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });
    tx.set(doc(collection(ref, 'historico')), { acao: 'criada', em: serverTimestamp() });

    // Cada Cia marcada recebe o seu encaminhamento na mesma gravação.
    const resumo = resumoDaDemanda({ ...dados, numero });
    for (const unidade of unidadesParaEncaminhar(dados.destinos)) {
      tx.set(doc(db, 'encaminhamentos', idEncaminhamento(String(numero), unidade)), {
        ...novoEncaminhamento(String(numero), unidade, resumo),
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      });
    }
    return numero;
  }, { maxAttempts: 10 });
}

export async function encaminhamentosDaDemanda(db: Firestore, demandaId: string): Promise<Encaminhamento[]> {
  const s = await getDocs(query(collection(db, 'encaminhamentos'), where('demandaId', '==', demandaId)));
  return s.docs.map((e) => ({ ...(e.data() as Omit<Encaminhamento, 'id'>), id: e.id }));
}

/**
 * Grava só se algo mudou, registra no histórico quais campos mudaram e acerta
 * os encaminhamentos (Cia nova, Cia retirada, assunto/prazo alterado) na mesma gravação.
 */
export async function atualizarDemanda(
  db: Firestore,
  id: string,
  antes: DadosDemanda,
  depois: DadosDemanda,
): Promise<(keyof DadosDemanda)[]> {
  const campos = camposAlterados(antes, depois);
  if (campos.length === 0) return campos;

  const numero = Number(id);
  const plano = planejarEncaminhamentos({ ...depois, numero }, await encaminhamentosDaDemanda(db, id));
  const resumo = resumoDaDemanda({ ...depois, numero });
  const agora = serverTimestamp();

  const ref = doc(db, 'demandas', id);
  const lote = writeBatch(db);
  lote.update(ref, { ...depois, atualizadoEm: agora });
  lote.set(doc(collection(ref, 'historico')), { acao: 'editada', campos, em: agora });
  for (const unidade of plano.criar) {
    lote.set(doc(db, 'encaminhamentos', idEncaminhamento(id, unidade)), {
      ...novoEncaminhamento(id, unidade, resumo),
      criadoEm: agora,
      atualizadoEm: agora,
    });
  }
  for (const e of plano.cancelar) lote.update(doc(db, 'encaminhamentos', e), { status: 'cancelado', atualizadoEm: agora });
  for (const e of plano.reativar) {
    lote.update(doc(db, 'encaminhamentos', e), { ...resumo, status: 'novo', resposta: '', respondidoPor: '', motivoDevolucao: '', atualizadoEm: agora });
  }
  for (const e of plano.atualizarResumo) {
    if (!plano.reativar.includes(e)) lote.update(doc(db, 'encaminhamentos', e), { ...resumo, atualizadoEm: agora });
  }
  await lote.commit();
  return campos;
}

/**
 * Concluir: o que a Cia ainda devia é cancelado e o que ela já respondeu é aceito.
 * Reabrir: só a demanda volta a ficar aberta.
 */
export async function alterarStatus(db: Firestore, id: string, status: StatusDemanda): Promise<void> {
  const ref = doc(db, 'demandas', id);
  const agora = serverTimestamp();
  const lote = writeBatch(db);
  lote.update(ref, { status, atualizadoEm: agora });
  lote.set(doc(collection(ref, 'historico')), {
    acao: status === 'concluido' ? 'concluida' : 'reaberta',
    em: agora,
  });
  if (status === 'concluido') {
    for (const e of await encaminhamentosDaDemanda(db, id)) {
      if (STATUS_PENDENTES.includes(e.status)) lote.update(doc(db, 'encaminhamentos', e.id), { status: 'cancelado', atualizadoEm: agora });
      if (e.status === 'respondido') lote.update(doc(db, 'encaminhamentos', e.id), { status: 'aceito', atualizadoEm: agora });
    }
  }
  await lote.commit();
}

export async function obterDemanda(db: Firestore, id: string): Promise<Demanda | null> {
  const s = await getDoc(doc(db, 'demandas', id));
  return s.exists() ? { ...(s.data() as Omit<Demanda, 'id'>), id: s.id } : null;
}

/** Abertas em tempo real (são poucas). Devolve a função que para de escutar. */
export function observarAbertas(
  db: Firestore,
  aoMudar: (lista: Demanda[]) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  const q = query(collection(db, 'demandas'), where('status', '==', 'em_aberto'), orderBy('numero', 'desc'));
  return onSnapshot(q, (s) => aoMudar(s.docs.map(paraDemanda)), aoFalhar);
}

/** Concluídas em páginas de 30, da mais nova para a mais antiga. */
export async function buscarConcluidas(
  db: Firestore,
  depoisDoNumero?: number,
): Promise<{ lista: Demanda[]; temMais: boolean }> {
  const partes = [
    where('status', '==', 'concluido'),
    orderBy('numero', 'desc'),
    ...(depoisDoNumero !== undefined ? [startAfter(depoisDoNumero)] : []),
    limit(TAMANHO_PAGINA),
  ];
  const s = await getDocs(query(collection(db, 'demandas'), ...partes));
  return { lista: s.docs.map(paraDemanda), temMais: s.size === TAMANHO_PAGINA };
}
