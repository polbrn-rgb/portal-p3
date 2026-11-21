import { expect, test } from '@playwright/test';
import { mesReferencia } from '../src/domain/documentosMensais';
import { diasDoMes } from '../src/domain/producao';
import { entrar, irPara, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

// Painel → Estatístico do Batalhão: a produção de todas as Cias. O global-setup lança o mês de referência inteiro
// da 2ª e da 5ª Cia (1 carro removido e 1 moto apreendida por turno).
test('Estatístico do Batalhão: totais, gráficos e Cias com turnos sem lançamento', async ({ page }) => {
  const mes = mesReferencia();
  const dias = diasDoMes(mes).length;
  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, 'Painel');
  await expect(page.getByRole('heading', { name: 'Painel de prazos' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Painel' }).getByRole('link', { name: 'Estatístico do Batalhão' }).click();
  const painel = page.getByRole('region', { name: 'Estatístico do Batalhão' });
  await expect(painel.getByRole('heading', { name: 'Estatístico do Batalhão' })).toBeVisible();

  await painel.getByLabel('Mês', { exact: true }).fill(mes);
  const totais = painel.getByLabel('Totais do Batalhão no mês');
  await expect(totais.locator('.numero-painel', { hasText: 'Veículos removidos ao pátio' }).locator('strong')).toHaveText(String(2 * 2 * dias));
  await expect(painel.getByRole('status', { name: 'Turnos sem lançamento' })).toContainText('1ª');

  await painel.getByRole('combobox', { name: /Indicador dos gráficos/ }).selectOption({ label: 'Veículos removidos ao pátio' });
  const porCia = painel.getByRole('figure', { name: 'Veículos removidos ao pátio — por Cia' });
  await expect(porCia.getByRole('listitem').filter({ hasText: '2ª CIA' })).toContainText(String(2 * dias));
  await expect(painel.getByRole('figure', { name: 'Veículos removidos ao pátio — dia a dia' })).toBeVisible();
  await painel.getByText(/Ver os números dia a dia/).click();
  await expect(painel.getByRole('table', { name: 'Indicador dia a dia' }).getByRole('row', { name: /^01/ })).toContainText('4');
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
});
