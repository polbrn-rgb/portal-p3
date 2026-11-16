import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { baixarArquivo } from '../../src/data/arquivos';
import { encerrarIcc, enviarRespostaIcc } from '../../src/data/icc';

// ICC e o PDF guardado em partes, no emulador, com as regras ligadas.
let env: RulesTestEnvironment;
let p3: Firestore;
const como = (uid: string, claims: Record<string, string>) => env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;
const cia = (u: string) => como(`conta-${u}`, { perfil: 'unidade', unidade: u });
const q = { oficiais: 1, sargentos: 9, cabos: 43 };

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

async function publicar(db: Firestore, id = 'icc1', pdf = 'arq1') {
  await setDoc(doc(db, 'arquivos', pdf, 'partes', '0'), { dados: btoa('%PDF-1.4 ') });
  await setDoc(doc(db, 'arquivos', pdf, 'partes', '1'), { dados: btoa('teste') });
  await setDoc(doc(db, 'arquivos', pdf), { nome: 'ICC 427.pdf', tipo: 'application/pdf', tamanho: 14, partes: 2, criadoEm: serverTimestamp() });
  await setDoc(doc(db, 'iccs', id), {
    numero: '427',
    prazo: '2026-11-15',
    status: 'aberta',
    arquivo: { id: pdf, nome: 'ICC 427.pdf', tamanho: 14 },
    planilha: { status: 'pedida' },
    criadoEm: serverTimestamp(),
  });
}

describe('PDF da ordem', () => {
  test('a P/3 publica; a Cia baixa inteiro; a Cia não publica nem troca', async () => {
    await publicar(p3);
    const { nome, blob } = await baixarArquivo(cia('2cia'), 'arq1');
    expect(nome).toBe('ICC 427.pdf');
    expect(await blob.text()).toBe('%PDF-1.4 teste');
    await assertFails(setDoc(doc(cia('2cia'), 'arquivos', 'x'), { nome: 'a.pdf', tipo: 'application/pdf', tamanho: 1, partes: 1 }));
    await assertFails(setDoc(doc(cia('2cia'), 'arquivos', 'arq1', 'partes', '0'), { dados: 'x' }));
    await assertFails(setDoc(doc(p3, 'arquivos', 'arq1', 'partes', '0'), { dados: 'outro' })); // não se altera depois de enviado
    await assertFails(getDoc(doc(como('sala', { perfil: 'sala' }), 'arquivos', 'arq1')));
    await assertFails(setDoc(doc(p3, 'arquivos', 'y'), { nome: 'a.exe', tipo: 'application/x-msdownload', tamanho: 1, partes: 1, criadoEm: serverTimestamp() }));
  });
});

describe('ICC', () => {
  test('a Cia vê só as abertas e responde a dela; a P/3 encerra', async () => {
    await publicar(p3);
    await assertSucceeds(getDocs(query(collection(cia('1cia'), 'iccs'), where('status', '==', 'aberta'))));
    await enviarRespostaIcc(cia('1cia'), 'icc1', '1cia', q, 'Sd PM Teste');
    await enviarRespostaIcc(cia('1cia'), 'icc1', '1cia', { ...q, cabos: 40 }, 'Sd PM Teste'); // corrige
    expect((await getDoc(doc(p3, 'respostasIcc', 'icc1_1cia'))).data()).toMatchObject({ cabos: 40, gravado: false });

    await assertFails(enviarRespostaIcc(cia('2cia'), 'icc1', '1cia', q, 'X')); // pela outra Cia
    await assertFails(getDoc(doc(cia('2cia'), 'respostasIcc', 'icc1_1cia')));
    await assertFails(enviarRespostaIcc(cia('2cia'), 'icc1', '2cia', { ...q, oficiais: -1 }, 'X'));
    await assertFails(updateDoc(doc(cia('1cia'), 'iccs', 'icc1'), { status: 'encerrada' }));

    await encerrarIcc(p3, 'icc1');
    await assertFails(getDoc(doc(cia('1cia'), 'iccs', 'icc1')));
    await assertFails(enviarRespostaIcc(cia('3cia'), 'icc1', '3cia', q, 'X')); // encerrada
    await assertFails(updateDoc(doc(p3, 'iccs', 'icc1'), { numero: '999' }));
  });
});
