import { useState } from 'react';
import { observarAgendaCfp, type AgendaCfp, type MissaoCfp } from '../../data/missoes';
import { formatarData, hojeISO } from '../../domain/datas';
import { db } from '../../lib/firebase';
import { cutucarMotor, URL_MOTOR } from '../../lib/motor';
import { useAoVivo } from '../../lib/useAoVivo';
import { Recados } from './Recados';

function horaDe(isoCompleto: string): string {
  const d = new Date(isoCompleto);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatarData(hojeISO(d))} às ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Página do CFP: recados do Cmt do P3 e as missões da agenda. */
export function PainelCfp() {
  return (
    <>
      <Recados setor="cfp" />
      <MissoesCfp />
    </>
  );
}

/** Eventos da agenda do CFP no dia escolhido (com a pasta) e os próximos. Também aparece na aba CFP da P/3. */
export function MissoesCfp() {
  const [dia, setDia] = useState(hojeISO);
  const [pediu, setPediu] = useState(false);
  const missoes = useAoVivo<AgendaCfp | null>((ok, erro) => observarAgendaCfp(db, ok, erro), []);
  const agenda = missoes.valor;
  const lista = agenda?.eventos ?? [];
  const doDia = lista.filter((m) => m.inicio <= dia && dia <= (m.fim || m.inicio));
  const proximas = lista
    .filter((m) => m.inicio > dia)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .slice(0, 10);

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Missões do CFP</h2>
      </div>
      <p className="item-info">
        Direto da agenda do CFP
        {agenda?.conferidoEm ? ` · conferida em ${horaDe(agenda.conferidoEm)}` : ''}. O que mudar na agenda aparece aqui em até 5 minutos.
      </p>
      <div className="acoes-linha">
        <label className="campo">
          Data
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value || hojeISO())} />
        </label>
        <button className="botao secundario" type="button" onClick={() => setDia(hojeISO())}>
          Hoje
        </button>
        {URL_MOTOR && (
          <button className="botao secundario" type="button" onClick={() => setPediu(cutucarMotor())}>
            Atualizar agora
          </button>
        )}
      </div>
      {pediu && <p className="mensagem aviso" role="status">Pedido enviado: a agenda é lida de novo em instantes.</p>}
      {!missoes.carregando && !missoes.erro && agenda === null && (
        <p className="vazio">A agenda do CFP ainda não foi lida pelo Apps Script da P/3.</p>
      )}
      {missoes.erro && <p className="mensagem erro">{missoes.erro}</p>}
      {missoes.carregando && <p className="carregando">Carregando…</p>}
      {agenda && <h3>{dia === hojeISO() ? 'Missões de hoje' : `Missões de ${formatarData(dia)}`}</h3>}
      {!missoes.carregando && agenda && doDia.length === 0 && <p className="vazio">Nenhuma missão em {formatarData(dia)}.</p>}
      <ul className="lista lista-pendentes">
        {doDia.map((m) => (
          <li key={`${m.id}_${m.inicio}`}>
            <Missao m={m} />
          </li>
        ))}
      </ul>
      {proximas.length > 0 && (
        <>
          <h3>Próximas missões</h3>
          <ul className="lista lista-pendentes">
            {proximas.map((m) => (
              <li key={`${m.id}_${m.inicio}`}>
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
    <article className="item-pendente" aria-label={m.titulo}>
      <span className="item-topo">
        {m.numero > 0 && <strong>Nº {m.numero}</strong>}
        <span className="pendente-data">{periodo}</span>
      </span>
      <h3 className="pendente-assunto">{m.titulo}</h3>
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
