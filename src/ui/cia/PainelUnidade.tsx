import { useEffect, useState } from 'react';
import { marcarEmAndamento, marcarVisualizado, observarDaUnidade, responder } from '../../data/encaminhamentos';
import { formatarData, hojeISO } from '../../domain/datas';
import {
  abaDoEncaminhamento,
  encAtrasado,
  ROTULO_ENC,
  type AbaUnidade,
  type Encaminhamento,
} from '../../domain/encaminhamento';
import type { UnidadeId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { irPara, useHash } from '../../lib/navegacao';
import { useAoVivo } from '../../lib/useAoVivo';

const ABAS: { id: AbaUnidade; rotulo: string }[] = [
  { id: 'pendentes', rotulo: 'Pendentes' },
  { id: 'respondidas', rotulo: 'Respondidas' },
  { id: 'finalizadas', rotulo: 'Finalizadas' },
];

const CHAVE_NOME = 'portalp3.respondidoPor';

export function PainelUnidade({ unidade, sigla }: { unidade: UnidadeId; sigla: string }) {
  const hash = useHash();
  const encs = useAoVivo<Encaminhamento[]>(
    (ok, erro) => observarDaUnidade(db, unidade, ok, erro),
    [unidade],
    'Não foi possível carregar as demandas.',
  );
  const lista = encs.valor ?? [];
  const aberto = /^#\/enc\/(.+)$/.exec(hash)?.[1];

  if (aberto) {
    const enc = lista.find((e) => e.id === aberto);
    if (enc) return <DetalheEncaminhamento key={enc.id} enc={enc} />;
    if (encs.carregando) return <p className="carregando">Carregando…</p>;
    return (
      <section className="painel">
        <p className="mensagem erro" role="alert">
          Demanda não encontrada.
        </p>
        <a href="#/">Voltar</a>
      </section>
    );
  }
  return <ListaUnidade sigla={sigla} lista={lista} carregando={encs.carregando} erro={encs.erro} />;
}

function ListaUnidade(p: { sigla: string; lista: Encaminhamento[]; carregando: boolean; erro: string }) {
  const hoje = hojeISO();
  const [aba, setAba] = useState<AbaUnidade>('pendentes');
  const porAba = (a: AbaUnidade) => p.lista.filter((e) => abaDoEncaminhamento(e.status) === a);
  const visiveis = porAba(aba);

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>{p.sigla}</h2>
      </div>
      <div className="abas" role="tablist">
        {ABAS.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}>
            {a.rotulo} ({porAba(a.id).length})
          </button>
        ))}
      </div>

      {p.erro && (
        <p className="mensagem erro" role="alert">
          {p.erro}
        </p>
      )}
      {p.carregando && <p className="carregando">Carregando…</p>}
      {!p.carregando && !p.erro && visiveis.length === 0 && <p className="vazio">Nada por aqui.</p>}

      <ul className="lista">
        {visiveis.map((e) => {
          const atrasado = encAtrasado(e, hoje);
          return (
            <li key={e.id}>
              <a className={`item-demanda item-cia ${atrasado ? 'borda-atrasado' : `borda-enc-${e.status}`}`} href={`#/enc/${e.id}`}>
                <span className="item-topo">
                  <strong className="item-num">Nº {e.numero}</strong>
                  <span className={`selo ${atrasado ? 'selo-atrasado' : `enc-${e.status}`}`}>
                    {atrasado ? 'Atrasado' : ROTULO_ENC[e.status]}
                  </span>
                </span>
                <span className="item-saida">{e.saida}</span>
                <span className="item-info">
                  <span className="item-cat">{e.categoria}</span>
                  <span className="item-prazo">{e.prazoCia ? `Prazo ${formatarData(e.prazoCia)}` : ''}</span>
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

function DetalheEncaminhamento({ enc }: { enc: Encaminhamento }) {
  const [resposta, setResposta] = useState(enc.resposta);
  const [nome, setNome] = useState(enc.respondidoPor || lerNome());
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const finalizado = enc.status === 'aceito' || enc.status === 'cancelado';

  // Abrir a demanda já avisa a P/3 que a Cia viu.
  useEffect(() => {
    marcarVisualizado(db, enc).catch(() => undefined);
    // só na primeira abertura
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function executar(acao: () => Promise<void>, voltar: boolean) {
    setOcupado(true);
    setErro('');
    try {
      await acao();
      if (voltar) irPara('#/');
    } catch {
      setErro('Não foi possível gravar. Verifique a conexão e tente de novo.');
    }
    setOcupado(false);
  }

  function enviar() {
    if (!resposta.trim() || !nome.trim()) {
      setErro('Preencha a resposta e o nome de quem respondeu.');
      return;
    }
    try {
      localStorage.setItem(CHAVE_NOME, nome.trim());
    } catch {
      /* sem armazenamento: segue */
    }
    void executar(() => responder(db, enc, resposta, nome), true);
  }

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Demanda nº {enc.numero}</h2>
        <span className={`selo enc-${enc.status}`}>{ROTULO_ENC[enc.status]}</span>
      </div>

      <div className="cartao grupo">
        <p className="item-saida">{enc.saida}</p>
        <dl className="dados">
          <dt>Categoria</dt>
          <dd>{enc.categoria || '—'}</dd>
          <dt>Prazo</dt>
          <dd>{formatarData(enc.prazoCia) || '—'}</dd>
          {enc.tipoSaida && (
            <>
              <dt>Tipo de saída</dt>
              <dd>{enc.tipoSaida}</dd>
            </>
          )}
          {enc.numeroOrigem && (
            <>
              <dt>{enc.origem === 'SEI' ? 'Processo SEI' : 'Nº da origem'}</dt>
              <dd>{enc.numeroOrigem}</dd>
            </>
          )}
          {enc.observacao && (
            <>
              <dt>Observação</dt>
              <dd>{enc.observacao}</dd>
            </>
          )}
          {enc.linkEvento && (
            <>
              <dt>Link</dt>
              <dd>
                <a href={enc.linkEvento} target="_blank" rel="noreferrer">
                  Abrir link
                </a>
              </dd>
            </>
          )}
        </dl>
      </div>

      {enc.status === 'devolvido' && enc.motivoDevolucao && (
        <p className="mensagem aviso-devolvido" role="status">
          A P/3 devolveu a resposta: {enc.motivoDevolucao}
        </p>
      )}

      <div className="cartao grupo">
        <label className="campo">
          Resposta
          <textarea rows={5} value={resposta} disabled={finalizado} onChange={(e) => setResposta(e.target.value)} />
        </label>
        <label className="campo">
          Respondido por
          <input
            value={nome}
            disabled={finalizado}
            placeholder="Posto/graduação e nome"
            autoComplete="name"
            onChange={(e) => setNome(e.target.value)}
          />
        </label>
      </div>

      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}

      <div className="barra-acoes">
        <a className="botao secundario" href="#/">
          Voltar
        </a>
        {!finalizado && enc.status !== 'em_andamento' && enc.status !== 'respondido' && (
          <button
            className="botao secundario"
            type="button"
            disabled={ocupado}
            onClick={() => executar(() => marcarEmAndamento(db, enc), false)}
          >
            Em andamento
          </button>
        )}
        {!finalizado && (
          <button className="botao destaque" type="button" disabled={ocupado} onClick={enviar}>
            {enc.status === 'respondido' ? 'Atualizar resposta' : 'Enviar resposta'}
          </button>
        )}
      </div>
    </section>
  );
}
