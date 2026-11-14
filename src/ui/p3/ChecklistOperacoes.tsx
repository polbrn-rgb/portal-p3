import { useState } from 'react';
import { concluirOperacao, marcarItem, salvarProtocolo } from '../../data/operacoes';
import { formatarData } from '../../domain/datas';
import {
  diasDaOperacao,
  ITENS_CHECKLIST,
  pastaCfpDa,
  progresso,
  protocolosPreenchidos,
  type ItemChecklist,
  type Operacao,
} from '../../domain/operacao';
import { db } from '../../lib/firebase';
import type { AoVivo } from '../../lib/useAoVivo';

export function ChecklistOperacoes({ operacoes }: { operacoes: AoVivo<Operacao[]> }) {
  const [concluida, setConcluida] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');
  const lista = operacoes.valor ?? [];

  async function desfazer() {
    if (!concluida) return;
    try {
      await concluirOperacao(db, concluida, false);
      setConcluida(null);
    } catch {
      setAviso('Não foi possível desfazer. Tente de novo.');
    }
  }

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Checklist Operações</h2>
      </div>
      <p className="ajuda-pendentes">
        Entram aqui sozinhas as demandas do Numerador com tipo de saída Ordem de Serviço e categoria Operações Policiais.
      </p>

      {(concluida || aviso) && (
        <p className="mensagem aviso" role="status">
          {concluida ? `Operação nº ${concluida} concluída.` : aviso}
          {concluida && (
            <>
              {' '}
              <button className="botao-link" type="button" onClick={desfazer}>
                Desfazer
              </button>
            </>
          )}
        </p>
      )}

      {operacoes.erro && (
        <p className="mensagem erro" role="alert">
          {operacoes.erro}
        </p>
      )}
      {operacoes.carregando && <p className="carregando">Carregando…</p>}
      {!operacoes.carregando && !operacoes.erro && lista.length === 0 && (
        <p className="vazio">Nenhuma operação em andamento.</p>
      )}

      <ul className="lista lista-pendentes">
        {lista.map((o) => (
          <li key={o.demanda.id}>
            <CartaoOperacao
              operacao={o}
              aoConcluir={() => {
                setAviso('');
                setConcluida(o.demanda.id);
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function periodo(inicio: string, termino: string): string {
  if (!inicio) return 'Sem data de início (preencha Início e Término Btl no Numerador)';
  if (!termino || termino === inicio) return formatarData(inicio);
  return `${formatarData(inicio)} a ${formatarData(termino)}`;
}

function CartaoOperacao({ operacao, aoConcluir }: { operacao: Operacao; aoConcluir: () => void }) {
  const { demanda: d, checklist: c } = operacao;
  const [erro, setErro] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const { feitos, total } = progresso(c);
  const dias = diasDaOperacao(d.inicioBtl, d.terminoBtl);
  const pasta = pastaCfpDa(d);

  async function executar(acao: () => Promise<void>) {
    setErro('');
    try {
      await acao();
    } catch {
      setErro('Não foi possível salvar. Verifique a conexão e tente de novo.');
    }
  }

  async function concluir() {
    setSalvando(true);
    setErro('');
    try {
      await concluirOperacao(db, d.id);
      aoConcluir();
    } catch {
      setErro('Não foi possível concluir. Tente de novo.');
      setSalvando(false);
    }
  }

  function marcar(item: ItemChecklist, valor: boolean) {
    void executar(() => marcarItem(db, d.id, item, valor));
  }

  return (
    <article className="item-pendente item-operacao" aria-label={`Operação nº ${d.numero}`}>
      <span className="item-topo">
        <strong>Nº {d.numero}</strong>
        <span className={`selo ${feitos === total ? 'selo-completo' : ''}`}>
          {feitos}/{total}
        </span>
      </span>
      <h3 className="pendente-assunto">{d.saida}</h3>
      <p className="pendente-detalhe">{periodo(d.inicioBtl, d.terminoBtl)}</p>
      <div
        className="barra-progresso"
        role="progressbar"
        aria-label="Andamento"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={feitos}
      >
        <span style={{ width: `${(feitos / total) * 100}%` }} />
      </div>

      <ul className="checklist">
        {ITENS_CHECKLIST.map((item) => (
          <li key={item.id}>
            <label className="item-check">
              <input type="checkbox" checked={c[item.id]} onChange={(e) => marcar(item.id, e.target.checked)} />
              {item.rotulo}
            </label>

            {item.id === 'pastaOk' &&
              (pasta ? (
                <a className="botao secundario botao-item" href={pasta} target="_blank" rel="noreferrer">
                  📂 Abrir pasta do CFP
                </a>
              ) : (
                <p className="detalhe-item">
                  Pasta ainda não gerada: na demanda, marque “Adicionar e gerar pasta CFP”.
                </p>
              ))}

            {item.id === 'mapaForcaOk' &&
              (dias.length ? (
                <div className="detalhe-item">
                  <span className="pendente-detalhe">
                    Protocolos Sicoordop: {protocolosPreenchidos(c, dias)} de {dias.length} dia(s)
                  </span>
                  <div className="protocolos">
                    {dias.map((dia) => (
                      <ProtocoloDia
                        key={dia}
                        dia={dia}
                        valor={c.protocolos[dia] ?? ''}
                        aoSalvar={(v) => executar(() => salvarProtocolo(db, d.id, dia, v))}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="detalhe-item">Preencha Início e Término Btl na demanda para lançar os protocolos.</p>
              ))}
          </li>
        ))}
      </ul>

      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}

      {confirmando ? (
        <div className="devolucao">
          <p className="pendente-detalhe">
            {feitos < total ? `Ainda faltam ${total - feitos} item(ns). ` : ''}A operação sai do checklist.
          </p>
          <div className="acoes-linha">
            <button className="botao secundario" type="button" disabled={salvando} onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
            <button className="botao destaque" type="button" disabled={salvando} onClick={concluir}>
              {salvando ? 'Concluindo…' : 'Confirmar conclusão'}
            </button>
          </div>
        </div>
      ) : (
        <div className="acoes-linha">
          <a className="botao secundario" href={`#/demanda/${d.id}`}>
            Abrir demanda
          </a>
          <button className="botao destaque" type="button" onClick={() => setConfirmando(true)}>
            Concluir operação
          </button>
        </div>
      )}
    </article>
  );
}

/** Protocolo de um dia: salva ao sair do campo (só se mudou). */
function ProtocoloDia({ dia, valor, aoSalvar }: { dia: string; valor: string; aoSalvar: (v: string) => Promise<void> }) {
  const [texto, setTexto] = useState(valor);
  return (
    <label className="campo">
      {formatarData(dia)}
      <input
        value={texto}
        inputMode="numeric"
        placeholder="Nº do protocolo"
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          if (texto.trim() !== valor) void aoSalvar(texto);
        }}
      />
    </label>
  );
}
