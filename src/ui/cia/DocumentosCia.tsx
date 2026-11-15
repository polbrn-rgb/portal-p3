import { useState } from 'react';
import { enviarDocMensal } from '../../data/documentosMensais';
import { formatarData } from '../../domain/datas';
import {
  camposDaUnidade,
  documentosDoMes,
  lerValores,
  prazoDoDocumento,
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
  const [nome, setNome] = useState(p.envio?.respondidoPor || lerNome());
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const prazo = prazoDoDocumento(d, p.mesRef);
  const s = situacaoEnvio(p.envio, prazo);

  async function enviar() {
    const { valores, erros: e } = lerValores(d, p.unidade, rascunho);
    if (!nome.trim()) e.__nome = 'Informe quem preencheu (posto/graduação e nome).';
    setErros(e);
    setErro('');
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      await enviarDocMensal(db, { docId: d.id, mesRef: p.mesRef, unidadeId: p.unidade, valores, respondidoPor: nome });
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
  for (const c of campos) {
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
      {grupos.map((g) => (
        <fieldset key={g.titulo || 'campos'} className="cartao grupo">
          {g.titulo && <legend className="legenda-grupo">{g.titulo}</legend>}
          <div className="grade-2">
            {g.campos.map((c) => (
              <Campo key={c.id} rotulo={c.rotulo} obrigatorio={!c.texto} erro={erros[c.id]} className={c.texto ? 'campo-largo' : undefined}>
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
