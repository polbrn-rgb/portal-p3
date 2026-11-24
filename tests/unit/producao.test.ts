import { describe, expect, test } from 'vitest';
import {
  abasDaProducao,
  avisosProducao,
  diasDoMes,
  IDS_ITENS,
  idProducao,
  itensZerados,
  lerItens,
  lerQuantidade,
  nomePlanilha,
  pelotoesDa,
  pendencias,
  rotuloPelotao,
  temTurnoNoite,
  turnoDo,
  somarItens,
  textoQuantidade,
  totalDrogasKg,
  turnosPendentes,
  validarProducao,
  validarTalao,
  type ItemId,
  type Producao,
} from '../../src/domain/producao';
import { PRODUTIVIDADE } from '../../src/domain/rac';

const textos = (x: Partial<Record<ItemId, string>> = {}) => ({ ...(Object.fromEntries(IDS_ITENS.map((id) => [id, ''])) as Record<ItemId, string>), ...x });

function lanc(extra: Partial<Producao>): Producao {
  return {
    id: '',
    unidadeId: '1cia',
    data: '2026-11-02',
    mes: '2026-11',
    pelotao: 'pelA',
    itens: itensZerados(),
    taloes: [],
    lancadoPor: '1ª CIA',
    lancadoEm: null,
    atualizadoPor: '1ª CIA',
    atualizadoEm: null,
    ...extra,
  };
}

describe('pelotões e itens', () => {
  test('Cia: Pel A–D (12x36: A e C de dia, B e D de noite; Ronda Escolar e RPM no pelotão); FT: Pel A e B, os dois de dia', () => {
    expect(pelotoesDa('1cia').map((p) => p.id)).toEqual(['pelA', 'pelB', 'pelC', 'pelD']);
    expect(pelotoesDa('ft').map((p) => p.id)).toEqual(['pelA', 'pelB']);
    expect(rotuloPelotao('pelA', '1cia')).toBe('Pel A (dia)');
    expect(rotuloPelotao('pelB', '1cia')).toBe('Pel B (noite)');
    expect(rotuloPelotao('pelD', '1cia')).toBe('Pel D (noite)');
    expect(rotuloPelotao('pelB', 'ft')).toBe('Pel B (dia)');
    expect(turnoDo('pelB', 'ft')).toBe('dia');
    expect(temTurnoNoite('ft')).toBe(false);
    expect(temTurnoNoite('3cia')).toBe(true);
    expect(idProducao('3cia', '2026-11-20', 'pelB')).toBe('3cia_2026-11-20_pelB');
  });

  test('todo item do RAC (comparativo) tem o mesmo código no lançamento diário', () => {
    for (const p of PRODUTIVIDADE) expect(IDS_ITENS).toContain(p.id);
  });

  test('item que faltar no banco vem zerado', () => {
    expect(lerItens({ pessoasAbordadas: 12, ait: 'x' })).toMatchObject({ pessoasAbordadas: 12, ait: 0, armas: 0 });
  });
});

