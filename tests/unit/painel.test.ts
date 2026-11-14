import { describe, expect, test } from 'vitest';
import { diasEntre, somarDias } from '../../src/domain/datas';
import { demandaVazia, type Demanda } from '../../src/domain/demanda';
import { novoEncaminhamento, resumoDaDemanda, type Encaminhamento, type StatusEnc } from '../../src/domain/encaminhamento';
import { montarPainel } from '../../src/domain/painel';
import type { UnidadeId } from '../../src/domain/unidades';

const HOJE = '2026-11-13';

function demanda(numero: number, extra: Partial<Demanda> = {}): Demanda {
  return { ...demandaVazia(HOJE), saida: `D${numero}`, id: String(numero), numero, status: 'em_aberto', ...extra };
}

function enc(d: Demanda, unidade: UnidadeId, status: StatusEnc): Encaminhamento {
  return { ...novoEncaminhamento(d.id, unidade, resumoDaDemanda(d)), id: `${d.id}_${unidade}`, status };
}

describe('datas do painel', () => {
  test('somar dias atravessa mês e ano; diferença em dias', () => {
    expect(somarDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(diasEntre(HOJE, '2026-11-16')).toBe(3);
    expect(diasEntre(HOJE, '2026-11-12')).toBe(-1);
  });
});

describe('montarPainel', () => {
  const atrasada = demanda(1, { prazoCPA: '2026-11-10' });
  const hoje = demanda(2, { prazoCPA: HOJE });
  const em2dias = demanda(3, { prazoCPA: '2026-11-15', prazoCia: '2026-11-14', destinos: ['1cia', '2cia'] });
  const em10dias = demanda(4, { prazoCPA: '2026-11-23' });
  const ciaAtrasada = demanda(5, { prazoCPA: '2026-11-30', prazoCia: '2026-11-11', destinos: ['3cia'] });
  const encs = [
    enc(em2dias, '1cia', 'respondido'),
    enc(em2dias, '2cia', 'em_andamento'),
    enc(ciaAtrasada, '3cia', 'novo'),
  ];
  const p = montarPainel([atrasada, hoje, em2dias, em10dias, ciaAtrasada], encs, HOJE);

  test('contadores do topo', () => {
    expect(p).toMatchObject({ atrasadas: 1, venceHoje: 1, proximos3: 1, ciasAtrasadas: 1, aguardandoAceite: 1 });
  });

  test('por Cia: pendentes, atrasadas e aguardando aceite', () => {
    const linha = (u: string) => p.porCia.find((c) => c.unidade === u);
    expect(linha('1cia')).toMatchObject({ pendentes: 0, atrasadas: 0, aguardandoAceite: 1 });
    expect(linha('2cia')).toMatchObject({ pendentes: 1, atrasadas: 0 });
    expect(linha('3cia')).toMatchObject({ pendentes: 1, atrasadas: 1 });
    expect(p.porCia).toHaveLength(7);
  });

  test('próximos prazos em ordem de data, só de hoje em diante, e prazo da Cia só se alguma Cia deve', () => {
    expect(p.proximosPrazos.map((x) => `${x.numero}-${x.tipo}-${x.dias}`)).toEqual([
      '2-CPA-0',
      '3-Cia-1',
      '3-CPA-2',
      '4-CPA-10',
      '5-CPA-17',
    ]);
  });
});
