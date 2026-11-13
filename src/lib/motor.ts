// Endereço do app da web do Apps Script (motor da agenda/pasta CFP). Vazio = só o gatilho de 5 minutos.
const URL_PRODUCAO =
  'https://script.google.com/macros/s/AKfycbwDzHy0XviM9Lg0Jh0SK3qsNmUW9-paBHxgSL7AYcGpfIp5jHF5VW76Gl7_KHZ5CKj3/exec';

// Nos testes (emulador) o motor real nunca é chamado.
export const URL_MOTOR = import.meta.env.VITE_USE_EMULATORS === 'true' ? '' : URL_PRODUCAO;

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
