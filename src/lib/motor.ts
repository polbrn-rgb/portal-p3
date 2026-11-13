// Endereço do app da web do Apps Script (motor da agenda/pasta CFP). Vazio = só o gatilho de 5 minutos.
export const URL_MOTOR = '';

/**
 * Avisa o motor para rodar agora. Não espera resposta e nunca atrapalha o salvamento:
 * se falhar, o gatilho de reserva (5 min) faz o trabalho.
 */
export function cutucarMotor(url: string = URL_MOTOR): boolean {
  if (!url) return false;
  try {
    if (navigator.sendBeacon?.(url)) return true;
    void fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true }).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}
