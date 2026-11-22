import type { Assinatura } from './email';
import { normalizarRE } from './efetivo';
import { UNIDADES, type UnidadeId } from './unidades';

// Acessos individuais: cada policial entra com o RE (com ou sem dígito) e a senha dele.
// Por trás, o RE vira a conta "re144602@portal-p3.firebaseapp.com" no Firebase (endereço só de login, sem caixa
// de e-mail): o link de primeiro acesso e o de troca de senha vão para o e-mail funcional cadastrado,
// enviados pelo motor (Apps Script) pelo Gmail da P/3. O mesmo cálculo está no Logica.gs (emailDeLoginAcesso).

export const DOMINIO_LOGIN = 'portal-p3.firebaseapp.com';

/** Chefe e encarregado da P/3: veem a aba Administrador. */
export const RES_ADMIN = ['144602', '130155'] as const;

export type PerfilAcesso = 'p3' | 'unidade' | 'cgp' | 'salaCia' | 'cfp' | 'sala';

/** Perfis que pertencem a uma Cia (pedem a Cia no cadastro). */
export const perfilComCia = (p: PerfilAcesso | ''): boolean => p === 'unidade' || p === 'cgp' || p === 'salaCia';

export const PERFIS_ACESSO: readonly { id: PerfilAcesso; rotulo: string; ajuda: string }[] = [
  { id: 'unidade', rotulo: 'Cia / Força Tática', ajuda: 'Só a página da própria Cia.' },
  { id: 'cgp', rotulo: 'CGP de Cia / FT', ajuda: 'Só a página do CGP da Cia escolhida.' },
  { id: 'salaCia', rotulo: 'Sala de Operações de Cia / FT', ajuda: 'Só a Sala de Operações da Cia escolhida (produção dos pelotões).' },
  { id: 'cfp', rotulo: 'CFP', ajuda: 'Página do CFP e da Sala de Operações.' },
  { id: 'sala', rotulo: 'Sala de Operações', ajuda: 'Só a página da Sala de Operações.' },
  { id: 'p3', rotulo: 'P/3', ajuda: 'O sistema todo (Administrador só para o chefe e o encarregado).' },
];

/** O que o Administrador preenche (dados do banco de efetivo ou digitados à mão). */
export type DadosAcesso = {
  re: string;
  nomeCompleto: string;
  nomeGuerra: string;
  posto: string;
  email: string;
  perfil: PerfilAcesso | '';
  unidade: UnidadeId | '';
  /** Policial fora do banco de efetivo (dados digitados). */
  manual: boolean;
};

export type StatusAcesso = 'pendente' | 'ok' | 'erro';

export type Acesso = Omit<DadosAcesso, 'perfil'> & {
  id: string;
  perfil: PerfilAcesso;
  admin: boolean;
  ativo: boolean;
  /** O motor ainda precisa criar/atualizar a conta. */
  sincronizar: boolean;
  enviarLink: boolean;
  excluir?: boolean;
  status: StatusAcesso;
  erro?: string;
  linkEnviadoEm?: string;
};

export const acessoVazio = (): DadosAcesso => ({
  re: '',
  nomeCompleto: '',
  nomeGuerra: '',
  posto: '',
  email: '',
  perfil: '',
  unidade: '',
  manual: false,
});

export const reBase = (re: string): string => normalizarRE(re);

export function emailDeLogin(re: string): string {
  return `re${reBase(re)}@${DOMINIO_LOGIN}`;
}

export const ehAdminRE = (re: string): boolean => (RES_ADMIN as readonly string[]).includes(reBase(re));

