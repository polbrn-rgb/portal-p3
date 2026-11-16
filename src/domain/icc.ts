import { ehDataISO, hojeISO } from './datas';
import type { UnidadeId } from './unidades';

// Aperfeiçoamento → ICC: a P/3 publica a ordem (PDF) e as Cias informam quantos PM participaram,
// por graduação, até o prazo (padrão: dia 15). O motor cria a planilha "ICC nº" e grava a coluna de cada Cia.

export const GRADUACOES_ICC = [
  { id: 'oficiais', rotulo: 'Oficiais' },
  { id: 'sargentos', rotulo: 'Subten e Sgt' },
  { id: 'cabos', rotulo: 'Cb e Sd' },
] as const;

export type GraduacaoIcc = (typeof GRADUACOES_ICC)[number]['id'];
export type QuantidadesIcc = Record<GraduacaoIcc, number>;

export type ArquivoRef = { id: string; nome: string; tamanho: number };

export type Icc = {
  id: string;
  numero: string;
  prazo: string;
  status: 'aberta' | 'encerrada';
  arquivo: ArquivoRef;
  planilha?: { status: 'pedida' | 'pronta' | 'erro'; id?: string; url?: string; erro?: string };
};

export type RespostaIcc = QuantidadesIcc & {
  id: string;
  iccId: string;
  unidadeId: UnidadeId;
  respondidoPor: string;
  gravado: boolean;
  erro?: string;
};

export type DadosIcc = { numero: string; prazo: string };
export type ErrosIcc = Partial<Record<'numero' | 'prazo' | 'arquivo', string>>;

export const TAMANHO_MAXIMO_PDF = 10 * 1024 * 1024;

/** Prazo padrão: dia 15 deste mês; passado o dia 15, o do mês seguinte. */
export function prazoPadraoIcc(hoje = hojeISO()): string {
  const [a, m, d] = hoje.split('-').map(Number);
  if (d <= 15) return `${a}-${String(m).padStart(2, '0')}-15`;
  return m === 12 ? `${a + 1}-01-15` : `${a}-${String(m + 1).padStart(2, '0')}-15`;
}

export function validarIcc(d: DadosIcc, arquivo?: { name: string; size: number; type: string } | null): ErrosIcc {
  const e: ErrosIcc = {};
  if (!/^\d{1,6}$/.test(d.numero.trim())) e.numero = 'Informe o número da ICC (só números).';
  if (!ehDataISO(d.prazo)) e.prazo = 'Informe o prazo das Cias.';
  if (arquivo !== undefined) {
    if (!arquivo) e.arquivo = 'Escolha o PDF da ordem.';
    else if (arquivo.type !== 'application/pdf' && !arquivo.name.toLowerCase().endsWith('.pdf')) e.arquivo = 'O arquivo precisa ser PDF.';
    else if (arquivo.size > TAMANHO_MAXIMO_PDF) e.arquivo = 'O PDF pode ter no máximo 10 MB.';
  }
  return e;
}

export function idRespostaIcc(iccId: string, u: UnidadeId): string {
  return `${iccId}_${u}`;
}

export function lerQuantidadesIcc(rascunho: Partial<Record<GraduacaoIcc, string>>) {
  const valores = {} as QuantidadesIcc;
  const erros: Partial<Record<GraduacaoIcc, string>> = {};
  for (const g of GRADUACOES_ICC) {
    const t = (rascunho[g.id] ?? '').trim();
    const n = Number(t);
    if (t === '') erros[g.id] = 'Preencha (se não houve, coloque 0).';
    else if (!Number.isInteger(n) || n < 0) erros[g.id] = 'Número inteiro.';
    else valores[g.id] = n;
  }
  return { valores, erros };
}

export function totalIcc(q: Partial<QuantidadesIcc>): number {
  return GRADUACOES_ICC.reduce((s, g) => s + (Number(q[g.id]) || 0), 0);
}

export type SituacaoIcc = 'gravado' | 'enviado' | 'erro' | 'pendente' | 'atrasado';

export function situacaoRespostaIcc(r: RespostaIcc | undefined, prazo: string, hoje = hojeISO()): SituacaoIcc {
  if (r?.erro && !r.gravado) return 'erro';
  if (r?.gravado) return 'gravado';
  if (r) return 'enviado';
  return hoje > prazo ? 'atrasado' : 'pendente';
}

// ---------- Arquivo (PDF) guardado no banco em partes ----------

export const TAMANHO_PARTE = 700_000; // caracteres de base64 por documento (limite do Firestore: 1 MB)

export function dividirEmPartes(base64: string, tamanho = TAMANHO_PARTE): string[] {
  const partes: string[] = [];
  for (let i = 0; i < base64.length; i += tamanho) partes.push(base64.slice(i, i + tamanho));
  return partes.length ? partes : [''];
}
