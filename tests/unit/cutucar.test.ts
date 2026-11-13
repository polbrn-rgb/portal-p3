import { afterEach, describe, expect, test, vi } from 'vitest';
import { cutucarMotor } from '../../src/lib/motor';

describe('cutucarMotor', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('sem endereço configurado não chama nada', () => {
    const beacon = vi.fn((_url: string) => true);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    expect(cutucarMotor('')).toBe(false);
    expect(beacon).not.toHaveBeenCalled();
  });

  test('usa sendBeacon quando o navegador tem', () => {
    const beacon = vi.fn((_url: string) => true);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    expect(cutucarMotor('https://script.google.com/macros/s/x/exec')).toBe(true);
    expect(beacon).toHaveBeenCalledWith('https://script.google.com/macros/s/x/exec');
  });

  test('sem sendBeacon, cai para fetch sem esperar resposta; erro não sobe', () => {
    const chamada = vi.fn((_url: string, _opcoes: RequestInit) => Promise.reject(new Error('sem rede')));
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('fetch', chamada);
    expect(cutucarMotor('https://x/exec')).toBe(true);
    expect(chamada).toHaveBeenCalledWith('https://x/exec', { method: 'POST', mode: 'no-cors', keepalive: true });
  });
});
