import { useSessao } from './lib/useSessao';
import { Inicio } from './ui/Inicio';
import { Login } from './ui/Login';
import { Topo } from './ui/Topo';

export default function App() {
  const sessao = useSessao();

  if (sessao.estado === 'carregando') {
    return (
      <main className="tela">
        <Topo />
        <p className="carregando">Carregando…</p>
      </main>
    );
  }
  if (sessao.estado === 'deslogado') return <Login />;
  return <Inicio sessao={sessao.sessao} />;
}
