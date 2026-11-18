import { describe, expect, test } from 'vitest';
import {
  comCampo,
  conferirRac,
  corVariacao,
  CORES_VAR,
  DELITOS,
  historicoDoRac,
  lerNumero,
  mesesDoRac,
  mesReferenciaPadrao,
  normalizarRac,
  podeEnviar,
  preencherDoHistorico,
  producaoAtual,
  PRODUTIVIDADE,
  prodDigitadaAParte,
  racVazio,
  rotuloCurto,
  rotuloMesLongo,
  situacaoRac,
  somarBatalhao,
  tabelasDoRac,
  textoVariacao,
  validarAberturaRac,
  valorDoCampo,
  variacao,
  type RacDados,
  type RacSalvo,
  type UnidadeRac,
  type Valor,
} from '../../src/domain/rac';

// Dados reais do RAC de setembro/2026 (RAC GERAL). Ordem dos crimes = DELITOS; da produção = PRODUTIVIDADE.
type Crimes = { ano: number[]; atual: number[]; jul: number[]; ago: number[]; inc: number[] };
const CRIMES: Record<string, Crimes> = {
  '1cia': { ano: [0, 6, 106, 102, 376, 0, 2, 0, 0], atual: [0, 1, 62, 84, 292, 0, 0, 0, 0], jul: [0, 7, 93, 79, 352, 0, 1, 0, 0], ago: [1, 3, 85, 77, 288, 0, 1, 0, 0], inc: [0, 0, 1, 2, 6, 0, 0, 0, 0] },
  '2cia': { ano: [0, 7, 29, 14, 72, 0, 1, 0, 0], atual: [0, 2, 33, 14, 66, 0, 0, 0, 0], jul: [0, 2, 50, 9, 62, 4, 1, 0, 0], ago: [0, 0, 40, 13, 50, 0, 0, 0, 0], inc: [0, 0, 11, 2, 25, 0, 0, 0, 0] },
  '3cia': { ano: [0, 9, 74, 78, 177, 0, 7, 0, 0], atual: [0, 3, 47, 45, 148, 0, 1, 0, 0], jul: [0, 5, 83, 52, 119, 1, 0, 0, 0], ago: [1, 10, 56, 65, 123, 0, 1, 0, 0], inc: [0, 0, 3, 0, 2, 0, 0, 0, 0] },
  '4cia': { ano: [0, 0, 14, 33, 140, 1, 3, 0, 0], atual: [0, 0, 8, 25, 113, 1, 1, 0, 0], jul: [0, 0, 7, 40, 119, 0, 2, 0, 0], ago: [1, 1, 7, 29, 110, 0, 0, 0, 0], inc: [0, 0, 3, 9, 34, 0, 0, 0, 0] },
  '5cia': { ano: [0, 1, 20, 44, 220, 2, 1, 0, 0], atual: [0, 1, 22, 24, 185, 0, 1, 0, 0], jul: [0, 2, 20, 15, 185, 0, 0, 0, 0], ago: [0, 2, 33, 26, 182, 0, 2, 0, 0], inc: [0, 0, 4, 7, 3, 0, 0, 0, 0] },
  '6cia': { ano: [0, 6, 72, 76, 238, 2, 2, 0, 0], atual: [0, 3, 46, 54, 195, 0, 1, 0, 0], jul: [0, 7, 82, 72, 222, 0, 3, 0, 0], ago: [0, 9, 76, 82, 171, 0, 3, 0, 0], inc: [0, 0, 0, 4, 23, 0, 0, 0, 0] },
};
const PROD_AGO: Record<string, number[]> = {
  '1cia': [15, 4, 1, 3310, 8, 1176, 837, 12, 28, 209, 239, 0, 101, 609],
  '2cia': [6, 0, 0, 3697, 2, 1843, 891, 7, 1, 12, 209, 0, 91, 589],
  '3cia': [9, 0, 0, 2362, 6, 662, 620, 5, 19, 143, 163, 0, 91, 895],
  '4cia': [4, 0, 0, 1930, 5, 1054, 562, 7, 1, 13, 91, 0, 44, 642],
  '5cia': [10, 0, 0, 2120, 6, 806, 306, 10, 26, 12, 105, 0, 74, 614],
  '6cia': [17, 0, 0, 2912, 5, 997, 471, 5, 29, 244, 105, 0, 134, 1365],
  ft: [8, 0, 2, 240, 3, 68, 18, 0, 0, 0, 0, 0, 15, 15],
};
// 1ª Cia, tabela por pelotão (Pel A, B, C, D, RE, RPM) na ordem das linhas da Cia.
const PELOTAO_1CIA: Record<string, number[]> = {
  flagrante: [1, 1, 4, 4, 0, 5],
  procurados: [0, 4, 2, 1, 0, 2],
  armas: [0, 0, 0, 0, 0, 1],
  motosApreendidas: [2, 0, 1, 3, 0, 58],
  veiculosApreendidos: [1, 0, 1, 4, 0, 1],
  ai: [21, 23, 17, 27, 0, 165],
  ait: [39, 24, 15, 17, 0, 37],
  pessoasAbordadas: [647, 929, 347, 630, 0, 633],
  motosVistoriadas: [268, 106, 30, 28, 0, 499],
  veiculosVistoriados: [146, 417, 70, 321, 0, 33],
};
const COLS_CIA = ['pelA', 'pelB', 'pelC', 'pelD', 're', 'rpm'];
// FT: as 14 linhas da produtividade, Pel A e Pel B.
const PELOTAO_FT = [[3, 4], [3, 2], [0, 0], [250, 217], [3, 2], [63, 48], [20, 17], [0, 0], [0, 0], [0, 1], [0, 0], [0, 0], [7, 9], [7, 9]];

