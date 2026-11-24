import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { entrar, irPara, irParaAbaCia, sair, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

test('Ordem de Serviço + Operações Policiais entra no Checklist Operações', async ({ page }, info) => {
  const saida = `Operação teste ${info.project.name} ${Date.now()}`;
  await entrar(page, 'p3', SENHA_TESTE);
  await page.getByRole('link', { name: '+ Nova demanda' }).click();
  await page.getByLabel('Demanda (resumo)').fill(saida);
  await page.getByLabel('Tipo de saída').selectOption('ORDEM DE SERVIÇO');
  await page.getByLabel('Categoria').selectOption('Operações Policiais');
  await page.getByLabel('Início Btl').fill('2099-12-20');
  await page.getByLabel('Término Btl').fill('2099-12-21');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toContainText('Demanda registrada');

  await irPara(page, /^Operações/);
  await expect(page.getByRole('navigation', { name: 'Operações' }).getByRole('link', { name: /Checklist Operações/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Checklist Operações', level: 2 })).toBeVisible();
  const cartao = page.getByRole('article').filter({ hasText: saida });
  await expect(cartao).toContainText('20/12/2099 a 21/12/2099');
  await expect(cartao).toContainText('Pasta ainda não gerada');
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  await cartao.getByLabel('Ordem de Serviço ok').check();
  await cartao.getByLabel('21/12/2099').fill('777');
  await cartao.getByLabel('20/12/2099').click(); // sai do campo: salva
  await expect(cartao).toContainText('1/5');
  // Espera chegar no banco antes de recarregar a página.
  const numero = (await cartao.locator('strong').first().textContent())!.replace(/\D/g, '');
  const admin = getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-portal-p3' }));
  await expect
    .poll(async () => (await admin.doc(`operacoes/${numero}`).get()).data()?.protocolos?.['2099-12-21'])
    .toBe('777');

  await page.reload();
  const depois = page.getByRole('article').filter({ hasText: saida });
  await expect(depois.getByLabel('Ordem de Serviço ok')).toBeChecked();
  await expect(depois.getByLabel('21/12/2099')).toHaveValue('777');
  await expect(depois).toContainText('Protocolos Sicoordop: 1 de 2 dia(s)');

  await depois.getByRole('button', { name: 'Concluir operação' }).click();
  await expect(depois).toContainText('Ainda faltam 4 item(ns).');
  await depois.getByRole('button', { name: 'Confirmar conclusão' }).click();
  await expect(page.getByRole('article').filter({ hasText: saida })).toHaveCount(0);
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByRole('article').filter({ hasText: saida })).toBeVisible();
});

test('solicitação de efetivo: P/3 pede, Cia preenche pelo RE, P/3 vê quem vai', async ({ page }, info) => {
  const saida = `Operação efetivo ${info.project.name} ${Date.now()}`;
  await entrar(page, 'p3', SENHA_TESTE);
  await page.getByRole('link', { name: '+ Nova demanda' }).click();
  await page.getByLabel('Demanda (resumo)').fill(saida);
  await page.getByLabel('Tipo de saída').selectOption('ORDEM DE SERVIÇO');
  await page.getByLabel('Categoria').selectOption('Operações Policiais');
  await page.getByLabel('Início Btl').fill('2099-12-20');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toContainText('Demanda registrada');

  await page.goto('/#/operacoes');
  const cartao = page.getByRole('article').filter({ hasText: saida });
  await cartao.getByLabel('Solicitação de efetivo').check();
  const pedido = cartao.getByRole('form', { name: 'Solicitação de efetivo' });
  await pedido.getByRole('button', { name: 'Enviar solicitação às Cias' }).click();
  await expect(pedido).toContainText('Informe o prazo');
  await expect(pedido.getByLabel('Prazo para as Cias preencherem')).toBeFocused();
  await pedido.getByLabel('Prazo para as Cias preencherem').fill('2099-12-15');
  await pedido.getByLabel('CPF').check();
  await pedido.getByLabel('3ª CIA').check();
  await pedido.getByRole('group', { name: 'Quantidades 3ª CIA' }).getByLabel('Cb/Sd PM').fill('2');
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
  await pedido.getByRole('button', { name: 'Enviar solicitação às Cias' }).click();
  await expect(cartao).toContainText('Prazo para as Cias: 15/12/2099');
  await expect(cartao).toContainText('0 de 2 policiais');
  await sair(page);

  await entrar(page, '3cia', SENHA_TESTE);
  await page.getByRole('link').filter({ hasText: saida }).click();
  await page.getByLabel('RE do policial').fill('1234567');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByRole('status')).toContainText('Cb PM SILVA');
  await page.getByRole('button', { name: '+ Adicionar policial' }).click();
  await expect(page.getByText('Preencha: CPF.')).toBeVisible();
  await expect(page.getByLabel('CPF')).toBeFocused();
  await page.getByLabel('CPF').fill('123.456.789-00');
  await page.getByRole('button', { name: '+ Adicionar policial' }).click();
  await expect(page.getByText('RE 123456-7')).toBeVisible();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
  await page.getByLabel('Enviado por').fill('2º Sgt PM Teste');
  await page.getByRole('button', { name: 'Enviar efetivo' }).click();
  await expect(page.getByText('Efetivo enviado para a P/3')).toBeVisible();
  // Painel de Demandas: respondida sai da seção Pendentes e vai para Respondidas.
  const pedido3 = (secao: string) =>
    page.locator(`#secao-${secao}`).getByRole('region', { name: 'Solicitações de efetivo' }).getByRole('link').filter({ hasText: saida });
  await irParaAbaCia(page, 'Painel de Demandas');
  await expect(page.getByRole('heading', { name: /^Pendentes \(/ })).toBeVisible();
  await expect(pedido3('pendentes')).toHaveCount(0);
  await expect(pedido3('respondidas')).toContainText('Respondida');
  await expect(page.getByRole('heading', { name: /^Finalizadas \(/ })).toBeVisible();
  await expect(pedido3('finalizadas')).toHaveCount(0);
  await sair(page);

  await entrar(page, 'p3', SENHA_TESTE);
  await page.goto('/#/operacoes');
  const depois = page.getByRole('article').filter({ hasText: saida });
  await expect(depois).toContainText('1 de 2 policiais');
  await depois.getByText('3ª CIA').click();
  await expect(depois).toContainText('Cb PM SILVA · RE 123456-7');
  await expect(depois).toContainText('CPF: 123.456.789-00');

  // Baixar o efetivo em Excel.
  const [arquivo] = await Promise.all([page.waitForEvent('download'), depois.getByRole('button', { name: '⬇️ Baixar efetivo (Excel)' }).click()]);
  expect(arquivo.suggestedFilename()).toMatch(/^efetivo-op-\d+\.xlsx$/);
  const bytes = readFileSync((await arquivo.path())!);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  expect(bytes.toString('utf8')).toContain('SILVA');

  // Editar depois de enviada: abre já preenchida; mudar a quantidade reabre para a Cia.
  await depois.getByRole('button', { name: '✏️ Editar solicitação' }).click();
  const edicao = depois.getByRole('form', { name: 'Solicitação de efetivo' });
  await expect(edicao.getByLabel('Prazo para as Cias preencherem')).toHaveValue('2099-12-15');
  await expect(edicao.getByLabel('CPF')).toBeChecked();
  const qtd = edicao.getByRole('group', { name: 'Quantidades 3ª CIA' }).getByLabel('Cb/Sd PM');
  await expect(qtd).toHaveValue('2');
  await qtd.fill('3');
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
  await edicao.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(depois).toContainText('1 de 3 policiais');
  await expect(depois).toContainText('Aguardando');
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
});
