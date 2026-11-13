import { useEffect, useMemo, useState } from 'react';
import { buscarConcluidas } from '../../data/demandas';
import { observarAbertosP3 } from '../../data/encaminhamentos';
import { formatarData, hojeISO } from '../../domain/datas';
import type { Demanda } from '../../domain/demanda';
import { andamentoPorDemanda, type Andamento, type Encaminhamento } from '../../domain/encaminhamento';
import { filtrarDemandas, ROTULO_SITUACAO, situacaoDaDemanda, type Situacao } from '../../domain/situacao';
import { siglaDoDestino, unidadesParaEncaminhar } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { useAoVivo } from '../../lib/useAoVivo';
import { useDemandasAbertas } from '../../lib/useDemandasAbertas';

type Aba = 'abertas' | 'concluidas';
const FILTROS: (Situacao | 'todas')[] = ['todas', 'atrasado', 'vence_hoje', 'cia_atrasada', 'respondida', 'em_aberto'];

export function ListaDemandas() {
  const hoje = hojeISO();
  const [aba, setAba] = useState<Aba>('abertas');
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState<Situacao | 'todas'>('todas');
  const abertas = useDemandasAbertas();
  const encsAbertos = useAoVivo<Encaminhamento[]>((ok, erro) => observarAbertosP3(db, ok, erro), []);
  const andamento = useMemo(
    () => (encsAbertos.valor ? andamentoPorDemanda(encsAbertos.valor) : undefined),
    [encsAbertos.valor],
  );
  // Sem os encaminhamentos carregados, a situação usa só os prazos.
  const pendentesDe = (d: Demanda) => (andamento ? (andamento[d.id]?.pendentes ?? 0) : undefined);

  const [concluidas, setConcluidas] = useState<Demanda[]>([]);
  const [temMais, setTemMais] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erroConcluidas, setErroConcluidas] = useState('');

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
      const s = situacaoDaDemanda(d, hoje, pendentesDe(d));
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abertas.lista, hoje, andamento]);

  const base = aba === 'abertas' ? abertas.lista : concluidas;
  const visiveis = filtrarDemandas(base, texto, aba === 'abertas' ? filtro : 'todas', hoje, pendentesDe);
  const carregando = aba === 'abertas' ? abertas.carregando : carregandoMais && concluidas.length === 0;
  const erro = aba === 'abertas' ? abertas.erro : erroConcluidas;

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Demandas</h2>
        <a className="botao destaque botao-novo" href="#/nova">
          + Nova demanda
        </a>
      </div>

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
        <div className="cabecalho-lista" aria-hidden="true">
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
          <li key={d.id}>
            <ItemDemanda demanda={d} hoje={hoje} andamento={andamento?.[d.id]} carregado={!!andamento} />
          </li>
        ))}
      </ul>

      {aba === 'concluidas' && temMais && concluidas.length > 0 && (
        <button className="botao secundario" type="button" disabled={carregandoMais} onClick={carregarMais}>
          {carregandoMais ? 'Carregando…' : 'Carregar mais'}
        </button>
      )}
    </section>
  );
}

type PropsItem = { demanda: Demanda; hoje: string; andamento?: Andamento; carregado: boolean };

function ItemDemanda({ demanda: d, hoje, andamento, carregado }: PropsItem) {
  const pendentes = carregado ? (andamento?.pendentes ?? 0) : undefined;
  const situacao = situacaoDaDemanda(d, hoje, pendentes);
  const total = unidadesParaEncaminhar(d.destinos).length;
  const respostas =
    d.status === 'em_aberto' && total > 0 && pendentes !== undefined ? ` (${total - pendentes}/${total} responderam)` : '';
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
