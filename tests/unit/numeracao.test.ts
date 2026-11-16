import { describe, expect, test } from 'vitest';
import { emLotes, lerUltimoNumero } from '../../src/domain/admin';
import { TIPOS_SAIDA } from '../../src/domain/listas';
import {
  formatarNumeroDocumento,
  idContadorTipo,
  numeroExibido,
  rotuloContador,
  slugTipo,
  usaNumeracaoPorTipo,
} from '../../src/domain/numeracao';

describe('numeração por tipo de saída (2027 em diante)', () => {
  test('vale pela data de entrada, a partir de 01/01/2027', () => {
    expect(usaNumeracaoPorTipo('2026-12-31')).toBe(false);
    expect(usaNumeracaoPorTipo('2027-01-01')).toBe(true);
    expect(usaNumeracaoPorTipo('2030-06-15')).toBe(true);
  });

  test('formato: TIPO 8BPMM-001/03/AA (03 = seção, igual o ano todo)', () => {
    expect(formatarNumeroDocumento('OFÍCIO', 1, '2027-03-10')).toBe('OFÍCIO 8BPMM-001/03/27');
    expect(formatarNumeroDocumento('PARTE', 42, '2027-12-01')).toBe('PARTE 8BPMM-042/03/27');
    expect(formatarNumeroDocumento('OFÍCIO', 1234, '2028-01-02')).toBe('OFÍCIO 8BPMM-1234/03/28');
  });

  test('um contador por tipo e por ano, com id sem acento', () => {
    expect(slugTipo('ORDEM DE SERVIÇO')).toBe('ORDEM_DE_SERVICO');
    expect(idContadorTipo(2027, 'MSG ELETRÔNICA')).toBe('tipo_2027_MSG_ELETRONICA');
    expect(new Set(TIPOS_SAIDA.map(slugTipo)).size).toBe(TIPOS_SAIDA.length);
  });

  test('o que aparece nas listas e no Administrador', () => {
    expect(numeroExibido({ numero: 2151 })).toBe('Nº 2151');
    expect(numeroExibido({ numero: 2600, numeroDocumento: 'OFÍCIO 8BPMM-001/01/27' })).toBe('OFÍCIO 8BPMM-001/01/27');
    expect(rotuloContador('demandas', TIPOS_SAIDA)).toBe('Geral (nº interno)');
    expect(rotuloContador('tipo_2027_ORDEM_DE_SERVICO', TIPOS_SAIDA)).toBe('ORDEM DE SERVIÇO (2027)');
  });
});

describe('Administrador', () => {
  test('número inicial: inteiro de 0 para cima', () => {
    expect(lerUltimoNumero(' 2150 ')).toBe(2150);
    expect(lerUltimoNumero('0')).toBe(0);
    expect(typeof lerUltimoNumero('-1')).toBe('string');
    expect(typeof lerUltimoNumero('21,5')).toBe('string');
    expect(typeof lerUltimoNumero('')).toBe('string');
  });

  test('grava em lotes de até 400', () => {
    expect(emLotes(Array.from({ length: 901 }, (_, i) => i)).map((l) => l.length)).toEqual([400, 400, 101]);
    expect(emLotes([])).toEqual([]);
  });
});
