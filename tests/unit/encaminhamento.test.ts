import { describe, expect, test } from 'vitest';
import { demandaVazia, type Demanda } from '../../src/domain/demanda';
import {
  abaDoEncaminhamento,
  andamentoPorDemanda,
  encAtrasado,
  novoEncaminhamento,
  planejarEncaminhamentos,
  resumoDaDemanda,
  type Encaminhamento,
  type StatusEnc,
} from '../../src/domain/encaminhamento';
import type { UnidadeId } from '../../src/domain/unidades';
import { situacaoDaDemanda } from '../../src/domain/situacao';

const HOJE = '2026-11-13';

function demanda(extra: Partial<Demanda> = {}): Demanda {
  return {
    ...demandaVazia(HOJE),
    saida: 'Escolta',
    categoria: 'Escoltas',
    id: '10',
    numero: 10,
    status: 'em_aberto',
    ...extra,
  };
}

function enc(unidadeId: UnidadeId, status: StatusEnc = 'novo', d: Demanda = demanda()): Encaminhamento {
  return { ...novoEncaminhamento(d.id, unidadeId, resumoDaDemanda(d)), id: `${d.id}_${unidadeId}`, status };
}

describe('resumoDaDemanda', () => {
  test('sem prazo da Cia, usa o prazo do CPA', () => {
    expect(resumoDaDemanda(demanda({ prazoCPA: '2026-11-20' })).prazoCia).toBe('2026-11-20');
    expect(resumoDaDemanda(demanda({ prazoCPA: '2026-11-20', prazoCia: '2026-11-18' })).prazoCia).toBe('2026-11-18');
  });
});

describe('planejarEncaminhamentos', () => {
  test('demanda nova: cria um por Cia, ignorando destinos só de registro', () => {
    const plano = planejarEncaminhamentos(demanda({ destinos: ['1cia', 'ft', 'p2'] }), []);
    expect(plano).toEqual({ criar: ['1cia', 'ft'], cancelar: [], reativar: [], atualizarResumo: [] });
  });

  test('TODAS cria para as 7', () => {
    expect(planejarEncaminhamentos(demanda({ destinos: ['TODAS'] }), []).criar).toHaveLength(7);
  });

  test('troca de Cia: a que saiu é cancelada e a que entrou é criada', () => {
    const plano = planejarEncaminhamentos(demanda({ destinos: ['3cia'] }), [enc('1cia')]);
    expect(plano.criar).toEqual(['3cia']);
    expect(plano.cancelar).toEqual(['10_1cia']);
  });

  test('Cia que volta é reativada, e cancelada não é cancelada de novo', () => {
    const plano = planejarEncaminhamentos(demanda({ destinos: ['1cia'] }), [enc('1cia', 'cancelado'), enc('2cia', 'cancelado')]);
    expect(plano.reativar).toEqual(['10_1cia']);
    expect(plano.cancelar).toEqual([]);
    expect(plano.criar).toEqual([]);
  });

  test('mudança de assunto ou prazo é copiada para quem continua', () => {
    const existentes = [enc('1cia', 'respondido'), enc('2cia')];
    const nova = demanda({ destinos: ['1cia', '2cia'], saida: 'Escolta alterada' });
    expect(planejarEncaminhamentos(nova, existentes).atualizarResumo).toEqual(['10_1cia', '10_2cia']);
    expect(planejarEncaminhamentos(demanda({ destinos: ['1cia', '2cia'] }), existentes).atualizarResumo).toEqual([]);
  });
});

describe('andamento e visão da Cia', () => {
  test('conta pendentes e respondidas por demanda', () => {
    const r = andamentoPorDemanda([
      { demandaId: '10', status: 'novo' },
      { demandaId: '10', status: 'devolvido' },
      { demandaId: '10', status: 'respondido' },
      { demandaId: '11', status: 'respondido' },
    ]);
    expect(r).toEqual({ '10': { pendentes: 2, respondidas: 1 }, '11': { pendentes: 0, respondidas: 1 } });
  });

  test('atrasado só se o prazo passou e a Cia ainda não respondeu', () => {
    expect(encAtrasado({ status: 'em_andamento', prazoCia: '2026-11-12' }, HOJE)).toBe(true);
    expect(encAtrasado({ status: 'respondido', prazoCia: '2026-11-12' }, HOJE)).toBe(false);
    expect(encAtrasado({ status: 'novo', prazoCia: HOJE }, HOJE)).toBe(false);
    expect(encAtrasado({ status: 'novo', prazoCia: '' }, HOJE)).toBe(false);
  });

  test('aba de cada status na tela da Cia', () => {
    expect(abaDoEncaminhamento('devolvido')).toBe('pendentes');
    expect(abaDoEncaminhamento('respondido')).toBe('respondidas');
    expect(abaDoEncaminhamento('aceito')).toBe('finalizadas');
    expect(abaDoEncaminhamento('cancelado')).toBe(null);
  });
});

describe('situação com as respostas das Cias', () => {
  test('prazo da Cia vencido só conta se alguma Cia ainda deve', () => {
    const d = demanda({ destinos: ['1cia'], prazoCPA: '2026-11-20', prazoCia: '2026-11-12' });
    expect(situacaoDaDemanda(d, HOJE, 1)).toBe('cia_atrasada');
    expect(situacaoDaDemanda(d, HOJE, 0)).toBe('respondida');
    expect(situacaoDaDemanda(d, HOJE)).toBe('cia_atrasada');
  });

  test('sem Cia nos destinos nunca fica "Cias responderam"', () => {
    expect(situacaoDaDemanda(demanda({ destinos: ['p1'] }), HOJE, 0)).toBe('em_aberto');
  });
});
