import { useState } from 'react';
import { abrirRac, alterarRac, observarRacMeses, observarRacsDoMes } from '../../data/rac';
import { formatarData, hojeISO } from '../../domain/datas';
import { mesReferenciaPadrao, nomeUnidadeRac, rotuloMesLongo, situacaoRac, UNIDADES_RAC, validarAberturaRac, type RacMes, type RacSalvo } from '../../domain/rac';
import { db } from '../../lib/firebase';
import { useAoVivo } from '../../lib/useAoVivo';
import { Campo } from '../Campo';
import { ROTULO_SITUACAO_RAC } from '../cia/RacCia';

/** Operações → RAC: a P/3 abre o mês de referência com o prazo e acompanha o envio das Cias e da FT. */
export function RacP3() {
  const meses = useAoVivo<RacMes[]>((ok, erro) => observarRacMeses(db, ok, erro), [], 'Não foi possível carregar os RAC.');
  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>RAC</h2>
      </div>
      <AbrirRac jaAbertos={(meses.valor ?? []).map((m) => m.mes)} />
      {meses.erro && (
        <p className="mensagem erro" role="alert">
          {meses.erro}
        </p>
      )}
      {meses.carregando && <p className="carregando">Carregando…</p>}
      {!meses.carregando && !meses.valor?.length && <p className="vazio">Nenhum RAC aberto ainda.</p>}
      {(meses.valor ?? []).map((m) => (
        <CartaoRacP3 key={m.mes} m={m} />
      ))}
    </section>
  );
}

function AbrirRac({ jaAbertos }: { jaAbertos: string[] }) {
  const [mes, setMes] = useState(() => mesReferenciaPadrao(hojeISO()));
  const [prazo, setPrazo] = useState('');
  const [erros, setErros] = useState<Partial<Record<'mes' | 'prazo', string>>>({});
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function abrir() {
    const e = validarAberturaRac(mes, prazo, jaAbertos);
    setErros(e);
    setErro('');
    if (Object.keys(e).length) return;
    setOcupado(true);
    try {
      await abrirRac(db, mes, prazo, jaAbertos);
      setPrazo('');
    } catch {
      setErro('Não foi possível abrir o RAC. Tente de novo.');
    }
    setOcupado(false);
  }

  return (
    <div className="cartao grupo" role="group" aria-label="Abrir RAC">
      <h3 className="titulo-secao">Abrir RAC do mês</h3>
      <div className="grade-2">
        <Campo rotulo="Mês de referência" obrigatorio erro={erros.mes}>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </Campo>
        <Campo rotulo="Prazo das Cias" obrigatorio erro={erros.prazo}>
          <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </Campo>
      </div>
      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}
      <div className="acoes-linha">
        <button className="botao destaque" type="button" disabled={ocupado} onClick={abrir}>
          {ocupado ? 'Abrindo…' : 'Abrir RAC'}
        </button>
      </div>
    </div>
  );
}

function CartaoRacP3({ m }: { m: RacMes }) {
  const racs = useAoVivo<RacSalvo[]>((ok, erro) => observarRacsDoMes(db, m.mes, ok, erro), [m.mes]);
  const [prazo, setPrazo] = useState(m.prazo);
  const [erro, setErro] = useState('');
  const hoje = hojeISO();
  const titulo = `RAC ${rotuloMesLongo(m.mes)}`;
  const enviados = (racs.valor ?? []).filter((r) => r.status === 'enviado').length;

  async function mudar(mudanca: Partial<Pick<RacMes, 'prazo' | 'status'>>) {
    setErro('');
    try {
      await alterarRac(db, m.mes, mudanca);
    } catch {
      setErro('Não foi possível gravar. Tente de novo.');
    }
  }

  return (
    <article className="cartao grupo" aria-label={titulo}>
      <div className="item-topo">
        <h3>{titulo}</h3>
        <span className={`selo ${m.status === 'aberto' ? 'situacao-aguardando' : 'situacao-respondida'}`}>{m.status === 'aberto' ? 'Aberto' : 'Encerrado'}</span>
      </div>
      <p className="pendente-detalhe">
        Prazo das Cias {formatarData(m.prazo)} · {enviados} de {UNIDADES_RAC.length} enviados
      </p>
      <div className="tabela-rolagem">
        <table className="tabela-icc" aria-label={`Situação do ${titulo}`}>
          <thead>
            <tr>
              <th>Unidade</th>
              <th>Situação</th>
              <th>Preenchido por</th>
            </tr>
          </thead>
          <tbody>
            {UNIDADES_RAC.map((u) => {
              const r = racs.valor?.find((x) => x.unidade === u);
              const s = situacaoRac(r, m.prazo, hoje);
              return (
                <tr key={u} className={s === 'atrasado' ? 'linha-atrasado' : undefined}>
                  <th scope="row">{nomeUnidadeRac(u)}</th>
                  <td>{ROTULO_SITUACAO_RAC[s]}</td>
                  <td>{r?.preenchidoPor || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {m.status === 'aberto' && (
        <div className="acoes-linha">
          <Campo rotulo="Novo prazo">
            <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </Campo>
          <button className="botao secundario" type="button" disabled={!prazo || prazo === m.prazo} onClick={() => mudar({ prazo })}>
            Salvar prazo
          </button>
        </div>
      )}
      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}
      <div className="acoes-linha">
        {m.status === 'aberto' ? (
          <button className="botao secundario" type="button" onClick={() => mudar({ status: 'encerrado' })}>
            Encerrar (as Cias não alteram mais)
          </button>
        ) : (
          <button className="botao secundario" type="button" onClick={() => mudar({ status: 'aberto' })}>
            Reabrir
          </button>
        )}
      </div>
    </article>
  );
}
