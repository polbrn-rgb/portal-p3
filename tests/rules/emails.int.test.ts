import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { obterDemanda } from '../../src/data/demandas';
import { enviarEmailAtalho, reenviarEmail, salvarAssinatura, ultimosEnderecos } from '../../src/data/emails';
import { demandaVazia } from '../../src/domain/demanda';
import type { DadosEmail } from '../../src/domain/email';

// Atalho de e-mail (EAP): código real no emulador, com as regras ligadas.
let env: RulesTestEnvironment;
let p3: Firestore;
let admin: Firestore;
const como = (uid: string, claims: Record<string, string>) => env.authenticatedContext(uid, claims).firestore() as unknown as Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-portal-p3', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  p3 = como('conta-p3', { perfil: 'p3' });
  admin = como('conta-admin', { perfil: 'admin' });
});

const email = (extra: Partial<DadosEmail> = {}): DadosEmail => ({
  para: 'cpam11secop@policiamilitar.sp.gov.br',
  cc: '8bpmmp3@policiamilitar.sp.gov.br',
  ao: 'Ao Sr. Cmt CPA M-11',
  assunto: 'EAP - EAD novembro com Presencial em dezembro',
  corpo: 'Encaminho a V.S ª expediente anexo.',
  transmissor: 'Sd Priscila',
  anexarPlanilha: true,
  ...extra,
});

async function enviar() {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore() as unknown as Firestore, 'contadores/demandas'), { ultimo: 2100 }));
  return enviarEmailAtalho(p3, {
    atalho: 'eap',
    refId: 'eap1',
    email: email(),
    demanda: {
      ...demandaVazia('2026-11-17'),
      tipoSaida: 'MSG ELETRÔNICA',
      saida: 'EAP - EAD novembro com Presencial em dezembro',
      meioSaida: 'E-mail',
      destinos: ['secop'],
      categoria: 'Aperfeiçoamento',
      responsavel: 'Sd Priscila',
    },
    anexos: [{ tipo: 'planilha', id: 'planilha1', nome: 'EAP 2026' }],
    imagens: { chefe: 'data:image/png;base64,AAAA', transmissor: 'data:image/png;base64,BBBB' },
  });
}

describe('Atalho de e-mail', () => {
  test('enviar lança a MSG ELETRÔNICA no Numerador e põe o e-mail na fila com o nº dela', async () => {
    const numero = await enviar();
    expect(numero).toBe(2101);
    expect(await obterDemanda(p3, '2101')).toMatchObject({ tipoSaida: 'MSG ELETRÔNICA', destinos: ['secop'], status: 'em_aberto' });

    const fila = (await getDocs(collection(p3, 'emails'))).docs.map((d) => d.data());
    expect(fila).toHaveLength(1);
    expect(fila[0]).toMatchObject({
      status: 'pedido',
      numeroMensagem: '8BPMM-2101/03/26',
      demandaNumero: 2101,
      para: ['cpam11secop@policiamilitar.sp.gov.br'],
      transmissor: 'sd-priscila',
      assunto: 'MENSAGEM ELETRÔNICA Nº 8BPMM-2101/03/26 - EAP - EAD novembro com Presencial em dezembro',
      anexos: [{ tipo: 'planilha', id: 'planilha1', nome: 'EAP 2026' }],
      imagens: { chefe: 'data:image/png;base64,AAAA', transmissor: 'data:image/png;base64,BBBB' },
    });
    expect(fila[0].html).toContain('MENSAGEM ELETRÔNICA Nº 8BPMM-2101/03/26');
    expect(fila[0].html).toContain('cid:assinaturaChefe');
    // Para/Cc ficam guardados para a próxima vez.
    expect(await ultimosEnderecos(p3, 'eap')).toEqual({ para: 'cpam11secop@policiamilitar.sp.gov.br', cc: '8bpmmp3@policiamilitar.sp.gov.br' });
  });

  test('e-mail com erro: a P/3 só pode pedir de novo (não muda o conteúdo)', async () => {
    await enviar();
    const id = (await getDocs(collection(p3, 'emails'))).docs[0].id;
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore() as unknown as Firestore, 'emails', id), { status: 'erro', erro: 'x' }));

    await assertFails(updateDoc(doc(p3, 'emails', id), { para: ['outro@x.com'], status: 'pedido' }));
    await assertFails(updateDoc(doc(p3, 'emails', id), { status: 'enviado' }));
    await reenviarEmail(p3, id);
    expect((await getDoc(doc(p3, 'emails', id))).data()).toMatchObject({ status: 'pedido', erro: '' });
  });

  test('assinaturas: o Administrador grava; a P/3 só lê; a Cia nem lê', async () => {
    const filipi = { nome: 'Cap Filipi', re: '123456', nomeCompleto: 'Filipi da Silva Cassavara', posto: 'Cap PM' };
    await assertSucceeds(salvarAssinatura(admin, 'cap-filipi', filipi));
    expect((await getDoc(doc(p3, 'assinaturas', 'cap-filipi'))).data()).toMatchObject(filipi);
    await assertFails(salvarAssinatura(p3, 'sd-priscila', { nome: 'Sd Priscila', re: '', nomeCompleto: 'Priscila Santos', posto: 'SD PM - 1C' }));
    const cia = como('conta-1cia', { perfil: 'unidade', unidade: '1cia' });
    await assertFails(getDoc(doc(cia, 'assinaturas', 'cap-filipi')));
    await assertFails(getDocs(collection(cia, 'emails')));
  });
});
