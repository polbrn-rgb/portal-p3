import { useState } from 'react';
import { abrirRac, alterarRac, excluirRacDaUnidade, excluirRacDoMes, observarRacMeses, observarRacsDoMes } from '../../data/rac';
import { formatarData, hojeISO } from '../../domain/datas';
import { mesReferenciaPadrao, nomeUnidadeRac, rotuloMesLongo, situacaoRac, UNIDADES_RAC, validarAberturaRac, type RacMes, type RacSalvo } from '../../domain/rac';
import { db } from '../../lib/firebase';
import { useAoVivo } from '../../lib/useAoVivo';
import { Campo } from '../Campo';
import { ROTULO_SITUACAO_RAC } from '../cia/RacCia';
import { PreviaRac } from '../PreviaRac';
import { RacBatalhao } from './RacBatalhao';
import { baixarRacDaUnidade } from '../../lib/racApresentacao';
import type { UnidadeId } from '../../domain/unidades';

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
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function abrir() {
    const e = validarAberturaRac(mes, prazo, jaAbertos);
    setErros(e);
    setErro('');
    setAviso('');
    if (Object.keys(e).length) return;
    setOcupado(true);
    try {
      await abrirRac(db, mes, prazo, jaAbertos); // resolve quando o banco confirma
      setAviso(`RAC de ${rotuloMesLongo(mes)} aberto para as Cias.`);
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
      {aviso && (
        <p className="mensagem aviso" role="status">
          {aviso}
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

type Confirmar = { tipo: 'mes' } | { tipo: 'unidade'; u: UnidadeId };

function CartaoRacP3({ m }: { m: RacMes }) {
  const racs = useAoVivo<RacSalvo[]>((ok, erro) => observarRacsDoMes(db, m.mes, ok, erro), [m.mes]);
  const [prazo, setPrazo] = useState(m.prazo);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [previa, setPrevia] = useState<UnidadeId | null>(null);
  const [baixando, setBaixando] = useState<UnidadeId | null>(null);
  const [confirmar, setConfirmar] = useState<Confirmar | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const hoje = hojeISO();
  const titulo = `RAC ${rotuloMesLongo(m.mes)}`;
  const enviados = (racs.valor ?? []).filter((r) => r.status === 'enviado').length;
  const racDe = (u: UnidadeId) => racs.valor?.find((x) => x.unidade === u);

  async function mudar(mudanca: Partial<Pick<RacMes, 'prazo' | 'status'>>) {
    setErro('');
    try {
      await alterarRac(db, m.mes, mudanca);
    } catch {
      setErro('Não foi possível gravar. Tente de novo.');
    }
  }

  async function baixar(u: UnidadeId) {
    const r = racDe(u);
    if (!r) return;
    setBaixando(u);
    setErro('');
    try {
      await baixarRacDaUnidade(db, r, nomeUnidadeRac(u));
    } catch (e) {
      console.error('Apresentação do RAC:', e);
      setErro('Não foi possível gerar a apresentação. Tente de novo.');
    }
    setBaixando(null);
  }

  async function excluir() {
    if (!confirmar) return;
    setExcluindo(true);
    setErro('');
    try {
      if (confirmar.tipo === 'mes') await excluirRacDoMes(db, m.mes);
      else {
        await excluirRacDaUnidade(db, m.mes, confirmar.u);
        if (previa === confirmar.u) setPrevia(null);
        setAviso(`RAC da ${nomeUnidadeRac(confirmar.u)} excluído.`);
      }
      setConfirmar(null);
    } catch {
      setErro('Não foi possível excluir. Tente de novo.');
    }
    setExcluindo(false);
  }

  const rPrevia = previa ? racDe(previa) : undefined;

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
              <th>Apresentação</th>
            </tr>
          </thead>
          <tbody>
            {UNIDADES_RAC.map((u) => {
              const r = racDe(u);
              const s = situacaoRac(r, m.prazo, hoje);
              const nome = nomeUnidadeRac(u);
              return (
                <tr key={u} className={s === 'atrasado' ? 'linha-atrasado' : undefined}>
                  <th scope="row">{nome}</th>
                  <td>{ROTULO_SITUACAO_RAC[s]}</td>
                  <td>{r?.preenchidoPor || '—'}</td>
                  <td className="acoes-tabela">
                    {r ? (
                      <>
                        <button className="botao-icone" type="button" title="Pré-visualizar" aria-label={`Pré-visualizar RAC da ${nome}`} onClick={() => setPrevia(previa === u ? null : u)}>
                          👁️
                        </button>
                        <button className="botao-icone" type="button" title="Baixar .pptx" aria-label={`Baixar RAC da ${nome}`} disabled={baixando === u} onClick={() => void baixar(u)}>
                          {baixando === u ? '…' : '⬇️'}
                        </button>
                        <button className="botao-icone" type="button" title="Excluir" aria-label={`Excluir RAC da ${nome}`} onClick={() => setConfirmar({ tipo: 'unidade', u })}>
                          🗑️
                        </button>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmar && (
        <div className="confirmar-linha" role="alertdialog" aria-label="Confirmar exclusão do RAC">
          <p>
            {confirmar.tipo === 'mes'
              ? `Excluir o ${titulo} inteiro? Some para todas as unidades, com os números e os prints, e é apagado do banco. Não dá para desfazer.`
              : `Excluir o RAC da ${nomeUnidadeRac(confirmar.u)} de ${rotuloMesLongo(m.mes)} (números e prints)? É apagado do banco; ${m.status === 'aberto' ? 'a Cia pode preencher de novo.' : 'reabra o mês para a Cia preencher de novo.'} Não dá para desfazer.`}
          </p>
          <div className="acoes-linha">
            <button className="botao secundario" type="button" onClick={() => setConfirmar(null)}>
              Cancelar
            </button>
            <button className="botao perigo" type="button" disabled={excluindo} onClick={() => void excluir()}>
              {excluindo ? 'Excluindo…' : 'Sim, excluir'}
            </button>
          </div>
        </div>
      )}

      <RacBatalhao m={m} racs={racs.valor ?? []} />

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
      {aviso && (
        <p className="mensagem aviso" role="status">
          {aviso}
        </p>
      )}
      <div className="acoes-linha acoes-quebra">
        {m.status === 'aberto' ? (
          <button className="botao secundario" type="button" onClick={() => mudar({ status: 'encerrado' })}>
            Encerrar (as Cias não alteram mais)
          </button>
        ) : (
          <button className="botao secundario" type="button" onClick={() => mudar({ status: 'aberto' })}>
            Reabrir
          </button>
        )}
        <button className="botao perigo" type="button" onClick={() => setConfirmar({ tipo: 'mes' })}>
          🗑️ Excluir RAC do mês
        </button>
      </div>

      {rPrevia && (
        <>
          <h4 className="titulo-secao">Pré-visualização — {nomeUnidadeRac(rPrevia.unidade)}</h4>
          <PreviaRac d={rPrevia} />
        </>
      )}
    </article>
  );
}
