import { useEffect, useState } from 'react';
import { atualizarPlanilha, concluirOperacao, marcarItem, pedirPlanilha, salvarProtocolo } from '../../data/operacoes';
import { formatarData } from '../../domain/datas';
import {
  diasDaOperacao,
  ITENS_CHECKLIST,
  pastaCfpDa,
  progresso,
  protocolosPreenchidos,
  type ItemChecklist,
  type Operacao,
  rotuloDoItem,
} from '../../domain/operacao';
import { diasMudaram } from '../../domain/resultado';
import { db } from '../../lib/firebase';
import { cutucarMotor } from '../../lib/motor';
import type { AoVivo } from '../../lib/useAoVivo';
import { AndamentoEfetivo, FormPedidoEfetivo } from './EfetivoOperacao';

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
  const { demanda: d, checklist: salvo } = operacao;
  const [erro, setErro] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // A marcação aparece na hora; quando o banco confirma, volta a valer o que veio dele.
  const [marcando, setMarcando] = useState<Partial<Record<ItemChecklist, boolean>>>({});
  const [pedindoEfetivo, setPedindoEfetivo] = useState(false);
  useEffect(() => setMarcando({}), [salvo]);
  const c = { ...salvo, ...marcando };
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

  const efetivoEnviado = Boolean(c.efetivo?.enviadaEm);
  const planilha = c.planilha;

  function pedirPlanilhaDeResultado() {
    if (!pasta) {
      setErro('Para gerar a planilha, a pasta do CFP precisa existir: marque “Adicionar e gerar pasta CFP” na demanda.');
      return;
    }
    void executar(async () => {
      await pedirPlanilha(db, d.id);
      cutucarMotor();
    });
  }

  /** Efetivo e planilha não são só marcar: abrem o pedido / pedem a cópia da planilha. */
  function aoMarcar(item: ItemChecklist, valor: boolean) {
    if (item === 'efetivoOk' && !efetivoEnviado) return setPedindoEfetivo(valor);
    if (item === 'resultadoOk' && valor && (!planilha || planilha.status === 'erro')) return pedirPlanilhaDeResultado();
    marcar(item, valor);
  }

  function marcar(item: ItemChecklist, valor: boolean) {
    setMarcando((m) => ({ ...m, [item]: valor }));
    void executar(async () => {
      try {
        await marcarItem(db, d.id, item, valor);
      } catch (e) {
        setMarcando((m) => ({ ...m, [item]: !valor }));
        throw e;
      }
    });
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
              <input
                type="checkbox"
                checked={item.id === 'efetivoOk' && !efetivoEnviado ? pedindoEfetivo : c[item.id]}
                disabled={(item.id === 'efetivoOk' && efetivoEnviado) || (item.id === 'resultadoOk' && !!planilha && planilha.status !== 'erro')}
                onChange={(e) => aoMarcar(item.id, e.target.checked)}
              />
              {rotuloDoItem(item, d.tipoSaida)}
            </label>

            {item.id === 'efetivoOk' &&
              (efetivoEnviado && c.efetivo ? (
                <AndamentoEfetivo demanda={d} pedido={c.efetivo} />
              ) : (
                pedindoEfetivo && <FormPedidoEfetivo demanda={d} aoFechar={() => setPedindoEfetivo(false)} />
              ))}

            {item.id === 'resultadoOk' && planilha && (
              <div className="detalhe-item">
                {planilha.status === 'pedida' && <span>Gerando a planilha na pasta do CFP… (até 10 minutos)</span>}
                {planilha.status === 'erro' && (
                  <span className="erro-campo">
                    Não foi possível gerar: {planilha.erro}{' '}
                    <button className="botao-link" type="button" onClick={pedirPlanilhaDeResultado}>
                      Tentar de novo
                    </button>
                  </span>
                )}
                {planilha.status === 'pronta' && (
                  <>
                    <a className="botao secundario" href={planilha.url} target="_blank" rel="noreferrer">
                      📊 Abrir planilha de resultado
                    </a>
                    <span className="pendente-detalhe">A Sala de Operações já pode lançar os resultados.</span>
                    {diasMudaram(planilha, dias) && (
                      <button
                        className="botao-link"
                        type="button"
                        onClick={() =>
                          void executar(async () => {
                            await atualizarPlanilha(db, d.id);
                            cutucarMotor();
                          })
                        }
                      >
                        As datas da operação mudaram: atualizar a planilha
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

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
