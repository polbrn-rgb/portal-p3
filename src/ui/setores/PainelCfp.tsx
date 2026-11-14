import { useState } from 'react';
import { observarMissoes, type MissaoCfp } from '../../data/missoes';
import { formatarData, hojeISO } from '../../domain/datas';
import { db } from '../../lib/firebase';
import { useAoVivo } from '../../lib/useAoVivo';

/** CFP: missões do dia escolhido (com a pasta) e as próximas. */
export function PainelCfp() {
  const [dia, setDia] = useState(hojeISO);
  const missoes = useAoVivo<MissaoCfp[]>((ok, erro) => observarMissoes(db, ok, erro), []);
  const lista = missoes.valor ?? [];
  const doDia = lista.filter((m) => m.inicio <= dia && dia <= (m.fim || m.inicio)).sort((a, b) => a.numero - b.numero);
  const proximas = lista
    .filter((m) => m.inicio > dia)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .slice(0, 10);

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Missões do CFP</h2>
      </div>
      <div className="acoes-linha">
        <label className="campo">
          Data
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value || hojeISO())} />
        </label>
        <button className="botao secundario" type="button" onClick={() => setDia(hojeISO())}>
          Hoje
        </button>
      </div>
      {missoes.erro && <p className="mensagem erro">{missoes.erro}</p>}
      {missoes.carregando && <p className="carregando">Carregando…</p>}
      {!missoes.carregando && doDia.length === 0 && <p className="vazio">Nenhuma missão em {formatarData(dia)}.</p>}
      <ul className="lista lista-pendentes">
        {doDia.map((m) => (
          <li key={m.numero}>
            <Missao m={m} />
          </li>
        ))}
      </ul>
      {proximas.length > 0 && (
        <>
          <h3>Próximas missões</h3>
          <ul className="lista lista-pendentes">
            {proximas.map((m) => (
              <li key={m.numero}>
                <Missao m={m} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Missao({ m }: { m: MissaoCfp }) {
  const periodo = !m.fim || m.fim === m.inicio ? formatarData(m.inicio) : `${formatarData(m.inicio)} a ${formatarData(m.fim)}`;
  return (
    <article className="item-pendente" aria-label={m.titulo || m.saida}>
      <span className="item-topo">
        <strong>Nº {m.numero}</strong>
        <span className="pendente-data">{periodo}</span>
      </span>
      <h3 className="pendente-assunto">{m.titulo || m.saida}</h3>
      {m.pastaUrl ? (
        <a className="botao destaque" href={m.pastaUrl} target="_blank" rel="noreferrer">
          📂 Abrir pasta CFP
        </a>
      ) : (
        <p className="pendente-detalhe">Sem pasta anexada.</p>
      )}
    </article>
  );
}
