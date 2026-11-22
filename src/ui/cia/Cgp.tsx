import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  anexarOrdemLink,
  anexarOrdemPdf,
  apagarFotoCgp,
  apagarOrdemCgp,
  apagarRecadoCgp,
  enviarAoCgp,
  enviarFotosCgp,
  enviarRecadoCgp,
  excluirMissaoCgp,
  JaEnviadaAoCgp,
  lerFotoCgp,
  observarFotosCgp,
  lerOrdemPdf,
  observarMissoesCgp,
  observarOrdensCgp,
  observarRecadosCgp,
  type RecadoCgp,
} from '../../data/cgp';
import { entregarAoAparelho } from '../../data/arquivos';
import { useHash } from '../../lib/navegacao';
import { useAoVivo } from '../../lib/useAoVivo';
import {
  diasDoPeriodo,
  idMissaoCgp,
  nomeArquivoFotoCgp,
  missoesDoDia,
  proximasMissoes,
  tamanhoTexto,
  textoOrdemApagaEm,
  validarFotoCgp,
  validarLinkOrdem,
  validarPdfOrdem,
  validarPeriodo,
  type DadosFotoCgp,
  type ErrosFotoCgp,
  type ErrosPeriodo,
  type FotoCgp,
  type MissaoCgp,
  type OrdemCgp,
  type OrigemMissaoCgp,
} from '../../domain/cgp';
import { formatarData, hojeISO } from '../../domain/datas';
import { LIMITE_RECADO, quandoFoi, validarRecado } from '../../domain/recado';
import { LIMITE_ORIGINAL } from '../../domain/tds';
import { UNIDADES, type UnidadeId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { base64ParaBytes, reduzirFoto, type FotoReduzida } from '../../lib/imagem';
import { encaminharFotoP3, observarEncaminhadasDaCia } from '../../data/fotosEncaminhadas';
import { DIAS_NO_SISTEMA, textoApagaEm } from '../../domain/fotos';
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
  const [ordem, setOrdem] = useState<EscolhaOrdem>(SEM_ORDEM);
  const [erroOrdem, setErroOrdem] = useState('');
  const [progresso, setProgresso] = useState('');

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
    const eOrdem = erroDaEscolha(ordem, false);
    setErroOrdem(eOrdem);
    if (Object.keys(e).length || eOrdem) return;
    setOcupado(true);
    setErro('');
    let id = '';
    try {
      id = await enviarAoCgp(db, { unidade: p.unidade, origem: p.origem, refId: p.refId, numero: p.numero, titulo: p.titulo, periodo, criadoPor: autor(p.unidade) });
    } catch (x) {
      setErro(x instanceof JaEnviadaAoCgp ? x.message : 'Não foi possível enviar para o CGP. Tente de novo.');
      setOcupado(false);
      return;
    }
    try {
      await gravarEscolha(ordem, { id, unidadeId: p.unidade, fim: periodo.fim }, autor(p.unidade), setProgresso);
      setAberto(false);
    } catch {
      // A missão já foi; a ordem pode ser anexada depois na aba CGP.
      setErro('A missão foi enviada, mas a ordem de serviço não. Anexe pela aba CGP → Missões.');
    }
    setProgresso('');
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
      <EscolherOrdem valor={ordem} aoMudar={(v) => { setOrdem(v); setErroOrdem(''); }} erro={erroOrdem} opcional />
      {progresso && <p className="item-info" role="status">{progresso}</p>}
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

// ---------- Ordem de serviço da missão (PDF ou link do Google Drive) ----------

type EscolhaOrdem = { modo: 'pdf' | 'link'; pdf: File | null; link: string };
const SEM_ORDEM: EscolhaOrdem = { modo: 'pdf', pdf: null, link: '' };

/** Sem nada escolhido: '' se a ordem é opcional; senão, o erro do que falta. */
function erroDaEscolha(e: EscolhaOrdem, obrigatoria: boolean): string {
  if (e.modo === 'pdf') return e.pdf ? validarPdfOrdem(e.pdf) : obrigatoria ? 'Escolha o PDF da ordem de serviço.' : '';
  return e.link.trim() || obrigatoria ? validarLinkOrdem(e.link) : '';
}

async function gravarEscolha(e: EscolhaOrdem, m: Pick<MissaoCgp, 'id' | 'unidadeId' | 'fim'>, quem: string, aviso: (t: string) => void): Promise<boolean> {
  if (e.modo === 'pdf' && e.pdf) {
    aviso('Enviando a ordem de serviço…');
    await anexarOrdemPdf(db, m, e.pdf, quem, (f) => aviso(`Enviando a ordem de serviço… ${Math.round(f * 100)}%`));
    return true;
  }
  if (e.modo === 'link' && e.link.trim()) {
    await anexarOrdemLink(db, m, e.link, quem);
    return true;
  }
  return false;
}

function EscolherOrdem(p: { valor: EscolhaOrdem; aoMudar: (v: EscolhaOrdem) => void; erro: string; opcional?: boolean }) {
  const v = p.valor;
  const nome = useId();
  return (
    <fieldset className="cgp-ordem-escolha">
      <legend>Ordem de serviço{p.opcional ? ' (opcional)' : ''}</legend>
      <div className="opcoes-linha" role="radiogroup" aria-label="Como anexar a ordem de serviço">
        <label className="campo-check-linha">
          <input type="radio" name={nome} checked={v.modo === 'pdf'} onChange={() => p.aoMudar({ ...v, modo: 'pdf' })} />
          Arquivo PDF
        </label>
        <label className="campo-check-linha">
          <input type="radio" name={nome} checked={v.modo === 'link'} onChange={() => p.aoMudar({ ...v, modo: 'link' })} />
          Link do Google Drive
        </label>
      </div>
      {v.modo === 'pdf' ? (
        <Campo rotulo="PDF da ordem de serviço (até 10 MB)" erro={p.erro} obrigatorio={!p.opcional}>
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => p.aoMudar({ ...v, pdf: e.target.files?.[0] ?? null })} />
        </Campo>
      ) : (
        <Campo rotulo="Link da ordem de serviço no Google Drive" erro={p.erro} obrigatorio={!p.opcional}>
          <input
            type="url"
            inputMode="url"
            placeholder="https://drive.google.com/file/d/..."
            value={v.link}
            onChange={(e) => p.aoMudar({ ...v, link: e.target.value })}
          />
        </Campo>
      )}
      {v.modo === 'link' && (
        <p className="item-info">No Drive, compartilhe o arquivo com quem vai abrir (ou "Qualquer pessoa com o link"), senão o CGP vê "Acesso negado".</p>
      )}
    </fieldset>
  );
}

