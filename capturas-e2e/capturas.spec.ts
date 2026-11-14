import { test, type Page } from '@playwright/test';
import { entrar, sair } from '../e2e/ajuda';
import { SENHA_TESTE } from '../e2e/dados';

// Só para conferir o layout: tira fotos das telas em vários tamanhos (não roda no CI normal).
const TAMANHOS = [
  { nome: 'pc-1366', width: 1366, height: 768 },
  { nome: 'pc-1920', width: 1920, height: 1080 },
  { nome: 'celular', width: 412, height: 915 },
];

async function foto(page: Page, nome: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `capturas/${nome}.png`, fullPage: true });
}

test('capturas', async ({ page }) => {
  test.setTimeout(180_000);
  // Dados de exemplo
  await page.setViewportSize({ width: 1366, height: 768 });
  await entrar(page, 'p3', SENHA_TESTE);
  for (const [i, assunto] of ['Pedido de policiamento evento X', 'Escolta de preso para audiência', 'Operação Natal 2026 - reforço'].entries()) {
    await page.getByRole('link', { name: '+ Nova demanda' }).click();
    await page.getByLabel('Demanda (resumo)').fill(assunto);
    await page.getByLabel('1ª CIA', { exact: true }).check();
    await page.getByLabel('Prazo CPA').fill(`2026-12-1${i}`);
    await page.getByRole('button', { name: 'Salvar' }).click();
    await page.getByRole('link', { name: 'Ver lista' }).click();
  }
  await page.goto('/#/pendentes/sei');
  await page.getByLabel('Texto da demanda (cole aqui)').fill('Ofício 123/2026 - pedido de apoio\nTexto do processo.');
  await page.getByRole('button', { name: 'Salvar pendente' }).click();
  await page.getByRole('article').first().waitFor();
  await sair(page);

  for (const t of TAMANHOS) {
    await page.setViewportSize({ width: t.width, height: t.height });
    await page.goto('/');
    await page.getByRole('button', { name: 'Entrar' }).waitFor();
    await foto(page, `${t.nome}-01-login`);
    await entrar(page, 'p3', SENHA_TESTE);
    await page.getByRole('heading', { name: 'Numerador', level: 2 }).waitFor();
    await foto(page, `${t.nome}-02-numerador`);
    await page.goto('/#/pendentes');
    await page.getByRole('article').first().waitFor();
    await foto(page, `${t.nome}-03-pendentes`);
    await page.goto('/#/painel');
    await page.getByRole('heading', { name: 'Painel de prazos' }).waitFor();
    await foto(page, `${t.nome}-04-painel`);
    await page.goto('/#/nova');
    await foto(page, `${t.nome}-05-nova`);
    await page.goto('/#/pendentes/sei');
    await foto(page, `${t.nome}-06-nova-sei`);
    await sair(page);
    await entrar(page, '1cia', SENHA_TESTE);
    await page.getByRole('heading', { name: '1ª CIA' }).waitFor();
    await foto(page, `${t.nome}-07-cia`);
    await page.getByRole('link', { name: /Nº \d+/ }).first().click();
    await foto(page, `${t.nome}-08-cia-demanda`);
    await sair(page);
  }
});
