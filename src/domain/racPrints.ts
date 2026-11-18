import { DELITOS, idRac, mesesDoRac, rotuloCurto, temCrimes, type Alerta, type DelitoId, type LinhaCrime, type RacDados, type UnidadeRac } from './rac';

// RAC → prints do painel da Coordenadoria Operacional (Fase 3).
// Os 4 prints "Indicadores Criminais" têm, no rodapé, a tabela mês a mês (2024/2025/2026): o portal lê as
// células do mês de referência, do mês anterior, do retrasado e do mesmo mês do ano anterior.
// A posição das células foi medida nos prints reais de set/2026 (todos com ~1860×775 px).

export const SLOTS_PRINT = [
  { id: 'rvPainel', delito: 'rouboVeiculo', tipo: 'painel', rotulo: 'Roubo de veículo — Indicadores Criminais' },
  { id: 'rvMapa', delito: 'rouboVeiculo', tipo: 'mapa', rotulo: 'Roubo de veículo — Painel de Roubo e Furto de Veículo' },
  { id: 'fvPainel', delito: 'furtoVeiculo', tipo: 'painel', rotulo: 'Furto de veículo — Indicadores Criminais' },
  { id: 'fvMapa', delito: 'furtoVeiculo', tipo: 'mapa', rotulo: 'Furto de veículo — Painel de Roubo e Furto de Veículo' },
  { id: 'roPainel', delito: 'rouboOutros', tipo: 'painel', rotulo: 'Roubo outros — Indicadores Criminais' },
  { id: 'roMapa', delito: 'rouboOutros', tipo: 'mapa', rotulo: 'Roubo outros — Painel de Roubos' },
  { id: 'foPainel', delito: 'furtosOutros', tipo: 'painel', rotulo: 'Furto outros — Indicadores Criminais' },
] as const;
export type SlotPrint = (typeof SLOTS_PRINT)[number]['id'];
export const IDS_SLOTS: readonly string[] = SLOTS_PRINT.map((s) => s.id);

/** Cia: os 7 prints. Batalhão: só os 4 painéis (como no RAC BTL). Força Tática: nenhum. */
export function slotsDaUnidade(u: UnidadeRac): readonly (typeof SLOTS_PRINT)[number][] {
  if (!temCrimes(u)) return [];
  return u === 'btl' ? SLOTS_PRINT.filter((s) => s.tipo === 'painel') : SLOTS_PRINT;
}
export const idPrint = (mes: string, u: UnidadeRac, slot: SlotPrint) => `${idRac(mes, u)}_${slot}`;

// ---------- leitura ----------

export type ColunaLida = 'anoAnterior' | 'mesRetrasado' | 'mesAnterior' | 'atual';
export type ValorLido = { valor: number; confira: boolean };
export type LeituraPainel = {
  companhia: string | null; // '1cia'…'6cia' lido no filtro do painel
  delito: DelitoId | null; // indicador lido no filtro do painel
  valores: Partial<Record<ColunaLida, ValorLido>>;
};

export type Caixa = { x: number; y: number; largura: number; altura: number };
type Fracao = [number, number, number, number]; // x0, y0, x1, y1 em fração do painel

/**
 * Onde está a tabela no print: a = centro da coluna de janeiro, b = largura de uma coluna de mês,
 * yCabecalho = centro da linha dos nomes dos meses (tudo em pixels da imagem enviada).
 * Achada pelos nomes dos meses que o leitor encontra, então funciona com margem, tela cheia e zoom.
 */
export type Grade = { a: number; b: number; yCabecalho: number };

// Medidas tiradas dos 24 prints reais (em larguras de coluna, a partir do cabeçalho dos meses).
const DY_LINHAS = [0.1285, 0.2734, 0.4081]; // centro das linhas 2024/2025/2026
const MEIA_ALTURA = 0.0465;
const MARGEM = 0.08;
export const COLUNA_REFERENCIA = 149.6; // largura da coluna nos prints de set/2026 (as tentativas foram calibradas nela)
export const COLUNA_MINIMA = 80; // menor que isso (painel com menos de ~1000 px de largura), não lê: risco de perder dígito
// Painel inteiro em relação à coluna (para achar as caixas de filtro).
const COLUNA_POR_PAINEL = 2 * 0.04022;
const JANEIRO_POR_PAINEL = 0.0408 + 0.04022;
const ALTURA_POR_LARGURA = 774 / 1864;
const LINHA0_POR_ALTURA = 0.903;

export const FILTRO_COMPANHIA: Fracao = [0.267, 0.254, 0.36, 0.272];
export const FILTRO_INDICADOR: Fracao = [0.393, 0.254, 0.49, 0.272];

