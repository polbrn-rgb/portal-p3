import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { montarAcesso, reBase, type Acesso, type DadosAcesso } from '../domain/acessos';

// acessos/{RE sem dígito}: o Administrador cadastra; o motor (Apps Script) cria a conta e manda o link de senha.

export function observarAcessos(db: Firestore, ok: (l: Acesso[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(
    collection(db, 'acessos'),
    (s) => {
      const lista = s.docs.map((d) => ({ ...(d.data() as Omit<Acesso, 'id'>), id: d.id }));
      lista.sort((a, b) => a.nomeGuerra.localeCompare(b.nomeGuerra, 'pt-BR'));
      ok(lista);
    },
    erro,
  );
}

export async function acessoExiste(db: Firestore, re: string): Promise<boolean> {
  return (await getDoc(doc(db, 'acessos', reBase(re)))).exists();
}

/** Novo: cria a conta e manda o link de primeiro acesso. Editar: só atualiza perfil e dados. */
export async function salvarAcesso(db: Firestore, d: DadosAcesso, opcoes: { novo: boolean; ativo?: boolean }): Promise<void> {
  await setDoc(doc(db, 'acessos', reBase(d.re)), { ...montarAcesso(d, opcoes), atualizadoEm: serverTimestamp() }, { merge: true });
}

const mexer = (db: Firestore, id: string, campos: Record<string, unknown>) =>
  updateDoc(doc(db, 'acessos', id), { ...campos, sincronizar: true, status: 'pendente', erro: '', atualizadoEm: serverTimestamp() });

export const reenviarLinkAcesso = (db: Firestore, id: string) => mexer(db, id, { enviarLink: true, ativo: true });
export const bloquearAcesso = (db: Firestore, id: string, ativo: boolean) => mexer(db, id, { ativo });
export const excluirAcesso = (db: Firestore, id: string) => mexer(db, id, { excluir: true });
