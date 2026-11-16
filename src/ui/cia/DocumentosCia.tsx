import { useState, type Dispatch, type SetStateAction } from 'react';
import { enviarDocMensal } from '../../data/documentosMensais';
import { buscarPolicial } from '../../data/efetivo';
import { formatarData } from '../../domain/datas';
import {
  camposDaUnidade,
  documentosDoMes,
  lerValores,
  linhasDosValores,
  maxLinhas,
  prazoDoDocumento,
  valoresDaLista,
  type LinhaLista,
  ROTULO_SITUACAO_ENVIO,
  situacaoEnvio,
  type DocumentoMensal,
  type EnvioMensal,
} from '../../domain/documentosMensais';
import { rotuloMes } from '../../domain/controle';
import type { UnidadeId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { cutucarMotor } from '../../lib/motor';
import { irPara } from '../../lib/navegacao';
import { Campo } from '../Campo';

const CHAVE_NOME = 'portalp3.respondidoPor';

/** Documentos que esta Cia preenche no mês de referência. */
export function documentosDaUnidade(u: UnidadeId, mesRef: string): DocumentoMensal[] {
  return documentosDoMes(mesRef).filter((d) => camposDaUnidade(d, u).length > 0);
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
          const s = situacaoEnvio(
            p.envios.find((e) => e.docId === d.id),
            prazo,
          );
          return (
            <li key={d.id}>
              <a className={`item-pendente link-cartao borda-doc-${s}`} href={`#/documentos/${d.id}`}>
                <span className="item-topo">
                  <strong className="pendente-assunto">{d.nome}</strong>
                  <span className={`selo selo-doc-${s}`}>{ROTULO_SITUACAO_ENVIO[s]}</span>
                </span>
                <span className="pendente-detalhe">
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
  const [nome, setNome] = useState(p.envio?.respondidoPor || lerNome());
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const prazo = prazoDoDocumento(d, p.mesRef);
  const s = situacaoEnvio(p.envio, prazo);

  async function enviar() {
    const { valores, erros: e } = d.lista ? valoresDaLista(d, p.unidade, linhas) : lerValores(d, p.unidade, rascunho);
    if (!nome.trim()) e.__nome = 'Informe quem preencheu (posto/graduação e nome).';
    setErros(e);
    setErro('');
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      // O envio aparece na hora (o banco confirma em seguida); se a conexão estiver lenta, não prende a Cia na tela.
      const envio = enviarDocMensal(db, { docId: d.id, mesRef: p.mesRef, unidadeId: p.unidade, valores, respondidoPor: nome });
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
      {d.lista && <ListaCia documento={d} unidade={p.unidade} linhas={linhas} aoMudar={setLinhas} erros={erros} />}
      {grupos.map((g) => (
        <fieldset key={g.titulo || 'campos'} className="cartao grupo">
          {g.titulo && <legend className="legenda-grupo">{g.titulo}</legend>}
          <div className="grade-2">
            {g.campos.map((c) => (
              <Campo key={c.id} rotulo={c.rotulo} obrigatorio={!c.texto || c.obrigatorio} erro={erros[c.id]} className={c.texto ? 'campo-largo' : undefined}>
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
          <input value={nome} placeholder="Posto/graduação e nome" autoComplete="name" onChange={(e) => setNome(e.target.value)} />
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
          {enviando ? 'Enviando…' : p.envio ? 'Atualizar envio' : 'Enviar'}
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
