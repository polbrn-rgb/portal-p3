import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Firestore,
  type Transaction,
} from 'firebase/firestore';
import { compromissoVazio, fimDaSerie, normalizarCompromisso } from '../domain/agenda';
import {
  anoDe,
  COLECAO_CONTADORES_CIA,
  COLECAO_DEMANDAS_CIA,
  formatarNumeroCia,
  idContadorCia,
  normalizarDemandaCia,
  tituloDoPrazo,
  validarDemandaCia,
  type DadosDemandaCia,
  type DemandaCia,
  type StatusDemandaCia,
} from '../domain/numeradorCia';
import type { UnidadeId } from '../domain/unidades';
import { COLECAO_AGENDA_SETORES } from './agenda';

// Numerador de cada Cia/FT: cria a demanda com o próximo número (transação: dois cadastros ao mesmo tempo
// nunca recebem o mesmo número) e, se tiver prazo, o evento na agenda da própria Cia, na mesma gravação.

const idAgendaDe = (demandaId: string) => `numerador_${demandaId}`;

function erroDeValidacao(d: DadosDemandaCia): void {
  const erros = Object.values(validarDemandaCia(d));
  if (erros.length) throw new Error(erros[0]);
}

/** Grava (inteiro) o evento do prazo na agenda da Cia. set em vez de update: se a Cia apagou o evento, ele volta. */
function gravarEventoDoPrazo(
  tx: Transaction,
  db: Firestore,
  p: { unidade: UnidadeId; demandaId: string; dados: DadosDemandaCia; numeroDocumento: string; status: StatusDemandaCia; criadoPor: string },
): void {
  const concluida = p.status === 'concluida';
  const base = normalizarCompromisso({
    ...compromissoVazio(p.dados.prazo),
    titulo: `${concluida ? '✔ ' : ''}${tituloDoPrazo(p.numeroDocumento, p.dados.saida)}`.slice(0, 200),
    descricao: [p.dados.responsavel && `Responsável: ${p.dados.responsavel}`, p.dados.observacao].filter(Boolean).join('\n').slice(0, 5000),
    cor: concluida ? 'verde' : 'laranja',
  });
  tx.set(doc(db, COLECAO_AGENDA_SETORES, idAgendaDe(p.demandaId)), {
    ...base,
    dono: p.unidade,
    fimSerie: fimDaSerie(base),
    excecoes: [],
    demandaCiaId: p.demandaId,
    criadoPor: p.criadoPor,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  });
}

/** Apaga o evento do prazo (se a Cia já tiver apagado na agenda, não faz nada). */
async function apagarEventoDoPrazo(db: Firestore, agendaId: string): Promise<void> {
  if (!agendaId) return;
  await deleteDoc(doc(db, COLECAO_AGENDA_SETORES, agendaId)).catch(() => undefined);
}

export async function criarDemandaCia(
  db: Firestore,
  unidade: UnidadeId,
  bruto: DadosDemandaCia,
  criadoPor: string,
): Promise<{ id: string; numeroDocumento: string }> {
  erroDeValidacao(bruto);
  const dados = normalizarDemandaCia(bruto);
  const ano = anoDe(dados.dataEntrada);
  return runTransaction(
    db,
    async (tx) => {
      const refContador = doc(db, COLECAO_CONTADORES_CIA, idContadorCia(unidade, ano, dados.tipoSaida));
      const contador = await tx.get(refContador);
      const sequencia = (contador.exists() ? Number(contador.data().ultimo) : 0) + 1;
      const id = `${refContador.id}_${sequencia}`;
      const numeroDocumento = formatarNumeroCia(dados.tipoSaida, unidade, sequencia, dados.dataEntrada);
      const agendaId = dados.prazo ? idAgendaDe(id) : '';

      tx.set(refContador, { ultimo: sequencia, unidadeId: unidade });
      tx.set(doc(db, COLECAO_DEMANDAS_CIA, id), {
        ...dados,
        unidadeId: unidade,
        contadorId: refContador.id,
        ano,
        sequencia,
        numeroDocumento,
        status: 'em_aberto',
        agendaId,
        criadoPor,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      });
      if (agendaId) gravarEventoDoPrazo(tx, db, { unidade, demandaId: id, dados, numeroDocumento, status: 'em_aberto', criadoPor });
      return { id, numeroDocumento };
    },
    { maxAttempts: 10 },
  );
}

/** Edita os dados (o número e o tipo de saída não mudam) e acerta o evento da agenda. */
export async function atualizarDemandaCia(db: Firestore, d: DemandaCia, bruto: DadosDemandaCia, por: string): Promise<void> {
  erroDeValidacao(bruto);
  const dados = { ...normalizarDemandaCia(bruto), tipoSaida: d.tipoSaida, dataEntrada: d.dataEntrada };
  const agendaId = dados.prazo ? idAgendaDe(d.id) : '';
  await runTransaction(db, async (tx) => {
    tx.update(doc(db, COLECAO_DEMANDAS_CIA, d.id), { ...dados, agendaId, atualizadoPor: por, atualizadoEm: serverTimestamp() });
    if (agendaId) {
      gravarEventoDoPrazo(tx, db, { unidade: d.unidadeId, demandaId: d.id, dados, numeroDocumento: d.numeroDocumento, status: d.status, criadoPor: d.criadoPor });
    }
  });
  if (!agendaId) await apagarEventoDoPrazo(db, d.agendaId);
}

/** Concluir / reabrir: o evento da agenda fica verde com ✔ (ou volta a laranja). */
export async function alterarStatusDemandaCia(db: Firestore, d: DemandaCia, status: StatusDemandaCia, por: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    tx.update(doc(db, COLECAO_DEMANDAS_CIA, d.id), { status, atualizadoPor: por, atualizadoEm: serverTimestamp() });
    if (d.agendaId && d.prazo) {
      gravarEventoDoPrazo(tx, db, { unidade: d.unidadeId, demandaId: d.id, dados: d, numeroDocumento: d.numeroDocumento, status, criadoPor: d.criadoPor });
    }
  });
}

/** Exclui a demanda e o evento do prazo. O número não volta (não se repete). */
export async function excluirDemandaCia(db: Firestore, d: DemandaCia): Promise<void> {
  await deleteDoc(doc(db, COLECAO_DEMANDAS_CIA, d.id));
  await apagarEventoDoPrazo(db, d.agendaId);
}

export function observarDemandasCia(
  db: Firestore,
  unidade: UnidadeId,
  aoMudar: (lista: DemandaCia[]) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  return onSnapshot(
    query(collection(db, COLECAO_DEMANDAS_CIA), where('unidadeId', '==', unidade)),
    (s) => aoMudar(s.docs.map((x) => ({ ...(x.data() as Omit<DemandaCia, 'id'>), id: x.id }))),
    aoFalhar,
  );
}
