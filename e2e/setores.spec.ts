import { expect, test } from '@playwright/test';

// Diagnóstico de falha intermitente no CI: mostra no log onde a tela estava.
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const texto = await page.locator('body').innerText().catch(() => '(sem texto)');
  console.log(`[diagnóstico ${info.project.name}] url=${page.url()}\n${texto.slice(0, 2500)}`);
});
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { entrar, irPara, sair, sobraLateral } from './ajuda';
import { demandaVazia } from '../src/domain/demanda';
import { SENHA_TESTE } from './dados';

// Os dados que o motor (Apps Script) gravaria são criados direto no emulador.
const admin = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-portal-p3' }));

function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('Sala de Operações lança os resultados da operação do dia', async ({ page }, info) => {
  const numero = String(90000 + info.retry * 10 + (info.project.name === 'celular' ? 1 : 2));
  await admin()
    .doc(`operacoes/${numero}`)
    .set({
      protocolos: { [hoje()]: 'MF-555' },
      planilha: {
        status: 'pronta',
        id: 'x',
        url: 'https://docs.google.com/x',
        saida: `Operação Sala ${info.project.name}`,
        dias: [hoje()],
        observacao: 'Foco em roubos',
        campos: [
          { linha: 9, rotulo: 'Pessoas Abordadas', grupo: 'OCOR. COMUNS' },
          { linha: 12, rotulo: 'BO/PM Lavrados', grupo: 'OCOR. COMUNS' },
          { linha: 16, rotulo: 'Ato Infracional', grupo: 'FLAG./PESSOAS' },
        ],
      },
    });

  await entrar(page, 'sala', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: 'Resultados das operações' })).toBeVisible();
  await page.getByLabel(/^Operação/).selectOption(numero);
  await expect(page.getByLabel('Nº protocolo - Mapa Força')).toHaveValue('MF-555');
  await expect(page.getByText('Foco em roubos')).toBeVisible();
  await expect(page.getByRole('group', { name: 'FLAG./PESSOAS' })).toBeVisible();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  await page.getByRole('button', { name: 'Salvar resultados' }).click();
  await expect(page.getByText('Informe o protocolo do resultado')).toBeVisible();
  await page.getByLabel('Nº protocolo - Resultado').fill('RES-1');
  await page.getByLabel('Pessoas Abordadas').fill('12');
  await page.getByLabel('Lançado por').fill('Sd PM Teste');
  await page.getByRole('button', { name: 'Salvar resultados' }).click();
  await expect(page.getByRole('status')).toContainText('Salvo. Gravando na planilha');

  await expect
    .poll(async () => (await admin().doc(`resultados/${numero}_${hoje()}`).get()).data())
    .toMatchObject({ protocoloResultado: 'RES-1', valores: { '9': 12 }, gravado: false, salvoPor: 'Sd PM Teste' });
});

