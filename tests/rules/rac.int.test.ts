import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { abrirRac, alterarRac, salvarRac } from '../../src/data/rac';
import { lerImagemPrint, salvarPrintRac } from '../../src/data/racPrints';
import { racVazio } from '../../src/domain/rac';

// RAC: a P/3 abre o mês; cada Cia grava só o dela, só com o mês aberto. No emulador, com as regras ligadas.
let env: RulesTestEnvironment;
let p3: Firestore;
const como = (uid: string, claims: Record<string, string>) => env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;
const cia = (u: string) => como(`conta-${u}`, { perfil: 'unidade', unidade: u });

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

describe('mês do RAC', () => {
  test('só a P/3 abre, muda o prazo e encerra; a Cia vê só os abertos', async () => {
    await assertFails(abrirRac(cia('1cia'), '2026-09', '2026-10-10', []));
    await abrirRac(p3, '2026-09', '2026-10-10', []);
    await assertFails(setDoc(doc(p3, 'racMeses', '2026-09'), { mes: '2026-09', prazo: '2026-10-20', status: 'aberto', criadoEm: serverTimestamp() })); // não recria
    await assertFails(setDoc(doc(p3, 'racMeses', '2026-13'), { mes: '2026-13', prazo: '2026-10-20', status: 'aberto', criadoEm: serverTimestamp() }));
    await assertSucceeds(getDocs(query(collection(cia('2cia'), 'racMeses'), where('status', '==', 'aberto'))));
    await assertFails(alterarRac(cia('1cia'), '2026-09', { prazo: '2026-12-31' }));
    await alterarRac(p3, '2026-09', { prazo: '2026-10-15' });
    await assertFails(updateDoc(doc(p3, 'racMeses', '2026-09'), { mes: '2026-08' }));
    await alterarRac(p3, '2026-09', { status: 'encerrado' });
    await assertFails(getDoc(doc(cia('1cia'), 'racMeses', '2026-09')));
  });
});

describe('RAC da Cia', () => {
  test('a Cia salva rascunho e envia o dela; não mexe no de outra; a P/3 lê todos', async () => {
    await abrirRac(p3, '2026-09', '2026-10-10', []);
    const d = racVazio('1cia', '2026-09');
    await salvarRac(cia('1cia'), d, 'rascunho', '');
    d.crimes.furtoVeiculo.atual = 62;
    await salvarRac(cia('1cia'), d, 'enviado', 'Sd PM Teste');
    expect((await getDoc(doc(p3, 'racs', '2026-09_1cia'))).data()).toMatchObject({ status: 'enviado', preenchidoPor: 'Sd PM Teste', crimes: { furtoVeiculo: { atual: 62 } } });
    await assertSucceeds(getDocs(query(collection(cia('1cia'), 'racs'), where('unidadeId', '==', '1cia'))));

    await assertFails(salvarRac(cia('1cia'), d, 'rascunho', 'Sd PM Teste')); // enviado não volta a rascunho
    await salvarRac(cia('1cia'), d, 'enviado', 'Sd PM Teste'); // corrige reenviando
    await assertFails(salvarRac(cia('2cia'), d, 'enviado', 'X')); // RAC da 1ª pela 2ª
    await assertFails(getDoc(doc(cia('2cia'), 'racs', '2026-09_1cia')));
    await assertFails(setDoc(doc(cia('2cia'), 'racs', '2026-09_2cia'), { mes: '2026-09', unidadeId: '2cia', status: 'enviado', preenchidoPor: '' })); // sem quem preencheu
    await assertFails(salvarRac(como('sala', { perfil: 'sala' }), racVazio('2cia', '2026-09'), 'rascunho', ''));
  });

  test('mês encerrado ou não aberto: a Cia não grava', async () => {
    await assertFails(salvarRac(cia('ft'), racVazio('ft', '2026-08'), 'rascunho', ''));
    await abrirRac(p3, '2026-09', '2026-10-10', []);
    await alterarRac(p3, '2026-09', { status: 'encerrado' });
    await assertFails(salvarRac(cia('ft'), racVazio('ft', '2026-09'), 'rascunho', ''));
  });
});

describe('prints do RAC', () => {
  const foto = { dados: btoa('jpeg'), miniatura: btoa('mini') };
  const leitura = { companhia: '1cia', delito: 'rouboVeiculo' as const, valores: { atual: { valor: 1, confira: false } } };

  test('a Cia envia e troca os prints dela; a P/3 lê; outra Cia não lê nem grava', async () => {
    await abrirRac(p3, '2026-09', '2026-10-10', []);
    await salvarPrintRac(cia('1cia'), '2026-09', '1cia', 'rvPainel', foto, leitura);
    await salvarPrintRac(cia('1cia'), '2026-09', '1cia', 'rvPainel', { ...foto, dados: btoa('outra') }, null); // troca
    expect(atob(await lerImagemPrint(p3, '2026-09_1cia_rvPainel'))).toBe('outra');
    expect((await getDoc(doc(p3, 'racPrints', '2026-09_1cia_rvPainel'))).data()).toMatchObject({ slot: 'rvPainel', leitura: null });
    await assertSucceeds(getDocs(query(collection(cia('1cia'), 'racPrints'), where('unidadeId', '==', '1cia'), where('mes', '==', '2026-09'))));

    await assertFails(getDoc(doc(cia('2cia'), 'racPrintsDados', '2026-09_1cia_rvPainel')));
    await assertFails(salvarPrintRac(cia('2cia'), '2026-09', '1cia', 'rvPainel', foto, null));
    await assertFails(setDoc(doc(cia('1cia'), 'racPrints', '2026-09_1cia_outro'), { mes: '2026-09', unidadeId: '1cia', slot: 'outro', miniatura: '', leitura: null, tamanho: 1, enviadoEm: serverTimestamp() }));
    await assertFails(setDoc(doc(cia('1cia'), 'racPrintsDados', '2026-09_1cia_fvMapa'), { mes: '2026-09', unidadeId: '1cia', slot: 'fvMapa', dados: 'x'.repeat(900_001) }));

    await alterarRac(p3, '2026-09', { status: 'encerrado' });
    await assertFails(salvarPrintRac(cia('1cia'), '2026-09', '1cia', 'fvPainel', foto, null)); // mês encerrado
  });
});
