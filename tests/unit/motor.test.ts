import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, test } from 'vitest';
import { edicaoPrecisaAutomacao, precisaAutomacao } from '../../src/domain/automacao';
import { demandaVazia, validarDemanda } from '../../src/domain/demanda';

// Carrega o Logica.gs do Apps Script exatamente como ele é, sem cópia.
type Acao = { tipo: string; chave: string; agenda: string; inicio?: string; fim?: string; titulo?: string; eventoId?: string; nomePasta?: string };
type Motor = {
  planejarAutomacao: (d: Record<string, unknown>, feito?: Record<string, unknown>) => Acao[];
  jsParaValor: (x: unknown) => unknown;
  valorParaJs: (v: unknown) => unknown;
  camposParaJs: (f: Record<string, unknown>) => Record<string, unknown>;
  ehDoFuncional: (de: string, funcional: string) => boolean;
  limparAssunto: (assunto: string) => string;
  remetenteOriginal: (corpo: string) => string;
  pendenteDoEmail: (m: Record<string, string>, anexos?: { nome: string; url: string }[]) => Record<string, unknown>;
  diasDaOperacao: (inicio: string, termino: string) => string[];
  camposDaPlanilha: (valores: unknown[][], linhaInicial?: number) => { linha: number; rotulo: string; grupo: string }[];
  normalizarRE: (re: unknown) => string;
  linhasDoEfetivo: (valores: unknown[][]) => Record<string, string>[];
  pastaDaDescricao: (descricao: unknown) => string;
  numeroDaDescricao: (descricao: unknown) => number;
  missaoDaAgenda: (ev: Record<string, string>) => Record<string, unknown>;
  ordenarMissoes: (lista: { id: string; titulo: string; inicio: string }[]) => { id: string }[];
};
const ctx: Record<string, unknown> = {};
runInNewContext(readFileSync('apps-script/Logica.gs', 'utf8'), ctx);
const motor = ctx as unknown as Motor;

const base = { numero: 2150, saida: 'Operação Natal', observacao: 'Obs', destinos: ['1cia', 'ft'] };
const evento = (inicio: string, titulo: string, fim = inicio) => ({ eventoId: 'ev1', inicio, fim, titulo });

describe('quando chamar o motor (portal)', () => {
  test('demanda nova só com prazo ou CFP', () => {
    expect(precisaAutomacao({ prazoCPA: '', prazoCia: '', adicionarCFP: false })).toBe(false);
    expect(precisaAutomacao({ prazoCPA: '2026-11-20', prazoCia: '', adicionarCFP: false })).toBe(true);
    expect(precisaAutomacao({ prazoCPA: '', prazoCia: '', adicionarCFP: true })).toBe(true);
  });

  test('edição só quando muda algo que aparece na agenda/pasta', () => {
    expect(edicaoPrecisaAutomacao(['responsavel', 'numeroSaida'])).toBe(false);
    expect(edicaoPrecisaAutomacao(['prazoCia'])).toBe(true);
    expect(edicaoPrecisaAutomacao(['saida'])).toBe(true);
  });

  test('CFP exige início e término Btl', () => {
    const d = { ...demandaVazia('2026-11-13'), saida: 'X', adicionarCFP: true };
    expect(validarDemanda(d)).toMatchObject({ inicioBtl: 'Para o CFP, informe o início.', terminoBtl: 'Para o CFP, informe o término.' });
    expect(validarDemanda({ ...d, inicioBtl: '2026-12-01', terminoBtl: '2026-12-02' })).toEqual({});
  });
});

