import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, test } from 'vitest';
import { edicaoPrecisaAutomacao, precisaAutomacao } from '../../src/domain/automacao';
import { demandaVazia, validarDemanda } from '../../src/domain/demanda';
import { UNIDADES_RAC } from '../../src/domain/rac';
import { idPrint, slotsDaUnidade } from '../../src/domain/racPrints';

// Carrega o Logica.gs do Apps Script exatamente como ele é, sem cópia.
type Acao = { tipo: string; chave: string; agenda: string; inicio?: string; fim?: string; titulo?: string; eventoId?: string; nomePasta?: string; pastaId?: string };
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
  ordenarPendentes: (lista: { nome: string; dados: Record<string, unknown> }[]) => { nome: string }[];
  letraDaColuna: (n: number) => string;
  intervalosBrancos: (fundos: string[][], linhaInicial: number, colunaInicial?: number) => string[];
  idsPrintsDoRac: (mes: string) => string[];
  encaminhamentosOrfaos: (encs: { id: string; demandaId: string }[], status: Record<string, string>) => string[];
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
  test('demanda excluída: apaga os eventos e manda a pasta do CFP para a lixeira (nada é criado nem movido)', () => {
    const feito = {
      agendaCPA: evento('2026-11-20', 'Prazo CPA: Operação Natal'),
      cfp: { ...evento('2026-12-20', 'Operação Natal'), pastaUrl: 'https://drive.google.com/p', operacoes: true },
    };
    const excluida = { ...base, status: 'excluido', prazoCPA: '2026-11-25', prazoCia: '2026-11-18', adicionarCFP: true, inicioBtl: '2026-12-20', terminoBtl: '2026-12-21' };
    expect(motor.planejarAutomacao(excluida, feito).map((a) => [a.tipo, a.chave, a.agenda])).toEqual([
      ['apagar', 'agendaCPA', 'principal'],
      ['apagar', 'cfp', 'cfp'],
    ]);
    // Com a pasta registrada (cfpPasta), ela vai junto.
    const comPasta = { ...feito, cfpPasta: 'https://drive.google.com/drive/folders/1AbC-d_9' };
    const acoes = motor.planejarAutomacao(excluida, comPasta);
    expect(acoes.map((a) => a.tipo)).toEqual(['apagar', 'apagar', 'apagarPasta']);
    expect(acoes[2]).toMatchObject({ chave: 'cfpPasta', pastaId: '1AbC-d_9' });
    // Pasta criada mas o evento do CFP falhou: a pasta também vai.
    expect(motor.planejarAutomacao(excluida, { cfpPasta: 'https://drive.google.com/open?id=XyZ' }).map((a) => [a.tipo, a.pastaId])).toEqual([
      ['apagarPasta', 'XyZ'],
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
      { chave: '123456', re: '123456-7', posto: 'Cb PM', nomeGuerra: 'FULANO', telefone: '(11) 90000-0000', nomeCompleto: 'FULANO DE TAL', email: '', opm: '' },
      { chave: '234567', re: '234567', posto: '1º Sgt PM', nomeGuerra: 'BELTRANO', telefone: '', nomeCompleto: 'BELTRANO', email: '', opm: '' },
    ]);
    expect(motor.linhasDoEfetivo([['sem', 'cabeçalho']])).toEqual([]);
  });

  test('cadastro manual do portal vira linha nova na ordem das colunas da aba', () => {
    const topo: unknown[][] = [
      ['PREENCHA OS DADOS ABAIXO', '', '', '', '', ''],
      ['Coluna 1', 'Post/Grad', 'RE', 'NOME COMPLETO', 'NOME DE GUERRA', 'Telefone'],
    ];
    const p = { re: '765432-1', posto: '2º Sgt PM', nomeGuerra: 'LIMA', nomeCompleto: 'JOSÉ LIMA', telefone: '(11) 98888-0000' };
    const novaLinha = (motor as unknown as { novaLinhaEfetivo: (v: unknown[][], p: unknown) => unknown[] | null }).novaLinhaEfetivo;
    expect(novaLinha(topo, p)).toEqual(['', '2º Sgt PM', '765432-1', 'JOSÉ LIMA', 'LIMA', '(11) 98888-0000']);
    expect(novaLinha([['sem', 'cabeçalho']], p)).toBeNull();
  });
});

