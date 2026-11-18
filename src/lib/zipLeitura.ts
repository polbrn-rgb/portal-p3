// Abre um .zip (o .pptx é um zip) no navegador ou no Node, sem biblioteca: lê o diretório central e
// descompacta cada arquivo com o DecompressionStream ("deflate-raw"), que os navegadores atuais têm.

export type ArquivosZip = Map<string, Uint8Array>;

async function inflar(dados: Uint8Array): Promise<Uint8Array> {
  const fluxo = new Blob([dados as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

export async function deszipar(zip: Uint8Array): Promise<ArquivosZip> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let fim = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--)
    if (v.getUint32(i, true) === 0x06054b50) {
      fim = i;
      break;
    }
  if (fim < 0) throw new Error('Arquivo .zip inválido');
  const total = v.getUint16(fim + 10, true);
  let p = v.getUint32(fim + 16, true);
  const dec = new TextDecoder();
  const saida: ArquivosZip = new Map();
  for (let n = 0; n < total; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Arquivo .zip inválido');
    const metodo = v.getUint16(p + 10, true);
    const tamanho = v.getUint32(p + 20, true);
    const lNome = v.getUint16(p + 28, true);
    const lExtra = v.getUint16(p + 30, true);
    const lComent = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nome = dec.decode(zip.subarray(p + 46, p + 46 + lNome));
    p += 46 + lNome + lExtra + lComent;
    if (nome.endsWith('/')) continue;
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const bruto = zip.subarray(inicio, inicio + tamanho);
    if (metodo === 0) saida.set(nome, bruto.slice());
    else if (metodo === 8) saida.set(nome, await inflar(bruto));
    else throw new Error(`Compressão não suportada em ${nome}`);
  }
  return saida;
}
