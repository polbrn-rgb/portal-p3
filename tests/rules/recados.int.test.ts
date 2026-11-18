import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { apagarRecado, COLECAO_RECADOS, enviarRecado, observarRecados, type Recado, type SetorRecado } from '../../src/data/recados';

// Código real dos recados do Cmt do P3 (CFP e Sala), no emulador, com as regras ligadas.
let env: RulesTestEnvironment;
let p3: Firestore;
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
});

function recadosQuando(db: Firestore, setor: SetorRecado, condicao: (l: Recado[]) => boolean): Promise<Recado[]> {
  return new Promise((ok, falha) => {
    const parar = observarRecados(
      db,
      setor,
      (l) => {
        if (!condicao(l)) return;
        parar();
        ok(l);
      },
      falha,
    );
  });
}

// Quem recebe cada recado, e quem é o "outro setor" que não pode ler.
const CASOS: { setor: SetorRecado; perfil: string; outro: string }[] = [
  { setor: 'cfp', perfil: 'cfp', outro: 'sala' },
  { setor: 'sala', perfil: 'sala', outro: 'cfp' },
];

describe.each(CASOS)('Recados do Cmt do P3 para $setor', ({ setor, perfil, outro }) => {
  const colecao = COLECAO_RECADOS[setor];
  const destino = () => como(`conta-${perfil}`, { perfil });

  test('P/3 envia, o setor lê (mais novo primeiro), P/3 apaga', async () => {
    await enviarRecado(p3, setor, '  Primeiro recado  ');
    await new Promise((r) => setTimeout(r, 20));
    const id2 = await enviarRecado(p3, setor, 'Segundo recado');
    const lista = await recadosQuando(destino(), setor, (l) => l.length === 2);
    expect(lista.map((r) => r.texto)).toEqual(['Segundo recado', 'Primeiro recado']);
    expect(lista[0].criadoEm).toBeInstanceOf(Date);

    await apagarRecado(p3, setor, id2);
    expect((await recadosQuando(destino(), setor, (l) => l.length === 1))[0].texto).toBe('Primeiro recado');
  });

  test('recado vazio nem chega no banco', async () => {
    await expect(enviarRecado(p3, setor, '   ')).rejects.toThrow('Escreva o recado.');
  });

  test('só a P/3 escreve; o setor não escreve nem apaga; Cia não lê; a Sala não lê os do CFP (o CFP lê os da Sala)', async () => {
    const id = await enviarRecado(p3, setor, 'Recado');
    await assertSucceeds(getDoc(doc(destino(), colecao, id)));
    await assertFails(addDoc(collection(destino(), colecao), { texto: 'x', criadoEm: serverTimestamp() }));
    await assertFails(apagarRecado(destino(), setor, id));
    await assertFails(getDocs(collection(como('conta-1cia', { perfil: 'unidade', unidade: '1cia' }), colecao)));
    // O CFP usa a página da Sala, então lê os recados da Sala; o contrário continua fechado.
    const outroLe = getDoc(doc(como(`conta-${outro}`, { perfil: outro }), colecao, id));
    if (setor === 'sala') await assertSucceeds(outroLe);
    else await assertFails(outroLe);
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore() as unknown as Firestore, colecao, id)));
  });

  test('P/3 não grava recado fora do formato nem edita depois', async () => {
    const col = collection(p3, colecao);
    await assertFails(addDoc(col, { texto: '', criadoEm: serverTimestamp() }));
    await assertFails(addDoc(col, { texto: 'a'.repeat(2001), criadoEm: serverTimestamp() }));
    await assertFails(addDoc(col, { texto: 'x', criadoEm: new Date(2020, 0, 1) }));
    await assertFails(addDoc(col, { texto: 'x', criadoEm: serverTimestamp(), autor: 'outro' }));
    const id = await enviarRecado(p3, setor, 'Recado');
    await assertFails(updateDoc(doc(p3, colecao, id), { texto: 'mudado' }));
    await assertFails(setDoc(doc(p3, colecao, id), { texto: 'mudado', criadoEm: serverTimestamp() }));
  });
});
