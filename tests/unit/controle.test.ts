import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, test } from 'vitest';
import {
  controleVazio,
  cruzaMes,
  filtrarControle,
  idControleOperacao,
  mesAnterior,
  periodoControle,
  rotuloMes,
  validarControle,
  validarPedidoRelatorio,
  type OperacaoControle,
} from '../../src/domain/controle';

// Lógica do relatório no Logica.gs do Apps Script, carregada exatamente como ele é.
type Logica = {
  idControleOperacao: (nome: string, inicio: string) => string;
  linhasControleDaPlanilha: (cab: unknown[], linhas: unknown[][]) => Record<string, string>[];
  textoOperacaoRelatorio: (nome: string, inicio: string, termino: string, objetivo: string) => string;
  operacoesDoMes: (lista: Record<string, unknown>[], ano: number, mes: number) => string[];
  dadosRelatorio: (p: { mes: string; numero: string }, ops: Record<string, unknown>[], t: Record<string, string>, hoje: string, prefixo: string) => Record<string, unknown>;
  tabelasIndicadores: (crimes: string[][], produtividade: string[][]) => Record<string, string>;
  nomeArquivoRelatorio: (numero: string, mes: string) => string;
  preencherXmlRelatorio: (xml: string, dados: Record<string, unknown>) => string;
};
const ctx: Record<string, unknown> = {};
runInNewContext(readFileSync('apps-script/Logica.gs', 'utf8'), ctx);
const gs = ctx as unknown as Logica;

const op = (o: Partial<OperacaoControle>): OperacaoControle => ({ ...controleVazio(), id: 'x', fonte: 'portal', ...o });

describe('Controle de Operações (portal)', () => {
  test('id igual no portal e no motor (a planilha antiga não duplica o que já está no portal)', () => {
    for (const [nome, inicio] of [['2ª CORRIDA Trivitt Run!', '2026-11-15'], ['Operação Natal Iluminado', '2026-12-20'], ['', '']]) {
      expect(idControleOperacao(nome, inicio)).toBe(gs.idControleOperacao(nome, inicio));
    }
    expect(idControleOperacao('Operação Ação', '2026-01-02')).toBe('2026-01-02_operacao-acao');
  });

  test('obrigatórios e término depois do início', () => {
    expect(validarControle(controleVazio())).toEqual({ nome: 'Informe o nome da operação.', inicio: 'Informe a data de início.' });
    expect(validarControle({ ...controleVazio(), nome: 'A', inicio: '2026-10-05', termino: '2026-10-04' }).termino).toMatch(/antes do início/);
    expect(validarControle({ ...controleVazio(), nome: 'A', inicio: '2026-10-05' })).toEqual({});
  });

  test('mês: cruza, filtra (sem excluídas), rótulos', () => {
    expect(cruzaMes({ inicio: '2026-09-28', termino: '2026-10-02' }, '2026-10')).toBe(true);
    expect(cruzaMes({ inicio: '2026-09-01', termino: '' }, '2026-10')).toBe(true);
    expect(cruzaMes({ inicio: '2026-09-01', termino: '2026-09-30' }, '2026-10')).toBe(false);
    const lista = [op({ id: 'a', nome: 'A', inicio: '2026-10-01' }), op({ id: 'b', nome: 'B', inicio: '2026-10-09' }), op({ id: 'c', nome: 'C', inicio: '2026-10-03', excluida: true })];
    expect(filtrarControle(lista, '2026-10').map((o) => o.id)).toEqual(['b', 'a']);
    expect(mesAnterior('2026-01-15')).toBe('2025-12');
    expect(mesAnterior('2026-11-15')).toBe('2026-10');
    expect(rotuloMes('2026-10')).toBe('OUT/2026');
    expect(periodoControle({ inicio: '2026-10-01', termino: '2026-10-01' })).toBe('01/10/2026');
    expect(periodoControle({ inicio: '2026-10-01', termino: '' })).toBe('A partir de 01/10/2026');
  });

  test('pedido do relatório', () => {
    expect(validarPedidoRelatorio({ mes: '', numero: ' ' })).toEqual({ mes: expect.any(String), numero: expect.any(String) });
    expect(validarPedidoRelatorio({ mes: '2026-10', numero: '2085/03/26' })).toEqual({});
  });
});

