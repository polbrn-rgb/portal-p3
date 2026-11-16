import { observarListas } from '../data/listas';
import { listasPadrao, type Listas } from '../domain/listasConfig';
import { db } from './firebase';
import { useAoVivo } from './useAoVivo';

const PADRAO = listasPadrao();

/** Listas do numerador em tempo real (enquanto carrega, as padrão). */
export function useListas(): Listas {
  return useAoVivo<Listas>((ok, erro) => observarListas(db, ok, erro), []).valor ?? PADRAO;
}
