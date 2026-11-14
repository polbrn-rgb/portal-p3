import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where, type Firestore } from 'firebase/firestore';
import type { Checklist } from '../domain/operacao';
import { idResultado, type PlanilhaResultado, type Resultado } from '../domain/resultado';

// Página da Sala de Operações: planilhas prontas e lançamento dos resultados.

export type OperacaoComPlanilha = { numero: string; planilha: PlanilhaResultado; protocolos: Record<string, string> };

export function observarPlanilhasProntas(
  db: Firestore,
  aoMudar: (lista: OperacaoComPlanilha[]) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  const q = query(collection(db, 'operacoes'), where('planilha.status', '==', 'pronta'));
  return onSnapshot(
    q,
    (s) =>
      aoMudar(
        s.docs
          .map((d) => {
            const c = d.data() as Partial<Checklist>;
            return { numero: d.id, planilha: c.planilha as PlanilhaResultado, protocolos: c.protocolos ?? {} };
          })
          .sort((a, b) => Number(b.numero) - Number(a.numero)),
      ),
    aoFalhar,
  );
}

export function observarResultado(
  db: Firestore,
  numero: string,
  dia: string,
  aoMudar: (r: Resultado | null) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, 'resultados', idResultado(numero, dia)),
    (s) => aoMudar(s.exists() ? (s.data() as Resultado) : null),
    aoFalhar,
  );
}

/** Salva o lançamento; o motor grava na planilha e marca "gravado". */
export async function salvarResultado(
  db: Firestore,
  r: Pick<Resultado, 'numero' | 'dia' | 'protocoloResultado' | 'valores' | 'salvoPor'>,
): Promise<void> {
  await setDoc(doc(db, 'resultados', idResultado(r.numero, r.dia)), {
    numero: r.numero,
    dia: r.dia,
    protocoloResultado: r.protocoloResultado.trim(),
    valores: r.valores,
    salvoPor: r.salvoPor.trim(),
    salvoEm: serverTimestamp(),
    gravado: false,
  });
}
