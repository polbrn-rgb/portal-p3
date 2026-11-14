import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { entrar, sobraLateral } from './ajuda';
import { SENHA_TESTE } from './dados';

// Os dados que o motor (Apps Script) gravaria são criados direto no emulador.
const admin = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-portal-p3' }));

function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('Sala de Operações lança os resultados da operação do dia', async ({ page }, info) => {
  const numero = String(90000 + info.retry * 10 + (info.project.name === 'celular' ? 1 : 2));
  await admin()
    .doc(`operacoes/${numero}`)
    .set({
      protocolos: { [hoje()]: 'MF-555' },
      planilha: {
        status: 'pronta',
        id: 'x',
        url: 'https://docs.google.com/x',
        saida: `Operação Sala ${info.project.name}`,
        dias: [hoje()],
        observacao: 'Foco em roubos',
        campos: [
          { linha: 9, rotulo: 'Pessoas Abordadas', grupo: 'OCOR. COMUNS' },
          { linha: 12, rotulo: 'BO/PM Lavrados', grupo: 'OCOR. COMUNS' },
          { linha: 16, rotulo: 'Ato Infracional', grupo: 'FLAG./PESSOAS' },
        ],
      },
    });

  await entrar(page, 'sala', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: 'Resultados das operações' })).toBeVisible();
  await page.getByLabel(/^Operação/).selectOption(numero);
  await expect(page.getByLabel('Nº protocolo - Mapa Força')).toHaveValue('MF-555');
  await expect(page.getByText('Foco em roubos')).toBeVisible();
  await expect(page.getByRole('group', { name: 'FLAG./PESSOAS' })).toBeVisible();
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  await page.getByRole('button', { name: 'Salvar resultados' }).click();
  await expect(page.getByText('Informe o protocolo do resultado')).toBeVisible();
  await page.getByLabel('Nº protocolo - Resultado').fill('RES-1');
  await page.getByLabel('Pessoas Abordadas').fill('12');
  await page.getByLabel('Lançado por').fill('Sd PM Teste');
  await page.getByRole('button', { name: 'Salvar resultados' }).click();
  await expect(page.getByRole('status')).toContainText('Salvo. Gravando na planilha');

  await expect
    .poll(async () => (await admin().doc(`resultados/${numero}_${hoje()}`).get()).data())
    .toMatchObject({ protocoloResultado: 'RES-1', valores: { '9': 12 }, gravado: false, salvoPor: 'Sd PM Teste' });
});

test('CFP vê as missões do dia direto da agenda do CFP, com a pasta', async ({ page }, info) => {
  const titulo = `Missão agenda ${info.project.name} ${info.retry}`;
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  const depois = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, '0')}-${String(amanha.getDate()).padStart(2, '0')}`;
  // O motor grava um documento só com a agenda inteira; celular e computador rodam juntos, por isso o arrayUnion.
  await admin()
    .doc('agendaCfp/eventos')
    .set(
      {
        eventos: FieldValue.arrayUnion(
          { id: `ev-${titulo}`, titulo, inicio: hoje(), fim: hoje(), pastaUrl: 'https://drive.google.com/p', numero: 2150 },
          { id: `ev2-${titulo}`, titulo: `Sem pasta ${titulo}`, inicio: depois, fim: depois, pastaUrl: '', numero: 0 },
        ),
        conferidoEm: new Date().toISOString(),
      },
      { merge: true },
    );
  await entrar(page, 'cfp', SENHA_TESTE);
  await expect(page.getByRole('heading', { name: 'Missões do CFP' })).toBeVisible();
  await expect(page.getByText('Direto da agenda do CFP')).toBeVisible();
  const cartao = page.getByRole('article', { name: titulo, exact: true });
  await expect(cartao.getByRole('link', { name: '📂 Abrir pasta CFP' })).toHaveAttribute('href', 'https://drive.google.com/p');
  await expect(cartao).toContainText('Nº 2150');
  // Evento criado na mão na agenda (sem número): aparece nas próximas, sem "Nº".
  const proxima = page.getByRole('article', { name: `Sem pasta ${titulo}` });
  await expect(proxima).toContainText('Sem pasta anexada.');
  await expect(proxima).not.toContainText('Nº');
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
});
