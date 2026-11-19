import { describe, expect, test } from 'vitest';
import {
  andar,
  compromissoVazio,
  diasDaSemana,
  fimDaSerie,
  gradeDoMes,
  itensDasDemandas,
  itensDoCfp,
  itensDoDia,
  itensDosCompromissos,
  itensDosPrazos,
  normalizarCompromisso,
  ocorrencias,
  periodoDaVisao,
  posicionarNoDia,
  quandoDoItem,
  SEM_FIM,
  somarMeses,
  tituloDoPeriodo,
  validarCompromisso,
  type Compromisso,
  type DadosCompromisso,
  type ItemAgenda,
} from '../../src/domain/agenda';
import { demandaVazia, type Demanda } from '../../src/domain/demanda';

const HOJE = '2026-11-18'; // quarta-feira

function comp(extra: Partial<Compromisso> = {}): Compromisso {
  return { ...compromissoVazio(HOJE, 9), titulo: 'Reunião', id: 'c1', excecoes: [], criadoPor: 'Sd PM TESTE', ...extra };
}

function demanda(numero: number, extra: Partial<Demanda> = {}): Demanda {
  return { ...demandaVazia(HOJE), saida: `Demanda ${numero}`, id: `d${numero}`, numero, status: 'em_aberto', ...extra };
}

describe('datas da agenda', () => {
  test('semana de domingo a sábado', () => {
    expect(diasDaSemana(HOJE)).toEqual(['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']);
  });

  test('grade do mês cobre o mês inteiro em semanas completas', () => {
    const nov = gradeDoMes(HOJE);
    expect(nov).toHaveLength(5);
    expect(nov[0][0]).toBe('2026-11-01'); // 01/11/2026 é domingo
    expect(nov[4][6]).toBe('2026-12-05');
    const fev = gradeDoMes('2026-02-10'); // 01/02/2026 é domingo e o mês tem 28 dias: 4 semanas
    expect(fev).toHaveLength(4);
    expect(gradeDoMes('2026-08-01')).toHaveLength(6);
  });

  test('período de cada visão', () => {
    expect(periodoDaVisao('dia', HOJE)).toEqual({ de: HOJE, ate: HOJE });
    expect(periodoDaVisao('semana', HOJE)).toEqual({ de: '2026-11-15', ate: '2026-11-21' });
    expect(periodoDaVisao('mes', HOJE)).toEqual({ de: '2026-11-01', ate: '2026-12-05' });
  });

  test('‹ e › andam um dia, uma semana ou um mês (31/01 + 1 mês cai no fim de fevereiro)', () => {
    expect(andar('dia', '2026-12-31', 1)).toBe('2027-01-01');
    expect(andar('semana', HOJE, -1)).toBe('2026-11-11');
    expect(andar('mes', '2026-01-31', 1)).toBe('2026-02-28');
    expect(andar('mes', '2026-01-15', -1)).toBe('2025-12-15');
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29');
  });

  test('título do topo', () => {
    expect(tituloDoPeriodo('mes', HOJE)).toBe('novembro de 2026');
    expect(tituloDoPeriodo('dia', HOJE)).toBe('quarta-feira, 18 de novembro de 2026');
    expect(tituloDoPeriodo('semana', HOJE)).toBe('15 – 21 de nov. de 2026');
    expect(tituloDoPeriodo('semana', '2026-11-30')).toBe('29 de nov. – 5 de dez. de 2026');
    expect(tituloDoPeriodo('semana', '2026-12-31')).toBe('27 de dez. de 2026 – 2 de jan. de 2027');
  });
});

