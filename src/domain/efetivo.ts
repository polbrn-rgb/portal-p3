import { ehDataISO } from './datas';
import { UNIDADES, type UnidadeId } from './unidades';

// Solicitação de efetivo: a P/3 pede às Cias quantos policiais de cada posto/graduação,
// e cada Cia informa quem vai, pelo RE (o banco de efetivo completa posto, nome de guerra e telefone).

/** Ordem hierárquica. */
export const POSTOS = [
  { id: 'cap', rotulo: 'Cap PM' },
  { id: 'ten', rotulo: 'Ten PM' },
  { id: 'subsgt', rotulo: 'Sub/Sgt PM' },
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
  return { cap: 0, ten: 0, subsgt: 0, cbsd: 0 };
}

export function totalDe(q: Partial<Quantidades> | undefined): number {
  return POSTOS.reduce((t, p) => t + (Number(q?.[p.id]) || 0), 0);
}

/** RE com ou sem dígito ("123456-7", "1234567", "123456") -> "123456". */
export function normalizarRE(re: string): string {
  const numeros = String(re ?? '').replace(/\D/g, '');
  return numeros.length > 6 ? numeros.slice(0, 6) : numeros;
}

/** "Subten PM" e "1º Sgt PM" -> subsgt; "Cb PM" -> cbsd; Maj/Ten Cel/Cel -> outro (acima de Cap). */
export function categoriaDoPosto(posto: string): PostoId | 'outro' {
  const p = String(posto ?? '').toLowerCase();
  if (/subten/.test(p)) return 'subsgt';
  if (/ten\.?\s*cel|\bcel\b|\bmaj/.test(p)) return 'outro';
  if (/\bcap/.test(p)) return 'cap';
  if (/\bten|\basp/.test(p)) return 'ten';
  if (/sgt|sarg/.test(p)) return 'subsgt';
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

// ---------- P/3 edita a solicitação depois de enviada ----------

export type PlanoEdicao = {
  criar: UnidadeId[];
  /** reabrir: a Cia já tinha respondido, mas mudou o que ela precisa mandar (volta a ficar pendente para ela). */
  atualizar: { id: string; unidadeId: UnidadeId; reabrir: boolean }[];
  apagar: { id: string; unidadeId: UnidadeId; tinhaEfetivo: boolean }[];
};

function mesmasQuantidades(a: Partial<Quantidades> | undefined, b: Partial<Quantidades> | undefined): boolean {
  return POSTOS.every((p) => (Number(a?.[p.id]) || 0) === (Number(b?.[p.id]) || 0));
}

/** O que muda nas solicitações já enviadas quando a P/3 salva o pedido editado. */
export function planejarEdicao(existentes: SolicitacaoEfetivo[], pedido: PedidoEfetivo): PlanoEdicao {
  const novas = ciasDoPedido(pedido);
  const plano: PlanoEdicao = { criar: [], atualizar: [], apagar: [] };
  for (const s of existentes) {
    if (!novas.includes(s.unidadeId)) {
      plano.apagar.push({ id: s.id, unidadeId: s.unidadeId, tinhaEfetivo: s.policiais.length > 0 });
      continue;
    }
    const campoNovo = pedido.campos.some((c) => !s.campos.includes(c));
    const mudouQtd = !mesmasQuantidades(s.quantidades, pedido.quantidades[s.unidadeId]);
    plano.atualizar.push({ id: s.id, unidadeId: s.unidadeId, reabrir: s.status === 'respondida' && (campoNovo || mudouQtd) });
  }
  for (const cia of novas) if (!existentes.some((s) => s.unidadeId === cia)) plano.criar.push(cia);
  return plano;
}

// ---------- Planilha (Excel) do efetivo que as Cias mandaram ----------

function ordemCia(id: UnidadeId): number {
  return UNIDADES.findIndex((u) => u.id === id);
}

function ordemPosto(posto: string): number {
  const c = categoriaDoPosto(posto);
  return c === 'outro' ? -1 : POSTOS.findIndex((p) => p.id === c);
}

/** Abas "Efetivo" (um policial por linha) e "Resumo" (por Cia), na ordem das Cias e da hierarquia. */
export function planilhaDoEfetivo(
  solicitacoes: SolicitacaoEfetivo[],
  pedido: Pick<PedidoEfetivo, 'campos'>,
  hoje: string,
): { nome: string; linhas: (string | number)[][] }[] {
  const lista = [...solicitacoes].sort((a, b) => ordemCia(a.unidadeId) - ordemCia(b.unidadeId));
  const extras = CAMPOS_EXTRAS.filter((c) => pedido.campos.includes(c.id));
  const sigla = (id: UnidadeId) => UNIDADES.find((u) => u.id === id)?.sigla ?? id;

  const efetivo: (string | number)[][] = [
    ['Cia', 'Posto/Graduação', 'RE', 'Nome de guerra', 'Telefone', ...extras.map((c) => c.rotulo), 'Enviado por'],
  ];
  for (const s of lista) {
    const policiais = [...s.policiais].sort((a, b) => ordemPosto(a.posto) - ordemPosto(b.posto));
    for (const p of policiais) {
      efetivo.push([sigla(s.unidadeId), p.posto, p.re, p.nomeGuerra, p.telefone, ...extras.map((c) => p.extras[c.id] ?? ''), s.respondidoPor ?? '']);
    }
  }

  const resumo: (string | number)[][] = [['Cia', 'Situação', 'Pedidos', 'Enviados', 'Faltam', 'Enviado por']];
  for (const s of lista) {
    const pedidos = totalDe(s.quantidades);
    resumo.push([
      sigla(s.unidadeId),
      ROTULO_SITUACAO[situacaoSolicitacao(s, hoje)],
      pedidos,
      s.policiais.length,
      Math.max(0, pedidos - s.policiais.length),
      s.respondidoPor ?? '',
    ]);
  }
  return [
    { nome: 'Efetivo', linhas: efetivo },
    { nome: 'Resumo', linhas: resumo },
  ];
}

// ---------- Erros campo a campo (a tela marca de vermelho e rola até o primeiro) ----------

export type ErrosPolicial = { re?: string; posto?: string; nomeGuerra?: string; extras: Partial<Record<CampoExtra, string>> };

export function errosPolicialEscalado(p: PolicialEscalado, campos: CampoExtra[]): ErrosPolicial {
  const e: ErrosPolicial = { extras: {} };
  if (normalizarRE(p.re).length < 5) e.re = 'Informe o RE.';
  else {
    if (!p.posto.trim()) e.posto = 'Informe o posto/graduação.';
    if (!p.nomeGuerra.trim()) e.nomeGuerra = 'Informe o nome de guerra.';
  }
  for (const c of CAMPOS_EXTRAS) {
    if (campos.includes(c.id) && !(p.extras[c.id] ?? '').trim()) e.extras[c.id] = `Preencha: ${c.rotulo}.`;
  }
  return e;
}

export function temErroPolicial(e: ErrosPolicial): boolean {
  return Boolean(e.re || e.posto || e.nomeGuerra || Object.keys(e.extras).length);
}

export type ErrosResposta = { policiais?: string; nome?: string };

export function errosResposta(policiais: PolicialEscalado[], respondidoPor: string): ErrosResposta {
  const e: ErrosResposta = {};
  if (!policiais.length) e.policiais = 'Adicione pelo menos um policial.';
  if (!respondidoPor.trim()) e.nome = 'Informe quem está enviando (posto/graduação e nome).';
  return e;
}
