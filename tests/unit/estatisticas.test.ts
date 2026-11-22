import { describe, expect, test } from 'vitest';
import { demandaVazia, type Demanda } from '../../src/domain/demanda';
import { montarEstatisticas } from '../../src/domain/estatisticas';

const HOJE = '2026-11-15'; // domingo
let n = 0;
const demanda = (extra: Partial<Demanda>): Demanda => ({
  ...demandaVazia('2026-11-10'),
  id: String(++n),
  numero: n,
  saida: 'x',
  status: 'em_aberto',
  ...extra,
}) as Demanda;

describe('painel estatístico', () => {
  const lista = [
    demanda({ dataEntrada: '2026-11-10', responsavel: 'Cb Holanda', categoria: 'Escoltas', tipoSaida: 'OFÍCIO', status: 'concluido' }),
    demanda({ dataEntrada: '2026-11-11', responsavel: 'Cb Holanda', categoria: 'Escoltas', tipoSaida: 'OFÍCIO', prazoCPA: '2026-11-15' }),
    demanda({ dataEntrada: '2026-10-05', responsavel: 'Sd Priscila', categoria: 'DEJEM', tipoSaida: 'MSG ELETRÔNICA', prazoCPA: '2026-11-01' }),
    demanda({ dataEntrada: '2026-01-04', responsavel: '', categoria: 'DEJEM', tipoSaida: 'OFÍCIO' }),
    demanda({ dataEntrada: '2026-11-12', status: 'excluido', responsavel: 'Cb Holanda' }),
  ];
  const e = montarEstatisticas(lista, HOJE);

  test('números do topo (a excluída não conta)', () => {
    expect(e).toMatchObject({ total: 4, doMes: 2, emAberto: 3, venceHoje: 1, atrasadas: 1 });
  });

  test('status na ordem do numerador, só os que têm demanda', () => {
    expect(e.porStatus).toEqual([
      { rotulo: 'Concluído', valor: 1 },
      { rotulo: 'Em aberto', valor: 1 },
      { rotulo: 'Vence Hoje', valor: 1 },
      { rotulo: 'Atrasado', valor: 1 },
    ]);
  });

  test('mês e dia da semana da entrada', () => {
    expect(e.porMes.map((m) => m.valor)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 0]);
    expect(e.porMes[10].rotulo).toBe('nov');
    // 10/11 terça, 11/11 quarta, 05/10 segunda, 04/01 domingo
    expect(e.porDiaSemana.map((d) => d.valor)).toEqual([1, 1, 1, 1, 0, 0, 0]);
  });

  test('responsável, categoria e tipo de saída do maior para o menor; vazio vira "Não informado"', () => {
    expect(e.porResponsavel).toEqual([
      { rotulo: 'Cb Holanda', valor: 2 },
      { rotulo: 'Não informado', valor: 1 },
      { rotulo: 'Sd Priscila', valor: 1 },
    ]);
    expect(e.porCategoria).toEqual([
      { rotulo: 'DEJEM', valor: 2 },
      { rotulo: 'Escoltas', valor: 2 },
    ]);
    expect(e.porTipoSaida[0]).toEqual({ rotulo: 'OFÍCIO', valor: 3 });
  });

  test('Cia atrasada usa o andamento das Cias', () => {
    const d = demanda({ dataEntrada: '2026-11-01', prazoCia: '2026-11-10', destinos: ['1cia'] });
    const s = montarEstatisticas([d], HOJE, () => ({ pendentes: 1, respondidas: 0 }));
    expect(s.porStatus).toEqual([{ rotulo: 'Cia Atrasada', valor: 1 }]);
  });
});

describe('painel guardado no aparelho: juntar o que mudou', () => {
  const d = (id: string, dataEntrada: string, status: 'em_aberto' | 'concluido' = 'em_aberto') =>
    ({ id, numero: Number(id), dataEntrada, status, prazoCPA: '', prazoCia: '', responsavel: '', categoria: '', tipoSaida: '' }) as const;

  test('troca as que mudaram, acrescenta as novas e tira as que saíram do ano', async () => {
    const { juntarMudancas } = await import('../../src/domain/estatisticas');
    const guardada = [d('1', '2026-01-10'), d('2', '2026-02-10'), d('3', '2026-03-10')];
    const mudadas = [d('2', '2026-02-10', 'concluido'), d('3', '2027-01-05'), d('4', '2026-04-01'), d('5', '2025-12-31')];
    const r = juntarMudancas(guardada, mudadas, 2026);
    expect(r.map((x) => x.id).sort()).toEqual(['1', '2', '4']);
    expect(r.find((x) => x.id === '2')?.status).toBe('concluido');
  });

  test('guarda só os campos que o painel usa', async () => {
    const { resumoEstatistico } = await import('../../src/domain/estatisticas');
    const r = resumoEstatistico({ ...d('7', '2026-05-05'), saida: 'texto longo', observacao: 'x' } as never);
    expect(Object.keys(r)).not.toContain('saida');
    expect(Object.keys(r)).not.toContain('observacao');
    expect(r).toMatchObject({ id: '7', numero: 7, dataEntrada: '2026-05-05' });
  });
});
