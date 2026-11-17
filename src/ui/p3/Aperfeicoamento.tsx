import { useMemo, useState, type FormEvent } from 'react';
import { criarEap, editarEap, encerrarEap, observarEaps, observarRespostasDaEap, pedirCompiladoEap } from '../../data/eap';
import { formatarData, hojeISO } from '../../domain/datas';
import {
  eapVazia,
  MESES_EAP,
  rotuloTurma,
  tituloEap,
  totalVagasDaCia,
  TURMAS_EAP,
  validarEap,
  type DadosEap,
  type Eap,
  type RespostaEap,
} from '../../domain/eap';
import { UNIDADES, type UnidadeId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { irPara } from '../../lib/navegacao';
import { useAoVivo } from '../../lib/useAoVivo';
import { Campo, Obrigatorio } from '../Campo';
import { AtalhoEmail } from './AtalhoEmail';
import { assuntoEap, corpoPadrao } from '../../domain/email';
import { demandaVazia } from '../../domain/demanda';
import type { Responsavel } from '../../domain/listas';
import { observarIccs } from '../../data/icc';
import type { Icc } from '../../domain/icc';
import { DetalheIcc, FormIcc, ListaIccP3 } from './IccP3';

const CURTO: Record<string, string> = { cbsd1: 'Cb/Sd 1', cbsd2: 'Cb/Sd 2', cbsd3: 'Cb/Sd 3', sgt1: 'Sgt 1', sgt2: 'Sgt 2' };

/** Aba Aperfeiçoamento da P/3: EAP e ICC. */
export function Aperfeicoamento({ rota }: { rota: string }) {
  const eaps = useAoVivo<Eap[]>((ok, erro) => observarEaps(db, ok, erro), [], 'Não foi possível carregar o Aperfeiçoamento.');
  const iccs = useAoVivo<Icc[]>((ok, erro) => observarIccs(db, ok, erro), [], 'Não foi possível carregar as ICC.');
  const icc = /^#\/aperfeicoamento\/icc\/([^/]+)$/.exec(rota)?.[1];
  if (icc === 'nova') return <FormIcc />;
  if (icc) {
    const i = iccs.valor?.find((x) => x.id === icc);
    if (!i) return iccs.carregando ? <p className="carregando">Carregando…</p> : <p className="mensagem erro">ICC não encontrada.</p>;
    return <DetalheIcc icc={i} />;
  }
  const [, id, acao] = /^#\/aperfeicoamento(?:\/([^/]+))?(?:\/(editar))?$/.exec(rota) ?? [];

  if (id === 'nova') return <FormEap />;
  if (id) {
    const eap = eaps.valor?.find((e) => e.id === id);
    if (!eap) return eaps.carregando ? <p className="carregando">Carregando…</p> : <p className="mensagem erro">EAP não encontrado.</p>;
    return acao ? <FormEap key={eap.id} existente={eap} /> : <DetalheEap eap={eap} />;
  }

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Aperfeiçoamento</h2>
        <a className="botao destaque" href="#/aperfeicoamento/nova">
          + Novo EAP
        </a>
      </div>
      <h3 className="titulo-secao">EAP · Estágio de Atualização Profissional</h3>
      {eaps.erro && (
        <p className="mensagem erro" role="alert">
          {eaps.erro}
        </p>
      )}
      {eaps.carregando && <p className="carregando">Carregando…</p>}
      {!eaps.carregando && !eaps.erro && !eaps.valor?.length && <p className="vazio">Nenhum EAP aberto ainda.</p>}
      <ul className="lista">
        {(eaps.valor ?? []).map((e) => (
          <li key={e.id}>
            <a className="item-pendente link-cartao" href={`#/aperfeicoamento/${e.id}`}>
              <span className="item-topo">
                <strong>{tituloEap(e)}</strong>
                <span className={`selo ${e.status === 'aberta' ? 'situacao-aguardando' : 'situacao-respondida'}`}>
                  {e.status === 'aberta' ? 'Aberto' : 'Encerrado'}
                </span>
              </span>
              <span className="pendente-detalhe">
                Prazo das Cias {formatarData(e.prazo)} · {situacaoPlanilha(e)}
              </span>
            </a>
          </li>
        ))}
      </ul>
      {iccs.erro && (
        <p className="mensagem erro" role="alert">
          {iccs.erro}
        </p>
      )}
      <ListaIccP3 iccs={iccs.valor ?? []} />
    </section>
  );
}

