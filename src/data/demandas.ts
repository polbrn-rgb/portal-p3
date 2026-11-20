import {
  arrayRemove,
  collection,
  deleteField,
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
import { edicaoPrecisaAutomacao, precisaAutomacao } from '../domain/automacao';
import { camposAlterados, dadosDe, type DadosDemanda, type Demanda, type StatusDemanda } from '../domain/demanda';
import {
  idEncaminhamento,
  novoEncaminhamento,
  planejarEncaminhamentos,
  resumoDaDemanda,
  STATUS_PENDENTES,
  type Encaminhamento,
} from '../domain/encaminhamento';
import { formatarNumeroDocumento, idContadorTipo, anoDe, ID_CONTADOR_GERAL, usaNumeracaoPorTipo } from '../domain/numeracao';
import { UNIDADES, unidadesParaEncaminhar } from '../domain/unidades';
import { apagarArquivo } from './arquivos';
import { COLECAO_PENDENTES } from './pendentes';

// Acesso ao banco. Recebe o Firestore por parâmetro para poder ser testado no emulador.

export const TAMANHO_PAGINA = 30;

export function paraDemanda(s: QueryDocumentSnapshot): Demanda {
  return { ...(s.data() as Omit<Demanda, 'id'>), id: s.id };
}

/** Duas pessoas deram destino à mesma pendente: a segunda é avisada e nada é gravado. */
export class PendenteJaResolvida extends Error {
  constructor(public readonly numeroDemanda?: number) {
    super(numeroDemanda ? `Já virou a demanda nº ${numeroDemanda}.` : 'Esta pendente já foi resolvida.');
    this.name = 'PendenteJaResolvida';
  }
}

/**
 * Cria a demanda com o próximo número, numa transação: dois cadastros ao mesmo
 * tempo nunca recebem o mesmo número. O id do documento é o próprio número.
 * Vindo da aba Demandas Pendentes, a pendente sai da lista na mesma gravação.
 */
export async function criarDemanda(db: Firestore, dados: DadosDemanda, pendenteId?: string): Promise<number> {
  return (await criarDemandaNumerada(db, dados, pendenteId)).numero;
}

/**
 * Igual a criarDemanda, devolvendo também o nº do documento (de 2027 em diante, por tipo de saída:
 * "OFÍCIO 8BPMM-001/03/27"). Tudo na mesma transação: nº interno e nº do tipo nunca se repetem.
 */
export async function criarDemandaNumerada(
  db: Firestore,
  dados: DadosDemanda,
  pendenteId?: string,
): Promise<{ numero: number; numeroDocumento?: string }> {
  return runTransaction(db, async (tx) => {
    const refContador = doc(db, 'contadores', ID_CONTADOR_GERAL);
    const contador = await tx.get(refContador);
    const porTipo = usaNumeracaoPorTipo(dados.dataEntrada) && dados.tipoSaida !== '';
    const refTipo = porTipo ? doc(db, 'contadores', idContadorTipo(anoDe(dados.dataEntrada), dados.tipoSaida)) : null;
    const contadorTipo = refTipo ? await tx.get(refTipo) : null;
    const refPendente = pendenteId ? doc(db, COLECAO_PENDENTES, pendenteId) : null;
    const pendente = refPendente ? await tx.get(refPendente) : null;
    if (pendente && (!pendente.exists() || pendente.data().status !== 'pendente')) {
      throw new PendenteJaResolvida(pendente.exists() ? pendente.data().numeroDemanda : undefined);
    }
    const numero = (contador.exists() ? Number(contador.data().ultimo) : 0) + 1;
    const ref = doc(db, 'demandas', String(numero));

    const sequencia = contadorTipo ? (contadorTipo.exists() ? Number(contadorTipo.data().ultimo) : 0) + 1 : 0;
    const numeroDocumento = refTipo ? formatarNumeroDocumento(dados.tipoSaida, sequencia, dados.dataEntrada) : undefined;
    // O PDF da pendente (SEI / Ordem Verbal) passa para a demanda e para as Cias.
    const arq = pendente?.data()?.arquivo as { id?: string; nome?: string } | undefined;
    const arquivo = arq?.id ? { arquivoId: arq.id, arquivoNome: arq.nome || 'documento.pdf' } : {};

    tx.set(refContador, { ultimo: numero });
    if (refTipo) tx.set(refTipo, { ultimo: sequencia });
    tx.set(ref, {
      ...dados,
      numero,
      ...(numeroDocumento ? { numeroDocumento } : {}),
      ...arquivo,
      status: 'em_aberto',
      automacaoPendente: precisaAutomacao(dados),
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });
    tx.set(doc(collection(ref, 'historico')), {
      acao: 'criada',
      em: serverTimestamp(),
      ...(pendenteId ? { pendenteId } : {}),
    });
    if (refPendente) {
      tx.update(refPendente, { status: 'destinada', numeroDemanda: numero, resolvidoEm: serverTimestamp() });
    }

    // Cada Cia marcada recebe o seu encaminhamento na mesma gravação.
    const resumo = resumoDaDemanda({ ...dados, numero, numeroDocumento, ...arquivo });
    for (const unidade of unidadesParaEncaminhar(dados.destinos)) {
      tx.set(doc(db, 'encaminhamentos', idEncaminhamento(String(numero), unidade)), {
        ...novoEncaminhamento(String(numero), unidade, resumo),
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      });
    }
    return { numero, numeroDocumento };
  }, { maxAttempts: 10 });
}

export async function encaminhamentosDaDemanda(db: Firestore, demandaId: string): Promise<Encaminhamento[]> {
  const s = await getDocs(query(collection(db, 'encaminhamentos'), where('demandaId', '==', demandaId)));
  return s.docs.map((e) => ({ ...(e.data() as Omit<Encaminhamento, 'id'>), id: e.id }));
}

/** Duas pessoas mudaram o mesmo campo da mesma demanda: quem salvou por último é avisado. */
export class ConflitoEdicao extends Error {
  constructor(public readonly campos: (keyof DadosDemanda)[]) {
    super(`Campos alterados por outra pessoa: ${campos.join(', ')}`);
    this.name = 'ConflitoEdicao';
  }
}

/**
 * Grava SÓ os campos que esta pessoa mudou (em relação à versão que ela abriu), numa transação:
 * - outra pessoa mudou outros campos no meio tempo -> as duas mudanças ficam;
 * - outra pessoa mudou o MESMO campo -> nada é gravado e sobe ConflitoEdicao.
 * Também acerta os encaminhamentos das Cias e registra no histórico, tudo junto.
 */
export async function atualizarDemanda(
  db: Firestore,
  id: string,
  aberta: DadosDemanda,
  editada: DadosDemanda,
): Promise<(keyof DadosDemanda)[]> {
  const meus = camposAlterados(aberta, editada);
  if (meus.length === 0) return meus;
  const mudancas = Object.fromEntries(meus.map((c) => [c, editada[c]])) as Partial<DadosDemanda>;
  const numero = Number(id);
  const ref = doc(db, 'demandas', id);

  await runTransaction(
    db,
    async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Demanda não encontrada.');
      const atual = dadosDe({ ...(snap.data() as Omit<Demanda, 'id'>), id });
      const choque = meus.filter((c) => camposAlterados(aberta, atual).includes(c));
      if (choque.length > 0) throw new ConflitoEdicao(choque);

      // Os encaminhamentos possíveis são só 7: lidos dentro da transação para ficarem consistentes.
      const lidos = await Promise.all(
        UNIDADES.map((u) => tx.get(doc(db, 'encaminhamentos', idEncaminhamento(id, u.id)))),
      );
      const existentes = lidos
        .filter((e) => e.exists())
        .map((e) => ({ ...(e.data() as Omit<Encaminhamento, 'id'>), id: e.id }));

      // O nº do documento é dado na criação e não muda (nem trocando o tipo de saída).
      const { numeroDocumento, arquivoId, arquivoNome } = snap.data() as Partial<Demanda>;
      const final = { ...atual, ...mudancas, numero, numeroDocumento, arquivoId, arquivoNome };
      const plano = planejarEncaminhamentos(final, existentes);
      const resumo = resumoDaDemanda(final);
      const agora = serverTimestamp();

      // Cia retirada ou recolocada perde o "aceito" antigo.
      const unidadeDe = new Map(existentes.map((e) => [e.id, e.unidadeId]));
      const semAceite = [...plano.cancelar, ...plano.reativar].map((e) => unidadeDe.get(e)).filter(Boolean);
      tx.update(ref, {
        ...mudancas,
        ...(edicaoPrecisaAutomacao(meus) ? { automacaoPendente: true } : {}),
        ...(semAceite.length ? { ciasAceitas: arrayRemove(...semAceite) } : {}),
        atualizadoEm: agora,
      });
      tx.set(doc(collection(ref, 'historico')), { acao: 'editada', campos: meus, em: agora });
      for (const unidade of plano.criar) {
        tx.set(doc(db, 'encaminhamentos', idEncaminhamento(id, unidade)), {
          ...novoEncaminhamento(id, unidade, resumo),
          criadoEm: agora,
          atualizadoEm: agora,
        });
      }
      for (const e of plano.cancelar) tx.update(doc(db, 'encaminhamentos', e), { status: 'cancelado', atualizadoEm: agora });
      for (const e of plano.reativar) {
        tx.update(doc(db, 'encaminhamentos', e), {
          ...resumo,
          observacao: deleteField(),
          status: 'novo',
          resposta: '',
          respondidoPor: '',
          motivoDevolucao: '',
          atualizadoEm: agora,
        });
      }
      for (const e of plano.atualizarResumo) {
        if (!plano.reativar.includes(e)) tx.update(doc(db, 'encaminhamentos', e), { ...resumo, observacao: deleteField(), atualizadoEm: agora });
      }
    },
    { maxAttempts: 10 },
  );
  return meus;
}

