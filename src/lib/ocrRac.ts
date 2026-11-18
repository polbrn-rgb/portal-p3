import {
  anosDasLinhas,
  binarizar,
  caixaAno,
  caixaCelula,
  caixaFiltro,
  celulasDoMes,
  ciaDoTexto,
  delitoDoTexto,
  ehPainelPadrao,
  FILTRO_COMPANHIA,
  FILTRO_INDICADOR,
  numeroLido,
  precisaMaisTentativas,
  TENTATIVAS,
  votar,
  type Caixa,
  type ColunaLida,
  type LeituraPainel,
} from '../domain/racPrints';

// Leitura (OCR) dos prints do painel no próprio aparelho, com o Tesseract.js carregado do CDN só quando
// a Cia envia um print. Nada sai do aparelho além do que já ia para o portal. Nos testes (emulador) fica
// desligada: a Cia digita e o portal confere do mesmo jeito.

const URL_TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
export const OCR_LIGADO = import.meta.env.VITE_USE_EMULATORS !== 'true';

type Trabalhador = {
  setParameters(p: Record<string, string>): Promise<unknown>;
  recognize(img: HTMLCanvasElement): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
};
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
function recorte(img: CanvasImageSource, c: Caixa, escala: number, limiar: number, canal: 'max' | 'min'): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const w = c.largura * escala;
  const h = c.altura * escala;
  canvas.width = w + 2 * BORDA;
  canvas.height = h + 2 * BORDA;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, c.x, c.y, c.largura, c.altura, BORDA, BORDA, w, h);
  const dados = ctx.getImageData(BORDA, BORDA, w, h);
  binarizar(dados.data, canal, limiar);
  ctx.putImageData(dados, BORDA, BORDA);
  return canvas;
}

/**
 * Lê o print "Indicadores Criminais": filtros (Cia e indicador) e as células do mês de referência.
 * null = não é o painel padrão ou não deu para ler (a Cia digita).
 */
export async function lerPainel(arquivo: Blob, mes: string, aoProgredir?: (feito: number) => void): Promise<LeituraPainel | null> {
  if (!OCR_LIGADO) return null;
  const img = await createImageBitmap(arquivo);
  const { width: W, height: H } = img;
  if (!ehPainelPadrao(W, H)) {
    img.close();
    return null;
  }
  const T = await carregarTesseract();
  const t = await T.createWorker('eng', 1);
  try {
    const ler = async (c: Caixa, escala: number, limiar: number, psm: string, canal: 'max' | 'min' = 'max', digitos = true) => {
      await t.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: digitos ? '0123456789' : '' });
      return (await t.recognize(recorte(img, c, escala, limiar, canal))).data.text;
    };
    const lerNumero = async (c: Caixa) => {
      const lidas: (number | null)[] = [];
      for (const [i, [escala, limiar, psm]] of TENTATIVAS.entries()) {
        if (i === 2 && !precisaMaisTentativas(lidas)) break;
        lidas.push(numeroLido(await ler(c, escala, limiar, psm)));
      }
      return votar(lidas);
    };

    const companhia = ciaDoTexto(await ler(caixaFiltro(W, H, FILTRO_COMPANHIA), 5, 200, '7', 'min', false));
    const delito = delitoDoTexto(await ler(caixaFiltro(W, H, FILTRO_INDICADOR), 5, 200, '7', 'min', false));
    const textosAnos: string[] = [];
    for (let linha = 0; linha < 3; linha++) textosAnos.push(await ler(caixaAno(W, H, linha), 4, 110, '7'));
    const anos = anosDasLinhas(textosAnos, Number(mes.slice(0, 4)));
    aoProgredir?.(1);

    const valores: LeituraPainel['valores'] = {};
    const celulas = Object.entries(celulasDoMes(mes)) as [ColunaLida, [number, number]][];
    for (const [i, [coluna, [ano, m]]] of celulas.entries()) {
      const linha = anos.indexOf(ano);
      if (linha >= 0) {
        const v = await lerNumero(caixaCelula(W, H, m, linha));
        if (v) valores[coluna] = v;
      }
      aoProgredir?.(2 + i);
    }
    return { companhia, delito, valores };
  } finally {
    img.close();
    void t.terminate();
  }
}
