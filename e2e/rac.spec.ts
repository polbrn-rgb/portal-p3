import { expect, test } from '@playwright/test';
import { entrar, irPara, irParaAbaCia, sair, sobraLateral } from './ajuda';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { comCampo, racVazio, valorDoCampo, type RacDados } from '../src/domain/rac';
import { SENHA_TESTE } from './dados';

const admin = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-portal-p3' }));

/** Rascunho com tudo 0, menos os campos que o teste digita na tela (menos carga no CI que 137 digitações). */
function rascunhoComZeros(unidade: '1cia' | '3cia', mes: string, deixarVazios: string[]): RacDados {
  let d = racVazio(unidade, mes);
  const campos = [
    ...Object.keys(d.crimes).flatMap((c) => Object.keys(d.crimes[c as keyof RacDados['crimes']]).map((k) => `crimes.${c}.${k}`)),
    ...Object.keys(d.pelotoes).flatMap((l) => Object.keys(d.pelotoes[l]).map((c) => `pelotoes.${l}.${c}`)),
    ...Object.keys(d.producao).flatMap((p) => Object.keys(d.producao[p as keyof RacDados['producao']]).map((k) => `producao.${p}.${k}`)),
  ];
  for (const c of campos) if (!deixarVazios.includes(c) && valorDoCampo(d, c) === null) d = comCampo(d, c, 0);
  return d;
}

// Imagem PNG mínima (1×1) para os 7 prints; no emulador a leitura automática fica desligada.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const PRINTS = [
  'Roubo de veículo — Indicadores Criminais',
  'Roubo de veículo — Painel de Roubo e Furto de Veículo',
  'Furto de veículo — Indicadores Criminais',
  'Furto de veículo — Painel de Roubo e Furto de Veículo',
  'Roubo outros — Indicadores Criminais',
  'Roubo outros — Painel de Roubos',
  'Furto outros — Indicadores Criminais',
];

