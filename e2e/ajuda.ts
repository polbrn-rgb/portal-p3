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

/** Sai e espera a tela de login voltar (sem isso, o próximo login pode pegar a sessão antiga). */
export async function sair(page: Page) {
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.getByRole('button', { name: 'Entrar' }).waitFor();
}

/** Vai para uma seção da P/3 pelo menu (no celular abre o ☰ antes). */
export async function irPara(page: Page, secao: string | RegExp) {
  // Espera a tela da P/3 aparecer depois do login (fechada no celular, a gaveta fica fora da árvore de acessibilidade).
  await page.locator('#menu-p3').waitFor({ state: 'attached' });
  const botao = page.getByRole('button', { name: 'Abrir menu' });
  if (await botao.isVisible()) await botao.click();
  await page
    .getByRole('navigation', { name: 'Seções da P/3' })
    .getByRole('link', typeof secao === 'string' ? { name: secao, exact: true } : { name: secao })
    .click();
}

/** Vai para uma aba da Cia/Força Tática pelo menu (no celular abre o ☰ antes). */
export async function irParaAbaCia(page: Page, aba: 'Pendentes' | 'Respondidas' | 'Finalizadas' | 'Documentos Mensais' | 'Aperfeiçoamento') {
  await page.locator('#menu-unidade').waitFor({ state: 'attached' });
  const botao = page.getByRole('button', { name: 'Abrir menu' });
  if (await botao.isVisible()) await botao.click();
  await page.getByRole('navigation', { name: 'Seções da Cia' }).getByRole('link', { name: new RegExp(`^${aba}`) }).click();
}
