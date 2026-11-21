import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { observarProducaoDaCia } from '../../data/producao';
import { salvarRac } from '../../data/rac';
import { observarPrintsDoRac, salvarPrintRac, type PrintRac } from '../../data/racPrints';
import { formatarData, hojeISO } from '../../domain/datas';
import { racDaProducao } from '../../domain/integracao';
import type { Producao } from '../../domain/producao';
import {
  colunasPelotao,
  comCampo,
  conferirRac,
  corVariacao,
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
  type UnidadeRac,
} from '../../domain/rac';
import { conferirPrints, motivoDoErroDoPrint, slotsDaUnidade, type SlotPrint } from '../../domain/racPrints';
import type { UnidadeId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { reduzirFoto } from '../../lib/imagem';
import { useAoVivo } from '../../lib/useAoVivo';
import { quemSou } from '../../lib/quemSou';
import { Campo } from '../Campo';
import { PreviaRac } from '../PreviaRac';
import { baixarRacDaUnidade } from '../../lib/racApresentacao';

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
  const [previa, setPrevia] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const enviado = salvo?.status === 'enviado';
  const m = mesesDoRac(d.mes);
  const [ano, ret, ant, atu] = [m.anoAnterior, m.mesRetrasado, m.mesAnterior, m.atual].map(rotuloCurto);
  const prints = useAoVivo<PrintRac[]>((ok, e) => observarPrintsDoRac(db, p.mes.mes, p.unidade, ok, e), [p.mes.mes, p.unidade]);
  const alertas = [...conferirRac(d, historico), ...conferirPrints(d, prints.valor ?? [])];
  const erros = new Map(alertas.filter((a) => a.nivel === 'erro').map((a) => [a.campo, a]));
  const avisos = alertas.filter((a) => a.nivel === 'aviso');
  const s = situacaoRac(salvo, p.mes.prazo, hojeISO());
  const atual = producaoAtual(d);
  const semNome = tentou && !nome.trim();

  // Produtividade mensal tirada da produção dos pelotões (só com o mês completo e só nos campos vazios).
  // Quem confere com o QMO, corrige e envia é a Cia.
  const producao = useAoVivo<Producao[]>((ok, e) => observarProducaoDaCia(db, p.unidade, p.mes.mes, ok, e), [p.unidade, p.mes.mes]);
  const daProd = producao.valor ? racDaProducao(d, producao.valor, hojeISO()) : null;
  const preencheu = useRef(false);
  useEffect(() => {
    if (!daProd?.completa || preencheu.current) return;
    preencheu.current = true;
    setD((x) => racDaProducao(x, producao.valor!, hojeISO()).rac);
  }, [daProd, producao.valor]);
  const diferenteDaProducao = (c: string) =>
    daProd?.completa && c in daProd.daProducao && valorDoCampo(d, c) !== null && valorDoCampo(d, c) !== daProd.daProducao[c] ? daProd.daProducao[c] : null;
  const faltam = erros.size + avisos.filter((a) => !(d.justificativas[a.id] ?? '').trim()).length + (semNome ? 1 : 0);

  const mudar = (campo: string, valor: string) => setD((x) => comCampo(x, campo, lerNumero(valor)));
  const erroDe = (campo: string) => {
    if (!tentou) return undefined;
    const a = erros.get(campo);
    if (!a) return undefined;
    return !campo.startsWith('prints.') && valorDoCampo(d, campo) === null ? 'Preencha' : a.mensagem;
  };
  // Célula com campo (dentro das tabelas iguais às da apresentação) e células calculadas.
  const campo = (c: string, rotulo: string) => {
    const e = erroDe(c);
    const prod = diferenteDaProducao(c);
    return (
      <td key={c}>
        <div className={`campo celula-rac${e ? ' com-erro' : ''}`}>
          <input inputMode="numeric" autoComplete="off" aria-label={rotulo} value={valorDoCampo(d, c) ?? ''} onChange={(ev) => mudar(c, ev.target.value)} />
          {e && <span className="erro-campo">{e}</span>}
          {prod !== null && <span className="dica-producao">produção: {prod}</span>}
        </div>
      </td>
    );
  };
  const calc = (k: string, v: number | null) => (
    <td key={k} className="calc-rac">
      {v ?? '—'}
    </td>
  );
  const pct = (k: string, v: number | null, tipo: 'crime' | 'producao') => {
    const cor = corVariacao(v, tipo);
    return (
      <td key={k} className="calc-rac var-rac" style={cor ? { background: `#${cor}`, color: '#fff' } : undefined}>
        {textoVariacao(v)}
      </td>
    );
  };

  async function baixar() {
    setBaixando(true);
    setErro('');
    try {
      await baixarRacDaUnidade(db, d, nomeUnidadeRac(p.unidade));
    } catch (e) {
      console.error('Apresentação do RAC:', e);
      setErro('Não foi possível gerar a apresentação. Tente de novo.');
    }
    setBaixando(false);
  }

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
      const pronto = status === 'enviado' ? 'RAC enviado para a P/3.' : 'Rascunho salvo.';
      envio.then(() => setAviso(pronto)).catch(() => undefined);
      // O banco confirma em instantes; sem conexão, fica gravado no aparelho e termina sozinho depois.
      const confirmou = await Promise.race([envio.then(() => true), new Promise<boolean>((ok) => setTimeout(() => ok(false), 3000))]);
      try {
        if (nome.trim()) localStorage.setItem(CHAVE_NOME, nome.trim());
      } catch {
        /* sem armazenamento: segue */
      }
      setAviso(confirmou ? pronto : 'Gravado no aparelho. O envio termina sozinho quando a conexão voltar (não saia do portal).');
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
      <div className="acoes-linha acoes-quebra">
        <button className="botao secundario" type="button" aria-expanded={previa} onClick={() => setPrevia(!previa)}>
          {previa ? 'Fechar pré-visualização' : '👁️ Pré-visualizar'}
        </button>
        <button className="botao secundario" type="button" disabled={baixando} onClick={() => void baixar()}>
          {baixando ? 'Gerando…' : '⬇️ Baixar apresentação (.pptx)'}
        </button>
      </div>
      {previa && <PreviaRac d={d} />}

      <AvisoProducaoRac carregando={producao.carregando} erro={producao.erro} daProd={daProd} mes={d.mes} />

      {tentou && faltam > 0 && (
        <p className="mensagem erro" role="alert">
          Falta preencher ou corrigir {faltam === 1 ? '1 campo' : `${faltam} campos`} (se não houve, coloque 0).
        </p>
      )}

      {slotsDaUnidade(p.unidade).length > 0 && (
        <PrintsRac
          unidade={p.unidade}
          mes={d.mes}
          prints={prints.valor ?? []}
          erroDe={erroDe}
        />
      )}

      {temCrimes(p.unidade) && (
        <>
          <TabelaRac titulo="COMPARATIVO ANUAL" fonte="FONTE: SICOORD - SPJ" cabecalho={['DELITO', ano, atu, 'Var %']}>
            {DELITOS.map((c) => {
              const l = d.crimes[c.id];
              return (
                <tr key={c.id}>
                  <th scope="row">{c.rotulo}</th>
                  {campo(`crimes.${c.id}.anoAnterior`, `${c.rotulo} ${ano}`)}
                  {campo(`crimes.${c.id}.atual`, `${c.rotulo} ${atu}`)}
                  {pct('v', variacao(l.anoAnterior, l.atual), 'crime')}
                </tr>
              );
            })}
          </TabelaRac>

          <TabelaRac
            titulo="COMPARATIVO ANUAL COM INCONSISTÊNCIAS"
            fonte={`FONTE: SICOORD - SPJ · ${ano} e ${atu} vêm do comparativo anual; Real = ${atu} − inconsistências`}
            cabecalho={['DELITO', ano, atu, 'Inconsistências', 'Real', 'Var %']}
          >
            {DELITOS.map((c) => {
              const l = d.crimes[c.id];
              const real = realCrime(l);
              return (
                <tr key={c.id}>
                  <th scope="row">{c.rotulo}</th>
                  {calc('a', l.anoAnterior)}
                  {calc('m', l.atual)}
                  {campo(`crimes.${c.id}.inconsistencias`, `${c.rotulo} Inconsistências`)}
                  {calc('r', real)}
                  {pct('v', variacao(l.anoAnterior, real), 'crime')}
                </tr>
              );
            })}
          </TabelaRac>

          <TabelaRac titulo="COMPARATIVO TRIMESTRAL" fonte={`FONTE: SICOORD · ${atu} vem do comparativo anual`} cabecalho={['DELITO', ret, ant, atu]}>
            {DELITOS.map((c) => (
              <tr key={c.id}>
                <th scope="row">{c.rotulo}</th>
                {campo(`crimes.${c.id}.mesRetrasado`, `${c.rotulo} ${ret}`)}
                {campo(`crimes.${c.id}.mesAnterior`, `${c.rotulo} ${ant}`)}
                {calc('m', d.crimes[c.id].atual)}
              </tr>
            ))}
          </TabelaRac>
        </>
      )}

      <TabelaRac
        titulo="PRODUTIVIDADE MENSAL"
        fonte={`FONTE QMO · ${atu}`}
        cabecalho={[`8º BPMM – ${nomeUnidadeRac(p.unidade)}`, ...colunasPelotao(p.unidade).map((c) => c.rotulo), 'TOTAL']}
      >
        {linhasPelotao(p.unidade).map((l) => (
          <tr key={l.id}>
            <th scope="row">{l.rotulo}</th>
            {colunasPelotao(p.unidade).map((c) => campo(`pelotoes.${l.id}.${c.id}`, `${l.rotulo} ${c.rotulo}`))}
            {calc('t', totalPelotao(d, l.id))}
          </tr>
        ))}
      </TabelaRac>

      <TabelaRac
        titulo="COMPARATIVO PRODUTIVIDADE MENSAL"
        fonte={`FONTE QMO · ${atu} vem do TOTAL da produtividade mensal${prodDigitadaAParte(p.unidade).length ? ' (os itens que não estão nela são digitados aqui)' : ''}`}
        cabecalho={['PRODUTIVIDADE POLICIAL', ant, atu, 'Var %']}
      >
        {PRODUTIVIDADE.map((x) => (
          <tr key={x.id}>
            <th scope="row">{x.rotulo}</th>
            {campo(`producao.${x.id}.mesAnterior`, `${x.rotulo} ${ant}`)}
            {prodDigitadaAParte(p.unidade).includes(x.id) ? campo(`producao.${x.id}.atual`, `${x.rotulo} ${atu}`) : calc('m', atual[x.id])}
            {pct('v', variacao(d.producao[x.id].mesAnterior, atual[x.id]), 'producao')}
          </tr>
        ))}
      </TabelaRac>

      <TabelaRac titulo="COMPARATIVO PRODUTIVIDADE ANUAL" fonte="FONTE QMO" cabecalho={['PRODUTIVIDADE POLICIAL', ano, atu, 'Var %']}>
        {PRODUTIVIDADE.map((x) => (
          <tr key={x.id}>
            <th scope="row">{x.rotulo}</th>
            {campo(`producao.${x.id}.anoAnterior`, `${x.rotulo} ${ano}`)}
            {calc('m', atual[x.id])}
            {pct('v', variacao(d.producao[x.id].anoAnterior, atual[x.id]), 'producao')}
          </tr>
        ))}
      </TabelaRac>

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

/** Tabela do formulário no mesmo formato do slide (título, fonte e colunas). */
export function TabelaRac(p: { titulo: string; fonte: string; cabecalho: string[]; children: ReactNode }) {
  return (
    <fieldset className="cartao grupo">
      <legend>{p.titulo}</legend>
      <p className="rac-fonte">{p.fonte}</p>
      <div className="tabela-rolagem">
        <table className="tabela-rac" aria-label={p.titulo}>
          <thead>
            <tr>
              {p.cabecalho.map((h, i) => (
                <th key={i} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{p.children}</tbody>
        </table>
      </div>
    </fieldset>
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

/** Os prints do painel: entram só como imagem nos slides (os números são sempre digitados). */
export function PrintsRac(p: { unidade: UnidadeRac; mes: string; prints: PrintRac[]; erroDe: (campo: string) => string | undefined }) {
  const [estado, setEstado] = useState<Partial<Record<SlotPrint, string>>>({});
  const marcar = (slot: SlotPrint, texto: string) => setEstado((e) => ({ ...e, [slot]: texto }));

  async function escolher(slot: SlotPrint, arquivo: File | undefined) {
    if (!arquivo) return;
    marcar(slot, 'Preparando…');
    let etapa: 'preparar' | 'enviar' = 'preparar';
    try {
      const foto = await reduzirFoto(arquivo);
      etapa = 'enviar';
      marcar(slot, 'Enviando…');
      await salvarPrintRac(db, p.mes, p.unidade, slot, foto);
      marcar(slot, 'Enviado.');
    } catch (e) {
      console.error('Print do RAC:', e);
      marcar(slot, motivoDoErroDoPrint(etapa, e));
    }
  }

  return (
    <fieldset className="cartao grupo">
      <legend>Prints do painel (Coordenadoria Operacional)</legend>
      <p className="pendente-detalhe">Envie o print inteiro de cada painel. Ele entra como imagem no slide; os números são digitados nas tabelas abaixo.</p>
      <div className="grade-prints">
        {slotsDaUnidade(p.unidade).map((s) => {
          const salvo = p.prints.find((x) => x.slot === s.id);
          return (
            <div key={s.id} className="print-rac">
              <Campo rotulo={s.rotulo} obrigatorio erro={p.erroDe(`prints.${s.id}`)}>
                <input type="file" accept="image/*" onChange={(e) => void escolher(s.id, e.target.files?.[0])} />
              </Campo>
              {salvo?.miniatura && <img src={`data:image/jpeg;base64,${salvo.miniatura}`} alt={`Print enviado: ${s.rotulo}`} />}
              {estado[s.id] && <p className="rac-calculo">{estado[s.id]}</p>}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

function AvisoProducaoRac(p: { carregando: boolean; erro: string; daProd: ReturnType<typeof racDaProducao> | null; mes: string }) {
  if (p.erro) return <p className="mensagem erro">Não foi possível conferir a produção dos pelotões. A produtividade fica para preencher à mão.</p>;
  if (p.carregando || !p.daProd) return <p className="carregando">Conferindo a produção dos pelotões…</p>;
  if (!p.daProd.completa)
    return (
      <p className="mensagem atencao" role="alert">
        <strong>Produção dos pelotões de {rotuloMesLongo(p.mes)} incompleta</strong>
        {p.daProd.turnosFaltando ? ` (faltam ${p.daProd.turnosFaltando} turno(s))` : ' (o mês ainda não terminou)'}: a Produtividade Mensal não veio
        pré-preenchida. Complete a produção na Sala de Operações ou preencha à mão.
      </p>
    );
  return (
    <p className="mensagem aviso" role="status">
      A Produtividade Mensal (por pelotão e os itens à parte) veio da produção dos pelotões; RE e RPM vêm com 0, porque na
      produção eles entram no resultado do pelotão. Confira com o QMO e corrija o que for preciso: quem envia para a P/3 é a Cia.
    </p>
  );
}
