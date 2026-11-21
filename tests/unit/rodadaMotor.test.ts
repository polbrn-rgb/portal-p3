import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, test } from 'vitest';

// Carrega Logica.gs + Motor.gs como estão e troca os serviços do Google e as etapas por versões de teste.
type Ctx = Record<string, unknown> & {
  processarPendentes: () => void;
  doPost: (e: { parameter: Record<string, string> }) => unknown;
};

function montar(agora = { valor: Date.parse('2026-11-21T12:00:00Z') }) {
  const props = new Map<string, string>();
  const cache = new Map<string, string>();
  const chamadas: string[] = [];
  const ctx: Ctx = {} as Ctx;
  const DateReal = Date;
  // Relógio controlado pelo teste.
  class DataFalsa extends DateReal {
    constructor(...a: unknown[]) {
      if (a.length) super(...(a as [string]));
      else super(agora.valor);
    }
    static now() {
      return agora.valor;
    }
  }
  Object.assign(ctx, {
    Date: DataFalsa,
    console: { error: (m: string) => chamadas.push('erro:' + m), info: () => undefined, log: () => undefined },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => props.get(k) ?? null,
        setProperty: (k: string, v: string) => props.set(k, v),
        setProperties: (o: Record<string, string>) => Object.entries(o).forEach(([k, v]) => props.set(k, v)),
      }),
    },
    CacheService: {
      getScriptCache: () => ({ get: (k: string) => cache.get(k) ?? null, put: (k: string, v: string) => cache.set(k, v) }),
    },
    Utilities: { formatDate: (d: Date) => d.toISOString().slice(0, 13).replace(/\D/g, '') },
    ContentService: { createTextOutput: (t: string) => t },
  });
  runInNewContext(readFileSync('apps-script/Logica.gs', 'utf8') + '\n' + readFileSync('apps-script/Motor.gs', 'utf8'), ctx);
  const etapas = [
    'importarEmails_', 'processarPlanilhas_', 'gravarResultados_', 'sincronizarAgendaCfp_', 'sincronizarControleOperacoes_',
    'processarEap_', 'processarRelatorios_', 'processarDocsMensais_', 'processarIcc_', 'levarEfetivoManual_', 'processarEmails_',
    'processarAcessos_', 'processarRac_', 'processarBackupBanco_', 'pedirTrocaDeSenha_', 'limparEncaminhamentosOrfaos_', 'apagarFotosVencidas_',
  ];
  for (const nome of etapas) ctx[nome] = () => chamadas.push(nome);
  let fila: { nome: string; dados: Record<string, unknown> }[] = [];
  ctx.consultarPendentes_ = () => fila;
  ctx.processarDemanda_ = (p: { nome: string }) => {
    chamadas.push('demanda:' + p.nome);
    fila = fila.filter((x) => x.nome !== p.nome);
  };
  return {
    ctx,
    props,
    chamadas,
    agora,
    porFila: (nomes: string[]) => (fila = nomes.map((nome) => ({ nome, dados: {} }))),
    limpar: () => (chamadas.length = 0),
  };
}

const MIN = 60 * 1000;
const rodar = () => m.ctx.rodarMotor_ as (espera: number, opcoes: unknown) => void;
let m: ReturnType<typeof montar>;
beforeEach(() => {
  m = montar();
});

describe('rodada do motor', () => {
  test('gatilho: roda todas as etapas; a primeira vez também lê agenda do CFP e aba Operações', () => {
    m.ctx.processarPendentes();
    expect(m.chamadas).toContain('importarEmails_');
    expect(m.chamadas).toContain('processarBackupBanco_');
    expect(m.chamadas).toContain('limparEncaminhamentosOrfaos_');
    expect(m.chamadas.filter((c) => c.startsWith('erro:'))).toEqual([]);
    expect(m.chamadas).toContain('sincronizarAgendaCfp_');
    expect(m.chamadas).toContain('sincronizarControleOperacoes_');
  });

  test('gatilho seguinte, sem nada novo: não relê agenda do CFP nem aba Operações antes de 15 minutos', () => {
    m.ctx.processarPendentes();
    m.limpar();
    m.agora.valor += 5 * MIN;
    m.ctx.processarPendentes();
    expect(m.chamadas).toContain('importarEmails_');
    expect(m.chamadas).not.toContain('sincronizarAgendaCfp_');
    expect(m.chamadas).not.toContain('sincronizarControleOperacoes_');
    m.limpar();
    m.agora.valor += 10 * MIN;
    m.ctx.processarPendentes();
    expect(m.chamadas).toContain('sincronizarAgendaCfp_');
  });

  test('demanda processada ou pedido do portal relê a agenda do CFP na hora', () => {
    m.ctx.processarPendentes();
    m.limpar();
    m.agora.valor += MIN;
    m.porFila(['demandas/2151']);
    m.ctx.processarPendentes();
    expect(m.chamadas).toContain('demanda:demandas/2151');
    expect(m.chamadas).toContain('sincronizarAgendaCfp_');
    m.limpar();
    m.agora.valor += MIN;
    m.ctx.doPost({ parameter: {} });
    expect(m.chamadas).toContain('sincronizarAgendaCfp_');
  });

  test('erro numa etapa não impede as outras', () => {
    m.ctx.processarEap_ = () => {
      throw new Error('planilha sumiu');
    };
    m.ctx.processarPendentes();
    expect(m.chamadas).toContain('erro:EAP: planilha sumiu');
    expect(m.chamadas).toContain('processarBackupBanco_');
  });

  test('pedido do portal que esperou a vez não roda de novo se outra rodada começou depois dele', () => {
    const pedidoEm = m.agora.valor;
    m.agora.valor += 1000; // outra rodada começou 1 s depois do pedido
    m.ctx.processarPendentes();
    m.limpar();
    rodar()(25000, { origem: 'portal', pedidoEm });
    expect(m.chamadas).toEqual([]);
    // Pedido depois do começo da última rodada: roda.
    rodar()(25000, { origem: 'portal', pedidoEm: m.agora.valor + 1 });
    expect(m.chamadas).toContain('importarEmails_');
  });

  test('registra o tempo do dia e da última rodada para o diagnóstico', () => {
    m.ctx.processarPendentes();
    m.ctx.doPost({ parameter: {} });
    const dia = JSON.parse(m.props.get('TEMPO_DO_DIA')!);
    expect(dia).toMatchObject({ rodadas: 2, portal: 1 });
    expect(JSON.parse(m.props.get('ULTIMA_RODADA')!)).toMatchObject({ origem: 'portal' });
  });

  test('a URL pública tem limite de rodadas e de pedidos de senha por hora', () => {
    for (let i = 0; i < 130; i++) {
      m.agora.valor += 10; // cada pedido depois do começo da rodada anterior
      m.ctx.doPost({ parameter: {} });
    }
    expect(JSON.parse(m.props.get('TEMPO_DO_DIA')!).portal).toBe(120);
    for (let i = 0; i < 40; i++) m.ctx.doPost({ parameter: { acao: 'senha', re: String(1000000 + i) } });
    expect(m.chamadas.filter((c) => c === 'pedirTrocaDeSenha_')).toHaveLength(30);
  });
});

