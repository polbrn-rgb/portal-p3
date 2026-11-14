import { describe, expect, test } from 'vitest';
import {
  categoriaDoPosto,
  ciasDoPedido,
  contarPorPosto,
  normalizarRE,
  quantidadesVazias,
  situacaoSolicitacao,
  totalDe,
  validarPedido,
  validarPolicialEscalado,
  validarResposta,
  type PolicialEscalado,
} from '../../src/domain/efetivo';
import { diasMudaram, gruposDeCampos, operacoesDoDia, valoresPreenchidos } from '../../src/domain/resultado';

describe('efetivo', () => {
  test('RE com ou sem dígito vira a mesma chave', () => {
    expect(normalizarRE('123456-7')).toBe('123456');
    expect(normalizarRE('1234567')).toBe('123456');
    expect(normalizarRE(' 123456 ')).toBe('123456');
    expect(normalizarRE('123456-A')).toBe('123456');
    expect(normalizarRE('')).toBe('');
  });

  test('posto/graduação na categoria da solicitação', () => {
    expect(categoriaDoPosto('Cap PM')).toBe('cap');
    expect(categoriaDoPosto('1º Ten PM')).toBe('ten');
    expect(categoriaDoPosto('Asp Of PM')).toBe('ten');
    expect(categoriaDoPosto('Subten PM')).toBe('subten');
    expect(categoriaDoPosto('2º Sgt PM')).toBe('sgt');
    expect(categoriaDoPosto('Cb PM')).toBe('cbsd');
    expect(categoriaDoPosto('Sd PM')).toBe('cbsd');
    expect(categoriaDoPosto('Ten Cel PM')).toBe('outro');
    expect(categoriaDoPosto('Maj PM')).toBe('outro');
  });

  test('conta os escalados por posto', () => {
    const c = contarPorPosto([
      { re: '1', posto: 'Cb PM', nomeGuerra: 'a', telefone: '' },
      { re: '2', posto: 'Sd PM', nomeGuerra: 'b', telefone: '' },
      { re: '3', posto: '1º Sgt PM', nomeGuerra: 'c', telefone: '' },
    ]);
    expect(c).toEqual({ cap: 0, ten: 0, subten: 0, sgt: 1, cbsd: 2, outro: 0 });
  });

  test('pedido precisa de prazo e de pelo menos uma Cia com policial', () => {
    const vazio = { prazo: '', campos: [], quantidades: {} };
    expect(validarPedido(vazio)).toEqual({
      prazo: 'Informe o prazo para as Cias preencherem.',
      quantidades: 'Informe quantos policiais pelo menos uma Cia deve mandar.',
    });
    const ok = {
      prazo: '2026-11-20',
      campos: [],
      quantidades: { '1cia': { ...quantidadesVazias(), cbsd: 4 }, '2cia': quantidadesVazias() },
    };
    expect(validarPedido(ok)).toEqual({});
    expect(ciasDoPedido(ok)).toEqual(['1cia']);
    expect(totalDe(ok.quantidades['1cia'])).toBe(4);
  });

  test('policial escalado: RE, posto, nome e os campos extras pedidos', () => {
    const p: PolicialEscalado = { re: '123456-7', posto: 'Cb PM', nomeGuerra: 'Silva', telefone: '', extras: {} };
    expect(validarPolicialEscalado(p, [])).toBe('');
    expect(validarPolicialEscalado(p, ['cpf', 'vtr'])).toBe('Preencha: CPF, VTR (prefixo).');
    expect(validarPolicialEscalado({ ...p, extras: { cpf: '1', vtr: 'M-08' } }, ['cpf', 'vtr'])).toBe('');
    expect(validarPolicialEscalado({ ...p, re: '12' }, [])).toBe('Informe o RE.');
    expect(validarResposta([], 'Sgt X')).toBe('Adicione pelo menos um policial.');
    expect(validarResposta([p], ' ')).toBe('Informe quem está enviando (posto/graduação e nome).');
  });

  test('situação da solicitação', () => {
    expect(situacaoSolicitacao({ status: 'enviada', prazo: '2026-11-20' }, '2026-11-21')).toBe('atrasada');
    expect(situacaoSolicitacao({ status: 'enviada', prazo: '2026-11-20' }, '2026-11-20')).toBe('aguardando');
    expect(situacaoSolicitacao({ status: 'respondida', prazo: '2026-11-01' }, '2026-11-21')).toBe('respondida');
  });
});

describe('planilha de resultados', () => {
  const campos = [
    { linha: 9, rotulo: 'Pessoas Abordadas', grupo: 'OCOR. COMUNS' },
    { linha: 10, rotulo: 'Estabelecimentos Vistoriados', grupo: 'OCOR. COMUNS' },
    { linha: 16, rotulo: 'Ato Infracional', grupo: 'FLAG./PESSOAS' },
  ];

  test('agrupa os indicadores como na planilha', () => {
    expect(gruposDeCampos(campos).map((g) => [g.grupo, g.campos.length])).toEqual([
      ['OCOR. COMUNS', 2],
      ['FLAG./PESSOAS', 1],
    ]);
  });

  test('valores: em branco não vai, vírgula vira ponto, texto é recusado', () => {
    expect(valoresPreenchidos({ '9': '3', '10': '', '24': '0,5' })).toEqual({ valores: { '9': 3, '24': 0.5 }, erro: '' });
    expect(valoresPreenchidos({ '9': 'abc' }).erro).toBe('Use só números (sem sinal negativo).');
    expect(valoresPreenchidos({ '9': '-1' }).erro).toBe('Use só números (sem sinal negativo).');
  });

  test('operações do dia e aviso de datas mudadas', () => {
    const lista = [
      { n: 1, planilha: { status: 'pronta' as const, dias: ['2026-11-20', '2026-11-21'] } },
      { n: 2, planilha: { status: 'pedida' as const } },
    ];
    expect(operacoesDoDia(lista, '2026-11-21').map((o) => o.n)).toEqual([1]);
    expect(diasMudaram(lista[0].planilha, ['2026-11-20', '2026-11-21'])).toBe(false);
    expect(diasMudaram(lista[0].planilha, ['2026-11-20'])).toBe(true);
    expect(diasMudaram(lista[1].planilha, ['2026-11-20'])).toBe(false);
  });
});
