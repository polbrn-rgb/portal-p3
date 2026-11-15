import { useEffect, useRef, useState } from 'react';

export type ItemMenu = { id: string; href: string; rotulo: string; contador?: number };

/**
 * Menu lateral usado pela P/3 e pelas Cias. No computador: fixo na lateral esquerda. No celular: botão
 * redondo (☰) no canto superior esquerdo que abre a gaveta com as mesmas opções (fecha ao escolher, ao
 * tocar fora ou no Esc).
 */
export function MenuLateral(p: { id: string; rotulo: string; titulo: string; itens: ItemMenu[]; ativa?: string }) {
  const [aberto, setAberto] = useState(false);
  const atualRef = useRef<HTMLAnchorElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    atualRef.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setAberto(false);
      botaoRef.current?.focus();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto]);

  return (
    <>
      <button
        ref={botaoRef}
        className="botao-menu"
        type="button"
        aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={aberto}
        aria-controls={p.id}
        onClick={() => setAberto((a) => !a)}
      >
        <span aria-hidden="true" className="icone-menu" />
      </button>
      {aberto && <div className="fundo-menu" onClick={() => setAberto(false)} />}
      <nav id={p.id} className={`menu-p3${aberto ? ' aberto' : ''}`} aria-label={p.rotulo}>
        <div className="menu-cabecalho">
          <strong>{p.titulo}</strong>
          <button className="botao-fechar-menu" type="button" aria-label="Fechar menu" onClick={() => setAberto(false)}>
            ✕
          </button>
        </div>
        {p.itens.map((i) => (
          <a
            key={i.id}
            ref={i.id === p.ativa ? atualRef : undefined}
            href={i.href}
            aria-current={i.id === p.ativa ? 'page' : undefined}
            onClick={() => setAberto(false)}
          >
            {i.rotulo}
            {i.contador ? <span className="contador-aba">{i.contador}</span> : null}
          </a>
        ))}
      </nav>
    </>
  );
}
