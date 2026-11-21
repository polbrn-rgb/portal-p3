import { useMemo, useState } from 'react';
import { observarProducaoDoMes } from '../../data/producao';
import { rotuloMes } from '../../domain/controle';
import { hojeISO } from '../../domain/datas';
import {
  ehDecimalPainel,
  INDICADORES_PAINEL,
  montarPainelBatalhao,
  porCia,
  porDia,
  type IndicadorPainelId,
} from '../../domain/painelBatalhao';
import type { Producao } from '../../domain/producao';
import { somarMeses, textoVariacao } from '../../domain/rac';
import { UNIDADES } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { useAoVivo } from '../../lib/useAoVivo';
import { Campo } from '../Campo';
import { Barras, Colunas } from '../Graficos';

// Painel → Estatístico do Batalhão: produção de todas as Cias, ao vivo (cada lançamento da Sala de Operações já entra).

const ehMes = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const numero = (v: number, decimal = false) => (decimal ? v.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : v.toLocaleString('pt-BR'));
const SIGLA = Object.fromEntries(UNIDADES.map((u) => [u.id, u.id === 'ft' ? 'FT' : u.sigla.replace(' CIA', '')]));

/** "▲ 12%" / "▼ 5%" / "= 0%": seta e texto (não só cor). Sem base no mês anterior: "novo". */
function Variacao({ v }: { v: number | null }) {
  if (v === null) return <span className="variacao">sem base no mês anterior</span>;
  const p = Math.round(v * 100);
  const seta = p > 0 ? '▲' : p < 0 ? '▼' : '=';
  return (
    <span className="variacao">
      {seta} {textoVariacao(v)} <span className="item-info">vs. mês anterior</span>
    </span>
  );
}

export function PainelBatalhao() {
  const hoje = hojeISO();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [indicadorId, setIndicadorId] = useState<IndicadorPainelId>('abordados');
  const valido = ehMes(mes);
  const anterior = valido ? somarMeses(mes, -1) : mes;
  const vazio = (ok: (l: Producao[]) => void) => (ok([]), () => undefined);
  const doMes = useAoVivo<Producao[]>((ok, e) => (valido ? observarProducaoDoMes(db, mes, ok, e) : vazio(ok)), [mes, valido], 'Não foi possível carregar a produção.');
  const doAnterior = useAoVivo<Producao[]>((ok, e) => (valido ? observarProducaoDoMes(db, anterior, ok, e) : vazio(ok)), [anterior, valido]);
  const lista = doMes.valor ?? [];
  const painel = useMemo(() => montarPainelBatalhao(lista, doAnterior.valor ?? [], mes, hoje), [lista, doAnterior.valor, mes, hoje]);
  const escolhido = INDICADORES_PAINEL.find((i) => i.id === indicadorId)!;
  const decimal = ehDecimalPainel(indicadorId);
  const fmt = (v: number) => numero(v, decimal);
  const dias = useMemo(() => porDia(lista, mes, indicadorId), [lista, mes, indicadorId]);
  const cias = useMemo(() => porCia(lista, mes, hoje, indicadorId), [lista, mes, hoje, indicadorId]);
  const corrente = mes === hoje.slice(0, 7);
  const atrasadas = painel.cobertura.filter((c) => c.turnosFaltando > 0);

  return (
    <section className="painel painel-estatistico" aria-label="Estatístico do Batalhão">
      <div className="painel-cabecalho">
        <h2>Estatístico do Batalhão</h2>
        <div className="filtros-estatistica">
          <Campo rotulo="Mês" className="campo-compacto">
            <input type="month" value={mes} max={hoje.slice(0, 7)} onChange={(e) => e.target.value && setMes(e.target.value)} />
          </Campo>
          <Campo rotulo="Indicador dos gráficos" className="campo-compacto">
            <select value={indicadorId} onChange={(e) => setIndicadorId(e.target.value as IndicadorPainelId)}>
              {INDICADORES_PAINEL.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.rotulo}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </div>
      <p className="item-info">
        Produção lançada pelas Salas de Operações de todas as Cias e da FT, atualizada a cada lançamento.{' '}
        {corrente ? `De 1º a ${painel.ateDia} de ${rotuloMes(mes)}` : rotuloMes(mes)}, comparado com os mesmos dias de {rotuloMes(anterior)}.
        {painel.ultimoLancamento && ` Último lançamento: ${painel.ultimoLancamento.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`}
      </p>
      {doMes.erro && (
        <p className="mensagem erro" role="alert">
          {doMes.erro}
        </p>
      )}
      {doMes.carregando && <p className="carregando">Carregando…</p>}

      {!doMes.carregando && !doMes.erro && (
        <>
          {atrasadas.length > 0 && (
            <p className="mensagem atencao" role="status" aria-label="Turnos sem lançamento">
              Números ainda incompletos — turnos sem lançamento até ontem:{' '}
              {atrasadas.map((c) => `${SIGLA[c.unidadeId]} (${c.turnosFaltando})`).join(', ')}.
            </p>
          )}

          <div className="numeros-painel numeros-batalhao" aria-label="Totais do Batalhão no mês">
            {painel.totais.map((t) => (
              <div key={t.id} className="numero-painel numero-batalhao">
                <strong>{numero(t.atual, ehDecimalPainel(t.id))}</strong>
                <span>{t.rotulo}</span>
                <Variacao v={t.variacao} />
              </div>
            ))}
            <div className="numero-painel numero-batalhao">
              <strong>{numero(painel.flagrantes.atual)}</strong>
              <span>Flagrantes (talões)</span>
              <Variacao v={painel.flagrantes.variacao} />
            </div>
          </div>

          <div className="grade-estatistica">
            <Colunas titulo={`${escolhido.rotulo} — dia a dia`} dados={dias} destaque={corrente ? painel.ateDia - 1 : undefined} formatar={fmt} />
            <Barras titulo={`${escolhido.rotulo} — por Cia`} dados={cias} formatar={fmt} />
            <Barras titulo="Flagrantes por natureza" dados={painel.naturezas} />
            <Barras
              titulo="Lançamentos de produção por Cia"
              dados={painel.cobertura.map((c) => ({ rotulo: UNIDADES.find((u) => u.id === c.unidadeId)!.sigla, valor: c.lancamentos }))}
            />
          </div>

          <details className="cartao grupo">
            <summary>Ver os números dia a dia ({escolhido.rotulo})</summary>
            <div className="tabela-rolagem">
              <table className="tabela-icc" aria-label="Indicador dia a dia">
                <thead>
                  <tr>
                    <th scope="col">Dia</th>
                    <th scope="col">{escolhido.rotulo}</th>
                  </tr>
                </thead>
                <tbody>
                  {dias.map((d) => (
                    <tr key={d.rotulo}>
                      <th scope="row">{d.rotulo}</th>
                      <td>{fmt(d.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
