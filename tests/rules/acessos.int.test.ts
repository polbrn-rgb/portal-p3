import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { bloquearAcesso, salvarAcesso } from '../../src/data/acessos';
import { acessoVazio, type DadosAcesso } from '../../src/domain/acessos';

// Acessos individuais e permissões novas, com as regras ligadas no emulador.
let env: RulesTestEnvironment;
const como = (uid: string, claims: Record<string, unknown>) => env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-portal-p3', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

const sd: DadosAcesso = {
  ...acessoVazio(),
  re: '194899-7',
  nomeCompleto: 'Fulano',
  nomeGuerra: 'Abdo',
  posto: 'Sd PM',
  email: 'abdo@policiamilitar.sp.gov.br',
  perfil: 'unidade',
  unidade: '3cia',
};

describe('acessos', () => {
  test('o chefe/encarregado (P/3 com admin) cadastra; operador da P/3 e Cia não', async () => {
    const chefe = como('u-chefe', { perfil: 'p3', re: '130155', admin: true });
    await assertSucceeds(salvarAcesso(chefe, sd, { novo: true }));
    expect((await getDocs(collection(chefe, 'acessos'))).docs.map((d) => d.id)).toEqual(['194899']);
    await assertSucceeds(bloquearAcesso(chefe, '194899', false));

    const operador = como('u-op', { perfil: 'p3', re: '111111' });
    await assertFails(salvarAcesso(operador, sd, { novo: true }));
    await assertFails(getDocs(collection(operador, 'acessos')));
    await assertFails(getDocs(collection(como('u-cia', { perfil: 'unidade', unidade: '3cia', re: '194899' }), 'acessos')));
  });

  test('a conta antiga do Administrador continua podendo cadastrar (transição)', async () => {
    await assertSucceeds(salvarAcesso(como('u-admin', { perfil: 'admin' }), sd, { novo: true }));
  });

  test('CFP usa a página da Sala (lê o checklist e lança resultados); Cia não', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore() as unknown as Firestore, 'operacoes', '2101'), { numero: 2101 }));
    const cfp = como('u-cfp', { perfil: 'cfp', re: '222222' });
    await assertSucceeds(getDocs(collection(cfp, 'operacoes')));
    await assertSucceeds(getDocs(collection(cfp, 'recadosSala')));
    await assertSucceeds(
      setDoc(doc(cfp, 'resultados', '2101_2026-11-20'), {
        numero: '2101',
        dia: '2026-11-20',
        protocoloResultado: '',
        valores: {},
        salvoPor: 'CFP Teste',
        salvoEm: '2026-11-20T10:00:00Z',
        gravado: false,
      }),
    );
    await assertFails(getDocs(collection(como('u-cia', { perfil: 'unidade', unidade: '1cia' }), 'operacoes')));
  });
});