describe('validar evento', () => {
  test('evento novo vem com o dia clicado e 1 hora de duração', () => {
    expect(compromissoVazio(HOJE, 14)).toMatchObject({ data: HOJE, dataFim: HOJE, diaInteiro: false, horaInicio: '14:00', horaFim: '15:00' });
    expect(compromissoVazio(HOJE)).toMatchObject({ diaInteiro: true });
  });

  test('título, data e horas obrigatórios; término depois do início', () => {
    const e = validarCompromisso({ ...compromissoVazio(HOJE, 9), titulo: '  ', horaFim: '08:00' });
    expect(e.titulo).toBe('Informe o título.');
    expect(e.horaFim).toBe('O término tem que ser depois do início.');
    expect(validarCompromisso({ ...compromissoVazio('', 9), titulo: 'x' }).data).toBe('Informe a data.');
    expect(validarCompromisso({ ...compromissoVazio(HOJE, 9), titulo: 'x', horaInicio: '' }).horaInicio).toBeTruthy();
    expect(validarCompromisso({ ...compromissoVazio(HOJE, 9), titulo: 'Ok' })).toEqual({});
  });

  test('dia inteiro de vários dias: fim não pode ser antes do início', () => {
    const base: DadosCompromisso = { ...compromissoVazio(HOJE), titulo: 'Férias' };
    expect(validarCompromisso({ ...base, dataFim: '2026-11-17' }).dataFim).toBe('O fim não pode ser antes do início.');
    expect(validarCompromisso({ ...base, dataFim: '2026-11-25' })).toEqual({});
  });

  test('repetição: "até" depois do início; demanda digitada tem que existir no Numerador', () => {
    const base: DadosCompromisso = { ...compromissoVazio(HOJE, 9), titulo: 'x', repeticao: 'semanal' };
    expect(validarCompromisso({ ...base, repetirAte: '2026-11-01' }).repetirAte).toBe('Tem que ser depois do início.');
    expect(validarCompromisso({ ...base, demandaNumero: 2150, demandaId: '' }).demandaNumero).toBe('Demanda não encontrada no Numerador.');
    expect(validarCompromisso({ ...base, demandaNumero: 2150, demandaId: 'abc' })).toEqual({});
  });

  test('normalizar: evento com hora fica num dia só; dia inteiro não guarda hora; sem repetição não guarda "até"', () => {
    const n = normalizarCompromisso({ ...compromissoVazio(HOJE, 9), titulo: ' A ', dataFim: '2026-11-30', repetirAte: '2026-12-01' });
    expect(n).toMatchObject({ titulo: 'A', dataFim: HOJE, repetirAte: '' });
    expect(normalizarCompromisso({ ...compromissoVazio(HOJE), titulo: 'B' })).toMatchObject({ horaInicio: '', horaFim: '' });
  });

  test('fim da série (para a busca no banco)', () => {
    expect(fimDaSerie({ ...compromissoVazio(HOJE), dataFim: '2026-11-20' })).toBe('2026-11-20');
    expect(fimDaSerie({ ...compromissoVazio(HOJE), repeticao: 'mensal' })).toBe(SEM_FIM);
    expect(fimDaSerie({ ...compromissoVazio(HOJE), repeticao: 'mensal', repetirAte: '2027-06-30' })).toBe('2027-06-30');
  });
});

