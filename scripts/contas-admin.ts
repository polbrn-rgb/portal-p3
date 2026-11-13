import type { Auth } from 'firebase-admin/auth';
import type { Conta } from '../src/domain/contas';

export interface ResultadoConta {
  conta: Conta;
  acao: 'criada' | 'senha-redefinida' | 'perfil-atualizado';
  senha?: string;
}

/**
 * Garante que cada conta existe e tem o perfil certo no token.
 * - Conta nova: é criada com senha nova.
 * - Conta existente: mantém a senha, só regrava o perfil.
 * - Conta em `redefinir`: recebe senha nova e é desconectada dos aparelhos.
 * Usado pelo script `npm run usuarios` e pelos testes de ponta a ponta.
 */
export async function garantirContas(
  auth: Auth,
  contas: readonly Conta[],
  novaSenha: () => string,
  redefinir: ReadonlySet<string> = new Set(),
): Promise<ResultadoConta[]> {
  const resultados: ResultadoConta[] = [];

  for (const conta of contas) {
    let uid: string;
    let acao: ResultadoConta['acao'] = 'perfil-atualizado';
    let senha: string | undefined;

    try {
      uid = (await auth.getUserByEmail(conta.email)).uid;
      if (redefinir.has(conta.id)) {
        senha = novaSenha();
        await auth.updateUser(uid, { password: senha });
        await auth.revokeRefreshTokens(uid);
        acao = 'senha-redefinida';
      }
    } catch (erro) {
      if ((erro as { code?: string }).code !== 'auth/user-not-found') throw erro;
      senha = novaSenha();
      uid = (await auth.createUser({ email: conta.email, password: senha, displayName: conta.sigla })).uid;
      acao = 'criada';
    }

    await auth.setCustomUserClaims(uid, conta.claims);
    resultados.push({ conta, acao, senha });
  }

  return resultados;
}
