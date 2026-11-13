/** Converte o código de erro do Firebase Auth numa mensagem curta para a tela. */
export function mensagemErroLogin(codigo: string): string {
  switch (codigo) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Senha incorreta.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Aguarde alguns minutos ou use "Esqueci a senha".';
    case 'auth/network-request-failed':
      return 'Sem conexão com a internet.';
    default:
      return 'Não foi possível entrar. Tente de novo.';
  }
}