test('CFP vê as missões do dia direto da agenda do CFP, com a pasta', async ({ page }, info) => {
  const titulo = `Missão agenda ${info.project.name} ${info.retry}`;
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  const depois = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, '0')}-${String(amanha.getDate()).padStart(2, '0')}`;
  // O motor grava um documento só com a agenda inteira; celular e computador rodam juntos, por isso o arrayUnion.
  await admin()
    .doc('agendaCfp/eventos')
    .set(
      {
        eventos: FieldValue.arrayUnion(
          { id: `ev-${titulo}`, titulo, inicio: hoje(), fim: hoje(), pastaUrl: 'https://drive.google.com/p', numero: 2150 },
          { id: `ev2-${titulo}`, titulo: `Sem pasta ${titulo}`, inicio: depois, fim: depois, pastaUrl: '', numero: 0 },
        ),
        conferidoEm: new Date().toISOString(),
      },
      { merge: true },
    );
  await entrar(page, 'cfp', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: 'Missões do CFP' })).toBeVisible();
  await expect(page.getByText('Direto da agenda do CFP')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Missões de hoje' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Próximas missões' })).toBeVisible();
  const cartao = page.getByRole('article', { name: titulo, exact: true });
  await expect(cartao.getByRole('link', { name: '📂 Abrir pasta CFP' })).toHaveAttribute('href', 'https://drive.google.com/p');
  await expect(cartao).toContainText('Nº 2150');
  // Evento criado na mão na agenda (sem número): aparece nas próximas, sem "Nº".
  const proxima = page.getByRole('article', { name: `Sem pasta ${titulo}` });
  await expect(proxima).toContainText('Sem pasta anexada.');
  await expect(proxima).not.toContainText('Nº');
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
});

test('P/3 tem a aba CFP com as missões e manda recado que o CFP vê como do Cmt do P3', async ({ page }, info) => {
  const recado = `Conferir efetivo da operação (${info.project.name} ${info.retry})`;
  // Garante que o motor "já leu" a agenda (sem isso a página mostra o aviso de agenda não lida).
  await admin().doc('agendaCfp/eventos').set({ conferidoEm: new Date().toISOString() }, { merge: true });
  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, 'CFP');
  await expect(page.getByRole('heading', { name: 'Missões do CFP' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Missões de hoje' })).toBeVisible();

  await page.getByRole('button', { name: '✉️ Recado para o CFP' }).click();
  await page.getByRole('button', { name: 'Enviar recado' }).click();
  await expect(page.getByText('Escreva o recado.')).toBeVisible();
  await page.getByRole('textbox', { name: /^Recado \(aparece/ }).fill(recado);
  await page.getByRole('button', { name: 'Enviar recado' }).click();
  await expect(page.getByRole('status')).toContainText('Recado enviado');
  await expect(page.getByRole('article', { name: 'Recado do Cmt do P3' }).filter({ hasText: recado })).toBeVisible();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  await sair(page);
  await entrar(page, 'cfp', SENHA_TESTE);
  const cartao = page.getByRole('article', { name: 'Recado do Cmt do P3' }).filter({ hasText: recado });
  await expect(cartao).toContainText('📢 Recado do Cmt do P3');
  await expect(cartao.getByRole('button', { name: 'Apagar recado' })).toHaveCount(0);
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
});

test('P/3 manda recado para a Sala de Operações, que vê como do Cmt do P3 (e o CFP não)', async ({ page }, info) => {
  const recado = `Atenção ao lançamento dos resultados (${info.project.name} ${info.retry})`;
  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, 'Sala de Operações');
  await expect(page.getByRole('heading', { name: 'Recados para a Sala de Operações' })).toBeVisible();
  await page.getByRole('button', { name: '✉️ Recado para a Sala' }).click();
  await page.getByRole('textbox', { name: /^Recado \(aparece/ }).fill(recado);
  await page.getByRole('button', { name: 'Enviar recado' }).click();
  await expect(page.getByRole('status')).toContainText('A Sala de Operações já vê');
  await expect(page.getByRole('article', { name: 'Recado do Cmt do P3' }).filter({ hasText: recado })).toBeVisible();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  await sair(page);
  await entrar(page, 'sala', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: 'Resultados das operações' })).toBeVisible();
  const cartao = page.getByRole('article', { name: 'Recado do Cmt do P3' }).filter({ hasText: recado });
  await expect(cartao).toContainText('📢 Recado do Cmt do P3');
  await expect(cartao.getByRole('button', { name: 'Apagar recado' })).toHaveCount(0);
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  await sair(page);
  await entrar(page, 'cfp', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: 'Missões do CFP' })).toBeVisible();
  await expect(page.getByText(recado)).toHaveCount(0);
});

test('tela da Cia: respondida com prazo vencido há um dia sai; atrasada sem resposta fica', async ({ page }, info) => {
  const marca = `${info.project.name} ${info.retry} ${Date.now()}`;
  const dia = (desloca: number) => {
    const d = new Date();
    d.setDate(d.getDate() + desloca);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const base = { categoria: 'Diversos', tipoSaida: 'OFÍCIO', origem: 'SEI', numeroOrigem: '', observacao: '', unidadeId: '6cia', resposta: '', respondidoPor: '', motivoDevolucao: '' };
  const casos = [
    { id: 'sai', saida: `Respondida vencida ${marca}`, status: 'aceito', prazoCia: dia(-1) },
    { id: 'fica1', saida: `Atrasada sem resposta ${marca}`, status: 'novo', prazoCia: dia(-5) },
    { id: 'fica2', saida: `Respondida no prazo ${marca}`, status: 'respondido', prazoCia: dia(0) },
  ];
  for (const [i, c] of casos.entries()) {
    const numero = 900000 + Math.floor(Math.random() * 90000) + i;
    // A demanda também existe: sem ela, a limpeza de "órfãos" (roda quando a P/3 abre o portal, em outro teste
    // ao mesmo tempo) apagaria estes encaminhamentos no meio do teste.
    await admin()
      .doc(`demandas/${numero}`)
      .set({ ...demandaVazia(dia(0)), numero, saida: c.saida, destinos: ['6cia'], status: 'concluido', criadoEm: FieldValue.serverTimestamp() });
    await admin()
      .doc(`encaminhamentos/${numero}_6cia`)
      .set({ ...base, numero, demandaId: String(numero), saida: c.saida, status: c.status, prazoCia: c.prazoCia, atualizadoEm: FieldValue.serverTimestamp() });
  }
  await entrar(page, '6cia', SENHA_TESTE);
  await expect(page.getByText(`Atrasada sem resposta ${marca}`)).toBeVisible({ timeout: 15000 }); // 1ª carga depois do login
  await expect(page.locator('#secao-respondidas').getByText(`Respondida no prazo ${marca}`)).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('heading', { name: '6ª CIA' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(`Respondida vencida ${marca}`)).toHaveCount(0);
});
