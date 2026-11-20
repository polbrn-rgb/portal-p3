import { useState } from 'react';
import { observarPrimeirosLancamentos, observarProducaoDoMes } from '../../data/producao';
import { hojeISO } from '../../domain/datas';
import {
  abasDaProducao,
  ITENS_PRODUCAO,
  nomePlanilha,
  pendencias,
  somarItens,
  textoQuantidade,
  turnosPendentes,
  type ItemId,
  type Producao,
} from '../../domain/producao';
import { UNIDADES, type UnidadeId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { useAoVivo } from '../../lib/useAoVivo';
import { baixarXlsx } from '../../lib/xlsx';
import { Campo } from '../Campo';

// Operações → Produtividade: o que as Salas de Operações das Cias/FT lançaram no mês, somado por unidade,
// com os turnos sem lançamento e a planilha completa (lançamentos, por dia, totais e talões).

const ehMes = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

export function ProducaoP3() {
  const hoje = hojeISO();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const valido = ehMes(mes);
  const lancs = useAoVivo<Producao[]>(
    (ok, erro) => (valido ? observarProducaoDoMes(db, mes, ok, erro) : (ok([]), () => undefined)),
    [mes, valido],
    'Não foi possível carregar a produtividade.',
  );
  const ids = UNIDADES.map((u) => u.id);
  const primeiros = useAoVivo<Partial<Record<UnidadeId, string | null>>>((ok, erro) => observarPrimeirosLancamentos(db, ids, ok, erro), []);
  const lista = lancs.valor ?? [];
  const porUnidade = UNIDADES.map((u) => lista.filter((l) => l.unidadeId === u.id));
  const somas = porUnidade.map((l) => somarItens(l));
  const geral = somarItens(lista);
  // null = a unidade ainda não começou a lançar (sem pendência a contar).
  const pend = porUnidade.map((l, k) => {
    const desde = primeiros.valor?.[ids[k]] ?? null;
    return desde ? turnosPendentes(pendencias(l, mes, hoje, desde)) : null;
  });
  const fmt = (v: number, id: ItemId) => (v ? textoQuantidade(v, id === 'entorpecentesKg') : '—');

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Produtividade das Cias</h2>
        <button
          className="botao secundario"
          type="button"
          disabled={!valido || lista.length === 0}
          onClick={() => baixarXlsx(nomePlanilha(mes), abasDaProducao(lista, ids))}
        >
          Baixar planilha do mês
        </button>
      </div>
      <p className="item-info">
        Lançado pelas Salas de Operações, por pelotão, no fim de cada turno. Os turnos sem lançamento contam a partir do primeiro lançamento de
        cada Cia (— = ainda não começou). A planilha traz todos os lançamentos, a soma por dia de cada Cia, os totais do mês e os talões.
      </p>
      <Campo rotulo="Mês">
        <input type="month" value={mes} max={hoje.slice(0, 7)} onChange={(e) => setMes(e.target.value)} />
      </Campo>
      {lancs.erro && <p className="mensagem erro">{lancs.erro}</p>}
      {lancs.carregando && <p className="carregando">Carregando…</p>}
      {valido && !lancs.carregando && (
        <div className="tabela-rolagem">
          <table className="tabela-icc tabela-producao" aria-label="Produtividade do mês por unidade">
            <thead>
              <tr>
                <th scope="col">Item</th>
                {UNIDADES.map((u) => (
                  <th key={u.id} scope="col">
                    {u.sigla}
                  </th>
                ))}
                <th scope="col">8º BPM/M</th>
              </tr>
            </thead>
            <tbody>
              <tr className={pend.some((n) => (n ?? 0) > 0) ? 'linha-atrasado' : undefined}>
                <th scope="row">Turnos sem lançamento (até ontem)</th>
                {pend.map((n, k) => (
                  <td key={ids[k]} className={n ? 'texto-alerta' : undefined} title={n === null ? 'Ainda não começou a lançar' : undefined}>
                    {n === null ? '—' : n}
                  </td>
                ))}
                <td>{pend.reduce<number>((s, n) => s + (n ?? 0), 0)}</td>
              </tr>
              <tr>
                <th scope="row">Lançamentos</th>
                {porUnidade.map((l, k) => (
                  <td key={ids[k]}>{l.length}</td>
                ))}
                <td>{lista.length}</td>
              </tr>
              <tr>
                <th scope="row">Talões anotados</th>
                {porUnidade.map((l, k) => (
                  <td key={ids[k]}>{l.reduce((s, x) => s + x.taloes.length, 0)}</td>
                ))}
                <td>{lista.reduce((s, x) => s + x.taloes.length, 0)}</td>
              </tr>
              {ITENS_PRODUCAO.map((i) => (
                <tr key={i.id}>
                  <th scope="row">{i.rotulo}</th>
                  {somas.map((s, k) => (
                    <td key={ids[k]}>{fmt(s[i.id], i.id)}</td>
                  ))}
                  <td className="linha-total">{fmt(geral[i.id], i.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