describe('planejarAutomacao (Apps Script)', () => {
  test('demanda excluída: só apaga os eventos que tinha (nada é criado nem movido)', () => {
    const feito = {
      agendaCPA: evento('2026-11-20', 'Prazo CPA: Operação Natal'),
      cfp: { ...evento('2026-12-20', 'Operação Natal'), pastaUrl: 'https://drive.google.com/p', operacoes: true },
    };
    const excluida = { ...base, status: 'excluido', prazoCPA: '2026-11-25', prazoCia: '2026-11-18', adicionarCFP: true, inicioBtl: '2026-12-20', terminoBtl: '2026-12-21' };
    expect(motor.planejarAutomacao(excluida, feito).map((a) => [a.tipo, a.chave, a.agenda])).toEqual([
      ['apagar', 'agendaCPA', 'principal'],
      ['apagar', 'cfp', 'cfp'],
    ]);
    expect(motor.planejarAutomacao(excluida, {})).toEqual([]);
  });

  test('prazos novos viram eventos com os mesmos títulos do painel do numerador', () => {
    const acoes = motor.planejarAutomacao({ ...base, prazoCPA: '2026-11-20', prazoCia: '2026-11-18' });
    expect(acoes.map((a) => [a.tipo, a.chave, a.titulo])).toEqual([
      ['criar', 'agendaCPA', 'Prazo CPA: Operação Natal'],
      ['criar', 'agendaCia', 'Prazo Cia (1ª CIA, CIA FT): Operação Natal'],
    ]);
  });

  test('nada muda: nenhuma ação; prazo mudou: move o evento; prazo apagado: apaga', () => {
    const feito = { agendaCPA: evento('2026-11-20', 'Prazo CPA: Operação Natal') };
    expect(motor.planejarAutomacao({ ...base, prazoCPA: '2026-11-20' }, feito)).toEqual([]);
    const mover = motor.planejarAutomacao({ ...base, prazoCPA: '2026-11-25' }, feito);
    expect(mover).toMatchObject([{ tipo: 'atualizar', chave: 'agendaCPA', eventoId: 'ev1', inicio: '2026-11-25' }]);
    expect(motor.planejarAutomacao({ ...base, prazoCPA: '' }, feito)).toMatchObject([{ tipo: 'apagar', eventoId: 'ev1' }]);
  });

  test('CFP: cria pasta e evento uma vez; depois só acompanha datas e título', () => {
    const d = { ...base, adicionarCFP: true, inicioBtl: '2026-12-20', terminoBtl: '2026-12-26' };
    const criar = motor.planejarAutomacao(d);
    expect(criar).toMatchObject([{ tipo: 'criarCFP', agenda: 'cfp', nomePasta: '2150 - Operação Natal', fim: '2026-12-26' }]);

    const feito = { cfp: { ...evento('2026-12-20', 'Operação Natal', '2026-12-26'), pastaUrl: 'https://drive/x', operacoes: true } };
    expect(motor.planejarAutomacao(d, feito)).toEqual([]);
    expect(motor.planejarAutomacao({ ...d, terminoBtl: '2026-12-27' }, feito)).toMatchObject([
      { tipo: 'atualizar', chave: 'cfp', fim: '2026-12-27' },
    ]);
  });

  test('CFP com a linha da aba Operações pendente (falhou antes): só refaz essa etapa', () => {
    const d = { ...base, adicionarCFP: true, inicioBtl: '2026-12-20', terminoBtl: '2026-12-26' };
    const feito = { cfp: { ...evento('2026-12-20', 'Operação Natal', '2026-12-26'), pastaUrl: 'https://drive/x', operacoes: false } };
    expect(motor.planejarAutomacao(d, feito).map((a) => a.tipo)).toEqual(['operacoes']);
  });

  test('CFP sem as duas datas não faz nada', () => {
    expect(motor.planejarAutomacao({ ...base, adicionarCFP: true, inicioBtl: '2026-12-20', terminoBtl: '' })).toEqual([]);
  });
});

describe('conversão Firestore <-> objeto (Apps Script)', () => {
  test('ida e volta preserva textos, números, booleanos, listas, mapas e nulos', () => {
    const original = { a: 'texto', n: 2150, b: true, lista: ['1cia', 'ft'], mapa: { eventoId: 'x', cfp: null } };
    const valor = motor.jsParaValor(original) as { mapValue: { fields: Record<string, unknown> } };
    expect(motor.camposParaJs(valor.mapValue.fields)).toEqual(original);
  });

  test('lê os formatos que o Firestore devolve', () => {
    expect(motor.valorParaJs({ integerValue: '42' })).toBe(42);
    expect(motor.valorParaJs({ arrayValue: {} })).toEqual([]);
    expect(motor.valorParaJs({ mapValue: {} })).toEqual({});
  });
});

