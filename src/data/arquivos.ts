import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { dividirEmPartes, type ArquivoRef } from '../domain/icc';

// Arquivos (PDF) guardados no próprio banco, em partes de até ~700 KB: arquivos/{id} e arquivos/{id}/partes/{n}.
// Só a P/3 envia e apaga; a P/3 e as Cias baixam.

export function paraBase64(arquivo: Blob): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] ?? '');
    r.onerror = () => falha(r.error);
    r.readAsDataURL(arquivo);
  });
}

export async function enviarArquivo(db: Firestore, arquivo: File, aoProgredir?: (feito: number) => void): Promise<ArquivoRef> {
  const partes = dividirEmPartes(await paraBase64(arquivo));
  const ref = doc(collection(db, 'arquivos'));
  for (let i = 0; i < partes.length; i++) {
    await setDoc(doc(db, 'arquivos', ref.id, 'partes', String(i)), { dados: partes[i] });
    aoProgredir?.((i + 1) / partes.length);
  }
  // O "cabeçalho" por último: só existe quando todas as partes já estão lá.
  await setDoc(ref, { nome: arquivo.name, tipo: 'application/pdf', tamanho: arquivo.size, partes: partes.length, criadoEm: serverTimestamp() });
  return { id: ref.id, nome: arquivo.name, tamanho: arquivo.size };
}

/** Apaga o PDF (partes e cabeçalho). Usado quando a demanda é finalizada ou excluída. */
export async function apagarArquivo(db: Firestore, id: string): Promise<void> {
  // O cabeçalho primeiro: sem ele o arquivo já não aparece como pronto para baixar.
  await deleteDoc(doc(db, 'arquivos', id));
  const partes = await getDocs(collection(db, 'arquivos', id, 'partes'));
  await Promise.all(partes.docs.map((p) => deleteDoc(p.ref)));
}

export async function baixarArquivo(db: Firestore, id: string): Promise<{ nome: string; blob: Blob }> {
  const cab = await getDoc(doc(db, 'arquivos', id));
  if (!cab.exists()) throw new Error('Arquivo não encontrado.');
  const { nome, partes, tipo } = cab.data() as { nome: string; partes: number; tipo: string };
  const lidas = await getDocs(collection(db, 'arquivos', id, 'partes'));
  const porOrdem = lidas.docs.sort((a, b) => Number(a.id) - Number(b.id)).map((d) => String(d.data().dados ?? ''));
  if (porOrdem.length !== partes) throw new Error('Arquivo incompleto.');
  return { nome, blob: base64ParaBlob(porOrdem.join(''), tipo) };
}

export function base64ParaBlob(base64: string, tipo: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}

/** Entrega o arquivo ao navegador (também no celular). */
export function entregarAoAparelho(nome: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Baixa e entrega o arquivo ao navegador (também no celular). */
export async function salvarNoAparelho(db: Firestore, id: string): Promise<void> {
  const { nome, blob } = await baixarArquivo(db, id);
  entregarAoAparelho(nome, blob);
}
