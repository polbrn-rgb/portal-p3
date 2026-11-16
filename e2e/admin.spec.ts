import { expect, test } from '@playwright/test';
import { entrar, irPara, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

// Zerar e mudar o contador estão nos testes de regra (o emulador é dividido com os outros testes).
test('aba Administrador: senha própria, sub-abas e manutenção das listas do numerador', async ({ page }, info) => {
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

  const subabas = page.getByRole('navigation', { name: 'Administrador' });
  await expect(subabas.getByRole('link')).toHaveText(['Numeração', 'Listas do numerador', 'Zerar portal']);
  await expect(page.getByRole('heading', { name: 'Numeração' })).toBeVisible();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  // Zerar: sem digitar ZERAR, nada acontece.
  await subabas.getByRole('link', { name: 'Zerar portal' }).click();
  await page.getByRole('button', { name: /Zerar portal/ }).click();
  await expect(page.getByText('Digite ZERAR para confirmar.')).toBeVisible();

  // Listas: incluir um responsável, ver no cadastro de demanda, retirar.
  await subabas.getByRole('link', { name: 'Listas do numerador' }).click();
  const nome = `Sd Teste ${info.project.name} ${info.retry}`;
  await page.getByRole('combobox', { name: /^Lista/ }).selectOption('responsaveis');
  await page.getByLabel(/Incluir em Responsável/).fill(nome);
  await page.getByRole('button', { name: '+ Incluir' }).click();
  const itens = page.getByRole('list', { name: 'Itens de Responsável' });
  await expect(itens.getByText(nome)).toBeVisible();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  await page.goto('/#/nova');
  await expect(page.getByLabel('Responsável').locator('option', { hasText: nome })).toHaveCount(1);

  await irPara(page, /Administrador/);
  await page.getByLabel(/Senha do Administrador/).fill(SENHA_TESTE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('navigation', { name: 'Administrador' }).getByRole('link', { name: 'Listas do numerador' }).click();
  await page.getByRole('combobox', { name: /^Lista/ }).selectOption('responsaveis');
  await page.getByRole('listitem').filter({ hasText: nome }).getByRole('button', { name: 'Retirar' }).click();
  await expect(page.getByText(`"${nome}" retirado das demandas novas.`)).toBeVisible();

  await page.goto('/#/nova');
  await expect(page.getByLabel('Responsável').locator('option', { hasText: nome })).toHaveCount(0);
});
