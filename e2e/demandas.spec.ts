import { expect, test } from '@playwright/test';
import { entrar, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

test('P/3 cadastra, busca, conclui e acha a demanda nas concluídas', async ({ page }, info) => {
  const assunto = `Policiamento teste ${info.project.name} ${Date.now()}`;
  await entrar(page, 'p3', SENHA_TESTE);

  await page.getByRole('link', { name: '+ Nova demanda' }).click();
  await page.getByLabel(/^Origem/).selectOption('SEI');
  await page.getByLabel('Nº do processo SEI').fill('006.00000001/2026-01');
  await page.getByLabel('Saída (assunto)').fill(assunto);
  await page.getByLabel('Categoria').selectOption('Pedidos de Policiamento');
  await page.getByLabel('1ª CIA', { exact: true }).check();
  await page.getByLabel('Prazo CPA').fill('2099-12-31');
  await page.getByRole('button', { name: 'Salvar' }).click();

  const item = page.getByRole('link', { name: new RegExp(assunto) });
  await expect(item).toBeVisible();
  await expect(item).toContainText('Em aberto');
  await expect(item).toContainText('1ª CIA');

  await page.getByLabel('Buscar demandas').fill(assunto.slice(-13));
  await expect(page.getByRole('link', { name: /Nº \d+/ })).toHaveCount(1);

  await item.click();
  await page.getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByRole('heading', { name: 'Demandas', level: 2 })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(assunto) })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Concluídas' }).click();
  await expect(page.getByRole('link', { name: new RegExp(assunto) })).toContainText('Concluído');
});

test('formulário não salva sem os campos obrigatórios', async ({ page }) => {
  await entrar(page, 'p3', SENHA_TESTE);
  await page.getByRole('link', { name: '+ Nova demanda' }).click();
  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByRole('alert')).toHaveText('Confira os campos destacados.');
  await expect(page.getByText('Informe a saída (assunto).')).toBeVisible();
  await expect(page.getByText('Escolha a categoria.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nova demanda' })).toBeVisible();
});

test('marcar TODAS cobre as 7 Cias', async ({ page }) => {
  await entrar(page, 'p3', SENHA_TESTE);
  await page.getByRole('link', { name: '+ Nova demanda' }).click();
  await page.getByLabel('TODAS', { exact: true }).check();
  await expect(page.getByLabel('6ª CIA', { exact: true })).toBeChecked();
  await expect(page.getByLabel('6ª CIA', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('P/2', { exact: true })).not.toBeChecked();
});

test('Cia não vê o cadastro de demandas', async ({ page }) => {
  await entrar(page, '2cia', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: '2ª CIA' })).toBeVisible();
  await expect(page.getByRole('link', { name: '+ Nova demanda' })).toHaveCount(0);
});

test('lista e formulário cabem na tela, no celular e no computador', async ({ page }) => {
  await entrar(page, 'p3', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: 'Demandas', level: 2 })).toBeVisible();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  await page.getByRole('link', { name: '+ Nova demanda' }).click();
  await expect(page.getByRole('heading', { name: 'Nova demanda' })).toBeVisible();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
});
