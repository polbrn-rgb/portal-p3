import { readFileSync } from 'node:fs';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { criarDemanda, obterDemanda, PendenteJaResolvida } from '../../src/data/demandas';
import {
  criarPendente,
  descartarPendente,
  obterPendente,
  observarPendentes,
  voltarParaPendentes,
} from '../../src/data/pendentes';
import { demandaVazia } from '../../src/domain/demanda';
import { demandaDaPendente, pendenteManualVazia, type Pendente } from '../../src/domain/pendente';

// Código real da aba Demandas Pendentes, no emulador, com as regras ligadas.
let env: RulesTestEnvironment;
let db: Firestore;

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
  db = env.authenticatedContext('conta-p3', { perfil: 'p3' }).firestore() as unknown as Firestore;
});

function pendentesAgora(): Promise<Pendente[]> {
  return new Promise((ok, falha) => {
    const parar = observarPendentes(
      db,
      (lista) => {
        parar();
        ok(lista);
      },
      falha,
    );
  });
}

async function novaSei(texto = 'Ofício 12/2026 - escolta') {
  return criarPendente(db, { ...pendenteManualVazia('sei', '2026-11-14'), texto, numeroSei: '006.1/2026' });
}

describe('Demandas Pendentes', () => {
  test('SEI lançado aparece na lista; descartado sai e pode voltar', async () => {
    const id = await novaSei();
    expect((await pendentesAgora()).map((p) => p.assunto)).toEqual(['Ofício 12/2026 - escolta']);

    await descartarPendente(db, id, 'duplicado');
    expect(await pendentesAgora()).toEqual([]);
    expect(await obterPendente(db, id)).toMatchObject({ status: 'descartada', motivoDescarte: 'duplicado' });

    await voltarParaPendentes(db, id);
    expect(await pendentesAgora()).toHaveLength(1);
  });

  test('e-mail gravado pelo Apps Script aparece junto, o mais novo em cima', async () => {
    await novaSei();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, 'caixaEntrada/email_abc'), {
        tipo: 'email',
        status: 'pendente',
        dataEntrada: '2099-01-01',
        recebidoEm: '2099-01-01T10:00:00.000Z',
        assunto: 'Pedido de policiamento',
        texto: 'x',
      });
    });
    expect((await pendentesAgora()).map((p) => p.id)[0]).toBe('email_abc');
  });

  test('dar destino cria a demanda e tira a pendente da lista na mesma gravação', async () => {
    await setDoc(doc(db, 'contadores/demandas'), { ultimo: 2100 });
    const id = await novaSei();
    const p = (await obterPendente(db, id))!;

    const numero = await criarDemanda(db, demandaDaPendente(p, demandaVazia('2026-11-14')), id);
    expect(numero).toBe(2101);
    expect(await obterDemanda(db, '2101')).toMatchObject({ origem: 'SEI', numeroOrigem: '006.1/2026' });
    expect(await obterPendente(db, id)).toMatchObject({ status: 'destinada', numeroDemanda: 2101 });
    expect(await pendentesAgora()).toEqual([]);
    const hist = await getDocs(collection(db, 'demandas', '2101', 'historico'));
    expect(hist.docs[0].data()).toMatchObject({ acao: 'criada', pendenteId: id });
  });

  test('a mesma pendente não vira duas demandas', async () => {
    const id = await novaSei();
    const p = (await obterPendente(db, id))!;
    await criarDemanda(db, demandaDaPendente(p, demandaVazia('2026-11-14')), id);

    await expect(criarDemanda(db, demandaDaPendente(p, demandaVazia('2026-11-14')), id)).rejects.toBeInstanceOf(
      PendenteJaResolvida,
    );
    expect((await getDoc(doc(db, 'contadores/demandas'))).data()).toEqual({ ultimo: 1 });
  });

  test('Cia não vê as pendentes', async () => {
    await novaSei();
    const dbCia = env.authenticatedContext('conta-1cia', { perfil: 'unidade', unidade: '1cia' }).firestore();
    await assertFails(getDocs(collection(dbCia as unknown as Firestore, 'caixaEntrada')));
  });
});
