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
  errosPolicialEscalado,
  errosResposta,
  planejarEdicao,
  planilhaDoEfetivo,
  temErroPolicial,
  type SolicitacaoEfetivo,
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
    expect(categoriaDoPosto('Subten PM')).toBe('subsgt');
    expect(categoriaDoPosto('2º Sgt PM')).toBe('subsgt');
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
    expect(c).toEqual({ cap: 0, ten: 0, subsgt: 1, cbsd: 2, outro: 0 });
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
    // Campo a campo, para a tela marcar cada um de vermelho.
    expect(errosPolicialEscalado(p, ['cpf', 'vtr'])).toEqual({ extras: { cpf: 'Preencha: CPF.', vtr: 'Preencha: VTR (prefixo).' } });
    expect(errosPolicialEscalado({ ...p, posto: ' ', nomeGuerra: '' }, [])).toEqual({
      extras: {},
      posto: 'Informe o posto/graduação.',
      nomeGuerra: 'Informe o nome de guerra.',
    });
    expect(errosPolicialEscalado({ ...p, re: '12', posto: '' }, [])).toEqual({ extras: {}, re: 'Informe o RE.' });
    expect(temErroPolicial(errosPolicialEscalado(p, []))).toBe(false);
    expect(errosResposta([], ' ')).toEqual({
      policiais: 'Adicione pelo menos um policial.',
      nome: 'Informe quem está enviando (posto/graduação e nome).',
    });
    expect(errosResposta([p], 'Sgt X')).toEqual({});
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

describe('editar a solicitação depois de enviada', () => {
  const q = (cap = 0, ten = 0, subsgt = 0, cbsd = 0) => ({ cap, ten, subsgt, cbsd });
  const sol = (unidadeId: SolicitacaoEfetivo['unidadeId'], extra: Partial<SolicitacaoEfetivo> = {}): SolicitacaoEfetivo => ({
    id: `10_${unidadeId}`,
    numero: '10',
    unidadeId,
    saida: 'Op',
    inicio: '2099-12-20',
    termino: '',
    prazo: '2099-12-15',
    quantidades: q(0, 0, 0, 2),
    campos: ['cpf'],
    status: 'enviada',
    policiais: [],
    ...extra,
  });
  const policial = { re: '123456-7', posto: 'Cb PM', nomeGuerra: 'SILVA', telefone: '', extras: { cpf: '1' } };

  test('Cia nova é criada, Cia desmarcada é apagada (avisando se tinha efetivo)', () => {
    const plano = planejarEdicao([sol('1cia'), sol('2cia', { status: 'respondida', policiais: [policial] })], {
      prazo: '2099-12-16',
      campos: ['cpf'],
      quantidades: { '1cia': q(0, 0, 0, 2), ft: q(1) },
    });
    expect(plano.criar).toEqual(['ft']);
    expect(plano.apagar).toEqual([{ id: '10_2cia', unidadeId: '2cia', tinhaEfetivo: true }]);
    expect(plano.atualizar).toEqual([{ id: '10_1cia', unidadeId: '1cia', reabrir: false }]);
  });

  test('Cia que já respondeu só volta a ficar pendente se mudou o que ela precisa mandar', () => {
    const respondida = [sol('3cia', { status: 'respondida', policiais: [policial] })];
    const reabre = (pedido: Parameters<typeof planejarEdicao>[1]) => planejarEdicao(respondida, pedido).atualizar[0].reabrir;
    expect(reabre({ prazo: '2099-12-30', campos: ['cpf'], quantidades: { '3cia': q(0, 0, 0, 2) } })).toBe(false);
    expect(reabre({ prazo: '2099-12-15', campos: [], quantidades: { '3cia': q(0, 0, 0, 2) } })).toBe(false);
    expect(reabre({ prazo: '2099-12-15', campos: ['cpf'], quantidades: { '3cia': q(0, 0, 1, 2) } })).toBe(true);
    expect(reabre({ prazo: '2099-12-15', campos: ['cpf', 'vtr'], quantidades: { '3cia': q(0, 0, 0, 2) } })).toBe(true);
  });

  test('planilha: um policial por linha (Cias em ordem, hierarquia), extras pedidos e resumo por Cia', () => {
    const abas = planilhaDoEfetivo(
      [
        sol('3cia', { status: 'respondida', respondidoPor: 'Sgt Teste', policiais: [policial, { ...policial, re: '2', posto: '1º Sgt PM', nomeGuerra: 'SOUZA' }] }),
        sol('1cia', { prazo: '2000-01-01', quantidades: q(1) }),
      ],
      { campos: ['cpf'] },
      '2026-11-15',
    );
    expect(abas.map((a) => a.nome)).toEqual(['Efetivo', 'Resumo']);
    expect(abas[0].linhas).toEqual([
      ['Cia', 'Posto/Graduação', 'RE', 'Nome de guerra', 'Telefone', 'CPF', 'Enviado por'],
      ['3ª CIA', '1º Sgt PM', '2', 'SOUZA', '', '1', 'Sgt Teste'],
      ['3ª CIA', 'Cb PM', '123456-7', 'SILVA', '', '1', 'Sgt Teste'],
    ]);
    expect(abas[1].linhas).toEqual([
      ['Cia', 'Situação', 'Pedidos', 'Enviados', 'Faltam', 'Enviado por'],
      ['1ª CIA', 'Atrasada', 1, 0, 1, ''],
      ['3ª CIA', 'Respondida', 2, 2, 0, 'Sgt Teste'],
    ]);
  });
});
