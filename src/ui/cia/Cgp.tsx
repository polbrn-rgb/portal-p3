import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  apagarFotoCgp,
  apagarRecadoCgp,
  enviarAoCgp,
  enviarFotosCgp,
  enviarRecadoCgp,
  excluirMissaoCgp,
  JaEnviadaAoCgp,
  lerFotoCgp,
  observarFotosCgp,
  observarMissoesCgp,
  observarRecadosCgp,
  type RecadoCgp,
} from '../../data/cgp';
import { useHash } from '../../lib/navegacao';
import { useAoVivo } from '../../lib/useAoVivo';
import {
  diasDoPeriodo,
  idMissaoCgp,
  missoesDoDia,
  proximasMissoes,
  validarFotoCgp,
  validarPeriodo,
  type DadosFotoCgp,
  type ErrosFotoCgp,
  type ErrosPeriodo,
  type FotoCgp,
  type MissaoCgp,
  type OrigemMissaoCgp,
} from '../../domain/cgp';
import { formatarData, hojeISO } from '../../domain/datas';
import { LIMITE_RECADO, quandoFoi, validarRecado } from '../../domain/recado';
import { LIMITE_ORIGINAL } from '../../domain/tds';
import { UNIDADES, type UnidadeId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { base64ParaBytes, reduzirFoto, type FotoReduzida } from '../../lib/imagem';
import { quemSou } from '../../lib/quemSou';
import { Campo } from '../Campo';

const autor = (unidade: UnidadeId) => quemSou() ?? UNIDADES.find((u) => u.id === unidade)?.sigla ?? unidade;
const periodoTexto = (m: { inicio: string; fim: string }) =>
  m.inicio === m.fim ? formatarData(m.inicio) : `${formatarData(m.inicio)} até ${formatarData(m.fim)}`;

/** A missão do CGP ligada a esta demanda, se já foi enviada. */
export function missaoDe(missoes: MissaoCgp[], unidade: UnidadeId, origem: OrigemMissaoCgp, refId: string): MissaoCgp | undefined {
  const id = idMissaoCgp(unidade, origem, refId);
  return missoes.find((m) => m.id === id);
}

/**
 * "Enviar para o CGP": abre o período (de/até, com o calendário). Se a demanda já foi para o CGP,
 * mostra o aviso no lugar do botão (não duplica serviço).
 */
export function EnviarAoCgp(p: {
  unidade: UnidadeId;
  origem: OrigemMissaoCgp;
  refId: string;
  numero: string;
  titulo: string;
  /** Sugestão para o último dia (ex.: o prazo). */
  fimSugerido?: string;
  missoes: MissaoCgp[];
}) {
  const ja = missaoDe(p.missoes, p.unidade, p.origem, p.refId);
  const hoje = hojeISO();
  const [aberto, setAberto] = useState(false);
  const [periodo, setPeriodo] = useState({ inicio: hoje, fim: p.fimSugerido && p.fimSugerido >= hoje ? p.fimSugerido : hoje });
  const [erros, setErros] = useState<ErrosPeriodo>({});
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  if (ja) {
    return (
      <p className="mensagem aviso cgp-ja" role="status">
        ✅ Já enviada para o CGP ({periodoTexto(ja)}) por {ja.criadoPor}. Para mudar, exclua na aba CGP.
      </p>
    );
  }
  if (!aberto) {
    return (
      <button className="botao secundario" type="button" onClick={() => setAberto(true)}>
        ➕ Enviar para o CGP
      </button>
    );
  }

  async function enviar() {
    const e = validarPeriodo(periodo);
    setErros(e);
    if (Object.keys(e).length) return;
    setOcupado(true);
    setErro('');
    try {
      await enviarAoCgp(db, { unidade: p.unidade, origem: p.origem, refId: p.refId, numero: p.numero, titulo: p.titulo, periodo, criadoPor: autor(p.unidade) });
      setAberto(false);
    } catch (x) {
      setErro(x instanceof JaEnviadaAoCgp ? x.message : 'Não foi possível enviar para o CGP. Tente de novo.');
    }
    setOcupado(false);
  }

  const dias = diasDoPeriodo(periodo);
  return (
    <div className="cartao grupo cgp-periodo" role="group" aria-label="Enviar para o CGP">
      <strong>Enviar para o CGP — quanto tempo dura?</strong>
      <div className="grade">
        <Campo rotulo="De" erro={erros.inicio} obrigatorio>
          <input
            type="date"
            value={periodo.inicio}
            onChange={(e) => {
              const v = e.target.value;
              setPeriodo((x) => ({ ...x, inicio: v }));
            }}
          />
        </Campo>
        <Campo rotulo="Até" erro={erros.fim} obrigatorio>
          <input
            type="date"
            value={periodo.fim}
            min={periodo.inicio}
            onChange={(e) => {
              const v = e.target.value;
              setPeriodo((x) => ({ ...x, fim: v }));
            }}
          />
        </Campo>
      </div>
      {dias > 0 && (
        <p className="item-info">
          {periodoTexto(periodo)} · {dias} dia{dias > 1 ? 's' : ''}
        </p>
      )}
      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}
      <div className="acoes-linha">
        <button className="botao secundario" type="button" disabled={ocupado} onClick={() => setAberto(false)}>
          Cancelar
        </button>
        <button className="botao destaque" type="button" disabled={ocupado} onClick={enviar}>
          Enviar para o CGP
        </button>
      </div>
    </div>
  );
}

