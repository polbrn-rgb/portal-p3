import { expect, test } from '@playwright/test';
import { entrar, irPara, irParaAbaCia, sair, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

test('Documentos Mensais: a Cia envia pelo portal e a P/3 acompanha, marca feito e arquiva', async ({ page }, info) => {
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

  // Direto na planilha: marca "feito" (um documento diferente em cada aparelho, para os testes não se cruzarem).
  const direto = page.getByRole('article', { name: celular ? 'R.R. - Relação de Remessa' : 'Plano Diretor' });
  await direto.getByRole('checkbox').click();
  await expect(direto.getByRole('checkbox')).toBeChecked();

  // Arquivar pede confirmação.
  // BO Eletrônico é do ano todo: só guarda a cópia (não zera).
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