/** Print recortado no painel (proporção ~2,4 : 1), como as Cias mandaram em set/2026. */
export const ehPainelPadrao = (largura: number, altura: number) => altura > 0 && largura / altura >= 2.2 && largura / altura <= 2.65;

/** Grade quando o print é só o painel (sem achar os nomes dos meses). */
export function gradePadrao(largura: number, altura: number): Grade | null {
  if (!ehPainelPadrao(largura, altura)) return null;
  const b = COLUNA_POR_PAINEL * largura;
  return { a: JANEIRO_POR_PAINEL * largura, b, yCabecalho: LINHA0_POR_ALTURA * altura - DY_LINHAS[0] * b };
}

const NUM_MES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};
export type Palavra = { texto: string; x: number; y: number; largura: number; altura: number };

/** Palavras do TSV do Tesseract (colunas: ... left, top, width, height, conf, text). */
export function palavrasDoTsv(tsv: string): Palavra[] {
  return tsv
    .split('\n')
    .map((l) => l.split('\t'))
    .filter((c) => c.length >= 12 && c[11].trim() !== '' && /^\d+$/.test(c[6]))
    .map((c) => ({ texto: c[11], x: Number(c[6]), y: Number(c[7]), largura: Number(c[8]), altura: Number(c[9]) }));
}

