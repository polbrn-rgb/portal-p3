import { describe, expect, test } from 'vitest';
import { unidadesParaEncaminhar, type DestinoId } from '../../src/domain/unidades';

const TODAS_AS_7 = ['1cia', '2cia', '3cia', '4cia', '5cia', '6cia', 'ft'];

describe('unidadesParaEncaminhar', () => {
  test('"TODAS" vira as 7 unidades com login, na ordem oficial', () => {
    expect(unidadesParaEncaminhar(['TODAS'])).toEqual(TODAS_AS_7);
  });

  test('"TODAS" junto com outras não duplica', () => {
    expect(unidadesParaEncaminhar(['3cia', 'TODAS', 'p1'])).toEqual(TODAS_AS_7);
  });

  test('remove repetidos e ordena', () => {
    expect(unidadesParaEncaminhar(['ft', '1cia', 'ft'])).toEqual(['1cia', 'ft']);
  });

  test('destinos só de registro não geram encaminhamento', () => {
    expect(unidadesParaEncaminhar(['secop', 'gt', 'p1', 'p2', 'outros'])).toEqual([]);
  });

  test('mistura de unidade e registro devolve só a unidade', () => {
    expect(unidadesParaEncaminhar(['p2', '5cia'])).toEqual(['5cia']);
  });

  test('lista vazia devolve vazio', () => {
    expect(unidadesParaEncaminhar([])).toEqual([]);
  });

  test('destino desconhecido dá erro', () => {
    expect(() => unidadesParaEncaminhar(['7cia' as DestinoId])).toThrow('Destino desconhecido: 7cia');
  });
});
