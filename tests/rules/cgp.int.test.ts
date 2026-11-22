import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  anexarOrdemLink,
  apagarFotoCgp,
  apagarOrdemCgp,
  enviarAoCgp,
  enviarFotosCgp,
  enviarRecadoCgp,
  excluirMissaoCgp,
  JaEnviadaAoCgp,
  lerFotoCgp,
  lerOrdemPdf,
  observarFotosCgp,
  observarMissoesCgp,
  observarOrdensCgp,
  observarRecadosCgp,
  type RecadoCgp,
} from '../../src/data/cgp';
import type { FotoCgp, MissaoCgp, OrdemCgp } from '../../src/domain/cgp';
import {
  apagarFotosEncaminhadas,
  contarFotosEncaminhadas,
  encaminharFotoP3,
  lerFotoEncaminhada,
  observarEncaminhadasDaCia,
  observarFotosEncaminhadas,
} from '../../src/data/fotosEncaminhadas';

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

describe('fotos do CGP encaminhadas à P/3', () => {
  const dados = { descricao: 'Operação Natal', local: 'Praça', observacao: 'VTR 08101' };
  async function fotoDa(u: '1cia' | '2cia') {
    await enviarFotosCgp(como({ perfil: 'cgp', unidade: u, re: '444444' }), u, dados, [{ dados: 'QUJDRA==', miniatura: 'QQ==' }], 'Sd PM CGP');
    return (await uma<FotoCgp[]>((ok, e) => observarFotosCgp(cia(u), u, ok, e)))[0];
  }
  const p3 = () => como({ perfil: 'p3' });

  test('a Cia encaminha; a P/3 vê, baixa e apaga; a cópia fica mesmo se o CGP apagar a dele', async () => {
    const f = await fotoDa('1cia');
    await assertSucceeds(encaminharFotoP3(cia('1cia'), f, '1ª CIA'));
    expect(await uma<Set<string>>((ok, e) => observarEncaminhadasDaCia(cia('1cia'), '1cia', ok, e))).toEqual(new Set([f.id]));
    await assertSucceeds(apagarFotoCgp(cia('1cia'), f.id));

    const lista = await new Promise<{ id: string; encaminhadaPor: string; descricao: string }[]>((ok, falha) => {
      const parar = observarFotosEncaminhadas(p3(), (l) => (setTimeout(() => parar()), ok(l)), falha);
    });
    expect(lista.map((x) => [x.id, x.encaminhadaPor, x.descricao])).toEqual([[f.id, '1ª CIA', 'Operação Natal']]);
    expect(await contarFotosEncaminhadas(p3())).toBe(1);
    expect(await lerFotoEncaminhada(p3(), f.id)).toBe('QUJDRA==');
    // A Cia não baixa nem apaga a cópia da P/3.
    await assertFails(lerFotoEncaminhada(cia('1cia'), f.id));
    await assertFails(apagarFotosEncaminhadas(cia('1cia'), [f.id]));
    await assertSucceeds(apagarFotosEncaminhadas(p3(), [f.id]));
    expect(await contarFotosEncaminhadas(p3())).toBe(0);
  });

  test('só a Cia dona da foto encaminha (nem outra Cia, nem o CGP), e a mesma foto vai uma vez', async () => {
    const f = await fotoDa('1cia');
    await assertFails(encaminharFotoP3(cia('2cia'), f, '2ª CIA'));
    await assertFails(encaminharFotoP3(como({ perfil: 'cgp', unidade: '1cia', re: '444444' }), f, 'CGP'));
    await assertFails(encaminharFotoP3(cia('2cia'), { ...f, unidadeId: '2cia' }, '2ª CIA'));
    await assertSucceeds(encaminharFotoP3(cia('1cia'), f, '1ª CIA'));
    await assertFails(encaminharFotoP3(cia('1cia'), f, '1ª CIA'));
    // Outra Cia não vê o que a 1ª encaminhou.
    await assertFails(getDocs(query(collection(cia('2cia'), 'fotosEncaminhadas'), where('unidadeId', '==', '1cia'))));
  });

  test('a cópia tem que ser fiel: texto trocado ou outra foto não entram', async () => {
    const f = await fotoDa('1cia');
    await assertFails(encaminharFotoP3(cia('1cia'), { ...f, descricao: 'Outra coisa' }, '1ª CIA'));
    const c = cia('1cia');
    const lote = writeBatch(c);
    lote.set(doc(c, 'fotosEncaminhadasDados', f.id), { unidadeId: '1cia', dados: 'T1VUUkE=' });
    lote.set(doc(c, 'fotosEncaminhadas', f.id), {
      unidadeId: '1cia', descricao: f.descricao, local: f.local, observacao: f.observacao, miniatura: f.miniatura, tamanho: 8,
      enviadoPor: f.enviadoPor, enviadoEm: serverTimestamp(), encaminhadaPor: '1ª CIA', encaminhadaEm: serverTimestamp(),
    });
    await assertFails(lote.commit());
  });
});

