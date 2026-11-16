import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, test } from 'vitest';
import { dividirEmPartes, lerQuantidadesIcc, prazoPadraoIcc, situacaoRespostaIcc, totalIcc, validarIcc, type RespostaIcc } from '../../src/domain/icc';

const ctx: Record<string, unknown> = {};
runInNewContext(readFileSync('apps-script/Logica.gs', 'utf8'), ctx);
const gs = ctx as unknown as { celulasIcc: (u: string, r: Record<string, number>) => Record<string, number>; ANCORAS_ICC: Record<string, string> };

describe('ICC', () => {
  test('prazo padrão: dia 15 deste mês; depois do dia 15, o do mês seguinte', () => {
    expect(prazoPadraoIcc('2026-11-03')).toBe('2026-11-15');
    expect(prazoPadraoIcc('2026-11-15')).toBe('2026-11-15');
    expect(prazoPadraoIcc('2026-11-16')).toBe('2026-12-15');
    expect(prazoPadraoIcc('2026-12-20')).toBe('2027-01-15');
  });

  test('nova ICC: número, prazo e PDF de até 10 MB', () => {
    const pdf = { name: 'ICC 427.pdf', size: 1000, type: 'application/pdf' };
    expect(validarIcc({ numero: '427', prazo: '2026-11-15' }, pdf)).toEqual({});
    expect(validarIcc({ numero: 'x', prazo: '' }, null)).toEqual({ numero: expect.any(String), prazo: expect.any(String), arquivo: 'Escolha o PDF da ordem.' });
    expect(validarIcc({ numero: '1', prazo: '2026-11-15' }, { ...pdf, name: 'a.docx', type: 'x' }).arquivo).toMatch(/PDF/);
    expect(validarIcc({ numero: '1', prazo: '2026-11-15' }, { ...pdf, size: 11 * 1024 * 1024 }).arquivo).toMatch(/10 MB/);
  });

  test('quantidades obrigatórias (zero vale) e total', () => {
    const r = lerQuantidadesIcc({ oficiais: '1', sargentos: '0', cabos: '' });
    expect(r.erros).toEqual({ cabos: expect.any(String) });
    expect(lerQuantidadesIcc({ oficiais: '1', sargentos: '9', cabos: '43' }).valores).toEqual({ oficiais: 1, sargentos: 9, cabos: 43 });
    expect(totalIcc({ oficiais: 1, sargentos: 9, cabos: 43 })).toBe(53);
    expect(lerQuantidadesIcc({ oficiais: '1.5', sargentos: '-1', cabos: '0' }).erros).toMatchObject({ oficiais: expect.any(String), sargentos: expect.any(String) });
  });

  test('situação da Cia', () => {
    const r = { gravado: false } as RespostaIcc;
    expect(situacaoRespostaIcc(undefined, '2026-11-15', '2026-11-15')).toBe('pendente');
    expect(situacaoRespostaIcc(undefined, '2026-11-15', '2026-11-16')).toBe('atrasado');
    expect(situacaoRespostaIcc(r, '2026-11-15')).toBe('enviado');
    expect(situacaoRespostaIcc({ ...r, gravado: true }, '2026-11-15')).toBe('gravado');
  });

  test('PDF em partes de até 700 mil caracteres', () => {
    const b64 = 'A'.repeat(1_500_000);
    const partes = dividirEmPartes(b64);
    expect(partes.map((p) => p.length)).toEqual([700_000, 700_000, 100_000]);
    expect(partes.join('')).toBe(b64);
    expect(dividirEmPartes('')).toEqual(['']);
  });

  test('motor: coluna de cada Cia na planilha (o total é a soma)', () => {
    expect(gs.celulasIcc('2cia', { oficiais: 1, sargentos: 9, cabos: 43 })).toEqual({ E5: 1, E6: 9, E7: 43, E8: 53 });
    expect(Object.keys(gs.celulasIcc('ft', { oficiais: 0, sargentos: 0, cabos: 0 }))).toEqual(['J5', 'J6', 'J7', 'J8']);
    expect(() => gs.celulasIcc('sala', {})).toThrow();
    expect(gs.ANCORAS_ICC).toMatchObject({ D4: 'QTD 1ª CIA', J4: 'QTD FT', C8: 'Total' });
  });
});
