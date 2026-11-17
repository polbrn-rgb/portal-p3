import { ENDERECO_ASSINATURA, FONES_ASSINATURA, linhaCargo } from '../domain/email';

// Desenha a assinatura padrão da P/3 sobre o modelo (public/assinatura-modelo.png: logo e faixas, sem texto),
// com a mesma fonte das assinaturas oficiais (Roboto Condensed, carregada do Google Fonts; sem internet
// para a fonte, usa uma condensada parecida). Sai em PNG com o dobro do tamanho, para ficar nítida.

const MODELO = '/assinatura-modelo.png';
const ESCALA = 2;
const FONTE = '"Roboto Condensed", "Arial Narrow", "DejaVu Sans Condensed", sans-serif';
const URL_FONTE = 'https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;700&display=swap';
const X = 90;

let fonte: Promise<void> | null = null;

function carregarFonte(): Promise<void> {
  if (!fonte) {
    fonte = (async () => {
      if (!document.querySelector(`link[href="${URL_FONTE}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = URL_FONTE;
        document.head.appendChild(link);
        await new Promise((ok) => {
          link.onload = ok;
          link.onerror = ok;
          setTimeout(ok, 3000);
        });
      }
      await Promise.race([
        Promise.all([document.fonts.load('700 17px "Roboto Condensed"'), document.fonts.load('400 12px "Roboto Condensed"')]),
        new Promise((ok) => setTimeout(ok, 3000)),
      ]).catch(() => undefined);
    })();
  }
  return fonte;
}

let modelo: Promise<HTMLImageElement> | null = null;

function carregarModelo(): Promise<HTMLImageElement> {
  if (!modelo) {
    modelo = new Promise((ok, falha) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => {
        modelo = null;
        falha(new Error('Não foi possível carregar o modelo da assinatura.'));
      };
      img.src = MODELO;
    });
  }
  return modelo;
}

/** Texto numa linha só: diminui a fonte até caber. */
function escrever(ctx: CanvasRenderingContext2D, texto: string, y: number, tamanho: number, peso: number, cor: string, largura: number) {
  let t = tamanho;
  do {
    ctx.font = `${peso} ${t}px ${FONTE}`;
    t -= 0.5;
  } while (ctx.measureText(texto).width > largura && t > 8);
  ctx.fillStyle = cor;
  ctx.fillText(texto, X, y);
}

/** PNG (data URL) da assinatura de uma pessoa: nome completo, posto - cargo, fones e endereço. */
export async function desenharAssinatura(p: { nomeCompleto: string; posto: string }): Promise<string> {
  const [img] = await Promise.all([carregarModelo(), carregarFonte()]);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth * ESCALA;
  canvas.height = img.naturalHeight * ESCALA;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador não consegue desenhar a assinatura.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  ctx.scale(ESCALA, ESCALA);
  ctx.textBaseline = 'alphabetic';
  const largura = img.naturalWidth - X - 8;
  escrever(ctx, p.nomeCompleto.trim().toUpperCase(), 26.5, 17, 700, '#2f3032', largura);
  escrever(ctx, linhaCargo(p.posto), 42.5, 12.5, 400, '#4f5961', largura);
  escrever(ctx, FONES_ASSINATURA, 61.5, 12, 400, '#4f5961', largura);
  escrever(ctx, ENDERECO_ASSINATURA, 75.5, 12, 400, '#4f5961', largura);
  return canvas.toDataURL('image/png');
}
