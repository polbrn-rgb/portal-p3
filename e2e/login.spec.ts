import { expect, test } from '@playwright/test';
import { entrar, entrarRE } from './ajuda';
import { SENHA_TESTE } from './dados';

test('Cia entra, vê o nome da própria unidade e sai', async ({ page }) => {
  await entrar(page, '1cia', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: '1ª CIA' })).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
});

test('P/3 entra direto no Numerador', async ({ page }) => {
  await entrar(page, 'p3', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: 'Numerador', level: 2 })).toBeVisible();
});

test('senha errada mostra aviso e não entra', async ({ page }) => {
  await entrar(page, 'ft', 'senha-errada');
  await expect(page.getByRole('alert')).toHaveText('Senha incorreta.');
  await expect(page.getByRole('button', { name: 'Sair' })).toHaveCount(0);
});

test('o aparelho lembra a última unidade escolhida', async ({ page }) => {
  await entrar(page, '4cia', SENHA_TESTE);
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByLabel('Unidade')).toHaveValue('4cia');
});

test('sem senha: avisa no próprio campo, em vermelho, e não entra', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('RE').fill('130155-1');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('Digite a senha.')).toBeVisible();
  await expect(page.getByLabel(/^Senha\s*\*?$/)).toBeFocused();
  await expect(page.getByLabel(/^Senha\s*\*?$/)).toHaveCSS('border-top-color', 'rgb(181, 43, 39)');
  await expect(page.getByRole('button', { name: 'Sair' })).toHaveCount(0);
});

test.describe('login por RE', () => {
  test('RE com ou sem dígito; chefe da P/3 vê o Administrador direto, sem a senha extra', async ({ page }) => {
    await entrarRE(page, '1301551', SENHA_TESTE);
    await expect(page.getByRole('heading', { name: 'Numerador', level: 2 })).toBeVisible();
    await page.goto('/#/admin/acessos');
    await expect(page.getByRole('heading', { name: 'Acessos (login por RE)' })).toBeVisible();
    await expect(page.getByLabel('Senha do Administrador')).toHaveCount(0);
  });

  test('operador da P/3 não vê a aba Administrador', async ({ page }) => {
    await entrarRE(page, '111111-1', SENHA_TESTE);
    await expect(page.getByRole('heading', { name: 'Numerador', level: 2 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Administrador/ })).toHaveCount(0);
  });

  test('CFP vê a página dele e a da Sala de Operações', async ({ page }) => {
    await entrarRE(page, '222222', SENHA_TESTE);
    await page.getByRole('button', { name: 'Sala de Operações' }).click();
    await expect(page.getByRole('button', { name: 'Sala de Operações' })).toHaveAttribute('aria-current', 'page');
  });

  test('RE errado não entra; Esqueci a senha pede o RE e não revela se ele existe', async ({ page }) => {
    await entrarRE(page, '999999-9', SENHA_TESTE);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sair' })).toHaveCount(0);
    await page.getByLabel('RE').fill('');
    await page.getByRole('button', { name: 'Esqueci a senha' }).click();
    await expect(page.getByText('Digite o seu RE para receber o link.')).toBeVisible();
    await page.getByLabel('RE').fill('999999-9');
    await page.getByRole('button', { name: 'Esqueci a senha' }).click();
    await expect(page.getByRole('status')).toContainText('Se o RE tiver acesso ao portal');
  });
});

test('👁 mostra e oculta a senha digitada (RE e conta da unidade)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
  for (const modo of ['Entrar com RE e senha pessoal', 'Entrar com a conta da unidade (antiga)']) {
    const troca = page.getByRole('button', { name: modo });
    if (await troca.isVisible()) await troca.click();
    const senha = page.getByLabel(/^Senha\s*\*?$/);
    await senha.fill('minha-senha');
    await expect(senha).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Mostrar senha' }).click();
    await expect(senha).toHaveAttribute('type', 'text');
    await expect(senha).toHaveValue('minha-senha');
    await page.getByRole('button', { name: 'Ocultar senha' }).click();
    await expect(senha).toHaveAttribute('type', 'password');
  }
});
