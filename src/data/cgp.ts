import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore';
import {
  COLECAO_FOTOS_CGP,
  COLECAO_FOTOS_CGP_DADOS,
  COLECAO_MISSOES_CGP,
  COLECAO_ORDENS_CGP,
  COLECAO_RECADOS_CGP,
  idMissaoCgp,
  validarFotoCgp,
  validarLinkOrdem,
  validarPdfOrdem,
  validarPeriodo,
  type DadosFotoCgp,
  type FotoCgp,
  type MissaoCgp,
  type OrdemCgp,
  type OrigemMissaoCgp,
  type PeriodoCgp,
} from '../domain/cgp';
import { dividirEmPartes } from '../domain/icc';
import { validarRecado } from '../domain/recado';
import { base64ParaBlob, paraBase64 } from './arquivos';
import type { UnidadeId } from '../domain/unidades';
import type { FotoReduzida } from '../lib/imagem';

// CGP de cada Cia/FT (ver domain/cgp.ts). Tudo filtrado pela Cia: uma não vê o CGP da outra.

const quando = (t: unknown): Date | null => (t as Timestamp | null | undefined)?.toDate?.() ?? null;
const dadosDe = (d: { data: (o: { serverTimestamps: 'estimate' }) => DocumentData }) => d.data({ serverTimestamps: 'estimate' });

/** Esta demanda já foi para o CGP (por outra pessoa, em outro aparelho…). */
export class JaEnviadaAoCgp extends Error {
  constructor() {
    super('Esta demanda já foi enviada para o CGP.');
    this.name = 'JaEnviadaAoCgp';
  }
}

export async function enviarAoCgp(
  db: Firestore,
  m: { unidade: UnidadeId; origem: OrigemMissaoCgp; refId: string; numero: string; titulo: string; periodo: PeriodoCgp; criadoPor: string },
): Promise<string> {
  const erros = Object.values(validarPeriodo(m.periodo));
  if (erros.length) throw new Error(erros[0]);
  const ref = doc(db, COLECAO_MISSOES_CGP, idMissaoCgp(m.unidade, m.origem, m.refId));
  await runTransaction(db, async (tx) => {
    if ((await tx.get(ref)).exists()) throw new JaEnviadaAoCgp();
    tx.set(ref, {
      unidadeId: m.unidade,
      origem: m.origem,
      refId: m.refId,
      numero: m.numero,
      titulo: m.titulo.trim().slice(0, 300),
      inicio: m.periodo.inicio,
      fim: m.periodo.fim,
      criadoPor: m.criadoPor,
      criadoEm: serverTimestamp(),
    });
  });
  return ref.id;
}

/** A Cia tira a missão do CGP (aí a demanda pode ser enviada de novo). A ordem de serviço sai junto. */
export async function excluirMissaoCgp(db: Firestore, id: string): Promise<void> {
  await apagarOrdemCgp(db, id);
  await deleteDoc(doc(db, COLECAO_MISSOES_CGP, id));
}

// ---------- Ordem de serviço da missão (PDF em partes ou link do Drive; mesmo id da missão) ----------

type MissaoDaOrdem = Pick<MissaoCgp, 'id' | 'unidadeId' | 'fim'>;

/** Anexa o PDF da ordem (troca a que já houver). As partes vão antes; o cabeçalho por último. */
export async function anexarOrdemPdf(
  db: Firestore,
  m: MissaoDaOrdem,
  arquivo: File,
  enviadoPor: string,
  aoProgredir?: (feito: number) => void,
): Promise<void> {
  const erro = validarPdfOrdem(arquivo);
  if (erro) throw new Error(erro);
  await apagarOrdemCgp(db, m.id);
  const partes = dividirEmPartes(await paraBase64(arquivo));
  for (let i = 0; i < partes.length; i++) {
    await setDoc(doc(db, COLECAO_ORDENS_CGP, m.id, 'partes', String(i)), { dados: partes[i] });
    aoProgredir?.((i + 1) / partes.length);
  }
  await setDoc(doc(db, COLECAO_ORDENS_CGP, m.id), {
    unidadeId: m.unidadeId,
    tipo: 'pdf',
    nome: arquivo.name.slice(0, 200) || 'ordem-de-servico.pdf',
    tamanho: arquivo.size,
    partes: partes.length,
    fim: m.fim,
    enviadoPor,
    enviadoEm: serverTimestamp(),
  });
}

/** Anexa o link do Google Drive (troca a ordem que já houver). */
export async function anexarOrdemLink(db: Firestore, m: MissaoDaOrdem, link: string, enviadoPor: string): Promise<void> {
  const erro = validarLinkOrdem(link);
  if (erro) throw new Error(erro);
  await apagarOrdemCgp(db, m.id);
  await setDoc(doc(db, COLECAO_ORDENS_CGP, m.id), {
    unidadeId: m.unidadeId,
    tipo: 'link',
    nome: 'Ordem de serviço (Google Drive)',
    link: link.trim(),
    fim: m.fim,
    enviadoPor,
    enviadoEm: serverTimestamp(),
  });
}

/** Tira a ordem da missão (cabeçalho e partes). Sem ordem, não faz nada. */
export async function apagarOrdemCgp(db: Firestore, missaoId: string): Promise<void> {
  // O cabeçalho primeiro: sem ele a ordem já não aparece para o CGP.
  await deleteDoc(doc(db, COLECAO_ORDENS_CGP, missaoId));
  const partes = await getDocs(collection(db, COLECAO_ORDENS_CGP, missaoId, 'partes'));
  await Promise.all(partes.docs.map((p) => deleteDoc(p.ref)));
}

