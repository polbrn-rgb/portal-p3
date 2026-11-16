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
import { alterarLista, observarListas } from '../../data/listas';
import {
  adicionarItem,
  alternarItem,
  conhecidos,
  ehFixo,
  INFO_LISTAS,
  listasPadrao,
  moverItem,
  TAMANHO_MAXIMO_ITEM,
  type ChaveLista,
  type ItemLista,
  type Listas,
} from '../../domain/listasConfig';
import { mensagemErroLogin } from '../../domain/mensagens';
import {
  ANO_NUMERACAO_POR_TIPO,
  ID_CONTADOR_GERAL,
  idContadorTipo,
  rotuloContador,
} from '../../domain/numeracao';
import { entrarAdmin, sairAdmin } from '../../lib/appAdmin';
import { cutucarMotor } from '../../lib/motor';
import { useAoVivo } from '../../lib/useAoVivo';
import { Campo } from '../Campo';

/** Motivo real da falha, para não ficar só "parou no meio". */
function motivo(falha: unknown): string {
  const codigo = (falha as { code?: string }).code ?? '';
  if (codigo === 'permission-denied') {
    return 'O banco recusou (permissão). Publique as regras novas: no terminal do projeto, "npm run deploy:regras", e tente de novo.';
  }
  if (codigo === 'resource-exhausted') return 'A cota grátis do dia do Firebase acabou. Tente de novo amanhã.';
  if (codigo === 'unavailable') return 'Sem conexão com o banco. Confira a internet e tente de novo.';
  return `Erro: ${codigo || (falha as Error)?.message || 'desconhecido'}.`;
}

type SubAbaAdmin = 'numeracao' | 'listas' | 'zerar';

const SUBABAS: { id: SubAbaAdmin; href: string; rotulo: string }[] = [
  { id: 'numeracao', href: '#/admin', rotulo: 'Numeração' },
  { id: 'listas', href: '#/admin/listas', rotulo: 'Listas do numerador' },
  { id: 'zerar', href: '#/admin/zerar', rotulo: 'Zerar portal' },
];

export function subAbaAdmin(rota: string): SubAbaAdmin {
  if (rota === '#/admin/listas') return 'listas';
  if (rota === '#/admin/zerar') return 'zerar';
  return 'numeracao';
}

/** Aba Administrador: senha própria (conta do Administrador), separada do login da P/3. Sub-abas no topo. */
export function Administrador({ rota }: { rota: string }) {
  const [db, setDb] = useState<Firestore | null>(null);
  // Saiu da aba Administrador: o Administrador sai junto (trocar de sub-aba não desloga).
  useEffect(() => () => void sairAdmin(), []);
  const ativa = subAbaAdmin(rota);

  if (!db) return <EntrarAdmin aoEntrar={setDb} />;
  return (
    <>
      <div className="admin-topo">
        <nav className="abas abas-p3 subabas" aria-label="Administrador">
          {SUBABAS.map((s) => (
            <a key={s.id} href={s.href} aria-current={ativa === s.id ? 'page' : undefined}>
              {s.rotulo}
            </a>
          ))}
        </nav>
        <button className="botao secundario" type="button" onClick={() => void sairAdmin().then(() => setDb(null))}>
          🔒 Sair do Administrador
        </button>
      </div>
      <ConteudoAdmin db={db} ativa={ativa} />
    </>
  );
}

