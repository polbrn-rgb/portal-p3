import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  alterarStatus,
  atualizarDemanda,
  buscarConcluidas,
  ConflitoEdicao,
  criarDemanda,
  encaminhamentosDaDemanda,
  excluirDemanda,
  obterDemanda,
  observarAbertas,
} from '../../src/data/demandas';
import { dadosDe, demandaVazia, type DadosDemanda } from '../../src/domain/demanda';

// Testa o código real de gravação no emulador, logado como P/3 e com as regras ligadas.
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

function dados(saida = 'Pedido de policiamento'): DadosDemanda {
  return { ...demandaVazia('2026-11-13'), saida, categoria: 'Pedidos de Policiamento', destinos: ['1cia'] };
}

async function historico(numero: number) {
  const s = await getDocs(collection(db, 'demandas', String(numero), 'historico'));
  return s.docs.map((d) => d.data().acao as string).sort();
}

describe('criarDemanda', () => {
  test('sem contador, começa do 1 e grava em aberto', async () => {
    expect(await criarDemanda(db, dados())).toBe(1);
    const salva = await obterDemanda(db, '1');
    expect(salva).toMatchObject({ numero: 1, status: 'em_aberto', saida: 'Pedido de policiamento' });
    expect((await getDoc(doc(db, 'contadores/demandas'))).data()).toEqual({ ultimo: 1 });
  });

  test('continua do último número do numerador', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore() as unknown as Firestore, 'contadores/demandas'), { ultimo: 2100 }));
    expect(await criarDemanda(db, dados())).toBe(2101);
    expect(await criarDemanda(db, dados())).toBe(2102);
  });

  test('cadastros ao mesmo tempo nunca repetem número', async () => {
    const numeros = await Promise.all(Array.from({ length: 5 }, (_, i) => criarDemanda(db, dados(`D${i}`))));
    expect([...numeros].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('edição, conclusão e histórico', () => {
  test('edita só o que mudou, conclui, reabre e registra tudo no histórico', async () => {
    const numero = await criarDemanda(db, dados());
    const antes = dadosDe((await obterDemanda(db, String(numero)))!);

    expect(await atualizarDemanda(db, String(numero), antes, { ...antes })).toEqual([]);
    expect(await atualizarDemanda(db, String(numero), antes, { ...antes, saida: 'Novo assunto' })).toEqual(['saida']);
    expect((await obterDemanda(db, String(numero)))?.saida).toBe('Novo assunto');

    await alterarStatus(db, String(numero), 'concluido');
    expect((await obterDemanda(db, String(numero)))?.status).toBe('concluido');
    await alterarStatus(db, String(numero), 'em_aberto');

    expect(await historico(numero)).toEqual(['concluida', 'criada', 'editada', 'reaberta']);
  });
});

describe('aviso para o motor da agenda/pasta', () => {
  test('só marca pendente quando há prazo/CFP ou muda campo que aparece na agenda', async () => {
    const semPrazo = String(await criarDemanda(db, dados()));
    expect((await obterDemanda(db, semPrazo))?.automacaoPendente).toBe(false);

    const comPrazo = String(await criarDemanda(db, { ...dados(), prazoCPA: '2026-11-30' }));
    expect((await obterDemanda(db, comPrazo))?.automacaoPendente).toBe(true);

    const aberta = dadosDe((await obterDemanda(db, semPrazo))!);
    await atualizarDemanda(db, semPrazo, aberta, { ...aberta, responsavel: 'Sgt Sousa' });
    expect((await obterDemanda(db, semPrazo))?.automacaoPendente).toBe(false);
    await atualizarDemanda(db, semPrazo, { ...aberta, responsavel: 'Sgt Sousa' }, { ...aberta, responsavel: 'Sgt Sousa', prazoCia: '2026-11-25' });
    expect((await obterDemanda(db, semPrazo))?.automacaoPendente).toBe(true);
  });
});

describe('duas pessoas editando a mesma demanda', () => {
  async function abrir() {
    const id = String(await criarDemanda(db, dados()));
    return { id, aberta: dadosDe((await obterDemanda(db, id))!) };
  }

  test('campos diferentes: as duas mudanças ficam', async () => {
    const { id, aberta } = await abrir();
    await atualizarDemanda(db, id, aberta, { ...aberta, prazoCPA: '2026-12-01' });
    await atualizarDemanda(db, id, aberta, { ...aberta, observacao: 'Ver com o Cmt' });
    expect(await obterDemanda(db, id)).toMatchObject({ prazoCPA: '2026-12-01', observacao: 'Ver com o Cmt' });
  });

  test('mesmo campo: quem salva depois é avisado e nada é sobrescrito', async () => {
    const { id, aberta } = await abrir();
    await atualizarDemanda(db, id, aberta, { ...aberta, prazoCPA: '2026-12-01' });
    const segunda = atualizarDemanda(db, id, aberta, { ...aberta, prazoCPA: '2026-12-05', observacao: 'x' });
    await expect(segunda).rejects.toBeInstanceOf(ConflitoEdicao);
    await expect(segunda).rejects.toMatchObject({ campos: ['prazoCPA'] });
    expect(await obterDemanda(db, id)).toMatchObject({ prazoCPA: '2026-12-01', observacao: '' });
  });

  test('salvando no mesmo instante, em campos diferentes, nada se perde', async () => {
    const { id, aberta } = await abrir();
    await Promise.all([
      atualizarDemanda(db, id, aberta, { ...aberta, responsavel: 'Sgt Sousa' }),
      atualizarDemanda(db, id, aberta, { ...aberta, numeroSaida: '123/26' }),
      atualizarDemanda(db, id, aberta, { ...aberta, destinos: ['1cia', '2cia'] }),
    ]);
    expect(await obterDemanda(db, id)).toMatchObject({
      responsavel: 'Sgt Sousa',
      numeroSaida: '123/26',
      destinos: ['1cia', '2cia'],
    });
  });
});

describe('buscarConcluidas', () => {
  test('pagina da mais nova para a mais antiga, 30 por vez', async () => {
    for (let i = 0; i < 32; i++) {
      const n = await criarDemanda(db, dados());
      await alterarStatus(db, String(n), 'concluido');
    }
    const p1 = await buscarConcluidas(db);
    expect(p1.lista).toHaveLength(30);
    expect(p1.lista[0].numero).toBe(32);
    expect(p1.temMais).toBe(true);

    const p2 = await buscarConcluidas(db, p1.lista.at(-1)!.numero);
    expect(p2.lista.map((d) => d.numero)).toEqual([2, 1]);
    expect(p2.temMais).toBe(false);
  });
});

describe('excluirDemanda', () => {
  test('some das abertas, das Cias e do checklist; o número fica registrado e o motor limpa a agenda', async () => {
    const numero = await criarDemanda(db, { ...dados(), destinos: ['1cia', '2cia'] });
    const fica = await criarDemanda(db, dados('Outra'));
    const id = String(numero);
    await setDoc(doc(db, 'operacoes', id), { osOk: true });
    expect(await encaminhamentosDaDemanda(db, id)).toHaveLength(2);

    await excluirDemanda(db, id);

    const d = await obterDemanda(db, id);
    expect(d?.status).toBe('excluido');
    expect(d?.automacaoPendente).toBe(true);
    expect(await historico(numero)).toEqual(['criada', 'excluida']);
    expect(await encaminhamentosDaDemanda(db, id)).toEqual([]);
    expect((await getDoc(doc(db, 'operacoes', id))).exists()).toBe(false);

    const abertas = await new Promise<number[]>((ok, falha) => {
      const parar = observarAbertas(db, (l) => { parar(); ok(l.map((x) => x.numero)); }, falha);
    });
    expect(abertas).toEqual([fica]);
    expect((await buscarConcluidas(db)).lista).toEqual([]);
    // O próximo cadastro não reaproveita o número excluído.
    expect(await criarDemanda(db, dados())).toBe(fica + 1);
  });
});

describe('Painel estatístico: demandas do ano', () => {
  test('pega só as do ano pela data de entrada, sem as excluídas, e guarda por 10 minutos', async () => {
    const { demandasDoAno } = await import('../../src/data/estatisticas');
    await criarDemanda(db, { ...dados('Do ano'), dataEntrada: '2026-03-10' });
    await criarDemanda(db, { ...dados('Fim do ano'), dataEntrada: '2026-12-31' });
    await criarDemanda(db, { ...dados('Ano que vem'), dataEntrada: '2027-01-01' });
    const excluida = await criarDemanda(db, { ...dados('Excluída'), dataEntrada: '2026-05-05' });
    await excluirDemanda(db, String(excluida));

    expect((await demandasDoAno(db, 2026, true)).map((d) => d.saida).sort()).toEqual(['Do ano', 'Fim do ano']);
    await criarDemanda(db, { ...dados('Nova'), dataEntrada: '2026-04-01' });
    expect(await demandasDoAno(db, 2026)).toHaveLength(2); // guardado
    expect(await demandasDoAno(db, 2026, true)).toHaveLength(3); // Atualizar
  });
});