/** Ajusta uma reta pelos nomes dos meses achados (precisa de 2 meses diferentes). */
export function gradeDosMeses(palavras: readonly Palavra[]): Grade | null {
  const pts = palavras
    .map((p) => ({ m: NUM_MES[p.texto.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')], x: p.x + p.largura / 2, y: p.y + p.altura / 2 }))
    .filter((p) => p.m !== undefined);
  if (new Set(pts.map((p) => p.m)).size < 2) return null;
  const mm = pts.reduce((s, p) => s + p.m, 0) / pts.length;
  const xm = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const b = pts.reduce((s, p) => s + (p.m - mm) * (p.x - xm), 0) / pts.reduce((s, p) => s + (p.m - mm) ** 2, 0);
  if (!(b > 0)) return null;
  const ys = pts.map((p) => p.y).sort((x, y) => x - y);
  return { a: xm - b * (mm - 1), b, yCabecalho: ys[Math.floor((ys.length - 1) / 2)] };
}

function retangulo(x0: number, y0: number, x1: number, y1: number): Caixa {
  const x = Math.round(x0);
  const y = Math.round(y0);
  return { x, y, largura: Math.round(x1) - x, altura: Math.round(y1) - y };
}

/** Célula do valor (metade esquerda da coluna do mês) numa das 3 linhas de anos. */
export function caixaCelula(g: Grade, mes: number, linha: number): Caixa {
  const cx = g.a + g.b * (mes - 1);
  const cy = g.yCabecalho + DY_LINHAS[linha] * g.b;
  return retangulo(cx - 0.5 * g.b + MARGEM * g.b, cy - MEIA_ALTURA * g.b, cx - MARGEM * g.b, cy + MEIA_ALTURA * g.b);
}
/** Rótulo do ano à esquerda de cada linha. */
export function caixaAno(g: Grade, linha: number): Caixa {
  const inicio = g.a - 0.5 * g.b;
  const cy = g.yCabecalho + DY_LINHAS[linha] * g.b;
  return retangulo(inicio - 0.47 * g.b, cy - MEIA_ALTURA * g.b, inicio - 0.01 * g.b, cy + MEIA_ALTURA * g.b);
}
/** Caixa de filtro do painel (fração do painel), a partir da grade. */
export function caixaNoPainel(g: Grade, [fx0, fy0, fx1, fy1]: Fracao): Caixa {
  const larg = g.b / COLUNA_POR_PAINEL;
  const alt = larg * ALTURA_POR_LARGURA;
  const x0 = g.a - JANEIRO_POR_PAINEL * larg;
  const y0 = g.yCabecalho + DY_LINHAS[0] * g.b - LINHA0_POR_ALTURA * alt;
  return retangulo(x0 + fx0 * larg, y0 + fy0 * alt, x0 + fx1 * larg, y0 + fy1 * alt);
}
/** Ampliação do recorte: as tentativas foram calibradas com a coluna de 149,6 px. */
export const ampliacao = (escala: number, g: Grade) => (escala * COLUNA_REFERENCIA) / g.b;

/** Tentativas de leitura de cada célula (modo do recorte, ampliação, limiar do preto e branco, modo de página). */
export type Tentativa = { modo: 'pb' | 'cinza'; escala: number; limiar: number; psm: string };
const pb = (escala: number, limiar: number, psm: string): Tentativa => ({ modo: 'pb', escala, limiar, psm });
const cinza = (escala: number, psm: string): Tentativa => ({ modo: 'cinza', escala, limiar: 0, psm });
/** Print grande (coluna ≥ 120 px): preto e branco. 24 painéis reais: 95/96 no recorte e na tela cheia, 92/96 com zoom. */
export const TENTATIVAS_GRANDE: readonly Tentativa[] = [pb(4, 110, '7'), pb(4, 110, '8'), pb(5, 90, '7'), pb(3, 130, '7'), pb(4, 110, '10')];
/** Print menor (notebook, coluna 80–120 px): cinza primeiro. Nos mesmos painéis a 72%: 93/96; a 60%: 84/96. */
export const TENTATIVAS_PEQUENO: readonly Tentativa[] = [cinza(4, '7'), cinza(4, '8'), pb(4, 110, '7'), cinza(6, '7'), pb(5, 90, '7')];
export const COLUNA_PEQUENA = 120;
export const tentativasPara = (g: Grade) => (g.b < COLUNA_PEQUENA ? TENTATIVAS_PEQUENO : TENTATIVAS_GRANDE);

export function numeroLido(texto: string): number | null {
  const t = texto.trim();
  return /^\d{1,5}$/.test(t) ? Number(t) : null;
}

/** As 2 primeiras leituras iguais bastam; senão vale a maioria das 5 (≥3 = certo; menos = "confira"). */
export function precisaMaisTentativas(primeiras: (number | null)[]): boolean {
  return !(primeiras.length >= 2 && primeiras[0] !== null && primeiras[0] === primeiras[1]);
}
export function votar(leituras: (number | null)[]): ValorLido | null {
  const conta = new Map<number, number>();
  for (const v of leituras) if (v !== null) conta.set(v, (conta.get(v) ?? 0) + 1);
  if (!conta.size) return null;
  const [valor, n] = [...conta.entries()].sort((a, b) => b[1] - a[1])[0];
  const certo = leituras.length === 2 ? n === 2 : n >= 3;
  return { valor, confira: !certo };
}

/** Anos das 3 linhas: os lidos completam os outros (são seguidos); nada lido = os 3 anos até o do RAC. */
export function anosDasLinhas(textos: string[], anoRac: number): number[] {
  for (let i = 0; i < textos.length; i++) {
    const m = /20\d\d/.exec(textos[i]);
    if (m) {
      const base = Number(m[0]) - i;
      return [0, 1, 2].map((k) => base + k);
    }
  }
  return [anoRac - 2, anoRac - 1, anoRac];
}

/** Células a ler para o mês de referência: [ano, mês] de cada coluna do RAC. */
export function celulasDoMes(mes: string): Record<ColunaLida, [number, number]> {
  const m = mesesDoRac(mes);
  const par = (x: string): [number, number] => [Number(x.slice(0, 4)), Number(x.slice(5, 7))];
  return { anoAnterior: par(m.anoAnterior), mesRetrasado: par(m.mesRetrasado), mesAnterior: par(m.mesAnterior), atual: par(m.atual) };
}

/** "13Cia" (o "ª" costuma sair como 2 ou 3) -> '1cia'. */
export function ciaDoTexto(texto: string): string | null {
  const m = /([1-6])\S{0,3}cia/i.exec(texto.replace(/\s/g, ''));
  return m ? `${m[1]}cia` : null;
}
export function delitoDoTexto(texto: string): DelitoId | null {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const roubo = t.includes('ROUBO');
  const furto = t.includes('FURTO');
  if (roubo === furto) return null;
  if (/VEIC/.test(t)) return roubo ? 'rouboVeiculo' : 'furtoVeiculo';
  if (/OUTRO/.test(t)) return roubo ? 'rouboOutros' : 'furtosOutros';
  return null;
}

/** Deixa os pixels RGBA em cinza pelo canal mais claro ("max": números coloridos) ou mais escuro ("min": texto branco no cinza). */
export function canalUnico(rgba: Uint8ClampedArray, canal: 'max' | 'min'): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const v = canal === 'max' ? Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) : Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
    rgba[i + 3] = 255;
  }
}

/** Cinza -> texto preto em fundo branco: acima do limiar vira preto. */
export function binarizar(rgba: Uint8ClampedArray, limiar: number): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const cor = rgba[i] > limiar ? 0 : 255;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = cor;
    rgba[i + 3] = 255;
  }
}

