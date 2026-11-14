import { ehDataISO } from './datas';
import { UNIDADES, type UnidadeId } from './unidades';

// Solicitação de efetivo: a P/3 pede às Cias quantos policiais de cada posto/graduação,
// e cada Cia informa quem vai, pelo RE (o banco de efetivo completa posto, nome de guerra e telefone).

/** Ordem hierárquica. */
export const POSTOS = [
  { id: 'cap', rotulo: 'Cap PM' },
  { id: 'ten', rotulo: 'Ten PM' },
  { id: 'subten', rotulo: 'Subten PM' },
  { id: 'sgt', rotulo: 'Sgt PM' },
  { id: 'cbsd', rotulo: 'Cb/Sd PM' },
] as const;

export type PostoId = (typeof POSTOS)[number]['id'];
export type Quantidades = Record<PostoId, number>;

/** Dados a mais que a P/3 pode pedir para cada policial. */
export const CAMPOS_EXTRAS = [
  { id: 'cpf', rotulo: 'CPF' },
  { id: 'vtr', rotulo: 'VTR (prefixo)' },
  { id: 'funcao', rotulo: 'Função' },
] as const;

export type CampoExtra = (typeof CAMPOS_EXTRAS)[number]['id'];

/** Como está no banco de efetivo (coleção "efetivo", id = RE sem dígito). */
export type Policial = { re: string; posto: string; nomeGuerra: string; telefone: string };

export type PolicialEscalado = Policial & { extras: Partial<Record<CampoExtra, string>> };

/** O que a P/3 preencheu no checklist (guardado em operacoes/{numero}.efetivo). */
export type PedidoEfetivo = {
  prazo: string;
  campos: CampoExtra[];
  quantidades: Partial<Record<UnidadeId, Quantidades>>;
  enviadaEm?: unknown;
};

export type StatusSolicitacao = 'enviada' | 'respondida';

/** Uma por Cia (coleção "solicitacoesEfetivo", id = numero_cia). */
export type SolicitacaoEfetivo = {
  id: string;
  numero: string;
  unidadeId: UnidadeId;
  saida: string;
  inicio: string;
  termino: string;
  prazo: string;
  quantidades: Quantidades;
  campos: CampoExtra[];
  status: StatusSolicitacao;
  policiais: PolicialEscalado[];
  respondidoPor?: string;
};

export function idSolicitacao(numero: string, unidade: UnidadeId): string {
  return `${numero}_${unidade}`;
}

export function quantidadesVazias(): Quantidades {
  return { cap: 0, ten: 0, subten: 0, sgt: 0, cbsd: 0 };
}

export function totalDe(q: Partial<Quantidades> | undefined): number {
  return POSTOS.reduce((t, p) => t + (Number(q?.[p.id]) || 0), 0);
}

/** RE com ou sem dígito ("123456-7", "1234567", "123456") -> "123456". */
export function normalizarRE(re: string): string {
  const numeros = String(re ?? '').replace(/\D/g, '');
  return numeros.length > 6 ? numeros.slice(0, 6) : numeros;
}

/** "1º Sgt PM" -> sgt; "Cb PM" -> cbsd; Maj/Ten Cel/Cel -> outro (acima de Cap). */
export function categoriaDoPosto(posto: string): PostoId | 'outro' {
  const p = String(posto ?? '').toLowerCase();
  if (/subten/.test(p)) return 'subten';
  if (/ten\.?\s*cel|\bcel\b|\bmaj/.test(p)) return 'outro';
  if (/\bcap/.test(p)) return 'cap';
  if (/\bten|\basp/.test(p)) return 'ten';
  if (/sgt|sarg/.test(p)) return 'sgt';
  if (/\bcb\b|\bsd\b|cabo|soldado/.test(p)) return 'cbsd';
  return 'outro';
}

export function contarPorPosto(policiais: Policial[]): Quantidades & { outro: number } {
  const c = { ...quantidadesVazias(), outro: 0 };
  for (const p of policiais) c[categoriaDoPosto(p.posto)]++;
  return c;
}

export type ErrosPedido = { prazo?: string; quantidades?: string };

export function validarPedido(p: PedidoEfetivo): ErrosPedido {
  const erros: ErrosPedido = {};
  if (!ehDataISO(p.prazo)) erros.prazo = 'Informe o prazo para as Cias preencherem.';
  if (!UNIDADES.some((u) => totalDe(p.quantidades[u.id]) > 0)) {
    erros.quantidades = 'Informe quantos policiais pelo menos uma Cia deve mandar.';
  }
  return erros;
}

/** Só as Cias com algum policial pedido recebem a solicitação. */
export function ciasDoPedido(p: PedidoEfetivo): UnidadeId[] {
  return UNIDADES.map((u) => u.id).filter((id) => totalDe(p.quantidades[id]) > 0);
}

export function validarPolicialEscalado(p: PolicialEscalado, campos: CampoExtra[]): string {
  if (normalizarRE(p.re).length < 5) return 'Informe o RE.';
  if (!p.posto.trim() || !p.nomeGuerra.trim()) return 'Informe posto/graduação e nome de guerra.';
  const faltando = CAMPOS_EXTRAS.filter((c) => campos.includes(c.id) && !(p.extras[c.id] ?? '').trim());
  return faltando.length ? `Preencha: ${faltando.map((c) => c.rotulo).join(', ')}.` : '';
}

export function validarResposta(policiais: PolicialEscalado[], respondidoPor: string): string {
  if (!policiais.length) return 'Adicione pelo menos um policial.';
  if (!respondidoPor.trim()) return 'Informe quem está enviando (posto/graduação e nome).';
  return '';
}

export type SituacaoSolicitacao = 'respondida' | 'atrasada' | 'aguardando';

export function situacaoSolicitacao(s: Pick<SolicitacaoEfetivo, 'status' | 'prazo'>, hoje: string): SituacaoSolicitacao {
  if (s.status === 'respondida') return 'respondida';
  return s.prazo && s.prazo < hoje ? 'atrasada' : 'aguardando';
}

export const ROTULO_SITUACAO: Record<SituacaoSolicitacao, string> = {
  respondida: 'Respondida',
  atrasada: 'Atrasada',
  aguardando: 'Aguardando',
};
