import { randomInt } from 'node:crypto';

// Sem letras e números que se confundem (0/O, 1/l/I), para ditar ou copiar sem erro.
export const ALFABETO_SENHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function gerarSenha(tamanho = 10): string {
  let senha = '';
  for (let i = 0; i < tamanho; i++) senha += ALFABETO_SENHA[randomInt(ALFABETO_SENHA.length)];
  return senha;
}