describe('repetição', () => {
  test('não se repete: só aparece se estiver no período', () => {
    expect(ocorrencias(comp(), '2026-11-15', '2026-11-21')).toEqual([HOJE]);
    expect(ocorrencias(comp(), '2026-11-22', '2026-11-28')).toEqual([]);
  });

  test('diária e semanal, começando perto do período, respeitando o "até" e os dias apagados', () => {
    const diaria = comp({ data: '2025-01-01', dataFim: '2025-01-01', repeticao: 'diaria' });
    expect(ocorrencias(diaria, '2026-11-15', '2026-11-17')).toEqual(['2026-11-15', '2026-11-16', '2026-11-17']);
    const semanal = comp({ repeticao: 'semanal', repetirAte: '2026-12-09', excecoes: ['2026-12-02'] });
    expect(ocorrencias(semanal, '2026-11-01', '2026-12-31')).toEqual(['2026-11-18', '2026-11-25', '2026-12-09']);
  });

  test('mensal pula o mês sem o dia (31) e anual pula o 29/02 fora do bissexto', () => {
    const mensal = comp({ data: '2026-01-31', dataFim: '2026-01-31', repeticao: 'mensal' });
    expect(ocorrencias(mensal, '2026-01-01', '2026-05-31')).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
    const anual = comp({ data: '2024-02-29', dataFim: '2024-02-29', repeticao: 'anual' });
    expect(ocorrencias(anual, '2025-01-01', '2028-12-31')).toEqual(['2028-02-29']);
  });

  test('evento de vários dias que começou antes do período aparece', () => {
    const longo = comp({ diaInteiro: true, data: '2026-11-13', dataFim: '2026-11-16' });
    expect(ocorrencias(longo, '2026-11-15', '2026-11-21')).toEqual(['2026-11-13']);
    const semanalLongo = comp({ diaInteiro: true, data: '2026-11-06', dataFim: '2026-11-08', repeticao: 'semanal' });
    expect(ocorrencias(semanalLongo, '2026-11-15', '2026-11-21')).toEqual(['2026-11-13', '2026-11-20']);
  });

  test('cada vez vira um item com a mesma duração', () => {
    const itens = itensDosCompromissos([comp({ diaInteiro: true, dataFim: '2026-11-19', repeticao: 'semanal' })], '2026-11-15', '2026-11-28');
    expect(itens.map((i) => [i.inicio, i.fim])).toEqual([
      ['2026-11-18', '2026-11-19'],
      ['2026-11-25', '2026-11-26'],
    ]);
    expect(itens[0]).toMatchObject({ camada: 'compromisso', ocorrencia: '2026-11-18', titulo: 'Reunião' });
  });
});

describe('integração com o Numerador', () => {
  test('Prazo CPA, Prazo Cia e Início/Término Btl viram eventos de dia inteiro com link para a demanda', () => {
    const d = demanda(2151, { prazoCPA: '2026-11-20', prazoCia: '2026-11-19', inicioBtl: '2026-11-21', terminoBtl: '2026-11-23' });
    const itens = itensDasDemandas([d], '2026-11-15', '2026-11-21');
    expect(itens.map((i) => [i.camada, i.inicio, i.fim])).toEqual([
      ['prazoCPA', '2026-11-20', '2026-11-20'],
      ['prazoCia', '2026-11-19', '2026-11-19'],
      ['periodo', '2026-11-21', '2026-11-23'],
    ]);
    expect(itens[0]).toMatchObject({ titulo: 'Prazo CPA · Nº 2151 — Demanda 2151', demandaId: 'd2151', diaInteiro: true, concluido: false });
  });

  test('fora do período não entra; excluída nunca entra; concluída aparece riscada; sem término = 1 dia', () => {
    const fora = demanda(1, { prazoCPA: '2026-12-25' });
    const excluida = demanda(2, { prazoCPA: HOJE, status: 'excluido' });
    const concluida = demanda(3, { prazoCia: HOJE, status: 'concluido' });
    const soInicio = demanda(4, { inicioBtl: HOJE });
    const itens = itensDasDemandas([fora, excluida, concluida, soInicio], '2026-11-15', '2026-11-21');
    expect(itens.map((i) => i.chave)).toEqual(['cia-d3', 'btl-d4']);
    expect(itens[0].concluido).toBe(true);
    expect(itens[1]).toMatchObject({ inicio: HOJE, fim: HOJE });
  });

  test('operação que começou antes e ainda está correndo aparece; número do documento (2027) no título', () => {
    const d = demanda(5, { inicioBtl: '2026-10-01', terminoBtl: '2026-11-30', numeroDocumento: 'OFÍCIO 8BPMM-001/03/27' });
    const [item] = itensDasDemandas([d], '2026-11-15', '2026-11-21');
    expect(item.titulo).toBe('OFÍCIO 8BPMM-001/03/27 — Demanda 5');
  });

  test('agenda do CFP', () => {
    const itens = itensDoCfp(
      [
        { id: 'e1', titulo: 'Operação Natal', inicio: '2026-11-20', fim: '2026-11-22', pastaUrl: 'https://drive/x', numero: 2100 },
        { id: 'e2', titulo: 'Antiga', inicio: '2026-10-01', fim: '2026-10-01', pastaUrl: '', numero: 0 },
      ],
      '2026-11-15',
      '2026-11-21',
    );
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ camada: 'cfp', titulo: 'CFP · Operação Natal', pastaUrl: 'https://drive/x', demandaNumero: 'Nº 2100' });
  });
});

