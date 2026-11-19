import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, updateDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  atualizarCompromisso,
  buscarDemandaPorNumero,
  COLECAO_AGENDA,
  COLECAO_AGENDA_SETORES,
  criarCompromisso,
  excluirCompromisso,
  excluirOcorrencia,
  observarCompromissos,
  observarCompromissosDaDemanda,
  observarDemandasDoPeriodo,
} from '../../src/data/agenda';
import { alterarStatus, criarDemanda, excluirDemanda } from '../../src/data/demandas';
import { compromissoVazio, type Compromisso, type DadosCompromisso } from '../../src/domain/agenda';
import { demandaVazia, type DadosDemanda, type Demanda } from '../../src/domain/demanda';

// Código real da Agenda da P/3 no emulador, com as regras ligadas.
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
});

function evento(extra: Partial<DadosCompromisso> = {}): DadosCompromisso {
  return { ...compromissoVazio('2026-11-18', 9), titulo: 'Reunião de comando', ...extra };
}

function demanda(extra: Partial<DadosDemanda>): DadosDemanda {
  return { ...demandaVazia('2026-11-13'), saida: 'Operação teste', categoria: 'Pedidos de Policiamento', destinos: ['1cia'], ...extra };
}

/** Espera o ouvinte entregar uma lista que cumpra a condição. */
function quando<T>(assinar: (ok: (v: T) => void, erro: (e: Error) => void) => () => void, condicao: (v: T) => boolean): Promise<T> {
  return new Promise((ok, falha) => {
    const parar = assinar((v) => {
      if (!condicao(v)) return;
      setTimeout(() => parar());
      ok(v);
    }, falha);
  });
}

describe('Agenda da P/3', () => {
  test('P/3 cria, vê no período, edita, apaga um dia da série e exclui', async () => {
    const id = await criarCompromisso(p3, evento({ repeticao: 'semanal', repetirAte: '2026-12-31' }), 'Sd PM TESTE');
    await criarCompromisso(p3, evento({ titulo: 'Fora do período', data: '2027-03-01', dataFim: '2027-03-01' }), 'Sd PM TESTE');
    await criarCompromisso(p3, evento({ titulo: 'Já passou', data: '2026-01-05', dataFim: '2026-01-05' }), 'Sd PM TESTE');

    const lista = await quando<Compromisso[]>((ok, e) => observarCompromissos(p3, '2026-11-29', '2027-01-09', ok, e), (l) => l.length > 0);
    expect(lista.map((c) => c.titulo)).toEqual(['Reunião de comando']); // a série começou antes e ainda está valendo
    expect(lista[0]).toMatchObject({ criadoPor: 'Sd PM TESTE', excecoes: [], fimSerie: '2026-12-31' });

    await atualizarCompromisso(p3, id, evento({ titulo: 'Reunião mudada', repeticao: 'semanal', repetirAte: '2026-12-31' }), 'Cb PM OUTRO');
    await excluirOcorrencia(p3, id, '2026-11-25', 'Cb PM OUTRO');
    const depois = (await getDoc(doc(p3, COLECAO_AGENDA, id))).data()!;
    expect(depois).toMatchObject({ titulo: 'Reunião mudada', criadoPor: 'Sd PM TESTE', atualizadoPor: 'Cb PM OUTRO', excecoes: ['2026-11-25'] });

    await excluirCompromisso(p3, id);
    expect((await getDoc(doc(p3, COLECAO_AGENDA, id))).exists()).toBe(false);
  });

  test('evento inválido nem sai do aparelho; e as regras barram o que vier por fora', async () => {
    await expect(criarCompromisso(p3, evento({ titulo: ' ' }), 'x')).rejects.toThrow('Informe o título.');
    const base = { ...evento(), fimSerie: '2026-11-18', excecoes: [], criadoPor: 'x', criadoEm: serverTimestamp() };
    await assertSucceeds(addDoc(collection(p3, COLECAO_AGENDA), base));
    await assertFails(addDoc(collection(p3, COLECAO_AGENDA), { ...base, titulo: '' }));
    await assertFails(addDoc(collection(p3, COLECAO_AGENDA), { ...base, dataFim: '2026-11-01' }));
    await assertFails(addDoc(collection(p3, COLECAO_AGENDA), { ...base, repeticao: 'cada hora' }));
    await assertFails(addDoc(collection(p3, COLECAO_AGENDA), { ...base, criadoPor: '' }));
    // Quem lançou não muda.
    const id = await criarCompromisso(p3, evento(), 'Sd PM TESTE');
    await assertFails(updateDoc(doc(p3, COLECAO_AGENDA, id), { criadoPor: 'Outro' }));
  });

  test('só a P/3: Cias, Sala, CFP e quem não está logado não leem nem gravam', async () => {
    const id = await criarCompromisso(p3, evento(), 'Sd PM TESTE');
    const base = { ...evento(), fimSerie: '2026-11-18', excecoes: [], criadoPor: 'x' };
    for (const outro of [
      como('conta-1cia', { perfil: 'unidade', unidade: '1cia' }),
      como('conta-sala', { perfil: 'sala' }),
      como('conta-cfp', { perfil: 'cfp' }),
      env.unauthenticatedContext().firestore() as unknown as Firestore,
    ]) {
      await assertFails(getDoc(doc(outro, COLECAO_AGENDA, id)));
      await assertFails(getDocs(collection(outro, COLECAO_AGENDA)));
      await assertFails(addDoc(collection(outro, COLECAO_AGENDA), base));
      await assertFails(excluirCompromisso(outro, id));
    }
  });
});

