import { useEffect, useRef, useState } from 'react';

export type AbaP3 = 'pendentes' | 'numerador' | 'painel' | 'cfp' | 'sala' | 'aperfeicoamento';

const ITENS: { aba: AbaP3; href: string; rotulo: string }[] = [
  { aba: 'pendentes', href: '#/pendentes', rotulo: 'Demandas Pendentes' },
  { aba: 'numerador', href: '#/demandas', rotulo: 'Numerador' },
  { aba: 'painel', href: '#/painel', rotulo: 'Painel' },
  { aba: 'cfp', href: '#/cfp', rotulo: 'CFP' },
  { aba: 'sala', href: '#/sala', rotulo: 'Sala Op.' },
  { aba: 'aperfeicoamento', href: '#/aperfeicoamento', rotulo: 'Aperfeiçoamento' },
];

/**
 * Menu da P/3. No computador: fixo na lateral esquerda. No celular: botão redondo (☰) no canto
 * superior esquerdo que abre a gaveta com as mesmas opções (fecha ao escolher, ao tocar fora ou no Esc).
 */
export function MenuP3({ ativa, pendentes }: { ativa: AbaP3; pendentes?: number }) {
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
        aria-controls="menu-p3"
        onClick={() => setAberto((a) => !a)}
      >
        <span aria-hidden="true" className="icone-menu" />
      </button>
      {aberto && <div className="fundo-menu" onClick={() => setAberto(false)} />}
      <nav id="menu-p3" className={`menu-p3${aberto ? ' aberto' : ''}`} aria-label="Seções da P/3">
        <div className="menu-cabecalho">
          <strong>Portal P3</strong>
          <button className="botao-fechar-menu" type="button" aria-label="Fechar menu" onClick={() => setAberto(false)}>
            ✕
          </button>
        </div>
        {ITENS.map((i) => (
          <a
            key={i.aba}
            ref={i.aba === ativa ? atualRef : undefined}
            href={i.href}
            aria-current={i.aba === ativa ? 'page' : undefined}
            onClick={() => setAberto(false)}
          >
            {i.rotulo}
            {i.aba === 'pendentes' && pendentes ? <span className="contador-aba">{pendentes}</span> : null}
          </a>
        ))}
      </nav>
    </>
  );
}