test('RAC: a P/3 abre o mês, a Cia preenche (o portal calcula e confere) e envia; a P/3 acompanha', async ({ page }, info) => {
  test.setTimeout(90_000); // teste longo: 2 logins da P/3, 1 da Cia e 137 campos
  const celular = info.project.name === 'celular';
  const ano = 2030 + (Math.floor(Date.now() / 1000) % 40) * 2 + (celular ? 1 : 0); // um mês novo por execução e por tela
  const titulo = `RAC MAIO/${ano}`;
  const unidade = celular ? '3cia' : '1cia';
  const nomeUnidade = celular ? '3ª Cia' : '1ª Cia';

  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, /^Operações/);
  await page.getByRole('navigation', { name: 'Operações' }).getByRole('link', { name: 'RAC', exact: true }).click();
  const abrir = page.getByRole('group', { name: 'Abrir RAC' });
  await abrir.getByLabel('Mês de referência').fill(`${ano}-05`);
  await abrir.getByRole('button', { name: 'Abrir RAC' }).click();
  await expect(abrir.getByText('Informe o prazo das Cias.')).toBeVisible();
  await abrir.getByLabel('Prazo das Cias').fill(`${ano}-06-10`);
  await abrir.getByRole('button', { name: 'Abrir RAC' }).click();
  await expect(abrir.getByText(`RAC de MAIO/${ano} aberto para as Cias.`)).toBeVisible({ timeout: 15000 }); // banco confirmou
  await expect(page.getByRole('article', { name: titulo })).toBeVisible({ timeout: 15000 });
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
  await sair(page);

  // A Cia já tem um rascunho salvo com quase tudo em 0 (o resto ela digita abaixo).
  const vazios = ['crimes.furtoVeiculo.atual', 'crimes.furtoVeiculo.inconsistencias', 'pelotoes.pessoasAbordadas.pelA'];
  const d = rascunhoComZeros(unidade, `${ano}-05`, vazios);
  await admin()
    .doc(`racs/${ano}-05_${unidade}`)
    .set({ mes: d.mes, unidadeId: unidade, crimes: d.crimes, pelotoes: d.pelotoes, producao: d.producao, justificativas: {}, status: 'rascunho', preenchidoPor: '', salvoEm: FieldValue.serverTimestamp() });

  await entrar(page, unidade, SENHA_TESTE);
  await irParaAbaCia(page, 'RAC');
  await page.getByRole('link', { name: new RegExp(titulo) }).click();
  await expect(page.getByRole('heading', { name: `RAC – ${nomeUnidade} – MAIO/${ano}` })).toBeVisible();
  await expect(page.getByText('📝 Rascunho')).toBeVisible();

  // Enviar com campos vazios: avisa quanto falta (3 números, 7 prints e quem preencheu).
  await page.getByRole('button', { name: 'Enviar à P/3' }).click();
  await expect(page.getByText('Falta preencher ou corrigir 11 campos (se não houve, coloque 0).')).toBeVisible();
  expect(await page.locator('.formulario-rac input[inputmode="numeric"]').count()).toBe(137); // 45 de crimes, 60 por pelotão, 4 à parte e 28 do comparativo

  // Inconsistências maiores que o total do mês: erro; corrigido, o Real aparece calculado na tabela.
  const mesTitulo = `mai/${String(ano).slice(2)}`;
  await page.getByLabel(`FURTO VEÍCULO ${mesTitulo}`, { exact: true }).fill('62');
  await page.getByLabel('FURTO VEÍCULO Inconsistências', { exact: true }).fill('63');
  await page.getByLabel('Preenchido por').fill('Sd PM Teste');
  await page.getByRole('button', { name: 'Enviar à P/3' }).click();
  const inconsist = page.getByRole('table', { name: 'COMPARATIVO ANUAL COM INCONSISTÊNCIAS' });
  await expect(inconsist.getByText('não podem passar do total do mês (62)')).toBeVisible();
  await page.getByLabel('FURTO VEÍCULO Inconsistências', { exact: true }).fill('1');
  await expect(inconsist.locator('tr', { hasText: 'FURTO VEÍCULO' })).toContainText('61');
  // O mês do trimestral vem do comparativo anual (não é digitado de novo).
  await expect(page.getByRole('table', { name: 'COMPARATIVO TRIMESTRAL' }).locator('tr', { hasText: 'FURTO VEÍCULO' })).toContainText('62');

  // Pessoas abordadas por pelotão: o TOTAL vai para o comparativo de produtividade.
  await page.getByLabel('Pessoas Abordadas Pel A', { exact: true }).fill('647');
  await expect(page.getByRole('table', { name: 'PRODUTIVIDADE MENSAL', exact: true }).locator('tr', { hasText: 'Pessoas Abordadas' })).toContainText('647');
  await expect(page.getByRole('table', { name: 'COMPARATIVO PRODUTIVIDADE ANUAL' }).locator('tr', { hasText: 'Pessoas Abordadas' })).toContainText('647');

  // Sem os 7 prints não envia; depois de enviar, aparece a miniatura de cada um.
  await page.getByRole('button', { name: 'Enviar à P/3' }).click();
  await expect(page.getByText(`Envie o print: ${PRINTS[0]}.`)).toBeVisible();
  for (const [i, rotulo] of PRINTS.entries())
    await page.getByLabel(new RegExp(`^${rotulo}`)).setInputFiles({ name: `print${i}.png`, mimeType: 'image/png', buffer: PNG });
  for (const rotulo of PRINTS) await expect(page.getByRole('img', { name: `Print enviado: ${rotulo}` })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Enviado.', { exact: true })).toHaveCount(PRINTS.length, { timeout: 15000 }); // banco confirmou os 7

  await page.getByRole('button', { name: 'Enviar à P/3' }).click();
  await expect(page.getByText('RAC enviado para a P/3.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('✅ Enviado')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Atualizar envio' })).toBeVisible();

  // A Cia vê os slides na tela e baixa o .pptx.
  await page.getByRole('button', { name: '👁️ Pré-visualizar' }).click();
  const previa = page.getByLabel(`Pré-visualização do RAC – ${nomeUnidade}`);
  await expect(previa.getByText(`RAC – ${nomeUnidade} - MAIO/${ano}`)).toBeVisible();
  await expect(previa.getByRole('img', { name: 'Print: ROUBO DE VEÍCULOS' }).first()).toBeVisible({ timeout: 15000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '⬇️ Baixar apresentação (.pptx)' }).click();
  expect((await download).suggestedFilename()).toBe(`RAC ${nomeUnidade} - MAIO-${ano}.pptx`);
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);
  await sair(page);

  await entrar(page, 'p3', SENHA_TESTE);
  await irPara(page, /^Operações/);
  await page.getByRole('navigation', { name: 'Operações' }).getByRole('link', { name: 'RAC', exact: true }).click();
  const tabela = page.getByRole('table', { name: `Situação do ${titulo}` });
  await expect(tabela.getByRole('row', { name: new RegExp(nomeUnidade) })).toContainText('✅ Enviado');
  await expect(tabela.getByRole('row', { name: new RegExp(nomeUnidade) })).toContainText('Sd PM Teste');

  // A P/3 baixa o RAC da Cia.
  const baixou = page.waitForEvent('download');
  await page.getByRole('button', { name: `Baixar RAC da ${nomeUnidade}` }).click();
  expect((await baixou).suggestedFilename()).toBe(`RAC ${nomeUnidade} - MAIO-${ano}.pptx`);
  const cartao = page.getByRole('article', { name: titulo });

  // Batalhão: soma das Cias que enviaram, 4 painéis e RPM da P/3; depois o RAC GERAL num .pptx só.
  const btl = cartao.getByRole('region', { name: `Batalhão e RAC GERAL de MAIO/${ano}` });
  await expect(btl.getByText(/Ainda não enviaram:/)).toBeVisible();
  for (const [i, rotulo] of PRINTS.filter((r) => r.endsWith('Indicadores Criminais')).entries())
    await btl.getByLabel(new RegExp(`^${rotulo}`)).setInputFiles({ name: `btl${i}.png`, mimeType: 'image/png', buffer: PNG });
  await expect(btl.getByText('Enviado.', { exact: true })).toHaveCount(4, { timeout: 15000 });
  await btl.getByLabel('Pessoas Abordadas ABRIL', { exact: true }).fill('1462');
  await btl.getByLabel('Pessoas Abordadas MAIO', { exact: true }).fill('1936');
  await expect(btl.getByLabel('Pessoas Abordadas TOTAL GERAL', { exact: true })).toHaveAttribute('placeholder', '3398');
  await btl.getByRole('button', { name: 'Salvar Produtividade RPM' }).click();
  await expect(btl.getByText('Produtividade RPM gravada.')).toBeVisible({ timeout: 15000 });
  const geral = page.waitForEvent('download');
  await btl.getByRole('button', { name: '⬇️ Compilar RAC GERAL (.pptx)' }).click();
  expect((await geral).suggestedFilename()).toBe(`RAC GERAL - MAIO-${ano}.pptx`);
  await expect(btl.getByText(/RAC GERAL gerado \(sem /)).toBeVisible({ timeout: 15000 });
  expect(await sobraLateral(page)).toBeLessThanOrEqual(0);

  // Fecha o mês: o RAC GERAL vai em partes para o motor arquivar no Drive (nos testes o motor não roda).
  await btl.getByRole('button', { name: '📦 Fechar mês e arquivar no Drive' }).click();
  await btl.getByRole('alertdialog', { name: 'Confirmar fechamento do mês' }).getByRole('button', { name: 'Sim, fechar e arquivar' }).click();
  await expect(btl.getByText('Mês encerrado. O RAC GERAL foi enviado para arquivar no Drive.')).toBeVisible({ timeout: 30000 });
  await expect(btl.getByText(`⏳ Arquivando RAC GERAL - MAIO-${ano}.pptx no Drive`, { exact: false })).toBeVisible();
  await expect(cartao.getByText('Encerrado', { exact: true })).toBeVisible();

  // Depois exclui o mês inteiro (sai do banco e da tela).
  await cartao.getByRole('button', { name: '🗑️ Excluir RAC do mês' }).click();
  await cartao.getByRole('alertdialog').getByRole('button', { name: 'Sim, excluir' }).click();
  await expect(page.getByRole('article', { name: titulo })).toHaveCount(0, { timeout: 15000 });
});
