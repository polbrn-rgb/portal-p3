import { describe, expect, test } from 'vitest';
import { demandaVazia, validarDemanda } from '../../src/domain/demanda';
import {
  demandaDaPendente,
  detalheDaPendente,
  filtrarPendentes,
  montarPendenteManual,
  ordenarPendentes,
  pendenteManualVazia,
  resumoDoTexto,
  validarPendente,
  type Pendente,
} from '../../src/domain/pendente';

const HOJE = '2026-11-14';

function pendente(extra: Partial<Pendente>): Pendente {
  return {
    id: 'p1',
    tipo: 'email',
    status: 'pendente',
    dataEntrada: '2026-11-12',
    recebidoEm: '2026-11-12T10:00:00.000Z',
    assunto: 'Pedido de policiamento',
    texto: 'Texto do e-mail',
    ...extra,
  };
}

describe('pendente manual (SEI e Ordem Verbal)', () => {
  test('SEI pede o texto; nº do SEI pode ficar para depois', () => {
    const sei = pendenteManualVazia('sei', HOJE);
    expect(validarPendente(sei)).toEqual({ texto: 'Cole o texto da demanda.' });
    expect(validarPendente({ ...sei, texto: 'Ofício 12' })).toEqual({});
  });

  test('Ordem Verbal pede a ordem e quem deu', () => {
    const ov = pendenteManualVazia('ordem_verbal', HOJE);
    expect(validarPendente(ov)).toEqual({ texto: 'Escreva qual é a ordem.', quemOrdenou: 'Informe quem deu a ordem.' });
    expect(validarPendente({ ...ov, texto: 'Reforço no centro', quemOrdenou: 'Cmt Btl' })).toEqual({});
    expect(validarPendente({ ...ov, texto: 'x', quemOrdenou: 'y', dataEntrada: '' })).toEqual({
      dataEntrada: 'Informe a data de entrada.',
    });
  });

  test('o assunto é a primeira linha do texto, cortada se for longa', () => {
    expect(resumoDoTexto('\n\n  Ofício nº 12/2026  \nSegunda linha')).toBe('Ofício nº 12/2026');
    const longo = resumoDoTexto('a'.repeat(300));
    expect(longo.length).toBe(120);
    expect(longo.endsWith('…')).toBe(true);
  });

  test('monta o que vai para o banco, só com os campos do tipo', () => {
    const agora = new Date('2026-11-14T12:00:00.000Z');
    expect(
      montarPendenteManual({ ...pendenteManualVazia('sei', HOJE), texto: ' Escolta de preso \n detalhes ', numeroSei: ' 006.1/2026 ' }, agora),
    ).toEqual({
      tipo: 'sei',
      dataEntrada: HOJE,
      recebidoEm: '2026-11-14T12:00:00.000Z',
      assunto: 'Escolta de preso',
      texto: 'Escolta de preso \n detalhes',
      numeroSei: '006.1/2026',
    });
    const ov = montarPendenteManual(
      { ...pendenteManualVazia('ordem_verbal', HOJE), texto: 'Reforço', quemOrdenou: ' Cmt Btl ', numeroSei: 'ignorado' },
      agora,
    );
    expect(ov.quemOrdenou).toBe('Cmt Btl');
    expect(ov).not.toHaveProperty('numeroSei');
  });
});

describe('dar destino', () => {
  const base = demandaVazia(HOJE);

  test('e-mail: entrada, origem, resumo e quem mandou na observação', () => {
    const d = demandaDaPendente(pendente({ remetente: 'CPA/M-11 <c@pm>' }), base);
    expect(d).toMatchObject({
      dataEntrada: '2026-11-12',
      origem: 'E-mail',
      numeroOrigem: '',
      saida: 'Pedido de policiamento',
      observacao: 'E-mail de CPA/M-11 <c@pm>.',
      categoria: 'Outras Demandas',
    });
    expect(validarDemanda(d)).toEqual({});
  });

  test('SEI leva o número do processo; sem número o Numerador continua pedindo', () => {
    const com = demandaDaPendente(pendente({ tipo: 'sei', numeroSei: '006.00000001/2026-01' }), base);
    expect(com).toMatchObject({ origem: 'SEI', numeroOrigem: '006.00000001/2026-01' });
    expect(validarDemanda(com)).toEqual({});
    const sem = demandaDaPendente(pendente({ tipo: 'sei', numeroSei: '' }), base);
    expect(validarDemanda(sem)).toEqual({ numeroOrigem: 'Informe o número do processo SEI.' });
  });

  test('Ordem Verbal registra quem deu a ordem', () => {
    const d = demandaDaPendente(pendente({ tipo: 'ordem_verbal', quemOrdenou: 'Cmt Btl' }), base);
    expect(d).toMatchObject({ origem: 'Ordem Verbal', observacao: 'Ordem verbal de Cmt Btl.' });
  });

  test('e-mail sem assunto deixa o resumo para a P/3 escrever', () => {
    expect(demandaDaPendente(pendente({ assunto: '(sem assunto)' }), base).saida).toBe('');
  });
});

describe('lista', () => {
  const lista = [
    pendente({ id: 'a', recebidoEm: '2026-11-10T10:00:00.000Z', assunto: 'Escolta' }),
    pendente({ id: 'b', recebidoEm: '2026-11-13T10:00:00.000Z', tipo: 'sei', numeroSei: '123', assunto: 'Ofício' }),
    pendente({ id: 'c', recebidoEm: '2026-11-11T10:00:00.000Z', tipo: 'ordem_verbal', quemOrdenou: 'Cmt Btl' }),
  ];

  test('mais nova em cima', () => {
    expect(ordenarPendentes(lista).map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  test('busca por assunto, nº SEI, quem ordenou e tipo', () => {
    expect(filtrarPendentes(lista, 'escol').map((p) => p.id)).toEqual(['a']);
    expect(filtrarPendentes(lista, '123').map((p) => p.id)).toEqual(['b']);
    expect(filtrarPendentes(lista, 'cmt').map((p) => p.id)).toEqual(['c']);
    expect(filtrarPendentes(lista, 'ordem verbal').map((p) => p.id)).toEqual(['c']);
    expect(filtrarPendentes(lista, ' ')).toHaveLength(3);
  });

  test('detalhe do cartão', () => {
    expect(detalheDaPendente(pendente({ remetente: 'CPA' }))).toBe('De: CPA');
    expect(detalheDaPendente(lista[1])).toBe('SEI nº 123');
    expect(detalheDaPendente(lista[2])).toBe('Ordem de: Cmt Btl');
    expect(detalheDaPendente(pendente({}))).toBe('');
  });
});
