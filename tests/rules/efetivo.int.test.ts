import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { criarDemanda, obterDemanda } from '../../src/data/demandas';
import { buscarPolicial, enviarSolicitacao, responderSolicitacao } from '../../src/data/efetivo';
import { pedirPlanilha } from '../../src/data/operacoes';
import { salvarResultado } from '../../src/data/resultados';
import { demandaVazia, type DadosDemanda } from '../../src/domain/demanda';
import { quantidadesVazias } from '../../src/domain/efetivo';

// Efetivo, resultados da Sala e agenda do CFP, no emulador, com as regras ligadas.
let env: RulesTestEnvironment;
let p3: Firestore;
const como = (uid: string, claims: Record<string, string>) =>
  env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;

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
  p3 = como('conta-p3', { perfil: 'p3' });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(admin, 'efetivo/123456'), { re: '123456-7', posto: 'Cb PM', nomeGuerra: 'SILVA', telefone: '11' });
    await setDoc(doc(admin, 'agendaCfp/eventos'), {
      eventos: [{ id: 'ev1', titulo: 'Op', inicio: '2026-11-20', fim: '2026-11-20', pastaUrl: 'x', numero: 10 }],
      conferidoEm: '2026-11-14T12:00:00.000Z',
    });
  });
});

async function operacao() {
  const dados = {
    ...demandaVazia('2026-11-14'),
    saida: 'Operação Natal',
    tipoSaida: 'ORDEM DE SERVIÇO',
    categoria: 'Operações Policiais',
    inicioBtl: '2026-11-20',
    terminoBtl: '2026-11-21',
  } as DadosDemanda;
  const n = await criarDemanda(p3, dados);
  return (await obterDemanda(p3, String(n)))!;
}

const policial = { re: '123456-7', posto: 'Cb PM', nomeGuerra: 'SILVA', telefone: '11', extras: { cpf: '000' } };

describe('Solicitação de efetivo', () => {
  test('P/3 envia; só as Cias com policial pedido recebem; cada Cia vê só a dela', async () => {
    const d = await operacao();
    await enviarSolicitacao(p3, d, {
      prazo: '2026-11-18',
      campos: ['cpf'],
      quantidades: { '1cia': { ...quantidadesVazias(), cbsd: 2 }, '2cia': quantidadesVazias() },
    });
    const todas = await getDocs(collection(p3, 'solicitacoesEfetivo'));
    expect(todas.docs.map((x) => x.id)).toEqual([`${d.id}_1cia`]);
    expect((await getDoc(doc(p3, 'operacoes', d.id))).data()).toMatchObject({ efetivoOk: true, efetivo: { prazo: '2026-11-18' } });

    const cia1 = como('conta-1cia', { perfil: 'unidade', unidade: '1cia' });
    const cia2 = como('conta-2cia', { perfil: 'unidade', unidade: '2cia' });
    await assertSucceeds(getDoc(doc(cia1, 'solicitacoesEfetivo', `${d.id}_1cia`)));
    await assertFails(getDoc(doc(cia2, 'solicitacoesEfetivo', `${d.id}_1cia`)));
    await assertFails(getDoc(doc(cia1, 'operacoes', d.id)));
  });

  test('Cia busca pelo RE e responde; não muda o que a P/3 pediu', async () => {
    const d = await operacao();
    await enviarSolicitacao(p3, d, { prazo: '2026-11-18', campos: [], quantidades: { '1cia': { ...quantidadesVazias(), cbsd: 1 } } });
    const cia1 = como('conta-1cia', { perfil: 'unidade', unidade: '1cia' });
    expect(await buscarPolicial(cia1, '1234567')).toEqual({ re: '123456-7', posto: 'Cb PM', nomeGuerra: 'SILVA', telefone: '11' });
    expect(await buscarPolicial(cia1, '999999')).toBeNull();

    const id = `${d.id}_1cia`;
    await assertFails(updateDoc(doc(cia1, 'solicitacoesEfetivo', id), { quantidades: { cbsd: 0 } }));
    await assertFails(responderSolicitacao(cia1, id, [], 'Sgt X'));
    await responderSolicitacao(cia1, id, [policial], 'Sgt X');
    expect((await getDoc(doc(p3, 'solicitacoesEfetivo', id))).data()).toMatchObject({ status: 'respondida', respondidoPor: 'Sgt X' });
    // Pode corrigir e reenviar.
    await responderSolicitacao(cia1, id, [policial, { ...policial, re: '222222-2' }], 'Sgt X');
  });
});

