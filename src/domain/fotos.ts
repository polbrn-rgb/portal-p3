// Fotos do CGP, do TDS (CFP) e as encaminhadas à P/3 ficam 15 dias no sistema e depois o motor apaga.
// Tem que bater com FOTOS_DIAS_NO_SISTEMA e FOTOS_PRAZO_DESDE do apps-script/Logica.gs (o teste confere).

export const DIAS_NO_SISTEMA = 15;
/** As fotos que já estavam no sistema quando a regra começou contam os 15 dias a partir daqui. */
export const PRAZO_DESDE = '2026-11-22T03:00:00.000Z'; // 22/11/2026, 0h em Brasília

const DIA_MS = 24 * 60 * 60 * 1000;

/** Quando a foto sai do sistema (null: ainda sem a hora da gravação, logo depois de importar). */
export function apagaEm(gravadaEm: Date | null): Date | null {
  if (!gravadaEm || Number.isNaN(gravadaEm.getTime())) return null;
  return new Date(Math.max(gravadaEm.getTime(), Date.parse(PRAZO_DESDE)) + DIAS_NO_SISTEMA * DIA_MS);
}

/** "Sai do sistema em 07/12/2026" (ou "hoje"/"amanhã" perto do prazo). */
export function textoApagaEm(gravadaEm: Date | null, agora: Date = new Date()): string {
  const fim = apagaEm(gravadaEm);
  if (!fim) return `Fica ${DIAS_NO_SISTEMA} dias no sistema`;
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const faltam = Math.round((dia(fim) - dia(agora)) / DIA_MS);
  if (faltam <= 0) return 'Sai do sistema hoje';
  if (faltam === 1) return 'Sai do sistema amanhã';
  const p = (n: number) => String(n).padStart(2, '0');
  return `Sai do sistema em ${p(fim.getDate())}/${p(fim.getMonth() + 1)}/${fim.getFullYear()}`;
}
