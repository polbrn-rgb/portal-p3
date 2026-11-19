import { expect, test, type Page } from '@playwright/test';
import { entrar, irPara, marcarDestino, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Evento visível na tela (no celular, na lista do dia abaixo do mês; no computador, na grade). */
const evento = (page: Page, texto: string | RegExp) =>
  page.locator('.agenda').getByRole('button', { name: typeof texto === 'string' ? new RegExp(texto) : texto }).first();

test('Agenda: criar, ver no Mês/Semana/Dia, editar e excluir evento', async ({ page }, info) => {
  const titulo = `Reunião agenda ${info.project.name} ${Date.now()}`;
  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, 'Agenda');
  await expect(page.getByRole('heading', { name: 'Agenda', level: 2 })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Mês' })).toHaveAttribute('aria-selected', 'true');
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  // Campo obrigatório vazio: não salva e avisa.
  await page.getByRole('button', { name: '+ Novo evento' }).click();
  const form = page.getByRole('dialog', { name: 'Novo evento' });
  await form.getByRole('button', { name: 'Salvar' }).click();
  await expect(form.getByText('Informe o título.')).toBeVisible();

  await form.getByLabel(/^Título/).fill(titulo);
  await form.getByLabel(/^Das/).fill('10:00');
  await expect(form.getByLabel(/^Até/)).toHaveValue('11:00'); // mantém a duração
  await form.getByLabel(/^Até/).fill('11:30');
  await form.getByLabel('Local').fill('Sala do Cmt');
  await form.getByRole('button', { name: 'Salvar' }).click();
  await expect(form).toHaveCount(0);

  // (No Mês, o dia de hoje pode ter mais eventos de outros testes do que cabem na célula: confere na Semana.)
  await page.getByRole('tab', { name: 'Semana' }).click();
  await expect(evento(page, titulo)).toBeVisible();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  await page.getByRole('tab', { name: 'Dia' }).click();
  await expect(evento(page, titulo)).toContainText('10:00 – 11:30');
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  // Abrir, editar.
  await evento(page, titulo).click();
  const detalhe = page.getByRole('dialog', { name: titulo });
  await expect(detalhe).toContainText('📍 Sala do Cmt');
  await expect(detalhe).toContainText('Lançado por');
  await detalhe.getByRole('button', { name: '✏️ Editar' }).click();
  const edicao = page.getByRole('dialog', { name: 'Editar evento' });
  await edicao.getByLabel(/^Título/).fill(`${titulo} (mudou)`);
  await edicao.getByRole('button', { name: 'Salvar' }).click();
  await expect(evento(page, `${titulo} \\(mudou\\)`)).toBeVisible();

  // A escolha da visão fica lembrada.
  await page.reload();
  await irPara(page, 'Agenda');
  await expect(page.getByRole('tab', { name: 'Dia' })).toHaveAttribute('aria-selected', 'true');

  // Excluir, com confirmação.
  await evento(page, `${titulo} \\(mudou\\)`).click();
  const aberto = page.getByRole('dialog', { name: `${titulo} (mudou)` });
  await aberto.getByRole('button', { name: '🗑️ Excluir' }).click();
  await aberto.getByRole('button', { name: '🗑️ Sim, excluir' }).click();
  await expect(aberto).toHaveCount(0);
  await expect(evento(page, titulo)).toHaveCount(0);
});

test('Agenda e Numerador: o prazo da demanda aparece na agenda e a demanda agenda evento ligado a ela', async ({ page }, info) => {
  const assunto = `Prazo agenda ${info.project.name} ${Date.now()}`;
  await entrar(page, 'p3', SENHA_TESTE);
  await page.getByRole('link', { name: '+ Nova demanda' }).click();
  await page.getByLabel(/^Origem/).selectOption('SEI');
  await page.getByLabel('Nº do processo SEI').fill('006.00000009/2026-01');
  await page.getByLabel('Demanda (resumo)').fill(assunto);
  await page.getByLabel('Categoria').selectOption('Pedidos de Policiamento');
  await marcarDestino(page, '1ª CIA');
  await page.getByLabel('Prazo CPA').fill(hoje());
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toContainText('Demanda registrada');

  await irPara(page, 'Agenda');
  await page.getByRole('tab', { name: 'Dia' }).click(); // o Dia mostra tudo (o Mês corta em 3 por célula)
  const prazo = evento(page, new RegExp(`Prazo CPA · .* — ${assunto}`));
  await expect(prazo).toBeVisible();
  await prazo.click();
  const detalhe = page.getByRole('dialog', { name: new RegExp(assunto) });
  await expect(detalhe).toContainText('Vem do Numerador');
  await detalhe.getByRole('link', { name: /Abrir demanda .* no Numerador/ }).click();
  await expect(page.getByRole('heading', { name: /^Demanda nº \d+/ })).toBeVisible();

  // Da tela da demanda: "+ Agendar evento" abre a agenda com o evento já ligado.
  const naDemanda = page.locator('.agenda-da-demanda');
  await expect(naDemanda).toContainText('Nenhum evento da agenda ligado a esta demanda.');
  await naDemanda.getByRole('link', { name: '+ Agendar evento' }).click();
  const form = page.getByRole('dialog', { name: 'Novo evento' });
  await expect(form.getByLabel(/^Título/)).toHaveValue(assunto);
  await expect(form).toContainText(`— ${assunto}`); // 🔗 Nº … — assunto
  await form.getByRole('button', { name: 'Salvar' }).click();
  await expect(form).toHaveCount(0);
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  // Agora o evento (sem o "Prazo CPA ·") também está no dia (a visão Dia ficou lembrada).
  await expect(page.getByRole('tab', { name: 'Dia' })).toHaveAttribute('aria-selected', 'true');
  const ligado = evento(page, new RegExp(`^${assunto} · `));
  await expect(ligado).toBeVisible();
  await ligado.click();
  await page.getByRole('dialog', { name: assunto }).getByRole('link', { name: /Abrir demanda/ }).click();
  await expect(page.locator('.agenda-da-demanda')).toContainText(assunto);
});