function rac(u: UnidadeRac, opc: { pelotao?: Record<string, number[]>; prodAno?: number[]; extras?: Partial<Record<string, number>> } = {}): RacDados {
  const d = racVazio(u, '2026-09');
  const c = CRIMES[u];
  if (c)
    DELITOS.forEach((x, i) => {
      d.crimes[x.id] = { anoAnterior: c.ano[i], atual: c.atual[i], mesRetrasado: c.jul[i], mesAnterior: c.ago[i], inconsistencias: c.inc[i] };
    });
  PRODUTIVIDADE.forEach((p, i) => {
    d.producao[p.id].mesAnterior = PROD_AGO[u]?.[i] ?? 0;
    d.producao[p.id].anoAnterior = opc.prodAno?.[i] ?? 1;
  });
  if (u === 'ft') PRODUTIVIDADE.forEach((p, i) => (d.pelotoes[p.id] = { pelA: PELOTAO_FT[i][0], pelB: PELOTAO_FT[i][1] }));
  else for (const [l, vs] of Object.entries(opc.pelotao ?? {})) d.pelotoes[l] = Object.fromEntries(COLS_CIA.map((k, i) => [k, vs[i]]));
  for (const [k, v] of Object.entries(opc.extras ?? {})) d.producao[k as keyof RacDados['producao']].atual = v ?? null;
  return d;
}
const cia1 = () => rac('1cia', { pelotao: PELOTAO_1CIA, extras: { atosInfracionais: 1, documentos: 0, bopm: 115, ocorrencias: 514 } });
const linhas = (d: RacDados, id: string) => tabelasDoRac(d).find((t) => t.id === id)!.linhas;

