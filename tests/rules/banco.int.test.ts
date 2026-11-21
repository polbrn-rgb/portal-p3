import { readFileSync } from 'node:fs';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { carregarFontesBanco } from '../../src/data/banco';
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
});
