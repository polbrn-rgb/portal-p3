import { describe, expect, test } from 'vitest';
import { formatarData, hojeISO } from '../../src/domain/datas';
import {
  camposAlterados,
  dadosDe,
  demandaVazia,
  normalizarDemanda,
  validarDemanda,
  type DadosDemanda,
  type Demanda,
} from '../../src/domain/demanda';
import { CATEGORIAS, ORIGENS, RESPONSAVEIS, TIPOS_SAIDA } from '../../src/domain/listas';
import { filtrarDemandas, situacaoDaDemanda } from '../../src/domain/situacao';

const HOJE = '2026-11-13';

function valida(extra: Partial<DadosDemanda> = {}): DadosDemanda {
  return { ...demandaVazia(HOJE), saida: 'Pedido de policiamento', categoria: 'Pedidos de Policiamento', ...extra };
}

function demanda(numero: number, extra: Partial<Demanda> = {}): Demanda {
  return { ...valida(), id: String(numero), numero, status: 'em_aberto', ...extra };
}

describe('listas do numerador', () => {
  test('nenhuma lista tem opção repetida', () => {
    for (const lista of [ORIGENS, TIPOS_SAIDA, CATEGORIAS, RESPONSAVEIS]) {
      expect(new Set(lista).size).toBe(lista.length);
    }
  });
});

describe('datas', () => {
  test('hoje no formato AAAA-MM-DD e exibição dd/mm/aaaa', () => {
    expect(hojeISO(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatarData('2026-11-13')).toBe('13/11/2026');
    expect(formatarData('')).toBe('');
  });
});

describe('validarDemanda', () => {
  test('demanda mínima válida não tem erros', () => {
    expect(validarDemanda(valida())).toEqual({});
  });

  test('assunto e categoria são obrigatórios', () => {
    const erros = validarDemanda(demandaVazia(HOJE));
    expect(erros.saida).toBe('Informe a saída (assunto).');
    expect(erros.categoria).toBe('Escolha a categoria.');
  });

  test('origem SEI exige o número do processo', () => {
    expect(validarDemanda(valida({ origem: 'SEI' })).numeroOrigem).toBe('Informe o número do processo SEI.');
    expect(validarDemanda(valida({ origem: 'SEI', numeroOrigem: '006.00001/2026' })).numeroOrigem).toBeUndefined();
  });

  test('prazo da Cia não pode passar do prazo do CPA', () => {
    const erros = validarDemanda(valida({ prazoCPA: '2026-11-20', prazoCia: '2026-11-21' }));
    expect(erros.prazoCia).toContain('depois do prazo do CPA');
    expect(validarDemanda(valida({ prazoCPA: '2026-11-20', prazoCia: '2026-11-20' }))).toEqual({});
  });

  test('término do Btl não pode ser antes do início', () => {
    expect(validarDemanda(valida({ inicioBtl: '2026-11-20', terminoBtl: '2026-11-19' })).terminoBtl).toBeDefined();
  });

  test('datas e link em formato errado', () => {
    const erros = validarDemanda(valida({ prazoCPA: '20/11/2026', linkEvento: 'drive.google.com' }));
    expect(erros.prazoCPA).toBe('Data inválida.');
    expect(erros.linkEvento).toContain('http');
  });
});

describe('normalizarDemanda', () => {
  test('tira espaços das pontas', () => {
    expect(normalizarDemanda(valida({ saida: '  Escolta  ', numeroOrigem: ' 123 ' }))).toMatchObject({
      saida: 'Escolta',
      numeroOrigem: '123',
    });
  });

  test('destinos sem repetidos e na ordem oficial', () => {
    expect(normalizarDemanda(valida({ destinos: ['p2', 'ft', '1cia', 'ft'] })).destinos).toEqual(['1cia', 'ft', 'p2']);
  });

  test('TODAS absorve as Cias mas mantém os destinos só de registro', () => {
    expect(normalizarDemanda(valida({ destinos: ['3cia', 'TODAS', 'p1'] })).destinos).toEqual(['TODAS', 'p1']);
  });
});

describe('camposAlterados e dadosDe', () => {
  test('lista só o que mudou, inclusive nos destinos', () => {
    const antes = valida({ destinos: ['1cia'] });
    const depois = { ...antes, saida: 'Outro assunto', destinos: ['1cia', '2cia'] as DadosDemanda['destinos'] };
    expect(camposAlterados(antes, depois)).toEqual(['saida', 'destinos']);
    expect(camposAlterados(antes, { ...antes })).toEqual([]);
  });

  test('dadosDe tira id, número e status e completa campos que faltarem', () => {
    const d = demanda(7) as Partial<Demanda>;
    delete d.linkEvento;
    const dados = dadosDe(d as Demanda);
    expect(dados).not.toHaveProperty('numero');
    expect(dados.linkEvento).toBe('');
  });
});

describe('situacaoDaDemanda', () => {
  const s = (extra: Partial<Demanda>) => situacaoDaDemanda(demanda(1, extra), HOJE);

  test('concluída vence qualquer prazo', () => {
    expect(s({ status: 'concluido', prazoCPA: '2026-01-01' })).toBe('concluido');
  });
  test('prazo do CPA vencido = Atrasado', () => {
    expect(s({ prazoCPA: '2026-11-12' })).toBe('atrasado');
  });
  test('prazo do CPA hoje = Vence Hoje, mesmo com Cia atrasada', () => {
    expect(s({ prazoCPA: HOJE, prazoCia: '2026-11-10' })).toBe('vence_hoje');
  });
  test('só o prazo da Cia vencido = Cia Atrasada', () => {
    expect(s({ prazoCPA: '2026-11-20', prazoCia: '2026-11-12' })).toBe('cia_atrasada');
  });
  test('sem prazo vencido = Em aberto', () => {
    expect(s({})).toBe('em_aberto');
    expect(s({ prazoCPA: '2026-11-20', prazoCia: HOJE })).toBe('em_aberto');
  });
});

describe('filtrarDemandas', () => {
  const lista = [
    demanda(2101, { saida: 'Reintegração de posse', destinos: ['5cia'], responsavel: 'Sgt Sousa' }),
    demanda(2102, { saida: 'Escolta de preso', prazoCPA: '2026-11-01' }),
    demanda(2103, { saida: 'Operação Natal', destinos: ['TODAS'] }),
  ];
  const numeros = (r: Demanda[]) => r.map((d) => d.numero);

  test('busca por número, assunto sem acento, Cia e responsável', () => {
    expect(numeros(filtrarDemandas(lista, '2102', 'todas', HOJE))).toEqual([2102]);
    expect(numeros(filtrarDemandas(lista, 'reintegracao', 'todas', HOJE))).toEqual([2101]);
    expect(numeros(filtrarDemandas(lista, '5ª cia', 'todas', HOJE))).toEqual([2101]);
    expect(numeros(filtrarDemandas(lista, 'sousa', 'todas', HOJE))).toEqual([2101]);
  });

  test('filtro por situação e busca vazia', () => {
    expect(numeros(filtrarDemandas(lista, '', 'atrasado', HOJE))).toEqual([2102]);
    expect(numeros(filtrarDemandas(lista, '  ', 'todas', HOJE))).toEqual([2101, 2102, 2103]);
  });
});
