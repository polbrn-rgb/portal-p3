import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { entrarRE, sair, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

const admin = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-portal-p3' }));

// Acesso por RE com o perfil "Sala de Operações de Cia / FT" (cadastrado pelo Administrador → Acessos).
test('Sala de Operações da Cia: entra com o RE e vê só a Sala daquela Cia', async ({ page }, info) => {
  // Dia antigo (fora dos meses que os outros testes conferem), um pelotão por projeto.
  const pel = info.project.name === 'celular' ? 'A' : 'B';
  const dia = '2025-01-15';

  await entrarRE(page, '555555-5', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: 'Sala de Operações CIA FT' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Produção do pelotão' })).toBeVisible();
  // Nada do resto da Cia: sem numerador, CGP…
  await expect(page.getByRole('link', { name: 'Numerador' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'CGP' })).toHaveCount(0);

  await page.getByLabel(/^Dia do serviço/).fill(dia);
  await page.getByRole('group', { name: 'Turno' }).getByRole('button', { name: 'Pelotão Diurno' }).click();
  await page.getByLabel(/^Qual seu pelotão\?/).selectOption(pel);
  const form = page.getByRole('form', { name: new RegExp(`Produção do Pel ${pel}`) });
  await form.waitFor();
  const apagar = form.getByRole('button', { name: 'Apagar lançamento' });
  const confirmar = () =>
    form.getByRole('alertdialog', { name: 'Confirmar exclusão do lançamento' }).getByRole('button', { name: 'Apagar' }).click();
  if (await apagar.isVisible()) {
    await apagar.click();
    await confirmar();
    await expect(form.getByText('Lançamento apagado.')).toBeVisible();
  }
  await expect(form.getByText('Fica registrado quem lançou: Cb PM SALA (RE 555555).')).toBeVisible();
  await form.getByLabel('Pessoas abordadas').fill('7');
  await form.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect(form.getByText(/salvo\.$/)).toBeVisible();
  await expect
    .poll(async () => (await admin().doc(`producao/ft_${dia}_pel${pel}`).get()).data())
    .toMatchObject({ unidadeId: 'ft', lancadoPor: 'Cb PM SALA (RE 555555)' });
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  // Limpa (o lançamento não deve pesar em outros testes).
  await apagar.click();
  await confirmar();
  await expect(form.getByText('Lançamento apagado.')).toBeVisible();
  await sair(page);
});

test('Administrador → Acessos: cadastra o RE com o acesso "Sala de Operações de Cia / FT" e a Cia', async ({ page }, info) => {
  const re = info.project.name === 'celular' ? '777771' : '777772';
  await admin().doc(`acessos/${re}`).delete();
  await entrarRE(page, '130155-1', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: 'Painel de prazos' })).toBeVisible();
  await page.goto('/#/admin/acessos');
  const form = page.locator('form.form-acesso');
  await form.getByLabel(/^RE/).fill(`${re}-1`);
  await form.getByRole('button', { name: 'Buscar no banco' }).click();
  await form.getByLabel(/^Nome completo/).fill('Policial da Sala');
  await form.getByLabel(/^Posto\/graduação/).fill('Cb PM');
  await form.getByLabel(/^Nome de guerra/).fill('SALA');
  await form.getByLabel(/^E-mail funcional/).fill('sala@policiamilitar.sp.gov.br');
  await form.getByLabel(/^Acesso/).selectOption({ label: 'Sala de Operações de Cia / FT' });
  await expect(form.getByText('Só a Sala de Operações da Cia escolhida')).toBeVisible();
  await form.getByRole('button', { name: 'Cadastrar e enviar link' }).click();
  await expect(form.getByText('Escolha a Cia.')).toBeVisible();
  await form.getByLabel(/^Cia/).selectOption('2cia');
  await form.getByRole('button', { name: 'Cadastrar e enviar link' }).click();
  await expect
    .poll(async () => (await admin().doc(`acessos/${re}`).get()).data())
    .toMatchObject({ perfil: 'salaCia', unidade: '2cia', sincronizar: true, enviarLink: true });
  await expect(page.getByText('Sala de Operações 2ª CIA', { exact: false }).first()).toBeVisible();
});
