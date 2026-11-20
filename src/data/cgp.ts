import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
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
import {
  COLECAO_FOTOS_CGP,
  COLECAO_FOTOS_CGP_DADOS,
  COLECAO_MISSOES_CGP,
  COLECAO_RECADOS_CGP,
  idMissaoCgp,
  validarFotoCgp,
  validarPeriodo,
  type DadosFotoCgp,
  type FotoCgp,
  type MissaoCgp,
  type OrigemMissaoCgp,
  type PeriodoCgp,
} from '../domain/cgp';
import { validarRecado } from '../domain/recado';
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

/** A Cia tira a missão do CGP (aí a demanda pode ser enviada de novo). */
export async function excluirMissaoCgp(db: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(db, COLECAO_MISSOES_CGP, id));
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