describe('e-mails do funcional para Demandas Pendentes (Apps Script)', () => {
  const FUNCIONAL = '8bpmmp3@policiamilitar.sp.gov.br';

  test('só aceita o que veio da caixa funcional', () => {
    expect(motor.ehDoFuncional('P3 8º BPM/M <8BPMMP3@PoliciaMilitar.sp.gov.br>', FUNCIONAL)).toBe(true);
    expect(motor.ehDoFuncional('8bpmmp3@policiamilitar.sp.gov.br', FUNCIONAL)).toBe(true);
    expect(motor.ehDoFuncional('Google <no-reply@accounts.google.com>', FUNCIONAL)).toBe(false);
    expect(motor.ehDoFuncional('Fulano <fulano@policiamilitar.sp.gov.br>', FUNCIONAL)).toBe(false);
  });

  test('tira ENC:/FW:/Fwd: do assunto', () => {
    expect(motor.limparAssunto('ENC: Pedido de policiamento')).toBe('Pedido de policiamento');
    expect(motor.limparAssunto('Fwd: FW: enc:  Escolta')).toBe('Escolta');
    expect(motor.limparAssunto('RES: Reunião')).toBe('RES: Reunião');
    expect(motor.limparAssunto('ENC:')).toBe('(sem assunto)');
  });

  test('acha quem mandou o e-mail original no texto encaminhado', () => {
    const outlook = 'Segue.\n\n________________________________\nDe: CPA/M-11 <cpam11@policiamilitar.sp.gov.br>\nEnviado: quinta-feira\nPara: 8bpmmp3';
    expect(motor.remetenteOriginal(outlook)).toBe('CPA/M-11 <cpam11@policiamilitar.sp.gov.br>');
    expect(motor.remetenteOriginal('---------- Forwarded message ---------\nFrom: *Fulano* <f@x.com>')).toBe('Fulano <f@x.com>');
    expect(motor.remetenteOriginal('sem cabeçalho')).toBe('');
  });

  test('monta o item pendente com texto limpo e anexos', () => {
    const item = motor.pendenteDoEmail(
      {
        assunto: 'ENC: Operação Natal',
        corpo: 'Linha 1\r\n\r\n\r\n\r\nDe: CPA <c@pm>\r\n',
        dataEntrada: '2026-11-14',
        recebidoEm: '2026-11-14T11:00:00.000Z',
        link: 'https://mail.google.com/x',
      },
      [{ nome: 'oficio.pdf', url: 'https://drive/x' }],
    );
    expect(item).toEqual({
      tipo: 'email',
      status: 'pendente',
      dataEntrada: '2026-11-14',
      recebidoEm: '2026-11-14T11:00:00.000Z',
      assunto: 'Operação Natal',
      texto: 'Linha 1\n\nDe: CPA <c@pm>',
      remetente: 'CPA <c@pm>',
      linkGmail: 'https://mail.google.com/x',
      anexos: [{ nome: 'oficio.pdf', url: 'https://drive/x' }],
    });
  });

  test('e-mail enorme é cortado com aviso', () => {
    const item = motor.pendenteDoEmail({ assunto: 'x', corpo: 'a'.repeat(30000), dataEntrada: '', recebidoEm: '' });
    expect(String(item.texto).length).toBeLessThan(20100);
    expect(String(item.texto)).toContain('abra o e-mail no Gmail');
  });
});

