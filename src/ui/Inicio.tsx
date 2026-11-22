import { Suspense, useState } from 'react';
import { signOut } from 'firebase/auth';
import type { Sessao } from '../domain/contas';
import { auth } from '../lib/firebase';
import { sobDemanda } from '../lib/sobDemanda';
import { Recados } from './setores/Recados';
import { Topo } from './Topo';

// Cada perfil baixa só o código das telas dele.
const PainelP3 = sobDemanda(() => import('./p3/PainelP3'), 'PainelP3');
const PainelUnidade = sobDemanda(() => import('./cia/PainelUnidade'), 'PainelUnidade');
const PainelCfp = sobDemanda(() => import('./setores/PainelCfp'), 'PainelCfp');
const PainelSala = sobDemanda(() => import('./setores/PainelSala'), 'PainelSala');
// Baixada (e lida no banco) só quando a Sala clica na sub-aba.
const ResultadosCias = sobDemanda(() => import('./setores/ResultadosCias'), 'ResultadosCias');
const Agenda = sobDemanda(() => import('./p3/Agenda'), 'Agenda');
const PaginaCgp = sobDemanda(() => import('./cia/Cgp'), 'PaginaCgp');
const PaginaSalaCia = sobDemanda(() => import('./cia/ProducaoCia'), 'PaginaSalaCia');

export const Carregando = () => <p className="carregando">Carregando…</p>;

export function Inicio({ sessao }: { sessao: Sessao }) {
  return (
    <main className="tela">
      <Topo>
        <button className="botao-sair" type="button" onClick={() => signOut(auth)}>
          Sair
        </button>
      </Topo>
      <Suspense fallback={<Carregando />}>
      {sessao.tipo === 'p3' && <PainelP3 admin={sessao.admin} />}
      {sessao.tipo === 'unidade' && <PainelUnidade unidade={sessao.unidade} sigla={sessao.sigla} />}
      {sessao.tipo === 'sala' && (
        <>
          <PaginaSala comResultadosCias />
          {/* Agenda própria da Sala (a do CFP não tem; quem entra pelo login do CFP não vê esta). */}
          <Agenda rota="" dono="sala" />
        </>
      )}
      {sessao.tipo === 'cfp' && <PaginasCfp />}
      {sessao.tipo === 'cgp' && <PaginaCgp unidade={sessao.unidade} sigla={sessao.sigla} />}
      {sessao.tipo === 'salaCia' && <PaginaSalaCia unidade={sessao.unidade} sigla={sessao.sigla} />}
      {sessao.tipo === 'sem-perfil' && (
        <section className="cartao" role="alert">
          <h2>Conta sem perfil</h2>
          <p>Fale com a P/3 para liberar o acesso.</p>
        </section>
      )}
      </Suspense>
    </main>
  );
}

/** O CFP usa a página dele e a da Sala de Operações (troca por abas no topo). */
function PaginasCfp() {
  const [pagina, setPagina] = useState<'cfp' | 'sala'>('cfp');
  return (
    <>
      <nav className="abas subabas abas-cfp-sala" aria-label="Páginas do CFP">
        <button type="button" aria-current={pagina === 'cfp' ? 'page' : undefined} onClick={() => setPagina('cfp')}>
          CFP
        </button>
        <button type="button" aria-current={pagina === 'sala' ? 'page' : undefined} onClick={() => setPagina('sala')}>
          Sala de Operações
        </button>
      </nav>
      {pagina === 'cfp' ? (
        <PainelCfp />
      ) : (
        <PaginaSala />
      )}
    </>
  );
}

/**
 * Página da Sala de Operações do batalhão: recados no alto e, para a conta da Sala, duas sub-abas.
 * "Resultados das Cias" só lê o banco quando é escolhida (e quando a Sala clica em Consultar).
 * Quem entra pelo CFP vê a página da Sala sem essa sub-aba (as regras não deixam o CFP ler a produção das Cias).
 */
function PaginaSala({ comResultadosCias = false }: { comResultadosCias?: boolean }) {
  const [aba, setAba] = useState<'operacoes' | 'cias'>('operacoes');
  if (!comResultadosCias) {
    return (
      <>
        <Recados setor="sala" />
        <PainelSala />
      </>
    );
  }
  return (
    <>
      <Recados setor="sala" />
      <nav className="abas subabas abas-cfp-sala" aria-label="Sala de Operações">
        <button type="button" aria-current={aba === 'operacoes' ? 'page' : undefined} onClick={() => setAba('operacoes')}>
          Resultados das operações
        </button>
        <button type="button" aria-current={aba === 'cias' ? 'page' : undefined} onClick={() => setAba('cias')}>
          Resultados das Cias
        </button>
      </nav>
      {aba === 'operacoes' ? <PainelSala /> : <ResultadosCias />}
    </>
  );
}
