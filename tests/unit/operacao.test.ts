import { describe, expect, test } from 'vitest';
import { demandaVazia, type Demanda } from '../../src/domain/demanda';
import {
  checklistVazio,
  diasDaOperacao,
  ehOperacao,
  lerChecklist,
  operacoesEmAndamento,
  pastaCfpDa,
  progresso,
  protocolosPreenchidos,
  rotuloDoItem,
} from '../../src/domain/operacao';

function demanda(numero: number, extra: Partial<Demanda> = {}): Demanda {
  return {
    ...demandaVazia('2026-11-14'),
    tipoSaida: 'ORDEM DE SERVIÇO',
    categoria: 'Operações Policiais',
    id: String(numero),
    numero,
    status: 'em_aberto',
    ...extra,
  } as Demanda;
}

describe('Checklist Operações', () => {
  test('só Ordem de Serviço ou Ordem de Operações + Operações Policiais vira operação', () => {
    expect(ehOperacao({ tipoSaida: 'ORDEM DE SERVIÇO', categoria: 'Operações Policiais' })).toBe(true);
    expect(ehOperacao({ tipoSaida: 'ORDEM DE OPERAÇÕES', categoria: 'Operações Policiais' })).toBe(true);
    expect(ehOperacao({ tipoSaida: 'ORDEM DE OPERAÇÕES', categoria: 'Escoltas' })).toBe(false);
    expect(rotuloDoItem({ id: 'osOk', rotulo: 'Ordem de Serviço ok' }, 'ORDEM DE OPERAÇÕES')).toBe('Ordem de Operações ok');
    expect(rotuloDoItem({ id: 'osOk', rotulo: 'Ordem de Serviço ok' }, 'ORDEM DE SERVIÇO')).toBe('Ordem de Serviço ok');
    expect(rotuloDoItem({ id: 'pastaOk', rotulo: 'Pasta' }, 'ORDEM DE OPERAÇÕES')).toBe('Pasta');
    expect(ehOperacao({ tipoSaida: 'OFÍCIO', categoria: 'Operações Policiais' })).toBe(false);
    expect(ehOperacao({ tipoSaida: 'ORDEM DE SERVIÇO', categoria: 'Escoltas' })).toBe(false);
  });

  test('dias de operação: do início ao término, inclusive (virada de mês)', () => {
    expect(diasDaOperacao('2026-11-29', '2026-12-02')).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
    expect(diasDaOperacao('2026-11-20', '')).toEqual(['2026-11-20']);
    expect(diasDaOperacao('2026-11-20', '2026-11-18')).toEqual(['2026-11-20']);
    expect(diasDaOperacao('', '2026-11-20')).toEqual([]);
    expect(diasDaOperacao('2026-01-01', '2026-12-31')).toHaveLength(60);
  });

  test('lê o checklist do banco com valores padrão e conta o andamento', () => {
    expect(lerChecklist(undefined)).toEqual(checklistVazio());
    const c = lerChecklist({ osOk: true, mapaForcaOk: true, protocolos: { '2026-11-20': '123' } });
    expect(progresso(c)).toEqual({ feitos: 2, total: 5 });
    expect(protocolosPreenchidos(c, ['2026-11-20', '2026-11-21'])).toBe(1);
    expect(protocolosPreenchidos(lerChecklist({ protocolos: { '2026-11-20': '  ' } }), ['2026-11-20'])).toBe(0);
  });

  test('em andamento: tira as concluídas e as que não são operação; a que começa antes em cima', () => {
    const lista = operacoesEmAndamento(
      [
        demanda(1, { inicioBtl: '2026-12-10' }),
        demanda(2, { inicioBtl: '2026-11-20' }),
        demanda(3, { inicioBtl: '' }),
        demanda(4, { categoria: 'Escoltas' }),
        demanda(5, { inicioBtl: '2026-11-01' }),
        demanda(6, { inicioBtl: '2026-11-02', status: 'excluido' }),
      ],
      { '5': { concluida: true }, '1': { osOk: true } },
    );
    expect(lista.map((o) => o.demanda.numero)).toEqual([2, 1, 3]);
    expect(lista[1].checklist.osOk).toBe(true);
  });

  test('link da pasta do CFP vem do motor', () => {
    expect(pastaCfpDa(demanda(1))).toBe('');
    expect(pastaCfpDa(demanda(1, { automacao: { cfpPasta: 'https://drive/p' } }))).toBe('https://drive/p');
  });
});
