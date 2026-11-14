import { useState } from 'react';
import { descartarPendente, voltarParaPendentes } from '../../data/pendentes';
import { formatarData } from '../../domain/datas';
import { detalheDaPendente, filtrarPendentes, ORIGEM_DO_TIPO, type Pendente } from '../../domain/pendente';
import { db } from '../../lib/firebase';
import { cutucarMotor, URL_MOTOR } from '../../lib/motor';
import type { AoVivo } from '../../lib/useAoVivo';

export function ListaPendentes({ pendentes }: { pendentes: AoVivo<Pendente[]> }) {
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState('');
  const [descartada, setDescartada] = useState<string | null>(null);
  const lista = pendentes.valor ?? [];
  const visiveis = filtrarPendentes(lista, texto);

  function buscarEmails() {
    setDescartada(null);
    setAviso(
      cutucarMotor()
        ? 'Busca pedida. Os e-mails encaminhados aparecem aqui em até 1 minuto.'
        : 'Não foi possível pedir a busca agora. Ela roda sozinha a cada 5 minutos.',
    );
  }

  async function desfazer() {
    if (!descartada) return;
    try {
      await voltarParaPendentes(db, descartada);
      setDescartada(null);
      setAviso('A pendente voltou para a lista.');
    } catch {
      setAviso('Não foi possível desfazer. Tente de novo.');
    }
  }

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Demandas Pendentes</h2>
        <div className="acoes-cabecalho">
          {URL_MOTOR && (
            <button className="botao secundario" type="button" onClick={buscarEmails}>
              Buscar e-mails agora
            </button>
          )}
          <a className="botao destaque" href="#/pendentes/sei">
            + SEI
          </a>
          <a className="botao destaque" href="#/pendentes/ordem">
            + Ordem Verbal
          </a>
        </div>
      </div>
      <p className="ajuda-pendentes">
        E-mails encaminhados pela caixa funcional entram aqui sozinhos. Dê destino para gerar o número no Numerador.
      </p>

      {(aviso || descartada) && (
        <p className="mensagem aviso" role="status">
          {descartada ? 'Pendente descartada.' : aviso}
          {descartada && (
            <>
              {' '}
              <button className="botao-link" type="button" onClick={desfazer}>
                Desfazer
              </button>
            </>
          )}
        </p>
      )}

      {lista.length > 0 && (
        <input
          className="busca"
          type="search"
          placeholder="Buscar por assunto, nº SEI, remetente…"
          aria-label="Buscar pendentes"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      )}

      {pendentes.erro && (
        <p className="mensagem erro" role="alert">
          {pendentes.erro}
        </p>
      )}
      {pendentes.carregando && <p className="carregando">Carregando…</p>}
      {!pendentes.carregando && !pendentes.erro && visiveis.length === 0 && (
        <p className="vazio">{lista.length ? 'Nenhuma pendente encontrada.' : 'Nenhuma demanda pendente.'}</p>
      )}

      <ul className="lista">
        {visiveis.map((p) => (
          <li key={p.id}>
            <CartaoPendente
              pendente={p}
              aoDescartar={() => {
                setAviso('');
                setDescartada(p.id);
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CartaoPendente({ pendente: p, aoDescartar }: { pendente: Pendente; aoDescartar: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const detalhe = detalheDaPendente(p);

  async function descartar() {
    setSalvando(true);
    setErro('');
    try {
      await descartarPendente(db, p.id, motivo);
      aoDescartar();
    } catch {
      setErro('Não foi possível descartar. Tente de novo.');
      setSalvando(false);
    }
  }

  return (
    <article className={`item-pendente borda-tipo-${p.tipo}`} aria-label={p.assunto}>
      <span className="item-topo">
        <span className={`selo selo-tipo-${p.tipo}`}>{ORIGEM_DO_TIPO[p.tipo]}</span>
        <span className="pendente-data">{formatarData(p.dataEntrada)}</span>
      </span>
      <h3 className="pendente-assunto">{p.assunto}</h3>
      {detalhe && <p className="pendente-detalhe">{detalhe}</p>}

      {p.texto && p.texto !== p.assunto && (
        <details className="pendente-texto">
          <summary>Ver texto</summary>
          <p className="texto-resposta">{p.texto}</p>
        </details>
      )}

      {(Boolean(p.anexos?.length) || Boolean(p.linkGmail)) && (
        <ul className="pendente-links">
          {p.anexos?.map((a) => (
            <li key={a.url}>
              <a href={a.url} target="_blank" rel="noreferrer">
                📎 {a.nome}
              </a>
            </li>
          ))}
          {p.linkGmail && (
            <li>
              <a href={p.linkGmail} target="_blank" rel="noreferrer">
                ✉️ Abrir no Gmail
              </a>
            </li>
          )}
        </ul>
      )}

      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}

      {confirmando ? (
        <div className="devolucao">
          <label className="campo">
            Motivo do descarte (opcional)
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          <div className="acoes-linha">
            <button className="botao secundario" type="button" disabled={salvando} onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
            <button className="botao destaque" type="button" disabled={salvando} onClick={descartar}>
              {salvando ? 'Descartando…' : 'Confirmar descarte'}
            </button>
          </div>
        </div>
      ) : (
        <div className="acoes-linha">
          <button className="botao secundario" type="button" onClick={() => setConfirmando(true)}>
            Descartar
          </button>
          <a className="botao destaque" href={`#/destinar/${p.id}`}>
            Dar destino
          </a>
        </div>
      )}
    </article>
  );
}