describe('EAP: textos e turmas da planilha', () => {
  const m = motor as unknown as Record<string, (...a: unknown[]) => unknown>;
  test('cabeçalho igual ao da planilha (linhas 4, 5, 6, títulos e apresentação)', () => {
    expect(m.textoAnoEap(2026)).toBe('ESTÁGIO DE ATUALIZAÇÃO PROFISSIONAL - 2026');
    expect(m.textoMesesEap(11, 12)).toBe('EAD EM NOVEMBRO - PRESENCIAL EM DEZEMBRO');
    expect(m.textoPeriodoEad('2026-11-09', '2026-11-25')).toBe('PERÍODO EAD 09 A 25NOV');
    expect(m.textoPeriodoEad('2026-10-28', '2026-11-15')).toBe('PERÍODO EAD 28OUT A 15NOV');
    expect(m.tituloTurmaEap({ tipo: 'cbsd', numero: '34', inicio: '2026-12-01', fim: '2026-12-03' })).toBe('CB/SD - TURMA 34 de 01 á 03DEZ');
    expect(m.tituloTurmaEap({ tipo: 'sgt', numero: '9', inicio: '2026-11-30', fim: '2026-12-02' })).toBe('SUBTEN SGT PM TURMA 9 de 30NOV á 02DEZ');
    expect(m.textoApresentacaoEap('2026-12-01')).toBe('APRESENTAÇÃO 010745DEZ26 CPA/M-11');
  });

  // Aba "1 Cia" como está hoje: título, apresentação, "Nº" e as linhas brancas de cada turma.
  const colA: unknown[] = ['SECRETARIA', 'POLÍCIA', 'CPA', 'ESTÁGIO', 'EAD EM', 'PERÍODO', '', '1ª Cia'];
  const fundos: string[] = colA.map(() => '#cccccc');
  const bloco = (titulo: string, linhas: number) => {
    colA.push(titulo, 'APRESENTAÇÃO', 'Nº');
    fundos.push('#cccccc', '#cccccc', '#cccccc');
    for (let i = 1; i <= linhas; i++) {
      colA.push(i);
      fundos.push('#FFFFFF');
    }
  };
  bloco('CB/SD - TURMA 34 de 01 á 03DEZ', 3);
  bloco('CB/SD - TURMA 35 de 07 á 09DEZ', 2);
  bloco('CB/SD - TURMA 36 de 14 á 16DEZ', 3);
  bloco('SUBTEN SGT PM TURMA 9 de 09 á 11DEZ', 2);
  bloco('SUBTEN SGT PM TURMA 10 de 16 á 18DEZ', 2);
  bloco('SOMENTE TAF OU TAT', 4);
  colA.push('RESTRIÇÃO - TURMA X', 'SOMENTE FASE EAD', 'Nº', 1, 2, 3, '');
  fundos.push('#cccccc', '#cccccc', '#cccccc', '#ffffff', '#ffffff', '#ffffff', '#cccccc');

  test('acha as turmas onde elas estiverem (linhas 9, 15, 20, 26 e 31)', () => {
    const blocos = m.localizarBlocosEap(colA, fundos) as { id: string; titulo: number; primeira: number; linhas: number }[];
    expect(blocos.map((b) => [b.id, b.titulo, b.primeira, b.linhas])).toEqual([
      ['cbsd1', 9, 12, 3],
      ['cbsd2', 15, 18, 2],
      ['cbsd3', 20, 23, 3],
      ['sgt1', 26, 29, 2],
      ['sgt2', 31, 34, 2],
      ['taf', 36, 39, 4],
      ['restricao', 43, 46, 3],
    ]);
  });

  test('linhas de cada turma = vagas da Cia (mínimo 1 e nunca menos do que já foi preenchido)', () => {
    const blocos = m.localizarBlocosEap(colA, fundos);
    expect(m.ajustesDeLinhasEap(blocos, { cbsd1: 3, cbsd2: 4, cbsd3: 0, sgt1: 2, sgt2: 1 }, { sgt2: 2, taf: 6 })).toEqual([
      { id: 'cbsd2', de: 2, para: 4 },
      { id: 'cbsd3', de: 3, para: 1 },
      { id: 'taf', de: 4, para: 6 },
    ]);
  });

  test('linha do policial (A a K), validade da IAS em dd/mm/aaaa', () => {
    const p = { grad: 'CB PM', re: '111660-6', nomeCompleto: 'FULANO DE TAL', email: 'f@pm', celular: '(11) 9', ias: 'IAS1', validadeIas: '2027-04-15', observacao: '' };
    expect(m.linhaPolicialEap(p, 1, '1cia')).toEqual([1, 'CB PM', '111660-6', 'FULANO DE TAL', '1ª CIA PM', '8º BPM/M', 'f@pm', '(11) 9', 'IAS1', '15/04/2027', '']);
    expect((m.linhaPolicialEap({ ...p, validadeIas: '' }, 2, 'ft') as unknown[]).slice(4, 6)).toEqual(['FT', '8º BPM/M']);
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

describe('fila do motor', () => {
  test('as que deram erro vão por último (a mais antiga primeiro): erro repetido não trava a fila', () => {
    const p = (nome: string, automacao?: Record<string, string>) => ({ nome, dados: automacao ? { automacao } : {} });
    const fila = motor.ordenarPendentes([
      p('a', { erro: 'limite', processadoEm: '2026-11-16T23:10' }),
      p('b'),
      p('c', { erro: 'limite', processadoEm: '2026-11-16T23:05' }),
      p('d', { processadoEm: '2026-11-16T23:00' }),
    ]);
    expect(fila.map((x) => x.nome)).toEqual(['b', 'd', 'c', 'a']);
  });
});

describe('versão dos arquivos do Apps Script', () => {
  test('Motor.gs e Logica.gs com a mesma versão (o diagnóstico acusa quando só um foi colado)', () => {
    const versao = (arquivo: string, nome: string) =>
      new RegExp(`var ${nome} = '([^']+)'`).exec(readFileSync(`apps-script/${arquivo}`, 'utf8'))?.[1];
    const motor = versao('Motor.gs', 'VERSAO_MOTOR');
    expect(motor).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(versao('Logica.gs', 'VERSAO_LOGICA')).toBe(motor);
  });
});

describe('EAP: limpar as células brancas em poucos intervalos', () => {
  const B = '#FFFFFF';
  const C = '#d9d9d9';

  test('colunas em letras', () => {
    expect([1, 2, 26, 27, 52, 53].map(motor.letraDaColuna)).toEqual(['A', 'B', 'Z', 'AA', 'AZ', 'BA']);
  });

  test('junta brancas seguidas na linha e linhas iguais seguidas', () => {
    const fundos = [
      [C, B, B, C, B],
      [C, B, B, C, B],
      [C, C, C, C, B],
      [B, B, B, B, B],
    ];
    expect(motor.intervalosBrancos(fundos, 9)).toEqual(['B9:C10', 'E9:E11', 'A12:E12']);
  });

  test('cobre exatamente as brancas', () => {
    const fundos = Array.from({ length: 40 }, (_, i) => Array.from({ length: 12 }, (_, j) => ((i * 7 + j * 3) % 5 === 0 ? C : B)));
    const cobertas = new Set<string>();
    for (const r of motor.intervalosBrancos(fundos, 9)) {
      const [a, b] = r.split(':');
      const [, c1, l1] = /([A-Z]+)(\d+)/.exec(a)!;
      const [, c2, l2] = /([A-Z]+)(\d+)/.exec(b)!;
      const col = (s: string) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
      for (let l = Number(l1); l <= Number(l2); l++) for (let c = col(c1); c <= col(c2); c++) cobertas.add(`${l}:${c}`);
    }
    const esperadas = new Set<string>();
    fundos.forEach((linha, i) => linha.forEach((f, j) => f === B && esperadas.add(`${i + 9}:${j + 1}`)));
    expect(cobertas).toEqual(esperadas);
  });

  test('aba grande (1000 linhas x 26 colunas) sai em poucos intervalos', () => {
    const fundos = Array.from({ length: 992 }, (_, i) => Array.from({ length: 26 }, (_, j) => (j === 0 || i % 10 === 0 ? C : B)));
    const r = motor.intervalosBrancos(fundos, 9);
    expect(r.length).toBeLessThan(200);
  });
});

describe('RAC: prints apagados depois de arquivar o RAC GERAL', () => {
  test('o motor apaga todos os prints possíveis do mês (Cias, FT e Batalhão)', () => {
    const ids = new Set(motor.idsPrintsDoRac('2026-09'));
    for (const u of [...UNIDADES_RAC, 'btl' as const]) for (const s of slotsDaUnidade(u)) expect(ids.has(idPrint('2026-09', u, s.id))).toBe(true);
    expect([...ids].every((id) => id.startsWith('2026-09_'))).toBe(true);
  });
});

describe('limpeza diária de encaminhamentos sem demanda', () => {
  test('sai o que ficou sem demanda (apagada ou excluída); o resto fica', () => {
    const encs = [
      { id: '10_1cia', demandaId: '10' },
      { id: '11_1cia', demandaId: '11' },
      { id: '12_2cia', demandaId: '12' },
      { id: 'sem', demandaId: '' },
    ];
    expect(motor.encaminhamentosOrfaos(encs, { '10': 'em_aberto', '12': 'excluido' })).toEqual(['11_1cia', '12_2cia', 'sem']);
    expect(motor.encaminhamentosOrfaos(encs.slice(0, 1), { '10': 'concluido' })).toEqual([]);
  });
});
