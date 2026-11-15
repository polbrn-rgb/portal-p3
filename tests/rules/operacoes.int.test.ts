import { readFileSync } from 'node:fs';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { atualizarDemanda, criarDemanda, obterDemanda } from '../../src/data/demandas';
import { concluirOperacao, marcarItem, observarOperacoes, salvarProtocolo } from '../../src/data/operacoes';
import { dadosDe, demandaVazia, type DadosDemanda } from '../../src/domain/demanda';
import type { Operacao } from '../../src/domain/operacao';

// Código real do Checklist Operações, no emulador, com as regras ligadas.
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

/** Espera a lista ao vivo chegar no estado esperado. */
function operacoesQuando(condicao: (lista: Operacao[]) => boolean): Promise<Operacao[]> {
  return new Promise((ok, falha) => {
    const parar = observarOperacoes(
      db,
      (lista) => {
        if (!condicao(lista)) return;
        setTimeout(parar);
        ok(lista);
      },
      falha,
    );
  });
}

const operacao = (saida: string): DadosDemanda => ({
  ...demandaVazia('2026-11-14'),
  saida,
  tipoSaida: 'ORDEM DE SERVIÇO',
  categoria: 'Operações Policiais',
  inicioBtl: '2026-11-20',
  terminoBtl: '2026-11-21',
} as DadosDemanda);

describe('Checklist Operações', () => {
  test('Ordem de Serviço ou Ordem de Operações + Operações Policiais entra sozinha; outras não', async () => {
    await criarDemanda(db, operacao('Operação Natal'));
    await criarDemanda(db, { ...operacao('Operação Réveillon'), tipoSaida: 'ORDEM DE OPERAÇÕES' } as DadosDemanda);
    await criarDemanda(db, { ...operacao('Ordem de Operações de escolta'), tipoSaida: 'ORDEM DE OPERAÇÕES', categoria: 'Escoltas' } as DadosDemanda);
    await criarDemanda(db, { ...demandaVazia('2026-11-14'), saida: 'Ofício comum' });
    const lista = await operacoesQuando((l) => l.length === 2);
    expect(lista.map((o) => o.demanda.saida).sort()).toEqual(['Operação Natal', 'Operação Réveillon']);
    expect(lista[0].checklist.osOk).toBe(false);
  });

  test('editar a demanda para virar operação também faz ela entrar', async () => {
    const n = await criarDemanda(db, { ...demandaVazia('2026-11-14'), saida: 'Vai virar operação' });
    const d = (await obterDemanda(db, String(n)))!;
    await atualizarDemanda(db, d.id, dadosDe(d), { ...dadosDe(d), tipoSaida: 'ORDEM DE SERVIÇO', categoria: 'Operações Policiais' });
    await operacoesQuando((l) => l.length === 1);
  });

  test('marca itens, guarda protocolo por dia e conclui', async () => {
    const n = String(await criarDemanda(db, operacao('Operação Verão')));
    await marcarItem(db, n, 'osOk', true);
    await salvarProtocolo(db, n, '2026-11-20', ' 555 ');
    await salvarProtocolo(db, n, '2026-11-21', '556');
    const [o] = await operacoesQuando((l) => l[0]?.checklist.protocolos['2026-11-21'] === '556');
    expect(o.checklist).toMatchObject({ osOk: true, protocolos: { '2026-11-20': '555', '2026-11-21': '556' } });

    await concluirOperacao(db, n);
    await operacoesQuando((l) => l.length === 0);
    await concluirOperacao(db, n, false);
    await operacoesQuando((l) => l.length === 1);
  });

  test('Cia não lê nem altera o checklist', async () => {
    const n = String(await criarDemanda(db, operacao('Operação X')));
    await marcarItem(db, n, 'osOk', true);
    const dbCia = env.authenticatedContext('conta-1cia', { perfil: 'unidade', unidade: '1cia' }).firestore();
    await assertFails(getDoc(doc(dbCia as unknown as Firestore, 'operacoes', n)));
    await assertFails(marcarItem(dbCia as unknown as Firestore, n, 'osOk', false));
  });
});
