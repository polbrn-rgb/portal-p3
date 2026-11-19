import { expect, test } from '@playwright/test';
import { entrar, irParaAbaCia, marcarDestino, sair, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

// Prazo dado pela P/3 cai na agenda da Cia de destino; cada agenda é independente.
test('Agenda das Cias: prazo da P/3 aparece na Cia certa e o evento da Cia fica só nela', async ({ page }, info) => {
  test.setTimeout(60_000);
  const sufixo = `${info.project.name} ${Date.now()}`;
  const assunto = `Prazo agenda ${sufixo}`;
  const eventoCia = `Instrução 5ª ${sufixo}`;
  const hoje = new Date();
  const prazo = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  const naAgenda = (texto: string) => page.locator('.agenda').getByRole('button', { name: new RegExp(texto) }).first();

  await entrar(page, 'p3', SENHA_TESTE);
  await page.getByRole('link', { name: '+ Nova demanda' }).click();
  await page.getByLabel('Demanda (resumo)').fill(assunto);
  await page.getByLabel('Categoria').selectOption('Escoltas');
  await marcarDestino(page, '5ª CIA');
  await page.getByLabel('Prazo Cia').fill(prazo);
  await page.getByLabel('Prazo CPA').fill(prazo);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('link', { name: 'Ver lista' })).toBeVisible();
  await sair(page);

  // 5ª Cia: o prazo está na agenda dela, com o atalho para a demanda; ela lança um evento próprio.
  await entrar(page, '5cia', SENHA_TESTE);
  await irParaAbaCia(page, 'Agenda');
  await expect(page.getByRole('heading', { name: 'Agenda', level: 2 })).toBeVisible();
  await expect(page.getByLabel('Prazos da P/3')).toBeChecked();
  await page.getByRole('tab', { name: 'Dia' }).click();
  await expect(naAgenda(assunto)).toBeVisible();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
  await naAgenda(assunto).click();
  const detalhe = page.getByRole('dialog', { name: new RegExp(assunto) });
  await expect(detalhe).toContainText('Prazo definido pela P/3');
  await expect(detalhe.getByRole('button', { name: '✏️ Editar' })).toHaveCount(0);
  await detalhe.getByRole('button', { name: 'Fechar' }).click();

  await page.getByRole('button', { name: '+ Novo evento' }).click();
  const form = page.getByRole('dialog', { name: 'Novo evento' });
  await expect(form.getByLabel('Demanda do Numerador (nº)')).toHaveCount(0);
  await form.getByLabel(/^Título/).fill(eventoCia);
  await form.getByRole('button', { name: 'Salvar' }).click();
  await expect(form).toHaveCount(0);
  await expect(naAgenda(eventoCia)).toBeVisible();
  await sair(page);

  // 6ª Cia: não vê o prazo da 5ª nem o evento dela.
  await entrar(page, '6cia', SENHA_TESTE);
  await irParaAbaCia(page, 'Agenda');
  await page.getByRole('tab', { name: 'Dia' }).click();
  await expect(page.getByRole('heading', { name: 'Agenda', level: 2 })).toBeVisible();
  await expect(naAgenda(assunto)).toHaveCount(0);
  await expect(naAgenda(eventoCia)).toHaveCount(0);
});

test('Sala de Operações tem agenda própria; o CFP não', async ({ page }) => {
  await entrar(page, 'sala', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: 'Agenda', level: 2 })).toBeVisible();
  await expect(page.getByLabel('Prazos da P/3')).toBeVisible();
  await sair(page);
  await entrar(page, 'cfp', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: 'Agenda', level: 2 })).toHaveCount(0);
});
