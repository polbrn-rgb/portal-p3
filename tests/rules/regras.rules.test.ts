import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest';

// Roda dentro do emulador (npm run test:regras), nunca no banco real.
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-portal-p3',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

// Cada teste começa com: 1 demanda, 1 encaminhamento da 1ª Cia, 1 da 2ª Cia e 1 da 1ª já aceito.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, 'demandas/d1'), { numero: 2101, assunto: 'Teste' });
    await setDoc(doc(db, 'encaminhamentos/d1_1cia'), { demandaId: 'd1', unidadeId: '1cia', prazoCia: '2026-11-20', status: 'novo' });
    await setDoc(doc(db, 'encaminhamentos/d1_2cia'), { demandaId: 'd1', unidadeId: '2cia', prazoCia: '2026-11-20', status: 'novo' });
    await setDoc(doc(db, 'encaminhamentos/d0_1cia'), { demandaId: 'd0', unidadeId: '1cia', prazoCia: '2026-11-01', status: 'aceito' });
  });
});

const p3 = () => env.authenticatedContext('conta-p3', { perfil: 'p3' }).firestore() as unknown as Firestore;
const cia = (unidade: string) =>
  env.authenticatedContext(`conta-${unidade}`, { perfil: 'unidade', unidade }).firestore() as unknown as Firestore;
const visitante = () => env.unauthenticatedContext().firestore() as unknown as Firestore;
const semPerfil = () => env.authenticatedContext('sem-perfil').firestore() as unknown as Firestore;

describe('P/3', () => {
  test('lê e grava demandas, histórico, caixa de entrada e contador', async () => {
    const db = p3();
    await assertSucceeds(getDoc(doc(db, 'demandas/d1')));
    await assertSucceeds(setDoc(doc(db, 'demandas/d2'), { numero: 2102 }));
    await assertSucceeds(setDoc(doc(db, 'demandas/d1/historico/e1'), { acao: 'criada' }));
    await assertSucceeds(setDoc(doc(db, 'caixaEntrada/m1'), { assunto: 'E-mail' }));
    await assertSucceeds(setDoc(doc(db, 'contadores/demandas'), { ultimo: 2102 }));
  });

  test('histórico não pode ser alterado nem apagado', async () => {
    const db = p3();
    await assertSucceeds(setDoc(doc(db, 'demandas/d1/historico/e1'), { acao: 'criada' }));
    await assertFails(updateDoc(doc(db, 'demandas/d1/historico/e1'), { acao: 'outra' }));
    await assertFails(deleteDoc(doc(db, 'demandas/d1/historico/e1')));
  });

  test('cria, altera e apaga encaminhamentos de qualquer Cia e lista todos', async () => {
    const db = p3();
    await assertSucceeds(setDoc(doc(db, 'encaminhamentos/d1_ft'), { demandaId: 'd1', unidadeId: 'ft', status: 'novo' }));
    await assertSucceeds(updateDoc(doc(db, 'encaminhamentos/d1_2cia'), { status: 'aceito' }));
    await assertSucceeds(deleteDoc(doc(db, 'encaminhamentos/d1_ft')));
    await assertSucceeds(getDocs(collection(db, 'encaminhamentos')));
  });

  test('coleção não prevista continua bloqueada', async () => {
    await assertFails(setDoc(doc(p3(), 'qualquer/x'), { a: 1 }));
  });
});

describe('Cia', () => {
  test('lê o próprio encaminhamento e não o da outra Cia', async () => {
    const db = cia('1cia');
    await assertSucceeds(getDoc(doc(db, 'encaminhamentos/d1_1cia')));
    await assertFails(getDoc(doc(db, 'encaminhamentos/d1_2cia')));
  });

  test('lista só filtrando pela própria unidade', async () => {
    const db = cia('1cia');
    await assertSucceeds(getDocs(query(collection(db, 'encaminhamentos'), where('unidadeId', '==', '1cia'))));
    await assertFails(getDocs(query(collection(db, 'encaminhamentos'), where('unidadeId', '==', '2cia'))));
    await assertFails(getDocs(collection(db, 'encaminhamentos')));
  });

  test('não acessa demandas, caixa de entrada nem contador', async () => {
    const db = cia('1cia');
    await assertFails(getDoc(doc(db, 'demandas/d1')));
    await assertFails(getDoc(doc(db, 'caixaEntrada/m1')));
    await assertFails(getDoc(doc(db, 'contadores/demandas')));
  });

  test('não cria nem apaga encaminhamento', async () => {
    const db = cia('1cia');
    await assertFails(setDoc(doc(db, 'encaminhamentos/d9_1cia'), { demandaId: 'd9', unidadeId: '1cia', status: 'novo' }));
    await assertFails(deleteDoc(doc(db, 'encaminhamentos/d1_1cia')));
  });

  test('responde o próprio encaminhamento', async () => {
    await assertSucceeds(
      updateDoc(doc(cia('1cia'), 'encaminhamentos/d1_1cia'), {
        status: 'respondido',
        resposta: 'Policiamento realizado.',
        respondidoPor: 'Sd Silva',
        respondidoEm: serverTimestamp(),
      }),
    );
  });

  test('não se dá aceite, não muda prazo nem troca de unidade', async () => {
    const enc = doc(cia('1cia'), 'encaminhamentos/d1_1cia');
    await assertFails(updateDoc(enc, { status: 'aceito' }));
    await assertFails(updateDoc(enc, { status: 'respondido', prazoCia: '2026-12-31' }));
    await assertFails(updateDoc(enc, { status: 'respondido', unidadeId: '2cia' }));
  });

  test('não altera encaminhamento já aceito', async () => {
    await assertFails(updateDoc(doc(cia('1cia'), 'encaminhamentos/d0_1cia'), { status: 'respondido', resposta: 'x' }));
  });

  test('não responde encaminhamento de outra Cia', async () => {
    await assertFails(updateDoc(doc(cia('1cia'), 'encaminhamentos/d1_2cia'), { status: 'visualizado' }));
  });
});

describe('sem acesso', () => {
  test('visitante sem login não lê nem grava', async () => {
    const db = visitante();
    await assertFails(getDoc(doc(db, 'encaminhamentos/d1_1cia')));
    await assertFails(setDoc(doc(db, 'demandas/x'), { a: 1 }));
  });

  test('logado sem perfil não lê nada', async () => {
    const db = semPerfil();
    await assertFails(getDoc(doc(db, 'encaminhamentos/d1_1cia')));
    await assertFails(getDoc(doc(db, 'demandas/d1')));
  });

  test('perfil de unidade sem a unidade no token não lê nada', async () => {
    const db = env.authenticatedContext('quebrado', { perfil: 'unidade' }).firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(db, 'encaminhamentos/d1_1cia')));
  });
});
