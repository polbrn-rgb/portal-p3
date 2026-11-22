import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  buscarProducaoDoPeriodo,
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
  itens: { ...itensZerados(), pessoasAbordadas: 40, flagrante: 1, ocorrenciasComPrisao: 1, maconhaKg: 0.25, carrosRemovidos: 2 },
  taloes: [{ numero: '20261120510801', bopc: 'XY1234', data: '2026-11-20', natureza: 'trafico' as const }],
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
    expect(l.taloes).toEqual([{ numero: '20261120510801', bopc: 'XY1234', data: '2026-11-20', natureza: 'trafico' }]);
    expect(l.lancadoEm).toBeInstanceOf(Date);
  });

  test('outra Cia não lê nem grava; a P/3 lê todas, mas não grava', async () => {
    const id = await salvarProducao(cia('1cia'), lancamento());
    await salvarProducao(cia('ft'), lancamento({ unidade: 'ft', pelotao: 'pelB' }));
    await assertFails(getDoc(doc(cia('2cia'), 'producao', id)));
    await assertFails(getDocs(query(collection(cia('2cia'), 'producao'), where('unidadeId', '==', '1cia'), where('mes', '==', '2026-11'))));
    await assertFails(salvarProducao(cia('2cia'), lancamento()));
    await assertFails(excluirProducao(cia('2cia'), { id, unidadeId: '1cia', mes: '2026-11', itens: itensZerados(), taloes: [] }, 'x'));

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

    await assertSucceeds(excluirProducao(c, { id: '1cia_2026-11-21_pelA', unidadeId: '1cia', mes: '2026-11', itens: itensZerados(), taloes: [] }, 'Sd PM X'));
  });

  test('lançamento antigo (com "ciclomotores removidos" e sem os itens novos) e o novo valem; item novo negativo não', async () => {
    const c = cia('1cia');
    const { ...antigos } = itensZerados() as Record<string, number>;
    for (const k of ['armasBrancas', 'caminhoesApreendidos', 'trv', 'caminhoesRemovidos', 'escoltasRecebidas', 'escoltasAtendidas']) delete antigos[k];
    for (const t of ['bike', 'ciclo', 'auto']) for (const a of ['Vist', 'Rem', 'Loc', 'Aut']) delete antigos[`${t}${a}`];
    const base = {
      unidadeId: '1cia',
      data: '2026-11-22',
      mes: '2026-11',
      pelotao: 'pelA',
      taloes: [{ numero: '1', bopc: '', data: '2026-11-22' }],
      lancadoPor: 'x',
      lancadoEm: serverTimestamp(),
      atualizadoPor: 'x',
      atualizadoEm: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(c, 'producao', '1cia_2026-11-22_pelA'), { ...base, itens: { ...antigos, ciclomotoresRemovidos: 2 } }));
    await assertSucceeds(salvarProducao(c, lancamento({ itens: { ...itensZerados(), cicloVist: 3, trv: 1, escoltasRecebidas: 2 } })));
    await assertFails(salvarProducao(c, lancamento({ data: '2026-11-19', itens: { ...itensZerados(), bikeAut: -1 } })));
    await assertFails(salvarProducao(c, lancamento({ data: '2026-11-18', itens: { ...itensZerados(), trv: '1' } as never })));
    await assertFails(salvarProducao(c, lancamento({ data: '2026-11-18', itens: { ...itensZerados(), armas: true } as never })));
    await assertFails(salvarProducao(c, lancamento({ data: '2026-11-18', itens: { ...itensZerados(), armas: null } as never })));
    await assertFails(salvarProducao(c, lancamento({ data: '2026-11-18', itens: { ...itensZerados(), escoltasAtendidas: 100000 } })));
  });

  test('histórico: lançamento, correção e exclusão ficam guardados; ninguém altera, apaga ou inventa', async () => {
    const c = cia('1cia');
    const id = await salvarProducao(c, lancamento());
    await salvarProducao(c, lancamento({ itens: { ...itensZerados(), pessoasAbordadas: 45 }, por: 'Cb PM OUTRO' }));
    const [l] = await uma((ok, e) => observarProducaoDaCia(c, '1cia', '2026-11', ok, e));
    await excluirProducao(c, l, 'Sgt PM QUEM APAGOU');
    expect((await getDoc(doc(c, 'producao', id))).exists()).toBe(false);

    const h = await getDocs(query(collection(p3(), 'producaoHistorico'), orderBy('em')));
    expect(h.docs.map((d) => [d.data().acao, d.data().por, d.data().itens.pessoasAbordadas])).toEqual([
      ['lancado', 'Sd PM SALA (RE 111111)', 40],
      ['corrigido', 'Cb PM OUTRO', 45],
      ['excluido', 'Sgt PM QUEM APAGOU', 45],
    ]);
    expect(h.docs[0].data().taloes[0].natureza).toBe('trafico');
    await assertFails(getDocs(collection(c, 'producaoHistorico'))); // só a P/3 lê
    await assertFails(updateDoc(doc(c, 'producaoHistorico', h.docs[0].id), { por: 'outro' }));
    await assertFails(deleteDoc(doc(c, 'producaoHistorico', h.docs[0].id)));
    await assertFails(deleteDoc(doc(p3(), 'producaoHistorico', h.docs[0].id)));

    // Registro inventado (sem gravar a produção, ou com números diferentes dela) é recusado.
    const falso = { producaoId: '1cia_2026-11-20_pelB', unidadeId: '1cia', mes: '2026-11', acao: 'lancado', itens: itensZerados(), taloes: [], por: 'x', em: serverTimestamp() };
    await assertFails(addDoc(collection(c, 'producaoHistorico'), falso));
    await salvarProducao(c, lancamento({ pelotao: 'pelB' }));
    await assertFails(addDoc(collection(c, 'producaoHistorico'), { ...falso, acao: 'excluido' }));
    await assertFails(addDoc(collection(cia('2cia'), 'producaoHistorico'), { ...falso, unidadeId: '2cia', producaoId: '2cia_2026-11-20_pelB' }));
  });

  test('P/3 → Sala de Operações: resultados do período, de todas ou de uma unidade; Cia não consulta as outras', async () => {
    await salvarProducao(cia('1cia'), lancamento({ data: '2026-11-19' }));
    await salvarProducao(cia('1cia'), lancamento({ data: '2026-11-20', pelotao: 'pelB' }));
    await salvarProducao(cia('2cia'), lancamento({ unidade: '2cia', data: '2026-11-20' }));
    await salvarProducao(cia('ft'), lancamento({ unidade: 'ft', data: '2026-11-21' }));
    const ids = (l: Producao[]) => l.map((x) => x.id).sort();

    expect(ids(await buscarProducaoDoPeriodo(p3(), '2026-11-20', '2026-11-20'))).toEqual(['1cia_2026-11-20_pelB', '2cia_2026-11-20_pelA']);
    expect(ids(await buscarProducaoDoPeriodo(p3(), '2026-11-19', '2026-11-21'))).toHaveLength(4);
    expect(ids(await buscarProducaoDoPeriodo(p3(), '2026-11-19', '2026-11-21', '1cia'))).toEqual(['1cia_2026-11-19_pelA', '1cia_2026-11-20_pelB']);
    const [l] = await buscarProducaoDoPeriodo(p3(), '2026-11-21', '2026-11-21');
    expect(l).toMatchObject({ unidadeId: 'ft', lancadoPor: 'Sd PM SALA (RE 111111)' });
    expect(l.itens.pessoasAbordadas).toBe(40);
    expect(l.taloes[0].bopc).toBe('XY1234');

    // A Cia só consulta a dela.
    expect(ids(await buscarProducaoDoPeriodo(cia('1cia'), '2026-11-19', '2026-11-21', '1cia'))).toHaveLength(2);
    await assertFails(buscarProducaoDoPeriodo(cia('1cia'), '2026-11-19', '2026-11-21'));
    await assertFails(buscarProducaoDoPeriodo(cia('1cia'), '2026-11-19', '2026-11-21', '2cia'));
    await assertFails(buscarProducaoDoPeriodo(como({ perfil: 'sala' }), '2026-11-19', '2026-11-21'));
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