describe('na tela', () => {
  const item = (chave: string, extra: Partial<ItemAgenda>): ItemAgenda => ({
    chave,
    camada: 'compromisso',
    titulo: chave,
    inicio: HOJE,
    fim: HOJE,
    diaInteiro: false,
    horaInicio: '09:00',
    horaFim: '10:00',
    cor: 'azul',
    ...extra,
  });

  test('itens do dia: dia inteiro primeiro (o mais longo antes), depois pela hora', () => {
    const lista = [
      item('tarde', { horaInicio: '14:00', horaFim: '15:00' }),
      item('manha', {}),
      item('prazo', { diaInteiro: true, horaInicio: '', horaFim: '' }),
      item('semana', { diaInteiro: true, inicio: '2026-11-16', fim: '2026-11-20' }),
      item('ontem', { inicio: '2026-11-17', fim: '2026-11-17' }),
    ];
    expect(itensDoDia(lista, HOJE).map((i) => i.chave)).toEqual(['semana', 'prazo', 'manha', 'tarde']);
  });

  test('eventos que se sobrepõem ficam lado a lado; os que não, ocupam a largura toda', () => {
    const p = posicionarNoDia([
      item('a', { horaInicio: '09:00', horaFim: '11:00' }),
      item('b', { horaInicio: '10:00', horaFim: '10:30' }),
      item('c', { horaInicio: '10:45', horaFim: '11:30' }),
      item('d', { horaInicio: '13:00', horaFim: '14:00' }),
      item('inteiro', { diaInteiro: true }),
    ]);
    const por = Object.fromEntries(p.map((x) => [x.item.chave, x]));
    expect(Object.keys(por)).toHaveLength(4);
    expect([por.a.coluna, por.b.coluna, por.c.coluna]).toEqual([0, 1, 1]);
    expect([por.a.colunas, por.b.colunas, por.c.colunas]).toEqual([2, 2, 2]);
    expect(por.d).toMatchObject({ coluna: 0, colunas: 1, topo: 13 * 60, altura: 60 });
  });

  test('texto do horário', () => {
    expect(quandoDoItem(item('x', {}))).toBe('09:00 – 10:00');
    expect(quandoDoItem(item('x', { diaInteiro: true }))).toBe('Dia inteiro');
    expect(quandoDoItem(item('x', { diaInteiro: true, fim: '2026-11-20' }))).toBe('18/11 – 20/11');
  });
});

describe('prazos da P/3 na agenda das Cias', () => {
  test('viram eventos de dia inteiro, só os do período, com o link da tela', () => {
    const itens = itensDosPrazos(
      [
        { chave: 'enc-1', titulo: 'Prazo · 12/2026', data: '2026-11-20', concluido: false, href: '#/enc/1', rotuloLink: 'Abrir demanda' },
        { chave: 'eap-1', titulo: 'EAP', data: '2026-11-25', concluido: true },
        { chave: 'fora', titulo: 'Longe', data: '2027-01-10', concluido: false },
        { chave: 'sem', titulo: 'Sem data', data: '', concluido: false },
      ],
      '2026-11-15',
      '2026-11-30',
    );
    expect(itens.map((i) => i.chave)).toEqual(['p3-enc-1', 'p3-eap-1']);
    expect(itens[0]).toMatchObject({ camada: 'prazoP3', diaInteiro: true, inicio: '2026-11-20', fim: '2026-11-20', href: '#/enc/1', concluido: false });
    expect(itens[1].concluido).toBe(true);
  });
});
