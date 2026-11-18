import type { UnidadeId } from './unidades';
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

export const slotsDaUnidade = (u: UnidadeRac) => (temCrimes(u) && u !== 'btl' ? SLOTS_PRINT : []);
export const idPrint = (mes: string, u: UnidadeId, slot: SlotPrint) => `${idRac(mes, u)}_${slot}`;

// ---------- leitura ----------

export type ColunaLida = 'anoAnterior' | 'mesRetrasado' | 'mesAnterior' | 'atual';
export type ValorLido = { valor: number; confira: boolean };
export type LeituraPainel = {
  companhia: string | null; // '1cia'…'6cia' lido no filtro do painel
  delito: DelitoId | null; // indicador lido no filtro do painel
  valores: Partial<Record<ColunaLida, ValorLido>>;
};

export type Caixa = { x: number; y: number; largura: number; altura: number };
type Fracao = [number, number, number, number]; // x0, y0, x1, y1 em fração da imagem

export const GRADE = { x0: 0.0408, meiaColuna: 0.04022, linhas: [0.903, 0.931, 0.957], meiaAltura: 0.009, margem: 0.005 };
export const FILTRO_COMPANHIA: Fracao = [0.267, 0.254, 0.36, 0.272];
export const FILTRO_INDICADOR: Fracao = [0.393, 0.254, 0.49, 0.272];

/** O painel tem proporção fixa (~2,4 : 1). Outro formato: não lê (a Cia digita). */
export const ehPainelPadrao = (largura: number, altura: number) => altura > 0 && largura / altura >= 2.2 && largura / altura <= 2.65;

function caixa(largura: number, altura: number, [x0, y0, x1, y1]: Fracao): Caixa {
  const x = Math.round(largura * x0);
  const y = Math.round(altura * y0);
  return { x, y, largura: Math.round(largura * x1) - x, altura: Math.round(altura * y1) - y };
}
export const caixaFiltro = (largura: number, altura: number, f: Fracao) => caixa(largura, altura, f);

/** Célula do valor (metade esquerda da coluna do mês) numa das 3 linhas de anos. */
export function caixaCelula(largura: number, altura: number, mes: number, linha: number): Caixa {
  const g = GRADE;
  const xa = g.x0 + (mes - 1) * 2 * g.meiaColuna;
  const y = g.linhas[linha];
  return caixa(largura, altura, [xa + g.margem, y - g.meiaAltura, xa + g.meiaColuna - g.margem, y + g.meiaAltura]);
}
/** Rótulo do ano à esquerda de cada linha. */
export function caixaAno(largura: number, altura: number, linha: number): Caixa {
  const y = GRADE.linhas[linha];
  return caixa(largura, altura, [0.003, y - GRADE.meiaAltura, GRADE.x0 - 0.001, y + GRADE.meiaAltura]);
}

/** Tentativas de leitura de cada célula: [escala, limiar, modo de página do Tesseract]. */
export const TENTATIVAS: readonly [number, number, string][] = [
  [4, 110, '7'],
  [4, 110, '8'],
  [5, 90, '7'],
  [3, 130, '7'],
  [4, 110, '10'],
];

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

/** Pixels RGBA -> texto preto em fundo branco: canal "max" para números claros/coloridos no fundo escuro,
 *  "min" para o texto branco das caixas de filtro (cinza). */
export function binarizar(rgba: Uint8ClampedArray, canal: 'max' | 'min', limiar: number): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const v = canal === 'max' ? Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) : Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
    const cor = v > limiar ? 0 : 255;
    rgba[i] = rgba[i + 1] = rgba[i + 2] = cor;
    rgba[i + 3] = 255;
  }
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
      diferentes.push(`${rotuloDelito(s.delito)} ${mesDaColuna(d.mes, c)}: digitado ${digitado}, no print ${lido.valor}${lido.confira ? ' (leitura incerta)' : ''}`);
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
