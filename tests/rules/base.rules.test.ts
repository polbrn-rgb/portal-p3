import { readFileSync } from 'node:fs';
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, test } from 'vitest';

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

describe('Fase 0: tudo bloqueado por padrão', () => {
  test('visitante sem login não lê', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'demandas/qualquer')));
  });

  test('visitante sem login não grava', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, 'demandas/qualquer'), { assunto: 'teste' }));
  });

  test('usuário logado sem perfil não lê nem grava', async () => {
    const db = env.authenticatedContext('sem-perfil').firestore();
    await assertFails(getDoc(doc(db, 'encaminhamentos/qualquer')));
    await assertFails(setDoc(doc(db, 'encaminhamentos/qualquer'), { status: 'novo' }));
  });
});
