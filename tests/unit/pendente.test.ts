import { describe, expect, test } from 'vitest';
import { demandaVazia, validarDemanda } from '../../src/domain/demanda';
import {
  demandaDaPendente,
  detalheDaPendente,
  erroDoPdf,
  filtrarPendentes,
  montarPendenteManual,
  numeroMensagemCpa,
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

  test('e-mail: entrada, origem, resumo e quem mandou no nº da origem (observação fica livre)', () => {
    const d = demandaDaPendente(pendente({ remetente: 'Fulano <fulano@pm>' }), base);
    expect(d).toMatchObject({
      dataEntrada: '2026-11-12',
      origem: 'E-mail',
      numeroOrigem: 'Fulano <fulano@pm>',
      saida: 'Pedido de policiamento',
      observacao: '',
      categoria: 'Outras Demandas',
    });
    expect(validarDemanda(d)).toEqual({});
  });

  test('e-mail do CPA/M-11: nº da mensagem do corpo vai para o nº da origem', () => {
    const d = demandaDaPendente(
      pendente({
        remetente: 'CPAM11 SECOP <cpam11secop@policiamilitar.sp.gov.br>',
        texto: 'Senhor Comandante,\nMENSAGEM Nº CPAM11-1364/30/26, de 12NOV26\nAssunto: Operação',
      }),
      base,
    );
    expect(d.numeroOrigem).toBe('MENSAGEM Nº CPAM11-1364/30/26, de 12NOV26');
    expect(d.observacao).toBe('');
  });

  test('e-mail do CPA/M-11 sem mensagem no corpo: vai quem mandou', () => {
    const d = demandaDaPendente(
      pendente({ remetente: 'cpam11secop@policiamilitar.sp.gov.br', texto: 'Segue anexo.' }),
      base,
    );
    expect(d.numeroOrigem).toBe('cpam11secop@policiamilitar.sp.gov.br');
  });

  test('nº da mensagem do CPA/M-11 aceita variações de escrita', () => {
    expect(numeroMensagemCpa('mensagem n° cpam11-1364/30/26 de 12 nov 26')).toBe('MENSAGEM Nº CPAM11-1364/30/26, de 12NOV26');
    expect(numeroMensagemCpa('MENSAGEM Nº CPAM11-1364/30/26.')).toBe('MENSAGEM Nº CPAM11-1364/30/26');
    expect(numeroMensagemCpa('MENSAGEM No: CPAM11-99/30/26, de 1DEZ26')).toBe('MENSAGEM Nº CPAM11-99/30/26, de 1DEZ26');
    expect(numeroMensagemCpa('*MENSAGEM Nº CPAM11-1364/30/26*, de 12NOV26')).toBe('MENSAGEM Nº CPAM11-1364/30/26, de 12NOV26');
    expect(numeroMensagemCpa('Segue a mensagem anexa.')).toBe('');
  });

  test('e-mail sem remetente nem mensagem: nº da origem fica em branco', () => {
    expect(demandaDaPendente(pendente({}), base).numeroOrigem).toBe('');
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
    expect(d).toMatchObject({ origem: 'Ordem Verbal', quemOrdenou: 'Cmt Btl', observacao: '' });
    expect(validarDemanda(d)).toEqual({});
  });

  test('e-mail sem assunto deixa o resumo para a P/3 escrever', () => {
    expect(demandaDaPendente(pendente({ assunto: '(sem assunto)' }), base).saida).toBe('');
  });
});

describe('PDF da pendente', () => {
  const pdf = (extra: Partial<{ name: string; size: number; type: string }> = {}) => ({ name: 'oficio.pdf', size: 1000, type: 'application/pdf', ...extra });

  test('é opcional; só PDF e até 10 MB', () => {
    expect(erroDoPdf(null)).toBe('');
    expect(erroDoPdf(pdf())).toBe('');
    expect(erroDoPdf(pdf({ type: '' }))).toBe('');
    expect(erroDoPdf(pdf({ name: 'foto.jpg', type: 'image/jpeg' }))).toBe('O arquivo precisa ser PDF.');
    expect(erroDoPdf(pdf({ size: 10 * 1024 * 1024 + 1 }))).toBe('O PDF pode ter no máximo 10 MB.');
  });

  test('a pendente guarda a referência do PDF enviado', () => {
    const agora = new Date('2026-11-17T10:00:00.000Z');
    const arquivo = { id: 'a1', nome: 'oficio.pdf', tamanho: 1000 };
    const sei = { ...pendenteManualVazia('sei', HOJE), texto: 'Ofício 9' };
    expect(montarPendenteManual(sei, agora, arquivo).arquivo).toEqual(arquivo);
    expect(montarPendenteManual(sei, agora)).not.toHaveProperty('arquivo');
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
