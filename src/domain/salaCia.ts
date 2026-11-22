import { DOMINIO_LOGIN } from './acessos';
import { UNIDADES, type UnidadeId } from './unidades';

// Sala de Operações de cada Cia/FT: uma conta por Cia (perfil 'salaCia' + unidade), com senha que a P/3 gera na
// página dela (Sala de Operações → Senhas das Cias). Quem entra com essa senha vê só a Sala de Operações daquela Cia
// (lançar a produção dos pelotões e o resumo do mês).
// A P/3 grava o pedido em senhasSalaCia/{cia}; o motor (Apps Script) cria/atualiza a conta, aplica a senha,
// desconecta os aparelhos que estavam logados e apaga a senha do banco. O mesmo cálculo do login está no
// Logica.gs (emailSalaCia).

export const COLECAO_SENHAS_SALA_CIA = 'senhasSalaCia';

/** "1cia" -> "sala-1cia@portal-p3.firebaseapp.com" (endereço só de login, sem caixa de e-mail). */
export function emailSalaCia(unidade: UnidadeId): string {
  return `sala-${unidade}@${DOMINIO_LOGIN}`;
}

export function siglaSalaCia(unidade: UnidadeId): string {
  return `Sala de Operações ${UNIDADES.find((u) => u.id === unidade)?.sigla ?? unidade}`;
}

// Sem letras e números que se confundem ao ditar ou copiar à mão (0/O, 1/l/I).
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
export const TAMANHO_SENHA = 10;

/** Senha aleatória (crypto do navegador), com ao menos uma maiúscula, uma minúscula e um número. */
export function gerarSenhaSala(aleatorio: (n: number) => Uint32Array = (n) => crypto.getRandomValues(new Uint32Array(n))): string {
  for (;;) {
    const v = aleatorio(TAMANHO_SENHA);
    const senha = Array.from(v, (x) => ALFABETO[x % ALFABETO.length]).join('');
    if (/[A-Z]/.test(senha) && /[a-z]/.test(senha) && /[2-9]/.test(senha)) return senha;
  }
}

export type StatusSenhaSala = 'pendente' | 'ok' | 'erro';

export type SenhaSalaCia = {
  id: UnidadeId;
  ativo: boolean;
  sincronizar: boolean;
  status: StatusSenhaSala;
  erro: string;
  pedidoPor: string;
  pedidoEm: Date | null;
  aplicadoEm: string;
};

/** Situação na lista da P/3. Sem documento: a Sala daquela Cia ainda não tem senha. */
export function situacaoSenhaSala(s: SenhaSalaCia | undefined): { texto: string; classe: string } {
  if (!s) return { texto: 'Sem senha', classe: 'selo-em_aberto' };
  if (s.status === 'erro') return { texto: `Erro: ${s.erro || 'desconhecido'}`, classe: 'selo-atrasado' };
  if (s.sincronizar || s.status === 'pendente') return { texto: 'Aplicando no login (até 5 min)…', classe: 'selo-em_aberto' };
  if (!s.ativo) return { texto: 'Bloqueada', classe: 'selo-atrasado' };
  return { texto: 'Ativa', classe: 'selo-concluido' };
}
