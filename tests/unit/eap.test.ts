import { describe, expect, test } from 'vitest';
import {
  planilhaAtrasada,
  eapVazia,
  errosPolicialEap,
  errosRespostaEap,
  policialEapVazio,
  rotuloTurma,
  tituloEap,
  totalVagasDaCia,
  TURMAS_EAP,
  validarEap,
  type DadosEap,
} from '../../src/domain/eap';

const completo = (): DadosEap => ({
  ...eapVazia('2026-11-15'),
  ano: 2026,
  mesEad: 11,
  mesPresencial: 12,
  eadInicio: '2026-11-09',
  eadFim: '2026-11-25',
  prazo: '2026-11-20',
  turmas: TURMAS_EAP.map((t, i) => ({ id: t.id, tipo: t.tipo, numero: String(34 + i), inicio: '2026-12-01', fim: '2026-12-03' })),
  vagas: { '1cia': { cbsd1: 2 } },
});

describe('EAP (P/3)', () => {
  test('novo já vem com o mês seguinte e as 5 turmas da planilha', () => {
    const v = eapVazia('2026-11-15');
    expect([v.ano, v.mesEad, v.mesPresencial]).toEqual([2026, 12, 1]);
    expect(eapVazia('2026-12-02')).toMatchObject({ ano: 2027, mesEad: 1, mesPresencial: 2 });
    expect(v.turmas.map((t) => t.id)).toEqual(['cbsd1', 'cbsd2', 'cbsd3', 'sgt1', 'sgt2']);
  });

  test('textos de tela', () => {
    expect(tituloEap(completo())).toBe('EAP 2026 · EAD em Novembro · presencial em Dezembro');
    expect(rotuloTurma({ id: 'sgt1', tipo: 'sgt', numero: '9', inicio: '2026-12-09', fim: '2026-12-11' })).toBe('Subten/Sgt · Turma 9 · 09/12 a 11/12');
    expect(totalVagasDaCia({ cbsd1: 2, sgt2: 1 })).toBe(3);
  });

  test('obrigatórios campo a campo', () => {
    expect(validarEap(completo())).toEqual({});
    const vazio = validarEap({ ...eapVazia('2026-11-15') });
    expect(Object.keys(vazio)).toEqual(
      expect.arrayContaining(['eadInicio', 'eadFim', 'prazo', 'turma.cbsd1.numero', 'turma.sgt2.fim', 'vagas']),
    );
    expect(validarEap({ ...completo(), eadFim: '2026-11-01' }).eadFim).toBe('O fim não pode ser antes do início.');
    expect(validarEap({ ...completo(), vagas: { '2cia': { cbsd1: 0 } } }).vagas).toBe('Defina pelo menos uma vaga.');
  });
});

describe('EAP (Cia)', () => {
  const p = { ...policialEapVazio(), re: '123456-7', grad: 'SD PM', nomeCompleto: 'FULANO DE TAL' };

  test('policial: RE, graduação e nome completo obrigatórios', () => {
    expect(errosPolicialEap(p)).toEqual({});
    expect(errosPolicialEap(policialEapVazio())).toEqual({ re: 'Informe o RE.', grad: 'Informe a graduação.', nomeCompleto: 'Informe o nome completo.' });
  });

  test('cada turma com vaga precisa de policial ou "sem efetivo", nunca acima das vagas', () => {
    const r = { vagas: { cbsd1: 1, cbsd2: 2, sgt1: 0 } };
    expect(errosRespostaEap(r, {}, '')).toEqual({
      cbsd1: 'Indique os policiais ou marque "Sem efetivo pendente de EAP".',
      cbsd2: 'Indique os policiais ou marque "Sem efetivo pendente de EAP".',
      nome: 'Informe quem está enviando (posto/graduação e nome).',
    });
    expect(
      errosRespostaEap(r, { cbsd1: { semEfetivo: false, policiais: [p, p] }, cbsd2: { semEfetivo: true, policiais: [] } }, 'Cb PM X'),
    ).toEqual({ cbsd1: 'Esta turma tem 1 vaga(s) para a sua Cia.' });
    expect(errosRespostaEap(r, { cbsd1: { semEfetivo: false, policiais: [p] }, cbsd2: { semEfetivo: true, policiais: [] } }, 'Cb PM X')).toEqual({});
  });
});

describe('planilha atrasada', () => {
  const quando = (min: number) => ({ toDate: () => new Date(Date.UTC(2026, 10, 17, 12, 0) - min * 60_000) });
  const agora = new Date(Date.UTC(2026, 10, 17, 12, 0));
  test('pedida há mais de 15 minutos: avisa', () => {
    expect(planilhaAtrasada({ planilha: { status: 'pedida' }, criadoEm: quando(20) }, agora)).toBe(true);
    expect(planilhaAtrasada({ planilha: { status: 'pedida' }, criadoEm: quando(5) }, agora)).toBe(false);
    expect(planilhaAtrasada({ planilha: { status: 'pronta' }, criadoEm: quando(60) }, agora)).toBe(false);
    expect(planilhaAtrasada({ planilha: { status: 'pedida' } }, agora)).toBe(false);
  });
});

describe('planilha atrasada depois de pedir de novo', () => {
  test('conta a partir do último pedido', () => {
    const agora = new Date(Date.UTC(2026, 10, 17, 12, 0));
    const ha = (min: number) => ({ toDate: () => new Date(agora.getTime() - min * 60_000) });
    expect(planilhaAtrasada({ planilha: { status: 'pedida', pedidaEm: ha(2) }, criadoEm: ha(120) }, agora)).toBe(false);
    expect(planilhaAtrasada({ planilha: { status: 'pedida', pedidaEm: ha(20) }, criadoEm: ha(120) }, agora)).toBe(true);
  });
});
