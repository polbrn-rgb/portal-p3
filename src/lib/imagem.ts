import { encaixar, LADO_FOTO, LADO_MINIATURA, LIMITE_FOTO, LIMITE_MINIATURA } from '../domain/tds';

// Reduz a foto no próprio celular antes de enviar (JPEG, maior lado 1600 px, até ~650 KB).

export type FotoReduzida = { dados: string; miniatura: string };

type Fonte = { imagem: CanvasImageSource; largura: number; altura: number; soltar: () => void };

async function abrir(arquivo: Blob): Promise<Fonte> {
  if (typeof createImageBitmap === 'function') {
    try {
      const b = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
      return { imagem: b, largura: b.width, altura: b.height, soltar: () => b.close() };
    } catch {
      /* tenta pelo <img> */
    }
  }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { imagem: img, largura: img.naturalWidth, altura: img.naturalHeight, soltar: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function desenhar(f: Fonte, lado: number, qualidade: number): string {
  const { largura, altura } = encaixar(f.largura, f.altura, lado);
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Sem canvas');
  ctx.fillStyle = '#fff'; // PNG com transparência fica com fundo branco
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(f.imagem, 0, 0, largura, altura);
  return canvas.toDataURL('image/jpeg', qualidade).split(',')[1] ?? '';
}

function caber(f: Fonte, tentativas: [number, number][], limite: number): string {
  for (const [lado, q] of tentativas) {
    const b64 = desenhar(f, lado, q);
    if (b64 && b64.length <= limite) return b64;
  }
  throw new Error('Foto grande demais');
}

/** Lança erro se o arquivo não for uma imagem que o navegador consiga abrir. */
export async function reduzirFoto(arquivo: Blob): Promise<FotoReduzida> {
  const f = await abrir(arquivo);
  try {
    const dados = caber(
      f,
      [
        [LADO_FOTO, 0.82],
        [LADO_FOTO, 0.7],
        [1280, 0.7],
        [1024, 0.6],
      ],
      LIMITE_FOTO,
    );
    const miniatura = caber(
      f,
      [
        [LADO_MINIATURA, 0.65],
        [240, 0.5],
      ],
      LIMITE_MINIATURA,
    );
    return { dados, miniatura };
  } finally {
    f.soltar();
  }
}

/** Bytes -> base64 (em blocos, para arquivos grandes não estourarem a pilha). */
export function bytesParaBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ParaBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
