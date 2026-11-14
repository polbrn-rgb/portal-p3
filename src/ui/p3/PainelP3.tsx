import { observarPendentes } from '../../data/pendentes';
import type { Pendente } from '../../domain/pendente';
import type { Situacao } from '../../domain/situacao';
import { db } from '../../lib/firebase';
import { useHash } from '../../lib/navegacao';
import { useAoVivo } from '../../lib/useAoVivo';
import { DestinarPendente, EditarDemanda, NovaDemanda } from './FormDemanda';
import { FormPendente } from './FormPendente';
import { ListaDemandas } from './ListaDemandas';
import { ListaPendentes } from './ListaPendentes';
import { PainelPrazos } from './PainelPrazos';

const FILTROS_VALIDOS = ['atrasado', 'vence_hoje', 'cia_atrasada', 'respondida', 'em_aberto'];

type AbaP3 = 'pendentes' | 'numerador' | 'painel';

function Abas({ ativa, pendentes }: { ativa: AbaP3; pendentes?: number }) {
  const atual = (aba: AbaP3) => (ativa === aba ? 'page' : undefined);
  return (
    <nav className="abas abas-p3" aria-label="Seções da P/3">
      <a href="#/pendentes" aria-current={atual('pendentes')}>
        Demandas Pendentes
        {pendentes ? <span className="contador-aba">{pendentes}</span> : null}
      </a>
      <a href="#/demandas" aria-current={atual('numerador')}>
        Numerador
      </a>
      <a href="#/painel" aria-current={atual('painel')}>
        Painel
      </a>
    </nav>
  );
}

export function PainelP3() {
  const hash = useHash();
  // Fica ligado em todas as telas da P/3: o número na aba avisa quando chega pendente nova.
  const pendentes = useAoVivo<Pendente[]>((ok, erro) => observarPendentes(db, ok, erro), []);
  const total = pendentes.valor?.length;

  if (hash === '#/nova') return <NovaDemanda />;
  if (hash === '#/pendentes/sei') return <FormPendente key="sei" tipo="sei" />;
  if (hash === '#/pendentes/ordem') return <FormPendente key="ordem" tipo="ordem_verbal" />;
  const destinar = /^#\/destinar\/([\w-]+)$/.exec(hash);
  if (destinar) return <DestinarPendente id={destinar[1]} />;
  const editar = /^#\/demanda\/(\d+)$/.exec(hash);
  if (editar) return <EditarDemanda id={editar[1]} />;
  if (hash === '#/painel') {
    return (
      <>
        <Abas ativa="painel" pendentes={total} />
        <PainelPrazos />
      </>
    );
  }
  if (hash === '#/pendentes') {
    return (
      <>
        <Abas ativa="pendentes" pendentes={total} />
        <ListaPendentes pendentes={pendentes} />
      </>
    );
  }
  const filtro = /^#\/demandas\/(\w+)$/.exec(hash)?.[1];
  return (
    <>
      <Abas ativa="numerador" pendentes={total} />
      <ListaDemandas
        key={filtro ?? 'todas'}
        filtroInicial={filtro && FILTROS_VALIDOS.includes(filtro) ? (filtro as Situacao) : 'todas'}
      />
    </>
  );
}
