import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { apagarRecadoCfp, enviarRecadoCfp, observarRecadosCfp, type RecadoCfp } from '../../src/data/recados';

// Código real dos recados para o CFP, no emulador, com as regras ligadas.
let env: RulesTestEnvironment;
let p3: Firestore;
let cfp: Firestore;
const como = (uid: string, claims: Record<string, string>) =>
  env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;

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
  p3 = como('conta-p3', { perfil: 'p3' });
  cfp = como('conta-cfp', { perfil: 'cfp' });
});

function recadosQuando(db: Firestore, condicao: (l: RecadoCfp[]) => boolean): Promise<RecadoCfp[]> {
  return new Promise((ok, falha) => {
    const parar = observarRecadosCfp(
      db,
      (l) => {
        if (!condicao(l)) return;
        parar();
        ok(l);
      },
      falha,
    );
  });
}

describe('Recados do Cmt do P3 para o CFP', () => {
  test('P/3 envia, CFP lê (mais novo primeiro), P/3 apaga', async () => {
    await enviarRecadoCfp(p3, '  Primeiro recado  ');
    await new Promise((r) => setTimeout(r, 20));
    const id2 = await enviarRecadoCfp(p3, 'Segundo recado');
    const lista = await recadosQuando(cfp, (l) => l.length === 2);
    expect(lista.map((r) => r.texto)).toEqual(['Segundo recado', 'Primeiro recado']);
    expect(lista[0].criadoEm).toBeInstanceOf(Date);

    await apagarRecadoCfp(p3, id2);
    expect((await recadosQuando(cfp, (l) => l.length === 1))[0].texto).toBe('Primeiro recado');
  });

  test('recado vazio nem chega no banco', async () => {
    await expect(enviarRecadoCfp(p3, '   ')).rejects.toThrow('Escreva o recado.');
  });

  test('só a P/3 escreve; CFP não escreve nem apaga; Cia e Sala não leem', async () => {
    const id = await enviarRecadoCfp(p3, 'Recado');
    await assertSucceeds(getDoc(doc(cfp, 'recadosCfp', id)));
    await assertFails(addDoc(collection(cfp, 'recadosCfp'), { texto: 'x', criadoEm: serverTimestamp() }));
    await assertFails(apagarRecadoCfp(cfp, id));
    await assertFails(getDocs(collection(como('conta-1cia', { perfil: 'unidade', unidade: '1cia' }), 'recadosCfp')));
    await assertFails(getDoc(doc(como('conta-sala', { perfil: 'sala' }), 'recadosCfp', id)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore() as unknown as Firestore, 'recadosCfp', id)));
  });

  test('P/3 não grava recado fora do formato nem edita depois', async () => {
    const col = collection(p3, 'recadosCfp');
    await assertFails(addDoc(col, { texto: '', criadoEm: serverTimestamp() }));
    await assertFails(addDoc(col, { texto: 'a'.repeat(2001), criadoEm: serverTimestamp() }));
    await assertFails(addDoc(col, { texto: 'x', criadoEm: new Date(2020, 0, 1) }));
    await assertFails(addDoc(col, { texto: 'x', criadoEm: serverTimestamp(), autor: 'outro' }));
    const id = await enviarRecadoCfp(p3, 'Recado');
    await assertFails(updateDoc(doc(p3, 'recadosCfp', id), { texto: 'mudado' }));
    await assertFails(setDoc(doc(p3, 'recadosCfp', id), { texto: 'mudado', criadoEm: serverTimestamp() }));
  });
});
