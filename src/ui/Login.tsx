import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { type FormEvent, useState } from 'react';
import { emailDeLogin, reBase } from '../domain/acessos';
import { CONTAS, emailDaConta, type ContaId } from '../domain/contas';
import { mensagemErroLogin } from '../domain/mensagens';
import { auth } from '../lib/firebase';
import { pedirTrocaDeSenha } from '../lib/motor';
import { Topo } from './Topo';
import { Campo } from './Campo';

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

/** Login por RE (individual). A entrada antiga, por unidade, fica num link até todos terem acesso próprio. */
export function Login() {
  const [antiga, setAntiga] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_MODO) === 'antiga';
    } catch {
      return false;
    }
  });
  const trocar = (v: boolean) => {
    setAntiga(v);
    try {
      localStorage.setItem(CHAVE_MODO, v ? 'antiga' : 're');
    } catch {
      /* sem armazenamento */
    }
  };
  return (
    <main className="tela">
      <Topo />
      {antiga ? <LoginUnidade /> : <LoginRE />}
      <p className="troca-login">
        <button className="botao-link" type="button" onClick={() => trocar(!antiga)}>
          {antiga ? 'Entrar com RE e senha pessoal' : 'Entrar com a conta da unidade (antiga)'}
        </button>
      </p>
    </main>
  );
}

const CHAVE_MODO = 'portalp3.modoLogin';

function LoginRE() {
  const [re, setRe] = useState('');
  const [senha, setSenha] = useState('');
  const [erros, setErros] = useState<{ re?: string; senha?: string }>({});
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setAviso('');
    const e: { re?: string; senha?: string } = {};
    if (reBase(re).length < 6) e.re = 'Digite o RE (com ou sem dígito).';
    if (!senha) e.senha = 'Digite a senha.';
    setErros(e);
    if (e.re || e.senha) return;
    setEnviando(true);
    try {
      await signInWithEmailAndPassword(auth, emailDeLogin(re), senha);
    } catch (falha) {
      setErro(mensagemErroLogin(codigoDoErro(falha)));
      setEnviando(false);
    }
  }

  function esqueci() {
    setErro('');
    setAviso('');
    if (reBase(re).length < 6) {
      setErros({ re: 'Digite o seu RE para receber o link.' });
      return;
    }
    pedirTrocaDeSenha(re);
    setAviso('Se o RE tiver acesso ao portal, o link para trocar a senha chega no e-mail funcional cadastrado em alguns minutos.');
  }

  return (
    <form className="cartao formulario" onSubmit={entrar} noValidate>
      <h2>Entrar</h2>
      <Campo rotulo="RE" erro={erros.re} obrigatorio>
        <input type="text" inputMode="text" autoComplete="username" placeholder="ex.: 123456-7" value={re} onChange={(e) => setRe(e.target.value)} />
      </Campo>
      <Campo rotulo="Senha" erro={erros.senha} obrigatorio>
        <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
      </Campo>
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
      <button className="botao destaque" type="submit" disabled={enviando}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
      <button className="botao-link" type="button" onClick={esqueci}>
        Esqueci a senha
      </button>
    </form>
  );
}

function LoginUnidade() {
  const [conta, setConta] = useState<ContaId>(lerUltimaConta);
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [semSenha, setSemSenha] = useState(false);

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setAviso('');
    setSemSenha(!senha);
    if (!senha) return;
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
    <>
      <form className="cartao formulario" onSubmit={entrar} noValidate>
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
        <Campo rotulo="Senha" erro={semSenha && !senha ? 'Digite a senha.' : undefined} obrigatorio>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </Campo>
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
        <button className="botao destaque" type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
        <button className="botao-link" type="button" onClick={esqueciSenha}>
          Esqueci a senha
        </button>
      </form>
    </>
  );
}
