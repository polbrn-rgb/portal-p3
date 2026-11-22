import { expect, test } from '@playwright/test';
import { entrar, irPara, irParaAbaCia, sair, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

// Sala de Operações da Cia: o pelotão lança a produção do turno (com os flagrantes: talão e BOPC) e a P/3 vê no total do mês.
test('Produção do pelotão: lançar, conferir, corrigir e a P/3 ver no total', async ({ page }, info) => {
  test.setTimeout(150_000);
  // Uma Cia por projeto (celular/computador): os dois rodam no mesmo banco de testes.
  const cia = info.project.name === 'celular' ? { id: '5cia', sigla: '5ª CIA' } : { id: '6cia', sigla: '6ª CIA' };
  const hoje = new Date();
  const dia = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;

  await entrar(page, cia.id, SENHA_TESTE);
  await irParaAbaCia(page, 'Sala de Operações');
  await expect(page.getByRole('heading', { name: 'Produção do pelotão' })).toBeVisible();
  await page.getByRole('group', { name: 'Pelotão' }).getByRole('button', { name: /^Pel A \(dia\)/ }).click();

  const form = page.getByRole('form', { name: /Produção do Pel A \(dia\)/ });
  await form.waitFor();
  // Repetição do teste (retry): começa do zero, apagando o lançamento que a tentativa anterior deixou.
  const apagar = form.getByRole('button', { name: 'Apagar lançamento' });
  if (await apagar.isVisible()) {
    await apagar.click();
    await form.getByRole('alertdialog', { name: 'Confirmar exclusão do lançamento' }).getByRole('button', { name: 'Apagar' }).click();
    await expect(form.getByText('Lançamento apagado.')).toBeVisible();
    await expect(form.getByText(/Já lançado por/)).toHaveCount(0);
  }
  await form.getByLabel('Pessoas abordadas').fill('25');
  await form.getByLabel('Pessoas presas em flagrante').fill('2');
  await expect(form.getByRole('list', { name: 'Conferências' })).toContainText('Houve presos');
  await form.getByLabel('Ocorrências com prisão').fill('1');
  await expect(form.getByRole('list', { name: 'Conferências' })).toContainText('Houve flagrante');
  await expect(form.getByRole('list', { name: 'Conferências' })).toContainText('Ocorrências atendidas menor');
  await form.getByLabel('Ocorrências atendidas').fill('3');
  await form.getByLabel('Maconha (kg)').fill('0,5');
  await form.getByLabel('Carros removidos ao pátio').fill('2');
  await expect(form.getByLabel('Veículos recuperados (L01)')).toBeVisible();
  await expect(form.getByLabel('Carros apreendidos pela delegacia')).toBeVisible();
  await form.getByLabel('Armas de fogo apreendidas').fill('um');
  await form.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect(form.getByText('Só números inteiros.')).toBeVisible();
  await form.getByLabel('Armas de fogo apreendidas').fill('1');

  await expect(form.getByText('Preencher em caso de flagrante de delito')).toBeVisible();
  await form.getByLabel('Nº do talão').fill('202611200001');
  await form.getByLabel('Nº do BOPC').fill('AB1234');
  await form.getByRole('button', { name: '+ Incluir flagrante' }).click();
  await expect(form.getByText('Escolha a natureza da ocorrência.')).toBeVisible();
  await form.getByRole('combobox', { name: /^Natureza da ocorrência/ }).selectOption({ label: 'Tráfico de drogas' });
  await form.getByRole('button', { name: '+ Incluir flagrante' }).click();
  await expect(form.getByRole('list', { name: 'Flagrantes anotados' })).toContainText('202611200001');
  await expect(form.getByRole('list', { name: 'Flagrantes anotados' })).toContainText('AB1234');
  await expect(form.getByRole('list', { name: 'Flagrantes anotados' })).toContainText('Tráfico de drogas');
  await expect(form.getByRole('list', { name: 'Conferências' })).toHaveCount(0);

  await form.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect(form.getByText(`Lançamento do Pel A (dia) de ${dia} salvo.`)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Pel A \(dia\) ✓/ })).toBeVisible();
  await expect(form.getByText(/Já lançado por .* Você está corrigindo/)).toBeVisible();

  // Correção: muda um número e salva de novo (o "lançado por" continua).
  await form.getByLabel('Pessoas abordadas').fill('30');
  await form.getByRole('button', { name: 'Salvar correção' }).click();
  await expect(form.getByText(`Lançamento do Pel A (dia) de ${dia} salvo.`)).toBeVisible();

  await page.getByRole('navigation', { name: 'Sala de Operações' }).getByRole('link', { name: 'Resumo do mês' }).click();
  const tabela = page.getByRole('table', { name: `Produção de ${cia.sigla} por pelotão` });
  await expect(tabela.getByRole('row', { name: /^Pessoas abordadas/ })).toContainText('30');
  await expect(tabela.getByRole('row', { name: /^Maconha/ })).toContainText('0,5');
  await expect(tabela.getByRole('row', { name: /^Carros removidos ao pátio/ })).toContainText('2');
  await expect(page.getByRole('list', { name: 'Flagrantes do mês' })).toContainText('AB1234');
  await sair(page);

  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, /^Operações/);
  await page.getByRole('navigation', { name: 'Operações' }).getByRole('link', { name: 'Produtividade', exact: true }).click();
  const total = page.getByRole('table', { name: 'Produtividade do mês por unidade' });
  // Espera a tabela carregar antes de ler os títulos das colunas.
  await expect(total.getByRole('columnheader', { name: cia.sigla, exact: true })).toBeVisible();
  const linha = total.getByRole('row', { name: /^Pessoas abordadas/ });
  const coluna = await total.getByRole('columnheader').allInnerTexts();
  const k = coluna.findIndex((c) => c.trim() === cia.sigla);
  expect(k).toBeGreaterThan(0);
  await expect(linha.getByRole('cell').nth(k - 1)).toHaveText('30');
  await expect(total.getByRole('row', { name: /^Flagrantes anotados/ }).getByRole('cell').nth(k - 1)).toHaveText('1');

  await sair(page);

  // Sala de Operações do batalhão → Resultados das Cias: consulta de hoje, só daquela Cia (lê só quando a sub-aba abre).
  await entrar(page, 'sala', SENHA_TESTE);
  const sala = page.getByRole('navigation', { name: 'Sala de Operações' });
  await expect(sala.getByRole('button', { name: 'Resultados das operações' })).toHaveAttribute('aria-current', 'page');
  await sala.getByRole('button', { name: 'Resultados das Cias' }).click();
  const consulta = page.getByRole('form', { name: 'Consultar resultados' });
  await consulta.getByRole('combobox', { name: 'Unidade' }).selectOption({ label: cia.sigla });
  await consulta.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.getByRole('status').filter({ hasText: cia.sigla })).toContainText('1 lançamento(s)');
  const doDia = page.getByRole('table', { name: 'Resultados do período por unidade' });
  await expect(doDia.getByRole('row', { name: /^Pessoas abordadas/ })).toContainText('30');
  await expect(doDia.getByRole('row', { name: /^Maconha/ })).toContainText('0,5');
  await expect(page.getByRole('list', { name: 'Flagrantes do período' })).toContainText('AB1234');
  await expect(page.getByRole('list', { name: 'Flagrantes do período' })).toContainText('Tráfico de drogas');
  await page.getByText(`${cia.sigla}: 1 lançamento(s)`).click();
  await expect(page.getByRole('list', { name: `Lançamentos de ${cia.sigla}` })).toContainText('Pel A (dia)');
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
});
