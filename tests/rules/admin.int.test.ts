import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { concluirZeragem, definirContador, iniciarZeragem, lerContadores, ZeragemNaoPronta } from '../../src/data/admin';
import { criarDemanda, criarDemandaNumerada, obterDemanda, atualizarDemanda, encaminhamentosDaDemanda } from '../../src/data/demandas';
import { dadosDe, demandaVazia, type DadosDemanda } from '../../src/domain/demanda';

// Aba Administrador e numeração de 2027, com o código real e as regras ligadas.
let env: RulesTestEnvironment;
let p3: Firestore;
let admin: Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-portal-p3',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  p3 = env.authenticatedContext('conta-p3', { perfil: 'p3' }).firestore() as unknown as Firestore;
  admin = env.authenticatedContext('conta-admin', { perfil: 'admin' }).firestore() as unknown as Firestore;
});

function dados(extra: Partial<DadosDemanda> = {}): DadosDemanda {
  return { ...demandaVazia('2026-11-16'), saida: 'Teste', categoria: 'Outras Demandas', destinos: ['1cia'], ...extra };
}

/** O que o motor faz depois de limpar agenda e pasta. */
async function motorTerminou() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    for (const d of (await getDocs(collection(db, 'demandas'))).docs) await updateDoc(d.ref, { automacaoPendente: false });
  });
}

describe('número inicial do numerador', () => {
  test('o Administrador define e a P/3 continua dele', async () => {
    await definirContador(admin, 'demandas', 2150);
    expect(await criarDemanda(p3, dados())).toBe(2151);
    expect(await lerContadores(admin)).toEqual([{ id: 'demandas', ultimo: 2151 }]);
  });

  test('a P/3 não consegue pular número sozinha', async () => {
    await expect(setDoc(doc(p3, 'contadores/demandas'), { ultimo: 2150 })).rejects.toThrow();
  });
});

describe('numeração a partir de 2027', () => {
  test('até 2026 é só o número sequencial', async () => {
    const r = await criarDemandaNumerada(p3, dados({ dataEntrada: '2026-12-31' }));
    expect(r).toEqual({ numero: 1, numeroDocumento: undefined });
    expect((await obterDemanda(p3, '1'))?.numeroDocumento).toBeUndefined();
  });

  test('cada tipo de saída tem sua sequência no ano; o nº interno continua único', async () => {
    await definirContador(admin, 'demandas', 2500);
    const a = await criarDemandaNumerada(p3, dados({ dataEntrada: '2027-01-02', tipoSaida: 'OFÍCIO' }));
    const b = await criarDemandaNumerada(p3, dados({ dataEntrada: '2027-03-10', tipoSaida: 'OFÍCIO' }));
    const c = await criarDemandaNumerada(p3, dados({ dataEntrada: '2027-03-10', tipoSaida: 'PARTE' }));
    expect([a, b, c]).toEqual([
      { numero: 2501, numeroDocumento: 'OFÍCIO 8BPMM-001/01/27' },
      { numero: 2502, numeroDocumento: 'OFÍCIO 8BPMM-002/03/27' },
      { numero: 2503, numeroDocumento: 'PARTE 8BPMM-001/03/27' },
    ]);
    const d = await criarDemandaNumerada(p3, dados({ dataEntrada: '2028-01-05', tipoSaida: 'OFÍCIO' }));
    expect(d.numeroDocumento).toBe('OFÍCIO 8BPMM-001/01/28');
    // A Cia vê o nº do documento.
    expect((await encaminhamentosDaDemanda(p3, '2501'))[0].numeroDocumento).toBe('OFÍCIO 8BPMM-001/01/27');
  });

  test('editar a demanda (até trocar o tipo) não muda o nº do documento', async () => {
    await criarDemanda(p3, dados({ dataEntrada: '2027-02-01' }));
    const salva = (await obterDemanda(p3, '1'))!;
    await atualizarDemanda(p3, '1', dadosDe(salva), { ...dadosDe(salva), tipoSaida: 'PARTE', destinos: ['1cia', '2cia'] });
    expect((await obterDemanda(p3, '1'))?.numeroDocumento).toBe('OFÍCIO 8BPMM-001/02/27');
    const encs = await encaminhamentosDaDemanda(p3, '1');
    expect(encs.map((e) => e.numeroDocumento)).toEqual(['OFÍCIO 8BPMM-001/02/27', 'OFÍCIO 8BPMM-001/02/27']);
  });
});

describe('zerar portal', () => {
  test('apaga os lançamentos, mantém efetivo e configurações, e recomeça do número escolhido', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as unknown as Firestore;
      await setDoc(doc(db, 'efetivo/123456'), { re: '123456-7', nomeGuerra: 'SILVA' });
      await setDoc(doc(db, 'config/docsMensais'), { documentos: [] });
      await setDoc(doc(db, 'recadosCfp/r1'), { texto: 'Teste' });
      await setDoc(doc(db, 'arquivos/a1'), { nome: 'x.pdf' });
      await setDoc(doc(db, 'arquivos/a1/partes/0'), { dados: 'abc' });
      await setDoc(doc(db, 'arquivos/orfao/partes/0'), { dados: 'abc' });
    });
    await criarDemanda(p3, dados());
    await criarDemanda(p3, dados());

    const r = await iniciarZeragem(admin);
    expect(r.demandas).toBe(2);
    expect(await getDocs(collection(admin, 'encaminhamentos'))).toHaveProperty('empty', true);
    expect(await getDocs(collection(admin, 'recadosCfp'))).toHaveProperty('empty', true);
    expect((await getDoc(doc(admin, 'arquivos/orfao/partes/0'))).exists()).toBe(false);
    // As demandas ficam como excluídas para o motor limpar agenda e pasta.
    expect(await obterDemanda(p3, '1')).toMatchObject({ status: 'excluido', automacaoPendente: true });

    await expect(concluirZeragem(admin, 2150)).rejects.toBeInstanceOf(ZeragemNaoPronta);
    await motorTerminou();
    expect(await concluirZeragem(admin, 2150)).toBe(2);

    expect(await getDocs(collection(admin, 'demandas'))).toHaveProperty('empty', true);
    expect(await getDocs(collection(admin, 'demandas', '1', 'historico'))).toHaveProperty('empty', true);
    expect((await getDoc(doc(admin, 'efetivo/123456'))).exists()).toBe(true);
    expect((await getDoc(doc(admin, 'config/docsMensais'))).exists()).toBe(true);
    expect(await criarDemanda(p3, dados())).toBe(2151);
  });

  test('não conclui se cadastraram demanda nova no meio', async () => {
    await criarDemanda(p3, dados());
    await iniciarZeragem(admin);
    await motorTerminou();
    await criarDemanda(p3, dados());
    await expect(concluirZeragem(admin, 0)).rejects.toThrow(/demanda nova/);
  });

  test('a P/3 não consegue zerar', async () => {
    await criarDemanda(p3, dados());
    await expect(iniciarZeragem(p3)).rejects.toThrow();
  });
});
