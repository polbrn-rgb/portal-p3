import { expect, test } from '@playwright/test';
import { entrar, irPara, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

test('Controle de Operações: registra com objetivo, edita, exclui e pede o Relatório de Indicadores', async ({ page }, info) => {
  const nome = `Operação controle ${info.project.name} ${Date.now()}`;
  const hoje = new Date();
  const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, /^Operações/);
  await page.getByRole('navigation', { name: 'Operações' }).getByRole('link', { name: 'Controle de Operações' }).click();
  await expect(page.getByRole('heading', { name: 'Controle de Operações', level: 2 })).toBeVisible();
  if (info.project.name === 'computador') {
    // Relatório de Indicadores e Visualizar operações lado a lado.
    const rel = await page.getByRole('group', { name: 'Relatório de Indicadores' }).boundingBox();
    const ver = await page.getByRole('group', { name: 'Visualizar operações' }).boundingBox();
    expect(Math.abs((rel?.y ?? 0) - (ver?.y ?? 99))).toBeLessThan(2);
    expect((ver?.x ?? 0) > (rel?.x ?? 0) + (rel?.width ?? 0) - 1).toBe(true);
  }

  // Sem os obrigatórios não salva.
  await page.getByRole('button', { name: '+ Nova operação' }).click();
  const form = page.getByRole('form', { name: 'Nova operação' });
  await form.getByRole('button', { name: 'Salvar operação' }).click();
  await expect(form.getByText('Informe o nome da operação.')).toBeVisible();
  await expect(form.getByText('Informe a data de início.')).toBeVisible();

  await form.getByLabel('Operação').fill(nome);
  await form.getByLabel('Data início').fill(iso);
  await form.getByRole('button', { name: 'Salvar operação' }).click();
  await expect(page.getByRole('status')).toContainText('Operação registrada');

  // Vai para o mês da operação e avisa que falta o objetivo.
  const cartao = page.getByRole('article', { name: nome });
  await expect(cartao).toContainText('Sem objetivo');
  const relatorio = page.getByRole('group', { name: 'Relatório de Indicadores' });
  await relatorio.getByLabel('Mês de referência').fill(iso.slice(0, 7));
  await expect(relatorio).toContainText('sem objetivo');
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  // Visualizar: por mês (outro mês não mostra) ou todas (agrupadas por mês).
  const visualizar = page.getByRole('group', { name: 'Visualizar operações' });
  await visualizar.getByLabel('Mês', { exact: true }).fill('2000-01');
  await expect(cartao).toHaveCount(0);
  await visualizar.getByRole('tab', { name: 'Todas' }).click();
  await expect(visualizar.getByLabel('Mês', { exact: true })).toHaveCount(0);
  const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  await expect(page.getByRole('region', { name: `${meses[hoje.getMonth()]}/${hoje.getFullYear()}` }).getByRole('article', { name: nome })).toBeVisible();
  await visualizar.getByRole('tab', { name: 'Por mês' }).click();
  await visualizar.getByLabel('Mês', { exact: true }).fill(iso.slice(0, 7));
  await expect(cartao).toBeVisible();

  await cartao.getByRole('button', { name: '✏️ Editar' }).click();
  const edicao = page.getByRole('form', { name: 'Editar operação' });
  await edicao.getByLabel('Objetivo (vai para o relatório)').fill('Prevenir roubos no evento');
  await edicao.getByRole('button', { name: 'Salvar operação' }).click();
  await expect(cartao).toContainText('Objetivo: Prevenir roubos no evento');

  // Pede o relatório: fica "Gerando…" até o motor (Apps Script) devolver o Word.
  await relatorio.getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(relatorio.getByText(/Informe o número do relatório/)).toBeVisible();
  const numero = `${Date.now() % 10000}/${info.project.name === 'celular' ? '01' : '02'}/26`;
  await relatorio.getByLabel(/Número do relatório/).fill(numero);
  await relatorio.getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(relatorio.getByRole('list', { name: 'Relatórios pedidos' }).getByRole('listitem').filter({ hasText: numero })).toContainText(
    'Gerando',
  );

  // Exclui com confirmação.
  await cartao.getByRole('button', { name: `Excluir ${nome}` }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '🗑️ Sim, excluir' }).click();
  await expect(cartao).toHaveCount(0);
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
});
