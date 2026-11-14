import { useHash } from '../../lib/navegacao';
import type { Situacao } from '../../domain/situacao';
import { EditarDemanda, NovaDemanda } from './FormDemanda';
import { ListaDemandas } from './ListaDemandas';
import { PainelPrazos } from './PainelPrazos';

const FILTROS_VALIDOS = ['atrasado', 'vence_hoje', 'cia_atrasada', 'respondida', 'em_aberto'];

function Abas({ ativa }: { ativa: 'demandas' | 'painel' }) {
  return (
    <nav className="abas abas-p3" aria-label="Seções da P/3">
      <a href="#/demandas" aria-current={ativa === 'demandas' ? 'page' : undefined}>
        Demandas
      </a>
      <a href="#/painel" aria-current={ativa === 'painel' ? 'page' : undefined}>
        Painel
      </a>
    </nav>
  );
}

export function PainelP3() {
  const hash = useHash();
  if (hash === '#/nova') return <NovaDemanda />;
  const editar = /^#\/demanda\/(\d+)$/.exec(hash);
  if (editar) return <EditarDemanda id={editar[1]} />;
  if (hash === '#/painel') {
    return (
      <>
        <Abas ativa="painel" />
        <PainelPrazos />
      </>
    );
  }
  const filtro = /^#\/demandas\/(\w+)$/.exec(hash)?.[1];
  return (
    <>
      <Abas ativa="demandas" />
      <ListaDemandas
        key={filtro ?? 'todas'}
        filtroInicial={filtro && FILTROS_VALIDOS.includes(filtro) ? (filtro as Situacao) : 'todas'}
      />
    </>
  );
}
