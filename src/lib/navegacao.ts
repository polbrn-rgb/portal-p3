import { useEffect, useState } from 'react';

// Navegação simples pelo "#" da URL: o botão Voltar do celular funciona sem biblioteca extra.
export function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const aoMudar = () => setHash(window.location.hash);
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);
  return hash;
}

export function irPara(hash: string): void {
  window.location.hash = hash;
}
