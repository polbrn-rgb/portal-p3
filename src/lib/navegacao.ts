import { useEffect, useState } from 'react';

// Navegação simples pelo "#" da URL: o botão Voltar do celular funciona sem biblioteca extra.
// Rotas que apontam para um item específico (link compartilhado): essas abrem direto, sem passar pela tela inicial.
// Sub-abas (ex.: #/operacoes/..., #/painel/p3, #/sala/mes) não entram: a página sempre abre na tela inicial.
const ROTA_DE_ITEM = /^#\/(enc|demanda|destinar|efetivo|eap|rac|numerador|documentos|admin)\/.+/;

/** Login: tira a rota da URL para a pessoa cair na tela inicial (P/3: Painel → Prazos; Cia: Painel de Demandas). */
export function irParaTelaInicial(): void {
  try {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch {
    /* sem history: segue */
  }
}

/** F5 (recarregar) mantém a tela em que a pessoa estava. */
function foiRecarregada(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === 'reload';
  } catch {
    return false;
  }
}

/**
 * Hash atual da URL. Com `inicial`, toda vez que a página é aberta ela começa nessa tela
 * (menos quando o link aponta para um item específico ou a página foi recarregada).
 */
export function useHash(inicial?: string): string {
  const [hash, setHash] = useState(() => {
    const atual = window.location.hash;
    if (inicial && atual !== inicial && !ROTA_DE_ITEM.test(atual) && !foiRecarregada()) {
      try {
        history.replaceState(null, '', inicial);
      } catch {
        /* sem history: segue no hash atual */
      }
      return window.location.hash || inicial;
    }
    return atual;
  });
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
