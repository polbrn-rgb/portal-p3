const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Data de hoje no horário do aparelho, no formato AAAA-MM-DD. */
export function hojeISO(agora = new Date()): string {
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

export function ehDataISO(valor: string): boolean {
  return ISO.test(valor);
}

/** "2026-11-13" -> "13/11/2026". Vazio continua vazio. */
export function formatarData(iso: string): string {
  if (!ehDataISO(iso)) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Soma (ou subtrai) dias a uma data AAAA-MM-DD. */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  return hojeISO(new Date(a, m - 1, d + dias));
}

/** Quantos dias faltam de `de` até `ate` (negativo = já passou). */
export function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.split('-').map(Number);
  const [a2, m2, d2] = ate.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}
