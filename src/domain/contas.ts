import { UNIDADES, type UnidadeId } from './unidades';

// Conta única da P/3. As Cias usam o mesmo Gmail com "+id" (ex.: 8bpmmp3+1cia@gmail.com):
// o Gmail entrega tudo na caixa da P/3, então o link de troca de senha chega para vocês.
export const EMAIL_P3 = '8bpmmp3@gmail.com';

/** Sala de Operações e CFP: login próprio, sem encaminhamento de demandas. */
export type SetorId = 'sala' | 'cfp';
export type ContaId = 'p3' | UnidadeId | SetorId | 'admin';
export type Claims =
  | { perfil: 'p3' }
  | { perfil: 'unidade'; unidade: UnidadeId }
  | { perfil: SetorId }
  | { perfil: 'admin' };

export interface Conta {
  id: ContaId;
  sigla: string;
  email: string;
  claims: Claims;
}

export type Sessao =
  /** admin: 'direto' (chefe/encarregado com login individual), 'senha' (conta antiga da P/3: pede a senha do Administrador), 'nao'. */
  | { tipo: 'p3'; sigla: string; admin: 'direto' | 'senha' | 'nao' }
  | { tipo: 'unidade'; unidade: UnidadeId; sigla: string }
  /** CGP de uma Cia (acesso por RE): só a página do CGP daquela Cia. */
  | { tipo: 'cgp'; unidade: UnidadeId; sigla: string }
  | { tipo: SetorId; sigla: string }
  | { tipo: 'sem-perfil' };

export const SETORES: readonly { id: SetorId; sigla: string }[] = [
  { id: 'sala', sigla: 'Sala de Operações' },
  { id: 'cfp', sigla: 'CFP' },
];

export function emailDaConta(id: ContaId): string {
  if (id === 'p3') return EMAIL_P3;
  const [usuario, dominio] = EMAIL_P3.split('@');
  return `${usuario}+${id}@${dominio}`;
}

export const CONTAS: readonly Conta[] = [
  { id: 'p3', sigla: 'P/3', email: emailDaConta('p3'), claims: { perfil: 'p3' } },
  ...UNIDADES.map((u) => ({
    id: u.id,
    sigla: u.sigla,
    email: emailDaConta(u.id),
    claims: { perfil: 'unidade' as const, unidade: u.id },
  })),
  ...SETORES.map((s) => ({ id: s.id, sigla: s.sigla, email: emailDaConta(s.id), claims: { perfil: s.id } })),
];

/**
 * Conta do Administrador (8bpmmp3+admin@gmail.com): senha própria, usada só dentro da aba Administrador
 * da P/3. Não aparece na tela de login. É a única que pode zerar o portal e mudar o contador do numerador.
 */
export const CONTA_ADMIN: Conta = { id: 'admin', sigla: 'Administrador', email: emailDaConta('admin'), claims: { perfil: 'admin' } };

/** Todas as contas que o "npm run usuarios" cria (as do login + a do Administrador). */
export const TODAS_CONTAS: readonly Conta[] = [...CONTAS, CONTA_ADMIN];

/** Traduz o perfil gravado no login (custom claims) para a sessão do portal. */
export function sessaoDosClaims(claims: Record<string, unknown>): Sessao {
  if (claims.perfil === 'p3') {
    const individual = typeof claims.re === 'string';
    return { tipo: 'p3', sigla: 'P/3', admin: !individual ? 'senha' : claims.admin === true ? 'direto' : 'nao' };
  }
  if (claims.perfil === 'unidade') {
    const unidade = UNIDADES.find((u) => u.id === claims.unidade);
    if (unidade) return { tipo: 'unidade', unidade: unidade.id, sigla: unidade.sigla };
  }
  if (claims.perfil === 'cgp') {
    const unidade = UNIDADES.find((u) => u.id === claims.unidade);
    if (unidade) return { tipo: 'cgp', unidade: unidade.id, sigla: `CGP ${unidade.sigla}` };
  }
  const setor = SETORES.find((s) => s.id === claims.perfil);
  if (setor) return { tipo: setor.id, sigla: setor.sigla };
  return { tipo: 'sem-perfil' };
}
