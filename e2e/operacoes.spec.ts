import { expect, test } from '@playwright/test';
import { entrar, sobraLateral } from './ajuda';
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

  await page.goto('/#/pendentes');
  await page.getByRole('link', { name: /Checklist Operações/ }).click();
  await expect(page.getByRole('heading', { name: 'Checklist Operações', level: 2 })).toBeVisible();
  const cartao = page.getByRole('article').filter({ hasText: saida });
  await expect(cartao).toContainText('20/12/2099 a 21/12/2099');
  await expect(cartao).toContainText('Pasta ainda não gerada');
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  await cartao.getByLabel('Ordem de Serviço ok').check();
  await cartao.getByLabel('21/12/2099').fill('777');
  await cartao.getByLabel('20/12/2099').click(); // sai do campo: salva
  await expect(cartao).toContainText('1/5');

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
