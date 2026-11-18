import { describe, expect, test } from 'vitest';
import { racVazio } from '../../src/domain/rac';
import {
  anosDasLinhas,
  binarizar,
  caixaCelula,
  celulasDoMes,
  ciaDoTexto,
  conferirPrints,
  delitoDoTexto,
  motivoDoErroDoPrint,
  ampliacao,
  caixaNoPainel,
  ehPainelPadrao,
  FILTRO_COMPANHIA,
  gradeDosMeses,
  gradePadrao,
  palavrasDoTsv,
  precisaMaisTentativas,
  preencherDoPrint,
  SLOTS_PRINT,
  slotsDaUnidade,
  votar,
  type LeituraPainel,
  type PrintSalvo,
} from '../../src/domain/racPrints';

// Leitura dos prints do painel. Posições e tentativas calibradas nos 24 prints reais de set/2026
// (6 Cias × 4 indicadores): 95 de 96 números lidos certo, nenhum lido errado sem o "confira".

describe('geometria do painel', () => {
  test('só lê o painel no formato padrão', () => {
    expect(ehPainelPadrao(1861, 774)).toBe(true);
    expect(ehPainelPadrao(1864, 776)).toBe(true);
    expect(ehPainelPadrao(1175, 664)).toBe(false); // mapa
    expect(ehPainelPadrao(0, 0)).toBe(false);
  });
  test('recorte padrão: a célula fica na metade esquerda da coluna do mês, entre as linhas da grade', () => {
    const g = gradePadrao(1864, 774)!;
    expect(g.b).toBeCloseTo(149.94, 1);
    const c = caixaCelula(g, 9, 1); // setembro, linha de 2025
    const inicio = 0.0408 + 8 * 2 * 0.04022;
    expect(c.x).toBeGreaterThan(1864 * inicio);
    expect(c.x + c.largura).toBeLessThan(1864 * (inicio + 0.04022));
    expect(c.y).toBeGreaterThan(774 * 0.917);
    expect(c.y + c.altura).toBeLessThan(774 * 0.945);
    expect(gradePadrao(1920, 1080)).toBeNull(); // tela cheia: precisa achar os meses
  });
  test('tela cheia com zoom: a tabela é achada pelos nomes dos meses (posições lidas num print real)', () => {
    const p = (texto: string, cx: number, cy = 827) => ({ texto, x: cx - 30, y: cy - 8, largura: 60, altura: 16 });
    const g = gradeDosMeses([p('janeiro', 168), p('Março', 452), p('abril', 594), p('maio', 736), p('junho', 878), p('julho', 1020), p('outubro', 1446), p('novembro', 1589), p('dezembro', 1730), p('PROJEÇÃO', 1300, 900)])!;
    expect(g.b).toBeCloseTo(142.0, 0); // 0,95 × 149,6
    expect(g.a).toBeCloseTo(168, 0);
    expect(g.yCabecalho).toBe(827);
    expect(ampliacao(4, g)).toBeCloseTo(4.21, 1);
    expect(gradeDosMeses([p('janeiro', 168), p('janeiro', 170)])).toBeNull(); // 1 mês só não dá a escala
    // As caixas de filtro saem do painel achado pela grade.
    const f = caixaNoPainel(gradePadrao(1864, 774)!, FILTRO_COMPANHIA);
    expect(Math.abs(f.x - 0.267 * 1864)).toBeLessThan(2);
    expect(Math.abs(f.y - 0.254 * 774)).toBeLessThan(2);
  });
  test('palavras do TSV do leitor', () => {
    const tsv = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t1\t1\t1\t1\t140\t820\t56\t14\t91\tjaneiro\n4\t1\t1\t1\t1\t0\t0\t0\t9\t9\t-1\t';
    expect(palavrasDoTsv(tsv)).toEqual([{ texto: 'janeiro', x: 140, y: 820, largura: 56, altura: 14 }]);
  });
  test('preto e branco: número colorido no fundo escuro e texto branco na caixa cinza', () => {
    const px = new Uint8ClampedArray([40, 200, 40, 255, 30, 30, 30, 255, 230, 230, 230, 255, 160, 160, 160, 255]);
    const a = new Uint8ClampedArray(px);
    binarizar(a, 'max', 110);
    expect([a[0], a[4], a[8], a[12]]).toEqual([0, 255, 0, 0]);
    const b = new Uint8ClampedArray(px);
    binarizar(b, 'min', 200);
    expect([b[0], b[4], b[8], b[12]]).toEqual([255, 255, 0, 255]);
  });
});