describe('Relatório de Indicadores (motor, mesmo texto do script antigo)', () => {
  test('texto de cada operação', () => {
    expect(gs.textoOperacaoRelatorio('Op A', '2026-10-03', '2026-10-05', 'Prevenir roubos.')).toBe('Op A – de 03 a 05OUT26, Prevenir roubos;');
    expect(gs.textoOperacaoRelatorio('Op B', '2026-09-30', '2026-10-02', '')).toBe('Op B – de 30SET26 a 02OUT26;');
    expect(gs.textoOperacaoRelatorio('Op C', '2026-10-03', '2026-10-03', 'x;')).toBe('Op C – em 03OUT26, x;');
    expect(gs.textoOperacaoRelatorio('Op D', '2026-10-03', '', '')).toBe('Op D – a partir de 03OUT26;');
  });

  test('operações do mês em ordem de início, sem as excluídas', () => {
    const ops = [
      { nome: 'X', inicio: '2026-10-10', termino: '2026-10-10', objetivo: 'ok' },
      { nome: 'Y', inicio: '2026-09-28', termino: '2026-10-01', objetivo: '' },
      { nome: 'Z', inicio: '2026-11-01', termino: '', objetivo: '' },
      { nome: 'W', inicio: '2026-10-05', termino: '', objetivo: '', excluida: true },
    ];
    expect(gs.operacoesDoMes(ops, 2026, 10)).toEqual(['Y – de 28SET26 a 01OUT26;', 'X – em 10OUT26, ok;']);
  });

  test('linhas da aba Operações antiga (Objetivo pelo cabeçalho; sem nome ou data fica fora)', () => {
    const cab = ['Seq', 'Operação', 'OPM', 'ORDEM', 'Origem', 'Data Início', 'Data Término', 'Coluna 1', 'Objetivo'];
    const linhas = gs.linhasControleDaPlanilha(cab, [
      [1, 'Corrida Azul', '8º BPM/M', '12/26', 'CPA', new Date(2026, 10, 8), new Date(2026, 10, 9), 'Corrida de rua', 'Segurança do evento'],
      ['', 'Sem data', '', '', '', '', '', '', ''],
      ['', '', '', '', '', new Date(2026, 10, 8), '', '', ''],
      ['', 'Texto', '', '', '', '20/12/2026', '', '', ''],
    ]);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({ id: '2026-11-08_corrida-azul', inicio: '2026-11-08', termino: '2026-11-09', observacao: 'Corrida de rua', objetivo: 'Segurança do evento', ordem: '12/26' });
    expect(linhas[1]).toMatchObject({ inicio: '2026-12-20', termino: '' });
  });

  test('dados do modelo e nome do arquivo', () => {
    const tab = gs.tabelasIndicadores([['10', '8', '-20%']], [['1', '2', '100%']]);
    const d = gs.dadosRelatorio({ mes: '2026-02', numero: ' 2085/03/26 ' }, [], tab, '2026-03-05', '8BPMM-');
    expect(d).toMatchObject({ DATA_EXTENSO: '05 de março de 2026', NUMERO: '8BPMM-2085/03/26', INICIO: '01FEV26', FIM: '28FEV26', ANO_ANT: '2025', ANO: '2026', CRI_1_EVO: '-20%', PRO_1_ATU: '2' });
    expect(gs.nomeArquivoRelatorio('2085/03/26', '2026-02')).toBe('Relatório 2085_03_26 - Avaliação Periódica de Indicadores (FEV2026).docx');
  });

  test('Word: junta pedaços do campo, repete o item das operações e escapa o texto', () => {
    const xml =
      '<w:p><w:pPr><w:jc/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Nº {{NU</w:t></w:r><w:r><w:t>MERO}}</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>{{OPERACAO}}</w:t></w:r></w:p><w:p><w:r><w:t>fixo</w:t></w:r></w:p>';
    const saida = gs.preencherXmlRelatorio(xml, { NUMERO: '8BPMM-1', OPERACOES: ['A & B;', 'C;'] });
    expect(saida).toContain('<w:pPr><w:jc/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Nº 8BPMM-1</w:t>');
    expect(saida).toContain('A &amp; B;</w:t>');
    expect(saida).toContain('C;</w:t>');
    expect(saida).toContain('<w:t>fixo</w:t>');
    expect(gs.preencherXmlRelatorio('<w:p><w:r><w:t>{{OPERACAO}}</w:t></w:r></w:p>', { OPERACOES: [] })).toContain('Não houve operações no período.');
  });
});
