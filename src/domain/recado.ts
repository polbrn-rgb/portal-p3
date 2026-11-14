// Recado do Cmt do P3 para o CFP.
export const LIMITE_RECADO = 2000;

/** '' = pode enviar; senão, a mensagem de erro. */
export function validarRecado(texto: string): string {
  const t = texto.trim();
  if (!t) return 'Escreva o recado.';
  if (t.length > LIMITE_RECADO) return `O recado pode ter até ${LIMITE_RECADO} caracteres (tem ${t.length}).`;
  return '';
}

/** "14/11/2026 às 17:29" */
export function quandoFoi(data: Date | null): string {
  if (!data || Number.isNaN(data.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(data.getDate())}/${p(data.getMonth() + 1)}/${data.getFullYear()} às ${p(data.getHours())}:${p(data.getMinutes())}`;
}