describe('meses e variação', () => {
  test('mês de referência informado pela P/3 define as colunas', () => {
    expect(mesesDoRac('2026-01')).toEqual({ atual: '2026-01', mesAnterior: '2025-12', mesRetrasado: '2025-11', anoAnterior: '2025-01' });
    expect(rotuloCurto('2026-09')).toBe('set/26');
  });
  test('Var % igual à planilha e "—" quando a base é zero', () => {
    expect(textoVariacao(variacao(102, 82))).toBe('-20%');
    expect(textoVariacao(variacao(6, 1))).toBe('-83%');
    expect(textoVariacao(variacao(8, 9))).toBe('13%');
    expect(textoVariacao(variacao(0, 0))).toBe('0%');
    expect(textoVariacao(variacao(0, 5))).toBe('—');
    expect(textoVariacao(variacao(null, 5))).toBe('—');
  });
  test('cores como nos slides atuais', () => {
    expect(corVariacao(-0.83, 'crime')).toBe(CORES_VAR.verdeCrime);
    expect(corVariacao(0.1, 'crime')).toBe(CORES_VAR.vermelho);
    expect(corVariacao(0.13, 'producao')).toBe(CORES_VAR.verdeProd);
    expect(corVariacao(-0.75, 'producao')).toBe(CORES_VAR.vermelho);
    expect(corVariacao(0, 'producao')).toBe(CORES_VAR.azul);
    expect(corVariacao(null, 'crime')).toBeNull();
  });
});

describe('tabelas calculadas (1ª Cia, setembro/2026)', () => {
  test('anual com inconsistências: Real = mês − inconsistências e Var % sobre o Real', () => {
    const l = linhas(cia1(), 'inconsistencias');
    expect(l[2]).toEqual({ rotulo: 'FURTO VEÍCULO', valores: [106, 62, 1, 61], variacao: (61 - 106) / 106 });
    expect(l.map((x) => textoVariacao(x.variacao ?? null))).toEqual(['0%', '-83%', '-42%', '-20%', '-24%', '0%', '-100%', '0%', '0%']);
  });
  test('trimestral e cabeçalhos', () => {
    const t = tabelasDoRac(cia1());
    expect(t.map((x) => x.id)).toEqual(['anual', 'inconsistencias', 'trimestral', 'pelotao', 'prodMensal', 'prodAnual']);
    expect(t.find((x) => x.id === 'trimestral')!.cabecalho).toEqual(['DELITO', 'jul/26', 'ago/26', 'set/26']);
    expect(linhas(cia1(), 'trimestral')[2].valores).toEqual([93, 85, 62]);
  });
  test('TOTAL por pelotão alimenta o comparativo de produtividade', () => {
    expect(linhas(cia1(), 'pelotao')[7].valores).toEqual([647, 929, 347, 630, 0, 633, 3186]);
    const atual = producaoAtual(cia1());
    // Exatamente a coluna set/26 que a 1ª Cia mandou no comparativo mensal.
    expect(PRODUTIVIDADE.map((p) => atual[p.id])).toEqual([15, 1, 1, 3186, 9, 987, 931, 7, 64, 132, 253, 0, 115, 514]);
    expect(prodDigitadaAParte('1cia')).toEqual(['atosInfracionais', 'documentos', 'bopm', 'ocorrencias']);
  });
  test('5ª Cia: o portal calcula o Real que veio errado no RAC de setembro', () => {
    const reais = linhas(rac('5cia'), 'inconsistencias').map((x) => x.valores[3]);
    expect(reais).toEqual([0, 1, 18, 17, 182, 0, 1, 0, 0]); // no RAC: 0, 0, 19, 23, 170, 1, 1, 0, 0
  });
  test('Força Tática: sem crimes, Pel A e Pel B nas 14 linhas', () => {
    const ft = rac('ft', { prodAno: [9, 0, 1, 961, 26, 176, 107, 1, 1, 0, 2, 0, 35, 35] });
    const t = tabelasDoRac(ft);
    expect(t.map((x) => x.id)).toEqual(['pelotao', 'prodMensal', 'prodAnual']);
    expect(t[0].cabecalho).toEqual(['8º BPMM – Cia FT', 'Pel A', 'Pel B', 'TOTAL']);
    expect(PRODUTIVIDADE.map((p) => producaoAtual(ft)[p.id])).toEqual([7, 5, 0, 467, 5, 111, 37, 0, 0, 1, 0, 0, 16, 16]);
    expect(textoVariacao(t[1].linhas[1].variacao ?? null)).toBe('—'); // Atos infracionais 0 -> 5 (a planilha mostrava 0%)
    expect(prodDigitadaAParte('ft')).toEqual([]);
  });
});

