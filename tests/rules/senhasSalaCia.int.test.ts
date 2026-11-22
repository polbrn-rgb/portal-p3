import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { excluirProducao, observarProducaoDaCia, salvarProducao } from '../../src/data/producao';
import { bloquearSalaCia, observarSenhasSalaCia, pedirSenhaSalaCia } from '../../src/data/senhasSalaCia';
import { itensZerados, type Producao } from '../../src/domain/producao';
import type { SenhaSalaCia } from '../../src/domain/salaCia';

let env: RulesTestEnvironment;
let n = 0;
const como = (claims: Record<string, string>) => env.authenticatedContext(`u${n++}`, claims).firestore() as unknown as Firestore;
const p3 = () => como({ perfil: 'p3' });
const salaDa = (u: string) => como({ perfil: 'salaCia', unidade: u });

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-portal-p3', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

function uma<T>(assinar: (ok: (v: T) => void, e: (x: Error) => void) => () => void): Promise<T> {
  return new Promise((ok, falha) => {
    const parar = assinar((v) => {
      setTimeout(() => parar());
      ok(v);
    }, falha);
  });
}

describe('senhas da Sala de Operações das Cias', () => {
  test('a P/3 gera a senha e bloqueia; lê a situação', async () => {
    await assertSucceeds(pedirSenhaSalaCia(p3(), '2cia', 'Abc234defg', 'Sd PM P3 (RE 111111)'));
    const [s] = await uma<SenhaSalaCia[]>((ok, e) => observarSenhasSalaCia(p3(), ok, e));
    expect(s).toMatchObject({ id: '2cia', ativo: true, sincronizar: true, status: 'pendente', pedidoPor: 'Sd PM P3 (RE 111111)' });
    await assertSucceeds(bloquearSalaCia(p3(), '2cia', true, 'P/3'));
  });

  test('ninguém além da P/3 lê ou grava (nem a Cia, nem a própria Sala)', async () => {
    await pedirSenhaSalaCia(p3(), '1cia', 'Abc234defg', 'P/3');
    for (const outro of [como({ perfil: 'unidade', unidade: '1cia' }), salaDa('1cia'), como({ perfil: 'sala' }), como({ perfil: 'cfp' })]) {
      await assertFails(getDoc(doc(outro, 'senhasSalaCia', '1cia')));
      await assertFails(getDocs(collection(outro, 'senhasSalaCia')));
      await assertFails(pedirSenhaSalaCia(outro, '1cia', 'Abc234defg', 'x'));
    }
  });

  test('o banco recusa: Cia que não existe, senha curta, campo a mais e status já "ok"', async () => {
    await assertFails(pedirSenhaSalaCia(p3(), 'p3' as never, 'Abc234defg', 'P/3'));
    await assertFails(pedirSenhaSalaCia(p3(), '1cia', 'curta', 'P/3'));
    const base = { unidade: '1cia', senha: 'Abc234defg', ativo: true, sincronizar: true, status: 'pendente', erro: '', pedidoPor: 'P/3', pedidoEm: serverTimestamp() };
    await assertSucceeds(setDoc(doc(p3(), 'senhasSalaCia', '1cia'), base));
    await assertFails(setDoc(doc(p3(), 'senhasSalaCia', '1cia'), { ...base, extra: 1 }));
    await assertFails(setDoc(doc(p3(), 'senhasSalaCia', '1cia'), { ...base, status: 'ok', sincronizar: false }));
    await assertFails(setDoc(doc(p3(), 'senhasSalaCia', '2cia'), base));
  });
});

describe('quem entra pela Sala de Operações da Cia', () => {
  const lancamento = (unidade: '1cia' | '2cia') => ({
    unidade,
    data: '2026-11-20',
    pelotao: 'pelB' as const,
    itens: { ...itensZerados(), pessoasAbordadas: 12 },
    taloes: [],
    por: 'Sala de Operações 1ª CIA',
  });

  test('lança, corrige, lê e exclui a produção da própria Cia', async () => {
    const id = await salvarProducao(salaDa('1cia'), lancamento('1cia'));
    await assertSucceeds(salvarProducao(salaDa('1cia'), { ...lancamento('1cia'), itens: { ...itensZerados(), pessoasAbordadas: 15 } }));
    const [l] = await uma<Producao[]>((ok, e) => observarProducaoDaCia(salaDa('1cia'), '1cia', '2026-11', ok, e));
    expect(l.itens.pessoasAbordadas).toBe(15);
    await assertSucceeds(excluirProducao(salaDa('1cia'), l, 'Sala de Operações 1ª CIA'));
    expect(id).toBe('1cia_2026-11-20_pelB');
  });

  test('não mexe na produção de outra Cia nem no resto da Cia (numerador, encaminhamentos)', async () => {
    await salvarProducao(como({ perfil: 'unidade', unidade: '2cia' }), lancamento('2cia'));
    await assertFails(salvarProducao(salaDa('1cia'), lancamento('2cia')));
    await assertFails(getDoc(doc(salaDa('1cia'), 'producao', '2cia_2026-11-20_pelB')));
    await assertFails(getDocs(collection(salaDa('1cia'), 'demandasCia')));
    await assertFails(getDocs(collection(salaDa('1cia'), 'encaminhamentos')));
    await assertFails(getDocs(collection(salaDa('1cia'), 'cgpMissoes')));
  });
});