type SubAba = 'missoes' | 'fotos' | 'recados';

export function subAbaCgp(hash: string): SubAba {
  if (hash.startsWith('#/cgp/fotos')) return 'fotos';
  if (hash.startsWith('#/cgp/recados')) return 'recados';
  return 'missoes';
}

/** Quem entra com o acesso de CGP (por RE): só a página do CGP da Cia dele. */
export function PaginaCgp({ unidade, sigla }: { unidade: UnidadeId; sigla: string }) {
  const hash = useHash();
  const missoes = useAoVivo<MissaoCgp[]>((ok, erro) => observarMissoesCgp(db, unidade, ok, erro), [unidade], 'Não foi possível carregar as missões.');
  const recados = useAoVivo<RecadoCgp[]>((ok, erro) => observarRecadosCgp(db, unidade, ok, erro), [unidade]);
  const naAbaFotos = hash.startsWith('#/cgp/fotos');
  const fotos = useAoVivo<FotoCgp[]>(
    (ok, erro) => {
      if (!naAbaFotos) {
        ok([]);
        return () => undefined;
      }
      return observarFotosCgp(db, unidade, ok, erro);
    },
    [unidade, naAbaFotos],
    'Não foi possível carregar as fotos.',
  );
  return (
    <>
      <h2 className="titulo-aba-cia">{sigla}</h2>
      <PainelCgp
        unidade={unidade}
        hash={hash}
        missoes={missoes.valor ?? []}
        carregando={missoes.carregando}
        erro={missoes.erro}
        recados={recados.valor ?? []}
        fotos={fotos.valor ?? []}
        carregandoFotos={fotos.carregando}
        ehCgp
      />
    </>
  );
}

/** Página do CGP: Missões, Fotos e Recados. Na Cia (administra) ou no acesso do próprio CGP (ehCgp). */
export function PainelCgp(p: {
  ehCgp?: boolean;
  unidade: UnidadeId;
  hash: string;
  missoes: MissaoCgp[];
  carregando: boolean;
  erro: string;
  recados: RecadoCgp[];
  fotos: FotoCgp[];
  carregandoFotos: boolean;
}) {
  const aba = subAbaCgp(p.hash);
  const link = (id: SubAba, href: string, rotulo: string) => (
    <a href={href} aria-current={aba === id ? 'page' : undefined}>
      {rotulo}
    </a>
  );
  return (
    <>
      {p.recados.length > 0 && aba !== 'recados' && <ListaRecadosCgp unidade={p.unidade} recados={p.recados} podeApagar={false} />}
      <nav className="abas abas-p3 subabas" aria-label="Página do CGP">
        {link('missoes', '#/cgp', 'Missões')}
        {link('fotos', '#/cgp/fotos', 'Importação de fotos')}
        {link('recados', '#/cgp/recados', 'Recados')}
      </nav>
      {aba === 'missoes' && <MissoesCgp unidade={p.unidade} lista={p.missoes} carregando={p.carregando} erro={p.erro} podeExcluir={!p.ehCgp} />}
      {aba === 'fotos' && <FotosCgp unidade={p.unidade} fotos={p.fotos} carregando={p.carregandoFotos} />}
      {aba === 'recados' &&
        (p.ehCgp ? (
          p.recados.length ? (
            <ListaRecadosCgp unidade={p.unidade} recados={p.recados} podeApagar={false} />
          ) : (
            <section className="painel">
              <p className="vazio">Nenhum recado da Cia.</p>
            </section>
          )
        ) : (
          <RecadosCgp unidade={p.unidade} recados={p.recados} />
        ))}
    </>
  );
}

