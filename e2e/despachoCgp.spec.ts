import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { entrar, entrarRE, irParaAbaCia, sair } from './ajuda';
import { SENHA_TESTE } from './dados';

const admin = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-portal-p3' }));

// Despacho do CGP: dentro da missão, o CGP escreve o que foi feito, assina com o dedo e a Cia baixa o PDF.
test('Despacho do CGP: cabeçalho padrão, assinatura com o dedo e PDF para a Cia', async ({ page }, info) => {
  const titulo = `Missão despacho ${info.project.name} ${Date.now()}`;
  const d = new Date();
  const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const mes = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'][d.getMonth()];
  const refId = `desp${info.project.name}${Date.now()}`;
  await admin().doc(`cgpMissoes/4cia_numerador_${refId}`).set({
    unidadeId: '4cia',
    origem: 'numerador',
    refId,
    numero: '8BPMM-999/303/26',
    titulo,
    inicio: hoje,
    fim: hoje,
    criadoPor: '4ª CIA',
    criadoEm: FieldValue.serverTimestamp(),
  });

  await entrarRE(page, '444444-4', SENHA_TESTE);
  const missao = page.getByRole('article', { name: titulo });
  await missao.getByRole('button', { name: 'Despacho' }).click();
  const form = missao.getByRole('form', { name: 'Despacho de 8BPMM-999/303/26' });
  await expect(form).toContainText(`Em ${hoje.slice(8, 10)}${mes}${hoje.slice(2, 4)}`);
  await expect(form).toContainText('Do CGP 4 Pel');
  await expect(form).toContainText('Ao Sr. Cmt 4ª Cia.');

  // Sem nada preenchido não salva.
  await form.getByRole('button', { name: 'Salvar despacho' }).click();
  await expect(form.getByText('Assine no quadro com o dedo.')).toBeVisible();

  await form.getByLabel('Pelotão').fill('B');
  await form.getByLabel(/^O que foi feito/).fill('Policiamento realizado na praça, sem alterações.');
  await form.getByLabel(/^Assinado por/).fill('2º Sgt PM 444444-4 Teste');
  const quadro = form.getByRole('img', { name: /Quadro de assinatura/ });
  await quadro.scrollIntoViewIfNeeded();
  const caixa = (await quadro.boundingBox())!;
  await page.mouse.move(caixa.x + 20, caixa.y + 100);
  await page.mouse.down();
  await page.mouse.move(caixa.x + 80, caixa.y + 40, { steps: 5 });
  await page.mouse.move(caixa.x + 140, caixa.y + 110, { steps: 5 });
  await page.mouse.up();
  await expect(form.getByText('Assinado.')).toBeVisible();
  await form.getByRole('button', { name: 'Salvar despacho' }).click();
  await expect(form).toHaveCount(0);
  await expect(missao.getByRole('list', { name: 'Despachos' })).toContainText('Pel B · 2º Sgt PM 444444-4 Teste');
  await sair(page);

  // A Cia vê o despacho na missão e baixa o PDF.
  await entrar(page, '4cia', SENHA_TESTE);
  await irParaAbaCia(page, 'CGP');
  const naCia = page.getByRole('article', { name: titulo });
  await expect(naCia.getByRole('button', { name: 'Despacho' })).toHaveCount(0);
  const baixou = page.waitForEvent('download');
  await naCia.getByRole('button', { name: 'Baixar PDF' }).click();
  const arquivo = await (await baixou).path();
  expect((await readFile(arquivo!)).subarray(0, 5).toString()).toBe('%PDF-');
});
