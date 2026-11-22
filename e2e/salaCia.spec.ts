import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { entrar, entrarSalaCia, irPara, sair, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

const admin = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-portal-p3' }));

test('P/3 gera a senha da Sala de Operações da Cia (aparece uma vez e vai para o motor aplicar)', async ({ page }, info) => {
  // Uma Cia por projeto (celular/computador): os dois rodam no mesmo banco de testes.
  const cia = info.project.name === 'celular' ? { id: '1cia', sigla: '1ª CIA' } : { id: '2cia', sigla: '2ª CIA' };
  await admin().doc(`senhasSalaCia/${cia.id}`).delete();

  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, 'Sala de Operações');
  await page.getByRole('navigation', { name: 'Sala de Operações' }).getByRole('link', { name: 'Senhas das Cias' }).click();
  await expect(page.getByRole('heading', { name: 'Senhas da Sala de Operações das Cias' })).toBeVisible();
  const item = page.getByRole('listitem').filter({ hasText: `Sala de Operações ${cia.sigla}` });
  await expect(item).toContainText('Sem senha');
  await item.getByRole('button', { name: 'Gerar senha', exact: true }).click();

  const caixa = item.getByRole('status', { name: `Senha nova da Sala de Operações ${cia.sigla}` });
  const senha = (await caixa.locator('code').innerText()).trim();
  expect(senha).toMatch(/^[A-Za-z2-9]{10}$/);
  await expect(item).toContainText('Aplicando no login');
  await expect
    .poll(async () => (await admin().doc(`senhasSalaCia/${cia.id}`).get()).data())
    .toMatchObject({ unidade: cia.id, senha, ativo: true, sincronizar: true, status: 'pendente' });
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  // O motor aplicou: a senha some do banco e a P/3 pode gerar outra (com confirmação) ou bloquear.
  await admin().doc(`senhasSalaCia/${cia.id}`).update({ senha: '', sincronizar: false, status: 'ok' });
  await expect(item).toContainText('Ativa');
  await item.getByRole('button', { name: 'Já anotei, esconder' }).click();
  await expect(caixa).toHaveCount(0);
  await item.getByRole('button', { name: 'Gerar senha nova' }).click();
  await expect(item).toContainText('A senha atual deixa de valer');
  await item.getByRole('button', { name: 'Cancelar' }).click();
  await item.getByRole('button', { name: 'Bloquear' }).click();
  await expect
    .poll(async () => (await admin().doc(`senhasSalaCia/${cia.id}`).get()).data())
    .toMatchObject({ senha: '', ativo: false, sincronizar: true });
});

test('Sala de Operações da Cia entra com a senha e vê só a Sala daquela Cia', async ({ page }, info) => {
  // Dia antigo (fora dos meses que os outros testes conferem), um pelotão por projeto.
  const pel = info.project.name === 'celular' ? 'A' : 'B';
  const dia = '2025-01-15';

  await entrarSalaCia(page, 'ft', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: 'Sala de Operações CIA FT' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Produção do pelotão' })).toBeVisible();
  // Nada do resto da Cia: sem menu, numerador, CGP…
  await expect(page.getByRole('link', { name: 'Numerador' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'CGP' })).toHaveCount(0);

  await page.getByLabel(/^Dia do serviço/).fill(dia);
  await page.getByRole('group', { name: 'Pelotão' }).getByRole('button', { name: new RegExp(`^Pel ${pel}`) }).click();
  const form = page.getByRole('form', { name: new RegExp(`Produção do Pel ${pel}`) });
  await form.waitFor();
  const apagar = form.getByRole('button', { name: 'Apagar lançamento' });
  if (await apagar.isVisible()) {
    await apagar.click();
    await form.getByRole('alertdialog', { name: 'Confirmar exclusão do lançamento' }).getByRole('button', { name: 'Apagar' }).click();
    await expect(form.getByText('Lançamento apagado.')).toBeVisible();
  }
  await expect(form.getByText('Fica registrado quem lançou: Sala de Operações CIA FT.')).toBeVisible();
  await form.getByLabel('Pessoas abordadas').fill('7');
  await form.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect(form.getByText(/salvo\.$/)).toBeVisible();
  await expect
    .poll(async () => (await admin().doc(`producao/ft_${dia}_pel${pel}`).get()).data())
    .toMatchObject({ unidadeId: 'ft', lancadoPor: 'Sala de Operações CIA FT' });
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  // Limpa (o lançamento não deve pesar em outros testes).
  await form.getByRole('button', { name: 'Apagar lançamento' }).click();
  await form.getByRole('alertdialog', { name: 'Confirmar exclusão do lançamento' }).getByRole('button', { name: 'Apagar' }).click();
  await expect(form.getByText('Lançamento apagado.')).toBeVisible();
  await sair(page);
});