function MissoesCgp(p: { unidade: UnidadeId; lista: MissaoCgp[]; carregando: boolean; erro: string; podeExcluir: boolean }) {
  const [dia, setDia] = useState(hojeISO);
  const [aExcluir, setAExcluir] = useState('');
  const [aviso, setAviso] = useState('');
  const doDia = missoesDoDia(p.lista, dia);
  const proximas = proximasMissoes(p.lista, dia);

  async function excluir(m: MissaoCgp) {
    setAviso('');
    try {
      await excluirMissaoCgp(db, m.id);
      setAviso(`${m.numero} saiu do CGP.`);
    } catch {
      setAviso('Não foi possível excluir. Tente de novo.');
    }
    setAExcluir('');
  }

  const item = (m: MissaoCgp) => (
    <li key={m.id}>
      <article className="item-pendente" aria-label={m.titulo}>
        <span className="item-topo">
          <strong>{m.numero}</strong>
          <span className="pendente-data">{periodoTexto(m)}</span>
        </span>
        <h3 className="pendente-assunto">{m.titulo}</h3>
        <span className="pendente-detalhe">
          {m.origem === 'numerador' ? 'Numerador da Cia' : 'Demanda da P/3'} · enviada por {m.criadoPor}
        </span>
        {!p.podeExcluir ? null : aExcluir === m.id ? (
          <div className="acoes-linha" role="alertdialog" aria-label={`Confirmar exclusão de ${m.numero}`}>
            <span>Tirar do CGP?</span>
            <button className="botao secundario" type="button" onClick={() => setAExcluir('')}>
              Cancelar
            </button>
            <button className="botao perigo" type="button" onClick={() => excluir(m)}>
              Excluir
            </button>
          </div>
        ) : (
          <button className="botao secundario" type="button" onClick={() => setAExcluir(m.id)}>
            Excluir do CGP
          </button>
        )}
      </article>
    </li>
  );

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Missões do CGP</h2>
      </div>
      {p.podeExcluir && <p className="item-info">Envie pelo Numerador ou pelas demandas da P/3 (botão "Enviar para o CGP").</p>}
      <div className="acoes-linha">
        <label className="campo">
          Data
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value || hojeISO())} />
        </label>
        <button className="botao secundario" type="button" onClick={() => setDia(hojeISO())}>
          Hoje
        </button>
      </div>
      {aviso && (
        <p className="mensagem aviso" role="status">
          {aviso}
        </p>
      )}
      {p.erro && <p className="mensagem erro">{p.erro}</p>}
      {p.carregando && <p className="carregando">Carregando…</p>}
      <h3>{dia === hojeISO() ? 'Missões de hoje' : `Missões de ${formatarData(dia)}`}</h3>
      {!p.carregando && doDia.length === 0 && <p className="vazio">Nenhuma missão em {formatarData(dia)}.</p>}
      <ul className="lista lista-pendentes">{doDia.map(item)}</ul>
      {proximas.length > 0 && (
        <>
          <h3>Próximas missões</h3>
          <ul className="lista lista-pendentes">{proximas.map(item)}</ul>
        </>
      )}
    </section>
  );
}

