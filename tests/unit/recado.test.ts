import { describe, expect, test } from 'vitest';
import { LIMITE_RECADO, quandoFoi, validarRecado } from '../../src/domain/recado';

describe('recado do Cmt do P3 para o CFP', () => {
  test('precisa de texto e respeita o limite', () => {
    expect(validarRecado('')).toBe('Escreva o recado.');
    expect(validarRecado('   \n ')).toBe('Escreva o recado.');
    expect(validarRecado('Conferir viaturas da operação')).toBe('');
    expect(validarRecado(` ${'a'.repeat(LIMITE_RECADO)} `)).toBe('');
    expect(validarRecado('a'.repeat(LIMITE_RECADO + 1))).toContain('até 2000');
  });

  test('data e hora do recado', () => {
    expect(quandoFoi(new Date(2026, 10, 14, 7, 5))).toBe('14/11/2026 às 07:05');
    expect(quandoFoi(null)).toBe('');
    expect(quandoFoi(new Date('x'))).toBe('');
  });
});
