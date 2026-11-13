import { useHash } from '../../lib/navegacao';
import { EditarDemanda, NovaDemanda } from './FormDemanda';
import { ListaDemandas } from './ListaDemandas';

export function PainelP3() {
  const hash = useHash();
  if (hash === '#/nova') return <NovaDemanda />;
  const editar = /^#\/demanda\/(\d+)$/.exec(hash);
  if (editar) return <EditarDemanda id={editar[1]} />;
  return <ListaDemandas />;
}