export function observarOrdensCgp(db: Firestore, unidade: UnidadeId, ok: (l: OrdemCgp[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, COLECAO_ORDENS_CGP), where('unidadeId', '==', unidade)),
    (s) =>
      ok(
        s.docs.map((d) => {
          const x = dadosDe(d);
          return { ...(x as Omit<OrdemCgp, 'id' | 'enviadoEm'>), id: d.id, enviadoEm: quando(x.enviadoEm) };
        }),
      ),
    erro,
  );
}

/** O PDF da ordem, montado das partes. */
export async function lerOrdemPdf(db: Firestore, missaoId: string): Promise<{ nome: string; blob: Blob }> {
  const cab = await getDoc(doc(db, COLECAO_ORDENS_CGP, missaoId));
  if (!cab.exists() || cab.data().tipo !== 'pdf') throw new Error('Ordem de serviço não encontrada.');
  const { nome, partes } = cab.data() as { nome: string; partes: number };
  const lidas = await getDocs(collection(db, COLECAO_ORDENS_CGP, missaoId, 'partes'));
  const porOrdem = lidas.docs.sort((a, b) => Number(a.id) - Number(b.id)).map((d) => String(d.data().dados ?? ''));
  if (porOrdem.length !== partes) throw new Error('Ordem de serviço incompleta.');
  return { nome, blob: base64ParaBlob(porOrdem.join(''), 'application/pdf') };
}

export function observarMissoesCgp(db: Firestore, unidade: UnidadeId, ok: (l: MissaoCgp[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, COLECAO_MISSOES_CGP), where('unidadeId', '==', unidade)),
    (s) =>
      ok(
        s.docs.map((d) => {
          const x = dadosDe(d);
          return { ...(x as Omit<MissaoCgp, 'id' | 'criadoEm'>), id: d.id, criadoEm: quando(x.criadoEm) };
        }),
      ),
    erro,
  );
}

// ---------- Recados (a Cia escreve para o CGP) ----------

export type RecadoCgp = { id: string; texto: string; criadoPor: string; criadoEm: Date | null };

export async function enviarRecadoCgp(db: Firestore, unidade: UnidadeId, texto: string, criadoPor: string): Promise<string> {
  const erro = validarRecado(texto);
  if (erro) throw new Error(erro);
  const ref = await addDoc(collection(db, COLECAO_RECADOS_CGP), { unidadeId: unidade, texto: texto.trim(), criadoPor, criadoEm: serverTimestamp() });
  return ref.id;
}

export async function apagarRecadoCgp(db: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(db, COLECAO_RECADOS_CGP, id));
}

export function observarRecadosCgp(db: Firestore, unidade: UnidadeId, ok: (l: RecadoCgp[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, COLECAO_RECADOS_CGP), where('unidadeId', '==', unidade), orderBy('criadoEm', 'desc'), limit(20)),
    (s) =>
      ok(
        s.docs.map((d) => {
          const x = dadosDe(d);
          return { id: d.id, texto: x.texto, criadoPor: x.criadoPor ?? '', criadoEm: quando(x.criadoEm) };
        }),
      ),
    erro,
  );
}

// ---------- Fotos (sem limite; a foto e o resumo vão juntos, mesmo id) ----------

export async function enviarFotosCgp(
  db: Firestore,
  unidade: UnidadeId,
  dados: DadosFotoCgp,
  fotos: FotoReduzida[],
  enviadoPor: string,
  aoEnviar?: (feitas: number) => void,
): Promise<number> {
  const erros = Object.values(validarFotoCgp(dados, fotos.length));
  if (erros.length) throw new Error(erros[0]);
  let feitas = 0;
  for (const f of fotos) {
    const ref = doc(collection(db, COLECAO_FOTOS_CGP));
    const lote = writeBatch(db);
    lote.set(doc(db, COLECAO_FOTOS_CGP_DADOS, ref.id), { unidadeId: unidade, dados: f.dados });
    lote.set(ref, {
      unidadeId: unidade,
      descricao: dados.descricao.trim(),
      local: dados.local.trim(),
      observacao: dados.observacao.trim(),
      miniatura: f.miniatura,
      tamanho: f.dados.length,
      enviadoPor,
      enviadoEm: serverTimestamp(),
    });
    await lote.commit();
    feitas++;
    aoEnviar?.(feitas);
  }
  return feitas;
}

export function observarFotosCgp(db: Firestore, unidade: UnidadeId, ok: (l: FotoCgp[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, COLECAO_FOTOS_CGP), where('unidadeId', '==', unidade)),
    (s) =>
      ok(
        s.docs
          .map((d) => {
            const x = dadosDe(d);
            return {
              id: d.id,
              unidadeId: x.unidadeId,
              descricao: x.descricao ?? '',
              local: x.local ?? '',
              observacao: x.observacao ?? '',
              miniatura: x.miniatura ?? '',
              enviadoPor: x.enviadoPor ?? '',
              enviadoEm: quando(x.enviadoEm),
            };
          })
          .sort((a, b) => (b.enviadoEm?.getTime() ?? 0) - (a.enviadoEm?.getTime() ?? 0)),
      ),
    erro,
  );
}

/** A foto em tamanho cheio (base64 JPEG). */
export async function lerFotoCgp(db: Firestore, id: string): Promise<string> {
  const s = await getDoc(doc(db, COLECAO_FOTOS_CGP_DADOS, id));
  if (!s.exists()) throw new Error('Foto não encontrada.');
  return String(s.data().dados ?? '');
}

export async function apagarFotoCgp(db: Firestore, id: string): Promise<void> {
  const lote = writeBatch(db);
  lote.delete(doc(db, COLECAO_FOTOS_CGP_DADOS, id));
  lote.delete(doc(db, COLECAO_FOTOS_CGP, id));
  await lote.commit();
}