/** "3ªCia - 8ºBPM/M" -> "3cia"; "FT - 8ºBPM/M" -> "ft"; "EM - 8ºBPM/M" -> "" (coluna OPM do banco). */
export function unidadeDaOpm(opm: string): UnidadeId | '' {
  const t = String(opm ?? '').trim().toUpperCase();
  const cia = /^(\d)\s*[ªAº°O.]?\s*CIA/.exec(t);
  if (cia) {
    const id = `${cia[1]}cia`;
    return UNIDADES.some((u) => u.id === id) ? (id as UnidadeId) : '';
  }
  if (/^F\.?\s*T\b|^FORÇA TÁTICA|^FORCA TATICA/.test(t)) return 'ft';
  return '';
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ErrosAcesso = Partial<Record<keyof DadosAcesso, string>>;

export function validarAcesso(d: DadosAcesso): ErrosAcesso {
  const e: ErrosAcesso = {};
  if (reBase(d.re).length < 6) e.re = 'Informe o RE (6 números, com ou sem dígito).';
  if (!d.nomeCompleto.trim()) e.nomeCompleto = 'Informe o nome completo.';
  if (!d.posto.trim()) e.posto = 'Informe o posto/graduação.';
  if (!EMAIL.test(d.email.trim())) e.email = 'Informe o e-mail funcional (é para onde vão os links de senha).';
  if (!d.perfil) e.perfil = 'Escolha o acesso.';
  if (perfilComCia(d.perfil) && !d.unidade) e.unidade = 'Escolha a Cia.';
  return e;
}

/** O que vai para o banco (acessos/{reBase}); o motor cria/atualiza a conta. */
export function montarAcesso(d: DadosAcesso, opcoes: { novo: boolean; ativo?: boolean }) {
  const perfil = d.perfil as PerfilAcesso;
  return {
    re: d.re.trim().toUpperCase(),
    nomeCompleto: d.nomeCompleto.trim().toUpperCase(),
    nomeGuerra: d.nomeGuerra.trim().toUpperCase(),
    posto: d.posto.trim(),
    email: d.email.trim().toLowerCase(),
    perfil,
    unidade: perfilComCia(perfil) ? d.unidade : '',
    manual: d.manual,
    admin: perfil === 'p3' && ehAdminRE(d.re),
    ativo: opcoes.ativo ?? true,
    sincronizar: true,
    status: 'pendente' as const,
    erro: '',
    ...(opcoes.novo ? { enviarLink: true } : {}),
  };
}

export function rotuloAcesso(a: Pick<Acesso, 'perfil' | 'unidade' | 'admin'>): string {
  if (a.perfil === 'unidade') return UNIDADES.find((u) => u.id === a.unidade)?.sigla ?? 'Cia';
  if (a.perfil === 'cgp') return `CGP ${UNIDADES.find((u) => u.id === a.unidade)?.sigla ?? ''}`.trim();
  if (a.perfil === 'salaCia') return `Sala de Operações ${UNIDADES.find((u) => u.id === a.unidade)?.sigla ?? ''}`.trim();
  if (a.perfil === 'p3') return a.admin ? 'P/3 + Administrador' : 'P/3';
  return PERFIS_ACESSO.find((p) => p.id === a.perfil)?.rotulo ?? a.perfil;
}

export function situacaoAcesso(a: Acesso): { texto: string; classe: string } {
  if (a.excluir) return { texto: 'Excluindo…', classe: 'selo-em_aberto' };
  if (a.status === 'erro') return { texto: `Erro: ${a.erro || 'desconhecido'}`, classe: 'selo-atrasado' };
  if (a.sincronizar || a.status === 'pendente') return { texto: 'Criando/atualizando (até 10 min)…', classe: 'selo-em_aberto' };
  if (!a.ativo) return { texto: 'Bloqueado', classe: 'selo-atrasado' };
  return { texto: 'Ativo', classe: 'selo-concluido' };
}

/** RE de quem está logado com acesso individual (pela conta de login); conta antiga da unidade: null. */
export function reDoLogin(email: string | null | undefined): string | null {
  const m = /^re(\d+)@(.+)$/.exec(String(email ?? '').toLowerCase());
  return m && m[2] === DOMINIO_LOGIN ? m[1] : null;
}

/** Como a pessoa logada aparece em "Respondido por", "Lançado por"…: "Sd PM ABDO (RE 194899)". */
export function identificacaoDoLogin(email: string | null | undefined, nome: string | null | undefined): string | null {
  const re = reDoLogin(email);
  if (!re) return null;
  const n = String(nome ?? '').trim();
  return n ? `${n} (RE ${re})` : `RE ${re}`;
}

/** Nome na lista de Responsáveis de quem está logado (pela tabela de assinaturas, que guarda o RE de cada um). */
export function responsavelDoRE(assinaturas: Pick<Assinatura, 'nome' | 're'>[], re: string | null): string | null {
  if (!re) return null;
  return assinaturas.find((a) => a.re && reBase(a.re) === re)?.nome ?? null;
}

