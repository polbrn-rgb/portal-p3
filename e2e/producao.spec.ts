import { expect, test } from '@playwright/test';
import { entrar, irPara, irParaAbaCia, sair } from './ajuda';
import { SENHA_TESTE } from './dados';

// Sala de Operações da Cia: o pelotão lança a produção do turno (com os talões) e a P/3 vê no total do mês.
test('Produção do pelotão: lançar, conferir, corrigir e a P/3 ver no total', async ({ page }, info) => {
  test.setTimeout(90_000);
  // Uma Cia por projeto (celular/computador): os dois rodam no mesmo banco de testes.
  const cia = info.project.name === 'celular' ? { id: '5cia', sigla: '5ª CIA' } : { id: '6cia', sigla: '6ª CIA' };
  const hoje = new Date();
  const dia = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;

  await entrar(page, cia.id, SENHA_TESTE);
  await irParaAbaCia(page, 'Sala de Operações');
  await expect(page.getByRole('heading', { name: 'Produção do pelotão' })).toBeVisible();
  await page.getByRole('group', { name: 'Pelotão' }).getByRole('button', { name: /^Pel A \(dia\)/ }).click();

  const form = page.getByRole('form', { name: /Produção do Pel A \(dia\)/ });
  await form.getByLabel('Pessoas abordadas').fill('25');
  await form.getByLabel('Pessoas presas em flagrante').fill('2');
  await expect(form.getByRole('list', { name: 'Conferências' })).toContainText('Houve presos');
  await form.getByLabel('Ocorrências com prisão').fill('1');
  await expect(form.getByRole('list', { name: 'Conferências' })).toContainText('Anote os talões');
  await expect(form.getByRole('list', { name: 'Conferências' })).toContainText('Ocorrências atendidas menor');
  await form.getByLabel('Ocorrências atendidas').fill('3');
  await form.getByLabel('Entorpecentes apreendidos (kg)').fill('0,5');
  await form.getByLabel('Armas de fogo apreendidas').fill('um');
  await form.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect(form.getByText('Só números inteiros.')).toBeVisible();
  await form.getByLabel('Armas de fogo apreendidas').fill('1');

  await form.getByLabel('Nº do talão').fill('202611200001');
  await form.getByRole('button', { name: '+ Incluir talão' }).click();
  await expect(form.getByRole('list', { name: 'Talões anotados' })).toContainText('202611200001');
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
  await expect(tabela.getByRole('row', { name: /^Entorpecentes apreendidos/ })).toContainText('0,5');
  await expect(page.getByRole('list', { name: 'Talões do mês' })).toContainText('202611200001');
  await sair(page);

  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, 'Operações');
  await page.getByRole('navigation', { name: 'Operações' }).getByRole('link', { name: 'Produtividade', exact: true }).click();
  const total = page.getByRole('table', { name: 'Produtividade do mês por unidade' });
  const linha = total.getByRole('row', { name: /^Pessoas abordadas/ });
  const coluna = await total.getByRole('columnheader').allInnerTexts();
  const k = coluna.findIndex((c) => c.trim() === cia.sigla);
  await expect(linha.getByRole('cell').nth(k - 1)).toHaveText('30');
  await expect(total.getByRole('row', { name: /^Talões anotados/ }).getByRole('cell').nth(k - 1)).toHaveText('1');
});
