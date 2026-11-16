import { expect, test } from '@playwright/test';
import { entrar, irPara, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

// Só abre e confere a aba: zerar e mudar o contador estão nos testes de regra (o emulador é dividido com os outros testes).
test('aba Administrador pede a senha própria e mostra numeração e zerar', async ({ page }) => {
  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, /Administrador/);

  const senha = page.getByLabel(/Senha do Administrador/);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Digite a senha do Administrador.')).toBeVisible();
  await senha.fill('senha-errada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Senha incorreta.')).toBeVisible();

  await senha.fill(SENHA_TESTE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Numeração' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Zerar portal' })).toBeVisible();
  await expect(page.getByText(/Geral \(nº interno\)/).first()).toBeVisible();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  // Sem digitar ZERAR, nada acontece.
  await page.getByRole('button', { name: /Zerar portal/ }).click();
  await expect(page.getByText('Digite ZERAR para confirmar.')).toBeVisible();

  // Sair do Administrador volta a pedir a senha; a P/3 continua logada.
  await page.getByRole('button', { name: /Sair do Administrador/ }).click();
  await expect(page.getByLabel(/Senha do Administrador/)).toBeVisible();
  await expect(page.locator('#menu-p3')).toBeAttached();
});
