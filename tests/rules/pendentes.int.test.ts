import { readFileSync } from 'node:fs';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { apagarArquivo, baixarArquivo } from '../../src/data/arquivos';
import { alterarStatus, criarDemanda, excluirDemanda, obterDemanda, PendenteJaResolvida } from '../../src/data/demandas';
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

/** Espera a lista ao vivo chegar no estado esperado (a 1ª resposta pode vir só do cache local). */
function pendentesQuando(condicao: (lista: Pendente[]) => boolean = () => true): Promise<Pendente[]> {
  return new Promise((ok, falha) => {
    const parar = observarPendentes(
      db,
      (lista) => {
        if (!condicao(lista)) return;
        setTimeout(parar);
        ok(lista);
      },
      falha,
    );
  });
}
const pendentesAgora = () => pendentesQuando();

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
    const lista = await pendentesQuando((l) => l.length === 2);
    expect(lista.map((p) => p.id)[0]).toBe('email_abc');
  });

  test('dar destino cria a demanda e tira a pendente da lista na mesma gravação', async () => {
    // Número inicial: só o Administrador define (aqui, direto no emulador).
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore() as unknown as Firestore, 'contadores/demandas'), { ultimo: 2100 }));
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

  describe('PDF da pendente (SEI / Ordem Verbal)', () => {
    const dbCia = () => env.authenticatedContext('conta-1cia', { perfil: 'unidade', unidade: '1cia' }).firestore() as unknown as Firestore;

    /** PDF já enviado em partes (o envio usa FileReader, que só existe no navegador). */
    async function seiComPdf(pdf = 'arq1') {
      await setDoc(doc(db, 'arquivos', pdf, 'partes', '0'), { dados: btoa('%PDF-1.4 ') });
      await setDoc(doc(db, 'arquivos', pdf, 'partes', '1'), { dados: btoa('oficio') });
      await setDoc(doc(db, 'arquivos', pdf), { nome: 'Ofício 12.pdf', tipo: 'application/pdf', tamanho: 15, partes: 2, criadoEm: serverTimestamp() });
      const id = await novaSei();
      await updateDoc(doc(db, 'caixaEntrada', id), { arquivo: { id: pdf, nome: 'Ofício 12.pdf', tamanho: 15 } });
      const p = (await obterPendente(db, id))!;
      const numero = await criarDemanda(db, { ...demandaDaPendente(p, demandaVazia('2026-11-14')), destinos: ['1cia'] }, id);
      return String(numero);
    }

    const arquivoExiste = async (pdf = 'arq1') => (await getDoc(doc(db, 'arquivos', pdf))).exists();
    const partesRestantes = async (pdf = 'arq1') => (await getDocs(collection(db, 'arquivos', pdf, 'partes'))).size;

    test('dar destino leva o PDF para a demanda e para a Cia, que consegue baixar', async () => {
      const id = await seiComPdf();
      expect(await obterDemanda(db, id)).toMatchObject({ arquivoId: 'arq1', arquivoNome: 'Ofício 12.pdf' });
      const enc = await getDoc(doc(dbCia(), 'encaminhamentos', `${id}_1cia`));
      expect(enc.data()).toMatchObject({ arquivoId: 'arq1', arquivoNome: 'Ofício 12.pdf' });
      const { nome, blob } = await baixarArquivo(dbCia(), 'arq1');
      expect(nome).toBe('Ofício 12.pdf');
      expect(await blob.text()).toBe('%PDF-1.4 oficio');
    });

    test('finalizar a demanda apaga o PDF e tira a referência da demanda e da Cia', async () => {
      const id = await seiComPdf();
      await alterarStatus(db, id, 'concluido');
      expect(await arquivoExiste()).toBe(false);
      expect(await partesRestantes()).toBe(0);
      const d = await obterDemanda(db, id);
      expect(d).toMatchObject({ status: 'concluido' });
      expect(d).not.toHaveProperty('arquivoId');
      const enc = (await getDoc(doc(db, 'encaminhamentos', `${id}_1cia`))).data();
      expect(enc).toMatchObject({ status: 'cancelado' });
      expect(enc).not.toHaveProperty('arquivoId');
      // Reabrir não quebra nada (o PDF já não existe).
      await alterarStatus(db, id, 'em_aberto');
      expect(await obterDemanda(db, id)).toMatchObject({ status: 'em_aberto' });
    });

    test('excluir a demanda também apaga o PDF', async () => {
      const id = await seiComPdf();
      await excluirDemanda(db, id);
      expect(await arquivoExiste()).toBe(false);
      expect(await partesRestantes()).toBe(0);
    });

    test('a Cia não apaga o PDF', async () => {
      await seiComPdf();
      await assertFails(apagarArquivo(dbCia(), 'arq1'));
      expect(await arquivoExiste()).toBe(true);
    });
  });

  test('Cia não vê as pendentes', async () => {
    await novaSei();
    const dbCia = env.authenticatedContext('conta-1cia', { perfil: 'unidade', unidade: '1cia' }).firestore();
    await assertFails(getDocs(collection(dbCia as unknown as Firestore, 'caixaEntrada')));
  });
});
