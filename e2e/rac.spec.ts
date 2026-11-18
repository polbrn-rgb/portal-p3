import { expect, test } from '@playwright/test';
import { entrar, irPara, irParaAbaCia, sair, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

// Imagem PNG mínima (1×1) para os 7 prints; no emulador a leitura automática fica desligada.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const PRINTS = [
  'Roubo de veículo — Indicadores Criminais',
  'Roubo de veículo — Painel de Roubo e Furto de Veículo',
  'Furto de veículo — Indicadores Criminais',
  'Furto de veículo — Painel de Roubo e Furto de Veículo',
  'Roubo outros — Indicadores Criminais',
  'Roubo outros — Painel de Roubos',
  'Furto outros — Indicadores Criminais',
];

test('RAC: a P/3 abre o mês, a Cia preenche (o portal calcula e confere) e envia; a P/3 acompanha', async ({ page }, info) => {
  test.setTimeout(90_000); // teste longo: 2 logins da P/3, 1 da Cia e 137 campos
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
  await expect(abrir.getByText(`RAC de MAIO/${ano} aberto para as Cias.`)).toBeVisible({ timeout: 15000 }); // banco confirmou
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

  // Inconsistências maiores que o total do mês: erro; corrigido, o Real aparece calculado na tabela.
  const mesTitulo = `mai/${String(ano).slice(2)}`;
  await page.getByLabel(`FURTO VEÍCULO ${mesTitulo}`, { exact: true }).fill('62');
  await page.getByLabel('FURTO VEÍCULO Inconsistências', { exact: true }).fill('63');
  await page.getByLabel('Preenchido por').fill('Sd PM Teste');
  await page.getByRole('button', { name: 'Enviar à P/3' }).click();
  const inconsist = page.getByRole('table', { name: 'COMPARATIVO ANUAL COM INCONSISTÊNCIAS' });
  await expect(inconsist.getByText('não podem passar do total do mês (62)')).toBeVisible();
  await page.getByLabel('FURTO VEÍCULO Inconsistências', { exact: true }).fill('1');
  await expect(inconsist.locator('tr', { hasText: 'FURTO VEÍCULO' })).toContainText('61');
  // O mês do trimestral vem do comparativo anual (não é digitado de novo).
  await expect(page.getByRole('table', { name: 'COMPARATIVO TRIMESTRAL' }).locator('tr', { hasText: 'FURTO VEÍCULO' })).toContainText('62');

  // Pessoas abordadas por pelotão: o TOTAL vai para o comparativo de produtividade.
  await page.getByLabel('Pessoas Abordadas Pel A', { exact: true }).fill('647');
  await expect(page.getByRole('table', { name: 'PRODUTIVIDADE MENSAL', exact: true }).locator('tr', { hasText: 'Pessoas Abordadas' })).toContainText('647');
  await expect(page.getByRole('table', { name: 'COMPARATIVO PRODUTIVIDADE ANUAL' }).locator('tr', { hasText: 'Pessoas Abordadas' })).toContainText('647');

  // Sem os 7 prints não envia; depois de enviar, aparece a miniatura de cada um.
  await page.getByRole('button', { name: 'Enviar à P/3' }).click();
  await expect(page.getByText(`Envie o print: ${PRINTS[0]}.`)).toBeVisible();
  for (const [i, rotulo] of PRINTS.entries())
    await page.getByLabel(new RegExp(`^${rotulo}`)).setInputFiles({ name: `print${i}.png`, mimeType: 'image/png', buffer: PNG });
  for (const rotulo of PRINTS) await expect(page.getByRole('img', { name: `Print enviado: ${rotulo}` })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Enviado.', { exact: true })).toHaveCount(PRINTS.length, { timeout: 15000 }); // banco confirmou os 7

  await page.getByRole('button', { name: 'Enviar à P/3' }).click();
  await expect(page.getByText('RAC enviado para a P/3.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('✅ Enviado')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Atualizar envio' })).toBeVisible();

  // A Cia vê os slides na tela e baixa o .pptx.
  await page.getByRole('button', { name: '👁️ Pré-visualizar' }).click();
  const previa = page.getByLabel(`Pré-visualização do RAC – ${nomeUnidade}`);
  await expect(previa.getByText(`RAC – ${nomeUnidade} - MAIO/${ano}`)).toBeVisible();
  await expect(previa.getByRole('img', { name: 'Print: ROUBO DE VEÍCULOS' }).first()).toBeVisible({ timeout: 15000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '⬇️ Baixar apresentação (.pptx)' }).click();
  expect((await download).suggestedFilename()).toBe(`RAC ${nomeUnidade} - MAIO-${ano}.pptx`);
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
  await sair(page);

  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, /^Operações/);
  await page.getByRole('navigation', { name: 'Operações' }).getByRole('link', { name: 'RAC', exact: true }).click();
  const tabela = page.getByRole('table', { name: `Situação do ${titulo}` });
  await expect(tabela.getByRole('row', { name: new RegExp(nomeUnidade) })).toContainText('✅ Enviado');
  await expect(tabela.getByRole('row', { name: new RegExp(nomeUnidade) })).toContainText('Sd PM Teste');

  // A P/3 baixa o RAC da Cia e depois exclui o mês inteiro (sai do banco e da tela).
  const baixou = page.waitForEvent('download');
  await page.getByRole('button', { name: `Baixar RAC da ${nomeUnidade}` }).click();
  expect((await baixou).suggestedFilename()).toBe(`RAC ${nomeUnidade} - MAIO-${ano}.pptx`);
  const cartao = page.getByRole('article', { name: titulo });
  await cartao.getByRole('button', { name: '🗑️ Excluir RAC do mês' }).click();
  await cartao.getByRole('alertdialog').getByRole('button', { name: 'Sim, excluir' }).click();
  await expect(page.getByRole('article', { name: titulo })).toHaveCount(0, { timeout: 15000 });
});
