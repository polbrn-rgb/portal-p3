import { describe, expect, test } from 'vitest';
import { diasConsiderados, INDICADORES_PAINEL, montarPainelBatalhao, porCia, porDia } from '../../src/domain/painelBatalhao';
import { itensZerados, type Itens, type Producao } from '../../src/domain/producao';

const lanc = (data: string, itens: Partial<Itens>, x: Partial<Producao> = {}): Producao => ({
  id: '',
  unidadeId: '1cia',
  data,
  mes: data.slice(0, 7),
  pelotao: 'pelA',
  itens: { ...itensZerados(), ...itens },
  taloes: [],
  lancadoPor: 'x',
  lancadoEm: new Date(2026, 10, 1, 8),
  atualizadoPor: 'x',
  atualizadoEm: null,
  ...x,
});

describe('estatístico do Batalhão', () => {
  test('dias considerados: até hoje no mês corrente; o mês todo nos passados', () => {
    expect(diasConsiderados('2026-11', '2026-11-20')).toBe(20);
    expect(diasConsiderados('2026-10', '2026-11-20')).toBe(31);
    expect(diasConsiderados('2026-12', '2026-11-20')).toBe(0);
  });

  test('totais do mês até hoje contra os mesmos dias do mês anterior', () => {
    const doMes = [
      lanc('2026-11-01', { pessoasAbordadas: 30, flagrante: 1, procurados: 1, maconhaKg: 0.5, crackKg: 0.25 }),
      lanc('2026-11-02', { pessoasAbordadas: 10, veiculosVistoriados: 2, motosVistoriadas: 1 }, { unidadeId: '2cia' }),
    ];
    const anterior = [lanc('2026-10-01', { pessoasAbordadas: 20 }), lanc('2026-10-25', { pessoasAbordadas: 999 })];
    const p = montarPainelBatalhao(doMes, anterior, '2026-11', '2026-11-02');
    const t = Object.fromEntries(p.totais.map((x) => [x.id, x]));
    expect(t.abordados).toMatchObject({ atual: 40, anterior: 20, variacao: 1 }); // o dia 25/10 não entra
    expect(t.veiculos.atual).toBe(3);
    expect(t.presos.atual).toBe(2);
    expect(t.drogas.atual).toBe(0.75);
    expect(t.armas).toMatchObject({ atual: 0, anterior: 0, variacao: 0 });
    expect(p.ateDia).toBe(2);
    expect(p.lancamentos).toBe(2);
    expect(p.ultimoLancamento).toBeInstanceOf(Date);
  });

  test('flagrantes por natureza e Cias com turnos sem lançamento', () => {
    const doMes = [
      lanc('2026-11-01', {}, {
        taloes: [
          { numero: '1', bopc: '', data: '2026-11-01', natureza: 'trafico' },
          { numero: '2', bopc: '', data: '2026-11-01', natureza: 'trafico' },
          { numero: '3', bopc: '', data: '2026-11-01', natureza: '' },
        ],
      }),
    ];
    const p = montarPainelBatalhao(doMes, [], '2026-11', '2026-11-03');
    expect(p.naturezas).toEqual([
      { rotulo: 'Tráfico de drogas', valor: 2 },
      { rotulo: 'Sem natureza informada', valor: 1 },
    ]);
    expect(p.flagrantes).toMatchObject({ atual: 3, anterior: 0, variacao: null });
    const c = Object.fromEntries(p.cobertura.map((x) => [x.unidadeId, x.turnosFaltando]));
    expect(c['1cia']).toBe(3); // dia 1 noite, dia 2 dia e noite
    expect(c.ft).toBe(2); // só turno do dia
  });

  test('dia a dia e por Cia', () => {
    const doMes = [lanc('2026-11-01', { ai: 1, ait: 2, trv: 1 }), lanc('2026-11-03', { ai: 1 }, { unidadeId: 'ft' }), lanc('2026-11-20', { ai: 5 })];
    const d = porDia(doMes, '2026-11', 'autuacoes');
    expect(d).toHaveLength(30);
    expect(d.slice(0, 3)).toEqual([
      { rotulo: '01', valor: 4 },
      { rotulo: '02', valor: 0 },
      { rotulo: '03', valor: 1 },
    ]);
    const c = porCia(doMes, '2026-11', '2026-11-10', 'autuacoes');
    expect(c.find((x) => x.rotulo === '1ª CIA')!.valor).toBe(4); // o dia 20 ainda não chegou
    expect(c.at(-1)).toEqual({ rotulo: 'CIA FT', valor: 1 });
  });

  test('cada indicador do painel dá número com itens zerados', () => {
    for (const i of INDICADORES_PAINEL) expect(i.valor(itensZerados())).toBe(0);
  });
});