describe('conferência', () => {
  const ids = (d: RacDados, h = {}) => conferirRac(d, h).map((a) => `${a.nivel}:${a.id}`);

  test('campos vazios viram erro com o caminho do campo', () => {
    const a = conferirRac(racVazio('2cia', '2026-09'));
    expect(a.every((x) => x.nivel === 'erro')).toBe(true);
    expect(a[0]).toMatchObject({ campo: 'crimes.homicidio.anoAnterior', mensagem: 'Preencha HOMICÍDIO — set/25.' });
    expect(a.some((x) => x.campo === 'pelotoes.ai.rpm')).toBe(true);
    expect(a.some((x) => x.campo === 'producao.bopm.atual')).toBe(true);
    expect(a.some((x) => x.campo === 'producao.flagrante.atual')).toBe(false); // vem do pelotão
  });
  test('número negativo ou quebrado é erro', () => {
    const d = cia1();
    d.pelotoes.ai.pelA = -1;
    d.producao.bopm.atual = 2.5;
    expect(ids(d)).toEqual(expect.arrayContaining(['erro:pelotoes.ai.pelA', 'erro:producao.bopm.atual']));
  });
  test('inconsistências maiores que o total do mês', () => {
    const d = cia1();
    d.crimes.rouboVeiculo.inconsistencias = 2; // total do mês = 1
    const a = conferirRac(d).find((x) => x.id === 'crimes.rouboVeiculo.inconsistencias')!;
    expect(a.nivel).toBe('erro');
    expect(a.mensagem).toContain('não podem passar do total do mês (1)');
  });
  test('1ª Cia: set/25 da produtividade igual a ago/26 — aviso de cópia', () => {
    const d = rac('1cia', { pelotao: PELOTAO_1CIA, extras: { atosInfracionais: 1, documentos: 0, bopm: 115, ocorrencias: 514 }, prodAno: PROD_AGO['1cia'] });
    expect(ids(d)).toEqual(['aviso:copiaProducao']);
    expect(podeEnviar(d, conferirRac(d))).toBe(false);
    d.justificativas.copiaProducao = '   ';
    expect(podeEnviar(d, conferirRac(d))).toBe(false);
    d.justificativas.copiaProducao = 'Conferido no QMO: os números são esses.';
    expect(podeEnviar(d, conferirRac(d))).toBe(true);
  });
  test('tudo certo: envia sem justificativa; com erro nunca envia', () => {
    const d = cia1();
    expect(conferirRac(d)).toEqual([]);
    expect(podeEnviar(d, [])).toBe(true);
    d.crimes.estupro.atual = null;
    expect(podeEnviar(d, conferirRac(d))).toBe(false);
  });
});