describe('preenchimento', () => {
  test('vazio é zero; inteiros nas quantidades; kg com vírgula ou ponto e até 3 casas', () => {
    expect(lerQuantidade('')).toBe(0);
    expect(lerQuantidade(' 15 ')).toBe(15);
    expect(lerQuantidade('1,5')).toBeNull();
    expect(lerQuantidade('-2')).toBeNull();
    expect(lerQuantidade('0,250', true)).toBe(0.25);
    expect(lerQuantidade('4.46', true)).toBe(4.46);
    expect(lerQuantidade('1,2345', true)).toBeNull();
    expect(lerQuantidade('100000')).toBeNull();
    expect(textoQuantidade(0)).toBe('');
    expect(textoQuantidade(0.1, true)).toBe('0,1');
  });

  test('validação: dia (não pode ser depois de hoje), pelotão da unidade e números', () => {
    const ok = validarProducao({ data: '2026-11-20', pelotao: 'pelA', textos: textos({ pessoasAbordadas: '30', maconhaKg: '0,1' }), taloes: [] }, '1cia', '2026-11-20');
    expect(ok.erros).toEqual({});
    expect(ok.itens).toMatchObject({ pessoasAbordadas: 30, maconhaKg: 0.1, armas: 0 });

    const ruim = validarProducao({ data: '2026-11-21', pelotao: 'pelC', textos: textos({ armas: 'dois' }), taloes: [] }, 'ft', '2026-11-20');
    expect(ruim.itens).toBeNull();
    expect(Object.keys(ruim.erros).sort()).toEqual(['armas', 'data', 'pelotao']);
  });

  test('flagrante: talão obrigatório e sem repetir, BOPC opcional, com o dia da ocorrência', () => {
    expect(validarTalao({ numero: '', bopc: '', data: '2026-11-20', natureza: 'roubo' }, [])).toBeTruthy();
    expect(validarTalao({ numero: '2026 1120 5108 01', bopc: '', data: '2026-11-20', natureza: 'roubo' }, [])).toBe('');
    expect(validarTalao({ numero: '123', bopc: 'AB1234/2026', data: '2026-11-20', natureza: 'roubo' }, [])).toBe('');
    expect(validarTalao({ numero: '123', bopc: 'BO #1', data: '2026-11-20', natureza: 'roubo' }, [])).toMatch(/BOPC/);
    expect(validarTalao({ numero: '20261120510801', bopc: '', data: '2026-11-20', natureza: 'roubo' }, [{ numero: '20261120510801', bopc: '', data: '2026-11-20', natureza: 'roubo' }])).toMatch(/já está/);
    expect(validarTalao({ numero: '123', bopc: '', data: '', natureza: 'roubo' }, [])).toMatch(/dia/);
    expect(validarTalao({ numero: '123', bopc: '', data: '2026-11-20', natureza: '' }, [])).toMatch(/natureza/);
  });

  test('conferências: presos sem ocorrência com prisão, mais ocorrências que presos, talões', () => {
    const i = itensZerados();
    expect(avisosProducao(i, [])).toEqual([]);
    expect(avisosProducao({ ...i, flagrante: 2, ocorrencias: 3 }, [])).toEqual([
      'Houve presos: informe quantas ocorrências tiveram prisão.',
      'Houve flagrante: anote o nº do talão e o nº do BOPC (a P/3 usa para colher os dados).',
    ]);
    expect(avisosProducao({ ...i, ocorrenciasComPrisao: 2, flagrante: 1, ocorrencias: 2 }, [{ numero: '1', bopc: '9', data: '2026-11-20', natureza: 'roubo' }])).toEqual([
      'Há mais ocorrências com prisão do que presos (flagrante + mandado).',
    ]);
    // Mandado sem flagrante: não pede talão/BOPC.
    expect(avisosProducao({ ...i, ocorrenciasComPrisao: 1, procurados: 1, ocorrencias: 1 }, [])).toEqual([]);
    expect(avisosProducao({ ...i, ocorrenciasComPrisao: 1, flagrante: 1, ocorrencias: 1 }, [])).toEqual([
      'Houve flagrante: anote o nº do talão e o nº do BOPC (a P/3 usa para colher os dados).',
    ]);
    expect(avisosProducao({ ...i, ocorrenciasComPrisao: 1, flagrante: 1, ocorrencias: 1 }, [{ numero: '1', bopc: '', data: '2026-11-20', natureza: 'roubo' }])).toEqual([
      'Há flagrante sem nº do BOPC: complete quando tiver.',
    ]);
  });
});

