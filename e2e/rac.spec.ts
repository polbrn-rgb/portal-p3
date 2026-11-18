import { expect, test } from '@playwright/test';
import { entrar, irPara, irParaAbaCia, sair, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

test('RAC: a P/3 abre o mês, a Cia preenche (o portal calcula e confere) e envia; a P/3 acompanha', async ({ page }, info) => {
  const celular = info.project.name === 'celular';
  const ano = 2030 + (Math.floor(Date.now() / 1000) % 40) * 2 + (celular ? 1 : 0); // um mês novo por execução e por tela
  const titulo = `RAC MAIO/${ano}`;
  const unidade = celular ? '3cia' : '1cia';
  const nomeUnidade = celular ? '3ª Cia' : '1ª Cia';

  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, /^Operações/);
  await page.getByRole('navigation', { name: 'Operações' }).getByRole('link', { name: 'RAC', exact: true }).click();
  const abrir = page.getByRole('group', { name: 'Abrir RAC' });
  await abrir.getByLabel('Mês de referência').fill(`${ano}-05`);
  await abrir.getByRole('button', { name: 'Abrir RAC' }).click();
  await expect(abrir.getByText('Informe o prazo das Cias.')).toBeVisible();
  await abrir.getByLabel('Prazo das Cias').fill(`${ano}-06-10`);
  await abrir.getByRole('button', { name: 'Abrir RAC' }).click();
  await expect(page.getByRole('article', { name: titulo })).toBeVisible({ timeout: 15000 });
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
  await sair(page);

  await entrar(page, unidade, SENHA_TESTE);
  await irParaAbaCia(page, 'RAC');
  await page.getByRole('link', { name: new RegExp(titulo) }).click();
  await expect(page.getByRole('heading', { name: `RAC – ${nomeUnidade} – MAIO/${ano}` })).toBeVisible();

  // Enviar vazio: avisa quanto falta.
  await page.getByRole('button', { name: 'Enviar à P/3' }).click();
  await expect(page.getByText(/Falta preencher ou corrigir \d+ campos/)).toBeVisible();

  const numeros = page.locator('.formulario-rac input[inputmode="numeric"]');
  expect(await numeros.count()).toBe(137); // 45 de crimes, 60 por pelotão, 4 à parte e 28 do comparativo
  for (const campo of await numeros.all()) await campo.fill('0');

  // Inconsistências maiores que o total do mês: erro; corrigido, o Real aparece calculado.
  const furto = page.getByRole('group', { name: 'FURTO VEÍCULO' });
  await furto.locator('input').nth(3).fill('62');
  await furto.locator('input').nth(4).fill('63');
  await page.getByLabel('Preenchido por').fill('Sd PM Teste');
  await page.getByRole('button', { name: 'Enviar à P/3' }).click();
  await expect(furto.getByText('não podem passar do total do mês (62)')).toBeVisible();
  await furto.locator('input').nth(4).fill('1');
  await expect(furto.getByText(/Real 61/)).toBeVisible();

  // Pessoas abordadas por pelotão: o TOTAL vai para o comparativo.
  await page.getByRole('group', { name: 'Pessoas Abordadas' }).first().locator('input').first().fill('647');
  await expect(page.getByRole('group', { name: 'Pessoas Abordadas' }).first().getByText('TOTAL 647')).toBeVisible();

  await page.getByRole('button', { name: 'Enviar à P/3' }).click();
  await expect(page.getByText('RAC enviado para a P/3.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('✅ Enviado')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Atualizar envio' })).toBeVisible();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
  await sair(page);

  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, /^Operações/);
  await page.getByRole('navigation', { name: 'Operações' }).getByRole('link', { name: 'RAC', exact: true }).click();
  const tabela = page.getByRole('table', { name: `Situação do ${titulo}` });
  await expect(tabela.getByRole('row', { name: new RegExp(nomeUnidade) })).toContainText('✅ Enviado');
  await expect(tabela.getByRole('row', { name: new RegExp(nomeUnidade) })).toContainText('Sd PM Teste');
});
