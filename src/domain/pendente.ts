import { ehDataISO } from './datas';
import type { DadosDemanda } from './demanda';
import { TAMANHO_MAXIMO_PDF, type ArquivoRef } from './icc';
import type { Origem } from './listas';

// Aba "Demandas Pendentes": o que chegou para a P/3 e ainda não ganhou número no Numerador.
// E-mail: o Apps Script traz os encaminhados pela caixa funcional. SEI e Ordem Verbal: a P/3 lança.

export type TipoPendente = 'email' | 'sei' | 'ordem_verbal';
export type StatusPendente = 'pendente' | 'destinada' | 'descartada';

export type Anexo = { nome: string; url: string };

export type Pendente = {
  id: string;
  tipo: TipoPendente;
  status: StatusPendente;
  dataEntrada: string;
  /** ISO; ordena a lista (o mais novo em cima). */
  recebidoEm: string;
  assunto: string;
  texto: string;
  /** E-mail: quem mandou o original. */
  remetente?: string;
  linkGmail?: string;
  anexos?: Anexo[];
  /** SEI */
  numeroSei?: string;
  /** Ordem Verbal */
  quemOrdenou?: string;
  /** SEI / Ordem Verbal: PDF do ofício ou da demanda (guardado no banco; apagado ao finalizar a demanda). */
  arquivo?: ArquivoRef;
  /** Preenchido ao dar destino. */
  numeroDemanda?: number;
  motivoDescarte?: string;
};

/** O tipo da pendente é a "Origem" da demanda no Numerador. */
export const ORIGEM_DO_TIPO: Record<TipoPendente, Origem> = {
  email: 'E-mail',
  sei: 'SEI',
  ordem_verbal: 'Ordem Verbal',
};

export type TipoManual = Exclude<TipoPendente, 'email'>;

export type DadosPendenteManual = {
  tipo: TipoManual;
  dataEntrada: string;
  texto: string;
  numeroSei: string;
  quemOrdenou: string;
};

export type ErrosPendente = Partial<Record<keyof DadosPendenteManual, string>>;

export function pendenteManualVazia(tipo: TipoManual, hoje: string): DadosPendenteManual {
  return { tipo, dataEntrada: hoje, texto: '', numeroSei: '', quemOrdenou: '' };
}

export function validarPendente(d: DadosPendenteManual): ErrosPendente {
  const erros: ErrosPendente = {};
  if (!ehDataISO(d.dataEntrada)) erros.dataEntrada = 'Informe a data de entrada.';
  if (!d.texto.trim()) erros.texto = d.tipo === 'sei' ? 'Cole o texto da demanda.' : 'Escreva qual é a ordem.';
  if (d.tipo === 'ordem_verbal' && !d.quemOrdenou.trim()) erros.quemOrdenou = 'Informe quem deu a ordem.';
  return erros;
}

/** PDF opcional da pendente: só PDF, até 10 MB. Sem arquivo, sem erro. */
export function erroDoPdf(arquivo?: { name: string; size: number; type: string } | null): string {
  if (!arquivo) return '';
  if (arquivo.type !== 'application/pdf' && !arquivo.name.toLowerCase().endsWith('.pdf')) return 'O arquivo precisa ser PDF.';
  if (arquivo.size > TAMANHO_MAXIMO_PDF) return 'O PDF pode ter no máximo 10 MB.';
  return '';
}

const LIMITE_ASSUNTO = 120;

/** Primeira linha com texto, cortada: vira o assunto da pendente e o resumo da demanda. */
export function resumoDoTexto(texto: string): string {
  const linha = texto.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
  return linha.length > LIMITE_ASSUNTO ? `${linha.slice(0, LIMITE_ASSUNTO - 1).trimEnd()}…` : linha;
}

