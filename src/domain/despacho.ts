// Despacho do CGP: dentro da missão, o CGP registra o que foi feito, assina com o dedo e a Cia baixa em PDF.
//
//   Em 24NOV26
//   Do CGP 1 Pel <pelotão>
//   Ao Sr. Cmt 1ª Cia.
//   <o que foi feito>
//   2º Sgt PM 144602-9 Sousa   (quem está logado)  + assinatura
import { ehDataISO } from './datas';
import { UNIDADES, type UnidadeId } from './unidades';

export const COLECAO_DESPACHOS_CGP = 'despachosCgp';

export const LIMITE_TEXTO_DESPACHO = 4000;
export const LIMITE_PELOTAO_DESPACHO = 30;
export const LIMITE_ASSINANTE_DESPACHO = 120;
/** A assinatura vai como PNG (data URL); o traço do dedo, reduzido, fica bem abaixo disso. */
export const LIMITE_ASSINATURA_DESPACHO = 200_000;

export type DespachoCgp = {
  id: string;
  unidadeId: UnidadeId;
  missaoId: string;
  /** Nº e título da missão, para o PDF e a lista. */
  numero: string;
  titulo: string;
  /** Dia do despacho (AAAA-MM-DD). */
  data: string;
  pelotao: string;
  texto: string;
  /** "2º Sgt PM 144602-9 Sousa". */
  assinante: string;
  /** PNG em data URL. */
  assinatura: string;
  criadoPor: string;
  criadoEm: Date | null;
};

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/** '2026-11-24' -> '24NOV26'. */
export function dataMilitar(iso: string): string {
  if (!ehDataISO(iso)) return '';
  return `${iso.slice(8, 10)}${MESES[Number(iso.slice(5, 7)) - 1]}${iso.slice(2, 4)}`;
}

/** 1ª CIA -> "1"; Força Tática -> "FT" (para "Do CGP 1"). */
export function numeroDoCgp(unidade: UnidadeId): string {
  return unidade === 'ft' ? 'FT' : unidade.replace('cia', '');
}

/** "1ª Cia" / "Cia FT" (para "Ao Sr. Cmt 1ª Cia."). */
export function nomeDaCia(unidade: UnidadeId): string {
  if (unidade === 'ft') return 'Cia FT';
  return (UNIDADES.find((u) => u.id === unidade)?.sigla ?? unidade).replace('CIA', 'Cia');
}

/** As três linhas do cabeçalho, com o pelotão como foi digitado. */
export function cabecalhoDespacho(unidade: UnidadeId, data: string, pelotao: string): [string, string, string] {
  return [`Em ${dataMilitar(data)}`, `Do CGP ${numeroDoCgp(unidade)} Pel ${pelotao.trim()}`.trimEnd(), `Ao Sr. Cmt ${nomeDaCia(unidade)}.`];
}

/** RE com dígito: '1446029' -> '144602-9'; '144602-9' fica; sem dígito, como veio. */
export function reComDigito(re: string): string {
  const n = String(re ?? '').replace(/\D/g, '');
  return n.length === 7 ? `${n.slice(0, 6)}-${n.slice(6)}` : String(re ?? '').trim();
}

/** "2º Sgt PM 144602-9 Sousa". */
export function linhaAssinante(p: { posto?: string; re?: string; nomeGuerra?: string }): string {
  return [p.posto, p.re ? reComDigito(p.re) : '', p.nomeGuerra].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ');
}

export type ErrosDespacho = Partial<Record<'pelotao' | 'texto' | 'assinante' | 'assinatura', string>>;

export function validarDespacho(d: { pelotao: string; texto: string; assinante: string; assinatura: string }): ErrosDespacho {
  const e: ErrosDespacho = {};
  if (!d.pelotao.trim()) e.pelotao = 'Escreva o seu pelotão.';
  else if (d.pelotao.trim().length > LIMITE_PELOTAO_DESPACHO) e.pelotao = `Até ${LIMITE_PELOTAO_DESPACHO} caracteres.`;
  if (!d.texto.trim()) e.texto = 'Escreva o que foi feito.';
  else if (d.texto.length > LIMITE_TEXTO_DESPACHO) e.texto = `Até ${LIMITE_TEXTO_DESPACHO} caracteres.`;
  if (!d.assinante.trim()) e.assinante = 'Informe posto/graduação, RE e nome.';
  else if (d.assinante.length > LIMITE_ASSINANTE_DESPACHO) e.assinante = `Até ${LIMITE_ASSINANTE_DESPACHO} caracteres.`;
  if (!d.assinatura.startsWith('data:image/png;base64,')) e.assinatura = 'Assine no quadro com o dedo.';
  else if (d.assinatura.length > LIMITE_ASSINATURA_DESPACHO) e.assinatura = 'Assinatura grande demais: limpe e assine de novo.';
  return e;
}

/** "Despacho CGP 1 - 8BPMM-012-303-26 - 24NOV26.pdf" (sem caracteres que o Windows recusa). */
export function nomeArquivoDespacho(d: Pick<DespachoCgp, 'unidadeId' | 'numero' | 'data'>): string {
  return `Despacho CGP ${numeroDoCgp(d.unidadeId)} - ${d.numero} - ${dataMilitar(d.data)}.pdf`.replace(/[\\/:*?"<>|]/g, '-');
}
