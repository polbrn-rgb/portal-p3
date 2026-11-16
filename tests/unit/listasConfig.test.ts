import { describe, expect, test } from 'vitest';
import { demandaVazia, validarDemanda } from '../../src/domain/demanda';
import {
  adicionarItem,
  alternarItem,
  lerListas,
  listasPadrao,
  moverItem,
  opcoesDoCampo,
  type ItemLista,
} from '../../src/domain/listasConfig';

const itens = (...v: string[]): ItemLista[] => v.map((valor) => ({ valor, ativo: true }));

describe('listas do numerador (Administrador)', () => {
  test('sem configuração valem as listas padrão; documento quebrado volta para o padrão', () => {
    expect(lerListas(undefined)).toEqual(listasPadrao());
    expect(lerListas({ categorias: 'x', responsaveis: [{ valor: '' }, { valor: 'Sd Novo' }] }).responsaveis).toEqual(itens('Sd Novo'));
  });

  test('item do sistema nunca some nem fica retirado', () => {
    const l = lerListas({ categorias: [{ valor: 'Operações Policiais', ativo: false }, { valor: 'RAC', ativo: true }] });
    expect(l.categorias).toEqual(itens('Operações Policiais', 'RAC', 'Outras Demandas'));
    expect(alternarItem('categorias', l.categorias, 'Operações Policiais')).toMatch(/sistema/);
  });

  test('incluir: sem vazio, sem repetido (ignora maiúscula e acento), sem texto enorme', () => {
    const l = itens('Cb Holanda');
    expect(adicionarItem(l, '  Sd   Priscila ')).toEqual(itens('Cb Holanda', 'Sd Priscila'));
    expect(adicionarItem(l, '')).toBe('Digite o item.');
    expect(adicionarItem(l, 'cb holanda')).toBe('Esse item já está na lista.');
    expect(adicionarItem([{ valor: 'Cb Holanda', ativo: false }], 'CB HOLANDA')).toMatch(/Reativar/);
    expect(adicionarItem(l, 'x'.repeat(61))).toMatch(/máximo/);
    expect(adicionarItem(itens('OFÍCIO'), 'oficio')).toBe('Esse item já está na lista.');
  });

  test('retirar sai das opções das novas; a demanda antiga com ele continua mostrando e validando', () => {
    const l = listasPadrao();
    l.responsaveis = alternarItem('responsaveis', l.responsaveis, 'Cap Filipi') as ItemLista[];
    expect(opcoesDoCampo(l, 'responsaveis')).not.toContain('Cap Filipi');
    expect(opcoesDoCampo(l, 'responsaveis', 'Cap Filipi').at(-1)).toBe('Cap Filipi');
    const antiga = { ...demandaVazia('2026-11-16'), saida: 'X', responsavel: 'Cap Filipi' as const };
    expect(validarDemanda(antiga, l)).toEqual({});
    expect(validarDemanda({ ...antiga, responsavel: 'Ninguém' as never }, l).responsavel).toBe('Responsável inválido.');
  });

  test('item novo vale nas demandas; ordem muda com ↑ ↓', () => {
    const l = listasPadrao();
    l.tiposSaida = adicionarItem(l.tiposSaida, 'INFORMAÇÃO') as ItemLista[];
    expect(validarDemanda({ ...demandaVazia('2026-11-16'), saida: 'X', tipoSaida: 'INFORMAÇÃO' as never }, l)).toEqual({});
    expect(moverItem(itens('A', 'B', 'C'), 'C', -1).map((i) => i.valor)).toEqual(['A', 'C', 'B']);
    expect(moverItem(itens('A', 'B'), 'A', -1).map((i) => i.valor)).toEqual(['A', 'B']);
  });
});
