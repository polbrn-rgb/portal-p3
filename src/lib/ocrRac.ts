import {
  ampliacao,
  anosDasLinhas,
  binarizar,
  canalUnico,
  cinzaInvertido,
  caixaAno,
  caixaCelula,
  caixaNoPainel,
  celulasDoMes,
  ciaDoTexto,
  COLUNA_MINIMA,
  delitoDoTexto,
  FILTRO_COMPANHIA,
  FILTRO_INDICADOR,
  gradeDosMeses,
  gradePadrao,
  numeroLido,
  palavrasDoTsv,
  precisaMaisTentativas,
  tentativasPara,
  votar,
  type Caixa,
  type ColunaLida,
  type Grade,
  type LeituraPainel,
  type Palavra,
  type Tentativa,
} from '../domain/racPrints';

// Leitura (OCR) dos prints do painel no próprio aparelho, com o Tesseract.js carregado do CDN só quando
// a Cia envia um print. Nada sai do aparelho além do que já ia para o portal. Nos testes (emulador) fica
// desligada: a Cia digita e o portal confere do mesmo jeito.

const URL_TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
export const OCR_LIGADO = import.meta.env.VITE_USE_EMULATORS !== 'true';

type Trabalhador = {
  setParameters(p: Record<string, string>): Promise<unknown>;
  recognize(img: HTMLCanvasElement, opcoes?: object, saida?: object): Promise<{ data: DadosLidos }>;
  terminate(): Promise<unknown>;
};
type Bbox = { x0: number; y0: number; x1: number; y1: number };
type PalavraT = { text: string; bbox: Bbox };
type DadosLidos = { text: string; tsv?: string | null; words?: PalavraT[]; blocks?: { paragraphs?: { lines?: { words?: PalavraT[] }[] }[] }[] | null };
type Tesseract = { createWorker(lingua: string, oem?: number): Promise<Trabalhador> };

let carregando: Promise<Tesseract> | undefined;
function carregarTesseract(): Promise<Tesseract> {
  carregando ??= new Promise<Tesseract>((ok, falha) => {
    const ja = (window as unknown as { Tesseract?: Tesseract }).Tesseract;
    if (ja) return ok(ja);
    const s = document.createElement('script');
    s.src = URL_TESSERACT;
    s.async = true;
    s.onload = () => {
      const t = (window as unknown as { Tesseract?: Tesseract }).Tesseract;
      if (t) ok(t);
      else falha(new Error('Leitor não carregou'));
    };
    s.onerror = () => {
      carregando = undefined;
      falha(new Error('Leitor não carregou'));
    };
    document.head.appendChild(s);
  });
  return carregando;
}

const BORDA = 24;
/**
 * Recorte como na calibração: primeiro o cinza (canal) no tamanho original, depois ampliado com suavização e,
 * no modo preto e branco, o limiar. Fica com borda branca (o leitor lê melhor).
 */
function recorte(img: CanvasImageSource, c: Caixa, escala: number, modo: Tentativa['modo'], limiar: number, canal: 'max' | 'min' = 'max'): HTMLCanvasElement {
  const origem = document.createElement('canvas');
  origem.width = Math.max(1, c.largura);
  origem.height = Math.max(1, c.altura);
  const co = origem.getContext('2d', { willReadFrequently: true })!;
  co.drawImage(img, c.x, c.y, c.largura, c.altura, 0, 0, origem.width, origem.height);
  const px = co.getImageData(0, 0, origem.width, origem.height);
  if (modo === 'cinza') cinzaInvertido(px.data);
  else canalUnico(px.data, canal);
  co.putImageData(px, 0, 0);

  const w = Math.max(1, Math.round(origem.width * escala));
  const h = Math.max(1, Math.round(origem.height * escala));
  const canvas = document.createElement('canvas');
  canvas.width = w + 2 * BORDA;
  canvas.height = h + 2 * BORDA;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(origem, 0, 0, origem.width, origem.height, BORDA, BORDA, w, h);
  if (modo === 'pb') {
    const dados = ctx.getImageData(BORDA, BORDA, w, h);
    binarizar(dados.data, limiar);
    ctx.putImageData(dados, BORDA, BORDA);
  }
  return canvas;
}

