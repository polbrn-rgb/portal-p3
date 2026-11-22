import { InputSenha } from './InputSenha';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { type FormEvent, useState } from 'react';
import { emailDeLogin, reBase } from '../domain/acessos';
import { CONTAS, emailDaConta, type ContaId } from '../domain/contas';
import { mensagemErroLogin } from '../domain/mensagens';
import { emailSalaCia } from '../domain/salaCia';
import { UNIDADES, type UnidadeId } from '../domain/unidades';
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

type ModoLogin = 're' | 'antiga' | 'salaCia';

function lerModo(): ModoLogin {
  try {
    const m = localStorage.getItem(CHAVE_MODO);
    if (m === 'antiga' || m === 'salaCia') return m;
  } catch {
    /* sem armazenamento */
  }
  return 're';
}

const ROTULO_MODO: Record<ModoLogin, string> = {
  re: 'Entrar com RE e senha pessoal',
  salaCia: 'Entrar na Sala de Operações da Cia',
  antiga: 'Entrar com a conta da unidade (antiga)',
};

/**
 * Login por RE (individual). A Sala de Operações de cada Cia entra com a senha que a P/3 gerou; a entrada antiga,
 * por unidade, fica num link até todos terem acesso próprio.
 */
export function Login() {
  const [modo, setModo] = useState<ModoLogin>(lerModo);
  const trocar = (v: ModoLogin) => {
    setModo(v);
    try {
      localStorage.setItem(CHAVE_MODO, v);
    } catch {
      /* sem armazenamento */
    }
  };
  return (
    <main className="tela">
      <Topo />
      {modo === 'antiga' ? <LoginUnidade /> : modo === 'salaCia' ? <LoginSalaCia /> : <LoginRE />}
      {(['re', 'salaCia', 'antiga'] as const)
        .filter((m) => m !== modo)
        .map((m) => (
          <p key={m} className="troca-login">
            <button className="botao-link" type="button" onClick={() => trocar(m)}>
              {ROTULO_MODO[m]}
            </button>
          </p>
        ))}
    </main>
  );
}

const CHAVE_SALA = 'portalp3.ultimaSalaCia';

/** Sala de Operações da Cia/FT: escolhe a Cia e digita a senha que a P/3 entregou. Esqueceu: pede à P/3 uma nova. */
function LoginSalaCia() {
  const [unidade, setUnidade] = useState<UnidadeId | ''>(() => {
    try {
      const v = localStorage.getItem(CHAVE_SALA);
      return UNIDADES.some((u) => u.id === v) ? (v as UnidadeId) : '';
    } catch {
      return '';
    }
  });
  const [senha, setSenha] = useState('');
  const [erros, setErros] = useState<{ unidade?: string; senha?: string }>({});
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    setAviso('');
    const e: { unidade?: string; senha?: string } = {};
    if (!unidade) e.unidade = 'Escolha a Cia.';
    if (!senha) e.senha = 'Digite a senha.';
    setErros(e);
    if (!unidade || !senha) return;
    setEnviando(true);
    try {
      try {
        localStorage.setItem(CHAVE_SALA, unidade);
      } catch {
        /* sem armazenamento */
      }
      await signInWithEmailAndPassword(auth, emailSalaCia(unidade), senha);
    } catch (falha) {
      setErro(mensagemErroLogin(codigoDoErro(falha)));
      setEnviando(false);
    }
  }

  return (
    <form className="cartao formulario" onSubmit={entrar} noValidate>
      <h2>Sala de Operações da Cia</h2>
      <Campo rotulo="Cia" erro={erros.unidade} obrigatorio>
        <select value={unidade} onChange={(e) => setUnidade(e.target.value as UnidadeId | '')}>
          <option value="">Escolha…</option>
          {UNIDADES.map((u) => (
            <option key={u.id} value={u.id}>
              {u.sigla}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Senha" erro={erros.senha} obrigatorio>
        <InputSenha autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
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
      <button className="botao-link" type="button" onClick={() => setAviso('A senha da Sala de Operações é gerada pela P/3. Peça uma senha nova à P/3.')}>
        Esqueci a senha
      </button>
    </form>
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
        <InputSenha autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
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
          <InputSenha
            
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
