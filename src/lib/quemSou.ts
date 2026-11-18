import { useEffect, useState } from 'react';
import { observarAssinaturas } from '../data/emails';
import { identificacaoDoLogin, reDoLogin, responsavelDoRE } from '../domain/acessos';

export { responsavelDoRE };
import { auth, db } from './firebase';

// Login individual (por RE): quem está usando o portal é conhecido, então "Respondido por", "Lançado por" etc.
// vêm preenchidos e travados. Conta antiga da unidade: null (continua digitando como antes).

export function quemSou(): string | null {
  return identificacaoDoLogin(auth.currentUser?.email, auth.currentUser?.displayName);
}

export function meuRE(): string | null {
  return reDoLogin(auth.currentUser?.email);
}

/** P/3 com login individual: o Responsável que corresponde a quem está logado (null enquanto carrega ou sem cadastro). */
export function useMeuResponsavel(): string | null {
  const re = meuRE();
  const [nome, setNome] = useState<string | null>(null);
  useEffect(() => {
    if (!re) return;
    return observarAssinaturas(
      db,
      (l) => setNome(responsavelDoRE(l, re)),
      () => setNome(null),
    );
  }, [re]);
  return nome;
}
