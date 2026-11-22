import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { contarFotosEncaminhadas } from '../../data/fotosEncaminhadas';
import { sobDemanda } from '../../lib/sobDemanda';
import { observarAbertosP3 } from '../../data/encaminhamentos';
import { garantirCopiaAutomatica } from '../../data/banco';
import { mesDaCopiaAutomatica } from '../../domain/banco';
import { hojeISO } from '../../domain/datas';
import { cutucarMotor } from '../../lib/motor';
import { observarOperacoes, prepararCampoOperacao } from '../../data/operacoes';
import { observarPendentes } from '../../data/pendentes';
import type { Operacao } from '../../domain/operacao';
import type { Pendente } from '../../domain/pendente';
import type { Situacao } from '../../domain/situacao';
import { db } from '../../lib/firebase';
import { useHash } from '../../lib/navegacao';
import { useAoVivo, type AoVivo } from '../../lib/useAoVivo';
import { Recados } from '../setores/Recados';
import { DestinarPendente, EditarDemanda, NovaDemanda } from './FormDemanda';
import { FormPendente } from './FormPendente';
import { ListaDemandas } from './ListaDemandas';
import { ListaPendentes } from './ListaPendentes';
import { MenuP3, type AbaP3 } from './MenuP3';
import type { Encaminhamento } from '../../domain/encaminhamento';

// Telas abertas só quando escolhidas no menu: o código delas é baixado na hora.
const Administrador = sobDemanda(() => import('./Administrador'), 'Administrador');
const Agenda = sobDemanda(() => import('./Agenda'), 'Agenda');
const Aperfeicoamento = sobDemanda(() => import('./Aperfeicoamento'), 'Aperfeicoamento');
const ChecklistOperacoes = sobDemanda(() => import('./ChecklistOperacoes'), 'ChecklistOperacoes');
const ControleOperacoes = sobDemanda(() => import('./ControleOperacoes'), 'ControleOperacoes');
const BancoDados = sobDemanda(() => import('./BancoDados'), 'BancoDados');
const DocumentosMensais = sobDemanda(() => import('./DocumentosMensais'), 'DocumentosMensais');
const RacP3 = sobDemanda(() => import('./RacP3'), 'RacP3');
const ProducaoP3 = sobDemanda(() => import('./ProducaoP3'), 'ProducaoP3');
const PainelPrazos = sobDemanda(() => import('./PainelPrazos'), 'PainelPrazos');
const PainelBatalhao = sobDemanda(() => import('./PainelBatalhao'), 'PainelBatalhao');
const PainelEstatistico = sobDemanda(() => import('./PainelEstatistico'), 'PainelEstatistico');
const TdsP3 = sobDemanda(() => import('./TdsP3'), 'TdsP3');
const FotosCias = sobDemanda(() => import('./FotosCias'), 'FotosCias');
const MissoesCfp = sobDemanda(() => import('../setores/PainelCfp'), 'MissoesCfp');
const ResultadosCias = sobDemanda(() => import('./ResultadosCias'), 'ResultadosCias');

const FILTROS_VALIDOS = ['atrasado', 'vence_hoje', 'cia_atrasada', 'respondida', 'em_aberto'];

type SubAba = { hash: string; rotulo: string; Tela: (p: { operacoes: AoVivo<Operacao[]> }) => ReactNode };

/** Sub-abas de Operações, do Painel, do CFP e da Sala de Operações: a rota, o rótulo e a tela de cada uma. */
const OPERACOES: SubAba[] = [
  { hash: '#/operacoes', rotulo: 'Checklist Operações', Tela: ({ operacoes }) => <ChecklistOperacoes operacoes={operacoes} /> },
  { hash: '#/operacoes/controle', rotulo: 'Controle de Operações', Tela: () => <ControleOperacoes /> },
  { hash: '#/operacoes/documentos', rotulo: 'Documentos Mensais', Tela: () => <DocumentosMensais /> },
  { hash: '#/operacoes/rac', rotulo: 'RAC', Tela: () => <RacP3 /> },
  { hash: '#/operacoes/produtividade', rotulo: 'Produtividade', Tela: () => <ProducaoP3 /> },
  { hash: '#/operacoes/banco', rotulo: 'Banco de dados', Tela: () => <BancoDados /> },
];
const PAINEL: SubAba[] = [
  { hash: '#/painel', rotulo: 'Prazos', Tela: () => <PainelPrazos /> },
  { hash: '#/painel/p3', rotulo: 'Estatístico P/3', Tela: () => <EstatisticoP3 /> },
  { hash: '#/painel/batalhao', rotulo: 'Estatístico do Batalhão', Tela: () => <PainelBatalhao /> },
];
const CFP: SubAba[] = [
  {
    hash: '#/cfp',
    rotulo: 'Missões e recados',
    Tela: () => (
      <>
        <Recados setor="cfp" podeEnviar />
        <MissoesCfp />
      </>
    ),
  },
  { hash: '#/cfp/tds', rotulo: 'TDS', Tela: () => <TdsP3 /> },
];

const SALA: SubAba[] = [
  { hash: '#/sala', rotulo: 'Recados', Tela: () => <Recados setor="sala" podeEnviar /> },
  // Só lê o banco quando esta sub-aba é aberta (e quando a P/3 clica em Consultar).
  { hash: '#/sala/resultados', rotulo: 'Resultados das Cias', Tela: () => <ResultadosCias /> },
];

