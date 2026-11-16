import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { alterarLista, observarListas } from '../../src/data/listas';
import { adicionarItem, alternarItem, listasPadrao, type Listas } from '../../src/domain/listasConfig';

let env: RulesTestEnvironment;
let p3: Firestore;
let admin: Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-portal-p3', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  p3 = env.authenticatedContext('conta-p3', { perfil: 'p3' }).firestore() as unknown as Firestore;
  admin = env.authenticatedContext('conta-admin', { perfil: 'admin' }).firestore() as unknown as Firestore;
});

function listasAgora(db: Firestore, quando: (l: Listas) => boolean): Promise<Listas> {
  return new Promise((ok, falha) => {
    const parar = observarListas(db, (l) => quando(l) && (parar(), ok(l)), falha);
  });
}

describe('listas do numerador', () => {
  test('sem nada gravado a P/3 vê as padrão', async () => {
    expect(await listasAgora(p3, () => true)).toEqual(listasPadrao());
  });

  test('o Administrador inclui e retira; a P/3 vê na hora', async () => {
    expect(await alterarLista(admin, 'responsaveis', (l) => adicionarItem(l, 'Sd Novo'))).toBe('');
    expect(await alterarLista(admin, 'responsaveis', (l) => alternarItem('responsaveis', l, 'Cap Filipi'))).toBe('');
    const l = await listasAgora(p3, (x) => x.responsaveis.some((i) => i.valor === 'Sd Novo'));
    expect(l.responsaveis.find((i) => i.valor === 'Cap Filipi')).toEqual({ valor: 'Cap Filipi', ativo: false });
    // Erro de regra de negócio volta como mensagem e não grava nada.
    expect(await alterarLista(admin, 'responsaveis', (x) => adicionarItem(x, 'sd novo'))).toBe('Esse item já está na lista.');
  });

  test('a P/3 não muda as listas, mas continua gravando as outras configurações', async () => {
    await expect(alterarLista(p3, 'responsaveis', (l) => adicionarItem(l, 'Sd X'))).rejects.toThrow();
    await expect(setDoc(doc(p3, 'config/listas'), { responsaveis: [] })).rejects.toThrow();
    await setDoc(doc(p3, 'config/docsMensais'), { documentos: [] });
  });
});
