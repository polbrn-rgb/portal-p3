import { expect, test } from '@playwright/test';
import { entrar, entrarRE, irPara, irParaAbaCia, sair } from './ajuda';
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
  await caixa.getByRole('textbox', { name: 'De', exact: true }).fill(hoje);
  await caixa.getByRole('textbox', { name: 'Até', exact: true }).fill(fim);
  await expect(caixa).toContainText('11 dias');
  // Ordem de serviço junto com a missão (opcional): PDF.
  await caixa.locator('input[type="file"]').setInputFiles({ name: 'OS 4cia.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 teste') });
  await caixa.getByRole('button', { name: 'Enviar para o CGP' }).click();
  await expect(page.getByText(/Já enviada para o CGP/)).toBeVisible();
  await expect(page.getByRole('button', { name: '➕ Enviar para o CGP' })).toHaveCount(0);

  await irParaAbaCia(page, 'CGP');
  await expect(page.getByRole('heading', { name: 'Missões do CGP' })).toBeVisible();
  await expect(page.getByRole('article', { name: assunto })).toBeVisible();
  await expect(page.getByRole('article', { name: assunto }).getByRole('button', { name: '📄 Abrir ordem de serviço' })).toBeVisible();
  await expect(page.getByRole('article', { name: assunto })).toContainText('OS 4cia.pdf');
  await expect(page.getByRole('article', { name: assunto })).toContainText(/Sai do sistema em \d{2}\/\d{2}\/\d{4}/);

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
  await expect(page.getByText(/^Sai do sistema em \d{2}\/\d{2}\/\d{4}$/).first()).toBeVisible();

  // A Cia encaminha as fotos à P/3, uma a uma (a mesma foto não vai duas vezes). O botão "Encaminhar as N fotos"
  // não é usado aqui: o teste do celular e o do computador importam na mesma Cia ao mesmo tempo.
  await expect(page.getByRole('button', { name: /^Encaminhar (a foto|as \d+ fotos) à P\/3$/ })).toBeVisible();
  const minhas = page.getByRole('listitem').filter({ has: page.getByRole('img', { name: `Operação — Praça ${assunto}` }) });
  for (let i = 0; i < 3; i++) {
    await minhas.getByRole('button', { name: 'Encaminhar à P/3' }).first().click();
    await expect(minhas.filter({ hasText: '✅ Encaminhada à P/3' })).toHaveCount(i + 1);
  }
  await expect(page.getByText('1 foto(s) encaminhada(s) à P/3.')).toBeVisible();
  await expect(minhas.getByRole('button', { name: 'Encaminhar à P/3' })).toHaveCount(0);

  // O CGP da 4ª Cia (acesso por RE) vê só a página dele: a missão, o recado e as fotos; não exclui missão.
  await sair(page);
  await entrarRE(page, '444444-4', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: 'CGP 4ª CIA' })).toBeVisible();
  await expect(page.locator('#menu-unidade')).toHaveCount(0);
  await expect(page.getByRole('article', { name: assunto })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Excluir do CGP' })).toHaveCount(0);
  // O CGP baixa a ordem de serviço, mas não troca nem tira.
  const ordemCgp = page.getByRole('article', { name: assunto });
  const baixouOrdem = page.waitForEvent('download');
  await ordemCgp.getByRole('button', { name: /Baixar$/ }).click();
  expect((await baixouOrdem).suggestedFilename()).toBe('OS 4cia.pdf');
  await expect(ordemCgp.getByRole('button', { name: /Trocar ordem|Tirar ordem/ })).toHaveCount(0);
  await expect(page.getByText(`Recado ${assunto}`)).toBeVisible();
  await page.getByRole('navigation', { name: 'Página do CGP' }).getByRole('link', { name: 'Importação de fotos' }).click();
  await expect(page.getByRole('img', { name: `Operação — Praça ${assunto}` })).toHaveCount(3);
  // O acesso do CGP não encaminha (isso é da Cia).
  await expect(page.getByRole('button', { name: /Encaminhar/ })).toHaveCount(0);
  await sair(page);

  // A P/3 recebe em "Fotos das Cias": baixa uma e apaga outra.
  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, /^Fotos das Cias/);
  await page.getByRole('combobox', { name: 'Cia', exact: true }).selectOption('4cia');
  const naP3 = page.getByRole('listitem').filter({ has: page.getByRole('img', { name: `Operação — Praça ${assunto}` }) });
  await expect(naP3).toHaveCount(3);
  await expect(naP3.first()).toContainText('encaminhada por 4ª CIA');
  const baixou = page.waitForEvent('download');
  await naP3.first().getByRole('button', { name: 'Baixar' }).click();
  expect((await baixou).suggestedFilename()).toBe(`CGP Operação - Praça ${assunto}.jpg`);
  await naP3.first().getByRole('button', { name: 'Apagar' }).click();
  await naP3.first().getByRole('button', { name: 'Sim, apagar' }).click();
  await expect(naP3).toHaveCount(2);
  await sair(page);
  await entrar(page, '4cia', SENHA_TESTE);
  await irParaAbaCia(page, 'CGP');

  // Excluir do CGP: a demanda volta a poder ser enviada
  await page.getByRole('navigation', { name: 'Página do CGP' }).getByRole('link', { name: 'Missões' }).click();
  const art = page.getByRole('article', { name: assunto });
  // A Cia troca o PDF pelo link do Google Drive.
  await art.getByRole('button', { name: 'Trocar ordem' }).click();
  await art.getByRole('radio', { name: 'Link do Google Drive' }).check();
  await art.getByLabel(/^Link da ordem de serviço/).fill('https://exemplo.com/os.pdf');
  await art.getByRole('button', { name: 'Anexar ordem de serviço' }).click();
  await expect(art.getByText(/Cole um link do Google Drive/)).toBeVisible();
  await art.getByLabel(/^Link da ordem de serviço/).fill('https://drive.google.com/file/d/1AbC/view');
  await art.getByRole('button', { name: 'Anexar ordem de serviço' }).click();
  await expect(art.getByRole('link', { name: '🔗 Abrir ordem de serviço (Google Drive)' })).toHaveAttribute('href', 'https://drive.google.com/file/d/1AbC/view');
  await art.getByRole('button', { name: 'Excluir do CGP' }).click();
  await art.getByRole('button', { name: 'Excluir' }).click();
  await expect(page.getByRole('article', { name: assunto })).toHaveCount(0);
});
