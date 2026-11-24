import { describe, expect, test } from 'vitest';
import { cabecalhoDespacho, dataMilitar, linhaAssinante, nomeArquivoDespacho, reComDigito, validarDespacho } from '../../src/domain/despacho';

describe('despacho do CGP', () => {
  test('cabeçalho: data no padrão 24NOV26, CGP e Cia de quem está logado', () => {
    expect(dataMilitar('2026-11-24')).toBe('24NOV26');
    expect(dataMilitar('2027-02-05')).toBe('05FEV27');
    expect(cabecalhoDespacho('1cia', '2026-11-24', ' A ')).toEqual(['Em 24NOV26', 'Do CGP 1 Pel A', 'Ao Sr. Cmt 1ª Cia.']);
    expect(cabecalhoDespacho('ft', '2026-11-24', 'B')).toEqual(['Em 24NOV26', 'Do CGP FT Pel B', 'Ao Sr. Cmt Cia FT.']);
  });

  test('assinante: posto, RE com dígito e nome de guerra', () => {
    expect(reComDigito('1446029')).toBe('144602-9');
    expect(reComDigito('144602-9')).toBe('144602-9');
    expect(reComDigito('144602')).toBe('144602');
    expect(linhaAssinante({ posto: '2º Sgt PM', re: '1446029', nomeGuerra: 'Sousa' })).toBe('2º Sgt PM 144602-9 Sousa');
  });

  test('não salva sem pelotão, texto, assinante ou assinatura', () => {
    expect(Object.keys(validarDespacho({ pelotao: '', texto: ' ', assinante: '', assinatura: '' })).sort()).toEqual(['assinante', 'assinatura', 'pelotao', 'texto']);
    expect(validarDespacho({ pelotao: 'A', texto: 'ok', assinante: 'Sd PM 1 X', assinatura: 'data:image/png;base64,AAA' })).toEqual({});
    expect(nomeArquivoDespacho({ unidadeId: '1cia', numero: '8BPMM-001/303/26', data: '2026-11-24' })).toBe('Despacho CGP 1 - 8BPMM-001-303-26 - 24NOV26.pdf');
  });
});
