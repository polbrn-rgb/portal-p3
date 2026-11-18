import { useState } from 'react';
import { signOut } from 'firebase/auth';
import type { Sessao } from '../domain/contas';
import { auth } from '../lib/firebase';
import { PainelUnidade } from './cia/PainelUnidade';
import { PainelP3 } from './p3/PainelP3';
import { PainelCfp } from './setores/PainelCfp';
import { PainelSala } from './setores/PainelSala';
import { Recados } from './setores/Recados';
import { Topo } from './Topo';

export function Inicio({ sessao }: { sessao: Sessao }) {
  return (
    <main className="tela">
      <Topo>
        <button className="botao-sair" type="button" onClick={() => signOut(auth)}>
          Sair
        </button>
      </Topo>
      {sessao.tipo === 'p3' && <PainelP3 admin={sessao.admin} />}
      {sessao.tipo === 'unidade' && <PainelUnidade unidade={sessao.unidade} sigla={sessao.sigla} />}
      {sessao.tipo === 'sala' && (
        <>
          <Recados setor="sala" />
          <PainelSala />
        </>
      )}
      {sessao.tipo === 'cfp' && <PaginasCfp />}
      {sessao.tipo === 'sem-perfil' && (
        <section className="cartao" role="alert">
          <h2>Conta sem perfil</h2>
          <p>Fale com a P/3 para liberar o acesso.</p>
        </section>
      )}
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
