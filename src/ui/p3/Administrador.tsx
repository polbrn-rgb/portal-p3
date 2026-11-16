import { useEffect, useState, type FormEvent } from 'react';
import type { Firestore } from 'firebase/firestore';
import {
  concluirZeragem,
  definirContador,
  iniciarZeragem,
  lerContadores,
  observarZeragem,
  ZeragemNaoPronta,
  type Contador,
} from '../../data/admin';
import { lerUltimoNumero, PALAVRA_CONFIRMACAO } from '../../domain/admin';
import { TIPOS_SAIDA } from '../../domain/listas';
import { mensagemErroLogin } from '../../domain/mensagens';
import {
  ANO_NUMERACAO_POR_TIPO,
  ID_CONTADOR_GERAL,
  idContadorTipo,
  rotuloContador,
} from '../../domain/numeracao';
import { entrarAdmin, sairAdmin } from '../../lib/appAdmin';
import { cutucarMotor } from '../../lib/motor';
import { Campo } from '../Campo';

/** Aba Administrador: senha própria (conta do Administrador), separada do login da P/3. */
export function Administrador() {
  const [db, setDb] = useState<Firestore | null>(null);
  // Saiu da aba: o Administrador sai junto.
  useEffect(() => () => void sairAdmin(), []);

  if (!db) return <EntrarAdmin aoEntrar={setDb} />;
  return (
    <>
      <section className="painel">
        <div className="painel-cabecalho">
          <h2>Administrador</h2>
          <button className="botao secundario" type="button" onClick={() => void sairAdmin().then(() => setDb(null))}>
            🔒 Sair do Administrador
          </button>
        </div>
      </section>
      <Numeracao db={db} />
      <Zerar db={db} />
    </>
  );
}

function EntrarAdmin({ aoEntrar }: { aoEntrar: (db: Firestore) => void }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [entrando, setEntrando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    if (!senha) {
      setErro('Digite a senha do Administrador.');
      return;
    }
    setEntrando(true);
    setErro('');
    try {
      aoEntrar(await entrarAdmin(senha));
    } catch (falha) {
      const codigo = (falha as { code?: string }).code ?? '';
      setErro((falha as Error).message === 'sem-perfil-admin' ? 'Conta sem perfil de Administrador.' : mensagemErroLogin(codigo));
      setEntrando(false);
    }
  }

  return (
    <section className="painel admin-entrar">
      <h2>🔒 Administrador</h2>
      <p>Área só do Administrador: zerar o portal e ajustar a numeração. Use a senha própria do Administrador.</p>
      <form onSubmit={entrar} noValidate>
        <Campo rotulo="Senha do Administrador" erro={erro} obrigatorio>
          <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </Campo>
        <button className="botao destaque" type="submit" disabled={entrando}>
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </section>
  );
}

function anoDosTipos(): number {
  return Math.max(new Date().getFullYear(), ANO_NUMERACAO_POR_TIPO);
}