/** Palavras do resultado, qualquer que seja o formato devolvido pela versão do leitor. */
function palavras(d: DadosLidos, escala: number): Palavra[] {
  const de = (w: PalavraT): Palavra => ({
    texto: w.text,
    x: w.bbox.x0 / escala,
    y: w.bbox.y0 / escala,
    largura: (w.bbox.x1 - w.bbox.x0) / escala,
    altura: (w.bbox.y1 - w.bbox.y0) / escala,
  });
  if (d.words?.length) return d.words.map(de);
  const dosBlocos = (d.blocks ?? []).flatMap((b) => (b.paragraphs ?? []).flatMap((p) => (p.lines ?? []).flatMap((l) => l.words ?? [])));
  if (dosBlocos.length) return dosBlocos.map(de);
  return palavrasDoTsv(d.tsv ?? '').map((p) => ({ ...p, x: p.x / escala, y: p.y / escala, largura: p.largura / escala, altura: p.altura / escala }));
}

export type ResultadoLeitura = { leitura: LeituraPainel | null; motivo?: string };

/**
 * Lê o print "Indicadores Criminais": acha a tabela pelos nomes dos meses (ou, no recorte padrão, pela
 * proporção), lê as células do mês de referência e os filtros (Cia e indicador).
 * Sem leitura, devolve o motivo para a Cia (ela digita os números).
 */
export async function lerPainel(arquivo: Blob, mes: string): Promise<ResultadoLeitura> {
  if (!OCR_LIGADO) return { leitura: null };
  let T: Tesseract;
  try {
    T = await carregarTesseract();
  } catch {
    return { leitura: null, motivo: 'O leitor de números não carregou (internet bloqueada ou lenta). Confira e digite os números.' };
  }
  const img = await createImageBitmap(arquivo);
  const { width: W, height: H } = img;
  const t = await T.createWorker('eng', 1);
  try {
    // 1) Acha a tabela pelos nomes dos meses no print inteiro.
    const escalaBusca = W < 1500 ? 2 : 1;
    await t.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: '' });
    const busca = await t.recognize(recorte(img, { x: 0, y: 0, largura: W, altura: H }, escalaBusca, 'pb', 110), {}, { text: true, blocks: true, tsv: true });
    const g: Grade | null = gradeDosMeses(palavras(busca.data, escalaBusca).map((p) => ({ ...p, x: p.x - 24 / escalaBusca, y: p.y - 24 / escalaBusca }))) ?? gradePadrao(W, H);
    if (!g) return { leitura: null, motivo: 'Não achei a tabela mês a mês no print. Envie o painel "Indicadores Criminais" inteiro. Confira e digite os números.' };
    if (g.b < COLUNA_MINIMA)
      return { leitura: null, motivo: 'O print ficou pequeno demais para ler os números com segurança (painel com menos de ~1000 px de largura). Aumente o zoom do navegador antes do print, ou confira e digite os números.' };

    const ler = async (c: Caixa, t0: Tentativa, canal: 'max' | 'min' = 'max', digitos = true) => {
      await t.setParameters({ tessedit_pageseg_mode: t0.psm, tessedit_char_whitelist: digitos ? '0123456789' : '' });
      return (await t.recognize(recorte(img, c, ampliacao(t0.escala, g), t0.modo, t0.limiar, canal))).data.text;
    };
    const tentativas = tentativasPara(g);
    const lerNumero = async (c: Caixa) => {
      const lidas: (number | null)[] = [];
      for (const [i, t0] of tentativas.entries()) {
        if (i === 2 && !precisaMaisTentativas(lidas)) break;
        lidas.push(numeroLido(await ler(c, t0)));
      }
      return votar(lidas);
    };

    // 2) Filtros do painel e anos das linhas.
    const filtro: Tentativa = { modo: 'pb', escala: 5, limiar: 200, psm: '7' };
    const companhia = ciaDoTexto(await ler(caixaNoPainel(g, FILTRO_COMPANHIA), filtro, 'min', false));
    const delito = delitoDoTexto(await ler(caixaNoPainel(g, FILTRO_INDICADOR), filtro, 'min', false));
    const textosAnos: string[] = [];
    for (let linha = 0; linha < 3; linha++) textosAnos.push(await ler(caixaAno(g, linha), { modo: 'pb', escala: 4, limiar: 110, psm: '7' }));
    const anos = anosDasLinhas(textosAnos, Number(mes.slice(0, 4)));

    // 3) As 4 células do RAC.
    const valores: LeituraPainel['valores'] = {};
    for (const [coluna, [ano, m]] of Object.entries(celulasDoMes(mes)) as [ColunaLida, [number, number]][]) {
      const linha = anos.indexOf(ano);
      if (linha < 0) continue;
      const v = await lerNumero(caixaCelula(g, m, linha));
      if (v) valores[coluna] = v;
    }
    if (!Object.keys(valores).length) return { leitura: null, motivo: 'Achei a tabela, mas não consegui ler os números. Confira e digite os números.' };
    return { leitura: { companhia, delito, valores } };
  } finally {
    img.close();
    void t.terminate();
  }
}
