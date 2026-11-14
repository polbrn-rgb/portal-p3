import { describe, expect, test } from 'vitest';
import { demandaVazia, type Demanda } from '../../src/domain/demanda';
import { novoEncaminhamento, resumoDaDemanda, type Encaminhamento } from '../../src/domain/encaminhamento';
import { montarCsv } from '../../src/domain/exportar';

const HOJE = '2026-11-13';

function demanda(numero: number, extra: Partial<Demanda> = {}): Demanda {
  return { ...demandaVazia('2026-11-10'), saida: `Demanda ${numero}`, id: String(numero), numero, status: 'em_aberto', ...extra };
}

describe('montarCsv (planilha de backup)', () => {
  const d1 = demanda(2101, { destinos: ['1cia', 'p2'], prazoCPA: '2026-11-01', responsavel: 'Sgt Sousa' });
  const d2 = demanda(2102, { saida: 'Texto com ; ponto e vírgula e "aspas"', status: 'concluido', adicionarCFP: true });
  const d3 = demanda(2103, { status: 'excluido', prazoCPA: '2026-11-01' });
  const enc: Encaminhamento = {
    ...novoEncaminhamento('2101', '1cia', resumoDaDemanda(d1)),
    id: '2101_1cia',
    status: 'respondido',
    resposta: 'Feito.',
    respondidoPor: 'Sd Silva',
  };
  const csv = montarCsv([d1, d2, d3], [enc], HOJE);
  const linhas = csv.slice(1).trim().split('\r\n');

  test('começa com BOM (acentos no Excel) e o cabeçalho do numerador', () => {
    expect(csv.startsWith('﻿')).toBe(true);
    expect(linhas[0].startsWith('Nº Demanda;Demanda;Data Entrada;Origem')).toBe(true);
  });

  test('uma linha por demanda, da mais nova para a mais antiga (a excluída fica marcada, o número não some)', () => {
    expect(linhas).toHaveLength(4);
    expect(linhas[1].startsWith('2103;')).toBe(true);
    expect(linhas[1]).toContain(';Excluída;');
    expect(linhas[2].startsWith('2102;')).toBe(true);
    expect(linhas[3].startsWith('2101;')).toBe(true);
  });

  test('protege ponto e vírgula e aspas, e escreve Sim/Não', () => {
    expect(linhas[2]).toContain('"Texto com ; ponto e vírgula e ""aspas"""');
    expect(linhas[2]).toContain(';Sim;');
    expect(linhas[2]).toContain('Concluído');
  });

  test('datas em dd/mm/aaaa, destinos por sigla, situação e respostas das Cias', () => {
    expect(linhas[3]).toContain('10/11/2026');
    expect(linhas[3]).toContain('1ª CIA, P/2');
    expect(linhas[3]).toContain('Atrasado');
    expect(linhas[3]).toContain('1ª CIA - Respondido (Sd Silva): Feito.');
  });
});
