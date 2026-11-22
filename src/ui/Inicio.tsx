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
          <Recados setor="sala" />
          <PainelSala />
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
        <>
          <Recados setor="sala" />
          <PainelSala />
        </>
      )}
    </>
  );
}
