import { useEffect } from 'react';
import { limparEncaminhamentosOrfaos, observarAbertosP3 } from '../../data/encaminhamentos';
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
import { Administrador } from './Administrador';
import { Agenda } from './Agenda';
import { Aperfeicoamento } from './Aperfeicoamento';
import { ChecklistOperacoes } from './ChecklistOperacoes';
import { ControleOperacoes } from './ControleOperacoes';
import { BancoDados } from './BancoDados';
import { DocumentosMensais } from './DocumentosMensais';
import { RacP3 } from './RacP3';
import { ProducaoP3 } from './ProducaoP3';
import { DestinarPendente, EditarDemanda, NovaDemanda } from './FormDemanda';
import { FormPendente } from './FormPendente';
import { ListaDemandas } from './ListaDemandas';
import { ListaPendentes } from './ListaPendentes';
import { MenuP3, type AbaP3 } from './MenuP3';
import { PainelPrazos } from './PainelPrazos';
import { PainelBatalhao } from './PainelBatalhao';
import { PainelEstatistico } from './PainelEstatistico';
import type { Encaminhamento } from '../../domain/encaminhamento';
import { TdsP3 } from './TdsP3';

const FILTROS_VALIDOS = ['atrasado', 'vence_hoje', 'cia_atrasada', 'respondida', 'em_aberto'];

/** Dentro de Operações: Checklist, Controle de Operações (Relatório de Indicadores), Documentos Mensais, RAC, Produtividade e Banco de dados. */
function SubAbasOperacoes({ ativa, operacoes }: { ativa: 'checklist' | 'controle' | 'documentos' | 'rac' | 'produtividade' | 'banco'; operacoes?: number }) {
  return (
    <nav className="abas abas-p3 subabas" aria-label="Operações">
      <a href="#/operacoes" aria-current={ativa === 'checklist' ? 'page' : undefined}>
        Checklist Operações
        {operacoes ? <span className="contador-aba">{operacoes}</span> : null}
      </a>
      <a href="#/operacoes/controle" aria-current={ativa === 'controle' ? 'page' : undefined}>
        Controle de Operações
      </a>
      <a href="#/operacoes/documentos" aria-current={ativa === 'documentos' ? 'page' : undefined}>
        Documentos Mensais
      </a>
      <a href="#/operacoes/rac" aria-current={ativa === 'rac' ? 'page' : undefined}>
        RAC
      </a>
      <a href="#/operacoes/produtividade" aria-current={ativa === 'produtividade' ? 'page' : undefined}>
        Produtividade
      </a>
      <a href="#/operacoes/banco" aria-current={ativa === 'banco' ? 'page' : undefined}>
        Banco de dados
      </a>
    </nav>
  );
}

/** Toda tela da P/3: menu (lateral no computador, ☰ no celular) e o conteúdo ao lado. */
/** admin: 'direto' (chefe/encarregado), 'senha' (conta antiga da P/3) ou 'nao' (operador: sem a aba Administrador). */
export function PainelP3({ admin = 'senha' }: { admin?: 'direto' | 'senha' | 'nao' }) {
  const hash = useHash();
  const pendentes = useAoVivo<Pendente[]>((ok, erro) => observarPendentes(db, ok, erro), []);
  const operacoes = useAoVivo<Operacao[]>((ok, erro) => observarOperacoes(db, ok, erro), []);
  // Demanda apagada que ainda aparecia para a Cia: sai da tela dela.
  useEffect(() => {
    limparEncaminhamentosOrfaos(db)
      .then((n) => n && console.info(`Portal P3: ${n} encaminhamento(s) de demanda apagada removido(s) das Cias.`))
      .catch(() => undefined);
  }, []);
  return (
    <div className="layout-p3">
      <MenuP3 ativa={abaDaRota(hash)} pendentes={pendentes.valor?.length} operacoes={operacoes.valor?.length} semAdmin={admin === 'nao'} />
      <div className="conteudo-p3">
        <ConteudoP3 hash={hash} pendentes={pendentes} operacoes={operacoes} admin={admin} />
      </div>
    </div>
  );
}