/** PDF da demanda, se ainda houver (para apagar ao finalizar ou excluir). */
async function arquivoDaDemanda(db: Firestore, id: string): Promise<string | undefined> {
  const s = await getDoc(doc(db, 'demandas', id));
  return s.exists() ? (s.data() as Partial<Demanda>).arquivoId : undefined;
}

const SEM_ARQUIVO = { arquivoId: deleteField(), arquivoNome: deleteField() };

/**
 * Concluir: o que a Cia ainda devia é cancelado e o que ela já respondeu é aceito.
 * O PDF da demanda (se houver) é apagado do banco e sai da demanda e das Cias.
 * Reabrir: só a demanda volta a ficar aberta.
 */
export async function alterarStatus(db: Firestore, id: string, status: StatusDemanda): Promise<void> {
  const ref = doc(db, 'demandas', id);
  const agora = serverTimestamp();
  const arquivoId = status === 'concluido' ? await arquivoDaDemanda(db, id) : undefined;
  const lote = writeBatch(db);
  lote.update(ref, { status, atualizadoEm: agora, ...(arquivoId ? SEM_ARQUIVO : {}) });
  lote.set(doc(collection(ref, 'historico')), {
    acao: status === 'concluido' ? 'concluida' : 'reaberta',
    em: agora,
  });
  if (status === 'concluido') {
    for (const e of await encaminhamentosDaDemanda(db, id)) {
      const novo = STATUS_PENDENTES.includes(e.status) ? 'cancelado' : e.status === 'respondido' ? 'aceito' : null;
      if (novo || (arquivoId && e.arquivoId)) {
        lote.update(doc(db, 'encaminhamentos', e.id), {
          ...(novo ? { status: novo } : {}),
          ...(arquivoId && e.arquivoId ? SEM_ARQUIVO : {}),
          atualizadoEm: agora,
        });
      }
    }
  }
  await lote.commit();
  if (arquivoId) await apagarArquivo(db, arquivoId);
}

