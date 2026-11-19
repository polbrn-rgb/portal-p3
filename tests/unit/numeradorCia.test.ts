import { describe, expect, test } from 'vitest';
import {
  atrasadaCia,
  demandaCiaVazia,
  formatarNumeroCia,
  idContadorCia,
  SECAO_DA_UNIDADE,
  validarDemandaCia,
} from '../../src/domain/numeradorCia';
import { UNIDADES } from '../../src/domain/unidades';

describe('numerador das Cias/FT', () => {
  test('formato: TIPO 8BPMM-001/X03/AA (X = nº da Cia, FT = 7)', () => {
    expect(formatarNumeroCia('OFÍCIO', '1cia', 1, '2027-03-10')).toBe('OFÍCIO 8BPMM-001/103/27');
    expect(formatarNumeroCia('OFÍCIO', '2cia', 1, '2027-03-10')).toBe('OFÍCIO 8BPMM-001/203/27');
    expect(formatarNumeroCia('PARTE', '6cia', 42, '2027-03-10')).toBe('PARTE 8BPMM-042/603/27');
    expect(formatarNumeroCia('OFÍCIO', 'ft', 1, '2026-11-19')).toBe('OFÍCIO 8BPMM-001/703/26');
  });

  test('toda Cia tem seção e o contador é por Cia, ano e tipo', () => {
    for (const u of UNIDADES) expect(SECAO_DA_UNIDADE[u.id]).toMatch(/^[1-7]03$/);
    expect(idContadorCia('3cia', 2027, 'ORDEM DE SERVIÇO')).toBe('3cia_2027_ORDEM_DE_SERVICO');
  });

  test('validação e atraso', () => {
    const d = demandaCiaVazia('2027-01-10');
    expect(validarDemandaCia(d).saida).toBeTruthy();
    expect(validarDemandaCia({ ...d, saida: 'Escala', prazo: '2027-01-05' }).prazo).toBeTruthy();
    expect(validarDemandaCia({ ...d, saida: 'Escala', prazo: '2027-01-15' })).toEqual({});
    expect(atrasadaCia({ prazo: '2027-01-15', status: 'em_aberto' }, '2027-01-16')).toBe(true);
    expect(atrasadaCia({ prazo: '2027-01-15', status: 'concluida' }, '2027-01-16')).toBe(false);
  });
});
