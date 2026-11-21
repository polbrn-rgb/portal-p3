import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { enviarDocMensal, marcarFeito, observarEnviosDaUnidade, observarEnviosDoMes, pedirArquivamento, publicarConfig } from '../../src/data/documentosMensais';
import type { EnvioMensal } from '../../src/domain/documentosMensais';

// Código real dos Documentos Mensais, no emulador, com as regras ligadas.
let env: RulesTestEnvironment;
let p3: Firestore;
const como = (uid: string, claims: Record<string, string>) => env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;
const cia = (u: string) => como(`conta-${u}`, { perfil: 'unidade', unidade: u });
const envio = { docId: 'veiculos-apreendidos', mesRef: '2026-10', valores: { v4: 1, v2: 0, cam: 0 }, respondidoPor: 'Cb PM Teste' };

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

function quando(observar: (ok: (l: EnvioMensal[]) => void, e: (x: Error) => void) => () => void, cond: (l: EnvioMensal[]) => boolean) {
  return new Promise<EnvioMensal[]>((ok, falha) => {
    const parar = observar((l) => {
      if (!cond(l)) return;
      setTimeout(parar);
      ok(l);
    }, falha);
  });
}

describe('envio das Cias', () => {
  test('a Cia envia e corrige o dela; a P/3 vê todos do mês', async () => {
    await enviarDocMensal(cia('2cia'), { ...envio, unidadeId: '2cia' });
    await enviarDocMensal(cia('2cia'), { ...envio, unidadeId: '2cia', valores: { v4: 3, v2: 1, cam: 0 } });
    const daCia = await quando((ok, e) => observarEnviosDaUnidade(cia('2cia'), '2cia', '2026-10', ok, e), (l) => l.length === 1);
    expect(daCia[0]).toMatchObject({ id: 'veiculos-apreendidos_2026-10_2cia', gravado: false, valores: { v4: 3 } });
    const doMes = await quando((ok, e) => observarEnviosDoMes(p3, '2026-10', ok, e), (l) => l.length === 1);
    expect(doMes[0].unidadeId).toBe('2cia');
  });

  test('o envio guarda o que veio da produção (a P/3 vê o que a Cia corrigiu)', async () => {
    await enviarDocMensal(cia('2cia'), { ...envio, unidadeId: '2cia', valores: { v4: 3, v2: 1, cam: 0 }, daProducao: { v4: 2, v2: 1, cam: 0 } });
    const doMes = await quando((ok, e) => observarEnviosDoMes(p3, '2026-10', ok, e), (l) => l.length === 1);
    expect(doMes[0].daProducao).toEqual({ v4: 2, v2: 1, cam: 0 });
  });

  test('histórico: cada envio e cada correção ficam guardados; ninguém altera, apaga ou inventa', async () => {
    await enviarDocMensal(cia('2cia'), { ...envio, unidadeId: '2cia', valores: { v4: 1, v2: 0, cam: 0 } });
    await enviarDocMensal(cia('2cia'), { ...envio, unidadeId: '2cia', valores: { v4: 3, v2: 1, cam: 0 } });
    const h = await getDocs(query(collection(p3, 'docsMensaisHistorico'), orderBy('em')));
    expect(h.docs.map((d) => d.data().valores.v4)).toEqual([1, 3]);
    expect(h.docs[0].data()).toMatchObject({ envioId: 'veiculos-apreendidos_2026-10_2cia', unidadeId: '2cia', mesRef: '2026-10' });
    await assertFails(getDocs(collection(cia('2cia'), 'docsMensaisHistorico')));
    await assertFails(deleteDoc(doc(cia('2cia'), 'docsMensaisHistorico', h.docs[0].id)));
    await assertFails(deleteDoc(doc(p3, 'docsMensaisHistorico', h.docs[0].id)));
    await assertFails(
      addDoc(collection(cia('2cia'), 'docsMensaisHistorico'), {
        envioId: 'veiculos-apreendidos_2026-10_2cia',
        docId: 'veiculos-apreendidos',
        mesRef: '2026-10',
        unidadeId: '2cia',
        valores: { v4: 99, v2: 0, cam: 0 }, // não é o que está no envio
        respondidoPor: 'x',
        em: serverTimestamp(),
      }),
    );
  });

  test('não envia pela outra Cia, não lê o da outra e não marca "gravado"', async () => {
    await enviarDocMensal(cia('2cia'), { ...envio, unidadeId: '2cia' });
    await assertFails(enviarDocMensal(cia('3cia'), { ...envio, unidadeId: '2cia' }));
    await assertFails(getDoc(doc(cia('3cia'), 'docsMensais', 'veiculos-apreendidos_2026-10_2cia')));
    await assertFails(
      setDoc(doc(cia('3cia'), 'docsMensais', 'veiculos-apreendidos_2026-10_3cia'), {
        ...envio,
        unidadeId: '3cia',
        gravado: true,
        erro: '',
        enviadoEm: serverTimestamp(),
      }),
    );
    await assertFails(enviarDocMensal(como('sala', { perfil: 'sala' }), { ...envio, unidadeId: '2cia' }));
  });
});

describe('P/3: arquivo, "feito" e configuração', () => {
  test('a P/3 pede o arquivo, marca feito e publica a configuração; a Cia não', async () => {
    await assertSucceeds(pedirArquivamento(p3, 'veiculos-apreendidos', '2026-10'));
    await assertSucceeds(marcarFeito(p3, 'plano-diretor', '2026-10', true));
    expect((await getDoc(doc(p3, 'estadoDocsMensais', 'plano-diretor'))).data()).toEqual({ feitos: { '2026-10': true } });
    await assertFails(setDoc(doc(p3, 'estadoDocsMensais', 'plano-diretor'), { mesRef: '2026-12' }, { merge: true }));
    expect(await publicarConfig(p3)).toBe(true);
    expect(await publicarConfig(p3)).toBe(false); // mesma versão: não grava de novo

    await assertFails(pedirArquivamento(cia('1cia'), 'veiculos-apreendidos', '2026-10'));
    await assertFails(publicarConfig(cia('1cia')));
  });
});
