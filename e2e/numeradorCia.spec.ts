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
