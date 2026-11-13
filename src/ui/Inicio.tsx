import { signOut } from 'firebase/auth';
import type { Sessao } from '../domain/contas';
import { auth } from '../lib/firebase';
import { Topo } from './Topo';

export function Inicio({ sessao }: { sessao: Sessao }) {
  return (
    <main className="tela">
      <Topo>
        <button className="botao-sair" type="button" onClick={() => signOut(auth)}>
          Sair
        </button>
      </Topo>
      {sessao.tipo === 'sem-perfil' ? (
        <section className="cartao" role="alert">
          <h2>Conta sem perfil</h2>
          <p>Fale com a P/3 para liberar o acesso.</p>
        </section>
      ) : (
        <section className="cartao">
          <h2>{sessao.sigla}</h2>
          <p>
            {sessao.tipo === 'p3'
              ? 'O cadastro e o acompanhamento de demandas chegam na Fase 2.'
              : 'As demandas da sua unidade aparecem aqui a partir da Fase 3.'}
          </p>
        </section>
      )}
    </main>
  );
}