describe('histórico', () => {
  function agosto(): RacDados {
    const a = racVazio('1cia', '2026-08');
    DELITOS.forEach((x, i) => {
      a.crimes[x.id].atual = CRIMES['1cia'].ago[i];
      a.crimes[x.id].mesAnterior = CRIMES['1cia'].jul[i];
    });
    PRODUTIVIDADE.forEach((p, i) => (a.producao[p.id].atual = PROD_AGO['1cia'][i])); // só os itens à parte contam
    for (const l of Object.keys(PELOTAO_1CIA)) a.pelotoes[l] = { pelA: 0, pelB: 0, pelC: 0, pelD: 0, re: 0, rpm: 0 };
    const i = (id: string) => PRODUTIVIDADE.findIndex((p) => p.id === id);
    for (const l of Object.keys(PELOTAO_1CIA)) a.pelotoes[l].pelA = PROD_AGO['1cia'][i(l)];
    return a;
  }

  test('o mês anterior e o trimestral vêm preenchidos do RAC de agosto', () => {
    const novo = preencherDoHistorico(racVazio('1cia', '2026-09'), { mesAnterior: agosto() });
    expect(DELITOS.map((x) => novo.crimes[x.id].mesAnterior)).toEqual(CRIMES['1cia'].ago);
    expect(DELITOS.map((x) => novo.crimes[x.id].mesRetrasado)).toEqual(CRIMES['1cia'].jul);
    expect(PRODUTIVIDADE.map((p) => novo.producao[p.id].mesAnterior)).toEqual(PROD_AGO['1cia']);
    expect(novo.crimes.homicidio.anoAnterior).toBeNull(); // sem RAC de set/25 no sistema
  });
  test('não apaga o que já foi digitado', () => {
    const d = racVazio('1cia', '2026-09');
    d.crimes.furtoVeiculo.mesAnterior = 99;
    expect(preencherDoHistorico(d, { mesAnterior: agosto() }).crimes.furtoVeiculo.mesAnterior).toBe(99);
  });
  test('número diferente do RAC já enviado: aviso que pede justificativa', () => {
    const d = cia1();
    d.crimes.furtoVeiculo.mesAnterior = 84; // agosto foi 85
    d.producao.ait.mesAnterior = 200; // agosto foi 209
    const a = conferirRac(d, { mesAnterior: agosto() });
    expect(a.map((x) => x.id)).toEqual(['historicoCrimes', 'historicoProducao']);
    expect(a[0]).toMatchObject({ nivel: 'aviso', campo: 'crimes.furtoVeiculo.mesAnterior' });
    expect(a[0].mensagem).toContain('FURTO VEÍCULO ago/26: 84 (no RAC enviado: 85)');
    expect(a[1].mensagem).toContain('AIT ago/26: 200 (no RAC enviado: 209)');
  });
});

describe('Batalhão = soma das Cias (+ FT na produtividade)', () => {
  const todas = () => [
    ...(['1cia', '2cia', '3cia', '4cia', '5cia', '6cia'] as const).map((u) => rac(u)),
    rac('ft'),
  ];
  const col = (d: RacDados, k: 'anoAnterior' | 'atual' | 'mesRetrasado' | 'mesAnterior'): Valor[] => DELITOS.map((x) => d.crimes[x.id][k]);

  test('crimes batem com o RAC do Batalhão de setembro', () => {
    const btl = somarBatalhao(todas(), '2026-09');
    expect(col(btl, 'anoAnterior')).toEqual([0, 29, 315, 347, 1223, 5, 16, 0, 0]);
    expect(col(btl, 'atual')).toEqual([0, 10, 218, 246, 999, 1, 4, 0, 0]);
    expect(col(btl, 'mesRetrasado')).toEqual([0, 23, 335, 267, 1059, 5, 7, 0, 0]);
    expect(col(btl, 'mesAnterior')).toEqual([3, 25, 297, 292, 924, 0, 7, 0, 0]);
  });
  test('produtividade de ago/26 bate com o RAC do Batalhão', () => {
    const btl = somarBatalhao(todas(), '2026-09');
    expect(PRODUTIVIDADE.map((p) => btl.producao[p.id].mesAnterior)).toEqual([69, 4, 3, 16571, 35, 6606, 3705, 46, 104, 633, 912, 0, 550, 4729]);
    expect(tabelasDoRac(btl).map((t) => t.id)).toEqual(['anual', 'inconsistencias', 'trimestral', 'prodMensal', 'prodAnual']);
  });
  test('falta de uma Cia ou de um número deixa o total vazio (não soma pela metade)', () => {
    const l = todas();
    l[2].crimes.furtoVeiculo.atual = null;
    expect(somarBatalhao(l, '2026-09').crimes.furtoVeiculo.atual).toBeNull();
    expect(somarBatalhao(l, '2026-09').crimes.rouboOutros.atual).toBe(246);
    const semFt = todas().filter((r) => r.unidade !== 'ft');
    expect(somarBatalhao(semFt, '2026-09').producao.flagrante.mesAnterior).toBeNull();
    expect(somarBatalhao(semFt, '2026-09').crimes.rouboOutros.atual).toBe(246); // FT não entra nos crimes
    expect(somarBatalhao(todas(), '2026-10').crimes.rouboOutros.atual).toBeNull(); // nenhum RAC de outubro
  });
});

