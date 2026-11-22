import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import {
  CAMPO_OPERACAO_ENCERRADA,
  CATEGORIA_OPERACAO,
  emGrupos,
  MIGRACAO_CAMPO_OPERACAO,
  operacoesEmAndamento,
  planoCampoOperacao,
  TIPOS_SAIDA_OPERACAO,
  type Checklist,
  type ItemChecklist,
  type Operacao,
} from '../domain/operacao';
import type { Demanda } from '../domain/demanda';
import { paraDemanda } from './demandas';

// Checklist Operações (coleção "operacoes", id = número da demanda; só a P/3 acessa).

/** Todas as demandas de operação (Ordem de Serviço/Operações + Operações Policiais), concluídas ou não. */
function todasAsOperacoes(db: Firestore) {
  return query(
    collection(db, 'demandas'),
    where('tipoSaida', 'in', [...TIPOS_SAIDA_OPERACAO]),
    where('categoria', '==', CATEGORIA_OPERACAO),
  );
}

/**
 * Operações em andamento, em tempo real: as demandas Ordem de Serviço + Operações Policiais
 * do Numerador ainda não concluídas, cada uma com o seu checklist.
 * Lê só as em andamento (campo operacaoEncerrada = false) e só os checklists delas: o menu da P/3 fica
 * ligado o dia todo, e ler todas as operações do ano a cada abertura gastaria a cota grátis do Firebase.
 */
export function observarOperacoes(
  db: Firestore,
  aoMudar: (lista: Operacao[]) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  let demandas: Demanda[] | null = null;
  // Checklists por grupo de até 30 ids (limite do filtro "in"); null = grupo ainda carregando.
  let grupos: { chave: string; parar: () => void; checklists: Record<string, Partial<Checklist>> | null }[] = [];
  let parado = false;

  const avisar = () => {
    if (parado || !demandas || grupos.some((g) => !g.checklists)) return;
    const checklists = Object.assign({}, ...grupos.map((g) => g.checklists));
    aoMudar(operacoesEmAndamento(demandas, checklists));
  };

  /** Liga um ouvinte por grupo de ids; só refaz os grupos que mudaram (não relê checklist à toa). */
  const ouvirChecklists = (ids: string[]) => {
    const novos = emGrupos([...ids].sort()).map((g) => g.join('|'));
    const antigos = new Map(grupos.map((g) => [g.chave, g]));
    for (const g of grupos) if (!novos.includes(g.chave)) g.parar();
    grupos = novos.map((chave) => {
      const ja = antigos.get(chave);
      if (ja) return ja;
      const grupo: (typeof grupos)[number] = { chave, parar: () => undefined, checklists: null };
      grupo.parar = onSnapshot(
        query(collection(db, 'operacoes'), where(documentId(), 'in', chave.split('|'))),
        (s) => {
          grupo.checklists = Object.fromEntries(s.docs.map((d) => [d.id, d.data() as Partial<Checklist>]));
          avisar();
        },
        aoFalhar,
      );
      return grupo;
    });
  };

  const pararDemandas = onSnapshot(
    query(todasAsOperacoes(db), where(CAMPO_OPERACAO_ENCERRADA, '==', false)),
    (s) => {
      demandas = s.docs.map(paraDemanda);
      ouvirChecklists(demandas.map((d) => d.id));
      avisar();
    },
    aoFalhar,
  );
  return () => {
    parado = true;
    pararDemandas();
    for (const g of grupos) g.parar();
  };
}

/**
 * Uma vez só (a P/3 roda ao abrir o portal): as demandas de operação criadas antes do campo
 * operacaoEncerrada recebem o valor do checklist. Depois disso custa 1 leitura (o aviso em config/migracoes).
 */
export async function prepararCampoOperacao(db: Firestore): Promise<number> {
  const marca = doc(db, 'config', 'migracoes');
  if ((await getDoc(marca)).data()?.[MIGRACAO_CAMPO_OPERACAO] === true) return 0;
  const [demandas, checklists] = await Promise.all([getDocs(todasAsOperacoes(db)), getDocs(collection(db, 'operacoes'))]);
  const concluidas = new Set(checklists.docs.filter((d) => d.data().concluida === true).map((d) => d.id));
  const plano = planoCampoOperacao(
    demandas.docs.map((d) => ({ id: d.id, operacaoEncerrada: d.data()[CAMPO_OPERACAO_ENCERRADA] })),
    concluidas,
  );
  for (const grupo of emGrupos(plano, 400)) {
    const lote = writeBatch(db);
    for (const p of grupo) lote.update(doc(db, 'demandas', p.id), { [CAMPO_OPERACAO_ENCERRADA]: p.valor });
    await lote.commit();
  }
  await setDoc(marca, { [MIGRACAO_CAMPO_OPERACAO]: true }, { merge: true });
  return plano.length;
}

function salvar(db: Firestore, numero: string, dados: Record<string, unknown>) {
  return setDoc(doc(db, 'operacoes', numero), { ...dados, atualizadoEm: serverTimestamp() }, { merge: true });
}

export function marcarItem(db: Firestore, numero: string, item: ItemChecklist, valor: boolean) {
  return salvar(db, numero, { [item]: valor });
}

/** Protocolo do Mapa Força de um dia; se a planilha já existe, o motor atualiza a linha 2. */
export function salvarProtocolo(db: Firestore, numero: string, dia: string, protocolo: string) {
  return salvar(db, numero, { protocolos: { [dia]: protocolo.trim() }, planilhaDesatualizada: true });
}

/** Pede ao motor a cópia do modelo de resultados na pasta do CFP. */
export function pedirPlanilha(db: Firestore, numero: string) {
  return salvar(db, numero, { resultadoOk: true, planilha: { status: 'pedida' } });
}

/** Datas da operação mudaram depois de gerar a planilha: o motor reescreve as linhas 1 e 2. */
export function atualizarPlanilha(db: Firestore, numero: string) {
  return salvar(db, numero, { planilhaDesatualizada: true });
}

/** Conclui (ou desfaz) no checklist e na demanda, juntos: a demanda sai (ou volta) da lista em andamento. */
export function concluirOperacao(db: Firestore, numero: string, concluida = true) {
  const lote = writeBatch(db);
  lote.set(doc(db, 'operacoes', numero), { concluida, atualizadoEm: serverTimestamp() }, { merge: true });
  lote.update(doc(db, 'demandas', numero), { [CAMPO_OPERACAO_ENCERRADA]: concluida });
  return lote.commit();
}