function situacaoPlanilha(e: Eap): string {
  if (e.planilha?.status === 'pronta') return 'planilha pronta';
  if (e.planilha?.status === 'erro') return 'erro ao criar a planilha';
  return 'criando a planilha…';
}

function FormEap({ existente }: { existente?: Eap }) {
  const [d, setD] = useState<DadosEap>(() => (existente ? copiarDados(existente) : eapVazia(hojeISO())));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState('');

  const mudar = <K extends keyof DadosEap>(k: K, v: DadosEap[K]) => setD((x) => ({ ...x, [k]: v }));
  const mudarTurma = (id: string, campo: 'numero' | 'inicio' | 'fim', v: string) =>
    setD((x) => ({ ...x, turmas: x.turmas.map((t) => (t.id === id ? { ...t, [campo]: v } : t)) }));
  const mudarVaga = (cia: UnidadeId, turma: string, v: string) =>
    setD((x) => ({ ...x, vagas: { ...x.vagas, [cia]: { ...x.vagas[cia], [turma]: Math.max(0, Math.min(99, Number(v) || 0)) } } }));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const encontrados = validarEap(d);
    setErros(encontrados);
    setErroGeral('');
    if (Object.keys(encontrados).length) return;
    setSalvando(true);
    try {
      if (existente) {
        await editarEap(db, existente, d);
        irPara(`#/aperfeicoamento/${existente.id}`);
      } else {
        irPara(`#/aperfeicoamento/${await criarEap(db, d)}`);
      }
    } catch {
      setErroGeral('Não foi possível salvar. Tente de novo.');
      setSalvando(false);
    }
  }

  const meses = MESES_EAP.map((m, i) => (
    <option key={m} value={i + 1}>
      {m}
    </option>
  ));

  return (
    <section className="painel painel-estreito">
      <div className="painel-cabecalho">
        <h2>{existente ? 'Editar EAP' : 'Novo EAP'}</h2>
      </div>
      <form className="formulario-eap" onSubmit={salvar} noValidate aria-label="EAP">
        <fieldset className="cartao grupo">
          <legend>Cabeçalho da planilha</legend>
          <div className="grade-3">
            <Campo rotulo="Ano" erro={erros.ano} obrigatorio>
              <input type="number" inputMode="numeric" value={d.ano} onChange={(e) => mudar('ano', Number(e.target.value))} />
            </Campo>
            <Campo rotulo="Mês do EAD" erro={erros.mesEad} obrigatorio>
              <select value={d.mesEad} onChange={(e) => mudar('mesEad', Number(e.target.value))}>
                {meses}
              </select>
            </Campo>
            <Campo rotulo="Mês do presencial" erro={erros.mesPresencial} obrigatorio>
              <select value={d.mesPresencial} onChange={(e) => mudar('mesPresencial', Number(e.target.value))}>
                {meses}
              </select>
            </Campo>
          </div>
          <div className="grade-2">
            <Campo rotulo="Início do EAD" erro={erros.eadInicio} obrigatorio>
              <input type="date" value={d.eadInicio} onChange={(e) => mudar('eadInicio', e.target.value)} />
            </Campo>
            <Campo rotulo="Fim do EAD" erro={erros.eadFim} obrigatorio>
              <input type="date" value={d.eadFim} onChange={(e) => mudar('eadFim', e.target.value)} />
            </Campo>
          </div>
        </fieldset>

        {TURMAS_EAP.map((tt) => {
          const t = d.turmas.find((x) => x.id === tt.id)!;
          return (
            <fieldset key={tt.id} className="cartao grupo" aria-label={tt.rotulo}>
              <legend>{tt.rotulo}</legend>
              <div className="grade-3">
                <Campo rotulo="Nº da turma" erro={erros[`turma.${tt.id}.numero`]} obrigatorio>
                  <input inputMode="numeric" value={t.numero} onChange={(e) => mudarTurma(tt.id, 'numero', e.target.value)} />
                </Campo>
                <Campo rotulo="Início" erro={erros[`turma.${tt.id}.inicio`]} obrigatorio>
                  <input type="date" value={t.inicio} onChange={(e) => mudarTurma(tt.id, 'inicio', e.target.value)} />
                </Campo>
                <Campo rotulo="Fim" erro={erros[`turma.${tt.id}.fim`]} obrigatorio>
                  <input type="date" value={t.fim} onChange={(e) => mudarTurma(tt.id, 'fim', e.target.value)} />
                </Campo>
              </div>
            </fieldset>
          );
        })}

        <fieldset className="cartao grupo">
          <legend>
            Vagas por Cia
            <Obrigatorio />
          </legend>
          <p className="pendente-detalhe">Quantos policiais cada Cia manda em cada turma (a planilha fica com essas linhas).</p>
          <div className="tabela-vagas" role="table" aria-label="Vagas por Cia">
            <div role="row" className="linha-vagas cabecalho-vagas">
              <span role="columnheader">Cia</span>
              {TURMAS_EAP.map((t) => (
                <span key={t.id} role="columnheader">
                  {CURTO[t.id]}
                </span>
              ))}
            </div>
            {UNIDADES.map((u) => (
              <div key={u.id} role="row" className="linha-vagas">
                <span role="rowheader">{u.sigla}</span>
                {TURMAS_EAP.map((t) => (
                  <span key={t.id} role="cell">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={99}
                      aria-label={`Vagas ${u.sigla} ${CURTO[t.id]}`}
                      value={d.vagas[u.id]?.[t.id] || ''}
                      placeholder="0"
                      onChange={(e) => mudarVaga(u.id, t.id, e.target.value)}
                    />
                  </span>
                ))}
              </div>
            ))}
          </div>
          {erros.vagas && <span className="erro-campo">{erros.vagas}</span>}
        </fieldset>

        <div className="cartao grupo">
          <Campo rotulo="Prazo para as Cias indicarem o efetivo" erro={erros.prazo} obrigatorio>
            <input type="date" value={d.prazo} onChange={(e) => mudar('prazo', e.target.value)} />
          </Campo>
        </div>

        {erroGeral && (
          <p className="mensagem erro" role="alert">
            {erroGeral}
          </p>
        )}
        <div className="acoes-linha">
          <a className="botao secundario" href={existente ? `#/aperfeicoamento/${existente.id}` : '#/aperfeicoamento'}>
            Cancelar
          </a>
          <button className="botao destaque" type="submit" disabled={salvando}>
            {salvando ? 'Salvando…' : existente ? 'Salvar alterações' : 'Abrir EAP e criar a planilha'}
          </button>
        </div>
      </form>
    </section>
  );
}

