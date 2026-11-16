import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch, type Firestore } from 'firebase/firestore';
import { normalizarRE, type Policial } from '../domain/efetivo';
import { idFotoTds, mesDe, type CfpTds, type DadosManuais, type FotoTds } from '../domain/tds';
import type { FotoReduzida } from '../lib/imagem';

// TDS: fotos de instrução dos CFP (fotosTds + fotosTdsDados, mesmo id). Ver domain/tds.ts.

function paraFoto(id: string, x: Partial<FotoTds>): FotoTds {
  return {
    id,
    mes: x.mes ?? '',
    re: x.re ?? '',
    cfp: { posto: x.cfp?.posto ?? '', nomeGuerra: x.cfp?.nomeGuerra ?? '' },
    data: x.data ?? '',
    assunto: x.assunto ?? '',
    vaga: Number(x.vaga) || 0,
    miniatura: x.miniatura ?? '',
    tamanho: Number(x.tamanho) || 0,
  };
}

/** Fotos de um CFP no mês (para o contador "x de 5"). */
export function observarFotosDoCfp(db: Firestore, mes: string, re: string, ok: (l: FotoTds[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, 'fotosTds'), where('mes', '==', mes), where('re', '==', normalizarRE(re))),
    (s) => ok(s.docs.map((d) => paraFoto(d.id, d.data()))),
    erro,
  );
}

/** P/3: todas as fotos do mês. */
export function observarFotosDoMes(db: Firestore, mes: string, ok: (l: FotoTds[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(query(collection(db, 'fotosTds'), where('mes', '==', mes)), (s) => ok(s.docs.map((d) => paraFoto(d.id, d.data()))), erro);
}

function vagaOcupada(e: unknown): boolean {
  return (e as { code?: string })?.code === 'permission-denied';
}

/**
 * Envia as fotos (cada uma numa vaga livre do mês). A foto e o resumo vão juntos (tudo ou nada).
 * Se outra pessoa ocupou a vaga ao mesmo tempo, tenta a próxima. Devolve quantas foram.
 */
export async function enviarFotosTds(
  db: Firestore,
  e: { cfp: CfpTds; data: string; assunto: string },
  fotos: FotoReduzida[],
  livres: number[],
  aoEnviar?: (feitas: number) => void,
): Promise<number> {
  const mes = mesDe(e.data);
  const re = normalizarRE(e.cfp.re);
  const vagas = [...livres];
  let feitas = 0;
  for (const f of fotos) {
    for (;;) {
      const vaga = vagas.shift();
      if (vaga === undefined) return feitas;
      const id = idFotoTds(mes, re, vaga);
      const lote = writeBatch(db);
      lote.set(doc(db, 'fotosTdsDados', id), { dados: f.dados });
      lote.set(doc(db, 'fotosTds', id), {
        mes,
        re,
        cfp: { posto: e.cfp.posto, nomeGuerra: e.cfp.nomeGuerra },
        data: e.data,
        assunto: e.assunto.trim(),
        vaga,
        miniatura: f.miniatura,
        tamanho: f.dados.length,
        enviadoEm: serverTimestamp(),
      });
      try {
        await lote.commit();
        feitas++;
        aoEnviar?.(feitas);
        break;
      } catch (erro) {
        if (!vagaOcupada(erro)) throw erro;
      }
    }
  }
  return feitas;
}

/** A foto em tamanho cheio (base64), para o .zip da P/3. */
export async function lerFotoTds(db: Firestore, id: string): Promise<string> {
  const s = await getDoc(doc(db, 'fotosTdsDados', id));
  if (!s.exists()) throw new Error('Foto não encontrada.');
  return String(s.data().dados ?? '');
}

/** P/3: apaga as fotos do sistema (a foto e o resumo). */
export async function apagarFotosTds(db: Firestore, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 200) {
    const lote = writeBatch(db);
    for (const id of ids.slice(i, i + 200)) {
      lote.delete(doc(db, 'fotosTdsDados', id));
      lote.delete(doc(db, 'fotosTds', id));
    }
    await lote.commit();
  }
}

/** RE que não está no banco de efetivo: grava no portal; o motor leva para a planilha BD Efetivo. */
export async function cadastrarPolicial(db: Firestore, re: string, d: DadosManuais): Promise<Policial> {
  const p: Policial = { re: re.trim(), posto: d.posto.trim(), nomeGuerra: d.nomeGuerra.trim().toUpperCase(), nomeCompleto: d.nomeCompleto.trim().toUpperCase(), telefone: d.telefone.trim() };
  await setDoc(doc(db, 'efetivo', normalizarRE(re)), { ...p, manual: true, cadastradoEm: serverTimestamp() });
  return p;
}
