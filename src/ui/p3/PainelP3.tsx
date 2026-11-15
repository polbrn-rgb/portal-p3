import { observarOperacoes } from '../../data/operacoes';
import { observarPendentes } from '../../data/pendentes';
import type { Operacao } from '../../domain/operacao';
import type { Pendente } from '../../domain/pendente';
import type { Situacao } from '../../domain/situacao';
import { db } from '../../lib/firebase';
import { useHash } from '../../lib/navegacao';
import { useAoVivo, type AoVivo } from '../../lib/useAoVivo';
import { MissoesCfp } from '../setores/PainelCfp';
import { Recados } from '../setores/Recados';
import { Aperfeicoamento } from './Aperfeicoamento';
import { ChecklistOperacoes } from './ChecklistOperacoes';
import { DestinarPendente, EditarDemanda, NovaDemanda } from './FormDemanda';
import { FormPendente } from './FormPendente';
import { ListaDemandas } from './ListaDemandas';
import { ListaPendentes } from './ListaPendentes';
import { MenuP3, type AbaP3 } from './MenuP3';
import { PainelPrazos } from './PainelPrazos';

const FILTROS_VALIDOS = ['atrasado', 'vence_hoje', 'cia_atrasada', 'respondida', 'em_aberto'];

/** Dentro de Demandas Pendentes: a lista de pendentes e o Checklist Operações. */
function SubAbas({ ativa, pendentes, operacoes }: { ativa: 'pendentes' | 'operacoes'; pendentes?: number; operacoes?: number }) {
  return (
    <nav className="abas abas-p3 subabas" aria-label="Demandas Pendentes">
      <a href="#/pendentes" aria-current={ativa === 'pendentes' ? 'page' : undefined}>
        Pendentes
        {pendentes ? <span className="contador-aba">{pendentes}</span> : null}
      </a>
      <a href="#/operacoes" aria-current={ativa === 'operacoes' ? 'page' : undefined}>
        Checklist Operações
        {operacoes ? <span className="contador-aba">{operacoes}</span> : null}
      </a>
    </nav>
  );
}

/** Toda tela da P/3: menu (lateral no computador, ☰ no celular) e o conteúdo ao lado. */
export function PainelP3() {
  const hash = useHash();
  const pendentes = useAoVivo<Pendente[]>((ok, erro) => observarPendentes(db, ok, erro), []);
  const operacoes = useAoVivo<Operacao[]>((ok, erro) => observarOperacoes(db, ok, erro), []);
  return (
    <div className="layout-p3">
      <MenuP3 ativa={abaDaRota(hash)} pendentes={pendentes.valor?.length} />
      <div className="conteudo-p3">
        <ConteudoP3 hash={hash} pendentes={pendentes} operacoes={operacoes} />
      </div>
    </div>
  );
}

function abaDaRota(hash: string): AbaP3 {
  if (/^#\/(pendentes|operacoes|destinar)/.test(hash)) return 'pendentes';
  if (hash === '#/painel') return 'painel';
  if (hash === '#/cfp') return 'cfp';
  if (hash === '#/sala') return 'sala';
  if (hash.startsWith('#/aperfeicoamento')) return 'aperfeicoamento';
  return 'numerador';
}

function ConteudoP3({ hash, pendentes, operacoes }: { hash: string; pendentes: AoVivo<Pendente[]>; operacoes: AoVivo<Operacao[]> }) {
  const total = pendentes.valor?.length;
  const totalOperacoes = operacoes.valor?.length;

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
        <PainelPrazos />
      </>
    );
  }
  if (hash === '#/cfp') {
    return (
      <>
        <Recados setor="cfp" podeEnviar />
        <MissoesCfp />
      </>
    );
  }
  if (hash.startsWith('#/aperfeicoamento')) {
    return (
      <>
        <Aperfeicoamento rota={hash} />
      </>
    );
  }
  if (hash === '#/sala') {
    return (
      <>
        <Recados setor="sala" podeEnviar />
      </>
    );
  }
  if (hash === '#/pendentes' || hash === '#/operacoes') {
    const ativa = hash === '#/pendentes' ? 'pendentes' : 'operacoes';
    return (
      <>
        <SubAbas ativa={ativa} pendentes={total} operacoes={totalOperacoes} />
        {ativa === 'pendentes' ? <ListaPendentes pendentes={pendentes} /> : <ChecklistOperacoes operacoes={operacoes} />}
      </>
    );
  }
  const filtro = /^#\/demandas\/(\w+)$/.exec(hash)?.[1];
  return (
    <>
      <ListaDemandas
        key={filtro ?? 'todas'}
        filtroInicial={filtro && FILTROS_VALIDOS.includes(filtro) ? (filtro as Situacao) : 'todas'}
      />
    </>
  );
}
