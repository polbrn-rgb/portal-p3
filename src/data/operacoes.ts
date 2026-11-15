import { collection, doc, onSnapshot, query, setDoc, serverTimestamp, where, type Firestore } from 'firebase/firestore';
import {
  CATEGORIA_OPERACAO,
  operacoesEmAndamento,
  TIPOS_SAIDA_OPERACAO,
  type Checklist,
  type ItemChecklist,
  type Operacao,
} from '../domain/operacao';
import type { Demanda } from '../domain/demanda';
import { paraDemanda } from './demandas';

// Checklist Operações (coleção "operacoes", id = número da demanda; só a P/3 acessa).

/**
 * Operações em andamento, em tempo real: as demandas Ordem de Serviço + Operações Policiais
 * do Numerador, cada uma com o seu checklist.
 */
export function observarOperacoes(
  db: Firestore,
  aoMudar: (lista: Operacao[]) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  let demandas: Demanda[] | null = null;
  let checklists: Record<string, Partial<Checklist>> | null = null;
  const avisar = () => {
    if (demandas && checklists) aoMudar(operacoesEmAndamento(demandas, checklists));
  };
  const q = query(
    collection(db, 'demandas'),
    where('tipoSaida', 'in', [...TIPOS_SAIDA_OPERACAO]),
    where('categoria', '==', CATEGORIA_OPERACAO),
  );
  const pararDemandas = onSnapshot(
    q,
    (s) => {
      demandas = s.docs.map(paraDemanda);
      avisar();
    },
    aoFalhar,
  );
  const pararChecklists = onSnapshot(
    collection(db, 'operacoes'),
    (s) => {
      checklists = Object.fromEntries(s.docs.map((d) => [d.id, d.data() as Partial<Checklist>]));
      avisar();
    },
    aoFalhar,
  );
  return () => {
    pararDemandas();
    pararChecklists();
  };
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

export function concluirOperacao(db: Firestore, numero: string, concluida = true) {
  return salvar(db, numero, { concluida });
}
