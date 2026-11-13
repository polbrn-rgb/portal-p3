import type { Page } from '@playwright/test';

export async function entrar(page: Page, unidade: string, senha: string) {
  await page.goto('/');
  await page.getByLabel('Unidade').selectOption(unidade);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Quantos pixels a página passa da largura da tela (0 = sem rolagem para o lado). */
export function sobraLateral(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}
