import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { fimDaSerie, normalizarCompromisso, validarCompromisso, type Compromisso, type DadosCompromisso, type DonoAgenda } from '../domain/agenda';
import { somarDias } from '../domain/datas';
import type { Demanda } from '../domain/demanda';
import { paraDemanda } from './demandas';

function paraCompromisso(x: QueryDocumentSnapshot): Compromisso {
  const d = x.data() as Omit<Compromisso, 'id' | 'excecoes'> & { excecoes?: string[] };
  return { ...d, excecoes: d.excecoes ?? [], id: x.id };
}

// Eventos da agenda da P/3 (coleção "agenda"). Só a P/3 lê e grava.
export const COLECAO_AGENDA = 'agenda';
// Agendas das Cias/FT e da Sala (coleção "agendaSetores", campo "dono"): cada uma só lê e grava a sua.
export const COLECAO_AGENDA_SETORES = 'agendaSetores';

const colecaoDe = (dono: DonoAgenda) => (dono === 'p3' ? COLECAO_AGENDA : COLECAO_AGENDA_SETORES);
/** A agenda da P/3 liga eventos ao Numerador; as das Cias não. */
const semDemanda = (d: DadosCompromisso, dono: DonoAgenda): DadosCompromisso =>
  dono === 'p3' ? d : { ...d, demandaId: '', demandaNumero: null, demandaTitulo: '' };
/** Início/Término Btl: procura operações que começaram até X dias antes da tela (e ainda estão correndo). */
const DIAS_OPERACAO_LONGA = 120;

function erroDeValidacao(dados: DadosCompromisso): void {
  const erros = Object.values(validarCompromisso(dados));
  if (erros.length) throw new Error(erros[0]);
}

export async function criarCompromisso(db: Firestore, dados: DadosCompromisso, criadoPor: string, dono: DonoAgenda = 'p3'): Promise<string> {
  erroDeValidacao(dados);
  const d = normalizarCompromisso(semDemanda(dados, dono));
  const ref = await addDoc(collection(db, colecaoDe(dono)), {
    ...d,
    ...(dono === 'p3' ? {} : { dono }),
    fimSerie: fimDaSerie(d),
    excecoes: [],
    criadoPor,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });
  return ref.id;
}

export async function atualizarCompromisso(db: Firestore, id: string, dados: DadosCompromisso, por: string, dono: DonoAgenda = 'p3'): Promise<void> {
  erroDeValidacao(dados);
  const d = normalizarCompromisso(semDemanda(dados, dono));
  await updateDoc(doc(db, colecaoDe(dono), id), { ...d, fimSerie: fimDaSerie(d), atualizadoPor: por, atualizadoEm: serverTimestamp() });
}

export async function excluirCompromisso(db: Firestore, id: string, dono: DonoAgenda = 'p3'): Promise<void> {
  await deleteDoc(doc(db, colecaoDe(dono), id));
}

/** Evento que se repete: apaga só um dia da série. */
export async function excluirOcorrencia(db: Firestore, id: string, dia: string, por: string, dono: DonoAgenda = 'p3'): Promise<void> {
  await updateDoc(doc(db, colecaoDe(dono), id), { excecoes: arrayUnion(dia), atualizadoPor: por, atualizadoEm: serverTimestamp() });
}

/** Eventos (e séries) que ainda aparecem a partir de `de`; os que começam depois de `ate` ficam de fora. */
export function observarCompromissos(
  db: Firestore,
  de: string,
  ate: string,
  aoMudar: (lista: Compromisso[]) => void,
  aoFalhar: (erro: Error) => void,
  dono: DonoAgenda = 'p3',
): () => void {
  const q =
    dono === 'p3'
      ? query(collection(db, COLECAO_AGENDA), where('fimSerie', '>=', de))
      : query(collection(db, COLECAO_AGENDA_SETORES), where('dono', '==', dono), where('fimSerie', '>=', de));
  return onSnapshot(
    q,
    (s) =>
      aoMudar(
        s.docs
          .map(paraCompromisso)
          .filter((c) => c.data <= ate),
      ),
    aoFalhar,
  );
}

/**
 * Integração com o Numerador: demandas com Prazo CPA, Prazo Cia ou Início/Término Btl dentro do período.
 * Três buscas pequenas (uma por data) em vez de ler o numerador inteiro.
 */
export function observarDemandasDoPeriodo(
  db: Firestore,
  de: string,
  ate: string,
  aoMudar: (lista: Demanda[]) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  const buscas = [
    query(collection(db, 'demandas'), where('prazoCPA', '>=', de), where('prazoCPA', '<=', ate)),
    query(collection(db, 'demandas'), where('prazoCia', '>=', de), where('prazoCia', '<=', ate)),
    query(collection(db, 'demandas'), where('inicioBtl', '>=', somarDias(de, -DIAS_OPERACAO_LONGA)), where('inicioBtl', '<=', ate)),
  ];
  const partes: (Demanda[] | undefined)[] = buscas.map(() => undefined);
  const juntar = () => {
    if (partes.some((p) => p === undefined)) return;
    const porId = new Map<string, Demanda>();
    for (const p of partes) for (const d of p!) porId.set(d.id, d);
    aoMudar([...porId.values()]);
  };
  const parar = buscas.map((q, i) =>
    onSnapshot(
      q,
      (s) => {
        partes[i] = s.docs.map(paraDemanda);
        juntar();
      },
      aoFalhar,
    ),
  );
  return () => parar.forEach((p) => p());
}

/** Liga um evento a uma demanda pelo número (o que a P/3 vê na lista do Numerador). */
export async function buscarDemandaPorNumero(db: Firestore, numero: number): Promise<Demanda | null> {
  const s = await getDocs(query(collection(db, 'demandas'), where('numero', '==', numero), limit(1)));
  const d = s.empty ? null : paraDemanda(s.docs[0]);
  return d && d.status !== 'excluido' ? d : null;
}

/** Eventos da agenda ligados a uma demanda (tela da demanda no Numerador). */
export function observarCompromissosDaDemanda(
  db: Firestore,
  demandaId: string,
  aoMudar: (lista: Compromisso[]) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  return onSnapshot(
    query(collection(db, COLECAO_AGENDA), where('demandaId', '==', demandaId)),
    (s) => aoMudar(s.docs.map(paraCompromisso).sort((a, b) => (a.data < b.data ? -1 : 1))),
    aoFalhar,
  );
}
