import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { entrar, irPara, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

const admin = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-portal-p3' }));
// PNG de 1x1 pixel (válido): o portal reduz e converte para JPEG antes de enviar.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const foto = (n: number) => ({ name: `foto${n}.png`, mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });

function mesAtras(n: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

test('CFP manda fotos de TDS; RE fora do banco é cadastrado e o limite de 5 por mês vale', async ({ page }, info) => {
  const re = `7${info.project.name === 'celular' ? 1 : 2}${info.retry}${String(Date.now()).slice(-3)}`;
  await entrar(page, 'cfp', SENHA_TESTE);
  await page.getByRole('navigation', { name: 'Página do CFP' }).getByRole('link', { name: 'TDS' }).click();
  await expect(page.getByRole('heading', { name: 'TDS — fotos de instrução' })).toBeVisible();

  await page.getByRole('button', { name: 'Enviar fotos' }).click();
  await expect(page.getByText('Informe o seu RE.')).toBeVisible();
  await expect(page.getByText('Escolha pelo menos uma foto.')).toBeVisible();

  await page.getByLabel(/^Seu RE/).fill(`${re}-0`);
  await expect(page.getByText('RE não encontrado no banco de efetivo')).toBeVisible();
  await page.getByLabel(/^Assunto/).fill('Abordagem a veículo');
  await page.locator('input[type="file"]').setInputFiles([foto(1), foto(2)]);
  await expect(page.getByRole('list', { name: 'Fotos escolhidas' }).getByRole('img')).toHaveCount(2);

  await page.getByRole('button', { name: 'Enviar fotos' }).click();
  await expect(page.getByText('Escolha o posto/graduação.')).toBeVisible();
  await page.getByLabel(/^Posto\/graduação/).selectOption('2º Ten PM');
  await page.getByLabel(/^Nome de guerra/).fill('teste');
  await page.getByLabel(/^Nome completo/).fill('Fulano de Tal');
  await page.getByRole('button', { name: 'Enviar fotos' }).click();
  await expect(page.getByText('2 foto(s) enviada(s) para a P/3')).toBeVisible();
  await expect(page.getByText(/^2 de 5 fotos enviadas em/)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Fotos enviadas' }).getByRole('img')).toHaveCount(2);
  await expect(page.getByText('✅ 2º Ten PM TESTE')).toBeVisible();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  expect((await admin().doc(`efetivo/${re}`).get()).data()).toMatchObject({ re: `${re}-0`, posto: '2º Ten PM', nomeGuerra: 'TESTE', manual: true });
  const salvas = await admin().collection('fotosTds').where('re', '==', re).get();
  expect(salvas.size).toBe(2);
  expect(salvas.docs[0].data()).toMatchObject({ assunto: 'Abordagem a veículo', cfp: { posto: '2º Ten PM', nomeGuerra: 'TESTE' } });

  // Faltam 3 no mês: 4 escolhidas não passam.
  await page.locator('input[type="file"]').setInputFiles([foto(3), foto(4), foto(5), foto(6)]);
  await page.getByLabel(/^Assunto/).fill('Uso progressivo da força');
  await page.getByRole('button', { name: 'Enviar fotos' }).click();
  await expect(page.getByText('ainda pode mandar 3 foto(s)')).toBeVisible();
});

test('CFP com RE no banco: aparece o nome, sem cadastro', async ({ page }) => {
  await entrar(page, 'cfp', SENHA_TESTE);
  await page.getByRole('navigation', { name: 'Página do CFP' }).getByRole('link', { name: 'TDS' }).click();
  await page.getByLabel(/^Seu RE/).fill('123456-7');
  await expect(page.getByText('✅ Cb PM SILVA')).toBeVisible();
  await expect(page.getByText('RE não encontrado no banco de efetivo')).toHaveCount(0);
});

test('P/3 vê as fotos de TDS por CFP, baixa o .zip do mês e depois apaga do sistema', async ({ page }, info) => {
  // Um mês antigo para cada aparelho: os testes rodam juntos e não se misturam.
  const mes = mesAtras(info.project.name === 'celular' ? 11 : 10);
  const velhas = await admin().collection('fotosTds').where('mes', '==', mes).get();
  for (const d of velhas.docs) {
    await d.ref.delete();
    await admin().doc(`fotosTdsDados/${d.id}`).delete();
  }
  for (const [re, posto, nome, vaga] of [
    ['654321', 'Cap PM', 'ALVES', 1],
    ['654321', 'Cap PM', 'ALVES', 2],
    ['765432', '1º Ten PM', 'SOUZA', 1],
  ] as const) {
    const id = `${mes}_${re}_${vaga}`;
    await admin().doc(`fotosTdsDados/${id}`).set({ dados: PNG });
    await admin()
      .doc(`fotosTds/${id}`)
      .set({ mes, re, cfp: { posto, nomeGuerra: nome }, data: `${mes}-0${vaga}`, assunto: `Instrução ${vaga}`, vaga, miniatura: PNG, tamanho: PNG.length, enviadoEm: FieldValue.serverTimestamp() });
  }

  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, 'CFP');
  await page.getByRole('navigation', { name: 'CFP', exact: true }).getByRole('link', { name: 'TDS' }).click();
  await expect(page.getByRole('heading', { name: 'TDS — fotos de instrução' })).toBeVisible();
  await page.getByLabel(/^Mês/).selectOption(mes);
  await expect(page.getByRole('article', { name: 'Cap PM ALVES' })).toContainText('2 de 5');
  await expect(page.getByRole('article', { name: '1º Ten PM SOUZA' }).getByRole('img')).toHaveCount(1);
  await expect(page.getByText('3 foto(s) de 2 CFP')).toBeVisible();
  await expect(page.getByRole('button', { name: '🗑️ Apagar do sistema' })).toHaveCount(0); // só depois de baixar
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /^⬇️ Baixar fotos de/ }).click()]);
  expect(download.suggestedFilename()).toBe(`TDS ${mes}.zip`);
  const conteudo = readFileSync(await download.path());
  expect(conteudo.subarray(0, 2).toString()).toBe('PK');
  expect(conteudo.includes(Buffer.from(`TDS ${mes}/Cap PM ALVES - RE 654321/${mes}-02 - Instrução 2 - 2.jpg`))).toBe(true);
  expect(conteudo.includes(Buffer.from(`TDS ${mes}/1º Ten PM SOUZA - RE 765432/${mes}-01 - Instrução 1 - 1.jpg`))).toBe(true);

  await page.getByRole('button', { name: '🗑️ Apagar do sistema' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Confirmar exclusão das fotos' })).toContainText('3 foto(s)');
  await page.getByRole('button', { name: 'Sim, apagar' }).click();
  await expect(page.getByText('3 foto(s) apagada(s) do sistema.')).toBeVisible();
  await expect(page.getByText(/^Nenhuma foto em/)).toBeVisible();
  const ids = [`${mes}_654321_1`, `${mes}_654321_2`, `${mes}_765432_1`];
  await expect
    .poll(async () => (await Promise.all(ids.flatMap((id) => [admin().doc(`fotosTds/${id}`).get(), admin().doc(`fotosTdsDados/${id}`).get()]))).filter((d) => d.exists).length)
    .toBe(0);
});