/** Canal mais claro, contraste esticado (o mais escuro vira 0 e o mais claro 255) e invertido: texto escuro no claro, sem perder o contorno. */
export function cinzaInvertido(rgba: Uint8ClampedArray): void {
  canalUnico(rgba, 'max');
  let min = 255;
  let max = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    min = Math.min(min, rgba[i]);
    max = Math.max(max, rgba[i]);
  }
  const faixa = max - min || 1;
  for (let i = 0; i < rgba.length; i += 4) rgba[i] = rgba[i + 1] = rgba[i + 2] = 255 - Math.round(((rgba[i] - min) * 255) / faixa);
}

// ---------- uso no RAC ----------

const rotuloDelito = (id: DelitoId) => DELITOS.find((c) => c.id === id)!.rotulo;
const COLUNAS: ColunaLida[] = ['anoAnterior', 'mesRetrasado', 'mesAnterior', 'atual'];
const mesDaColuna = (mes: string, c: ColunaLida) => rotuloCurto(mesesDoRac(mes)[c]);

/** Completa os campos ainda vazios do crime com o que foi lido no print (não troca o que foi digitado). */
export function preencherDoPrint(d: RacDados, delito: DelitoId, l: LeituraPainel): RacDados {
  const n = structuredClone(d);
  const linha: LinhaCrime = n.crimes[delito];
  for (const c of COLUNAS) if (linha[c] === null && l.valores[c]) linha[c] = l.valores[c]!.valor;
  return n;
}

export type PrintSalvo = { slot: SlotPrint; leitura: LeituraPainel | null };

/**
 * Erro: falta print. Avisos (com justificativa): print de outra Cia ou de outro indicador e número
 * digitado diferente do que aparece no print.
 */
export function conferirPrints(d: RacDados, prints: readonly PrintSalvo[]): Alerta[] {
  const out: Alerta[] = [];
  const slots = slotsDaUnidade(d.unidade);
  for (const s of slots)
    if (!prints.some((p) => p.slot === s.id))
      out.push({ id: `prints.${s.id}`, nivel: 'erro', campo: `prints.${s.id}`, mensagem: `Envie o print: ${s.rotulo}.` });

  const outraCia: string[] = [];
  const outroIndicador: string[] = [];
  const diferentes: string[] = [];
  let campoDif = '';
  for (const s of slots) {
    const l = prints.find((p) => p.slot === s.id)?.leitura;
    if (!l || s.tipo !== 'painel') continue;
    if (l.companhia && l.companhia !== d.unidade) outraCia.push(`${s.rotulo} (lido: ${l.companhia.replace('cia', 'ª Cia')})`);
    if (l.delito && l.delito !== s.delito) outroIndicador.push(`${s.rotulo} (lido: ${rotuloDelito(l.delito)})`);
    for (const c of COLUNAS) {
      const lido = l.valores[c];
      const digitado = d.crimes[s.delito][c];
      if (!lido || digitado === null || digitado === lido.valor) continue;
      const nosso = d.unidade === 'btl' ? 'soma das Cias' : 'digitado';
      diferentes.push(`${rotuloDelito(s.delito)} ${mesDaColuna(d.mes, c)}: ${nosso} ${digitado}, no print ${lido.valor}${lido.confira ? ' (leitura incerta)' : ''}`);
      if (!campoDif) campoDif = `crimes.${s.delito}.${c}`;
    }
  }
  if (outraCia.length)
    out.push({ id: 'printOutraCia', nivel: 'aviso', campo: 'prints', mensagem: `Print que parece ser de outra Cia — ${outraCia.join('; ')}.` });
  if (outroIndicador.length)
    out.push({ id: 'printOutroIndicador', nivel: 'aviso', campo: 'prints', mensagem: `Print que parece ser de outro indicador — ${outroIndicador.join('; ')}.` });
  if (diferentes.length)
    out.push({ id: 'printDivergente', nivel: 'aviso', campo: campoDif, mensagem: `Número diferente do print — ${diferentes.join('; ')}.` });
  return out;
}

/** Mensagem que diz por que o print não foi (em vez de uma mensagem genérica). */
export function motivoDoErroDoPrint(etapa: 'preparar' | 'enviar', e: unknown): string {
  if (etapa === 'preparar') return 'Esse arquivo não abriu como imagem. Escolha o print (PNG ou JPG) e tente de novo.';
  const codigo = (e as { code?: string } | null)?.code ?? '';
  if (codigo.includes('permission-denied'))
    return 'O banco recusou o print: o RAC deste mês pode ter sido encerrado ou as regras do portal ainda não foram publicadas. Avise a P/3.';
  if (codigo.includes('unavailable') || codigo.includes('deadline-exceeded')) return 'Sem conexão com o portal agora. Tente de novo em instantes.';
  return `Não foi possível enviar o print (${codigo || 'erro desconhecido'}). Tente de novo; se repetir, avise a P/3.`;
}