describe('abertura pela P/3 e envio das Cias (Fase 2)', () => {
  test('mês de referência: sugestão, título e validação', () => {
    expect(mesReferenciaPadrao('2026-10-05')).toBe('2026-09');
    expect(mesReferenciaPadrao('2027-01-10')).toBe('2026-12');
    expect(rotuloMesLongo('2026-09')).toBe('SETEMBRO/2026');
    expect(validarAberturaRac('2026-09', '2026-10-10', [])).toEqual({});
    expect(validarAberturaRac('', '', [])).toEqual({ mes: 'Informe o mês de referência.', prazo: 'Informe o prazo das Cias.' });
    expect(validarAberturaRac('2026-13', '2026-10-10', []).mes).toBe('Informe o mês de referência.');
    expect(validarAberturaRac('2026-09', '2026-10-10', ['2026-09']).mes).toBe('O RAC de SETEMBRO/2026 já existe.');
  });
  test('situação: enviado, rascunho, pendente e atrasado pelo prazo da P/3', () => {
    expect(situacaoRac({ status: 'enviado' }, '2026-10-10', '2026-10-20')).toBe('enviado');
    expect(situacaoRac({ status: 'rascunho' }, '2026-10-10', '2026-10-10')).toBe('rascunho');
    expect(situacaoRac(undefined, '2026-10-10', '2026-10-09')).toBe('pendente');
    expect(situacaoRac({ status: 'rascunho' }, '2026-10-10', '2026-10-11')).toBe('atrasado');
  });
  test('histórico: só RAC enviados do mês anterior e do mesmo mês do ano anterior', () => {
    const r = (mes: string, status: 'enviado' | 'rascunho'): RacSalvo => ({ ...racVazio('1cia', mes), id: `${mes}_1cia`, status, preenchidoPor: '' });
    const lista = [r('2026-08', 'enviado'), r('2025-09', 'rascunho'), r('2026-07', 'enviado')];
    const h = historicoDoRac(lista, '2026-09');
    expect(h.mesAnterior?.mes).toBe('2026-08');
    expect(h.anoAnterior).toBeUndefined();
  });
  test('digitação: só dígitos; vazio continua vazio', () => {
    expect(lerNumero('1.270')).toBe(1270);
    expect(lerNumero(' 42 ')).toBe(42);
    expect(lerNumero('')).toBeNull();
    expect(lerNumero('abc')).toBeNull();
    expect(lerNumero('-5')).toBe(5);
  });
  test('campo pelo caminho e documento do banco completado', () => {
    const d = comCampo(racVazio('ft', '2026-09'), 'pelotoes.flagrante.pelB', 4);
    expect(valorDoCampo(d, 'pelotoes.flagrante.pelB')).toBe(4);
    expect(valorDoCampo(comCampo(d, 'pelotoes.nada.pelB', 1), 'pelotoes.nada.pelB')).toBeNull(); // caminho que não existe: ignora
    const n = normalizarRac('1cia', '2026-09', {
      crimes: { furtoVeiculo: { atual: 62, inconsistencias: 'x' } },
      pelotoes: { ai: { rpm: 165, sobra: 1 } },
      justificativas: { copiaProducao: 'ok', ruim: 3 },
    });
    expect(n.crimes.furtoVeiculo).toEqual({ anoAnterior: null, mesRetrasado: null, mesAnterior: null, atual: 62, inconsistencias: null });
    expect(n.pelotoes.ai).toEqual({ pelA: null, pelB: null, pelC: null, pelD: null, re: null, rpm: 165 });
    expect(n.justificativas).toEqual({ copiaProducao: 'ok' });
    expect(n.producao.bopm).toEqual({ anoAnterior: null, mesAnterior: null, atual: null });
  });
});
