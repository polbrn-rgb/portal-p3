import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { enviarAoCgp } from '../../src/data/cgp';
import { excluirDespacho, observarDespachosCgp, salvarDespacho } from '../../src/data/despachos';
import type { DespachoCgp } from '../../src/domain/despacho';

let env: RulesTestEnvironment;
let n = 0;
const como = (claims: Record<string, string>) => env.authenticatedContext(`u${n++}`, claims).firestore() as unknown as Firestore;
const cia = (u: string) => como({ perfil: 'unidade', unidade: u });
const cgp = (u: string) => como({ perfil: 'cgp', unidade: u, re: '144602' });

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-portal-p3', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

function uma(assinar: (ok: (v: DespachoCgp[]) => void, e: (x: Error) => void) => () => void): Promise<DespachoCgp[]> {
  return new Promise((ok, falha) => {
    const parar = assinar((v) => {
      setTimeout(() => parar());
      ok(v);
    }, falha);
  });
}

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
async function criarMissao(): Promise<string> {
  return enviarAoCgp(cia('1cia'), {
    unidade: '1cia',
    origem: 'numerador',
    refId: 'd1',
    numero: '8BPMM-001/303/26',
    titulo: 'Policiamento na praça',
    periodo: { inicio: '2026-11-24', fim: '2026-11-25' },
    criadoPor: '1ª CIA',
  });
}
const despacho = (missaoId: string, extra: Partial<Omit<DespachoCgp, 'id' | 'criadoEm'>> = {}): Omit<DespachoCgp, 'id' | 'criadoEm'> => ({
  unidadeId: '1cia',
  missaoId,
  numero: '8BPMM-001/303/26',
  titulo: 'Policiamento na praça',
  data: '2026-11-24',
  pelotao: 'A',
  texto: 'Policiamento realizado sem alterações.',
  assinante: '2º Sgt PM 144602-9 Sousa',
  assinatura: PNG,
  criadoPor: '2º Sgt PM Sousa (RE 144602)',
  ...extra,
});

describe('Despacho do CGP', () => {
  test('o CGP da Cia grava; Cia e CGP leem; só a Cia apaga', async () => {
    const missaoId = await criarMissao();
    const id = await salvarDespacho(cgp('1cia'), despacho(missaoId));
    const [d] = await uma((ok, e) => observarDespachosCgp(cia('1cia'), '1cia', ok, e));
    expect(d).toMatchObject({ id, pelotao: 'A', assinante: '2º Sgt PM 144602-9 Sousa', assinatura: PNG });
    await assertSucceeds(uma((ok, e) => observarDespachosCgp(cgp('1cia'), '1cia', ok, e)));
    await assertFails(excluirDespacho(cgp('1cia'), id));
    await assertSucceeds(excluirDespacho(cia('1cia'), id));
  });

  test('não grava sem assinatura, sem missão, em outra Cia, nem pela própria Cia', async () => {
    const missaoId = await criarMissao();
    await assertFails(salvarDespacho(cgp('1cia'), despacho(missaoId, { assinatura: '' })));
    await assertFails(salvarDespacho(cgp('1cia'), despacho('1cia_numerador_naoexiste')));
    await assertFails(salvarDespacho(cgp('2cia'), despacho(missaoId)));
    await assertFails(salvarDespacho(cgp('2cia'), despacho(missaoId, { unidadeId: '2cia' })));
    await assertFails(salvarDespacho(cia('1cia'), despacho(missaoId)));
    await assertFails(salvarDespacho(cgp('1cia'), despacho(missaoId, { pelotao: '' })));
    await assertFails(uma((ok, e) => observarDespachosCgp(cia('2cia'), '1cia', ok, e)));
  });
});