describe('somas, pendências e planilha', () => {
  test('soma sem erro de arredondamento no kg', () => {
    const s = somarItens([
      lanc({ itens: { ...itensZerados(), maconhaKg: 0.1, crackKg: 0.05, pessoasAbordadas: 5 } }),
      lanc({ itens: { ...itensZerados(), maconhaKg: 0.2, cocainaKg: 1.5, pessoasAbordadas: 7 } }),
    ]);
    expect(s.maconhaKg).toBe(0.3);
    expect(totalDrogasKg(s)).toBe(1.85);
    expect(s.pessoasAbordadas).toBe(12);
  });

  test('pendências: até ontem, um turno de dia e um de noite por dia', () => {
    expect(diasDoMes('2026-02')).toHaveLength(28);
    const lista = [
      lanc({ data: '2026-11-01', pelotao: 'pelA' }),
      lanc({ data: '2026-11-01', pelotao: 'pelB' }),
      lanc({ data: '2026-11-02', pelotao: 'pelC' }),
    ];
    const p = pendencias(lista, '2026-11', '2026-11-04', '2026-11-01', '1cia');
    expect(p).toEqual([
      { data: '2026-11-02', faltaDia: false, faltaNoite: true },
      { data: '2026-11-03', faltaDia: true, faltaNoite: true },
    ]);
    expect(turnosPendentes(p)).toBe(3);
    expect(pendencias([], '2026-12', '2026-11-20', '2026-11-01', '1cia')).toEqual([]);
  });

  test('turno escolhido no lançamento vale mais que a escala antiga (sem padrão de pelotão por turno)', () => {
    // Pel A trabalhou de noite e Pel D de dia: o dia 1 está completo; o Pel B (sem turno gravado) segue a escala antiga (noite).
    const lista = [
      lanc({ data: '2026-11-01', pelotao: 'pelA', turno: 'noite' }),
      lanc({ data: '2026-11-01', pelotao: 'pelD', turno: 'dia' }),
      lanc({ data: '2026-11-02', pelotao: 'pelC', turno: 'noite' }),
      lanc({ data: '2026-11-02', pelotao: 'pelB' }),
    ];
    const p = pendencias(lista, '2026-11', '2026-11-03', '2026-11-01', '1cia');
    expect(p).toEqual([{ data: '2026-11-02', faltaDia: true, faltaNoite: false }]);
    expect(rotuloPelotao('pelA', '1cia', 'noite')).toBe('Pel A (noite)');
    // A planilha mostra o turno escolhido; o pelotão (o que alimenta RAC e Documentos Mensais) não muda.
    const linhas = abasDaProducao(lista, ['1cia'])[0].linhas.slice(1).map((l) => [l[3], l[4]]);
    expect(linhas).toEqual([
      ['Pel A', 'noite'],
      ['Pel D', 'dia'],
      ['Pel B', 'noite'],
      ['Pel C', 'noite'],
    ]);
    expect(validarProducao({ data: '2026-11-02', pelotao: 'pelA', turno: '', textos: textos(), taloes: [] }, '1cia', '2026-11-02').erros.turno).toBeTruthy();
  });

  test('pendências só contam a partir do primeiro lançamento da unidade', () => {
    expect(pendencias([], '2026-11', '2026-11-20', null, '1cia')).toEqual([]);
    const p = pendencias([lanc({ data: '2026-11-18', pelotao: 'pelA' })], '2026-11', '2026-11-20', '2026-11-18', '1cia');
    expect(p.map((x) => x.data)).toEqual(['2026-11-18', '2026-11-19']);
    expect(turnosPendentes(p)).toBe(3);
  });

  test('Força Tática: um lançamento por dia (Pel A num dia, Pel B no outro), sem turno da noite', () => {
    const lista = [
      lanc({ unidadeId: 'ft', data: '2026-11-01', pelotao: 'pelA' }),
      lanc({ unidadeId: 'ft', data: '2026-11-02', pelotao: 'pelB' }),
      lanc({ unidadeId: 'ft', data: '2026-11-04', pelotao: 'pelB' }),
    ];
    const p = pendencias(lista, '2026-11', '2026-11-06', '2026-11-01', 'ft');
    expect(p).toEqual([
      { data: '2026-11-03', faltaDia: true, faltaNoite: false },
      { data: '2026-11-05', faltaDia: true, faltaNoite: false },
    ]);
    expect(turnosPendentes(p)).toBe(2);
    const turnos = abasDaProducao(lista, ['ft'])[0].linhas.slice(1).map((l) => [l[3], l[4]]);
    expect(turnos).toEqual([
      ['Pel A', 'dia'],
      ['Pel B', 'dia'],
      ['Pel B', 'dia'],
    ]);
  });

  test('planilha: lançamentos, por dia, totais do mês (com o Batalhão) e talões', () => {
    const lista = [
      lanc({ unidadeId: '2cia', data: '2026-11-03', pelotao: 'pelB', itens: { ...itensZerados(), armas: 1 }, taloes: [{ numero: '999', bopc: 'BO77', data: '2026-11-04', natureza: 'roubo' }] }),
      lanc({ unidadeId: '1cia', data: '2026-11-03', pelotao: 'pelA', itens: { ...itensZerados(), armas: 2, pessoasAbordadas: 40 } }),
      lanc({ unidadeId: '1cia', data: '2026-11-03', pelotao: 'pelB', itens: { ...itensZerados(), pessoasAbordadas: 10 } }),
    ];
    const abas = abasDaProducao(lista, ['1cia', '2cia']);
    expect(abas.map((a) => a.nome)).toEqual(['Lançamentos', 'Por dia', 'Totais do mês', 'Flagrantes']);
    const [lancs, porDia, totais, taloes] = abas.map((a) => a.linhas);
    expect(lancs).toHaveLength(4);
    expect(lancs[1].slice(0, 5)).toEqual(['03/11/2026', 'terça-feira', '1ª CIA', 'Pel A', 'dia']);
    expect(porDia[1].slice(0, 5)).toEqual(['03/11/2026', 'terça-feira', '1ª CIA', 2, 50]);
    expect(totais[0]).toEqual(['Item', '1ª CIA', '2ª CIA', '8º BPM/M']);
    expect(totais.find((l) => l[0] === 'Armas de fogo apreendidas')).toEqual(['Armas de fogo apreendidas', 2, 1, 3]);
    expect(taloes[1]).toEqual(['04/11/2026', '999', 'BO77', 'Roubo', '2ª CIA', 'Pel B', '03/11/2026']);
    expect(totais.map((l) => l[0])).toContain('Entorpecentes - total (kg)');
    expect(lancs[0][lancs[0].indexOf('Outras drogas (kg)') + 1]).toBe('Entorpecentes - total (kg)');
    expect(nomePlanilha('2026-11', '1cia')).toBe('Produtividade 1ª CIA 2026-11.xlsx');
  });
});