/** A ordem de serviço dentro da missão: o CGP abre/baixa; a Cia também anexa, troca e tira. */
function OrdemDaMissao({ missao, ordem, podeEditar }: { missao: MissaoCgp; ordem?: OrdemCgp; podeEditar: boolean }) {
  const [editando, setEditando] = useState(false);
  const [escolha, setEscolha] = useState<EscolhaOrdem>(SEM_ORDEM);
  const [erroCampo, setErroCampo] = useState('');
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aTirar, setATirar] = useState(false);

  async function abrir(baixar: boolean) {
    setErro('');
    // A janela abre já no clique (senão o navegador bloqueia); o PDF entra nela quando chegar.
    const janela = baixar ? null : window.open('', '_blank');
    setOcupado(true);
    try {
      const { nome, blob } = await lerOrdemPdf(db, missao.id);
      if (janela) {
        const url = URL.createObjectURL(blob);
        janela.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
      } else entregarAoAparelho(nome, blob);
    } catch {
      janela?.close();
      setErro('Não foi possível abrir a ordem de serviço. Tente de novo.');
    }
    setOcupado(false);
  }

  async function salvar() {
    const e = erroDaEscolha(escolha, true);
    setErroCampo(e);
    if (e) return;
    setOcupado(true);
    setErro('');
    try {
      await gravarEscolha(escolha, missao, autor(missao.unidadeId), setAviso);
      setEditando(false);
      setEscolha(SEM_ORDEM);
    } catch {
      setErro('Não foi possível anexar a ordem de serviço. Tente de novo.');
    }
    setAviso('');
    setOcupado(false);
  }

  async function tirar() {
    setOcupado(true);
    setErro('');
    try {
      await apagarOrdemCgp(db, missao.id);
    } catch {
      setErro('Não foi possível tirar a ordem de serviço. Tente de novo.');
    }
    setATirar(false);
    setOcupado(false);
  }

  if (editando) {
    return (
      <div className="cartao grupo cgp-ordem" role="group" aria-label={`Ordem de serviço de ${missao.numero}`}>
        <EscolherOrdem valor={escolha} aoMudar={(v) => { setEscolha(v); setErroCampo(''); }} erro={erroCampo} />
        {aviso && <p className="item-info" role="status">{aviso}</p>}
        {erro && <p className="mensagem erro" role="alert">{erro}</p>}
        <div className="acoes-linha">
          <button className="botao secundario" type="button" disabled={ocupado} onClick={() => setEditando(false)}>
            Cancelar
          </button>
          <button className="botao destaque" type="button" disabled={ocupado} onClick={salvar}>
            Anexar ordem de serviço
          </button>
        </div>
      </div>
    );
  }

  if (!ordem) {
    return podeEditar ? (
      <button className="botao secundario" type="button" onClick={() => setEditando(true)}>
        📎 Anexar ordem de serviço
      </button>
    ) : (
      <span className="pendente-detalhe">Sem ordem de serviço anexada.</span>
    );
  }

  return (
    <div className="cgp-ordem" role="group" aria-label={`Ordem de serviço de ${missao.numero}`}>
      <div className="acoes-linha">
        {ordem.tipo === 'link' ? (
          <a className="botao destaque" href={ordem.link} target="_blank" rel="noopener noreferrer">
            🔗 Abrir ordem de serviço (Google Drive)
          </a>
        ) : (
          <>
            <button className="botao destaque" type="button" disabled={ocupado} onClick={() => abrir(false)}>
              📄 Abrir ordem de serviço
            </button>
            <button className="botao secundario" type="button" disabled={ocupado} onClick={() => abrir(true)}>
              ⬇️ Baixar
            </button>
          </>
        )}
      </div>
      <span className="pendente-detalhe">
        {ordem.tipo === 'pdf' ? `${ordem.nome}${ordem.tamanho ? ` · ${tamanhoTexto(ordem.tamanho)}` : ''} · ` : ''}
        anexada por {ordem.enviadoPor} · {textoOrdemApagaEm(ordem.fim)}
      </span>
      {erro && <p className="mensagem erro" role="alert">{erro}</p>}
      {podeEditar &&
        (aTirar ? (
          <div className="acoes-linha" role="alertdialog" aria-label={`Confirmar retirada da ordem de ${missao.numero}`}>
            <span>Tirar a ordem de serviço?</span>
            <button className="botao secundario" type="button" onClick={() => setATirar(false)}>
              Cancelar
            </button>
            <button className="botao perigo" type="button" disabled={ocupado} onClick={tirar}>
              Tirar ordem
            </button>
          </div>
        ) : (
          <div className="acoes-linha">
            <button className="botao secundario" type="button" onClick={() => setEditando(true)}>
              Trocar ordem
            </button>
            <button className="botao secundario" type="button" onClick={() => setATirar(true)}>
              Tirar ordem
            </button>
          </div>
        ))}
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
      {aba === 'fotos' && <FotosCgp unidade={p.unidade} fotos={p.fotos} carregando={p.carregandoFotos} podeEncaminhar={!p.ehCgp} />}
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
  const ordens = useAoVivo<OrdemCgp[]>((ok, erro) => observarOrdensCgp(db, p.unidade, ok, erro), [p.unidade]);
  const ordemDe = (id: string) => ordens.valor?.find((o) => o.id === id);
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
        <OrdemDaMissao missao={m} ordem={ordemDe(m.id)} podeEditar={p.podeExcluir} />
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

function FotosCgp({ unidade, fotos, carregando, podeEncaminhar }: { unidade: UnidadeId; fotos: FotoCgp[]; carregando: boolean; podeEncaminhar: boolean }) {
  // A Cia encaminha à P/3 (o acesso do CGP não). Ids das já encaminhadas, para não mandar de novo.
  const encaminhadas = useAoVivo<Set<string>>(
    (ok, erro) => (podeEncaminhar ? observarEncaminhadasDaCia(db, unidade, ok, erro) : (ok(new Set()), () => undefined)),
    [unidade, podeEncaminhar],
  );
  const jaFoi = encaminhadas.valor ?? new Set<string>();
  const faltamEncaminhar = fotos.filter((f) => !jaFoi.has(f.id));
  const [encaminhando, setEncaminhando] = useState('');
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
      a.download = nomeArquivoFotoCgp(f);
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

  async function encaminhar(lista: FotoCgp[]) {
    setErro('');
    setAviso('');
    let feitas = 0;
    try {
      for (const f of lista) {
        setEncaminhando(`Encaminhando ${feitas + 1} de ${lista.length}…`);
        await encaminharFotoP3(db, f, autor(unidade));
        feitas++;
      }
      setAviso(`${feitas} foto(s) encaminhada(s) à P/3.`);
    } catch {
      setErro(`Não foi possível encaminhar${feitas ? ` (${feitas} de ${lista.length} foram)` : ''}. Verifique a conexão e tente de novo.`);
    }
    setEncaminhando('');
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
      <p className="item-info">
        Cada foto fica {DIAS_NO_SISTEMA} dias no sistema depois de importada e então é apagada sozinha. Baixe antes desse prazo.
        {podeEncaminhar && ' A foto encaminhada à P/3 fica com ela por mais ' + DIAS_NO_SISTEMA + ' dias, mesmo que seja apagada aqui.'}
      </p>
      {podeEncaminhar && faltamEncaminhar.length > 0 && (
        <div className="acoes-linha">
          <button className="botao secundario" type="button" disabled={!!encaminhando} onClick={() => encaminhar(faltamEncaminhar)}>
            Encaminhar {faltamEncaminhar.length === 1 ? 'a foto' : `as ${faltamEncaminhar.length} fotos`} à P/3
          </button>
        </div>
      )}
      {encaminhando && <p className="carregando">{encaminhando}</p>}
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
              <br />
              <span className="item-info">{textoApagaEm(f.enviadoEm)}</span>
              {podeEncaminhar && jaFoi.has(f.id) && (
                <>
                  <br />✅ Encaminhada à P/3
                </>
              )}
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
                {podeEncaminhar && !jaFoi.has(f.id) && (
                  <button className="botao secundario" type="button" disabled={!!encaminhando} onClick={() => encaminhar([f])}>
                    Encaminhar à P/3
                  </button>
                )}
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
