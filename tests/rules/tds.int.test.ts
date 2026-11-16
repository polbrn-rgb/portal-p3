import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { apagarFotosTds, cadastrarPolicial, enviarFotosTds, lerFotoTds } from '../../src/data/tds';

// TDS (fotos de instrução dos CFP) e o cadastro manual no banco de efetivo, no emulador, com as regras ligadas.
let env: RulesTestEnvironment;
let p3: Firestore;
let cfp: Firestore;
const como = (uid: string, claims: Record<string, string>) => env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;
const cia = () => como('conta-1cia', { perfil: 'unidade', unidade: '1cia' });
const sala = () => como('conta-sala', { perfil: 'sala' });
const ten = { re: '123456-7', posto: '1º Ten PM', nomeGuerra: 'SOUZA' };
const foto = (n: number) => ({ dados: btoa(`foto-${n}`), miniatura: btoa(`mini-${n}`) });
const envio = { cfp: ten, data: '2026-11-10', assunto: 'Abordagem' };

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-portal-p3', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  p3 = como('conta-p3', { perfil: 'p3' });
  cfp = como('conta-cfp', { perfil: 'cfp' });
});

function loteValido(db: Firestore, id: string, extra: Record<string, unknown> = {}, dados = btoa('x')) {
  const [mes, re, vaga] = id.split('_');
  const lote = writeBatch(db);
  lote.set(doc(db, 'fotosTdsDados', id), { dados });
  lote.set(doc(db, 'fotosTds', id), {
    mes,
    re,
    cfp: { posto: '1º Ten PM', nomeGuerra: 'SOUZA' },
    data: `${mes}-10`,
    assunto: 'Abordagem',
    vaga: Number(vaga),
    miniatura: 'bWluaQ==',
    tamanho: dados.length,
    enviadoEm: serverTimestamp(),
    ...extra,
  });
  return lote.commit();
}

describe('TDS', () => {
  test('o CFP manda até 5 fotos no mês; a 6ª não entra', async () => {
    expect(await enviarFotosTds(cfp, envio, [foto(1), foto(2), foto(3)], [1, 2, 3, 4, 5])).toBe(3);
    // Outro aparelho achando que as vagas 1 e 2 estão livres: pula para as livres de verdade.
    expect(await enviarFotosTds(cfp, envio, [foto(4), foto(5)], [1, 2, 4, 5])).toBe(2);
    const doMes = await getDocs(query(collection(cfp, 'fotosTds'), where('mes', '==', '2026-11'), where('re', '==', '123456')));
    expect(doMes.docs.map((d) => d.id).sort()).toEqual([1, 2, 3, 4, 5].map((v) => `2026-11_123456_${v}`));
    await assertFails(loteValido(cfp, '2026-11_123456_6'));
    // Outro CFP e outro mês têm as próprias 5 vagas.
    await assertSucceeds(loteValido(cfp, '2026-11_654321_1'));
    await assertSucceeds(loteValido(cfp, '2026-10_123456_1'));
  });

  test('ninguém altera; foto e resumo só entram juntos e conferem', async () => {
    await enviarFotosTds(cfp, envio, [foto(1)], [1]);
    await assertFails(updateDoc(doc(cfp, 'fotosTds', '2026-11_123456_1'), { assunto: 'Outro' }));
    await assertFails(setDoc(doc(cfp, 'fotosTdsDados', '2026-11_123456_1'), { dados: 'b3V0cmE=' }));
    await assertFails(deleteDoc(doc(cfp, 'fotosTds', '2026-11_123456_1')));
    await assertFails(setDoc(doc(cfp, 'fotosTdsDados', '2026-11_123456_2'), { dados: 'eA==' })); // sem o resumo
    await assertFails(loteValido(cfp, '2026-11_123456_2', { data: '2026-12-01' })); // data fora do mês do id
    await assertFails(loteValido(cfp, '2026-11_123456_2', { vaga: 3 })); // vaga diferente do id
    await assertFails(loteValido(cfp, '2026-11_123456_2', { tamanho: 999 })); // tamanho não confere
    await assertFails(loteValido(cfp, '2026-11_123456_2', { assunto: '' }));
    await assertFails(loteValido(cfp, '2026-11_123456_2', {}, 'x'.repeat(900_001)));
    await assertFails(loteValido(cia(), '2026-11_123456_2'));
    await assertFails(loteValido(p3, '2026-11_123456_2'));
  });

  test('a P/3 vê, baixa e apaga; o CFP vê o resumo mas não a foto; os outros nada', async () => {
    await enviarFotosTds(cfp, envio, [foto(1), foto(2)], [1, 2]);
    const lista = await getDocs(query(collection(p3, 'fotosTds'), where('mes', '==', '2026-11')));
    expect(lista.size).toBe(2);
    expect(await lerFotoTds(p3, '2026-11_123456_1')).toBe(btoa('foto-1'));
    await assertFails(getDoc(doc(cfp, 'fotosTdsDados', '2026-11_123456_1')));
    await assertFails(getDocs(query(collection(cia(), 'fotosTds'), where('mes', '==', '2026-11'))));
    await assertFails(getDoc(doc(sala(), 'fotosTds', '2026-11_123456_1')));

    await apagarFotosTds(p3, lista.docs.map((d) => d.id));
    expect((await getDocs(collection(p3, 'fotosTds'))).size).toBe(0);
    expect((await getDocs(collection(p3, 'fotosTdsDados'))).size).toBe(0);
    // Apagadas, as vagas voltam.
    expect(await enviarFotosTds(cfp, envio, [foto(3)], [1])).toBe(1);
  });
});

describe('cadastro manual no banco de efetivo', () => {
  const dados = { posto: '2º Sgt PM', nomeGuerra: 'lima', nomeCompleto: 'José Lima', telefone: '(11) 98888-0000' };

  test('o CFP cadastra quem não está no banco, mas não altera quem já está', async () => {
    await cadastrarPolicial(cfp, '765432-1', dados);
    expect((await getDoc(doc(p3, 'efetivo', '765432'))).data()).toMatchObject({ re: '765432-1', nomeGuerra: 'LIMA', nomeCompleto: 'JOSÉ LIMA', manual: true });
    await assertFails(cadastrarPolicial(cfp, '765432-1', { ...dados, nomeGuerra: 'OUTRO' }));
    await assertSucceeds(cadastrarPolicial(p3, '111111', dados));
  });

  test('a Cia e a Sala não cadastram; dados incompletos não entram', async () => {
    await assertFails(cadastrarPolicial(cia(), '222222', dados));
    await assertFails(cadastrarPolicial(sala(), '222222', dados));
    await assertFails(cadastrarPolicial(cfp, '222222', { ...dados, nomeGuerra: '' }));
    await assertFails(setDoc(doc(cfp, 'efetivo', '12'), { re: '12', posto: 'Sd PM', nomeGuerra: 'X', nomeCompleto: 'X', manual: true, cadastradoEm: serverTimestamp() }));
    await assertFails(setDoc(doc(cfp, 'efetivo', '333333'), { re: '333333', posto: 'Sd PM', nomeGuerra: 'X', nomeCompleto: 'X', manual: false, cadastradoEm: serverTimestamp() }));
  });
});