function ConteudoAdmin({ db, ativa }: { db: Firestore; ativa: SubAbaAdmin }) {
  const listas = useAoVivo<Listas>((ok, erro) => observarListas(db, ok, erro), [db], 'Não foi possível carregar as listas.');
  const tipos = conhecidos(listas.valor ?? listasPadrao(), 'tiposSaida');
  if (ativa === 'listas') return <ManutencaoListas db={db} listas={listas.valor} erro={listas.erro} />;
  if (ativa === 'zerar') return <Zerar db={db} />;
  return <Numeracao db={db} tipos={tipos} />;
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

function Numeracao({ db, tipos }: { db: Firestore; tipos: readonly string[] }) {
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
    } catch (falha) {
      setErroLista(`Não foi possível ler os contadores. ${motivo(falha)}`);
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
      setAviso(`Pronto: ${rotuloContador(qual, tipos)} → a próxima será a ${lido + 1}.`);
      setUltimo('');
      setForcar(false);
      await recarregar();
    } catch (falha) {
      setErro(`Não foi possível gravar. ${motivo(falha)}`);
    } finally {
      setSalvando(false);
    }
  }

  const opcoes = [ID_CONTADOR_GERAL, ...tipos.map((t) => idContadorTipo(ano, t))];
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
            <span>{rotuloContador(ID_CONTADOR_GERAL, tipos)}</span>
            <strong>último {geral}</strong>
          </li>
          {doAno.map((c) => (
            <li key={c.id}>
              <span>{rotuloContador(c.id, tipos)}</span>
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
                {rotuloContador(id, tipos)}
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
    } catch (falha) {
      console.error('Zerar portal:', falha);
      setErro(`A zeragem parou no meio. ${motivo(falha)} Depois clique em "Zerar portal" de novo para continuar.`);
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
      setErroInicio(falha instanceof ZeragemNaoPronta ? falha.message : `Não foi possível concluir. ${motivo(falha)}`);
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

/** Manutenção das listas do numerador: incluir, retirar/reativar e mudar a ordem das opções. */
function ManutencaoListas({ db, listas, erro }: { db: Firestore; listas?: Listas; erro: string }) {
  const [chave, setChave] = useState<ChaveLista>('tiposSaida');
  const [novo, setNovo] = useState('');
  const [erroNovo, setErroNovo] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const titulo = INFO_LISTAS.find((i) => i.chave === chave)?.titulo ?? '';
  const itens = listas?.[chave] ?? [];

  async function aplicar(mudar: (l: ItemLista[]) => ItemLista[] | string, sucesso: string): Promise<boolean> {
    setOcupado(true);
    setAviso('');
    try {
      const problema = await alterarLista(db, chave, mudar);
      if (problema) {
        setAviso(problema);
        return false;
      }
      setAviso(sucesso);
      return true;
    } catch (falha) {
      setAviso(`Não foi possível gravar. ${motivo(falha)}`);
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function incluir(e: FormEvent) {
    e.preventDefault();
    const teste = adicionarItem(itens, novo);
    if (typeof teste === 'string') return setErroNovo(teste);
    setErroNovo('');
    if (await aplicar((l) => adicionarItem(l, novo), `"${novo.trim()}" incluído em ${titulo}.`)) setNovo('');
  }

  return (
    <section className="painel admin-listas" aria-label="Listas do numerador">
      <h2>Listas do numerador</h2>
      <p>
        São as opções que aparecem ao cadastrar uma demanda. <strong>Retirar</strong> tira o item só das demandas novas: as
        antigas continuam com ele, e dá para <strong>reativar</strong> depois. Itens com 🔒 são usados pelo sistema e não
        podem ser retirados.
      </p>
      {erro && <p className="mensagem erro" role="alert">{erro}</p>}
      <Campo rotulo="Lista" obrigatorio>
        <select value={chave} onChange={(e) => { setChave(e.target.value as ChaveLista); setAviso(''); setErroNovo(''); }}>
          {INFO_LISTAS.map((i) => (
            <option key={i.chave} value={i.chave}>
              {i.titulo}
            </option>
          ))}
        </select>
      </Campo>

      <ul className="lista-itens" aria-label={`Itens de ${titulo}`}>
        {itens.map((item, n) => (
          <li key={item.valor} className={item.ativo ? '' : 'retirado'}>
            <span className="item-valor">
              {ehFixo(chave, item.valor) && <span title="Usado pelo sistema">🔒 </span>}
              {item.valor}
              {!item.ativo && <em> (retirado)</em>}
            </span>
            <span className="item-acoes">
              <button className="botao secundario" type="button" aria-label={`Subir ${item.valor}`} disabled={ocupado || n === 0}
                onClick={() => void aplicar((l) => moverItem(l, item.valor, -1), `"${item.valor}" subiu.`)}>
                ↑
              </button>
              <button className="botao secundario" type="button" aria-label={`Descer ${item.valor}`} disabled={ocupado || n === itens.length - 1}
                onClick={() => void aplicar((l) => moverItem(l, item.valor, 1), `"${item.valor}" desceu.`)}>
                ↓
              </button>
              {!ehFixo(chave, item.valor) && (
                <button className={`botao ${item.ativo ? 'perigo' : 'destaque'}`} type="button" disabled={ocupado}
                  onClick={() => void aplicar((l) => alternarItem(chave, l, item.valor),
                    item.ativo ? `"${item.valor}" retirado das demandas novas.` : `"${item.valor}" reativado.`)}>
                  {item.ativo ? 'Retirar' : 'Reativar'}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      <form className="admin-incluir" onSubmit={incluir} noValidate>
        <Campo rotulo={`Incluir em ${titulo}`} erro={erroNovo} obrigatorio>
          <input maxLength={TAMANHO_MAXIMO_ITEM} value={novo} onChange={(e) => setNovo(e.target.value)} />
        </Campo>
        <button className="botao destaque" type="submit" disabled={ocupado || !listas}>
          + Incluir
        </button>
      </form>
      {aviso && <p className="mensagem aviso" role="status">{aviso}</p>}
    </section>
  );
}