describe('Agendas das Cias e da Sala (independentes)', () => {
  test('cada Cia e a Sala só veem e mexem na sua; a P/3 e o CFP não entram', async () => {
    const cia1 = como('conta-1cia', { perfil: 'unidade', unidade: '1cia' });
    const sala = como('conta-sala', { perfil: 'sala' });

    const id1 = await criarCompromisso(cia1, evento({ titulo: 'Da 1ª' }), '1ª CIA', '1cia');
    const idSala = await criarCompromisso(sala, evento({ titulo: 'Da Sala' }), 'Sala', 'sala');
    await criarCompromisso(p3, evento({ titulo: 'Da P/3' }), 'P/3');

    const da1 = await quando<Compromisso[]>((ok, e) => observarCompromissos(cia1, '2026-11-01', '2026-11-30', ok, e, '1cia'), (l) => l.length > 0);
    expect(da1.map((c) => c.titulo)).toEqual(['Da 1ª']); // não vê a da P/3 nem a da Sala
    const daSala = await quando<Compromisso[]>((ok, e) => observarCompromissos(sala, '2026-11-01', '2026-11-30', ok, e, 'sala'), (l) => l.length > 0);
    expect(daSala.map((c) => c.titulo)).toEqual(['Da Sala']);

    await atualizarCompromisso(cia1, id1, evento({ titulo: 'Mudada' }), 'Sd', '1cia');
    await excluirOcorrencia(cia1, id1, '2026-11-18', 'Sd', '1cia');

    // Cada verificação de "negado" num cliente novo, sem ouvinte aberto: o emulador às vezes derruba a conexão
    // quando a mesma conta tem ouvinte e leva um "negado" ("client is offline" / RESOURCE_EXHAUSTED).
    let n = 0;
    const novo = (claims: Record<string, string>) => como(`isolado-${n++}`, claims);
    const outros: Record<string, string>[] = [{ perfil: 'unidade', unidade: '2cia' }, { perfil: 'sala' }, { perfil: 'cfp' }, { perfil: 'p3' }];
    for (const c of outros) {
      await assertFails(getDoc(doc(novo(c), COLECAO_AGENDA_SETORES, id1)));
      await assertFails(excluirCompromisso(novo(c), id1, '1cia'));
    }
    const c1 = { perfil: 'unidade', unidade: '1cia' };
    await assertFails(getDoc(doc(novo(c1), COLECAO_AGENDA_SETORES, idSala)));
    // Não dá para gravar na agenda de outra Cia nem trocar o dono.
    await assertFails(criarCompromisso(novo({ perfil: 'unidade', unidade: '2cia' }), evento(), '2ª CIA', '1cia'));
    await assertFails(criarCompromisso(novo({ perfil: 'cfp' }), evento(), 'CFP', 'sala'));
    await assertFails(updateDoc(doc(novo(c1), COLECAO_AGENDA_SETORES, id1), { dono: '2cia' }));
    // A da P/3 continua fechada para as Cias.
    await assertFails(getDocs(collection(novo(c1), COLECAO_AGENDA)));

    await assertSucceeds(excluirCompromisso(cia1, id1, '1cia'));
  });
});