function Numeracao({ db }: { db: Firestore }) {
  const [contadores, setContadores] = useState<Contador[] | null>(null);
  const [erroLista, setErroLista] = useState('');
  const [qual, setQual] = useState(ID_CONTADOR_GERAL);
  const [ultimo, setUltimo] = useState('');
  const [forcar, setForcar] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);
  const ano = anoDosTipos();

  async function recarregar() {
    try {
      setContadores(await lerContadores(db));
      setErroLista('');
    } catch {
      setErroLista('Não foi possível ler os contadores.');
    }
  }
  useEffect(() => {
    void recarregar();
  }, [db]);

  const atual = contadores?.find((c) => c.id === qual)?.ultimo ?? 0;
  const lido = lerUltimoNumero(ultimo);
  const volta = typeof lido === 'number' && lido < atual;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setAviso('');
    if (typeof lido === 'string') return setErro(lido);
    if (volta && !forcar) return setErro(`O contador está em ${atual}. Voltar para ${lido} pode repetir número: marque a confirmação abaixo.`);
    setErro('');
    setSalvando(true);
    try {
      await definirContador(db, qual, lido);
      setAviso(`Pronto: ${rotuloContador(qual, TIPOS_SAIDA)} → a próxima será a ${lido + 1}.`);
      setUltimo('');
      setForcar(false);
      await recarregar();
    } catch {
      setErro('Não foi possível gravar. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  const opcoes = [ID_CONTADOR_GERAL, ...TIPOS_SAIDA.map((t) => idContadorTipo(ano, t))];
  const doAno = (contadores ?? []).filter((c) => c.id !== ID_CONTADOR_GERAL).sort((a, b) => a.id.localeCompare(b.id));
  const geral = contadores?.find((c) => c.id === ID_CONTADOR_GERAL)?.ultimo ?? 0;

  return (
    <section className="painel" aria-label="Numeração">
      <h2>Numeração</h2>
      <p>
        Até 2026 a numeração é um número só (Nº {geral + 1} é a próxima). A partir de 01/01/{ANO_NUMERACAO_POR_TIPO} cada tipo de
        saída ganha a sua sequência, que volta para 001 todo ano sozinha (ex.: OFÍCIO 8BPMM-001/03/27). O nº interno continua
        único por trás.
      </p>
      {erroLista && <p className="mensagem erro" role="alert">{erroLista}</p>}
      {contadores && (
        <ul className="lista-contadores">
          <li>
            <span>{rotuloContador(ID_CONTADOR_GERAL, TIPOS_SAIDA)}</span>
            <strong>último {geral}</strong>
          </li>
          {doAno.map((c) => (
            <li key={c.id}>
              <span>{rotuloContador(c.id, TIPOS_SAIDA)}</span>
              <strong>último {c.ultimo}</strong>
            </li>
          ))}
        </ul>
      )}

      <form className="grade" onSubmit={salvar} noValidate>
        <Campo rotulo="Contador" obrigatorio>
          <select value={qual} onChange={(e) => { setQual(e.target.value); setErro(''); }}>
            {opcoes.map((id) => (
              <option key={id} value={id}>
                {rotuloContador(id, TIPOS_SAIDA)}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Último número já usado" erro={erro} obrigatorio>
          <input inputMode="numeric" placeholder={`hoje: ${atual}`} value={ultimo} onChange={(e) => setUltimo(e.target.value)} />
        </Campo>
        {typeof lido === 'number' && <p className="dica">A próxima será a {lido + 1}.</p>}
        {volta && (
          <label className="opcao">
            <input type="checkbox" checked={forcar} onChange={(e) => setForcar(e.target.checked)} />
            Sei que voltar o número pode repetir numeração
          </label>
        )}
        <button className="botao destaque" type="submit" disabled={salvando}>
          {salvando ? 'Gravando…' : 'Definir número'}
        </button>
      </form>
      {aviso && <p className="mensagem aviso" role="status">{aviso}</p>}
    </section>
  );
}

type Situacao = { total: number; zeradas: number; aguardandoMotor: number; novas: number };

function Zerar({ db }: { db: Firestore }) {
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [confirmacao, setConfirmacao] = useState('');
  const [ultimo, setUltimo] = useState('0');
  const [erro, setErro] = useState('');
  const [erroInicio, setErroInicio] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [iniciada, setIniciada] = useState(false);

  useEffect(() => observarZeragem(db, setSituacao, () => setErro('Não foi possível acompanhar as demandas.')), [db]);

  async function iniciar(e: FormEvent) {
    e.preventDefault();
    setAviso('');
    if (confirmacao.trim().toUpperCase() !== PALAVRA_CONFIRMACAO) {
      setErro(`Digite ${PALAVRA_CONFIRMACAO} para confirmar.`);
      return;
    }
    setErro('');
    setOcupado(true);
    try {
      const r = await iniciarZeragem(db);
      cutucarMotor();
      setIniciada(true);
      setConfirmacao('');
      setAviso(`${r.apagados} registro(s) apagado(s). ${r.demandas} demanda(s) aguardando o motor limpar agenda e pastas.`);
    } catch {
      setErro('A zeragem parou no meio. Clique em "Zerar portal" de novo para continuar.');
    } finally {
      setOcupado(false);
    }
  }

  async function concluir() {
    const lido = lerUltimoNumero(ultimo);
    if (typeof lido === 'string') return setErroInicio(lido);
    setErroInicio('');
    setOcupado(true);
    try {
      const n = await concluirZeragem(db, lido);
      setIniciada(false);
      setAviso(`Portal zerado: ${n} demanda(s) apagada(s). A próxima demanda será a ${lido + 1}.`);
    } catch (falha) {
      setErroInicio(falha instanceof ZeragemNaoPronta ? falha.message : 'Não foi possível concluir. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  }

  const emAndamento = iniciada || (situacao !== null && situacao.zeradas > 0);
  const pronta = emAndamento && situacao !== null && situacao.aguardandoMotor === 0;

  return (
    <section className="painel admin-zerar" aria-label="Zerar portal">
      <h2>Zerar portal</h2>
      <p>
        Apaga tudo o que foi lançado nos testes: demandas (com histórico), pendentes, respostas das Cias, operações, efetivo
        enviado, resultados, EAP, ICC, Documentos Mensais enviados, fotos do TDS, recados e PDFs. Os eventos das demandas nas
        agendas (prazos e CFP) são apagados e as pastas do CFP vão para a lixeira do Drive.
      </p>
      <p>
        <strong>Ficam:</strong> banco de efetivo, contas e senhas, configurações (ex.: Documentos Mensais) e a agenda do CFP.{' '}
        <strong>Não são desfeitos:</strong> o que já foi gravado em planilhas do Drive (Documentos Mensais, EAP, ICC, aba
        Operações do numerador antigo) e os relatórios em Word.
      </p>

      {!emAndamento && (
        <form onSubmit={iniciar} noValidate>
          <Campo rotulo={`Para confirmar, digite ${PALAVRA_CONFIRMACAO}`} erro={erro} obrigatorio>
            <input autoCapitalize="characters" autoComplete="off" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
          </Campo>
          <button className="botao perigo" type="submit" disabled={ocupado}>
            {ocupado ? 'Zerando…' : '🧹 Zerar portal'}
          </button>
        </form>
      )}

      {emAndamento && situacao && (
        <div className="cartao">
          <p>
            <strong>Etapa 1 de 2 feita.</strong>{' '}
            {situacao.aguardandoMotor > 0
              ? `O motor está limpando agenda e pastas: faltam ${situacao.aguardandoMotor} de ${situacao.total} demanda(s). Ele roda a cada 5 minutos; pode deixar esta tela aberta.`
              : 'O motor já limpou agenda e pastas. Falta apagar as demandas e definir o número inicial.'}
          </p>
          {situacao.aguardandoMotor > 0 && (
            <button className="botao secundario" type="button" onClick={() => cutucarMotor()}>
              ↻ Chamar o motor agora
            </button>
          )}
          <Campo rotulo="Último número já usado (a próxima demanda será ele + 1)" erro={erroInicio} obrigatorio>
            <input inputMode="numeric" value={ultimo} onChange={(e) => setUltimo(e.target.value)} />
          </Campo>
          <button className="botao perigo" type="button" disabled={!pronta || ocupado} onClick={() => void concluir()}>
            {ocupado ? 'Apagando…' : 'Etapa 2: apagar demandas e concluir'}
          </button>
        </div>
      )}
      {erro && emAndamento && <p className="mensagem erro" role="alert">{erro}</p>}
      {aviso && <p className="mensagem aviso" role="status">{aviso}</p>}
    </section>
  );
}
