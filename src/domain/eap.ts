import { normalizarRE } from './efetivo';
import { UNIDADES, type UnidadeId } from './unidades';

// Aperfeiçoamento → EAP (Estágio de Atualização Profissional). A P/3 abre o EAP (meses, período EAD,
// turmas e vagas por Cia); cada Cia indica o efetivo de cada turma; o motor grava na cópia da planilha.

export type TipoTurma = 'cbsd' | 'sgt';
export type TurmaEap = { id: string; tipo: TipoTurma; numero: string; inicio: string; fim: string };

/** As turmas da planilha, na ordem em que aparecem nas abas das Cias. */
export const TURMAS_EAP: { id: string; tipo: TipoTurma; rotulo: string }[] = [
  { id: 'cbsd1', tipo: 'cbsd', rotulo: 'Cb/Sd · 1ª turma' },
  { id: 'cbsd2', tipo: 'cbsd', rotulo: 'Cb/Sd · 2ª turma' },
  { id: 'cbsd3', tipo: 'cbsd', rotulo: 'Cb/Sd · 3ª turma' },
  { id: 'sgt1', tipo: 'sgt', rotulo: 'Subten/Sgt · 1ª turma' },
  { id: 'sgt2', tipo: 'sgt', rotulo: 'Subten/Sgt · 2ª turma' },
];

/** Listas sem vaga definida (a Cia indica se tiver alguém). */
export const LISTAS_LIVRES_EAP = [
  { id: 'taf', rotulo: 'Somente TAF ou TAT', detalhe: 'Apresentação de acordo com a turma' },
  { id: 'restricao', rotulo: 'Restrição · somente fase EAD', detalhe: '' },
] as const;
export const MAX_LISTA_LIVRE = 20;

export const MESES_EAP = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export type VagasEap = Partial<Record<UnidadeId, Record<string, number>>>;

export type DadosEap = {
  ano: number;
  mesEad: number; // 1 a 12
  mesPresencial: number;
  eadInicio: string;
  eadFim: string;
  prazo: string;
  turmas: TurmaEap[];
  vagas: VagasEap;
};

export type Eap = DadosEap & {
  id: string;
  status: 'aberta' | 'encerrada';
  planilha?: { status: 'pedida' | 'pronta' | 'erro'; id?: string; url?: string; erro?: string; pedidaEm?: { toDate: () => Date } | null };
  compilado?: { status: 'pedido' | 'pronto' | 'erro'; registros?: number; erro?: string };
  criadoEm?: { toDate: () => Date } | null;
};

/** A cópia da planilha sai em até 5 minutos; passou de 15 (desde o último pedido), o motor provavelmente está com problema. */
export function planilhaAtrasada(e: Pick<Eap, 'planilha' | 'criadoEm'>, agora: Date): boolean {
  const criado = (e.planilha?.pedidaEm ?? e.criadoEm)?.toDate?.();
  return e.planilha?.status === 'pedida' && Boolean(criado) && agora.getTime() - criado!.getTime() > 15 * 60 * 1000;
}

export type PolicialEap = {
  re: string;
  grad: string;
  nomeCompleto: string;
  email: string;
  celular: string;
  ias: string;
  validadeIas: string;
  observacao: string;
};

export type ListaEap = { semEfetivo: boolean; policiais: PolicialEap[] };

export type RespostaEap = {
  id: string;
  eapId: string;
  unidadeId: UnidadeId;
  titulo: string;
  prazo: string;
  turmas: TurmaEap[];
  vagas: Record<string, number>;
  status: 'pendente' | 'enviada';
  encerrada: boolean;
  blocos: Record<string, ListaEap>;
  respondidoPor: string;
  gravado: boolean;
  erro?: string;
};

export function eapVazia(hoje: string): DadosEap {
  const [a, m] = hoje.split('-').map(Number);
  const proximo = m === 12 ? 1 : m + 1;
  return {
    ano: proximo === 1 ? a + 1 : a,
    mesEad: proximo,
    mesPresencial: proximo === 12 ? 1 : proximo + 1,
    eadInicio: '',
    eadFim: '',
    prazo: '',
    turmas: TURMAS_EAP.map((t) => ({ id: t.id, tipo: t.tipo, numero: '', inicio: '', fim: '' })),
    vagas: {},
  };
}

export function tituloEap(d: Pick<DadosEap, 'ano' | 'mesEad' | 'mesPresencial'>): string {
  return `EAP ${d.ano} · EAD em ${MESES_EAP[d.mesEad - 1]} · presencial em ${MESES_EAP[d.mesPresencial - 1]}`;
}

