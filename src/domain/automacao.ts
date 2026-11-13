import type { DadosDemanda } from './demanda';

// O que o "motor" (Apps Script na conta da P/3) já fez por uma demanda.
export type EventoFeito = { eventoId: string; inicio: string; fim: string; titulo: string };
export type CfpFeito = EventoFeito & { pastaUrl: string; operacoes?: boolean };

export type Automacao = {
  agendaCPA?: EventoFeito | null;
  agendaCia?: EventoFeito | null;
  cfp?: CfpFeito | null;
  cfpPasta?: string | null;
  erro?: string;
  processadoEm?: string;
};

/** Campos que, quando mudam, fazem o motor revisar agenda e pasta. */
export const CAMPOS_AUTOMACAO: readonly (keyof DadosDemanda)[] = [
  'saida',
  'observacao',
  'destinos',
  'prazoCPA',
  'prazoCia',
  'adicionarCFP',
  'inicioBtl',
  'terminoBtl',
];

/** Demanda nova: só chama o motor se houver prazo ou pedido de CFP. */
export function precisaAutomacao(d: Pick<DadosDemanda, 'prazoCPA' | 'prazoCia' | 'adicionarCFP'>): boolean {
  return !!d.prazoCPA || !!d.prazoCia || d.adicionarCFP;
}

/** Demanda editada: chama o motor se mudou algo que aparece na agenda ou na pasta. */
export function edicaoPrecisaAutomacao(campos: readonly (keyof DadosDemanda)[]): boolean {
  return campos.some((c) => CAMPOS_AUTOMACAO.includes(c));
}