function abaDaRota(hash: string): AbaP3 {
  if (/^#\/(pendentes|destinar)/.test(hash)) return 'pendentes';
  if (hash.startsWith('#/operacoes')) return 'operacoes';
  if (hash.startsWith('#/painel')) return 'painel';
  if (hash.startsWith('#/admin')) return 'admin';
  if (hash.startsWith('#/cfp')) return 'cfp';
  if (hash === '#/sala') return 'sala';
  if (hash.startsWith('#/aperfeicoamento')) return 'aperfeicoamento';
  if (hash.startsWith('#/agenda')) return 'agenda';
  return 'numerador';
}

function ConteudoP3({
  hash,
  pendentes,
  operacoes,
  admin,
}: {
  hash: string;
  pendentes: AoVivo<Pendente[]>;
  operacoes: AoVivo<Operacao[]>;
  admin: 'direto' | 'senha' | 'nao';
}) {

  if (hash === '#/nova') return <NovaDemanda />;
  if (hash.startsWith('#/admin') && admin !== 'nao') return <Administrador rota={hash} direto={admin === 'direto'} />;
  if (hash === '#/pendentes/sei') return <FormPendente key="sei" tipo="sei" />;
  if (hash === '#/pendentes/ordem') return <FormPendente key="ordem" tipo="ordem_verbal" />;
  const destinar = /^#\/destinar\/([\w-]+)$/.exec(hash);
  if (destinar) return <DestinarPendente id={destinar[1]} />;
  const editar = /^#\/demanda\/(\d+)$/.exec(hash);
  if (editar) return <EditarDemanda id={editar[1]} />;
  if (hash.startsWith('#/painel')) {
    const aba = hash === '#/painel/p3' ? 'p3' : hash === '#/painel/batalhao' ? 'batalhao' : 'prazos';
    return (
      <>
        <nav className="abas abas-p3 subabas" aria-label="Painel">
          <a href="#/painel" aria-current={aba === 'prazos' ? 'page' : undefined}>
            Prazos
          </a>
          <a href="#/painel/p3" aria-current={aba === 'p3' ? 'page' : undefined}>
            Estatístico P/3
          </a>
          <a href="#/painel/batalhao" aria-current={aba === 'batalhao' ? 'page' : undefined}>
            Estatístico do Batalhão
          </a>
        </nav>
        {aba === 'p3' ? <EstatisticoP3 /> : aba === 'batalhao' ? <PainelBatalhao /> : <PainelPrazos />}
      </>
    );
  }
  if (hash === '#/cfp' || hash === '#/cfp/tds') {
    const tds = hash === '#/cfp/tds';
    return (
      <>
        <nav className="abas abas-p3 subabas" aria-label="CFP">
          <a href="#/cfp" aria-current={tds ? undefined : 'page'}>
            Missões e recados
          </a>
          <a href="#/cfp/tds" aria-current={tds ? 'page' : undefined}>
            TDS
          </a>
        </nav>
        {tds ? (
          <TdsP3 />
        ) : (
          <>
            <Recados setor="cfp" podeEnviar />
            <MissoesCfp />
          </>
        )}
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
  if (hash.startsWith('#/agenda')) return <Agenda rota={hash} />;
  if (hash === '#/sala') {
    return (
      <>
        <Recados setor="sala" podeEnviar />
      </>
    );
  }
  if (hash === '#/pendentes') return <ListaPendentes pendentes={pendentes} />;
  if (
    hash === '#/operacoes' ||
    hash === '#/operacoes/controle' ||
    hash === '#/operacoes/documentos' ||
    hash === '#/operacoes/rac' ||
    hash === '#/operacoes/produtividade' ||
    hash === '#/operacoes/banco'
  ) {
    const ativa =
      hash === '#/operacoes/controle'
        ? 'controle'
        : hash === '#/operacoes/documentos'
          ? 'documentos'
          : hash === '#/operacoes/rac'
            ? 'rac'
            : hash === '#/operacoes/produtividade'
              ? 'produtividade'
              : hash === '#/operacoes/banco'
                ? 'banco'
                : 'checklist';
    return (
      <>
        <SubAbasOperacoes ativa={ativa} operacoes={operacoes.valor?.length} />
        {ativa === 'controle' ? (
          <ControleOperacoes />
        ) : ativa === 'documentos' ? (
          <DocumentosMensais />
        ) : ativa === 'rac' ? (
          <RacP3 />
        ) : ativa === 'produtividade' ? (
          <ProducaoP3 />
        ) : ativa === 'banco' ? (
          <BancoDados />
        ) : (
          <ChecklistOperacoes operacoes={operacoes} />
        )}
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

/** Painel → Estatístico P/3: as demandas do ano (o "Dashboard" do numerador antigo). */
function EstatisticoP3() {
  const encs = useAoVivo<Encaminhamento[]>((ok, erro) => observarAbertosP3(db, ok, erro), []);
  return <PainelEstatistico encs={encs.valor ?? []} />;
}
