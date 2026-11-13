import { useEffect, useState } from 'react';
import { observarAbertas } from '../data/demandas';
import type { Demanda } from '../domain/demanda';
import { db } from './firebase';

export type EstadoLista = { carregando: boolean; lista: Demanda[]; erro: string };

export function useDemandasAbertas(): EstadoLista {
  const [estado, setEstado] = useState<EstadoLista>({ carregando: true, lista: [], erro: '' });

  useEffect(
    () =>
      observarAbertas(
        db,
        (lista) => setEstado({ carregando: false, lista, erro: '' }),
        () => setEstado((e) => ({ ...e, carregando: false, erro: 'Não foi possível carregar as demandas.' })),
      ),
    [],
  );

  return estado;
}
