import { collection, onSnapshot, type Firestore } from 'firebase/firestore';

// Missões com pasta do CFP (gravadas pelo motor). São poucas: lê todas e filtra na tela.
export type MissaoCfp = { numero: number; titulo: string; saida: string; inicio: string; fim: string; pastaUrl: string };

export function observarMissoes(
  db: Firestore,
  aoMudar: (lista: MissaoCfp[]) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  return onSnapshot(collection(db, 'missoesCfp'), (s) => aoMudar(s.docs.map((d) => d.data() as MissaoCfp)), aoFalhar);
}
