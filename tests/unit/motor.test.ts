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
  montarResumoDiario: (d: unknown[], e: unknown[], hoje: string) => Resumo;
  htmlResumoP3: (r: Resumo, hoje: string, url: string) => string;
  htmlResumoCia: (c: Resumo['porCia'][string], hoje: string, url: string) => string;
  assuntoResumoP3: (r: Resumo, hoje: string) => string;
};
type Item = { numero: number; saida: string; prazo: string; sigla?: string };
type Resumo = {
  atrasadas: Item[];
  venceHoje: Item[];
  proximos: Item[];
  aguardandoAceite: Item[];
  porCia: Record<string, { sigla: string; pendentes: Item[]; atrasadas: Item[] }>;
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

describe('resumo diário por e-mail (Apps Script)', () => {
  const HOJE = '2026-11-13';
  const demandas = [
    { numero: 1, saida: 'Atrasada', prazoCPA: '2026-11-10' },
    { numero: 2, saida: 'Hoje', prazoCPA: HOJE },
    { numero: 3, saida: 'Daqui 2 dias', prazoCPA: '2026-11-15' },
    { numero: 4, saida: 'Longe', prazoCPA: '2026-12-20' },
    { numero: 5, saida: 'Sem prazo', prazoCPA: '' },
  ];
  const encs = [
    { numero: 3, saida: 'Daqui 2 dias', unidadeId: '1cia', status: 'novo', prazoCia: '2026-11-12' },
    { numero: 4, saida: 'Longe', unidadeId: '1cia', status: 'em_andamento', prazoCia: '2026-12-10' },
    { numero: 4, saida: 'Longe', unidadeId: 'ft', status: 'respondido', prazoCia: '2026-12-10' },
  ];
  const r = motor.montarResumoDiario(demandas, encs, HOJE);

  test('separa atrasadas, vencem hoje, próximos 3 dias e aguardando aceite', () => {
    expect(r.atrasadas.map((i) => i.numero)).toEqual([1]);
    expect(r.venceHoje.map((i) => i.numero)).toEqual([2]);
    expect(r.proximos.map((i) => i.numero)).toEqual([3]);
    expect(r.aguardandoAceite.map((i) => i.sigla)).toEqual(['CIA FT']);
  });

  test('por Cia: pendentes em ordem de prazo e atrasadas', () => {
    expect(r.porCia['1cia'].pendentes.map((i) => i.numero)).toEqual([3, 4]);
    expect(r.porCia['1cia'].atrasadas.map((i) => i.numero)).toEqual([3]);
    expect(r.porCia.ft).toBeUndefined();
  });

  test('e-mail da P/3 e da Cia com as seções e o link do portal; assunto resume', () => {
    const html = motor.htmlResumoP3(r, HOJE, 'https://portal.exemplo');
    expect(html).toContain('pendências de 13/11/2026');
    expect(html).toContain('Atrasadas (1)');
    expect(html).toContain('href="https://portal.exemplo"');
    expect(motor.htmlResumoCia(r.porCia['1cia'], HOJE, '')).toContain('1ª CIA');
    expect(motor.assuntoResumoP3(r, HOJE)).toBe('Portal P3 — 13/11/2026 — 1 atrasada(s), 1 vence(m) hoje, 1 aguardando aceite');
  });

  test('protege o HTML contra texto da demanda', () => {
    const r2 = motor.montarResumoDiario([{ numero: 9, saida: '<b>x</b>', prazoCPA: '2026-11-01' }], [], HOJE);
    expect(motor.htmlResumoP3(r2, HOJE, '')).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