describe('Editar a solicitação de efetivo', () => {
  test('troca o pedido inteiro, cria/apaga Cias e reabre só a que precisa mandar mais', async () => {
    const d = await operacao();
    const q = (cbsd: number) => ({ ...quantidadesVazias(), cbsd });
    await enviarSolicitacao(p3, d, { prazo: '2026-11-18', campos: [], quantidades: { '1cia': q(1), '2cia': q(1) } });
    const cia1 = como('conta-1cia', { perfil: 'unidade', unidade: '1cia' });
    await responderSolicitacao(cia1, `${d.id}_1cia`, [{ re: '123456-7', posto: 'Cb PM', nomeGuerra: 'SILVA', telefone: '', extras: {} }], 'Sgt Teste');
    const antes = (await getDoc(doc(p3, 'operacoes', d.id))).data()?.efetivo;

    await enviarSolicitacao(p3, d, { prazo: '2026-11-20', campos: [], quantidades: { '1cia': q(2), '3cia': q(1) } }, antes);

    const op = (await getDoc(doc(p3, 'operacoes', d.id))).data();
    expect(Object.keys(op?.efetivo.quantidades).sort()).toEqual(['1cia', '3cia']);
    expect(op?.efetivo.prazo).toBe('2026-11-20');
    expect(op?.efetivo.enviadaEm).toEqual(antes.enviadaEm);
    expect(op?.efetivo.editadaEm).toBeTruthy();
    const s1 = (await getDoc(doc(p3, 'solicitacoesEfetivo', `${d.id}_1cia`))).data();
    expect(s1).toMatchObject({ status: 'enviada', prazo: '2026-11-20', quantidades: q(2), respondidoPor: 'Sgt Teste' });
    expect(s1?.policiais).toHaveLength(1);
    expect((await getDoc(doc(p3, 'solicitacoesEfetivo', `${d.id}_2cia`))).exists()).toBe(false);
    expect((await getDoc(doc(p3, 'solicitacoesEfetivo', `${d.id}_3cia`))).data()).toMatchObject({ status: 'enviada', quantidades: q(1) });
    // A Cia reenviada continua podendo responder.
    await assertSucceeds(
      responderSolicitacao(cia1, `${d.id}_1cia`, [{ re: '123456-7', posto: 'Cb PM', nomeGuerra: 'SILVA', telefone: '', extras: {} }], 'Sgt Teste'),
    );
  });
});

describe('Resultados da Sala de Operações', () => {
  test('Sala (e o CFP, que usa a página da Sala) lê a operação e lança; Cia não', async () => {
    const d = await operacao();
    await pedirPlanilha(p3, d.id);
    const sala = como('conta-sala', { perfil: 'sala' });
    await assertSucceeds(getDoc(doc(sala, 'operacoes', d.id)));
    await salvarResultado(sala, { numero: d.id, dia: '2026-11-20', protocoloResultado: '99', valores: { '9': 3 }, salvoPor: 'Sd Y' });
    expect((await getDoc(doc(p3, 'resultados', `${d.id}_2026-11-20`))).data()).toMatchObject({ gravado: false, valores: { '9': 3 } });

    // Sala não marca como gravado (só o motor) nem mexe no checklist.
    await assertFails(setDoc(doc(sala, 'resultados', `${d.id}_2026-11-21`), { numero: d.id, dia: '2026-11-21', protocoloResultado: '', valores: {}, salvoPor: 'x', gravado: true }));
    await assertFails(setDoc(doc(sala, 'operacoes', d.id), { osOk: true }, { merge: true }));

    const cia1 = como('conta-1cia', { perfil: 'unidade', unidade: '1cia' });
    const cfp = como('conta-cfp', { perfil: 'cfp' });
    await assertFails(getDoc(doc(cia1, 'resultados', `${d.id}_2026-11-20`)));
    await assertSucceeds(salvarResultado(cfp, { numero: d.id, dia: '2026-11-22', protocoloResultado: '1', valores: {}, salvoPor: 'x' }));
  });
});

describe('Agenda do CFP e banco de efetivo', () => {
  test('CFP e P/3 leem a agenda do CFP; Cia e Sala não; ninguém escreve (só o Apps Script)', async () => {
    const cfp = como('conta-cfp', { perfil: 'cfp' });
    await assertSucceeds(getDoc(doc(cfp, 'agendaCfp/eventos')));
    await assertSucceeds(getDoc(doc(p3, 'agendaCfp/eventos')));
    await assertFails(getDoc(doc(como('conta-1cia', { perfil: 'unidade', unidade: '1cia' }), 'agendaCfp/eventos')));
    await assertFails(getDoc(doc(como('conta-sala', { perfil: 'sala' }), 'agendaCfp/eventos')));
    await assertFails(setDoc(doc(p3, 'agendaCfp/eventos'), { eventos: [] }));
    await assertFails(setDoc(doc(cfp, 'agendaCfp/eventos'), { eventos: [] }));
    // A cópia antiga (feita a partir das demandas) não é mais lida por ninguém.
    await assertFails(getDoc(doc(cfp, 'missoesCfp/10')));
    await assertFails(setDoc(doc(p3, 'efetivo/111111'), { re: 'x' }));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore() as unknown as Firestore, 'efetivo/123456')));
  });
});
