import { useMemo, useState } from 'react';
import { salvarRac } from '../../data/rac';
import { formatarData, hojeISO } from '../../domain/datas';
import {
  colunasPelotao,
  comCampo,
  conferirRac,
  DELITOS,
  historicoDoRac,
  lerNumero,
  linhasPelotao,
  mesesDoRac,
  nomeUnidadeRac,
  podeEnviar,
  preencherDoHistorico,
  prodDigitadaAParte,
  producaoAtual,
  PRODUTIVIDADE,
  racVazio,
  realCrime,
  rotuloCurto,
  rotuloMesLongo,
  situacaoRac,
  temCrimes,
  textoVariacao,
  totalPelotao,
  valorDoCampo,
  variacao,
  type Alerta,
  type RacDados,
  type RacMes,
  type RacSalvo,
  type SituacaoRac,
} from '../../domain/rac';
import type { UnidadeId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { quemSou } from '../../lib/quemSou';
import { Campo } from '../Campo';

export const ROTULO_SITUACAO_RAC: Record<SituacaoRac, string> = { enviado: '✅ Enviado', rascunho: '📝 Rascunho', pendente: 'Pendente', atrasado: 'Atrasado' };
const CLASSE_SITUACAO: Record<SituacaoRac, string> = { enviado: 'gravado', rascunho: 'enviado', pendente: 'pendente', atrasado: 'atrasado' };
const CHAVE_NOME = 'portalp3.respondidoPor';

export function contarPendentesRac(meses: RacMes[], racs: RacSalvo[]): number {
  return meses.filter((m) => !racs.some((r) => r.mes === m.mes && r.status === 'enviado')).length;
}

/** Aba RAC da Cia/FT: os meses abertos pela P/3. */
export function ListaRacCia(p: { meses: RacMes[]; racs: RacSalvo[]; carregando: boolean }) {
  const hoje = hojeISO();
  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>RAC</h2>
      </div>
      {p.carregando && <p className="carregando">Carregando…</p>}
      {!p.carregando && !p.meses.length && <p className="vazio">Nenhum RAC aberto pela P/3.</p>}
      <ul className="lista">
        {p.meses.map((m) => {
          const s = situacaoRac(p.racs.find((r) => r.mes === m.mes), m.prazo, hoje);
          return (
            <li key={m.mes}>
              <a className="item-pendente link-cartao" href={`#/rac/${m.mes}`}>
                <span className="item-topo">
                  <strong>RAC {rotuloMesLongo(m.mes)}</strong>
                  <span className={`selo selo-doc-${CLASSE_SITUACAO[s]}`}>{ROTULO_SITUACAO_RAC[s]}</span>
                </span>
                <span className="pendente-detalhe">Prazo {formatarData(m.prazo)}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function lerNome(): string {
  try {
    return localStorage.getItem(CHAVE_NOME) ?? '';
  } catch {
    return '';
  }
}

/** Preenchimento do RAC do mês: ninguém digita Real, TOTAL nem Var % (o portal calcula). */
export function FormRacCia(p: { unidade: UnidadeId; mes: RacMes; racs: RacSalvo[] }) {
  const salvo = p.racs.find((r) => r.mes === p.mes.mes);
  const historico = useMemo(() => historicoDoRac(p.racs, p.mes.mes), [p.racs, p.mes.mes]);
  const [d, setD] = useState<RacDados>(() => salvo ?? preencherDoHistorico(racVazio(p.unidade, p.mes.mes), historico));
  const [nome, setNome] = useState(quemSou() ?? (salvo?.preenchidoPor || lerNome()));
  const [tentou, setTentou] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const enviado = salvo?.status === 'enviado';
  const m = mesesDoRac(d.mes);
  const [ano, ret, ant, atu] = [m.anoAnterior, m.mesRetrasado, m.mesAnterior, m.atual].map(rotuloCurto);
  const alertas = conferirRac(d, historico);
  const erros = new Map(alertas.filter((a) => a.nivel === 'erro').map((a) => [a.campo, a]));
  const avisos = alertas.filter((a) => a.nivel === 'aviso');
  const s = situacaoRac(salvo, p.mes.prazo, hojeISO());
  const atual = producaoAtual(d);
  const semNome = tentou && !nome.trim();
  const faltam = erros.size + avisos.filter((a) => !(d.justificativas[a.id] ?? '').trim()).length + (semNome ? 1 : 0);

  const mudar = (campo: string, valor: string) => setD((x) => comCampo(x, campo, lerNumero(valor)));
  const erroDe = (campo: string) => {
    if (!tentou) return undefined;
    const a = erros.get(campo);
    if (!a) return undefined;
    return valorDoCampo(d, campo) === null ? 'Preencha (se não houve, 0).' : a.mensagem;
  };
  const num = (campo: string, rotulo: string) => (
    <Campo key={campo} rotulo={rotulo} obrigatorio erro={erroDe(campo)}>
      <input inputMode="numeric" autoComplete="off" value={valorDoCampo(d, campo) ?? ''} onChange={(e) => mudar(campo, e.target.value)} />
    </Campo>
  );

  async function gravar(status: 'rascunho' | 'enviado') {
    setErro('');
    setAviso('');
    if (status === 'enviado') {
      setTentou(true);
      if (!podeEnviar(d, alertas) || !nome.trim()) return;
    }
    setOcupado(true);
    try {
      const envio = salvarRac(db, d, status, nome);
      envio.catch(() => undefined);
      await Promise.race([envio, new Promise((ok) => setTimeout(ok, 3000))]);
      try {
        if (nome.trim()) localStorage.setItem(CHAVE_NOME, nome.trim());
      } catch {
        /* sem armazenamento: segue */
      }
      setAviso(status === 'enviado' ? 'RAC enviado para a P/3.' : 'Rascunho salvo.');
    } catch {
      setErro('Não foi possível gravar. Verifique a conexão e tente de novo.');
    }
    setOcupado(false);
  }

  return (
    <section className="painel painel-estreito formulario-rac">
      <div className="painel-cabecalho">
        <h2>
          RAC – {nomeUnidadeRac(p.unidade)} – {rotuloMesLongo(d.mes)}
        </h2>
        <span className={`selo selo-doc-${CLASSE_SITUACAO[s]}`}>{ROTULO_SITUACAO_RAC[s]}</span>
      </div>
      <p className="pendente-detalhe">
        Prazo {formatarData(p.mes.prazo)}. Real, TOTAL e Var % são calculados pelo portal.
      </p>

      {tentou && faltam > 0 && (
        <p className="mensagem erro" role="alert">
          Falta preencher ou corrigir {faltam === 1 ? '1 campo' : `${faltam} campos`}.
        </p>
      )}

      {temCrimes(p.unidade) && (
        <fieldset className="cartao grupo">
          <legend>Crimes (SICOORD)</legend>
          {DELITOS.map((c) => {
            const l = d.crimes[c.id];
            const real = realCrime(l);
            return (
              <div key={c.id} className="rac-linha" role="group" aria-label={c.rotulo}>
                <h4>{c.rotulo}</h4>
                <div className="grade-rac">
                  {num(`crimes.${c.id}.anoAnterior`, ano)}
                  {num(`crimes.${c.id}.mesRetrasado`, ret)}
                  {num(`crimes.${c.id}.mesAnterior`, ant)}
                  {num(`crimes.${c.id}.atual`, atu)}
                  {num(`crimes.${c.id}.inconsistencias`, 'Inconsist.')}
                </div>
                <p className="rac-calculo">
                  Var % {textoVariacao(variacao(l.anoAnterior, l.atual))} · Real {real ?? '—'} · Var % c/ inconsist.{' '}
                  {textoVariacao(variacao(l.anoAnterior, real))}
                </p>
              </div>
            );
          })}
        </fieldset>
      )}

      <fieldset className="cartao grupo">
        <legend>Produtividade mensal por pelotão — {atu} (QMO)</legend>
        {linhasPelotao(p.unidade).map((l) => (
          <div key={l.id} className="rac-linha" role="group" aria-label={l.rotulo}>
            <h4>{l.rotulo}</h4>
            <div className="grade-rac">{colunasPelotao(p.unidade).map((c) => num(`pelotoes.${l.id}.${c.id}`, c.rotulo))}</div>
            <p className="rac-calculo">TOTAL {totalPelotao(d, l.id) ?? '—'}</p>
          </div>
        ))}
      </fieldset>

      {prodDigitadaAParte(p.unidade).length > 0 && (
        <fieldset className="cartao grupo">
          <legend>Outros itens de {atu} (QMO)</legend>
          <div className="grade-rac">
            {prodDigitadaAParte(p.unidade).map((id) => num(`producao.${id}.atual`, PRODUTIVIDADE.find((x) => x.id === id)!.rotulo))}
          </div>
        </fieldset>
      )}

      <fieldset className="cartao grupo">
        <legend>Comparativo de produtividade (QMO)</legend>
        {PRODUTIVIDADE.map((x) => {
          const l = d.producao[x.id];
          return (
            <div key={x.id} className="rac-linha" role="group" aria-label={x.rotulo}>
              <h4>{x.rotulo}</h4>
              <div className="grade-rac">
                {num(`producao.${x.id}.mesAnterior`, ant)}
                {num(`producao.${x.id}.anoAnterior`, ano)}
              </div>
              <p className="rac-calculo">
                {atu}: {atual[x.id] ?? '—'} · mensal {textoVariacao(variacao(l.mesAnterior, atual[x.id]))} · anual{' '}
                {textoVariacao(variacao(l.anoAnterior, atual[x.id]))}
              </p>
            </div>
          );
        })}
      </fieldset>

      {avisos.length > 0 && <Avisos avisos={avisos} d={d} tentou={tentou} mudar={(id, t) => setD((x) => ({ ...x, justificativas: { ...x.justificativas, [id]: t } }))} />}

      <div className="cartao grupo">
        <Campo rotulo="Preenchido por" obrigatorio erro={semNome ? 'Informe quem preencheu (posto/graduação e nome).' : undefined}>
          <input value={nome} readOnly={Boolean(quemSou())} placeholder="Posto/graduação e nome" autoComplete="name" onChange={(e) => setNome(e.target.value)} />
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

      <div className="barra-acoes">
        <a className="botao secundario" href="#/rac">
          Voltar
        </a>
        {!enviado && (
          <button className="botao secundario" type="button" disabled={ocupado} onClick={() => gravar('rascunho')}>
            Salvar rascunho
          </button>
        )}
        <button className="botao destaque" type="button" disabled={ocupado} onClick={() => gravar('enviado')}>
          {ocupado ? 'Gravando…' : enviado ? 'Atualizar envio' : 'Enviar à P/3'}
        </button>
      </div>
    </section>
  );
}

function Avisos(p: { avisos: Alerta[]; d: RacDados; tentou: boolean; mudar: (id: string, texto: string) => void }) {
  return (
    <fieldset className="cartao grupo">
      <legend>Conferência — justifique para enviar</legend>
      {p.avisos.map((a) => {
        const texto = p.d.justificativas[a.id] ?? '';
        return (
          <div key={a.id} className="rac-aviso">
            <p className="mensagem aviso-rac">⚠️ {a.mensagem}</p>
            <Campo rotulo="Justificativa" obrigatorio erro={p.tentou && !texto.trim() ? 'Escreva a justificativa.' : undefined}>
              <textarea rows={2} value={texto} onChange={(e) => p.mudar(a.id, e.target.value)} />
            </Campo>
          </div>
        );
      })}
    </fieldset>
  );
}
