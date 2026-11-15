import { useEffect, useMemo, useState } from 'react';
import { demandasDoAno } from '../../data/estatisticas';
import { hojeISO } from '../../domain/datas';
import type { Demanda } from '../../domain/demanda';
import { andamentoPorDemanda, type Encaminhamento } from '../../domain/encaminhamento';
import { montarEstatisticas, type Barra } from '../../domain/estatisticas';
import { db } from '../../lib/firebase';

const PRIMEIRO_ANO = 2026;

/** Uma série só: barras horizontais com o valor na ponta (o valor escrito serve de tabela). */
function Barras({ titulo, dados }: { titulo: string; dados: Barra[] }) {
  const maior = Math.max(1, ...dados.map((d) => d.valor));
  return (
    <figure className="cartao grupo grafico" aria-label={titulo}>
      <figcaption>{titulo}</figcaption>
      {dados.length === 0 ? (
        <p className="vazio">Sem dados.</p>
      ) : (
        <ul className="barras">
          {dados.map((d) => (
            <li key={d.rotulo} title={`${d.rotulo}: ${d.valor}`}>
              <span className="barra-rotulo">{d.rotulo}</span>
              <span className="barra-trilho">
                <span className="barra" style={{ width: `${(d.valor / maior) * 100}%` }} />
                <span className="barra-valor">{d.valor}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/** Colunas por mês (jan–dez), valor em cima de cada coluna. */
function Colunas({ titulo, dados, destaque }: { titulo: string; dados: Barra[]; destaque?: number }) {
  const maior = Math.max(1, ...dados.map((d) => d.valor));
  return (
    <figure className="cartao grupo grafico" aria-label={titulo}>
      <figcaption>{titulo}</figcaption>
      <ol className="colunas">
        {dados.map((d, i) => (
          <li key={d.rotulo} title={`${d.rotulo}: ${d.valor}`} className={i === destaque ? 'atual' : ''}>
            <span className="coluna-valor">{d.valor || ''}</span>
            <span className="coluna" style={{ height: `${(d.valor / maior) * 100}%` }} />
            <span className="coluna-rotulo">{d.rotulo}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** O "Dashboard" do numerador antigo, das demandas do portal no ano escolhido. */
export function PainelEstatistico({ encs }: { encs: Encaminhamento[] }) {
  const hoje = hojeISO();
  const anoAtual = Number(hoje.slice(0, 4));
  const [ano, setAno] = useState(anoAtual);
  const [recarregar, setRecarregar] = useState(0);
  const [estado, setEstado] = useState<{ carregando: boolean; erro: string; lista: Demanda[] }>({ carregando: true, erro: '', lista: [] });

  useEffect(() => {
    let vivo = true;
    setEstado((e) => ({ ...e, carregando: true, erro: '' }));
    demandasDoAno(db, ano, recarregar > 0)
      .then((lista) => vivo && setEstado({ carregando: false, erro: '', lista }))
      .catch(() => vivo && setEstado({ carregando: false, erro: 'Não foi possível carregar as estatísticas.', lista: [] }));
    return () => {
      vivo = false;
    };
  }, [ano, recarregar]);

  const andamento = useMemo(() => andamentoPorDemanda(encs), [encs]);
  const est = useMemo(
    () => montarEstatisticas(estado.lista, hoje, (d) => andamento[d.id] ?? { pendentes: 0, respondidas: 0 }),
    [estado.lista, hoje, andamento],
  );
  const anos = Array.from({ length: Math.max(1, anoAtual - PRIMEIRO_ANO + 1) }, (_, i) => anoAtual - i);

  return (
    <section className="painel painel-estatistico" aria-label="Painel estatístico">
      <div className="painel-cabecalho">
        <h2>Painel estatístico</h2>
        <div className="filtros-estatistica">
          <label className="campo campo-compacto">
            Ano
            <select value={ano} onChange={(e) => setAno(Number(e.target.value))}>
              {anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <button className="botao secundario" type="button" disabled={estado.carregando} onClick={() => setRecarregar((n) => n + 1)}>
            Atualizar
          </button>
        </div>
      </div>

      {estado.erro && (
        <p className="mensagem erro" role="alert">
          {estado.erro}
        </p>
      )}
      {estado.carregando && <p className="carregando">Carregando…</p>}
      {!estado.carregando && !estado.erro && est.total === 0 && <p className="vazio">Nenhuma demanda com entrada em {ano}.</p>}

      {!estado.carregando && !estado.erro && est.total > 0 && (
        <>
          <div className="numeros-painel numeros-estatistica">
            <div className="numero-painel n-proximos">
              <strong>{est.total}</strong>
              <span>Total de demandas</span>
            </div>
            {ano === anoAtual && (
              <div className="numero-painel n-proximos">
                <strong>{est.doMes}</strong>
                <span>Entraram neste mês</span>
              </div>
            )}
            <div className="numero-painel n-cia">
              <strong>{est.emAberto}</strong>
              <span>Em aberto</span>
            </div>
            <div className="numero-painel n-hoje">
              <strong>{est.venceHoje}</strong>
              <span>Vencem hoje</span>
            </div>
            <div className="numero-painel n-atrasado">
              <strong>{est.atrasadas}</strong>
              <span>Atrasadas</span>
            </div>
          </div>

          <div className="grade-estatistica">
            <Barras titulo="Por status" dados={est.porStatus} />
            <Colunas titulo="Por mês de entrada" dados={est.porMes} destaque={ano === anoAtual ? Number(hoje.slice(5, 7)) - 1 : undefined} />
            <Barras titulo="Por responsável" dados={est.porResponsavel} />
            <Barras titulo="Por categoria" dados={est.porCategoria} />
            <Barras titulo="Por dia da semana (entrada)" dados={est.porDiaSemana} />
            <Barras titulo="Por tipo de saída" dados={est.porTipoSaida} />
          </div>
        </>
      )}
    </section>
  );
}
