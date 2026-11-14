import { expect, test } from '@playwright/test';
import { entrar, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

test('SEI lançado nas pendentes ganha destino e vai para o Numerador', async ({ page }, info) => {
  const assunto = `Escolta SEI ${info.project.name} ${Date.now()}`;
  await entrar(page, 'p3', SENHA_TESTE);
  await page.getByRole('link', { name: /Demandas Pendentes/ }).click();
  await expect(page.getByRole('heading', { name: 'Demandas Pendentes', level: 2 })).toBeVisible();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  await page.getByRole('link', { name: '+ SEI' }).click();
  await page.getByLabel('Nº do processo SEI').fill('006.00000099/2026-01');
  await page.getByLabel('Texto da demanda (cole aqui)').fill(`${assunto}\nDetalhes do processo colado do SEI.`);
  await page.getByRole('button', { name: 'Salvar pendente' }).click();

  const cartao = page.getByRole('article', { name: assunto });
  await expect(cartao).toContainText('SEI nº 006.00000099/2026-01');
  await cartao.getByText('Ver texto').click();
  await expect(cartao).toContainText('Detalhes do processo colado do SEI.');

  await cartao.getByRole('link', { name: 'Dar destino' }).click();
  await expect(page.getByRole('heading', { name: 'Nova demanda' })).toBeVisible();
  await expect(page.getByLabel(/^Origem/)).toHaveValue('SEI');
  await expect(page.getByLabel('Nº do processo SEI')).toHaveValue('006.00000099/2026-01');
  await expect(page.getByLabel('Demanda (resumo)')).toHaveValue(assunto);
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
  await page.getByLabel('Categoria').selectOption('Escoltas');
  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByRole('status')).toContainText('Demanda registrada');
  await page.getByRole('link', { name: 'Próxima pendente' }).click();
  await expect(page.getByRole('heading', { name: 'Demandas Pendentes', level: 2 })).toBeVisible();
  await expect(page.getByRole('article', { name: assunto })).toHaveCount(0);

  await page.getByRole('link', { name: 'Numerador', exact: true }).click();
  await expect(page.getByRole('link', { name: new RegExp(assunto) })).toContainText('Escoltas');
});

test('Ordem Verbal pede quem deu a ordem e leva isso para a demanda', async ({ page }, info) => {
  const ordem = `Reforço no centro ${info.project.name} ${Date.now()}`;
  await entrar(page, 'p3', SENHA_TESTE);
  await page.getByRole('link', { name: /Demandas Pendentes/ }).click();
  await page.getByRole('link', { name: '+ Ordem Verbal' }).click();
  await page.getByLabel('Qual é a ordem').fill(ordem);
  await page.getByRole('button', { name: 'Salvar pendente' }).click();
  await expect(page.getByText('Informe quem deu a ordem.')).toBeVisible();

  await page.getByLabel('Quem deu a ordem').fill('Cmt Btl');
  await page.getByRole('button', { name: 'Salvar pendente' }).click();
  const cartao = page.getByRole('article', { name: ordem });
  await expect(cartao).toContainText('Ordem de: Cmt Btl');

  await cartao.getByRole('link', { name: 'Dar destino' }).click();
  await expect(page.getByLabel(/^Origem/)).toHaveValue('Ordem Verbal');
  await expect(page.getByLabel('Observação')).toHaveValue('Ordem verbal de Cmt Btl.');
});

test('descartar pede confirmação e pode ser desfeito', async ({ page }, info) => {
  const assunto = `Descartar ${info.project.name} ${Date.now()}`;
  await entrar(page, 'p3', SENHA_TESTE);
  await page.getByRole('link', { name: /Demandas Pendentes/ }).click();
  await page.getByRole('link', { name: '+ SEI' }).click();
  await page.getByLabel('Texto da demanda (cole aqui)').fill(assunto);
  await page.getByRole('button', { name: 'Salvar pendente' }).click();

  const cartao = page.getByRole('article', { name: assunto });
  await cartao.getByRole('button', { name: 'Descartar' }).click();
  await cartao.getByLabel('Motivo do descarte (opcional)').fill('Não é da P/3');
  await cartao.getByRole('button', { name: 'Confirmar descarte' }).click();
  await expect(page.getByRole('article', { name: assunto })).toHaveCount(0);

  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByRole('article', { name: assunto })).toBeVisible();
});

test('Cia não vê a aba Demandas Pendentes', async ({ page }) => {
  await entrar(page, '3cia', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: '3ª CIA' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Demandas Pendentes/ })).toHaveCount(0);
});
