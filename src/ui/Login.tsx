import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { type FormEvent, useState } from 'react';
import { CONTAS, emailDaConta, type ContaId } from '../domain/contas';
import { mensagemErroLogin } from '../domain/mensagens';
import { auth } from '../lib/firebase';
import { Topo } from './Topo';

const CHAVE_ULTIMA = 'portalp3.ultimaConta';

// Lembra a última unidade escolhida neste aparelho (só conveniência).
function lerUltimaConta(): ContaId {
  try {
    const valor = localStorage.getItem(CHAVE_ULTIMA);
    const conta = CONTAS.find((c) => c.id === valor);
    if (conta) return conta.id;
  } catch {
    /* navegador sem armazenamento: usa o padrão */
  }
  return 'p3';
}

function codigoDoErro(erro: unknown): string {
  return (erro as { code?: string }).code ?? '';
}

export function Login() {
  const [conta, setConta] = useState<ContaId>(lerUltimaConta);
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setAviso('');
    setEnviando(true);
    try {
      try {
        localStorage.setItem(CHAVE_ULTIMA, conta);
      } catch {
        /* sem armazenamento: segue sem lembrar */
      }
      await signInWithEmailAndPassword(auth, emailDaConta(conta), senha);
    } catch (e) {
      setErro(mensagemErroLogin(codigoDoErro(e)));
      setEnviando(false);
    }
  }

  async function esqueciSenha() {
    setErro('');
    setAviso('');
    try {
      await sendPasswordResetEmail(auth, emailDaConta(conta));
      setAviso('Link para trocar a senha enviado para o e-mail da P/3.');
    } catch (e) {
      setErro(mensagemErroLogin(codigoDoErro(e)));
    }
  }

  return (
    <main className="tela">
      <Topo />
      <form className="cartao formulario" onSubmit={entrar}>
        <h2>Entrar</h2>
        <label className="campo">
          Unidade
          <select value={conta} onChange={(e) => setConta(e.target.value as ContaId)}>
            {CONTAS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.sigla}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          Senha
          <input
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </label>
        {erro && (
          <p className="mensagem erro" role="alert">
            {erro}
          </p>
        )}
        {aviso && (
          <p className="mensagem aviso" role="status">
            {aviso}
          </p>
        )}
        <button className="botao" type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
        <button className="botao-link" type="button" onClick={esqueciSenha}>
          Esqueci a senha
        </button>
      </form>
    </main>
  );
}
