import { expect, test } from '@playwright/test';
import { mesReferencia } from '../src/domain/documentosMensais';
import { rotuloMes } from '../src/domain/controle';
import { diasDoMes } from '../src/domain/producao';
import { entrar, irPara, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

// Operações → Banco de dados: a P/3 vê o que já está guardado por Cia e mês e consulta qualquer indicador.
// A produção completa da 2ª e da 5ª Cia no mês de referência vem do global-setup.
test('Banco de dados: cobertura por Cia e mês e consulta de indicador', async ({ page }) => {
  const mes = mesReferencia();
  const dias = diasDoMes(mes).length;
  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, /^Operações/);
  await page.getByRole('navigation', { name: 'Operações' }).getByRole('link', { name: 'Banco de dados' }).click();
  await expect(page.getByRole('heading', { name: 'Banco de dados', level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Baixar banco completo (Excel)' })).toBeDisabled();

  await page.getByLabel('De (mês)').fill(mes);
  await page.getByLabel('Até (mês)').fill(mes);
  await page.getByRole('button', { name: 'Carregar período' }).click();
  await expect(page.getByRole('status')).toContainText('valores guardados');

  const cobertura = page.getByRole('table', { name: 'Cobertura do banco por mês e Cia' });
  const linha = cobertura.getByRole('row', { name: new RegExp(rotuloMes(mes)) });
  await expect(linha.getByRole('cell').nth(1)).toContainText('Prod ✅'); // 2ª Cia
  await expect(linha.getByRole('cell').nth(2)).toContainText('Prod —'); // 3ª Cia: sem lançamentos

  await page.getByRole('combobox', { name: /^Indicador/ }).selectOption({ label: 'Carros removidos ao pátio' });
  const valores = page.getByRole('table', { name: 'Valores do indicador por mês e Cia' });
  await expect(valores.getByRole('row', { name: new RegExp(rotuloMes(mes)) }).getByRole('cell').nth(1)).toHaveText(String(dias * 2));
  await expect(page.getByRole('button', { name: 'Baixar banco completo (Excel)' })).toBeEnabled();

  // Cópia de segurança no Drive: o portal manda a planilha; o motor (fora do teste) grava no Drive.
  await page.getByRole('button', { name: 'Guardar cópia no Drive' }).click();
  await expect(page.getByText(/Cópia enviada: o motor guarda/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('list', { name: 'Cópias de segurança' }).getByRole('listitem').filter({ hasText: rotuloMes(mes) }).first()).toBeVisible();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
});
