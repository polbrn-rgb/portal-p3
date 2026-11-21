import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where, type Firestore } from 'firebase/firestore';
import {
  configParaMotor,
  idEnvio,
  versaoConfig,
  type EnvioMensal,
  type EstadoDocumento,
  type ValoresEnvio,
} from '../domain/documentosMensais';
import type { UnidadeId } from '../domain/unidades';

// Documentos Mensais: envios das Cias ("docsMensais", id = doc_mes_unidade), estado de cada planilha
// ("estadoDocsMensais", gravado pelo motor; a P/3 pede o arquivo e marca "feito") e a configuração que o motor lê.

function paraEnvio(id: string, x: Partial<EnvioMensal>): EnvioMensal {
  return {
    id,
    docId: x.docId ?? '',
    mesRef: x.mesRef ?? '',
    unidadeId: x.unidadeId as UnidadeId,
    valores: x.valores ?? {},
    respondidoPor: x.respondidoPor ?? '',
    gravado: x.gravado === true,
    erro: x.erro || undefined,
    daProducao: x.daProducao && typeof x.daProducao === 'object' ? x.daProducao : undefined,
  };
}

export async function enviarDocMensal(
  db: Firestore,
  p: { docId: string; mesRef: string; unidadeId: UnidadeId; valores: ValoresEnvio; respondidoPor: string; daProducao?: Record<string, number> },
): Promise<void> {
  if (!p.respondidoPor.trim()) throw new Error('Informe quem preencheu.');
  const { daProducao, ...resto } = p;
  await setDoc(doc(db, 'docsMensais', idEnvio(p.docId, p.mesRef, p.unidadeId)), {
    ...resto,
    ...(daProducao && Object.keys(daProducao).length ? { daProducao } : {}),
    respondidoPor: p.respondidoPor.trim(),
    gravado: false,
    erro: '',
    enviadoEm: serverTimestamp(),
  });
}

/** Os envios da Cia no mês de referência. */
export function observarEnviosDaUnidade(
  db: Firestore,
  unidadeId: UnidadeId,
  mesRef: string,
  aoMudar: (l: EnvioMensal[]) => void,
  aoFalhar: (e: Error) => void,
): () => void {
  const q = query(collection(db, 'docsMensais'), where('unidadeId', '==', unidadeId), where('mesRef', '==', mesRef));
  return onSnapshot(q, (s) => aoMudar(s.docs.map((d) => paraEnvio(d.id, d.data()))), aoFalhar);
}

/** Todos os envios do mês (P/3). */
export function observarEnviosDoMes(db: Firestore, mesRef: string, aoMudar: (l: EnvioMensal[]) => void, aoFalhar: (e: Error) => void) {
  return onSnapshot(
    query(collection(db, 'docsMensais'), where('mesRef', '==', mesRef)),
    (s) => aoMudar(s.docs.map((d) => paraEnvio(d.id, d.data()))),
    aoFalhar,
  );
}

export function observarEstados(db: Firestore, aoMudar: (e: Record<string, EstadoDocumento>) => void, aoFalhar: (e: Error) => void) {
  return onSnapshot(
    collection(db, 'estadoDocsMensais'),
    (s) => aoMudar(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as EstadoDocumento]))),
    aoFalhar,
  );
}

export async function pedirArquivamento(db: Firestore, docId: string, mesRef: string): Promise<void> {
  await setDoc(doc(db, 'estadoDocsMensais', docId), { pedidoArquivar: mesRef }, { merge: true });
}

export async function marcarFeito(db: Firestore, docId: string, mesRef: string, feito: boolean): Promise<void> {
  await setDoc(doc(db, 'estadoDocsMensais', docId), { feitos: { [mesRef]: feito } }, { merge: true });
}

/** A P/3 publica a configuração para o motor quando ela muda (ao abrir a aba). */
export async function publicarConfig(db: Firestore): Promise<boolean> {
  const ref = doc(db, 'config', 'documentosMensais');
  const versao = versaoConfig();
  if ((await getDoc(ref)).data()?.versao === versao) return false;
  await setDoc(ref, { versao, documentos: JSON.parse(JSON.stringify(configParaMotor())) });
  return true;
}