describe('interpretação do que foi lido', () => {
  test('votação: duas iguais bastam; senão maioria de 3 em 5; pouco acordo = confira', () => {
    expect(precisaMaisTentativas([62, 62])).toBe(false);
    expect(precisaMaisTentativas([62, 82])).toBe(true);
    expect(precisaMaisTentativas([null, null])).toBe(true);
    expect(votar([62, 62])).toEqual({ valor: 62, confira: false });
    expect(votar([9, null, 9, 9, 8])).toEqual({ valor: 9, confira: false });
    expect(votar([9, 8, null, null, 9])).toEqual({ valor: 9, confira: true });
    expect(votar([null, null, null, null, null])).toBeNull();
  });
  test('anos das linhas: completa o que não leu', () => {
    expect(anosDasLinhas(['224', '2025', '2026'], 2026)).toEqual([2024, 2025, 2026]);
    expect(anosDasLinhas(['2025', '', ''], 2026)).toEqual([2025, 2026, 2027]); // RAC de dez/26 feito em jan/27
    expect(anosDasLinhas(['', '', ''], 2026)).toEqual([2024, 2025, 2026]);
  });
  test('células do mês de referência, inclusive na virada do ano', () => {
    expect(celulasDoMes('2026-09')).toEqual({ anoAnterior: [2025, 9], mesRetrasado: [2026, 7], mesAnterior: [2026, 8], atual: [2026, 9] });
    expect(celulasDoMes('2026-01')).toEqual({ anoAnterior: [2025, 1], mesRetrasado: [2025, 11], mesAnterior: [2025, 12], atual: [2026, 1] });
  });
  test('filtros do painel (como o leitor devolveu nos prints reais)', () => {
    expect(['13Cia', '22Cia', '32Cia', '423Cia', '53Cia', '62Cia'].map(ciaDoTexto)).toEqual(['1cia', '2cia', '3cia', '4cia', '5cia', '6cia']);
    expect(ciaDoTexto('a x')).toBeNull();
    expect(delitoDoTexto('ROUBO DE VEICULO')).toBe('rouboVeiculo');
    expect(delitoDoTexto('| FURTO DE VEÍCULO')).toBe('furtoVeiculo');
    expect(delitoDoTexto('ROUBO - OUTROS')).toBe('rouboOutros');
    expect(delitoDoTexto('FURTO-OUTROS')).toBe('furtosOutros');
    expect(delitoDoTexto('CililiEsBaLd')).toBeNull();
  });
});

describe('uso no RAC', () => {
  const leitura = (x: Partial<LeituraPainel>): LeituraPainel => ({ companhia: '1cia', delito: 'furtoVeiculo', valores: {}, ...x });
  const todos = (l: Partial<Record<string, LeituraPainel>> = {}): PrintSalvo[] => SLOTS_PRINT.map((s) => ({ slot: s.id, leitura: l[s.id] ?? null }));

  test('o print preenche só os campos vazios do crime', () => {
    const d = racVazio('1cia', '2026-09');
    d.crimes.furtoVeiculo.atual = 61;
    const l = leitura({ valores: { anoAnterior: { valor: 106, confira: false }, atual: { valor: 62, confira: false }, mesAnterior: { valor: 85, confira: true } } });
    const n = preencherDoPrint(d, 'furtoVeiculo', l);
    expect(n.crimes.furtoVeiculo).toMatchObject({ anoAnterior: 106, atual: 61, mesAnterior: 85, mesRetrasado: null });
    expect(d.crimes.furtoVeiculo.anoAnterior).toBeNull(); // não altera o original
  });
  test('Cia precisa dos 7 prints; a FT não tem prints', () => {
    const faltando = conferirPrints(racVazio('2cia', '2026-09'), []);
    expect(faltando.map((a) => `${a.nivel}:${a.campo}`)).toEqual(SLOTS_PRINT.map((s) => `erro:prints.${s.id}`));
    expect(faltando[0].mensagem).toBe('Envie o print: Roubo de veículo — Indicadores Criminais.');
    expect(slotsDaUnidade('ft')).toEqual([]);
    expect(conferirPrints(racVazio('ft', '2026-09'), [])).toEqual([]);
    expect(conferirPrints(racVazio('1cia', '2026-09'), todos())).toEqual([]);
  });
  test('print de outra Cia, de outro indicador e número diferente do digitado: avisos', () => {
    const d = racVazio('1cia', '2026-09');
    d.crimes.furtoVeiculo.atual = 62;
    d.crimes.furtoVeiculo.anoAnterior = 106;
    const a = conferirPrints(
      d,
      todos({
        fvPainel: leitura({ valores: { atual: { valor: 63, confira: false }, anoAnterior: { valor: 106, confira: false } } }),
        rvPainel: leitura({ companhia: '2cia', delito: 'rouboVeiculo' }),
        roPainel: leitura({ delito: 'furtosOutros' }),
      }),
    );
    expect(a.map((x) => `${x.nivel}:${x.id}`)).toEqual(['aviso:printOutraCia', 'aviso:printOutroIndicador', 'aviso:printDivergente']);
    expect(a[0].mensagem).toContain('Roubo de veículo — Indicadores Criminais (lido: 2ª Cia)');
    expect(a[1].mensagem).toContain('Roubo outros — Indicadores Criminais (lido: FURTOS OUTROS)');
    expect(a[2]).toMatchObject({ campo: 'crimes.furtoVeiculo.atual' });
    expect(a[2].mensagem).toBe('Número diferente do print — FURTO VEÍCULO set/26: digitado 62, no print 63.');
  });
});

describe('erro ao enviar o print', () => {
  test('a mensagem diz o motivo', () => {
    expect(motivoDoErroDoPrint('preparar', new Error('x'))).toContain('não abriu como imagem');
    expect(motivoDoErroDoPrint('enviar', { code: 'permission-denied' })).toContain('regras do portal ainda não foram publicadas');
    expect(motivoDoErroDoPrint('enviar', { code: 'unavailable' })).toContain('Sem conexão');
    expect(motivoDoErroDoPrint('enviar', { code: 'resource-exhausted' })).toContain('(resource-exhausted)');
    expect(motivoDoErroDoPrint('enviar', null)).toContain('(erro desconhecido)');
  });
});
