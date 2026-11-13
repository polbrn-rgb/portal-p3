import { expect, test } from '@playwright/test';
import { entrar, sair, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

// Fluxo completo: P/3 cria para a 3ª Cia -> 3ª Cia responde -> P/3 devolve -> Cia corrige -> P/3 aceita.
test('demanda vai para a Cia, que responde, e a P/3 devolve e depois aceita', async ({ page }, info) => {
  test.setTimeout(60_000); // seis logins seguidos
  const assunto = `Escolta teste ${info.project.name} ${Date.now()}`;
  const linkDaDemanda = () => page.getByRole('link', { name: new RegExp(assunto) });

  // P/3 cadastra para a 3ª Cia
  await entrar(page, 'p3', SENHA_TESTE);
  await page.getByRole('link', { name: '+ Nova demanda' }).click();
  await page.getByLabel('Demanda (resumo)').fill(assunto);
  await page.getByLabel('Categoria').selectOption('Escoltas');
  await page.getByLabel('3ª CIA', { exact: true }).check();
  await page.getByLabel('Prazo CPA').fill('2099-12-31');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByRole('link', { name: 'Ver lista' }).click();
  await expect(linkDaDemanda()).toContainText('(0/1 responderam)');
  await sair(page);

  // A 4ª Cia não vê nada dessa demanda
  await entrar(page, '4cia', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: '4ª CIA' })).toBeVisible();
  await expect(linkDaDemanda()).toHaveCount(0);
  await sair(page);

  // 3ª Cia abre, responde e a demanda vai para "Respondidas"
  await entrar(page, '3cia', SENHA_TESTE);
  await expect(linkDaDemanda()).toContainText('Novo');
  await linkDaDemanda().click();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
  await page.getByLabel('Resposta').fill('Escolta realizada.');
  await page.getByLabel('Respondido por').fill('Sd Teste');
  await page.getByRole('button', { name: 'Enviar resposta' }).click();
  await expect(page.getByRole('heading', { name: '3ª CIA' })).toBeVisible();
  await page.getByRole('tab', { name: /Respondidas/ }).click();
  await expect(linkDaDemanda()).toContainText('Respondido');
  await sair(page);

  // P/3 vê a resposta e devolve
  await entrar(page, 'p3', SENHA_TESTE);
  await expect(linkDaDemanda()).toContainText('(1/1 responderam)');
  await linkDaDemanda().click();
  const resposta = page.getByRole('article', { name: 'Resposta 3ª CIA' });
  await expect(resposta).toContainText('Escolta realizada.');
  await expect(resposta).toContainText('Sd Teste');
  await resposta.getByRole('button', { name: 'Devolver' }).click();
  await resposta.getByLabel('Motivo da devolução').fill('Informe o efetivo.');
  await resposta.getByRole('button', { name: 'Confirmar devolução' }).click();
  await expect(resposta).toContainText('Devolvido');
  await page.getByRole('link', { name: 'Voltar' }).click();
  await sair(page);

  // 3ª Cia vê o motivo e corrige (o nome já vem preenchido)
  await entrar(page, '3cia', SENHA_TESTE);
  await linkDaDemanda().click();
  await expect(page.getByRole('status')).toContainText('Informe o efetivo.');
  await expect(page.getByLabel('Respondido por')).toHaveValue('Sd Teste');
  await page.getByLabel('Resposta').fill('Escolta realizada com 4 PMs.');
  await page.getByRole('button', { name: 'Enviar resposta' }).click();
  // Só volta para a lista depois que o banco confirmou a gravação.
  await expect(page.getByRole('heading', { name: '3ª CIA' })).toBeVisible();
  await sair(page);

  // P/3 aceita
  await entrar(page, 'p3', SENHA_TESTE);
  await linkDaDemanda().click();
  await page.getByRole('article', { name: 'Resposta 3ª CIA' }).getByRole('button', { name: 'Aceitar' }).click();
  await expect(page.getByRole('article', { name: 'Resposta 3ª CIA' })).toContainText('Aceito');
});
