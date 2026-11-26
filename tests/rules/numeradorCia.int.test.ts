import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { COLECAO_AGENDA_SETORES } from '../../src/data/agenda';
import { alterarStatusDemandaCia, atualizarDemandaCia, criarDemandaCia, excluirDemandaCia } from '../../src/data/numeradorCia';
import { COLECAO_DEMANDAS_CIA, demandaCiaVazia, type DemandaCia } from '../../src/domain/numeradorCia';

let env: RulesTestEnvironment;
const como = (uid: string, claims: Record<string, string>) => env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;
let cia1: Firestore;
let cia2: Firestore;
let ft: Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-portal-p3', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  cia1 = como('c1', { perfil: 'unidade', unidade: '1cia' });
  cia2 = como('c2', { perfil: 'unidade', unidade: '2cia' });
  ft = como('ft', { perfil: 'unidade', unidade: 'ft' });
});

const dados = (extra = {}) => ({ ...demandaCiaVazia('2027-02-01'), saida: 'Escala de serviço', prazo: '2027-02-10', ...extra });

async function ler(db: Firestore, id: string): Promise<DemandaCia> {
  const s = await getDoc(doc(db, COLECAO_DEMANDAS_CIA, id));
  return { ...(s.data() as Omit<DemandaCia, 'id'>), id };
}

describe('numerador das Cias', () => {
  test('cada Cia tem a sua sequência e o prazo vai para a agenda dela', async () => {
    const a = await criarDemandaCia(cia1, '1cia', dados(), '1ª CIA');
    const b = await criarDemandaCia(cia1, '1cia', dados(), '1ª CIA');
    const c = await criarDemandaCia(cia2, '2cia', dados(), '2ª CIA');
    const f = await criarDemandaCia(ft, 'ft', dados({ dataEntrada: '2026-11-19', prazo: '' }), 'FT');
    expect([a.numeroDocumento, b.numeroDocumento, c.numeroDocumento, f.numeroDocumento]).toEqual([
      'OFÍCIO 8BPMM-001/103/27',
      'OFÍCIO 8BPMM-002/103/27',
      'OFÍCIO 8BPMM-001/203/27',
      'OFÍCIO 8BPMM-001/703/26',
    ]);
    const ag = await getDocs(query(collection(cia1, COLECAO_AGENDA_SETORES), where('dono', '==', '1cia')));
    expect(ag.docs.map((d) => d.data().data)).toEqual(['2027-02-10', '2027-02-10']);
    const agFt = await getDocs(query(collection(ft, COLECAO_AGENDA_SETORES), where('dono', '==', 'ft')));
    expect(agFt.size).toBe(0);
  });

  test('uma Cia não vê nem cria no numerador da outra', async () => {
    const a = await criarDemandaCia(cia1, '1cia', dados(), '1ª CIA');
    await assertFails(getDoc(doc(cia2, COLECAO_DEMANDAS_CIA, a.id)));
    await assertFails(criarDemandaCia(cia2, '1cia', dados(), '2ª CIA'));
    await assertFails(getDocs(query(collection(cia2, COLECAO_DEMANDAS_CIA), where('unidadeId', '==', '1cia'))));
    await assertSucceeds(getDocs(query(collection(cia1, COLECAO_DEMANDAS_CIA), where('unidadeId', '==', '1cia'))));
  });

  test('não dá para pular número nem mudar o número depois', async () => {
    await assertFails(setDoc(doc(cia1, 'contadoresCia', '1cia_2027_OFICIO'), { ultimo: 50, unidadeId: '1cia' }));
    const a = await criarDemandaCia(cia1, '1cia', dados(), '1ª CIA');
    const { updateDoc } = await import('firebase/firestore');
    await assertFails(updateDoc(doc(cia1, COLECAO_DEMANDAS_CIA, a.id), { numeroDocumento: 'OFÍCIO 8BPMM-999/103/27' }));
  });

  test('editar, concluir e excluir acertam a agenda', async () => {
    const a = await criarDemandaCia(cia1, '1cia', dados(), '1ª CIA');
    let d = await ler(cia1, a.id);
    await atualizarDemandaCia(cia1, d, { ...d, prazo: '2027-02-20' }, '1ª CIA');
    d = await ler(cia1, a.id);
    const ev = () => getDoc(doc(cia1, COLECAO_AGENDA_SETORES, d.agendaId));
    expect((await ev()).data()?.data).toBe('2027-02-20');
    await alterarStatusDemandaCia(cia1, d, 'concluida', '1ª CIA');
    expect((await ev()).data()?.titulo).toMatch(/^✔ /);
    d = await ler(cia1, a.id);
    await excluirDemandaCia(cia1, d);
    expect((await getDocs(query(collection(cia1, COLECAO_AGENDA_SETORES), where('dono', '==', '1cia')))).size).toBe(0);
  });

  test('Ordem Verbal: o banco recusa sem quem deu a ordem; a antiga sem o campo ainda conclui', async () => {
    await expect(criarDemandaCia(cia2, '2cia', dados({ origem: 'Ordem Verbal' }), '2ª CIA')).rejects.toThrow(/quem deu a ordem/);
    // Mesmo pulando a tela: sem o campo, o banco não aceita; com ele, a mesma gravação passa.
    const { writeBatch } = await import('firebase/firestore');
    const gravar = (quemOrdenou: string) => {
      const lote = writeBatch(cia2);
      lote.set(doc(cia2, 'contadoresCia', '2cia_2027_OFICIO'), { ultimo: 1, unidadeId: '2cia' });
      lote.set(doc(cia2, COLECAO_DEMANDAS_CIA, '2cia_2027_OFICIO_1'), {
        ...dados({ origem: 'Ordem Verbal', quemOrdenou }), unidadeId: '2cia', contadorId: '2cia_2027_OFICIO', ano: 2027, sequencia: 1,
        numeroDocumento: 'OFÍCIO 8BPMM-001/203/27', status: 'em_aberto', agendaId: '', criadoPor: '2ª CIA',
      });
      return lote.commit();
    };
    await assertFails(gravar(''));
    await assertSucceeds(gravar('Maj PM Beltrano'));
    expect((await ler(cia2, '2cia_2027_OFICIO_1')).quemOrdenou).toBe('Maj PM Beltrano');

    // Demanda gravada antes do campo existir (sem quemOrdenou): continua podendo ser concluída.
    const { quemOrdenou: _semCampo, ...vazia } = demandaCiaVazia('2027-02-01');
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), COLECAO_DEMANDAS_CIA, 'antiga'), {
        ...vazia, saida: 'Antiga', origem: 'Ordem Verbal', unidadeId: '2cia',
        contadorId: '2cia_2027_OFICIO', ano: 2027, sequencia: 99, numeroDocumento: 'x', status: 'em_aberto', agendaId: '', criadoPor: '2ª CIA',
      });
    });
    const antiga = await ler(cia2, 'antiga');
    await assertSucceeds(alterarStatusDemandaCia(cia2, antiga, 'concluida', '2ª CIA'));
  });

  test('vários celulares da mesma Cia numerando ao mesmo tempo: todos salvam, sem repetir', async () => {
    const r = await Promise.all(Array.from({ length: 8 }, (_, i) =>
      criarDemandaCia(como(`cia1-cel-${i}`, { perfil: 'unidade', unidade: '1cia' }), '1cia', dados(), '1ª CIA')));
    expect(new Set(r.map((x) => x.numeroDocumento)).size).toBe(8);
  });
});