function ListaRecadosCgp({ recados, podeApagar }: { unidade: UnidadeId; recados: RecadoCgp[]; podeApagar: boolean }) {
  const [erro, setErro] = useState('');
  return (
    <section className="painel recados" aria-label="Recados para o CGP">
      {erro && <p className="mensagem erro">{erro}</p>}
      <ul className="lista lista-recados">
        {recados.map((r) => (
          <li key={r.id}>
            <article className="cartao-recado" aria-label="Recado para o CGP">
              <span className="item-topo">
                <strong>📢 Recado{r.criadoPor ? ` de ${r.criadoPor}` : ''}</strong>
                <span className="pendente-data">{quandoFoi(r.criadoEm)}</span>
              </span>
              <p className="recado-texto">{r.texto}</p>
              {podeApagar && (
                <button
                  className="botao secundario"
                  type="button"
                  onClick={() => apagarRecadoCgp(db, r.id).catch(() => setErro('Não foi possível apagar o recado.'))}
                >
                  Apagar recado
                </button>
              )}
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecadosCgp({ unidade, recados }: { unidade: UnidadeId; recados: RecadoCgp[] }) {
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const problema = validarRecado(texto);
    setErro(problema);
    if (problema) return;
    setEnviando(true);
    try {
      await enviarRecadoCgp(db, unidade, texto, autor(unidade));
      setTexto('');
      setAviso('Recado enviado. Aparece no alto da página do CGP.');
    } catch {
      setErro('Não foi possível enviar. Tente de novo.');
    }
    setEnviando(false);
  }

  return (
    <>
      <section className="painel">
        <div className="painel-cabecalho">
          <h2>Recados para o CGP</h2>
        </div>
        <form className="cartao-recado" onSubmit={enviar} noValidate>
          <Campo rotulo="Recado" erro={erro} obrigatorio>
            <textarea rows={4} maxLength={LIMITE_RECADO} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </Campo>
          <div className="acoes-linha">
            <button className="botao destaque" type="submit" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar recado'}
            </button>
          </div>
        </form>
        {aviso && (
          <p className="mensagem aviso" role="status">
            {aviso}
          </p>
        )}
        {recados.length === 0 && <p className="vazio">Nenhum recado enviado.</p>}
      </section>
      {recados.length > 0 && <ListaRecadosCgp unidade={unidade} recados={recados} podeApagar />}
    </>
  );
}

type Escolhida = { arquivo: File; url: string };
const DADOS_VAZIOS: DadosFotoCgp = { descricao: '', local: '', observacao: '' };

function FotosCgp({ unidade, fotos, carregando }: { unidade: UnidadeId; fotos: FotoCgp[]; carregando: boolean }) {
  const [dados, setDados] = useState<DadosFotoCgp>(DADOS_VAZIOS);
  const [escolhidas, setEscolhidas] = useState<Escolhida[]>([]);
  const [erros, setErros] = useState<ErrosFotoCgp>({});
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [etapa, setEtapa] = useState('');
  const [confirmarId, setConfirmarId] = useState('');
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  function escolher(lista: FileList | null) {
    if (!lista?.length) return;
    const novas = Array.from(lista).map((arquivo) => {
      const url = URL.createObjectURL(arquivo);
      urls.current.push(url);
      return { arquivo, url };
    });
    setEscolhidas((a) => [...a, ...novas]);
    setErros((e) => ({ ...e, fotos: undefined }));
    setAviso('');
  }

  function tirar(url: string) {
    URL.revokeObjectURL(url);
    setEscolhidas((a) => a.filter((x) => x.url !== url));
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setAviso('');
    const v = validarFotoCgp(dados, escolhidas.length);
    if (escolhidas.some((x) => x.arquivo.size > LIMITE_ORIGINAL)) v.fotos = 'Alguma foto passa de 40 MB.';
    setErros(v);
    if (Object.keys(v).length) return;
    try {
      const reduzidas: FotoReduzida[] = [];
      for (const [i, x] of escolhidas.entries()) {
        setEtapa(`Preparando ${i + 1} de ${escolhidas.length}…`);
        reduzidas.push(await reduzirFoto(x.arquivo));
      }
      const feitas = await enviarFotosCgp(db, unidade, dados, reduzidas, autor(unidade), (n) => setEtapa(`Enviando ${n} de ${reduzidas.length}…`));
      escolhidas.forEach((x) => URL.revokeObjectURL(x.url));
      setEscolhidas([]);
      setDados(DADOS_VAZIOS);
      setAviso(`${feitas} foto(s) importada(s).`);
    } catch {
      setErro('Não foi possível importar as fotos. Verifique a conexão e tente de novo.');
    }
    setEtapa('');
  }

  async function baixar(f: FotoCgp) {
    try {
      const bytes = base64ParaBytes(await lerFotoCgp(db, f.id));
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `CGP ${f.descricao} - ${f.local}.jpg`.replace(/[\\/:*?"<>|]/g, '-');
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setErro('Não foi possível baixar a foto.');
    }
  }

  async function apagar(id: string) {
    try {
      await apagarFotoCgp(db, id);
      setAviso('Foto apagada.');
    } catch {
      setErro('Não foi possível apagar a foto.');
    }
    setConfirmarId('');
  }

  // O valor é lido na hora (ler e.target dentro da atualização adiada pode perder o que foi digitado).
  const mudar = (k: keyof DadosFotoCgp) => (e: { target: { value: string } }) => {
    const v = e.target.value;
    setDados((d) => ({ ...d, [k]: v }));
  };
  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Importação de fotos</h2>
      </div>
      <form className="cartao grupo" onSubmit={enviar} noValidate>
        <Campo rotulo="Descrição" erro={erros.descricao} obrigatorio>
          <input value={dados.descricao} placeholder="Ex.: Operação, Intensificação" onChange={mudar('descricao')} />
        </Campo>
        <Campo rotulo="Local da foto" erro={erros.local} obrigatorio>
          <input value={dados.local} onChange={mudar('local')} />
        </Campo>
        <Campo rotulo="Observação" erro={erros.observacao} obrigatorio>
          <input value={dados.observacao} placeholder="Equipe, local, viatura" onChange={mudar('observacao')} />
        </Campo>
        <Campo rotulo="Fotos (sem limite)" erro={erros.fotos} obrigatorio>
          <input type="file" accept="image/*" multiple onChange={(e) => { escolher(e.target.files); e.target.value = ''; }} />
        </Campo>
        {escolhidas.length > 0 && (
          <ul className="grade-fotos">
            {escolhidas.map((x) => (
              <li key={x.url}>
                <img src={x.url} alt={x.arquivo.name} />
                <button className="botao secundario" type="button" onClick={() => tirar(x.url)}>
                  Tirar
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="item-info">Fica registrado quem importou ({autor(unidade)}) e a data.</p>
        {etapa && <p className="carregando">{etapa}</p>}
        <div className="acoes-linha">
          <button className="botao destaque" type="submit" disabled={!!etapa}>
            Importar {escolhidas.length || ''} foto{escolhidas.length === 1 ? '' : 's'}
          </button>
        </div>
      </form>
      {aviso && (
        <p className="mensagem aviso" role="status">
          {aviso}
        </p>
      )}
      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}
      <h3>Fotos importadas ({fotos.length})</h3>
      {carregando && <p className="carregando">Carregando…</p>}
      {!carregando && fotos.length === 0 && <p className="vazio">Nenhuma foto importada.</p>}
      <ul className="grade-fotos">
        {fotos.map((f) => (
          <li key={f.id}>
            <img src={`data:image/jpeg;base64,${f.miniatura}`} alt={`${f.descricao} — ${f.local}`} />
            <span className="legenda-foto">
              <strong>{f.descricao}</strong> · {f.local}
              <br />
              {f.observacao}
              <br />
              Importada por {f.enviadoPor} em {quandoFoi(f.enviadoEm)}
            </span>
            {confirmarId === f.id ? (
              <div className="confirmar-foto" role="alertdialog" aria-label="Confirmar exclusão da foto">
                <p>Apagar esta foto? Não dá para desfazer.</p>
                <button className="botao secundario" type="button" onClick={() => setConfirmarId('')}>
                  Cancelar
                </button>
                <button className="botao perigo" type="button" onClick={() => apagar(f.id)}>
                  Apagar
                </button>
              </div>
            ) : (
              <span className="acoes-linha">
                <button className="botao secundario" type="button" onClick={() => baixar(f)}>
                  Baixar
                </button>
                <button className="botao secundario" type="button" onClick={() => setConfirmarId(f.id)}>
                  Apagar
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
