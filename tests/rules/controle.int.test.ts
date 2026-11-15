import { readFileSync } from 'node:fs';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  atualizarOperacaoControle,
  criarOperacaoControle,
  excluirOperacaoControle,
  observarControle,
  observarRelatorios,
  OperacaoJaExiste,
  pedirRelatorio,
} from '../../src/data/controle';
import { controleVazio, type OperacaoControle, type Relatorio } from '../../src/domain/controle';

// Código real do Controle de Operações e do pedido de relatório, no emulador, com as regras ligadas.
let env: RulesTestEnvironment;
let p3: Firestore;
const como = (uid: string, claims: Record<string, string>) => env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-portal-p3', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  p3 = como('conta-p3', { perfil: 'p3' });
});

function quando<T>(observar: (ok: (v: T) => void, erro: (e: Error) => void) => () => void, cond: (v: T) => boolean): Promise<T> {
  return new Promise((ok, falha) => {
    const parar = observar((v) => {
      if (!cond(v)) return;
      setTimeout(parar);
      ok(v);
    }, falha);
  });
}

describe('Controle de Operações', () => {
  test('P/3 registra, edita e exclui (fica marcada, não some do banco); repetida é recusada', async () => {
    const d = { ...controleVazio(), nome: ' Operação Natal ', inicio: '2026-12-20', termino: '2026-12-24' };
    const id = await criarOperacaoControle(p3, d);
    expect(id).toBe('2026-12-20_operacao-natal');
    await expect(criarOperacaoControle(p3, d)).rejects.toBeInstanceOf(OperacaoJaExiste);

    await atualizarOperacaoControle(p3, id, { ...d, objetivo: 'Reduzir roubos' });
    const lista = await quando<OperacaoControle[]>((ok, e) => observarControle(p3, ok, e), (l) => l[0]?.objetivo === 'Reduzir roubos');
    expect(lista[0]).toMatchObject({ nome: 'Operação Natal', fonte: 'portal', excluida: false });

    await excluirOperacaoControle(p3, id);
    await quando<OperacaoControle[]>((ok, e) => observarControle(p3, ok, e), (l) => l[0]?.excluida === true);
    await assertFails(deleteDoc(doc(p3, 'controleOperacoes', id)));
  });

  test('sem nome ou início nem chega no banco', async () => {
    await expect(criarOperacaoControle(p3, controleVazio())).rejects.toThrow('Informe o nome da operação.');
  });

  test('Cia, Sala e CFP não leem nem escrevem', async () => {
    await criarOperacaoControle(p3, { ...controleVazio(), nome: 'A', inicio: '2026-10-01' });
    const perfis: Record<string, string>[] = [{ perfil: 'unidade', unidade: '1cia' }, { perfil: 'sala' }, { perfil: 'cfp' }];
    for (const claims of perfis) {
      const outro = como('outro', claims);
      await assertFails(getDocs(collection(outro, 'controleOperacoes')));
      await assertFails(criarOperacaoControle(outro, { ...controleVazio(), nome: 'B', inicio: '2026-10-01' }));
      await assertFails(getDocs(collection(outro, 'relatorios')));
      await assertFails(pedirRelatorio(outro, { mes: '2026-10', numero: '1' }));
    }
  });
});

describe('Relatório de Indicadores', () => {
  test('P/3 pede e acompanha; o pedido entra como "pedido"', async () => {
    const id = await pedirRelatorio(p3, { mes: '2026-10', numero: ' 2085/03/26 ' });
    const lista = await quando<Relatorio[]>((ok, e) => observarRelatorios(p3, ok, e), (l) => l.length === 1);
    expect(lista[0]).toMatchObject({ id, mes: '2026-10', numero: '2085/03/26', status: 'pedido' });
    expect((await getDoc(doc(p3, 'relatorios', id))).exists()).toBe(true);
  });

  test('pedido inválido ou já "pronto" é recusado pelas regras', async () => {
    await expect(pedirRelatorio(p3, { mes: 'outubro', numero: '1' })).rejects.toThrow();
    await assertFails(addDoc(collection(p3, 'relatorios'), { mes: '2026-10', numero: '1', status: 'pronto', pedidoEm: serverTimestamp() }));
    await assertFails(addDoc(collection(p3, 'relatorios'), { mes: '2026-10', numero: '1', status: 'pedido', pedidoEm: serverTimestamp(), url: 'x' }));
  });
});