describe('integração com o Numerador', () => {
  test('demandas com Prazo CPA, Prazo Cia ou Início Btl no período (sem repetir a mesma demanda)', async () => {
    const n1 = await criarDemanda(p3, demanda({ saida: 'Com os dois prazos', prazoCPA: '2026-11-20', prazoCia: '2026-11-19' }));
    await criarDemanda(p3, demanda({ saida: 'Operação longa', inicioBtl: '2026-10-01', terminoBtl: '2026-11-30' }));
    await criarDemanda(p3, demanda({ saida: 'Prazo longe', prazoCPA: '2027-02-01' }));
    await criarDemanda(p3, demanda({ saida: 'Sem datas' }));

    const lista = await quando<Demanda[]>((ok, e) => observarDemandasDoPeriodo(p3, '2026-11-15', '2026-11-21', ok, e), (l) => l.length >= 2);
    expect(lista.map((d) => d.saida).sort()).toEqual(['Com os dois prazos', 'Operação longa']);

    const achada = await buscarDemandaPorNumero(p3, n1);
    expect(achada?.saida).toBe('Com os dois prazos');
    expect(await buscarDemandaPorNumero(p3, 99999)).toBeNull();
    await alterarStatus(p3, achada!.id, 'concluido');
    expect((await buscarDemandaPorNumero(p3, n1))?.status).toBe('concluido'); // concluída continua ligável
    await excluirDemanda(p3, achada!.id);
    expect(await buscarDemandaPorNumero(p3, n1)).toBeNull(); // excluída não

    // A Cia não lê o Numerador pela agenda.
    await assertFails(
      new Promise((ok, falha) => {
        const parar = observarDemandasDoPeriodo(como('conta-1cia', { perfil: 'unidade', unidade: '1cia' }), '2026-11-15', '2026-11-21', ok, falha);
        setTimeout(parar, 5000);
      }),
    );
  });

  test('eventos ligados a uma demanda aparecem na tela da demanda', async () => {
    const n = await criarDemanda(p3, demanda({ saida: 'Reunião CONSEG' }));
    const d = (await buscarDemandaPorNumero(p3, n))!;
    await criarCompromisso(p3, evento({ titulo: 'Reunião B', data: '2026-11-25', dataFim: '2026-11-25', demandaId: d.id, demandaNumero: n, demandaTitulo: d.saida }), 'x');
    await criarCompromisso(p3, evento({ titulo: 'Reunião A', demandaId: d.id, demandaNumero: n, demandaTitulo: d.saida }), 'x');
    await criarCompromisso(p3, evento({ titulo: 'Sem ligação' }), 'x');
    const lista = await quando<Compromisso[]>((ok, e) => observarCompromissosDaDemanda(p3, d.id, ok, e), (l) => l.length === 2);
    expect(lista.map((c) => c.titulo)).toEqual(['Reunião A', 'Reunião B']);
  });
});
