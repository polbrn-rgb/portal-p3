import { onIdTokenChanged } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { sessaoDosClaims, type Sessao } from '../domain/contas';
import { auth } from './firebase';

export type EstadoSessao =
  | { estado: 'carregando' }
  | { estado: 'deslogado' }
  | { estado: 'logado'; sessao: Sessao };

/** Acompanha o login. O perfil vem do próprio token, sem leitura no banco. */
export function useSessao(): EstadoSessao {
  const [estado, setEstado] = useState<EstadoSessao>({ estado: 'carregando' });

  useEffect(
    () =>
      onIdTokenChanged(auth, async (usuario) => {
        if (!usuario) {
          setEstado({ estado: 'deslogado' });
          return;
        }
        const token = await usuario.getIdTokenResult();
        setEstado({ estado: 'logado', sessao: sessaoDosClaims(token.claims) });
      }),
    [],
  );

  return estado;
}
