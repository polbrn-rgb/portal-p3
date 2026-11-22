import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { excluirProducao, observarProducaoDaCia, salvarProducao } from '../../src/data/producao';
import { itensZerados, type Producao } from '../../src/domain/producao';

// Acesso por RE com o perfil "Sala de Operações de Cia / FT" (o motor grava perfil 'salaCia' + unidade + re).
let env: RulesTestEnvironment;
let n = 0;
const como = (claims: Record<string, string>) => env.authenticatedContext(`u${n++}`, claims).firestore() as unknown as Firestore;
const salaDa = (u: string) => como({ perfil: 'salaCia', unidade: u, re: '555555' });

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-portal-p3', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

function uma(assinar: (ok: (v: Producao[]) => void, e: (x: Error) => void) => () => void): Promise<Producao[]> {
  return new Promise((ok, falha) => {
    const parar = assinar((v) => {
      setTimeout(() => parar());
      ok(v);
    }, falha);
  });
}

const lancamento = (unidade: '1cia' | '2cia') => ({
  unidade,
  data: '2026-11-20',
  pelotao: 'pelB' as const,
  itens: { ...itensZerados(), pessoasAbordadas: 12 },
  taloes: [],
  por: 'Cb PM SALA (RE 555555)',
});

describe('Sala de Operações da Cia (acesso por RE)', () => {
  test('lança, corrige, lê e exclui a produção da própria Cia', async () => {
    const id = await salvarProducao(salaDa('1cia'), lancamento('1cia'));
    expect(id).toBe('1cia_2026-11-20_pelB');
    await assertSucceeds(salvarProducao(salaDa('1cia'), { ...lancamento('1cia'), itens: { ...itensZerados(), pessoasAbordadas: 15 } }));
    const [l] = await uma((ok, e) => observarProducaoDaCia(salaDa('1cia'), '1cia', '2026-11', ok, e));
    expect(l).toMatchObject({ lancadoPor: 'Cb PM SALA (RE 555555)' });
    expect(l.itens.pessoasAbordadas).toBe(15);
    await assertSucceeds(excluirProducao(salaDa('1cia'), l, 'Cb PM SALA (RE 555555)'));
  });

  test('não mexe na produção de outra Cia nem no resto da Cia (numerador, encaminhamentos, CGP)', async () => {
    await salvarProducao(como({ perfil: 'unidade', unidade: '2cia' }), lancamento('2cia'));
    await assertFails(salvarProducao(salaDa('1cia'), lancamento('2cia')));
    await assertFails(getDoc(doc(salaDa('1cia'), 'producao', '2cia_2026-11-20_pelB')));
    await assertFails(getDocs(collection(salaDa('1cia'), 'demandasCia')));
    await assertFails(getDocs(collection(salaDa('1cia'), 'encaminhamentos')));
    await assertFails(getDocs(collection(salaDa('1cia'), 'cgpMissoes')));
    await assertFails(getDocs(collection(salaDa('1cia'), 'acessos')));
  });
});
