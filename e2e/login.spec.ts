import { expect, test, type Page } from '@playwright/test';
import { SENHA_TESTE } from './dados';

async function entrar(page: Page, unidade: string, senha: string) {
  await page.goto('/');
  await page.getByLabel('Unidade').selectOption(unidade);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('Cia entra, vê o nome da própria unidade e sai', async ({ page }) => {
  await entrar(page, '1cia', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: '1ª CIA' })).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});

test('P/3 entra com o perfil da P/3', async ({ page }) => {
  await entrar(page, 'p3', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: 'P/3', level: 2 })).toBeVisible();
});

test('senha errada mostra aviso e não entra', async ({ page }) => {
  await entrar(page, 'ft', 'senha-errada');
  await expect(page.getByRole('alert')).toHaveText('Senha incorreta.');
  await expect(page.getByRole('button', { name: 'Sair' })).toHaveCount(0);
});

test('o aparelho lembra a última unidade escolhida', async ({ page }) => {
  await entrar(page, '4cia', SENHA_TESTE);
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByLabel('Unidade')).toHaveValue('4cia');
});
