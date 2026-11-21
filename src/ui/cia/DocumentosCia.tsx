import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { enviarDocMensal } from '../../data/documentosMensais';
import { buscarPolicial } from '../../data/efetivo';
import { observarProducaoDaCia } from '../../data/producao';
import { formatarData, hojeISO } from '../../domain/datas';
import { observarIccs, observarRespostasIccDaUnidade } from '../../data/icc';
import type { Icc, RespostaIcc } from '../../domain/icc';
import { DA_PRODUCAO_ANO_ANTERIOR, divergencias, iccDoMes, preencherDaProducao, temIntegracao } from '../../domain/integracao';
import { somarMeses } from '../../domain/rac';
import type { Producao } from '../../domain/producao';
import {
  camposDaUnidade,
  daUnidade,
  documentosDoMes,
  lerValores,
  linhasDosValores,
  maxLinhas,
  prazoDoDocumento,
  valoresDaLista,
  type LinhaLista,
  ROTULO_SITUACAO_ENVIO,
  rotuloSituacao,
  situacaoDoDocumento,
  situacaoEnvio,
  urlAbaDaCia,
  type DocumentoMensal,
  type EnvioMensal,
} from '../../domain/documentosMensais';
import { rotuloMes } from '../../domain/controle';
import type { UnidadeId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { cutucarMotor } from '../../lib/motor';
import { irPara } from '../../lib/navegacao';
import { quemSou } from '../../lib/quemSou';
import { useAoVivo } from '../../lib/useAoVivo';
import { Campo } from '../Campo';

const CHAVE_NOME = 'portalp3.respondidoPor';

/** Documentos que esta Cia preenche no mês de referência. */
export function documentosDaUnidade(u: UnidadeId, mesRef: string): DocumentoMensal[] {
  return documentosDoMes(mesRef).filter((d) => daUnidade(d, u));
}

export function contarPendentesDocs(u: UnidadeId, mesRef: string, envios: EnvioMensal[]): number {
  return documentosDaUnidade(u, mesRef).filter((d) => !envios.some((e) => e.docId === d.id)).length;
}

export function ListaDocumentosCia(p: { unidade: UnidadeId; mesRef: string; envios: EnvioMensal[]; carregando: boolean }) {
  const docs = documentosDaUnidade(p.unidade, p.mesRef).sort((a, b) => a.diaUtil - b.diaUtil);
  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Documentos Mensais</h2>
      </div>
      <p className="ajuda-pendentes">
        Dados de {rotuloMes(p.mesRef)}. Preencha até o dia útil de cada documento; se não houver quantidade, coloque 0.
      </p>
      {p.carregando && <p className="carregando">Carregando…</p>}
      <ul className="lista lista-pendentes">
        {docs.map((d) => {
          const prazo = prazoDoDocumento(d, p.mesRef);
          const s = situacaoDoDocumento(
            d,
            p.envios.find((e) => e.docId === d.id),
            prazo,
          );
          return (
            <li key={d.id}>
              <a className={`item-pendente link-cartao borda-doc-${s}`} href={`#/documentos/${d.id}`}>
                <span className="item-topo">
                  <strong className="pendente-assunto">{d.nome}</strong>
                  <span className={`selo selo-doc-${s}`}>{rotuloSituacao(d, s)}</span>
                </span>
                <span className="pendente-detalhe">
                  {d.direto ? 'Direto na planilha · ' : ''}
                  Prazo {formatarData(prazo)} ({d.diaUtil}º dia útil)
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function lerNome(): string {
  try {
    return localStorage.getItem(CHAVE_NOME) ?? '';
  } catch {
    return '';
  }
}

export function FormDocumentoCia(p: { documento: DocumentoMensal; unidade: UnidadeId; mesRef: string; envio?: EnvioMensal }) {
  const d = p.documento;
  const campos = camposDaUnidade(d, p.unidade);
  const [rascunho, setRascunho] = useState<Record<string, string>>(() =>
    Object.fromEntries(campos.map((c) => [c.id, p.envio?.valores[c.id] !== undefined ? String(p.envio.valores[c.id]) : ''])),
  );
  const [linhas, setLinhas] = useState<LinhaLista[]>(() => (d.lista && p.envio ? linhasDosValores(d, p.unidade, p.envio.valores) : []));
  const [nome, setNome] = useState(quemSou() ?? (p.envio?.respondidoPor || lerNome()));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const prazo = prazoDoDocumento(d, p.mesRef);
  const s = situacaoEnvio(p.envio, prazo);

  // Produção dos pelotões do mês: pré-preenche o que existe nela (só com a produção completa).
  const integrado = temIntegracao(d.id);
  const producao = useAoVivo<Producao[]>(
    (ok, falha) => (integrado ? observarProducaoDaCia(db, p.unidade, p.mesRef, ok, falha) : (ok([]), () => undefined)),
    [integrado, p.unidade, p.mesRef],
    'Não foi possível conferir a produção dos pelotões.',
  );
  // Colunas "ano anterior" (Avaliação Periódica): a produção do mesmo mês do ano anterior, se completa.
  const comAnoAnterior = d.id in DA_PRODUCAO_ANO_ANTERIOR;
  const mesAnoAnterior = somarMeses(p.mesRef, -12);
  const producaoAnoAnterior = useAoVivo<Producao[]>(
    (ok, falha) => (comAnoAnterior ? observarProducaoDaCia(db, p.unidade, mesAnoAnterior, ok, falha) : (ok([]), () => undefined)),
    [comAnoAnterior, p.unidade, mesAnoAnterior],
  );
  // Plano Diretor: policiais na ICC do mês, das respostas da Cia no módulo ICC.
  const comIcc = d.id === 'plano-diretor';
  const iccs = useAoVivo<Icc[]>((ok, falha) => (comIcc ? observarIccs(db, ok, falha) : (ok([]), () => undefined)), [comIcc]);
  const respostasIcc = useAoVivo<RespostaIcc[]>(
    (ok, falha) => (comIcc ? observarRespostasIccDaUnidade(db, p.unidade, ok, falha) : (ok([]), () => undefined)),
    [comIcc, p.unidade],
  );
  const pre =
    integrado && producao.valor && !producaoAnoAnterior.carregando
      ? preencherDaProducao(d.id, campos.map((c) => c.id), producao.valor, p.mesRef, p.unidade, hojeISO(), producaoAnoAnterior.valor)
      : null;
  const icc = comIcc && iccs.valor && respostasIcc.valor ? iccDoMes(iccs.valor, respostasIcc.valor, p.mesRef) : null;
  // Tudo o que veio pronto (produção e ICC): ponto de partida que a Cia confere.
  const preValores: Record<string, number> = { ...(pre?.valores ?? {}), ...(icc !== null && campos.some((c) => c.id === 'icc') ? { icc } : {}) };
  const temPre = Object.keys(preValores).length > 0;
  const preenchido = useRef(false);
  useEffect(() => {
    if (!temPre || preenchido.current) return;
    preenchido.current = true;
    // Só completa o que está vazio: não apaga o que a Cia já enviou ou está digitando.
    setRascunho((r) => {
      const n = { ...r };
      for (const [c, v] of Object.entries(preValores)) if (!String(n[c] ?? '').trim()) n[c] = String(v).replace('.', ',');
      return n;
    });
  }, [temPre, preValores]);

  async function enviar() {
    const { valores, erros: e } = d.lista ? valoresDaLista(d, p.unidade, linhas) : lerValores(d, p.unidade, rascunho);
    if (!nome.trim()) e.__nome = 'Informe quem preencheu (posto/graduação e nome).';
    setErros(e);
    setErro('');
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      // O envio aparece na hora (o banco confirma em seguida); se a conexão estiver lenta, não prende a Cia na tela.
      const envio = enviarDocMensal(db, {
        docId: d.id,
        mesRef: p.mesRef,
        unidadeId: p.unidade,
        valores,
        respondidoPor: nome,
        daProducao: temPre ? preValores : undefined,
      });
      envio.catch(() => undefined);
      await Promise.race([envio, new Promise((ok) => setTimeout(ok, 3000))]);
      try {
        localStorage.setItem(CHAVE_NOME, nome.trim());
      } catch {
        /* sem armazenamento: segue */
      }
      cutucarMotor();
      irPara('#/documentos');
    } catch {
      setErro('Não foi possível enviar. Verifique a conexão e tente de novo.');
      setEnviando(false);
    }
  }

  // Agrupa os campos pelo título do grupo, na ordem da planilha.
  const grupos: { titulo: string; campos: typeof campos }[] = [];
  for (const c of campos.filter((x) => !x.daLista)) {
    const t = c.grupo ?? '';
    if (grupos.at(-1)?.titulo !== t) grupos.push({ titulo: t, campos: [] });
    grupos.at(-1)!.campos.push(c);
  }

  return (
    <section className="painel painel-estreito">
      <div className="painel-cabecalho">
        <h2>{d.nome}</h2>
        <span className={`selo selo-doc-${s}`}>{ROTULO_SITUACAO_ENVIO[s]}</span>
      </div>
      <p className="ajuda-pendentes">
        Dados de {rotuloMes(p.mesRef)} · prazo {formatarData(prazo)} ({d.diaUtil}º dia útil). Se não houver quantidade, coloque 0.
      </p>
      {p.envio?.erro && !p.envio.gravado && (
        <p className="mensagem erro" role="alert">
          A P/3 foi avisada: {p.envio.erro}
        </p>
      )}
      {integrado && <AvisoProducao carregando={producao.carregando} erro={producao.erro} pre={pre} mesRef={p.mesRef} />}
      {comIcc && icc !== null && (
        <p className="mensagem aviso" role="status">
          🔗 Policiais na ICC: {icc}, somados das respostas da Cia às ICC com prazo em {rotuloMes(p.mesRef)} (Aperfeiçoamento → ICC). Confira antes de enviar.
        </p>
      )}
      {d.lista && <ListaCia documento={d} unidade={p.unidade} linhas={linhas} aoMudar={setLinhas} erros={erros} />}
      {grupos.map((g) => (
        <fieldset key={g.titulo || 'campos'} className="cartao grupo">
          {g.titulo && <legend className="legenda-grupo">{g.titulo}</legend>}
          <div className="grade-2">
            {g.campos.map((c) => (
              <Campo
                key={c.id}
                rotulo={
                  c.id in preValores ? (
                    <>
                      {c.rotulo} 🔗
                      {divergencias(preValores, { [c.id]: Number(String(rascunho[c.id]).replace(',', '.')) }).length > 0 && (
                        <span className="dica-producao"> · veio: {String(preValores[c.id]).replace('.', ',')}</span>
                      )}
                    </>
                  ) : (
                    c.rotulo
                  )
                }
                obrigatorio={!c.texto || c.obrigatorio}
                erro={erros[c.id]}
                className={c.texto ? 'campo-largo' : undefined}
              >
                {c.texto ? (
                  <textarea rows={2} value={rascunho[c.id]} onChange={(e) => setRascunho({ ...rascunho, [c.id]: e.target.value })} />
                ) : (
                  <input
                    inputMode={c.decimal ? 'decimal' : 'numeric'}
                    value={rascunho[c.id]}
                    onChange={(e) => setRascunho({ ...rascunho, [c.id]: e.target.value })}
                  />
                )}
              </Campo>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="cartao grupo">
        <Campo rotulo="Preenchido por" obrigatorio erro={erros.__nome}>
          <input value={nome} readOnly={Boolean(quemSou())} placeholder="Posto/graduação e nome" autoComplete="name" onChange={(e) => setNome(e.target.value)} />
        </Campo>
      </div>
      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}
      <div className="barra-acoes">
        <a className="botao secundario" href="#/documentos">
          Voltar
        </a>
        <button className="botao destaque" type="button" disabled={enviando} onClick={enviar}>
          {enviando ? 'Enviando…' : p.envio ? 'Atualizar envio' : integrado ? 'Conferi: enviar para a P/3' : 'Enviar'}
        </button>
      </div>
    </section>
  );
}

function AvisoProducao(p: { carregando: boolean; erro: string; pre: ReturnType<typeof preencherDaProducao> | null; mesRef: string }) {
  if (p.erro)
    return (
      <p className="mensagem erro" role="alert">
        {p.erro} Abra de novo para tentar.
      </p>
    );
  if (p.carregando || !p.pre) return <p className="carregando">Conferindo a produção dos pelotões…</p>;
  if (!p.pre.completa) {
    const lista = p.pre.pendencias.map((x) => `${formatarData(x.data)} (${[x.faltaDia && 'dia', x.faltaNoite && 'noite'].filter(Boolean).join(' e ')})`);
    return (
      <div className="mensagem atencao" role="alert">
        <p>
          <strong>Produção dos pelotões de {rotuloMes(p.mesRef)} incompleta</strong>
          {p.pre.turnosFaltando ? `: faltam ${p.pre.turnosFaltando} turno(s) em ${lista.length} dia(s).` : ': o mês ainda não terminou.'} Por isso
          este documento não veio pré-preenchido: complete a produção (ele preenche sozinho ao abrir de novo) ou preencha à mão. Quem confere e
          envia é a Cia. A P/3 está vendo este alerta.
        </p>
        {lista.length > 0 && <p>Faltam: {lista.join(', ')}.</p>}
        <a className="botao secundario" href="#/sala">
          Ir para a Sala de Operações
        </a>
      </div>
    );
  }
  return (
    <>
      <p className="mensagem aviso" role="status">
        Os campos com 🔗 vieram somados da produção dos pelotões de {rotuloMes(p.mesRef)}. Confira e corrija se preciso antes de enviar para a P/3.
      </p>
      {p.pre.avisos.map((a) => (
        <p key={a} className="mensagem atencao">
          {a}
        </p>
      ))}
    </>
  );
}

/** Documento preenchido direto na planilha (ex.: R.R.): link para a aba da Cia e confirmação do preenchimento. */
export function ConfirmarDocumentoDireto(p: { documento: DocumentoMensal; unidade: UnidadeId; mesRef: string; envio?: EnvioMensal }) {
  const d = p.documento;
  const aba = d.direto?.abas[p.unidade];
  const [nome, setNome] = useState(quemSou() ?? (p.envio?.respondidoPor || lerNome()));
  const [erroNome, setErroNome] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const prazo = prazoDoDocumento(d, p.mesRef);
  const s = situacaoDoDocumento(d, p.envio, prazo);
  if (!aba) return <p className="mensagem erro">Este documento não é preenchido por esta Cia.</p>;

  async function confirmar() {
    setErro('');
    if (!nome.trim()) {
      setErroNome('Informe quem preencheu (posto/graduação e nome).');
      return;
    }
    setErroNome('');
    setEnviando(true);
    try {
      const envio = enviarDocMensal(db, { docId: d.id, mesRef: p.mesRef, unidadeId: p.unidade, valores: {}, respondidoPor: nome });
      envio.catch(() => undefined);
      await Promise.race([envio, new Promise((ok) => setTimeout(ok, 3000))]);
      try {
        localStorage.setItem(CHAVE_NOME, nome.trim());
      } catch {
        /* sem armazenamento: segue */
      }
      cutucarMotor();
      irPara('#/documentos');
    } catch {
      setErro('Não foi possível confirmar. Verifique a conexão e tente de novo.');
      setEnviando(false);
    }
  }

  return (
    <section className="painel painel-estreito">
      <div className="painel-cabecalho">
        <h2>{d.nome}</h2>
        <span className={`selo selo-doc-${s}`}>{rotuloSituacao(d, s)}</span>
      </div>
      <p className="ajuda-pendentes">
        Dados de {rotuloMes(p.mesRef)} · prazo {formatarData(prazo)} ({d.diaUtil}º dia útil).
      </p>
      <div className="cartao grupo">
        <ol className="passos-direto">
          <li>
            Toque em <strong>Abrir a planilha</strong>: ela abre na aba <strong>{aba.nome.trim()}</strong>.
          </li>
          <li>Preencha a lista de {rotuloMes(p.mesRef)} direto na planilha.</li>
          <li>
            Volte aqui e toque em <strong>Confirmar preenchimento</strong>.
          </li>
        </ol>
        <a className="botao secundario botao-largo" href={urlAbaDaCia(d, p.unidade)} target="_blank" rel="noreferrer">
          📂 Abrir a planilha
        </a>
      </div>
      {p.envio && (
        <p className="mensagem aviso" role="status">
          Preenchimento confirmado por {p.envio.respondidoPor}. Se corrigir algo na planilha, não precisa confirmar de novo.
        </p>
      )}
      <div className="cartao grupo">
        <Campo rotulo="Preenchido por" obrigatorio erro={erroNome}>
          <input value={nome} readOnly={Boolean(quemSou())} placeholder="Posto/graduação e nome" autoComplete="name" onChange={(e) => setNome(e.target.value)} />
        </Campo>
      </div>
      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}
      <div className="barra-acoes">
        <a className="botao secundario" href="#/documentos">
          Voltar
        </a>
        <button className="botao destaque" type="button" disabled={enviando} onClick={confirmar}>
          {enviando ? 'Confirmando…' : p.envio ? 'Confirmar de novo' : '✅ Confirmar preenchimento'}
        </button>
      </div>
    </section>
  );
}

function ListaCia(p: {
  documento: DocumentoMensal;
  unidade: UnidadeId;
  linhas: LinhaLista[];
  aoMudar: Dispatch<SetStateAction<LinhaLista[]>>;
  erros: Record<string, string>;
}) {
  const lista = p.documento.lista!;
  const max = maxLinhas(p.documento, p.unidade);
  const mudar = (i: number, campo: string, valor: string) => p.aoMudar((ls) => ls.map((l, k) => (k === i ? { ...l, [campo]: valor } : l)));

  async function procurarRE(i: number, re: string) {
    try {
      const pm = await buscarPolicial(db, re);
      // Só completa o nome se ele ainda estiver vazio (não apaga o que a Cia digitou enquanto buscava).
      if (pm) p.aoMudar((ls) => ls.map((l, k) => (k === i && !l.nome?.trim() ? { ...l, nome: (pm.nomeCompleto || pm.nomeGuerra).toUpperCase() } : l)));
    } catch {
      /* sem conexão: digita o nome */
    }
  }

  return (
    <div className="lista-cia">
      {p.linhas.length === 0 && (
        <p className="cartao grupo vazio">Nenhuma linha: vai “{lista.semRegistro.texto}” na planilha. Se houve, toque em “+ Adicionar linha”.</p>
      )}
      {p.erros.__lista && (
        <p className="mensagem erro" role="alert">
          {p.erros.__lista}
        </p>
      )}
      {p.linhas.map((l, i) => (
        <fieldset key={i} className="cartao grupo" aria-label={`Linha ${i + 1}`}>
          <legend className="legenda-grupo">Linha {i + 1}</legend>
          <div className="grade-2">
            {lista.colunas.map((c) => (
              <Campo key={c.id} rotulo={c.rotulo} obrigatorio erro={p.erros[`l${i + 1}_${c.id}`]} className={c.tipo === 'texto' ? 'campo-largo' : undefined}>
                <input
                  type={c.tipo === 'data' ? 'date' : 'text'}
                  inputMode={c.tipo === 'numero' ? 'numeric' : undefined}
                  value={l[c.id] ?? ''}
                  onChange={(e) => mudar(i, c.id, e.target.value)}
                  onBlur={c.tipo === 're' ? (e) => void procurarRE(i, e.target.value) : undefined}
                />
              </Campo>
            ))}
          </div>
          {lista.opcao && (
            <div role="radiogroup" aria-label={lista.opcao.rotulo} className="opcoes-linha">
              {lista.opcao.opcoes.map((o, k) => (
                <label key={o.rotulo} className="campo-check-linha">
                  <input type="radio" name={`opcao-${i}`} checked={l[lista.opcao!.id] === String(k)} onChange={() => mudar(i, lista.opcao!.id, String(k))} />
                  {o.rotulo}
                </label>
              ))}
              {p.erros[`l${i + 1}_${lista.opcao.id}`] && <span className="erro-campo">{p.erros[`l${i + 1}_${lista.opcao.id}`]}</span>}
            </div>
          )}
          <div className="acoes-linha">
            <button className="botao secundario" type="button" onClick={() => p.aoMudar((ls) => ls.filter((_, k) => k !== i))}>
              🗑️ Remover linha
            </button>
          </div>
        </fieldset>
      ))}
      <div className="acoes-linha">
        <button className="botao secundario" type="button" disabled={p.linhas.length >= max} onClick={() => p.aoMudar((ls) => [...ls, {}])}>
          + Adicionar linha
        </button>
      </div>
    </div>
  );
}
