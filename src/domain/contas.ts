import { UNIDADES, type UnidadeId } from './unidades';

// Conta única da P/3. As Cias usam o mesmo Gmail com "+id" (ex.: 8bpmmp3+1cia@gmail.com):
// o Gmail entrega tudo na caixa da P/3, então o link de troca de senha chega para vocês.
export const EMAIL_P3 = '8bpmmp3@gmail.com';

export type ContaId = 'p3' | UnidadeId;
export type Claims = { perfil: 'p3' } | { perfil: 'unidade'; unidade: UnidadeId };

export interface Conta {
  id: ContaId;
  sigla: string;
  email: string;
  claims: Claims;
}

export type Sessao =
  | { tipo: 'p3'; sigla: string }
  | { tipo: 'unidade'; unidade: UnidadeId; sigla: string }
  | { tipo: 'sem-perfil' };

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
];

/** Traduz o perfil gravado no login (custom claims) para a sessão do portal. */
export function sessaoDosClaims(claims: Record<string, unknown>): Sessao {
  if (claims.perfil === 'p3') return { tipo: 'p3', sigla: 'P/3' };
  if (claims.perfil === 'unidade') {
    const unidade = UNIDADES.find((u) => u.id === claims.unidade);
    if (unidade) return { tipo: 'unidade', unidade: unidade.id, sigla: unidade.sigla };
  }
  return { tipo: 'sem-perfil' };
}
