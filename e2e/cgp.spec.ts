import { expect, test } from '@playwright/test';
import { entrar, entrarRE, irParaAbaCia, sair } from './ajuda';
import { SENHA_TESTE } from './dados';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const foto = (n: number) => ({ name: `foto${n}.png`, mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });

// CGP da Cia: envia uma demanda do Numerador com período, não duplica, importa fotos e deixa recado.
test('CGP da Cia: enviar com período, aviso de já enviada, fotos e recado', async ({ page }, info) => {
  test.setTimeout(90_000);
  const assunto = `Missão CGP ${info.project.name} ${Date.now()}`;
  const d = new Date();
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const hoje = iso(d);
  const fim = iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 10));

  await entrar(page, '4cia', SENHA_TESTE);
  await irParaAbaCia(page, 'Numerador');
  await page.getByRole('link', { name: '+ Nova demanda' }).click();
  await page.getByLabel('Demanda (resumo)').fill(assunto);
  await page.getByRole('button', { name: 'Gerar número' }).click();
  await page.getByRole('link', { name: 'Voltar ao Numerador' }).click();
  await page.getByText(assunto).click();

  await page.getByRole('button', { name: '➕ Enviar para o CGP' }).click();
  const caixa = page.getByRole('group', { name: 'Enviar para o CGP' });
  await caixa.getByLabel('De').fill(hoje);
  await caixa.getByLabel('Até').fill(fim);
  await expect(caixa).toContainText('11 dias');
  await caixa.getByRole('button', { name: 'Enviar para o CGP' }).click();
  await expect(page.getByText(/Já enviada para o CGP/)).toBeVisible();
  await expect(page.getByRole('button', { name: '➕ Enviar para o CGP' })).toHaveCount(0);

  await irParaAbaCia(page, 'CGP');
  await expect(page.getByRole('heading', { name: 'Missões do CGP' })).toBeVisible();
  await expect(page.getByRole('article', { name: assunto })).toBeVisible();

  // Recado
  await page.getByRole('navigation', { name: 'Página do CGP' }).getByRole('link', { name: 'Recados' }).click();
  await page.getByRole('textbox', { name: /^Recado/ }).fill(`Recado ${assunto}`);
  await page.getByRole('button', { name: 'Enviar recado' }).click();
  await expect(page.getByText(`Recado ${assunto}`)).toBeVisible();

  // Fotos: campos obrigatórios, depois importa 3
  await page.getByRole('navigation', { name: 'Página do CGP' }).getByRole('link', { name: 'Importação de fotos' }).click();
  await page.getByRole('button', { name: /^Importar/ }).click();
  await expect(page.getByText('Informe o local da foto.')).toBeVisible();
  await page.getByPlaceholder('Ex.: Operação, Intensificação').fill('Operação');
  await page.getByLabel(/^Local da foto/).fill(`Praça ${assunto}`);
  await page.getByPlaceholder('Equipe, local, viatura').fill('Equipe 1, VTR 08-123');
  await page.locator('input[type="file"]').setInputFiles([foto(1), foto(2), foto(3)]);
  await page.getByRole('button', { name: 'Importar 3 fotos' }).click();
  await expect(page.getByText('3 foto(s) importada(s).')).toBeVisible();
  await expect(page.getByRole('img', { name: `Operação — Praça ${assunto}` })).toHaveCount(3);
  await expect(page.getByText(/Importada por 4ª CIA em/).first()).toBeVisible();

  // O CGP da 4ª Cia (acesso por RE) vê só a página dele: a missão, o recado e as fotos; não exclui missão.
  await sair(page);
  await entrarRE(page, '444444-4', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: 'CGP 4ª CIA' })).toBeVisible();
  await expect(page.locator('#menu-unidade')).toHaveCount(0);
  await expect(page.getByRole('article', { name: assunto })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Excluir do CGP' })).toHaveCount(0);
  await expect(page.getByText(`Recado ${assunto}`)).toBeVisible();
  await page.getByRole('navigation', { name: 'Página do CGP' }).getByRole('link', { name: 'Importação de fotos' }).click();
  await expect(page.getByRole('img', { name: `Operação — Praça ${assunto}` })).toHaveCount(3);
  await sair(page);
  await entrar(page, '4cia', SENHA_TESTE);
  await irParaAbaCia(page, 'CGP');

  // Excluir do CGP: a demanda volta a poder ser enviada
  await page.getByRole('navigation', { name: 'Página do CGP' }).getByRole('link', { name: 'Missões' }).click();
  const art = page.getByRole('article', { name: assunto });
  await art.getByRole('button', { name: 'Excluir do CGP' }).click();
  await art.getByRole('button', { name: 'Excluir' }).click();
  await expect(page.getByRole('article', { name: assunto })).toHaveCount(0);
});
