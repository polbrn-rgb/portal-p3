import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  apagarFotoCgp,
  enviarAoCgp,
  enviarFotosCgp,
  enviarRecadoCgp,
  excluirMissaoCgp,
  JaEnviadaAoCgp,
  lerFotoCgp,
  observarFotosCgp,
  observarMissoesCgp,
  observarRecadosCgp,
  type RecadoCgp,
} from '../../src/data/cgp';
import type { FotoCgp, MissaoCgp } from '../../src/domain/cgp';

let env: RulesTestEnvironment;
let n = 0;
const como = (claims: Record<string, string>) => env.authenticatedContext(`u${n++}`, claims).firestore() as unknown as Firestore;
const cia = (u: string) => como({ perfil: 'unidade', unidade: u });

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

const missao = (refId = '2151_1cia') => ({
  unidade: '1cia' as const,
  origem: 'enc' as const,
  refId,
  numero: 'Nº 2151',
  titulo: 'Operação Natal',
  periodo: { inicio: '2026-11-17', fim: '2026-11-27' },
  criadoPor: '1ª CIA',
});

describe('CGP das Cias', () => {
  test('envia uma vez só; a outra Cia não vê; a Cia exclui e pode enviar de novo', async () => {
    const c1 = cia('1cia');
    const id = await enviarAoCgp(c1, missao());
    await expect(enviarAoCgp(cia('1cia'), missao())).rejects.toBeInstanceOf(JaEnviadaAoCgp);
    const lista = await uma<MissaoCgp[]>((ok, e) => observarMissoesCgp(cia('1cia'), '1cia', ok, e));
    expect(lista.map((m) => [m.inicio, m.fim])).toEqual([['2026-11-17', '2026-11-27']]);

    await assertFails(getDoc(doc(cia('2cia'), 'cgpMissoes', id)));
    await assertFails(getDocs(query(collection(cia('2cia'), 'cgpMissoes'), where('unidadeId', '==', '1cia'))));
    await assertFails(enviarAoCgp(cia('2cia'), missao('outra')));
    await assertFails(excluirMissaoCgp(cia('2cia'), id));
    await assertFails(getDocs(collection(como({ perfil: 'p3' }), 'cgpMissoes')));

    await assertSucceeds(excluirMissaoCgp(cia('1cia'), id));
    await assertSucceeds(enviarAoCgp(cia('1cia'), missao()));
  });

  test('recados: a Cia escreve e lê os seus', async () => {
    await enviarRecadoCgp(cia('ft'), 'ft', 'Reforço na sexta', 'Sgt Fulano (RE 123456)');
    const l = await uma<RecadoCgp[]>((ok, e) => observarRecadosCgp(cia('ft'), 'ft', ok, e));
    expect(l.map((r) => [r.texto, r.criadoPor])).toEqual([['Reforço na sexta', 'Sgt Fulano (RE 123456)']]);
    await assertFails(addDoc(collection(cia('2cia'), 'recadosCgp'), { unidadeId: 'ft', texto: 'x', criadoPor: 'x', criadoEm: serverTimestamp() }));
  });

  test('fotos: sem limite, com quem importou; campos obrigatórios; outra Cia não vê', async () => {
    const fotos = Array.from({ length: 7 }, () => ({ dados: 'QUJD', miniatura: 'QQ==' }));
    const dados = { descricao: 'Intensificação', local: 'Av. Brasil', observacao: 'Equipe 2, VTR 08-001' };
    expect(await enviarFotosCgp(cia('3cia'), '3cia', dados, fotos, '3ª CIA')).toBe(7);
    const l = await uma<FotoCgp[]>((ok, e) => observarFotosCgp(cia('3cia'), '3cia', ok, e));
    expect(l).toHaveLength(7);
    expect(l[0]).toMatchObject({ ...dados, enviadoPor: '3ª CIA' });
    expect(l[0].enviadoEm).toBeInstanceOf(Date);
    expect(await lerFotoCgp(cia('3cia'), l[0].id)).toBe('QUJD');
    await assertFails(lerFotoCgp(cia('4cia'), l[0].id));

    // Sem observação: o banco recusa mesmo sem passar pela tela.
    const c = cia('3cia');
    const ref = doc(collection(c, 'fotosCgp'));
    const lote = writeBatch(c);
    lote.set(doc(c, 'fotosCgpDados', ref.id), { unidadeId: '3cia', dados: 'QUJD' });
    lote.set(ref, { ...dados, observacao: '', unidadeId: '3cia', miniatura: '', tamanho: 4, enviadoPor: 'x', enviadoEm: serverTimestamp() });
    await assertFails(lote.commit());

    await assertFails(apagarFotoCgp(cia('4cia'), l[0].id));
    await assertSucceeds(apagarFotoCgp(cia('3cia'), l[0].id));
  });
});

describe('acesso do CGP (perfil cgp + Cia)', () => {
  test('vê missões, recados e fotos da sua Cia; importa fotos; não envia nem exclui missão; não vê outra Cia', async () => {
    const id = await enviarAoCgp(cia('1cia'), missao());
    await enviarRecadoCgp(cia('1cia'), '1cia', 'Atenção', '1ª CIA');
    const cgp = () => como({ perfil: 'cgp', unidade: '1cia', re: '444444' });
    const outro = () => como({ perfil: 'cgp', unidade: '2cia', re: '555555' });

    expect(await uma<MissaoCgp[]>((ok, e) => observarMissoesCgp(cgp(), '1cia', ok, e))).toHaveLength(1);
    expect(await uma<RecadoCgp[]>((ok, e) => observarRecadosCgp(cgp(), '1cia', ok, e))).toHaveLength(1);
    await assertFails(excluirMissaoCgp(cgp(), id));
    await assertFails(enviarAoCgp(cgp(), missao('nova')));
    await assertFails(enviarRecadoCgp(cgp(), '1cia', 'x', 'CGP'));
    await assertFails(getDocs(query(collection(outro(), 'cgpMissoes'), where('unidadeId', '==', '1cia'))));

    const dados = { descricao: 'Operação', local: 'Centro', observacao: 'Equipe 3' };
    expect(await enviarFotosCgp(cgp(), '1cia', dados, [{ dados: 'QUJD', miniatura: '' }], 'Sd PM CGP (RE 444444)')).toBe(1);
    await assertFails(enviarFotosCgp(outro(), '1cia', dados, [{ dados: 'QUJD', miniatura: '' }], 'x'));
    const fotos = await uma<FotoCgp[]>((ok, e) => observarFotosCgp(cia('1cia'), '1cia', ok, e));
    expect(fotos[0].enviadoPor).toBe('Sd PM CGP (RE 444444)');
  });
});
