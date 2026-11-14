import { doc, onSnapshot, type Firestore } from 'firebase/firestore';

// Eventos da agenda do CFP, copiados pelo motor (Apps Script) para agendaCfp/eventos.
export type MissaoCfp = { id: string; titulo: string; inicio: string; fim: string; pastaUrl: string; numero: number };
export type AgendaCfp = { eventos: MissaoCfp[]; conferidoEm: string };

/** null = o motor ainda não leu a agenda. */
export function observarAgendaCfp(
  db: Firestore,
  aoMudar: (agenda: AgendaCfp | null) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, 'agendaCfp', 'eventos'),
    (s) => {
      if (!s.exists()) return aoMudar(null);
      const d = s.data() as Partial<AgendaCfp>;
      aoMudar({ eventos: d.eventos ?? [], conferidoEm: d.conferidoEm ?? '' });
    },
    aoFalhar,
  );
}
