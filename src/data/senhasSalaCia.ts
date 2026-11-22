import { collection, doc, onSnapshot, serverTimestamp, setDoc, type Firestore, type Timestamp } from 'firebase/firestore';
import { COLECAO_SENHAS_SALA_CIA, type SenhaSalaCia } from '../domain/salaCia';
import type { UnidadeId } from '../domain/unidades';

// senhasSalaCia/{cia}: a P/3 pede a senha nova (ou o bloqueio); o motor aplica na conta da Sala da Cia e apaga a senha.

export function observarSenhasSalaCia(db: Firestore, ok: (l: SenhaSalaCia[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(
    collection(db, COLECAO_SENHAS_SALA_CIA),
    (s) =>
      ok(
        s.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id as UnidadeId,
            ativo: x.ativo !== false,
            sincronizar: x.sincronizar === true,
            status: x.status ?? 'pendente',
            erro: x.erro ?? '',
            pedidoPor: x.pedidoPor ?? '',
            pedidoEm: (x.pedidoEm as Timestamp | null | undefined)?.toDate?.() ?? null,
            aplicadoEm: x.aplicadoEm ?? '',
          };
        }),
      ),
    erro,
  );
}

const pedir = (db: Firestore, unidade: UnidadeId, campos: { senha: string; ativo: boolean }, por: string) =>
  setDoc(doc(db, COLECAO_SENHAS_SALA_CIA, unidade), {
    unidade,
    ...campos,
    sincronizar: true,
    status: 'pendente',
    erro: '',
    pedidoPor: por,
    pedidoEm: serverTimestamp(),
  });

/** Senha nova: a conta é criada se ainda não existe, e quem estava logado com a senha antiga sai. */
export const pedirSenhaSalaCia = (db: Firestore, unidade: UnidadeId, senha: string, por: string) =>
  pedir(db, unidade, { senha, ativo: true }, por);

/** Bloquear (ninguém entra, nem com a senha atual) ou desbloquear (volta a valer a senha atual). */
export const bloquearSalaCia = (db: Firestore, unidade: UnidadeId, bloquear: boolean, por: string) =>
  pedir(db, unidade, { senha: '', ativo: !bloquear }, por);
