import { app } from './lib/firebase';

export default function App() {
  return (
    <main className="tela">
      <header className="topo">
        <h1>Portal P3</h1>
        <p>P/3 · 8º BPM/M</p>
      </header>
      <section className="cartao">
        <h2>Fase 0 concluída</h2>
        <p>
          Projeto conectado: <strong>{app.options.projectId}</strong>
        </p>
      </section>
    </main>
  );
}