/** O que é gravado no banco para SEI / Ordem Verbal (sem status e datas do servidor). */
export function montarPendenteManual(
  d: DadosPendenteManual,
  agora: Date,
  arquivo?: ArquivoRef,
): Omit<Pendente, 'id' | 'status'> {
  const texto = d.texto.trim();
  return {
    tipo: d.tipo,
    dataEntrada: d.dataEntrada,
    recebidoEm: agora.toISOString(),
    assunto: resumoDoTexto(texto),
    texto,
    ...(d.tipo === 'sei' ? { numeroSei: d.numeroSei.trim() } : { quemOrdenou: d.quemOrdenou.trim() }),
    ...(arquivo ? { arquivo } : {}),
  };
}

/** Linha de detalhe do cartão: quem mandou / nº SEI / quem ordenou. */
export function detalheDaPendente(p: Pendente): string {
  if (p.tipo === 'email') return p.remetente ? `De: ${p.remetente}` : '';
  if (p.tipo === 'sei') return p.numeroSei ? `SEI nº ${p.numeroSei}` : '';
  return p.quemOrdenou ? `Ordem de: ${p.quemOrdenou}` : '';
}

/**
 * Nº da mensagem do CPA/M-11 no corpo do e-mail, ex.: "MENSAGEM Nº CPAM11-1364/30/26, de 12NOV26".
 * Pega a primeira (a mais recente, num encaminhamento) e devolve nesse formato; sem mensagem, ''.
 */
export function numeroMensagemCpa(texto: string): string {
  const m = /MENSAGEM\s+N\s*\.?\s*[º°o]?\s*\.?[\s*:]*(CPA\s*\/?\s*M\s*-?\s*11\s*-\s*[A-Z0-9]+(?:[/.-][A-Z0-9]+)*)(?:[\s*]*,?[\s*]*de\s+(\d{1,2}\s*[A-Z]{3}\s*\d{2,4}))?/i.exec(
    texto ?? '',
  );
  if (!m) return '';
  const numero = m[1].replace(/\s+/g, '').toUpperCase();
  const data = m[2] ? `, de ${m[2].replace(/\s+/g, '').toUpperCase()}` : '';
  return `MENSAGEM Nº ${numero}${data}`;
}

/** Nº da origem de um e-mail: a mensagem do CPA/M-11 (se vier no corpo) ou quem mandou. */
export function numeroOrigemDoEmail(p: Pick<Pendente, 'texto' | 'remetente'>): string {
  return numeroMensagemCpa(p.texto) || (p.remetente ?? '').trim();
}

/** "Dar destino": a demanda nova já vem com a entrada preenchida a partir da pendente. */
export function demandaDaPendente(p: Pendente, base: DadosDemanda): DadosDemanda {
  const numeroOrigem =
    p.tipo === 'sei' ? (p.numeroSei ?? '') : p.tipo === 'email' ? numeroOrigemDoEmail(p) || base.numeroOrigem : base.numeroOrigem;
  return {
    ...base,
    dataEntrada: ehDataISO(p.dataEntrada) ? p.dataEntrada : base.dataEntrada,
    origem: ORIGEM_DO_TIPO[p.tipo],
    numeroOrigem,
    quemOrdenou: p.tipo === 'ordem_verbal' ? (p.quemOrdenou ?? '').trim() : '',
    saida: p.assunto === '(sem assunto)' ? '' : p.assunto,
  };
}

/** Mais nova em cima. */
export function ordenarPendentes<T extends Pick<Pendente, 'recebidoEm'>>(lista: T[]): T[] {
  return [...lista].sort((a, b) => String(b.recebidoEm).localeCompare(String(a.recebidoEm)));
}

export function filtrarPendentes<T extends Pendente>(lista: T[], texto: string): T[] {
  const busca = texto.trim().toLowerCase();
  if (!busca) return lista;
  return lista.filter((p) =>
    [p.assunto, p.texto, p.remetente, p.numeroSei, p.quemOrdenou, ORIGEM_DO_TIPO[p.tipo]]
      .filter(Boolean)
      .some((c) => String(c).toLowerCase().includes(busca)),
  );
}
