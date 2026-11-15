import { expect, test } from '@playwright/test';
import { entrar, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

test('menu da P/3: lateral esquerda no computador, ☰ no canto superior esquerdo no celular', async ({ page }, info) => {
  await entrar(page, 'p3', SENHA_TESTE);
  const menu = page.getByRole('navigation', { name: 'Seções da P/3' });
  const botao = page.getByRole('button', { name: 'Abrir menu' });
  const itens = ['Demandas Pendentes', 'Numerador', 'Painel', 'CFP', 'Sala Op.', 'Aperfeiçoamento'];

  if (info.project.name === 'celular') {
    await expect(botao).toBeVisible();
    const caixa = (await botao.boundingBox())!;
    expect(caixa.x).toBeLessThan(40);
    expect(caixa.y).toBeLessThan(80);
    await expect(menu).toBeHidden();

    await botao.click();
    await expect(menu).toBeVisible();
    for (const i of itens) await expect(menu.getByRole('link', { name: new RegExp(`^${i.replace('.', '\\.')}`) })).toBeVisible();
    expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
    // Esc fecha; escolher uma opção navega e fecha.
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await botao.click();
    await menu.getByRole('link', { name: 'Painel', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Painel de prazos' })).toBeVisible();
    await expect(menu).toBeHidden();
    // Tocar fora também fecha.
    await botao.click();
    await page.mouse.click(380, 400);
    await expect(menu).toBeHidden();
  } else {
    await expect(botao).toBeHidden();
    await expect(menu).toBeVisible();
    const lateral = (await menu.boundingBox())!;
    const conteudo = (await page.locator('.conteudo-p3').boundingBox())!;
    expect(lateral.x).toBeLessThan(conteudo.x);
    expect(lateral.x + lateral.width).toBeLessThanOrEqual(conteudo.x);
    await menu.getByRole('link', { name: 'Painel', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Painel de prazos' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Painel', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(menu).toBeVisible();
    expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
  }
});

test('menu das Cias e Força Tática: Pendentes, Respondidas e Finalizadas na lateral (PC) e no ☰ (celular)', async ({ page }, info) => {
  await entrar(page, 'ft', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: 'CIA FT' })).toBeVisible();
  const menu = page.getByRole('navigation', { name: 'Seções da Cia' });
  const botao = page.getByRole('button', { name: 'Abrir menu' });
  const link = (nome: string) => menu.getByRole('link', { name: new RegExp(`^${nome}`) });
  await expect(page.getByRole('tab')).toHaveCount(0);

  if (info.project.name === 'celular') {
    await expect(botao).toBeVisible();
    const caixa = (await botao.boundingBox())!;
    expect(caixa.x).toBeLessThan(40);
    expect(caixa.y).toBeLessThan(80);
    await expect(menu).toBeHidden();
    await botao.click();
    for (const i of ['Pendentes', 'Respondidas', 'Finalizadas']) await expect(link(i)).toBeVisible();
    expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
    await link('Respondidas').click();
    await expect(menu).toBeHidden();
    await expect(page.getByRole('heading', { name: /^Respondidas/ })).toBeVisible();
  } else {
    await expect(botao).toBeHidden();
    await expect(menu).toBeVisible();
    const lateral = (await menu.boundingBox())!;
    const conteudo = (await page.locator('.conteudo-p3').boundingBox())!;
    expect(lateral.x + lateral.width).toBeLessThanOrEqual(conteudo.x);
    await expect(link('Pendentes')).toHaveAttribute('aria-current', 'page');
    await link('Finalizadas').click();
    await expect(page.getByRole('heading', { name: /^Finalizadas/ })).toBeVisible();
    await expect(link('Finalizadas')).toHaveAttribute('aria-current', 'page');
    expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
  }
});
