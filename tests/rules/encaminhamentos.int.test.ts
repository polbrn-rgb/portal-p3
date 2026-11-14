import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, getDocs, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { alterarStatus, atualizarDemanda, criarDemanda, encaminhamentosDaDemanda, obterDemanda } from '../../src/data/demandas';
import {
  aceitarResposta,
  devolverResposta,
  marcarEmAndamento,
  marcarVisualizado,
  observarDaUnidade,
  responder,
} from '../../src/data/encaminhamentos';
import { dadosDe, demandaVazia, type DadosDemanda } from '../../src/domain/demanda';
import type { Encaminhamento, StatusEnc } from '../../src/domain/encaminhamento';

// Fluxo real P/3 -> Cia -> P/3 no emulador, com as regras de segurança ligadas.
let env: RulesTestEnvironment;
let p3: Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-portal-p3',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  p3 = env.authenticatedContext('conta-p3', { perfil: 'p3' }).firestore() as unknown as Firestore;
});

const cia = (unidade: string) =>
  env.authenticatedContext(`conta-${unidade}`, { perfil: 'unidade', unidade }).firestore() as unknown as Firestore;

function dados(destinos: DadosDemanda['destinos'], extra: Partial<DadosDemanda> = {}): DadosDemanda {
  return { ...demandaVazia('2026-11-13'), saida: 'Escolta', categoria: 'Escoltas', prazoCPA: '2026-11-20', destinos, ...extra };
}

async function statusPorUnidade(id: string): Promise<Record<string, StatusEnc>> {
  const encs = await encaminhamentosDaDemanda(p3, id);
  return Object.fromEntries(encs.map((e) => [e.unidadeId, e.status]));
}

/** Lista da Cia como a tela dela vê (mesma consulta da tela). */
function listaDaCia(unidade: '1cia' | '2cia' | '3cia'): Promise<Encaminhamento[]> {
  return new Promise((ok, erro) => {
    const parar = observarDaUnidade(cia(unidade), unidade, (lista) => {
      parar();
      ok(lista);
    }, erro);
  });
}

describe('encaminhamento automático', () => {
  test('ao criar, cada Cia marcada recebe o seu; registro e TODAS tratados', async () => {
    const n1 = await criarDemanda(p3, dados(['1cia', 'ft', 'p2']));
    expect(await statusPorUnidade(String(n1))).toEqual({ '1cia': 'novo', ft: 'novo' });

    const n2 = await criarDemanda(p3, dados(['TODAS']));
    expect(Object.keys(await statusPorUnidade(String(n2)))).toHaveLength(7);
  });

  test('o encaminhamento leva o resumo, com o prazo do CPA quando não há prazo da Cia', async () => {
    const n = await criarDemanda(p3, dados(['2cia'], { numeroOrigem: '006.0001/2026' }));
    const [e] = await listaDaCia('2cia');
    expect(e).toMatchObject({ numero: n, saida: 'Escolta', prazoCia: '2026-11-20', numeroOrigem: '006.0001/2026', status: 'novo' });
  });

  test('editar destinos cancela, cria e reativa; editar assunto chega na Cia', async () => {
    const id = String(await criarDemanda(p3, dados(['1cia', '2cia'])));
    let antes = dadosDe((await obterDemanda(p3, id))!);

    await atualizarDemanda(p3, id, antes, { ...antes, destinos: ['2cia', '3cia'], saida: 'Escolta remarcada' });
    expect(await statusPorUnidade(id)).toEqual({ '1cia': 'cancelado', '2cia': 'novo', '3cia': 'novo' });
    expect((await listaDaCia('3cia'))[0].saida).toBe('Escolta remarcada');

    antes = dadosDe((await obterDemanda(p3, id))!);
    await atualizarDemanda(p3, id, antes, { ...antes, destinos: ['1cia', '2cia', '3cia'] });
    expect((await statusPorUnidade(id))['1cia']).toBe('novo');
  });

  test('cada Cia só enxerga o que é dela', async () => {
    await criarDemanda(p3, dados(['1cia']));
    await criarDemanda(p3, dados(['2cia']));
    expect((await listaDaCia('1cia')).map((e) => e.unidadeId)).toEqual(['1cia']);
    expect(await listaDaCia('3cia')).toEqual([]);
  });
});

describe('resposta da Cia e decisão da P/3', () => {
  test('Cia vê, trabalha e responde; P/3 devolve; Cia corrige; P/3 aceita', async () => {
    const id = String(await criarDemanda(p3, dados(['1cia'])));
    const db1 = cia('1cia');

    let [e] = await listaDaCia('1cia');
    await marcarVisualizado(db1, e);
    await marcarEmAndamento(db1, { ...e, status: 'visualizado' });
    await responder(db1, e, '  Policiamento realizado.  ', 'Sd Silva');

    [e] = await listaDaCia('1cia');
    expect(e).toMatchObject({ status: 'respondido', resposta: 'Policiamento realizado.', respondidoPor: 'Sd Silva' });

    await aceitarResposta(p3, e);
    expect((await obterDemanda(p3, id))?.ciasAceitas).toEqual(['1cia']);
    await devolverResposta(p3, e, 'Falta o efetivo empregado.');
    expect((await obterDemanda(p3, id))?.ciasAceitas).toEqual([]);
    [e] = await listaDaCia('1cia');
    expect(e).toMatchObject({ status: 'devolvido', motivoDevolucao: 'Falta o efetivo empregado.' });

    await responder(db1, e, 'Policiamento com 4 PMs.', 'Sd Silva');
    [e] = await listaDaCia('1cia');
    await aceitarResposta(p3, e);
    expect(await statusPorUnidade(id)).toEqual({ '1cia': 'aceito' });

    expect((await obterDemanda(p3, id))?.ciasAceitas).toEqual(['1cia']);

    const hist = await getDocs(collection(p3, 'demandas', id, 'historico'));
    expect(hist.docs.map((h) => h.data().acao).sort()).toEqual(['criada', 'resposta_aceita', 'resposta_aceita', 'resposta_devolvida']);
  });

  test('concluir a demanda aceita o que foi respondido e cancela o que estava pendente', async () => {
    const id = String(await criarDemanda(p3, dados(['1cia', '2cia'])));
    const [e1] = await listaDaCia('1cia');
    await responder(cia('1cia'), e1, 'Feito.', 'Cb Lima');

    await alterarStatus(p3, id, 'concluido');
    expect(await statusPorUnidade(id)).toEqual({ '1cia': 'aceito', '2cia': 'cancelado' });
  });
});
