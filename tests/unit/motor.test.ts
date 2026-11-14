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
