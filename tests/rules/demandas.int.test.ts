import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  alterarStatus,
  atualizarDemanda,
  buscarConcluidas,
  ConflitoEdicao,
  criarDemanda,
  obterDemanda,
} from '../../src/data/demandas';
import { dadosDe, demandaVazia, type DadosDemanda } from '../../src/domain/demanda';

// Testa o código real de gravação no emulador, logado como P/3 e com as regras ligadas.
let env: RulesTestEnvironment;
let db: Firestore;

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
  db = env.authenticatedContext('conta-p3', { perfil: 'p3' }).firestore() as unknown as Firestore;
});

function dados(saida = 'Pedido de policiamento'): DadosDemanda {
  return { ...demandaVazia('2026-11-13'), saida, categoria: 'Pedidos de Policiamento', destinos: ['1cia'] };
}

async function historico(numero: number) {
  const s = await getDocs(collection(db, 'demandas', String(numero), 'historico'));
  return s.docs.map((d) => d.data().acao as string).sort();
}

describe('criarDemanda', () => {
  test('sem contador, começa do 1 e grava em aberto', async () => {
    expect(await criarDemanda(db, dados())).toBe(1);
    const salva = await obterDemanda(db, '1');
    expect(salva).toMatchObject({ numero: 1, status: 'em_aberto', saida: 'Pedido de policiamento' });
    expect((await getDoc(doc(db, 'contadores/demandas'))).data()).toEqual({ ultimo: 1 });
  });

  test('continua do último número do numerador', async () => {
    await setDoc(doc(db, 'contadores/demandas'), { ultimo: 2100 });
    expect(await criarDemanda(db, dados())).toBe(2101);
    expect(await criarDemanda(db, dados())).toBe(2102);
  });

  test('cadastros ao mesmo tempo nunca repetem número', async () => {
    const numeros = await Promise.all(Array.from({ length: 5 }, (_, i) => criarDemanda(db, dados(`D${i}`))));
    expect([...numeros].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('edição, conclusão e histórico', () => {
  test('edita só o que mudou, conclui, reabre e registra tudo no histórico', async () => {
    const numero = await criarDemanda(db, dados());
    const antes = dadosDe((await obterDemanda(db, String(numero)))!);

    expect(await atualizarDemanda(db, String(numero), antes, { ...antes })).toEqual([]);
    expect(await atualizarDemanda(db, String(numero), antes, { ...antes, saida: 'Novo assunto' })).toEqual(['saida']);
    expect((await obterDemanda(db, String(numero)))?.saida).toBe('Novo assunto');

    await alterarStatus(db, String(numero), 'concluido');
    expect((await obterDemanda(db, String(numero)))?.status).toBe('concluido');
    await alterarStatus(db, String(numero), 'em_aberto');

    expect(await historico(numero)).toEqual(['concluida', 'criada', 'editada', 'reaberta']);
  });
});

describe('duas pessoas editando a mesma demanda', () => {
  async function abrir() {
    const id = String(await criarDemanda(db, dados()));
    return { id, aberta: dadosDe((await obterDemanda(db, id))!) };
  }

  test('campos diferentes: as duas mudanças ficam', async () => {
    const { id, aberta } = await abrir();
    await atualizarDemanda(db, id, aberta, { ...aberta, prazoCPA: '2026-12-01' });
    await atualizarDemanda(db, id, aberta, { ...aberta, observacao: 'Ver com o Cmt' });
    expect(await obterDemanda(db, id)).toMatchObject({ prazoCPA: '2026-12-01', observacao: 'Ver com o Cmt' });
  });

  test('mesmo campo: quem salva depois é avisado e nada é sobrescrito', async () => {
    const { id, aberta } = await abrir();
    await atualizarDemanda(db, id, aberta, { ...aberta, prazoCPA: '2026-12-01' });
    const segunda = atualizarDemanda(db, id, aberta, { ...aberta, prazoCPA: '2026-12-05', observacao: 'x' });
    await expect(segunda).rejects.toBeInstanceOf(ConflitoEdicao);
    await expect(segunda).rejects.toMatchObject({ campos: ['prazoCPA'] });
    expect(await obterDemanda(db, id)).toMatchObject({ prazoCPA: '2026-12-01', observacao: '' });
  });

  test('salvando no mesmo instante, em campos diferentes, nada se perde', async () => {
    const { id, aberta } = await abrir();
    await Promise.all([
      atualizarDemanda(db, id, aberta, { ...aberta, responsavel: 'Sgt Sousa' }),
      atualizarDemanda(db, id, aberta, { ...aberta, numeroSaida: '123/26' }),
      atualizarDemanda(db, id, aberta, { ...aberta, destinos: ['1cia', '2cia'] }),
    ]);
    expect(await obterDemanda(db, id)).toMatchObject({
      responsavel: 'Sgt Sousa',
      numeroSaida: '123/26',
      destinos: ['1cia', '2cia'],
    });
  });
});

describe('buscarConcluidas', () => {
  test('pagina da mais nova para a mais antiga, 30 por vez', async () => {
    for (let i = 0; i < 32; i++) {
      const n = await criarDemanda(db, dados());
      await alterarStatus(db, String(n), 'concluido');
    }
    const p1 = await buscarConcluidas(db);
    expect(p1.lista).toHaveLength(30);
    expect(p1.lista[0].numero).toBe(32);
    expect(p1.temMais).toBe(true);

    const p2 = await buscarConcluidas(db, p1.lista.at(-1)!.numero);
    expect(p2.lista.map((d) => d.numero)).toEqual([2, 1]);
    expect(p2.temMais).toBe(false);
  });
});