describe('ordem de serviço da missão do CGP', () => {
  const cgp = (u = '1cia') => como({ perfil: 'cgp', unidade: u, re: '444444' });
  const DRIVE = 'https://drive.google.com/file/d/1AbCdEf/view?usp=sharing';

  /** PDF já em partes, como o portal grava (o envio usa FileReader, que só existe no navegador). */
  async function gravarPdf(c: Firestore, id: string, cab: Record<string, unknown> = {}) {
    await setDoc(doc(c, 'ordensCgp', id, 'partes', '0'), { dados: 'JVBE' });
    await setDoc(doc(c, 'ordensCgp', id, 'partes', '1'), { dados: 'Rg==' });
    await setDoc(doc(c, 'ordensCgp', id), {
      unidadeId: '1cia', tipo: 'pdf', nome: 'OS 123.pdf', tamanho: 4, partes: 2, fim: '2026-11-27', enviadoPor: '1ª CIA', enviadoEm: serverTimestamp(), ...cab,
    });
  }

  test('a Cia anexa o PDF; ela e o CGP dela abrem; outra Cia e o CGP de outra não', async () => {
    const id = await enviarAoCgp(cia('1cia'), missao());
    await gravarPdf(cia('1cia'), id);
    const l = await uma<OrdemCgp[]>((ok, e) => observarOrdensCgp(cgp(), '1cia', ok, e));
    expect(l.map((o) => [o.id, o.tipo, o.nome, o.fim, o.enviadoPor])).toEqual([[id, 'pdf', 'OS 123.pdf', '2026-11-27', '1ª CIA']]);
    const { nome, blob } = await lerOrdemPdf(cgp(), id);
    expect(nome).toBe('OS 123.pdf');
    expect(Buffer.from(await blob.arrayBuffer()).toString()).toBe('%PDF');
    await assertSucceeds(lerOrdemPdf(cia('1cia'), id));

    await assertFails(lerOrdemPdf(cia('2cia'), id));
    await assertFails(lerOrdemPdf(cgp('2cia'), id));
    await assertFails(getDocs(query(collection(cia('2cia'), 'ordensCgp'), where('unidadeId', '==', '1cia'))));
    await assertFails(getDocs(collection(como({ perfil: 'p3' }), 'ordensCgp', id, 'partes')));
  });

  test('o CGP e outra Cia não anexam nem tiram; não anexa sem missão, com outro fim ou acima do limite', async () => {
    const id = await enviarAoCgp(cia('1cia'), missao());
    await assertFails(anexarOrdemLink(cgp(), { id, unidadeId: '1cia', fim: '2026-11-27' }, DRIVE, 'CGP'));
    await assertFails(setDoc(doc(cgp(), 'ordensCgp', id, 'partes', '0'), { dados: 'JVBE' }));
    await assertFails(anexarOrdemLink(cia('2cia'), { id, unidadeId: '1cia', fim: '2026-11-27' }, DRIVE, '2ª CIA'));
    // Missão que não existe / fim diferente do da missão.
    await assertFails(anexarOrdemLink(cia('1cia'), { id: '1cia_enc_nao_existe', unidadeId: '1cia', fim: '2026-11-27' }, DRIVE, '1ª CIA'));
    await assertFails(setDoc(doc(cia('1cia'), 'ordensCgp', '1cia_enc_nao_existe', 'partes', '0'), { dados: 'JVBE' }));
    await assertFails(anexarOrdemLink(cia('1cia'), { id, unidadeId: '1cia', fim: '2026-12-31' }, DRIVE, '1ª CIA'));
    // Acima de 10 MB, mais de 20 partes, link e partes juntos.
    await assertFails(gravarPdf(cia('1cia'), id, { tamanho: 10485761 }));
    await assertFails(gravarPdf(cia('1cia'), id, { partes: 21 }));
    await assertFails(gravarPdf(cia('1cia'), id, { link: DRIVE }));
    await assertFails(setDoc(doc(cia('1cia'), 'ordensCgp', id, 'partes', '20'), { dados: 'JVBE' }));

    // As partes que sobraram das tentativas recusadas saem antes (o portal sempre apaga antes de anexar).
    await apagarOrdemCgp(cia('1cia'), id);
    await gravarPdf(cia('1cia'), id);
    // Sem update: para trocar, apaga e anexa de novo.
    await assertFails(setDoc(doc(cia('1cia'), 'ordensCgp', id), { nome: 'outro.pdf' }, { merge: true }));
    await assertFails(apagarOrdemCgp(cgp(), id));
    await assertFails(apagarOrdemCgp(cia('2cia'), id));
  });

  test('link: só do Google Drive; trocar o PDF pelo link apaga as partes', async () => {
    const id = await enviarAoCgp(cia('1cia'), missao());
    const m = { id, unidadeId: '1cia' as const, fim: '2026-11-27' };
    await expect(anexarOrdemLink(cia('1cia'), m, 'https://exemplo.com/os.pdf', '1ª CIA')).rejects.toThrow(/Google Drive/);
    await assertFails(
      setDoc(doc(cia('1cia'), 'ordensCgp', id), {
        unidadeId: '1cia', tipo: 'link', nome: 'x', link: 'https://exemplo.com/os.pdf', fim: '2026-11-27', enviadoPor: '1ª CIA', enviadoEm: serverTimestamp(),
      }),
    );
    await gravarPdf(cia('1cia'), id);
    await anexarOrdemLink(cia('1cia'), m, DRIVE, '1ª CIA');
    const l = await uma<OrdemCgp[]>((ok, e) => observarOrdensCgp(cgp(), '1cia', ok, e));
    expect(l.map((o) => [o.tipo, o.link])).toEqual([['link', DRIVE]]);
    expect((await getDocs(collection(cia('1cia'), 'ordensCgp', id, 'partes'))).size).toBe(0);
  });

  test('excluir a missão do CGP tira a ordem junto', async () => {
    const id = await enviarAoCgp(cia('1cia'), missao());
    await gravarPdf(cia('1cia'), id);
    await excluirMissaoCgp(cia('1cia'), id);
    expect((await getDoc(doc(cia('1cia'), 'ordensCgp', id))).exists()).toBe(false);
    expect((await getDocs(collection(cia('1cia'), 'ordensCgp', id, 'partes'))).size).toBe(0);
  });
});