function dm(iso: string): string {
  const [, m, d] = iso.split('-');
  return d && m ? `${d}/${m}` : '';
}

/** "Cb/Sd · Turma 34 · 01/12 a 03/12" */
export function rotuloTurma(t: TurmaEap): string {
  return `${t.tipo === 'cbsd' ? 'Cb/Sd' : 'Subten/Sgt'} · Turma ${t.numero} · ${dm(t.inicio)} a ${dm(t.fim)}`;
}

export function totalVagasDaCia(vagas: Record<string, number> | undefined): number {
  return Object.values(vagas ?? {}).reduce((t, n) => t + (Number(n) || 0), 0);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Erros campo a campo do formulário da P/3 ('' = pode salvar). Chaves: campo, "turma.<id>.<campo>" ou "vagas". */
export function validarEap(d: DadosEap): Record<string, string> {
  const e: Record<string, string> = {};
  if (!(d.ano >= 2020 && d.ano <= 2100)) e.ano = 'Informe o ano.';
  if (!(d.mesEad >= 1 && d.mesEad <= 12)) e.mesEad = 'Escolha o mês do EAD.';
  if (!(d.mesPresencial >= 1 && d.mesPresencial <= 12)) e.mesPresencial = 'Escolha o mês do presencial.';
  if (!ISO.test(d.eadInicio)) e.eadInicio = 'Informe o início do EAD.';
  if (!ISO.test(d.eadFim)) e.eadFim = 'Informe o fim do EAD.';
  else if (ISO.test(d.eadInicio) && d.eadFim < d.eadInicio) e.eadFim = 'O fim não pode ser antes do início.';
  if (!ISO.test(d.prazo)) e.prazo = 'Informe o prazo para as Cias.';
  for (const t of d.turmas) {
    if (!t.numero.trim()) e[`turma.${t.id}.numero`] = 'Informe o nº da turma.';
    if (!ISO.test(t.inicio)) e[`turma.${t.id}.inicio`] = 'Informe o início.';
    if (!ISO.test(t.fim)) e[`turma.${t.id}.fim`] = 'Informe o fim.';
    else if (ISO.test(t.inicio) && t.fim < t.inicio) e[`turma.${t.id}.fim`] = 'O fim não pode ser antes do início.';
  }
  const total = UNIDADES.reduce((s, u) => s + totalVagasDaCia(d.vagas[u.id]), 0);
  if (!total) e.vagas = 'Defina pelo menos uma vaga.';
  return e;
}

export const policialEapVazio = (): PolicialEap => ({
  re: '',
  grad: '',
  nomeCompleto: '',
  email: '',
  celular: '',
  ias: '',
  validadeIas: '',
  observacao: '',
});

/** Obrigatórios do policial: RE, graduação e nome completo (o resto a Cia completa se tiver). */
export function errosPolicialEap(p: PolicialEap): Partial<Record<'re' | 'grad' | 'nomeCompleto' | 'validadeIas', string>> {
  const e: Partial<Record<'re' | 'grad' | 'nomeCompleto' | 'validadeIas', string>> = {};
  if (normalizarRE(p.re).length < 5) e.re = 'Informe o RE.';
  if (!p.grad.trim()) e.grad = 'Informe a graduação.';
  if (!p.nomeCompleto.trim()) e.nomeCompleto = 'Informe o nome completo.';
  if (p.validadeIas && !ISO.test(p.validadeIas)) e.validadeIas = 'Data inválida.';
  return e;
}

/** Erros ao enviar: cada turma com vaga precisa de policial ou "sem efetivo"; nunca mais que as vagas. */
export function errosRespostaEap(
  r: Pick<RespostaEap, 'vagas'>,
  blocos: Record<string, ListaEap>,
  respondidoPor: string,
): Record<string, string> {
  const e: Record<string, string> = {};
  for (const t of TURMAS_EAP) {
    const vagas = Number(r.vagas[t.id]) || 0;
    const b = blocos[t.id];
    const n = b?.policiais.length ?? 0;
    if (!vagas) continue;
    if (!n && !b?.semEfetivo) e[t.id] = 'Indique os policiais ou marque "Sem efetivo pendente de EAP".';
    else if (n > vagas) e[t.id] = `Esta turma tem ${vagas} vaga(s) para a sua Cia.`;
  }
  for (const l of LISTAS_LIVRES_EAP) if ((blocos[l.id]?.policiais.length ?? 0) > MAX_LISTA_LIVRE) e[l.id] = `No máximo ${MAX_LISTA_LIVRE}.`;
  if (!respondidoPor.trim()) e.nome = 'Informe quem está enviando (posto/graduação e nome).';
  return e;
}
