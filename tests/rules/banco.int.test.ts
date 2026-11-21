import { readFileSync } from 'node:fs';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { carregarFontesBanco, carregarHistorico, garantirCopiaAutomatica, observarCopias, pedirCopia, type CopiaBanco } from '../../src/data/banco';
import { enviarDocMensal } from '../../src/data/documentosMensais';
import { salvarProducao } from '../../src/data/producao';
import { itensZerados } from '../../src/domain/producao';

let env: RulesTestEnvironment;
let n = 0;
const como = (claims: Record<string, string>) => env.authenticatedContext(`b${n++}`, claims).firestore() as unknown as Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-portal-p3', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

describe('banco de dados', () => {
  test('a P/3 carrega o período (produção, documentos e RAC); a Cia não', async () => {
    const cia = como({ perfil: 'unidade', unidade: '1cia' });
    await salvarProducao(cia, { unidade: '1cia', data: '2026-10-05', pelotao: 'pelA', itens: { ...itensZerados(), ai: 2 }, taloes: [], por: 'x' });
    await salvarProducao(cia, { unidade: '1cia', data: '2026-12-01', pelotao: 'pelA', itens: itensZerados(), taloes: [], por: 'x' });
    await enviarDocMensal(cia, { docId: 'veiculos-apreendidos', mesRef: '2026-10', unidadeId: '1cia', valores: { v4: 1, v2: 0, cam: 0 }, respondidoPor: 'x' });

    const f = await carregarFontesBanco(como({ perfil: 'p3' }), '2026-09', '2026-11');
    expect(f.producao.map((l) => l.data)).toEqual(['2026-10-05']);
    expect(f.envios.map((e) => e.docId)).toEqual(['veiculos-apreendidos']);
    expect(f.racs).toEqual([]);
    await assertFails(carregarFontesBanco(cia, '2026-09', '2026-11'));
  });

  test('cópia de segurança: a P/3 pede (em partes) e vê a lista; a Cia não; a automática só uma vez por mês', async () => {
    const p3 = como({ perfil: 'p3' });
    const cia = como({ perfil: 'unidade', unidade: '1cia' });
    await salvarProducao(cia, { unidade: '1cia', data: '2026-10-05', pelotao: 'pelA', itens: itensZerados(), taloes: [], por: 'x' });
    const id = await pedirCopia(p3, { de: '2026-01', ate: '2026-10', xlsx: new Uint8Array([1, 2, 3]), automatica: false });
    expect(id).toBe('2026-01_2026-10');
    expect((await getDoc(doc(p3, 'backupBanco', id, 'partes', '0'))).data()).toEqual({ dados: 'AQID' });

    expect(await garantirCopiaAutomatica(p3, '2026-10', '2026-11-20')).toBe('2026-10');
    expect(await garantirCopiaAutomatica(p3, '2026-10', '2026-11-21')).toBeNull(); // já existe
    expect(await garantirCopiaAutomatica(p3, null, '2026-11-02')).toBeNull();
    const lista = await new Promise<CopiaBanco[]>((ok, falha) => {
      const parar = observarCopias(p3, (l) => (setTimeout(parar), ok(l)), falha);
    });
    expect(lista.map((c) => [c.id, c.status, c.automatica])).toEqual([
      ['2026-10', 'pedido', true],
      ['2026-01_2026-10', 'pedido', false],
    ]);

    await assertFails(pedirCopia(cia, { de: '2026-10', ate: '2026-10', xlsx: new Uint8Array([1]), automatica: false }));
    await assertFails(getDoc(doc(cia, 'backupBanco', '2026-10')));
    // O portal não marca "pronto" nem grava o link (isso é do motor); id tem que bater com o período.
    const base = { de: '2026-09', ate: '2026-09', nome: 'x.xlsx', tamanho: 1, partes: 1, status: 'pedido', automatica: false, pedidoEm: serverTimestamp() };
    await assertFails(setDoc(doc(p3, 'backupBanco', '2026-09'), { ...base, status: 'pronto' }));
    await assertFails(setDoc(doc(p3, 'backupBanco', '2026-09'), { ...base, url: 'http://x' }));
    await assertFails(setDoc(doc(p3, 'backupBanco', '2026-08'), base));
  });

  test('histórico do período (só a P/3)', async () => {
    const cia = como({ perfil: 'unidade', unidade: '1cia' });
    await salvarProducao(cia, { unidade: '1cia', data: '2026-10-05', pelotao: 'pelA', itens: { ...itensZerados(), ai: 1 }, taloes: [], por: 'Sd A' });
    await enviarDocMensal(cia, { docId: 'veiculos-apreendidos', mesRef: '2026-10', unidadeId: '1cia', valores: { v4: 1, v2: 0, cam: 0 }, respondidoPor: 'Cb B' });
    const h = await carregarHistorico(como({ perfil: 'p3' }), '2026-10', '2026-10');
    expect(h.producao.map((x) => [x.acao, x.por, x.itens.ai])).toEqual([['lancado', 'Sd A', 1]]);
    expect(h.envios.map((x) => [x.docId, x.respondidoPor])).toEqual([['veiculos-apreendidos', 'Cb B']]);
    await assertFails(carregarHistorico(cia, '2026-10', '2026-10'));
  });
});
