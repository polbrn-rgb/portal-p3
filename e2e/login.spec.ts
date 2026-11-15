import { expect, test } from '@playwright/test';
import { entrar } from './ajuda';
import { SENHA_TESTE } from './dados';

test('Cia entra, vê o nome da própria unidade e sai', async ({ page }) => {
  await entrar(page, '1cia', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: '1ª CIA' })).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});

test('P/3 entra direto no Numerador', async ({ page }) => {
  await entrar(page, 'p3', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: 'Numerador', level: 2 })).toBeVisible();
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

test('sem senha: avisa no próprio campo, em vermelho, e não entra', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Digite a senha.')).toBeVisible();
  await expect(page.getByLabel('Senha')).toBeFocused();
  await expect(page.getByLabel('Senha')).toHaveCSS('border-top-color', 'rgb(181, 43, 39)');
  await expect(page.getByRole('button', { name: 'Sair' })).toHaveCount(0);
});
