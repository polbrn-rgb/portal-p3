import { useEffect, useMemo, useState } from 'react';
import { buscarConcluidas, excluirDemanda } from '../../data/demandas';
import { observarAbertosP3 } from '../../data/encaminhamentos';
import { formatarData, hojeISO } from '../../domain/datas';
import type { Demanda } from '../../domain/demanda';
import { andamentoPorDemanda, type Andamento, type Encaminhamento } from '../../domain/encaminhamento';
import { contarRespostas, filtrarDemandas, ROTULO_SITUACAO, situacaoDaDemanda, type Situacao } from '../../domain/situacao';
import { siglaDoDestino } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { useAoVivo } from '../../lib/useAoVivo';
import { useDemandasAbertas } from '../../lib/useDemandasAbertas';

type Aba = 'abertas' | 'concluidas';
const FILTROS: (Situacao | 'todas')[] = ['todas', 'atrasado', 'vence_hoje', 'cia_atrasada', 'respondida', 'em_aberto'];

export function ListaDemandas({ filtroInicial = 'todas' }: { filtroInicial?: Situacao | 'todas' }) {
  const hoje = hojeISO();
  const [aba, setAba] = useState<Aba>('abertas');
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState<Situacao | 'todas'>(filtroInicial);
  const abertas = useDemandasAbertas();
  const encsAbertos = useAoVivo<Encaminhamento[]>((ok, erro) => observarAbertosP3(db, ok, erro), []);
  const andamento = useMemo(
    () => (encsAbertos.valor ? andamentoPorDemanda(encsAbertos.valor) : undefined),
    [encsAbertos.valor],
  );
  // Sem os encaminhamentos carregados, a situação usa só os prazos.
  const SEM_ABERTOS: Andamento = { pendentes: 0, respondidas: 0 };
  const andamentoDe = (d: Demanda): Andamento | undefined => (andamento ? (andamento[d.id] ?? SEM_ABERTOS) : undefined);

  const [concluidas, setConcluidas] = useState<Demanda[]>([]);
  const [temMais, setTemMais] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erroConcluidas, setErroConcluidas] = useState('');
  const [baixando, setBaixando] = useState(false);
  const [avisoBackup, setAvisoBackup] = useState('');
  const [aExcluir, setAExcluir] = useState<Demanda | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [avisoExclusao, setAvisoExclusao] = useState('');

  async function confirmarExclusao() {
    if (!aExcluir) return;
    setExcluindo(true);
    try {
      await excluirDemanda(db, aExcluir.id);
      setConcluidas((lista) => lista.filter((d) => d.id !== aExcluir.id));
      setAvisoExclusao(`Demanda nº ${aExcluir.numero} excluída.`);
      setAExcluir(null);
    } catch {
      setAvisoExclusao('Não foi possível excluir. Tente de novo.');
      setAExcluir(null);
    }
    setExcluindo(false);
  }

  // O código do backup só é baixado quando alguém clica no botão.
  async function backup() {
    setBaixando(true);
    setAvisoBackup('');
    try {
      const { baixarPlanilha } = await import('../../data/exportar');
      const total = await baixarPlanilha(db);
      setAvisoBackup(`Planilha com ${total} demandas baixada.`);
    } catch {
      setAvisoBackup('Não foi possível gerar a planilha. Tente de novo.');
    }
    setBaixando(false);
  }

  async function carregarMais() {
    setCarregandoMais(true);
    setErroConcluidas('');
    try {
      const ultima = concluidas.at(-1)?.numero;
      const pagina = await buscarConcluidas(db, ultima);
      setConcluidas((atual) => [...atual, ...pagina.lista]);
      setTemMais(pagina.temMais);
    } catch {
      setErroConcluidas('Não foi possível carregar as concluídas.');
    }
    setCarregandoMais(false);
  }

  useEffect(() => {
    if (aba === 'concluidas' && concluidas.length === 0 && temMais && !carregandoMais) void carregarMais();
    // carrega a primeira página só quando a aba é aberta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = { todas: abertas.lista.length };
    for (const d of abertas.lista) {
      const s = situacaoDaDemanda(d, hoje, andamentoDe(d));
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abertas.lista, hoje, andamento]);

  const base = aba === 'abertas' ? abertas.lista : concluidas;
  const visiveis = filtrarDemandas(base, texto, aba === 'abertas' ? filtro : 'todas', hoje, andamentoDe);
  const carregando = aba === 'abertas' ? abertas.carregando : carregandoMais && concluidas.length === 0;
  const erro = aba === 'abertas' ? abertas.erro : erroConcluidas;

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Numerador</h2>
        <div className="acoes-cabecalho">
          <button className="botao secundario" type="button" disabled={baixando} onClick={backup}>
            {baixando ? 'Gerando…' : 'Baixar planilha'}
          </button>
          <a className="botao destaque botao-novo" href="#/nova">
            + Nova demanda
          </a>
        </div>
      </div>
      {avisoBackup && (
        <p className="mensagem aviso" role="status">
          {avisoBackup}
        </p>
      )}
      {avisoExclusao && (
        <p className="mensagem aviso" role="status">
          {avisoExclusao}
        </p>
      )}

      <div className="abas" role="tablist">
        <button type="button" role="tab" aria-selected={aba === 'abertas'} onClick={() => setAba('abertas')}>
          Abertas ({abertas.lista.length})
        </button>
        <button type="button" role="tab" aria-selected={aba === 'concluidas'} onClick={() => setAba('concluidas')}>
          Concluídas
        </button>
      </div>

      <div className="controles">
        <input
          className="busca"
          type="search"
          placeholder="Buscar por número, assunto, Cia, responsável…"
          aria-label="Buscar demandas"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />

        {aba === 'abertas' && (
          <div className="filtros" aria-label="Filtrar por situação">
            {FILTROS.map((f) => (
              <button
                key={f}
                type="button"
                className={`filtro filtro-${f}`}
                aria-pressed={filtro === f}
                onClick={() => setFiltro(f)}
              >
                {f === 'todas' ? 'Todas' : ROTULO_SITUACAO[f]} {contagem[f] ?? 0}
              </button>
            ))}
          </div>
        )}
      </div>

      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}
      {carregando && <p className="carregando">Carregando…</p>}
      {!carregando && !erro && visiveis.length === 0 && <p className="vazio">Nenhuma demanda encontrada.</p>}

      {visiveis.length > 0 && (
        <div className="cabecalho-lista com-lixeira" aria-hidden="true">
          <span>Nº</span>
          <span>Saída</span>
          <span>Categoria</span>
          <span>Destinos</span>
          <span>Prazo</span>
          <span>Situação</span>
        </div>
      )}
      <ul className="lista">
        {visiveis.map((d) => (
          <li key={d.id} className="linha-com-lixeira">
            <ItemDemanda demanda={d} hoje={hoje} andamento={andamentoDe(d)} />
            <button
              className="botao-lixeira"
              type="button"
              title="Excluir demanda"
              aria-label={`Excluir demanda nº ${d.numero}`}
              onClick={() => {
                setAvisoExclusao('');
                setAExcluir(d);
              }}
            >
              🗑️
            </button>
          </li>
        ))}
      </ul>

      {aExcluir && (
        <ConfirmarExclusao demanda={aExcluir} excluindo={excluindo} aoConfirmar={confirmarExclusao} aoCancelar={() => setAExcluir(null)} />
      )}

      {aba === 'concluidas' && temMais && concluidas.length > 0 && (
        <button className="botao secundario" type="button" disabled={carregandoMais} onClick={carregarMais}>
          {carregandoMais ? 'Carregando…' : 'Carregar mais'}
        </button>
      )}
    </section>
  );
}

