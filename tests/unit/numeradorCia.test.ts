import { describe, expect, test } from 'vitest';
import {
  atrasadaCia,
  demandaCiaVazia,
  formatarNumeroCia,
  dadosDaDemandaCia,
  idContadorCia,
  normalizarDemandaCia,
  SECAO_DA_UNIDADE,
  textoOrdemVerbal,
  validarDemandaCia,
  type DemandaCia,
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

  test('Ordem Verbal: quem deu a ordem é obrigatório; nas outras origens o campo é limpo', () => {
    const d = { ...demandaCiaVazia('2027-01-10'), saida: 'Policiamento no evento', origem: 'Ordem Verbal' };
    expect(validarDemandaCia(d).quemOrdenou).toBe('Informe quem deu a ordem.');
    expect(validarDemandaCia({ ...d, quemOrdenou: '   ' }).quemOrdenou).toBeTruthy();
    expect(validarDemandaCia({ ...d, quemOrdenou: 'x'.repeat(121) }).quemOrdenou).toBeTruthy();
    expect(validarDemandaCia({ ...d, quemOrdenou: ' Cap PM Fulano ' })).toEqual({});
    expect(normalizarDemandaCia({ ...d, quemOrdenou: ' Cap PM Fulano ' }).quemOrdenou).toBe('Cap PM Fulano');
    expect(normalizarDemandaCia({ ...d, origem: 'E-mail', quemOrdenou: 'Cap PM Fulano' }).quemOrdenou).toBe('');
    expect(validarDemandaCia({ ...d, origem: 'SEI' })).toEqual({});
    expect(textoOrdemVerbal({ origem: 'Ordem Verbal', quemOrdenou: 'Cap PM Fulano' })).toBe('Ordem verbal de Cap PM Fulano');
    expect(textoOrdemVerbal({ origem: 'SEI', quemOrdenou: '' })).toBe('');
    // Demanda antiga (gravada antes do campo) abre com o campo vazio.
    expect(dadosDaDemandaCia({ ...d, quemOrdenou: undefined } as unknown as DemandaCia).quemOrdenou).toBe('');
  });
});
