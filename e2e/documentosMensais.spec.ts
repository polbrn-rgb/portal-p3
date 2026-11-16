import { expect, test } from '@playwright/test';
import { entrar, irPara, irParaAbaCia, sair, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

test('Documentos Mensais: a Cia envia pelo portal e a P/3 acompanha e arquiva', async ({ page }, info) => {
  const celular = info.project.name === 'celular';
  const unidade = celular ? '5cia' : '2cia';
  const sigla = celular ? '5ª' : '2ª';

  await entrar(page, unidade, SENHA_TESTE);
  await irParaAbaCia(page, 'Documentos Mensais');
  await expect(page.getByRole('heading', { name: 'Documentos Mensais', level: 2 })).toBeVisible();
  await page.getByRole('link', { name: /Veículos Apreendidos/ }).click();

  await page.getByRole('button', { name: /^Enviar$/ }).click();
  await expect(page.getByText('Preencha (se não houver, coloque 0).').first()).toBeVisible();
  await page.getByLabel('Veículos 4 rodas').fill('2');
  await page.getByLabel('Veículos 2 rodas').fill('0');
  await page.getByLabel('Caminhões').fill('1');
  await page.getByLabel('Preenchido por').fill('Cb PM Teste');
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: /^Enviar$/ }).click();
  await expect(page.getByRole('link', { name: /Veículos Apreendidos/ })).toContainText('Enviado', { timeout: 15000 });
  await sair(page);

  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, /^Operações/);
  await page.getByRole('navigation', { name: 'Operações' }).getByRole('link', { name: 'Documentos Mensais' }).click();
  await expect(page.getByRole('heading', { name: 'Documentos Mensais', level: 2 })).toBeVisible();
  const veiculos = page.getByRole('article', { name: 'Veículos Apreendidos' });
  await expect(veiculos.getByRole('list', { name: /Envios/ })).toContainText(`⏳ ${sigla}`);

  // Planilhas do ano todo só guardam a cópia; arquivar pede confirmação.
  const arquivar = page.getByRole('article', { name: celular ? 'Dados Sobre BO Eletrônico' : 'Avaliação Periódica e Cumprimento de Metas' });
  await arquivar.getByRole('button', { name: '📦 Arquivar cópia' }).click();
  await arquivar.getByRole('alertdialog').getByRole('button', { name: 'Sim, arquivar' }).click();
  await expect(arquivar.getByRole('button', { name: '⏳ Arquivando…' })).toBeDisabled();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
});

test('Documentos Mensais: lista com linhas (Distribuição A.I. CET)', async ({ page }, info) => {
  const unidade = info.project.name === 'celular' ? '6cia' : '4cia';
  await entrar(page, unidade, SENHA_TESTE);
  await irParaAbaCia(page, 'Documentos Mensais');
  await page.getByRole('link', { name: /Distribuição A\.I\. CET/ }).click();
  await expect(page.getByText(/vai “NÃO HOUVE” na planilha/)).toBeVisible();

  await page.getByRole('button', { name: '+ Adicionar linha' }).click();
  const linha = page.getByRole('group', { name: 'Linha 1' });
  await page.getByLabel('Preenchido por').fill('Sd PM Teste');
  await page.getByRole('button', { name: /^Enviar$/ }).click();
  await expect(linha.getByText('Escolha uma opção.')).toBeVisible();
  await linha.getByLabel('Data').fill('2026-10-05');
  await linha.getByLabel('Qtd de talões').fill('1');
  await linha.getByRole('textbox', { name: /^RE/ }).fill('123456-7');
  await linha.getByRole('textbox', { name: /^RE/ }).blur();
  await expect(linha.getByLabel('Nome')).toHaveValue('SILVA'); // veio do banco de efetivo pelo RE
  await linha.getByLabel('Nome').fill('Fulano de Tal'); // a Cia pode trocar
  await linha.getByRole('radio', { name: 'Alocação', exact: true }).check();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: /^Enviar$/ }).click();
  await expect(page.getByRole('link', { name: /Distribuição A\.I\. CET/ })).toContainText('Enviado', { timeout: 15000 });

  // Volta para editar com a linha preenchida.
  await page.getByRole('link', { name: /Distribuição A\.I\. CET/ }).click();
  await expect(page.getByRole('group', { name: 'Linha 1' }).getByLabel('Nome')).toHaveValue('FULANO DE TAL');
});

test('Documentos Mensais: R.R. direto na planilha — a Cia abre a aba dela e confirma; a P/3 vê quem confirmou', async ({ page }, info) => {
  const celular = info.project.name === 'celular';
  const unidade = celular ? '1cia' : '3cia';
  const sigla = celular ? '1ª' : '3ª';

  await entrar(page, unidade, SENHA_TESTE);
  await irParaAbaCia(page, 'Documentos Mensais');
  const cartao = page.getByRole('link', { name: /R\.R\. - Relação de Remessa/ });
  await expect(cartao).toContainText('Direto na planilha');
  await cartao.click();
  await expect(page.getByRole('heading', { name: 'R.R. - Relação de Remessa' })).toBeVisible();
  await expect(page.getByText(`8º _ ${sigla} Cia`, { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '📂 Abrir a planilha' })).toHaveAttribute('href', /1ZLsK2mL--WcHvwzLFpHdcwLyLK6LFJPYHnJgH3fntP0\/edit#gid=\d+$/);
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  await page.getByLabel('Preenchido por').fill('');
  await page.getByRole('button', { name: '✅ Confirmar preenchimento' }).click();
  await expect(page.getByText('Informe quem preencheu (posto/graduação e nome).')).toBeVisible();
  await page.getByLabel('Preenchido por').fill('Sgt PM Teste');
  await page.getByRole('button', { name: '✅ Confirmar preenchimento' }).click();
  await expect(page.getByRole('link', { name: /R\.R\. - Relação de Remessa/ })).toContainText('✅ Confirmado', { timeout: 15000 });
  await sair(page);

  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, /^Operações/);
  await page.getByRole('navigation', { name: 'Operações' }).getByRole('link', { name: 'Documentos Mensais' }).click();
  const rr = page.getByRole('article', { name: 'R.R. - Relação de Remessa' });
  await expect(rr.getByRole('list', { name: /Envios/ })).toContainText(`✅ ${sigla}`);
  await expect(rr.getByRole('button', { name: '📦 Arquivar e zerar' })).toBeVisible();
});
