import { expect, test } from '@playwright/test';
import { entrar, irPara, irParaAbaCia, sair, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

test('ICC: a P/3 publica a ordem (PDF), a Cia baixa e informa os PM; a P/3 acompanha', async ({ page }, info) => {
  const celular = info.project.name === 'celular';
  const numero = String((Date.now() % 90000) + (celular ? 10000 : 0));
  const unidade = celular ? '3cia' : '1cia';
  const sigla = celular ? '3ª' : '1ª';

  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, 'Aperfeiçoamento');
  await page.getByRole('link', { name: '+ Nova ICC' }).click();
  await page.getByRole('button', { name: 'Publicar ICC' }).click();
  await expect(page.getByText('Escolha o PDF da ordem.')).toBeVisible();
  await page.getByLabel('Nº da ICC').fill(numero);
  await page.getByLabel(/Anexo da ICC/).setInputFiles({ name: `ICC ${numero}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 teste') });
  await page.getByRole('button', { name: 'Publicar ICC' }).click();
  await expect(page.getByRole('heading', { name: `ICC ${numero}`, level: 2 })).toBeVisible({ timeout: 15000 });
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
  await sair(page);

  await entrar(page, unidade, SENHA_TESTE);
  await irParaAbaCia(page, 'Aperfeiçoamento');
  const cartao = page.getByRole('article', { name: `ICC ${numero}` });
  const download = page.waitForEvent('download');
  await cartao.getByRole('button', { name: '📄 Baixar a ordem (PDF)' }).click();
  expect((await download).suggestedFilename()).toBe(`ICC ${numero}.pdf`);

  await cartao.getByRole('button', { name: 'Enviar' }).click();
  await expect(cartao.getByText('Preencha (se não houve, coloque 0).').first()).toBeVisible();
  await cartao.getByLabel('Oficiais').fill('1');
  await cartao.getByLabel('Subten e Sgt').fill('9');
  await cartao.getByLabel('Cb e Sd').fill('43');
  await expect(cartao.getByText('Total: 53')).toBeVisible();
  await cartao.getByLabel('Preenchido por').fill('Sd PM Teste');
  await cartao.getByRole('button', { name: 'Enviar' }).click();
  await expect(cartao.getByText('⏳ Enviado')).toBeVisible({ timeout: 15000 });
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
  await sair(page);

  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, 'Aperfeiçoamento');
  await page.getByRole('link', { name: new RegExp(`ICC ${numero}`) }).click();
  const tabela = page.getByRole('table', { name: `Respostas da ICC ${numero}` });
  await expect(tabela.getByRole('row', { name: new RegExp(`⏳ ${sigla}`) })).toContainText('53');
});