describe('Checklist Operações (Apps Script)', () => {
  test('dias da operação iguais aos do portal', async () => {
    const { diasDaOperacao } = await import('../../src/domain/operacao');
    for (const [i, t] of [
      ['2026-11-29', '2026-12-02'],
      ['2026-11-20', ''],
      ['2026-11-20', '2026-11-18'],
      ['', '2026-11-20'],
    ]) {
      expect(motor.diasDaOperacao(i, t)).toEqual(diasDaOperacao(i, t));
    }
  });

  test('lê os indicadores do modelo de resultados', () => {
    // Igual ao modelo: linha 7 cabeçalho, 8 grupo na coluna A, indicadores numerados, grupos na coluna B.
    const linhas: unknown[][] = [
      ['', ''],
      ['', 'Nº PROTOCOLO - MAPA FORÇA'],
      ['', 'Nº PROTOCOLO - RESULTADO'],
      ['', ''],
      ['', 'Planilha de Resultados SICoordOp'],
      ['', ''],
      ['OPM:', ''],
      ['OCOR. COMUNS', ''],
      [1, 'Pessoas Abordadas'],
      [2, 'Estabelecimentos Vistoriados'],
      ['', 'FLAG./PESSOAS'],
      [7, 'Ato Infracional'],
      ['', ''],
      ['28', 'Medicamentos(cx)'],
    ];
    expect(motor.camposDaPlanilha(linhas)).toEqual([
      { linha: 9, rotulo: 'Pessoas Abordadas', grupo: 'OCOR. COMUNS' },
      { linha: 10, rotulo: 'Estabelecimentos Vistoriados', grupo: 'OCOR. COMUNS' },
      { linha: 12, rotulo: 'Ato Infracional', grupo: 'FLAG./PESSOAS' },
      { linha: 14, rotulo: 'Medicamentos(cx)', grupo: 'FLAG./PESSOAS' },
    ]);
  });

  test('RE igual ao do portal', async () => {
    const { normalizarRE } = await import('../../src/domain/efetivo');
    for (const re of ['123456-7', '1234567', '123456-A', ' 123456 ', '']) expect(motor.normalizarRE(re)).toBe(normalizarRE(re));
    expect(motor.normalizarRE(1234567)).toBe('123456');
  });

  test('lê o banco de efetivo pelo cabeçalho, onde ele estiver', () => {
    const aba: unknown[][] = [
      ['PREENCHA OS DADOS ABAIXO', '', '', '', '', ''],
      ['CIA', '4ªCia', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['Coluna 1', 'Post/Grad', 'RE', 'NOME COMPLETO', 'NOME DE GUERRA', 'Telefone'],
      [1, 'Cb PM', '123456-7', 'FULANO DE TAL', 'FULANO', '(11) 90000-0000'],
      [2, 'Sd PM', '', 'SEM RE', 'X', ''],
      [3, '1º Sgt PM', 234567, 'BELTRANO', 'BELTRANO', ''],
    ];
    expect(motor.linhasDoEfetivo(aba)).toEqual([
      { chave: '123456', re: '123456-7', posto: 'Cb PM', nomeGuerra: 'FULANO', telefone: '(11) 90000-0000' },
      { chave: '234567', re: '234567', posto: '1º Sgt PM', nomeGuerra: 'BELTRANO', telefone: '' },
    ]);
    expect(motor.linhasDoEfetivo([['sem', 'cabeçalho']])).toEqual([]);
  });
});

describe('agenda do CFP -> página do CFP', () => {
  test('acha a pasta na descrição (texto do motor, HTML da agenda ou sem pasta)', () => {
    const url = 'https://drive.google.com/drive/folders/1AbC-d_9';
    expect(motor.pastaDaDescricao(`📂 PASTA CFP:\n${url}\n\nNº 2150`)).toBe(url);
    expect(motor.pastaDaDescricao(`Ver <a href="${url}">pasta</a>`)).toBe(url);
    expect(motor.pastaDaDescricao('doc https://drive.google.com/file/d/x/view e https://drive.google.com/open?id=Z&amp;a=1')).toBe(
      'https://drive.google.com/open?id=Z&a=1',
    );
    expect(motor.pastaDaDescricao('só o arquivo https://drive.google.com/file/d/x/view')).toBe('https://drive.google.com/file/d/x/view');
    expect(motor.pastaDaDescricao('')).toBe('');
    expect(motor.pastaDaDescricao(null)).toBe('');
  });

  test('número da demanda só quando a descrição traz', () => {
    expect(motor.numeroDaDescricao('📂 PASTA CFP:\nlink\n\nNº 2150')).toBe(2150);
    expect(motor.numeroDaDescricao('N° 12 ok')).toBe(12);
    expect(motor.numeroDaDescricao('Apoio no 5º BPM')).toBe(0);
    expect(motor.numeroDaDescricao('Operação criada na mão')).toBe(0);
  });

  test('evento vira missão (sem título, fim antes do início)', () => {
    expect(
      motor.missaoDaAgenda({ id: 'ev1', titulo: ' Operação Natal ', descricao: 'https://drive.google.com/drive/folders/P', inicio: '2026-12-20', fim: '2026-12-22' }),
    ).toEqual({ id: 'ev1', titulo: 'Operação Natal', inicio: '2026-12-20', fim: '2026-12-22', pastaUrl: 'https://drive.google.com/drive/folders/P', numero: 0 });
    expect(motor.missaoDaAgenda({ id: 'ev2', titulo: '', descricao: '', inicio: '2026-12-20', fim: '2026-12-19' })).toMatchObject({
      titulo: '(sem título)',
      fim: '2026-12-20',
    });
  });

  test('ordem estável: início, depois título', () => {
    const lista = [
      { id: 'c', titulo: 'B', inicio: '2026-12-02' },
      { id: 'b', titulo: 'B', inicio: '2026-12-01' },
      { id: 'a', titulo: 'A', inicio: '2026-12-01' },
    ];
    expect(motor.ordenarMissoes(lista).map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(lista[0].id).toBe('c');
  });
});
