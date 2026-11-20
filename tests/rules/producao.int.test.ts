import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  excluirProducao,
  observarPrimeiroLancamento,
  observarPrimeirosLancamentos,
  observarProducaoDaCia,
  observarProducaoDoMes,
  salvarProducao,
} from '../../src/data/producao';
import { itensZerados, type Producao } from '../../src/domain/producao';

let env: RulesTestEnvironment;
let n = 0;
const como = (claims: Record<string, string>) => env.authenticatedContext(`u${n++}`, claims).firestore() as unknown as Firestore;
const cia = (u: string) => como({ perfil: 'unidade', unidade: u });
const p3 = () => como({ perfil: 'p3' });

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

const lancamento = (extra: Partial<Parameters<typeof salvarProducao>[1]> = {}) => ({
  unidade: '1cia' as const,
  data: '2026-11-20',
  pelotao: 'pelA' as const,
  itens: { ...itensZerados(), pessoasAbordadas: 40, flagrante: 1, ocorrenciasComPrisao: 1, entorpecentesKg: 0.25 },
  taloes: [{ numero: '20261120510801', data: '2026-11-20' }],
  por: 'Sd PM SALA (RE 111111)',
  ...extra,
});

describe('produção diária dos pelotões', () => {
  test('a Cia lança e corrige: quem lançou primeiro fica; quem corrigiu também', async () => {
    const id = await salvarProducao(cia('1cia'), lancamento());
    expect(id).toBe('1cia_2026-11-20_pelA');
    await salvarProducao(cia('1cia'), lancamento({ itens: { ...itensZerados(), pessoasAbordadas: 45 }, por: 'Cb PM OUTRO (RE 222222)' }));
    const [l] = await uma((ok, e) => observarProducaoDaCia(cia('1cia'), '1cia', '2026-11', ok, e));
    expect(l).toMatchObject({ pelotao: 'pelA', lancadoPor: 'Sd PM SALA (RE 111111)', atualizadoPor: 'Cb PM OUTRO (RE 222222)' });
    expect(l.itens.pessoasAbordadas).toBe(45);
    expect(l.lancadoEm).toBeInstanceOf(Date);
  });

  test('outra Cia não lê nem grava; a P/3 lê todas, mas não grava', async () => {
    const id = await salvarProducao(cia('1cia'), lancamento());
    await salvarProducao(cia('ft'), lancamento({ unidade: 'ft', pelotao: 'pelB' }));
    await assertFails(getDoc(doc(cia('2cia'), 'producao', id)));
    await assertFails(getDocs(query(collection(cia('2cia'), 'producao'), where('unidadeId', '==', '1cia'), where('mes', '==', '2026-11'))));
    await assertFails(salvarProducao(cia('2cia'), lancamento()));
    await assertFails(excluirProducao(cia('2cia'), id));

    const todas = await uma((ok, e) => observarProducaoDoMes(p3(), '2026-11', ok, e));
    expect(todas.map((l) => l.unidadeId).sort()).toEqual(['1cia', 'ft']);
    await assertFails(salvarProducao(p3(), lancamento()));
    await assertFails(getDocs(collection(como({ perfil: 'cfp' }), 'producao')));
  });

  test('o banco recusa: pelotão que a unidade não tem, número negativo, item a mais, dia trocado e "lançado por" alterado', async () => {
    await assertFails(salvarProducao(cia('ft'), lancamento({ unidade: 'ft', pelotao: 'pelC' })));
    await assertFails(salvarProducao(cia('1cia'), lancamento({ itens: { ...itensZerados(), armas: -1 } })));
    await assertFails(salvarProducao(cia('1cia'), lancamento({ itens: { ...itensZerados(), extra: 1 } as never })));

    const c = cia('1cia');
    const base = {
      unidadeId: '1cia',
      data: '2026-11-21',
      mes: '2026-11',
      pelotao: 'pelA',
      itens: itensZerados(),
      taloes: [],
      lancadoPor: 'x',
      lancadoEm: serverTimestamp(),
      atualizadoPor: 'x',
      atualizadoEm: serverTimestamp(),
    };
    // id diferente do dia/pelotão gravados
    await assertFails(setDoc(doc(c, 'producao', '1cia_2026-11-20_pelA'), base));
    // mês que não bate com o dia
    await assertFails(setDoc(doc(c, 'producao', '1cia_2026-11-21_pelA'), { ...base, mes: '2026-10' }));
    await assertSucceeds(setDoc(doc(c, 'producao', '1cia_2026-11-21_pelA'), base));
    await assertFails(updateDoc(doc(c, 'producao', '1cia_2026-11-21_pelA'), { lancadoPor: 'outro', atualizadoEm: serverTimestamp() }));

    await assertSucceeds(excluirProducao(c, '1cia_2026-11-21_pelA'));
  });

  test('primeiro lançamento de cada Cia (início da contagem das pendências)', async () => {
    const primeiro = (db: Firestore, u: '1cia' | '2cia') =>
      new Promise<string | null>((ok, falha) => {
        const parar = observarPrimeiroLancamento(db, u, (d) => {
          setTimeout(() => parar());
          ok(d);
        }, falha);
      });
    expect(await primeiro(cia('1cia'), '1cia')).toBeNull();
    await salvarProducao(cia('1cia'), lancamento({ data: '2026-11-21' }));
    await salvarProducao(cia('1cia'), lancamento({ data: '2026-11-19', pelotao: 'pelB' }));
    expect(await primeiro(cia('1cia'), '1cia')).toBe('2026-11-19');
    await assertFails(primeiro(cia('2cia'), '1cia' as '2cia'));
    const p = await new Promise((ok, falha) => {
      const parar = observarPrimeirosLancamentos(p3(), ['1cia', '2cia'], (r) => {
        setTimeout(() => parar());
        ok(r);
      }, falha);
    });
    expect(p).toEqual({ '1cia': '2026-11-19', '2cia': null });
  });
});
