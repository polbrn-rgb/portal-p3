import { useMemo } from 'react';
import { observarAbertosP3 } from '../../data/encaminhamentos';
import { formatarData, hojeISO } from '../../domain/datas';
import type { Encaminhamento } from '../../domain/encaminhamento';
import { montarPainel, type Prazo } from '../../domain/painel';
import { db } from '../../lib/firebase';
import { useAoVivo } from '../../lib/useAoVivo';
import { useDemandasAbertas } from '../../lib/useDemandasAbertas';

function Numero({ rotulo, valor, classe, href }: { rotulo: string; valor: number; classe: string; href?: string }) {
  const conteudo = (
    <>
      <strong>{valor}</strong>
      <span>{rotulo}</span>
    </>
  );
  return href ? (
    <a className={`numero-painel ${classe}`} href={href}>
      {conteudo}
    </a>
  ) : (
    <div className={`numero-painel ${classe}`}>{conteudo}</div>
  );
}

function quando(p: Prazo): string {
  if (p.dias === 0) return 'hoje';
  if (p.dias === 1) return 'amanhã';
  return `em ${p.dias} dias`;
}

/** Painel da P/3: prazos e situação das Cias num relance (usa as mesmas leituras da lista). */
export function PainelPrazos() {
  const hoje = hojeISO();
  const abertas = useDemandasAbertas();
  const encs = useAoVivo<Encaminhamento[]>((ok, erro) => observarAbertosP3(db, ok, erro), []);
  const painel = useMemo(
    () => (encs.valor ? montarPainel(abertas.lista, encs.valor, hoje) : undefined),
    [abertas.lista, encs.valor, hoje],
  );

  if (abertas.erro || encs.erro) {
    return (
      <p className="mensagem erro" role="alert">
        Não foi possível carregar o painel.
      </p>
    );
  }
  if (abertas.carregando || !painel) return <p className="carregando">Carregando…</p>;

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Painel de prazos</h2>
        <span className="item-info">{formatarData(hoje)}</span>
      </div>

      <div className="numeros-painel">
        <Numero rotulo="Atrasadas" valor={painel.atrasadas} classe="n-atrasado" href="#/demandas/atrasado" />
        <Numero rotulo="Vencem hoje" valor={painel.venceHoje} classe="n-hoje" href="#/demandas/vence_hoje" />
        <Numero rotulo="Próximos 3 dias" valor={painel.proximos3} classe="n-proximos" />
        <Numero rotulo="Cias atrasadas" valor={painel.ciasAtrasadas} classe="n-cia" href="#/demandas/cia_atrasada" />
        <Numero rotulo="Aguardando seu aceite" valor={painel.aguardandoAceite} classe="n-aceite" href="#/demandas/respondida" />
      </div>

      <div className="grade-painel">
        <div className="cartao grupo">
          <h3>Por Cia</h3>
          <table className="tabela-cias">
            <thead>
              <tr>
                <th>Cia</th>
                <th>Pendentes</th>
                <th>Atrasadas</th>
                <th>Aguard. aceite</th>
              </tr>
            </thead>
            <tbody>
              {painel.porCia.map((c) => (
                <tr key={c.unidade}>
                  <th scope="row">{c.sigla}</th>
                  <td>{c.pendentes}</td>
                  <td className={c.atrasadas ? 'tem-atraso' : ''}>{c.atrasadas}</td>
                  <td>{c.aguardandoAceite}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="cartao grupo">
          <h3>Próximos prazos</h3>
          {painel.proximosPrazos.length === 0 && <p className="vazio">Nenhum prazo daqui para frente.</p>}
          <ul className="lista-prazos">
            {painel.proximosPrazos.map((p) => (
              <li key={`${p.demandaId}-${p.tipo}`}>
                <a href={`#/demanda/${p.demandaId}`}>
                  <span className="prazo-data">
                    {formatarData(p.data)} · {quando(p)}
                  </span>
                  <span>
                    <strong>Nº {p.numero}</strong> {p.saida}
                  </span>
                  <span className="item-info">Prazo {p.tipo}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