function copiarDados(e: Eap): DadosEap {
  const turmas = TURMAS_EAP.map((t) => e.turmas.find((x) => x.id === t.id) ?? { id: t.id, tipo: t.tipo, numero: '', inicio: '', fim: '' });
  return { ano: e.ano, mesEad: e.mesEad, mesPresencial: e.mesPresencial, eadInicio: e.eadInicio, eadFim: e.eadFim, prazo: e.prazo, turmas, vagas: e.vagas ?? {} };
}

function situacaoResposta(r: RespostaEap | undefined, prazo: string, hoje: string): { texto: string; classe: string } {
  if (!r || r.status !== 'enviada') return prazo < hoje ? { texto: 'Atrasada', classe: 'situacao-atrasada' } : { texto: 'Aguardando', classe: 'situacao-aguardando' };
  if (r.erro) return { texto: 'Erro ao gravar', classe: 'situacao-atrasada' };
  return r.gravado ? { texto: 'Na planilha', classe: 'situacao-respondida' } : { texto: 'Gravando…', classe: 'situacao-aguardando' };
}

function DetalheEap({ eap }: { eap: Eap }) {
  const hoje = hojeISO();
  const respostas = useAoVivo<RespostaEap[]>((ok, erro) => observarRespostasDaEap(db, eap.id, ok, erro), [eap.id]);
  const porCia = useMemo(() => new Map((respostas.valor ?? []).map((r) => [r.unidadeId, r])), [respostas.valor]);
  const [confirmarEncerrar, setConfirmarEncerrar] = useState(false);
  const enviadas = (respostas.valor ?? []).filter((r) => r.status === 'enviada').length;

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>{tituloEap(eap)}</h2>
        <a href="#/aperfeicoamento">Voltar</a>
      </div>

      <div className="cartao grupo">
        <p className="pendente-detalhe">
          EAD de {formatarData(eap.eadInicio)} a {formatarData(eap.eadFim)} · Prazo das Cias {formatarData(eap.prazo)}
        </p>
        <ul className="lista-simples">
          {eap.turmas.map((t) => (
            <li key={t.id}>{rotuloTurma(t)}</li>
          ))}
        </ul>
        {eap.planilha?.status === 'pronta' && eap.planilha.url ? (
          <a className="botao secundario" href={eap.planilha.url} target="_blank" rel="noreferrer">
            📄 Abrir planilha
          </a>
        ) : eap.planilha?.status === 'erro' ? (
          <p className="mensagem erro">Erro ao criar a planilha: {eap.planilha.erro}</p>
        ) : (
          <p className="mensagem aviso">Criando a cópia da planilha na pasta do Drive (até 5 minutos)…</p>
        )}
      </div>

      <div className="cartao grupo">
        <h3>
          Cias · {enviadas} de {UNIDADES.length} enviaram
        </h3>
        <table className="tabela-cias tabela-eap">
          <thead>
            <tr>
              <th>Cia</th>
              <th>Vagas</th>
              <th>Situação</th>
              <th>Enviado por</th>
            </tr>
          </thead>
          <tbody>
            {UNIDADES.map((u) => {
              const r = porCia.get(u.id);
              const s = situacaoResposta(r, eap.prazo, hoje);
              return (
                <tr key={u.id}>
                  <th scope="row">{u.sigla}</th>
                  <td>{totalVagasDaCia(eap.vagas[u.id])}</td>
                  <td>
                    <span className={`selo ${s.classe}`} title={r?.erro || undefined}>
                      {s.texto}
                    </span>
                  </td>
                  <td>{r?.status === 'enviada' ? r.respondidoPor : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {eap.status === 'aberta' && (
        <div className="acoes-linha acoes-efetivo">
          <a className="botao secundario" href={`#/aperfeicoamento/${eap.id}/editar`}>
            ✏️ Editar
          </a>
          <button
            className="botao secundario"
            type="button"
            disabled={eap.planilha?.status !== 'pronta' || eap.compilado?.status === 'pedido'}
            onClick={() => void pedirCompiladoEap(db, eap.id)}
          >
            {eap.compilado?.status === 'pedido' ? 'Gerando compilado…' : '📋 Gerar compilado das turmas'}
          </button>
          {confirmarEncerrar ? (
            <>
              <span className="pendente-detalhe">Encerrar? Some da tela das Cias (a planilha fica).</span>
              <button className="botao perigo" type="button" onClick={() => void encerrarEap(db, eap)}>
                Sim, encerrar
              </button>
              <button className="botao secundario" type="button" onClick={() => setConfirmarEncerrar(false)}>
                Cancelar
              </button>
            </>
          ) : (
            <button className="botao secundario" type="button" onClick={() => setConfirmarEncerrar(true)}>
              Encerrar EAP
            </button>
          )}
        </div>
      )}
      {eap.compilado?.status === 'pronto' && (
        <p className="mensagem aviso" role="status">
          Compilado gerado na aba COMPILADO TURMAS ({eap.compilado.registros} policiais).
        </p>
      )}
      {eap.compilado?.status === 'erro' && <p className="mensagem erro">Erro no compilado: {eap.compilado.erro}</p>}

      <AtalhoEmail
        atalho="eap"
        refId={eap.id}
        inicial={{ ao: 'Ao Sr. Cmt CPA M-11', assunto: assuntoEap(eap), corpo: corpoPadrao }}
        planilha={eap.planilha?.status === 'pronta' && eap.planilha.id ? { id: eap.planilha.id, nome: tituloEap(eap) } : undefined}
        demanda={(assunto, transmissor, hoje) => ({
          ...demandaVazia(hoje),
          tipoSaida: 'MSG ELETRÔNICA',
          saida: assunto,
          meioSaida: 'E-mail',
          destinos: ['secop'],
          categoria: 'Aperfeiçoamento',
          responsavel: transmissor as Responsavel,
        })}
      />
    </section>
  );
}