type PropsConfirmar = { demanda: Demanda; excluindo: boolean; aoConfirmar: () => void; aoCancelar: () => void };

/** Confirmação antes de excluir (na própria página, sem a janela do navegador). */
function ConfirmarExclusao({ demanda: d, excluindo, aoConfirmar, aoCancelar }: PropsConfirmar) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !excluindo) aoCancelar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [excluindo, aoCancelar]);

  return (
    <div className="fundo-dialogo" onClick={() => !excluindo && aoCancelar()}>
      <div
        className="dialogo"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-excluir"
        aria-describedby="texto-excluir"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="titulo-excluir">Excluir a demanda nº {d.numero}?</h3>
        <p className="dialogo-saida">{d.saida}</p>
        <p id="texto-excluir">
          Ela some do Numerador, das Cias e do Checklist Operações, e os eventos dela nas agendas são apagados. O número
          não é reaproveitado e isso não pode ser desfeito pelo portal.
        </p>
        <div className="acoes-linha">
          <button className="botao secundario" type="button" autoFocus disabled={excluindo} onClick={aoCancelar}>
            Cancelar
          </button>
          <button className="botao perigo" type="button" disabled={excluindo} onClick={aoConfirmar}>
            {excluindo ? 'Excluindo…' : '🗑️ Sim, excluir'}
          </button>
        </div>
      </div>
    </div>
  );
}

type PropsItem = { demanda: Demanda; hoje: string; andamento?: Andamento };

function ItemDemanda({ demanda: d, hoje, andamento }: PropsItem) {
  const situacao = situacaoDaDemanda(d, hoje, andamento);
  const conta = andamento ? contarRespostas(d, andamento) : undefined;
  const respostas =
    d.status === 'em_aberto' && conta && conta.total > 0 ? ` (${conta.responderam}/${conta.total} responderam)` : '';
  const destinos = d.destinos.map(siglaDoDestino).join(', ') + respostas;
  const prazo = d.prazoCPA ? `Prazo CPA ${formatarData(d.prazoCPA)}` : d.prazoCia ? `Prazo Cia ${formatarData(d.prazoCia)}` : '';
  return (
    <a className={`item-demanda borda-${situacao}`} href={`#/demanda/${d.id}`}>
      <span className="item-topo">
        <strong className="item-num">Nº {d.numero}</strong>
        <span className={`selo selo-${situacao}`}>{ROTULO_SITUACAO[situacao]}</span>
      </span>
      <span className="item-saida">{d.saida}</span>
      <span className="item-info">
        <span className="item-cat">{d.categoria}</span>
        <span className="item-dest">{destinos}</span>
        <span className="item-prazo">{prazo}</span>
      </span>
    </a>
  );
}
