import { lazy, type ComponentType } from 'react';

const CHAVE_RECARGA = 'portalp3.recargaPorVersao';

/**
 * Carrega uma tela só quando ela é aberta (o celular baixa menos código no primeiro acesso).
 *
 * Depois de publicar uma versão nova, quem estava com o portal aberto ainda pede os arquivos da versão
 * antiga, que não existem mais. Nesse caso a página é recarregada uma vez para pegar a versão nova.
 */
export function sobDemanda<M, K extends keyof M>(carregar: () => Promise<M>, nome: K): M[K] {
  return lazy(async () => {
    try {
      const modulo = await carregar();
      try {
        sessionStorage.removeItem(CHAVE_RECARGA);
      } catch {
        /* sem armazenamento */
      }
      return { default: modulo[nome] as ComponentType<unknown> };
    } catch (erro) {
      let jaRecarregou = false;
      try {
        jaRecarregou = sessionStorage.getItem(CHAVE_RECARGA) === '1';
        if (!jaRecarregou) sessionStorage.setItem(CHAVE_RECARGA, '1');
      } catch {
        jaRecarregou = true; // sem armazenamento não dá para evitar recarga em laço: mostra o erro
      }
      if (!jaRecarregou) {
        window.location.reload();
        return new Promise<never>(() => undefined);
      }
      throw erro;
    }
  }) as unknown as M[K];
}
