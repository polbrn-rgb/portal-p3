import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, updateDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { criarEap, editarEap, encerrarEap, enviarRespostaEap, excluirEap, idRespostaEap, observarEapDaUnidade, pedirPlanilhaEapDeNovo } from '../../src/data/eap';
import { eapVazia, policialEapVazio, TURMAS_EAP, type DadosEap, type Eap, type RespostaEap } from '../../src/domain/eap';

// EAP (Aperfeiçoamento) no emulador, com as regras ligadas.
let env: RulesTestEnvironment;
let p3: Firestore;
let cia1: Firestore;
const como = (uid: string, claims: Record<string, string>) =>
  env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-portal-p3', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  p3 = como('conta-p3', { perfil: 'p3' });
  cia1 = como('conta-1cia', { perfil: 'unidade', unidade: '1cia' });
});

const dados = (): DadosEap => ({
  ...eapVazia('2026-11-15'),
  eadInicio: '2026-11-09',
  eadFim: '2026-11-25',
  prazo: '2026-11-20',
  turmas: TURMAS_EAP.map((t, i) => ({ id: t.id, tipo: t.tipo, numero: String(34 + i), inicio: '2026-12-01', fim: '2026-12-03' })),
  vagas: { '1cia': { cbsd1: 2, sgt1: 1 }, ft: { cbsd2: 1 } },
});
const policial = { ...policialEapVazio(), re: '123456-7', grad: 'SD PM', nomeCompleto: 'FULANO DE TAL' };

function minhasQuando(db: Firestore, cond: (l: RespostaEap[]) => boolean): Promise<RespostaEap[]> {
  return new Promise((ok, falha) => {
    const parar = observarEapDaUnidade(db, '1cia', (l) => {
      if (!cond(l)) return;
      parar();
      ok(l);
    }, falha);
  });
}

describe('EAP', () => {
  test('planilha travada: Tentar de novo volta a pedir; excluir apaga a EAP e as respostas das Cias (a Cia não exclui)', async () => {
    const id = await criarEap(p3, dados());
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore() as unknown as Firestore, 'eap', id), { planilha: { status: 'erro', erro: 'camposParaJs is not defined', id: 'copia1', url: 'https://x' } }),
    );
    await pedirPlanilhaEapDeNovo(p3, id);
    const planilha = (await getDoc(doc(p3, 'eap', id))).data()?.planilha;
    // A cópia já feita fica: o motor termina nela em vez de copiar outra.
    expect(planilha).toMatchObject({ status: 'pedida', id: 'copia1' });
    expect(planilha.pedidaEm).toBeTruthy();
    expect(planilha).not.toHaveProperty('erro');

    await assertFails(excluirEap(cia1, id));
    await assertSucceeds(excluirEap(p3, id));
    expect((await getDoc(doc(p3, 'eap', id))).exists()).toBe(false);
    expect((await getDocs(collection(p3, 'eapRespostas'))).size).toBe(0);
  });

  test('abrir cria a EAP (planilha pedida) e uma resposta por Cia com as vagas dela', async () => {
    const id = await criarEap(p3, dados());
    const eap = (await getDoc(doc(p3, 'eap', id))).data();
    expect(eap).toMatchObject({ status: 'aberta', planilha: { status: 'pedida' }, planilhaDesatualizada: false });
    const respostas = (await getDocs(collection(p3, 'eapRespostas'))).docs.map((d) => d.data());
    expect(respostas).toHaveLength(7);
    const minha = (await minhasQuando(cia1, (l) => l.length === 1))[0];
    expect(minha).toMatchObject({ eapId: id, status: 'pendente', gravado: true, vagas: { cbsd1: 2, sgt1: 1 }, prazo: '2026-11-20' });
    expect(minha.titulo).toBe('EAP 2026 · EAD em Dezembro · presencial em Janeiro');
  });

  test('Cia envia a dela (o motor vai gravar), não mexe nas vagas, não vê a EAP nem a de outra Cia', async () => {
    const id = await criarEap(p3, dados());
    const rid = idRespostaEap(id, '1cia');
    await assertSucceeds(enviarRespostaEap(cia1, rid, { cbsd1: { semEfetivo: false, policiais: [policial] }, sgt1: { semEfetivo: true, policiais: [] } }, ' Cb PM Teste '));
    const r = (await getDoc(doc(p3, 'eapRespostas', rid))).data();
    expect(r).toMatchObject({ status: 'enviada', gravado: false, respondidoPor: 'Cb PM Teste' });
    expect(r?.blocos.cbsd1.policiais[0].nomeCompleto).toBe('FULANO DE TAL');

    await assertFails(updateDoc(doc(cia1, 'eapRespostas', rid), { vagas: { cbsd1: 9 } }));
    await assertFails(updateDoc(doc(cia1, 'eapRespostas', rid), { blocos: {}, status: 'enviada', respondidoPor: '', gravado: false }));
    await assertFails(getDoc(doc(cia1, 'eap', id)));
    await assertFails(getDoc(doc(cia1, 'eapRespostas', idRespostaEap(id, '2cia'))));
    await assertFails(enviarRespostaEap(cia1, idRespostaEap(id, '2cia'), {}, 'X'));
  });

  test('editar leva turmas/vagas às Cias e marca a planilha para atualizar; encerrar tira da Cia', async () => {
    const id = await criarEap(p3, dados());
    await updateDoc(doc(p3, 'eap', id), { planilha: { status: 'pronta', url: 'u', id: 'x' } });
    const eap = { ...((await getDoc(doc(p3, 'eap', id))).data() as Omit<Eap, 'id'>), id };
    await editarEap(p3, eap, { ...dados(), prazo: '2026-11-22', vagas: { '1cia': { cbsd1: 3 } } });
    expect((await getDoc(doc(p3, 'eap', id))).data()?.planilhaDesatualizada).toBe(true);
    expect((await minhasQuando(cia1, (l) => l[0]?.prazo === '2026-11-22'))[0].vagas).toEqual({ cbsd1: 3 });

    await encerrarEap(p3, eap);
    await minhasQuando(cia1, (l) => l.length === 0);
    await assertFails(enviarRespostaEap(cia1, idRespostaEap(id, '1cia'), {}, 'Cb PM Teste'));
  });
});