/** Barra de sub-abas + a tela da escolhida. contadores: número ao lado do rótulo (ex.: operações abertas). */
function ComSubAbas(p: { rotulo: string; abas: SubAba[]; ativa: SubAba; operacoes: AoVivo<Operacao[]>; contadores?: Record<string, number | undefined> }) {
  const { Tela } = p.ativa;
  return (
    <>
      <nav className="abas abas-p3 subabas" aria-label={p.rotulo}>
        {p.abas.map((a) => (
          <a key={a.hash} href={a.hash} aria-current={a === p.ativa ? 'page' : undefined}>
            {a.rotulo}
            {p.contadores?.[a.hash] ? <span className="contador-aba">{p.contadores[a.hash]}</span> : null}
          </a>
        ))}
      </nav>
      <Tela operacoes={p.operacoes} />
    </>
  );
}

/** Toda tela da P/3: menu (lateral no computador, ☰ no celular) e o conteúdo ao lado. */
/** admin: 'direto' (chefe/encarregado), 'senha' (conta antiga da P/3) ou 'nao' (operador: sem a aba Administrador). */
export function PainelP3({ admin = 'senha' }: { admin?: 'direto' | 'senha' | 'nao' }) {
  const hash = useHash();
  const pendentes = useAoVivo<Pendente[]>((ok, erro) => observarPendentes(db, ok, erro), []);
  const operacoes = useAoVivo<Operacao[]>((ok, erro) => observarOperacoes(db, ok, erro), []);
  // A limpeza de encaminhamentos sem demanda passou para o motor (uma vez por dia, sem depender de abrir o portal).
  useEffect(() => {
    // Cópia de segurança automática do banco de dados (o mês de referência, depois do prazo dos documentos).
    const hoje = hojeISO();
    garantirCopiaAutomatica(db, mesDaCopiaAutomatica(hoje), hoje)
      .then((mes) => {
        if (!mes) return;
        console.info(`Portal P3: cópia do banco de dados de ${mes} enviada para o Drive.`);
        cutucarMotor();
      })
      .catch((e) => console.error('Cópia automática do banco de dados:', e));
  }, []);
  // Uma vez só: as operações antigas ganham o campo que o menu usa para ler só as em andamento.
  useEffect(() => {
    prepararCampoOperacao(db)
      .then((n) => n && console.info(`Portal P3: ${n} operação(ões) antiga(s) preparada(s) para o checklist.`))
      .catch((e) => console.error('Preparar operações antigas:', e));
  }, []);
  // Fotos encaminhadas pelas Cias: só a contagem (uma leitura), conferida a cada troca de tela.
  const [fotos, setFotos] = useState<number | undefined>();
  useEffect(() => {
    contarFotosEncaminhadas(db).then(setFotos, () => undefined);
  }, [hash]);
  return (
    <div className="layout-p3">
      <MenuP3 ativa={abaDaRota(hash)} pendentes={pendentes.valor?.length} operacoes={operacoes.valor?.length} fotos={fotos} semAdmin={admin === 'nao'} />
      <div className="conteudo-p3">
        <Suspense fallback={<p className="carregando">Carregando…</p>}>
          <ConteudoP3 hash={hash} pendentes={pendentes} operacoes={operacoes} admin={admin} />
        </Suspense>
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
  if (hash.startsWith('#/sala')) return 'sala';
  if (hash === '#/fotos') return 'fotos';
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
    const ativa = PAINEL.find((a) => a.hash === hash) ?? PAINEL[0];
    return <ComSubAbas rotulo="Painel" abas={PAINEL} ativa={ativa} operacoes={operacoes} />;
  }
  const doCfp = CFP.find((a) => a.hash === hash);
  if (doCfp) return <ComSubAbas rotulo="CFP" abas={CFP} ativa={doCfp} operacoes={operacoes} />;
  if (hash.startsWith('#/aperfeicoamento')) return <Aperfeicoamento rota={hash} />;
  if (hash.startsWith('#/agenda')) return <Agenda rota={hash} />;
  const daSala = SALA.find((a) => a.hash === hash);
  if (daSala) return <ComSubAbas rotulo="Sala de Operações" abas={SALA} ativa={daSala} operacoes={operacoes} />;
  if (hash === '#/fotos') return <FotosCias />;
  if (hash === '#/pendentes') return <ListaPendentes pendentes={pendentes} />;
  const deOperacoes = OPERACOES.find((a) => a.hash === hash);
  if (deOperacoes) {
    return (
      <ComSubAbas
        rotulo="Operações"
        abas={OPERACOES}
        ativa={deOperacoes}
        operacoes={operacoes}
        contadores={{ '#/operacoes': operacoes.valor?.length }}
      />
    );
  }
  const filtro = /^#\/demandas\/(\w+)$/.exec(hash)?.[1];
  return (
    <ListaDemandas key={filtro ?? 'todas'} filtroInicial={filtro && FILTROS_VALIDOS.includes(filtro) ? (filtro as Situacao) : 'todas'} />
  );
}

/** Painel → Estatístico P/3: as demandas do ano (o "Dashboard" do numerador antigo). */
function EstatisticoP3() {
  const encs = useAoVivo<Encaminhamento[]>((ok, erro) => observarAbertosP3(db, ok, erro), []);
  return <PainelEstatistico encs={encs.valor ?? []} />;
}
