import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { entrar, irPara, sair, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

const admin = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-portal-p3' }));

test('P/3 abre o EAP no Aperfeiçoamento e a Cia indica o efetivo da turma', async ({ page }, info) => {
  // Cada projeto (celular/computador) usa um ano próprio, para não confundir os dois EAP.
  const ano = 2040 + (info.project.name === 'celular' ? 1 : 2) + info.retry * 2;
  await admin()
    .doc('efetivo/987654')
    .set({ re: '987654-3', posto: 'SD PM', nomeGuerra: 'TESTE', telefone: '(11) 98888-0000', nomeCompleto: 'TESTE DA SILVA', email: 'teste@policiamilitar.sp.gov.br' });

  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, 'Aperfeiçoamento');
  await expect(page.getByRole('heading', { name: 'Aperfeiçoamento' })).toBeVisible();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
  await page.getByRole('link', { name: '+ Novo EAP' }).click();

  // Sem preencher: leva até o primeiro obrigatório.
  await page.getByRole('button', { name: 'Abrir EAP e criar a planilha' }).click();
  await expect(page.getByLabel('Início do EAD')).toBeFocused();
  await expect(page.getByText('Defina pelo menos uma vaga.')).toBeVisible();

  await page.getByLabel('Ano').fill(String(ano));
  await page.getByLabel('Mês do EAD').selectOption({ label: 'Novembro' });
  await page.getByLabel('Mês do presencial').selectOption({ label: 'Dezembro' });
  await page.getByLabel('Início do EAD').fill(`${ano}-11-09`);
  await page.getByLabel('Fim do EAD').fill(`${ano}-11-25`);
  const turmas = ['Cb/Sd · 1ª turma', 'Cb/Sd · 2ª turma', 'Cb/Sd · 3ª turma', 'Subten/Sgt · 1ª turma', 'Subten/Sgt · 2ª turma'];
  for (const [i, nome] of turmas.entries()) {
    const g = page.getByRole('group', { name: nome });
    await g.getByLabel('Nº da turma').fill(String(34 + i));
    await g.getByLabel(/^Início/).fill(`${ano}-12-0${i + 1}`);
    await g.getByLabel(/^Fim/).fill(`${ano}-12-0${i + 3}`);
  }
  await page.getByLabel('Vagas 1ª CIA Cb/Sd 1').fill('2');
  await page.getByLabel('Prazo para as Cias indicarem o efetivo').fill(`${ano}-11-20`);
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Abrir EAP e criar a planilha' }).click();

  const titulo = `EAP ${ano} · EAD em Novembro · presencial em Dezembro`;
  await expect(page.getByRole('heading', { name: titulo })).toBeVisible();
  await expect(page.getByText('Criando a cópia da planilha')).toBeVisible();
  await expect(page.getByRole('row', { name: /1ª CIA/ })).toContainText('Aguardando');

  // Cia: indica um policial na turma (dados do banco de efetivo) e envia.
  await sair(page);
  await entrar(page, '1cia', SENHA_TESTE);
  await page.getByRole('link', { name: new RegExp(titulo) }).click();
  const turma = page.getByRole('region', { name: 'Cb/Sd · Turma 34 · 01/12 a 03/12' });
  await expect(turma).toContainText('0/2');
  await expect(page.getByRole('region', { name: /Cb\/Sd · Turma 35/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Enviar à P/3' }).click();
  await expect(turma.locator('.erro-campo')).toContainText('Sem efetivo pendente de EAP');

  await turma.getByRole('button', { name: '+ Adicionar policial' }).click();
  await page.getByLabel('RE do policial').fill('987654-3');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByLabel('Nome completo')).toHaveValue('TESTE DA SILVA');
  await expect(page.getByLabel('E-mail funcional')).toHaveValue('teste@policiamilitar.sp.gov.br');
  await page.getByLabel('BI ou NBI da IAS').fill('IAS260000001');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(turma).toContainText('SD PM TESTE DA SILVA · RE 987654-3');
  await expect(turma).toContainText('1/2');
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  await page.getByLabel('Enviado por').fill('Cb PM Teste');
  await page.getByRole('button', { name: 'Enviar à P/3' }).click();
  await expect(page.getByRole('status')).toContainText('Enviado à P/3');

  // P/3 vê que a Cia enviou (o motor ainda vai gravar na planilha).
  await sair(page);
  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, 'Aperfeiçoamento');
  await page.getByRole('link', { name: new RegExp(titulo) }).click();
  const linha = page.getByRole('row', { name: /1ª CIA/ });
  await expect(linha).toContainText('Gravando…');
  await expect(linha).toContainText('Cb PM Teste');
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
});
