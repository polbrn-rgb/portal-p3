import { expect, test } from '@playwright/test';
import { entrar, irParaAbaCia } from './ajuda';
import { SENHA_TESTE } from './dados';

// Numerador da Cia: gera o número no padrão da Cia e põe o prazo na agenda dela.
test('Numerador da Cia: número 8BPMM-xxx/303/AA e prazo na Agenda', async ({ page }, info) => {
  test.setTimeout(60_000);
  const assunto = `Escala numerador ${info.project.name} ${Date.now()}`;
  const hoje = new Date();
  const prazo = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  const ano = String(hoje.getFullYear()).slice(2);

  await entrar(page, '3cia', SENHA_TESTE);
  await irParaAbaCia(page, 'Numerador');
  await page.getByRole('link', { name: '+ Nova demanda' }).click();
  await page.getByLabel('Demanda (resumo)').fill(assunto);
  await expect(page.getByLabel('Responsável (quem está logado)')).toHaveValue('3ª CIA');
  await page.getByLabel('Prazo (vai para a Agenda)').fill(prazo);
  await page.getByRole('button', { name: 'Gerar número' }).click();
  await expect(page.locator('.numero-gerado')).toHaveText(new RegExp(`^OFÍCIO 8BPMM-\\d{3}/303/${ano}$`));
  await page.getByRole('link', { name: 'Voltar ao Numerador' }).click();
  await expect(page.getByText(assunto)).toBeVisible();

  await irParaAbaCia(page, 'Agenda');
  await page.getByRole('tab', { name: 'Dia' }).click();
  await expect(page.locator('.agenda').getByRole('button', { name: new RegExp(assunto) }).first()).toBeVisible();
});

// Ordem Verbal pede quem deu a ordem; a demanda já pode ir para o CGP (com a ordem de serviço) ao gerar o número.
test('Numerador da Cia: Ordem Verbal com quem deu a ordem e envio ao CGP na criação', async ({ page }, info) => {
  test.setTimeout(60_000);
  const assunto = `Ordem verbal ${info.project.name} ${Date.now()}`;

  await entrar(page, '5cia', SENHA_TESTE);
  await irParaAbaCia(page, 'Numerador');
  await page.getByRole('link', { name: '+ Nova demanda' }).click();
  await page.getByLabel('Demanda (resumo)').fill(assunto);
  await page.getByRole('combobox', { name: 'Origem' }).selectOption('Ordem Verbal');
  await expect(page.getByLabel('Nº da origem')).toHaveCount(0);

  const cgp = page.getByRole('group', { name: 'CGP' });
  await cgp.getByRole('checkbox', { name: 'Enviar também para o CGP' }).check();
  await expect(cgp).toContainText('1 dia');
  await cgp.locator('input[type="file"]').setInputFiles({ name: 'OS verbal.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 teste') });

  await page.getByRole('button', { name: 'Gerar número' }).click();
  await expect(page.getByText('Informe quem deu a ordem.')).toBeVisible();
  await page.getByLabel(/^Quem deu a ordem/).fill('Cap PM Fulano');
  await page.getByRole('button', { name: 'Gerar número' }).click();
  await expect(page.locator('.numero-gerado')).toBeVisible();
  await expect(page.getByText('✅ Enviada para o CGP.')).toBeVisible();

  await page.getByRole('link', { name: 'Voltar ao Numerador' }).click();
  const item = page.getByRole('link', { name: new RegExp(assunto) });
  await expect(item).toContainText('Ordem verbal de Cap PM Fulano');
  await expect(item).toContainText('✅ CGP');

  await irParaAbaCia(page, 'CGP');
  const missao = page.getByRole('article', { name: assunto });
  await expect(missao.getByRole('button', { name: '📄 Abrir ordem de serviço' })).toBeVisible();
  await expect(missao).toContainText('OS verbal.pdf');
  await expect(missao).toContainText('(1 dia depois do fim da missão)');
});