describe('fotos com mais de 15 dias', () => {
  function comFirestore(m: ReturnType<typeof montar>, porColecao: Record<string, string[]>) {
    const pedidos: { metodo: string; caminho: string; corpo?: { structuredQuery?: { from: { collectionId: string }[]; where: unknown } } }[] = [];
    m.ctx.firestore_ = (metodo: string, caminho: string, corpo?: (typeof pedidos)[number]['corpo']) => {
      pedidos.push({ metodo, caminho, corpo });
      if (metodo === 'post') {
        const col = corpo!.structuredQuery!.from[0].collectionId;
        return { status: 200, json: (porColecao[col] ?? []).map((id) => ({ document: { name: `projects/p/databases/(default)/documents/${col}/${id}` } })) };
      }
      return { status: 200, json: {} };
    };
    return pedidos;
  }

  function motorReal() {
    // Recarrega o Motor.gs para ter a função de verdade (montar() troca as etapas por versões de teste).
    const r = montar();
    runInNewContext(readFileSync('apps-script/Motor.gs', 'utf8'), r.ctx);
    return r;
  }

  test('antes de 15 dias da regra começar, nada é apagado (as fotos antigas ganham o prazo inteiro)', () => {
    const r = motorReal();
    r.agora.valor = Date.parse('2026-12-06T12:00:00Z'); // 14 dias e meio depois de 22/11
    const pedidos = comFirestore(r, { fotosCgp: ['a'] });
    expect((r.ctx.apagarFotosVencidas_ as (f: boolean) => number)(true)).toBe(0);
    expect(pedidos).toEqual([]);
  });

  test('depois: apaga foto e resumo das 3 coleções, a foto primeiro; no máximo 1 vez por hora', () => {
    const r = motorReal();
    r.agora.valor = Date.parse('2026-12-20T12:00:00Z');
    const pedidos = comFirestore(r, { fotosCgp: ['a'], fotosTds: ['2026-12_123456_1'], fotosEncaminhadas: ['b'] });
    const apagar = r.ctx.apagarFotosVencidas_ as (f?: boolean) => number;
    expect(apagar()).toBe(3);
    const consultas = pedidos.filter((p) => p.metodo === 'post').map((p) => p.corpo!.structuredQuery!.where);
    expect(consultas).toContainEqual({
      fieldFilter: { field: { fieldPath: 'enviadoEm' }, op: 'LESS_THAN', value: { timestampValue: '2026-12-05T12:00:00.000Z' } },
    });
    expect(consultas).toContainEqual({
      fieldFilter: { field: { fieldPath: 'encaminhadaEm' }, op: 'LESS_THAN', value: { timestampValue: '2026-12-05T12:00:00.000Z' } },
    });
    const apagados = pedidos.filter((p) => p.metodo === 'delete').map((p) => p.caminho.split('/documents/')[1]);
    expect(apagados).toEqual([
      'fotosCgpDados/a', 'fotosCgp/a',
      'fotosTdsDados/2026-12_123456_1', 'fotosTds/2026-12_123456_1',
      'fotosEncaminhadasDados/b', 'fotosEncaminhadas/b',
    ]);
    pedidos.length = 0;
    r.agora.valor += 30 * MIN;
    expect(apagar()).toBe(0);
    expect(pedidos).toEqual([]);
  });
});