describe('P/3 → Resultados das Cias', () => {
  test('período: datas, ordem, futuro e no máximo 31 dias', async () => {
    const { erroPeriodo } = await import('../../src/domain/producao');
    const hoje = '2026-11-22';
    expect(erroPeriodo('2026-11-22', '2026-11-22', hoje)).toBe('');
    expect(erroPeriodo('2026-10-23', '2026-11-22', hoje)).toBe('');
    expect(erroPeriodo('2026-10-22', '2026-11-22', hoje)).toBe('Escolha no máximo 31 dias.');
    expect(erroPeriodo('2026-11-21', '2026-11-20', hoje)).toBe('A data inicial é depois da final.');
    expect(erroPeriodo('2026-11-23', '2026-11-23', hoje)).toBe('A data inicial ainda não chegou.');
    expect(erroPeriodo('', '2026-11-20', hoje)).toBe('Informe as duas datas.');
  });

  test('só os itens com valor e a ordem dos lançamentos', async () => {
    const { itensComValor, itensZerados, ordenarLancamentos } = await import('../../src/domain/producao');
    const a = { ...itensZerados(), pessoasAbordadas: 3 };
    const b = { ...itensZerados(), maconhaKg: 0.5 };
    expect(itensComValor([a, b])).toEqual(['pessoasAbordadas', 'maconhaKg']);
    expect(itensComValor([itensZerados()])).toEqual([]);
    const l = ordenarLancamentos([
      { data: '2026-11-20', pelotao: 'pelD' as const },
      { data: '2026-11-21', pelotao: 'pelB' as const },
      { data: '2026-11-20', pelotao: 'pelA' as const },
    ]);
    expect(l.map((x) => `${x.data} ${x.pelotao}`)).toEqual(['2026-11-21 pelB', '2026-11-20 pelA', '2026-11-20 pelD']);
  });
});
