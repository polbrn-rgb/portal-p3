import { useEffect, useState } from 'react';

export type AoVivo<T> = { carregando: boolean; valor: T | undefined; erro: string };

/** Liga um ouvinte do Firestore enquanto o componente estiver na tela. */
export function useAoVivo<T>(
  assinar: (aoMudar: (valor: T) => void, aoFalhar: (erro: Error) => void) => () => void,
  dependencias: readonly unknown[],
  mensagemErro = 'Não foi possível carregar.',
): AoVivo<T> {
  const [estado, setEstado] = useState<AoVivo<T>>({ carregando: true, valor: undefined, erro: '' });

  useEffect(() => {
    setEstado((e) => ({ ...e, carregando: true }));
    return assinar(
      (valor) => setEstado({ carregando: false, valor, erro: '' }),
      () => setEstado((e) => ({ ...e, carregando: false, erro: mensagemErro })),
    );
    // as dependências são passadas por quem chama
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencias);

  return estado;
}
