import { useEffect, useState, type FormEvent } from 'react';
import { buscarProducaoDoPeriodo } from '../../data/producao';
import { formatarData, hojeISO } from '../../domain/datas';
import {
  ehDecimal,
  erroPeriodo,
  ITENS_PRODUCAO,
  itensComValor,
  ordenarLancamentos,
  rotuloNatureza,
  rotuloPelotao,
  somarItens,
  textoQuantidade,
  type ItemId,
  type Producao,
} from '../../domain/producao';
import { UNIDADES, type UnidadeId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { Campo } from '../Campo';

// Sala de Operações do batalhão (subordinada à P/3) → Resultados das Cias: o que as Salas de Operações das
// Cias/FT lançaram no período. Para economizar a cota do Firebase, lê uma vez quando a sub-aba é aberta e de
// novo só quando a Sala pede (botão Consultar). Não fica ouvindo o banco: cada consulta lê ~1 documento por pelotão que lançou no período.

type Consulta = { de: string; ate: string; unidade: UnidadeId | '' };
type Estado = { carregando: boolean; erro: string; lista: Producao[]; consulta: Consulta | null; em: Date | null };

const ROTULO_ITEM = Object.fromEntries(ITENS_PRODUCAO.map((i) => [i.id, i.rotulo])) as Record<ItemId, string>;
const sigla = (u: UnidadeId) => UNIDADES.find((x) => x.id === u)?.sigla ?? u;
const fmt = (v: number, id: ItemId) => (v ? textoQuantidade(v, ehDecimal(id)) : '—');
const hora = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function ResultadosCias() {
  const hoje = hojeISO();
  const [form, setForm] = useState<Consulta>({ de: hoje, ate: hoje, unidade: '' });
  const [erroForm, setErroForm] = useState('');
  const [estado, setEstado] = useState<Estado>({ carregando: false, erro: '', lista: [], consulta: null, em: null });

  async function consultar(c: Consulta) {
    setEstado((e) => ({ ...e, carregando: true, erro: '' }));
    try {
      const lista = await buscarProducaoDoPeriodo(db, c.de, c.ate, c.unidade || undefined);
      setEstado({ carregando: false, erro: '', lista, consulta: c, em: new Date() });
    } catch {
      setEstado((e) => ({ ...e, carregando: false, erro: 'Não foi possível consultar os resultados. Tente de novo.' }));
    }
  }

  // Primeira leitura: quando a sub-aba é aberta (hoje, todas as unidades).
  useEffect(() => {
    void consultar({ de: hoje, ate: hoje, unidade: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function enviar(e: FormEvent) {
    e.preventDefault();
    const problema = erroPeriodo(form.de, form.ate, hoje);
    setErroForm(problema);
    if (!problema) void consultar(form);
  }

  const c = estado.consulta;
  const unidades = c ? UNIDADES.filter((u) => !c.unidade || u.id === c.unidade).map((u) => u.id) : [];
  const porUnidade = unidades.map((u) => ordenarLancamentos(estado.lista.filter((l) => l.unidadeId === u)));
  const somas = porUnidade.map((l) => somarItens(l));
  const geral = somarItens(estado.lista);
  const itens = itensComValor(somas);
  const flagrantes = ordenarLancamentos(estado.lista).flatMap((l) => l.taloes.map((t) => ({ l, t })));
  const periodo = c ? (c.de === c.ate ? formatarData(c.de) : `${formatarData(c.de)} a ${formatarData(c.ate)}`) : '';

  return (
    <section className="painel" aria-label="Resultados das Cias">
      <div className="painel-cabecalho">
        <h2>Resultados das Cias</h2>
      </div>
      <p className="item-info">
        O que as Salas de Operações das Cias e da Força Tática lançaram, por dia de serviço (o turno da noite conta no dia em que começou). A
        consulta é feita quando você abre esta aba ou clica em <strong>Consultar</strong>: a tela não se atualiza sozinha.
      </p>

      <form className="filtros-estatistica filtros-resultados" onSubmit={enviar} noValidate aria-label="Consultar resultados">
        <Campo rotulo="De">
          <input type="date" value={form.de} max={hoje} onChange={(e) => setForm({ ...form, de: e.target.value })} />
        </Campo>
        <Campo rotulo="Até">
          <input type="date" value={form.ate} max={hoje} onChange={(e) => setForm({ ...form, ate: e.target.value })} />
        </Campo>
        <Campo rotulo="Unidade">
          <select value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value as UnidadeId | '' })}>
            <option value="">Todas</option>
            {UNIDADES.map((u) => (
              <option key={u.id} value={u.id}>
                {u.sigla}
              </option>
            ))}
          </select>
        </Campo>
        <button className="botao" type="submit" disabled={estado.carregando}>
          {estado.carregando ? 'Consultando…' : 'Consultar'}
        </button>
      </form>
      {erroForm && (
        <p className="mensagem erro" role="alert">
          {erroForm}
        </p>
      )}
      {estado.erro && (
        <p className="mensagem erro" role="alert">
          {estado.erro}
        </p>
      )}
      {estado.carregando && !c && <p className="carregando">Carregando…</p>}

      {c && (
        <>
          <p className="item-info" role="status">
            {periodo}
            {c.unidade ? ` · ${sigla(c.unidade)}` : ''} · {estado.lista.length} lançamento(s)
            {estado.em ? ` · consultado às ${hora(estado.em)}` : ''}
          </p>

          {estado.lista.length === 0 ? (
            <p className="vazio">Nenhum resultado lançado {c.de === c.ate ? 'neste dia' : 'neste período'}.</p>
          ) : (
            <>
              <div className="tabela-rolagem">
                <table className="tabela-icc tabela-producao" aria-label="Resultados do período por unidade">
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      {unidades.map((u) => (
                        <th key={u} scope="col">
                          {sigla(u)}
                        </th>
                      ))}
                      {unidades.length > 1 && <th scope="col">8º BPM/M</th>}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Lançamentos</th>
                      {porUnidade.map((l, k) => (
                        <td key={unidades[k]}>{l.length || '—'}</td>
                      ))}
                      {unidades.length > 1 && <td>{estado.lista.length}</td>}
                    </tr>
                    {itens.map((id) => (
                      <tr key={id}>
                        <th scope="row">{ROTULO_ITEM[id]}</th>
                        {somas.map((s, k) => (
                          <td key={unidades[k]}>{fmt(s[id], id)}</td>
                        ))}
                        {unidades.length > 1 && <td className="linha-total">{fmt(geral[id], id)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {itens.length === 0 && <p className="item-info">Os lançamentos do período estão todos zerados.</p>}

              {flagrantes.length > 0 && (
                <>
                  <h3>Flagrantes</h3>
                  <ul className="lista-erros" aria-label="Flagrantes do período">
                    {flagrantes.map(({ l, t }) => (
                      <li key={`${l.id}-${t.numero}`}>
                        {sigla(l.unidadeId)} · {rotuloPelotao(l.pelotao, l.unidadeId, l.turno)} · {formatarData(t.data || l.data)} · Talão {t.numero}
                        {t.bopc ? ` · BOPC ${t.bopc}` : ' · BOPC a completar'} · {rotuloNatureza(t.natureza)}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <h3>Lançamentos</h3>
              {porUnidade.map((lista, k) =>
                lista.length === 0 ? null : (
                  <details key={unidades[k]} className="cartao">
                    <summary>
                      {sigla(unidades[k])}: {lista.length} lançamento(s)
                    </summary>
                    <ul className="lista-erros" aria-label={`Lançamentos de ${sigla(unidades[k])}`}>
                      {lista.map((l) => {
                        const comValor = itensComValor([l.itens]);
                        return (
                          <li key={l.id}>
                            <strong>
                              {formatarData(l.data)} · {rotuloPelotao(l.pelotao, l.unidadeId, l.turno)}
                            </strong>
                            {' — '}
                            {comValor.length ? comValor.map((id) => `${ROTULO_ITEM[id]}: ${fmt(l.itens[id], id)}`).join('; ') : 'tudo zerado'}
                            <br />
                            <small>
                              Lançado por {l.lancadoPor || '—'}
                              {l.atualizadoPor && l.atualizadoPor !== l.lancadoPor ? ` · corrigido por ${l.atualizadoPor}` : ''}
                            </small>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                ),
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
