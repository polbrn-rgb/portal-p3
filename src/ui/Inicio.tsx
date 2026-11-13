import { signOut } from 'firebase/auth';
import type { Sessao } from '../domain/contas';
import { auth } from '../lib/firebase';
import { PainelUnidade } from './cia/PainelUnidade';
import { PainelP3 } from './p3/PainelP3';
import { Topo } from './Topo';

export function Inicio({ sessao }: { sessao: Sessao }) {
  return (
    <main className="tela">
      <Topo>
        <button className="botao-sair" type="button" onClick={() => signOut(auth)}>
          Sair
        </button>
      </Topo>
      {sessao.tipo === 'p3' && <PainelP3 />}
      {sessao.tipo === 'unidade' && <PainelUnidade unidade={sessao.unidade} sigla={sessao.sigla} />}
      {sessao.tipo === 'sem-perfil' && (
        <section className="cartao" role="alert">
          <h2>Conta sem perfil</h2>
          <p>Fale com a P/3 para liberar o acesso.</p>
        </section>
      )}
    </main>
  );
}