/**
 * Exclui a demanda: sai do Numerador, das Cias (os encaminhamentos são apagados) e do Checklist Operações.
 * O número não é reaproveitado; o PDF da demanda (se houver) é apagado. O motor apaga os eventos dela nas agendas (a pasta do Drive fica).
 */
export async function excluirDemanda(db: Firestore, id: string): Promise<void> {
  const ref = doc(db, 'demandas', id);
  const agora = serverTimestamp();
  const encs = await encaminhamentosDaDemanda(db, id);
  const arquivoId = await arquivoDaDemanda(db, id);
  const lote = writeBatch(db);
  lote.update(ref, {
    status: 'excluido',
    excluidoEm: agora,
    automacaoPendente: true,
    atualizadoEm: agora,
    ...(arquivoId ? SEM_ARQUIVO : {}),
  });
  lote.set(doc(collection(ref, 'historico')), { acao: 'excluida', em: agora });
  for (const e of encs) lote.delete(doc(db, 'encaminhamentos', e.id));
  lote.delete(doc(db, 'operacoes', id));
  await lote.commit();
  if (arquivoId) await apagarArquivo(db, arquivoId);
}

/** Uma demanda em tempo real (para ver o motor terminar a agenda/pasta). */
export function observarDemanda(
  db: Firestore,
  id: string,
  aoMudar: (d: Demanda | null) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, 'demandas', id),
    (s) => aoMudar(s.exists() ? { ...(s.data() as Omit<Demanda, 'id'>), id: s.id } : null),
    aoFalhar,
  );
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
