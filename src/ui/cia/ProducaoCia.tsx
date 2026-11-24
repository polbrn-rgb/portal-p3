import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { excluirProducao, observarPrimeiroLancamento, observarProducaoDaCia, salvarProducao } from '../../data/producao';
import { formatarData, hojeISO, somarDias } from '../../domain/datas';
import {
  abasDaProducao,
  avisosProducao,
  diaDaSemanaPorExtenso,
  ehDecimal,
  GRUPOS_PRODUCAO,
  ITENS_PRODUCAO,
  lerQuantidade,
  NATUREZAS_FLAGRANTE,
  nomePlanilha,
  normalizarTalao,
  pelotoesDa,
  pendencias,
  rotuloNatureza,
  letraPelotao,
  rotuloPelotao,
  TURNOS,
  turnoDoLancamento,
  somarItens,
  textoQuantidade,
  turnosPendentes,
  validarProducao,
  validarTalao,
  type ErrosProducao,
  type ItemId,
  type Itens,
  type PelotaoId,
  type NaturezaFlagrante,
  type Producao,
  type Talao,
  type TurnoLancamento,
} from '../../domain/producao';
import { UNIDADES, type UnidadeId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { irPara, useHash } from '../../lib/navegacao';
import { quemSou } from '../../lib/quemSou';
import { useAoVivo } from '../../lib/useAoVivo';
import { baixarXlsx } from '../../lib/xlsx';
import { Campo } from '../Campo';

// Aba "Sala de Operações" da Cia/FT: cada pelotão lança, no fim do turno, a produção do dia (e os flagrantes: talão e BOPC),
// e o resumo do mês mostra os totais por pelotão e os turnos que ficaram sem lançamento.

const ehMes = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

/** '#/sala/2026-11-20/pelA' -> { data, pelotao } */
function lerRota(hash: string): { data?: string; pelotao?: PelotaoId } {
  const m = /^#\/sala\/(\d{4}-\d{2}-\d{2})(?:\/(pelA|pelB|pelC|pelD))?$/.exec(hash);
  return m ? { data: m[1], pelotao: m[2] as PelotaoId | undefined } : {};
}

function quando(d: Date | null): string {
  if (!d) return '';
  return `${formatarData(hojeISO(d))} às ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Acesso por RE com o perfil Sala de Operações da Cia: só esta página ("Lançado por" vem do login). */
export function PaginaSalaCia({ unidade, sigla }: { unidade: UnidadeId; sigla: string }) {
  const hash = useHash();
  return (
    <section aria-label={sigla}>
      <h2 className="titulo-sala-cia">{sigla}</h2>
      <SalaDaCia unidade={unidade} sigla={UNIDADES.find((u) => u.id === unidade)?.sigla ?? sigla} hash={hash} autor={sigla} />
    </section>
  );
}

/** autor: o que vai em "Lançado por" quando o login não é individual (padrão: a sigla da Cia). */
export function SalaDaCia({ unidade, sigla, hash, autor }: { unidade: UnidadeId; sigla: string; hash: string; autor?: string }) {
  const resumo = hash.startsWith('#/sala/mes');
  const rota = lerRota(hash);
  return (
    <>
      <nav className="abas abas-p3 subabas" aria-label="Sala de Operações">
        <a href="#/sala" aria-current={resumo ? undefined : 'page'}>
          Lançar produção
        </a>
        <a href="#/sala/mes" aria-current={resumo ? 'page' : undefined}>
          Resumo do mês
        </a>
      </nav>
      {resumo ? (
        <ResumoDoMes unidade={unidade} sigla={sigla} />
      ) : (
        <LancarProducao key={`${rota.data ?? ''}_${rota.pelotao ?? ''}`} unidade={unidade} sigla={sigla} autor={autor} dataInicial={rota.data} pelotaoInicial={rota.pelotao} />
      )}
    </>
  );
}

function LancarProducao(p: { unidade: UnidadeId; sigla: string; autor?: string; dataInicial?: string; pelotaoInicial?: PelotaoId }) {
  const hoje = hojeISO();
  const [data, setData] = useState(p.dataInicial && p.dataInicial <= hoje ? p.dataInicial : hoje);
  const [turno, setTurno] = useState<TurnoLancamento | ''>('');
  const [pelotao, setPelotao] = useState<PelotaoId | ''>(p.pelotaoInicial ?? '');
  const mes = /^\d{4}-\d{2}-\d{2}$/.test(data) ? data.slice(0, 7) : hoje.slice(0, 7);
  const lancs = useAoVivo<Producao[]>(
    (ok, erro) => observarProducaoDaCia(db, p.unidade, mes, ok, erro),
    [p.unidade, mes],
    'Não foi possível carregar os lançamentos.',
  );
  const doDia = (lancs.valor ?? []).filter((l) => l.data === data);
  const existente = doDia.find((l) => l.pelotao === pelotao);
  // Abrindo um lançamento já feito (link do resumo ou chip abaixo), o turno vem dele.
  const turnoExistente = existente ? turnoDoLancamento(existente) : '';
  const turnoEfetivo: TurnoLancamento | '' = turno || (p.pelotaoInicial && turnoExistente ? turnoExistente : '');

  function abrir(l: Producao) {
    setPelotao(l.pelotao);
    const t = turnoDoLancamento(l);
    if (t) setTurno(t);
  }

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Produção do pelotão</h2>
      </div>
      <p className="item-info">
        Cada pelotão lança no fim do turno o que produziu (a BCS entra no resultado do pelotão). No turno da noite, use o dia em que o turno começou.
      </p>
      <div className="cartao grupo">
        <Campo rotulo="Dia do serviço" obrigatorio>
          <input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
        </Campo>
        <div role="group" aria-label="Turno" className="escolha-pelotao">
          {TURNOS.map((t) => (
            <button key={t.id} type="button" className="botao-pelotao" aria-pressed={turnoEfetivo === t.id} onClick={() => setTurno(t.id)}>
              {t.rotulo}
            </button>
          ))}
        </div>
        <Campo rotulo="Qual seu pelotão?" obrigatorio>
          <select value={pelotao} onChange={(e) => setPelotao(e.target.value as PelotaoId | '')}>
            <option value="">{p.unidade === 'ft' ? 'ex: A ou B' : 'ex: A; B; C ou D'}</option>
            {pelotoesDa(p.unidade).map((x) => (
              <option key={x.id} value={x.id}>
                {letraPelotao(x.id)}
              </option>
            ))}
          </select>
        </Campo>
        {doDia.length > 0 && (
          <div className="chips-cias" aria-label="Já lançados neste dia">
            <span className="item-info">Já lançados neste dia (tocar abre para corrigir):</span>
            {doDia.map((l) => (
              <button key={l.id} type="button" className="chip-cia chip-gravado" onClick={() => abrir(l)}>
                {rotuloPelotao(l.pelotao, p.unidade, l.turno)} ✓
              </button>
            ))}
          </div>
        )}
      </div>
      {lancs.erro && (
        <p className="mensagem erro" role="alert">
          {lancs.erro}
        </p>
      )}
      {lancs.carregando && <p className="carregando">Carregando…</p>}
      {!lancs.carregando && (!turnoEfetivo || !pelotao) && <p className="vazio">Escolha Pelotão Diurno ou Noturno e informe qual é o seu pelotão.</p>}
      {!lancs.carregando && turnoEfetivo && pelotao && existente && turnoExistente && turnoExistente !== turnoEfetivo && (
        <p className="mensagem atencao" role="status">
          O {rotuloPelotao(pelotao, p.unidade, turnoExistente)} já tem lançamento neste dia. Salvar corrige esse lançamento e muda o turno para{' '}
          {turnoEfetivo === 'dia' ? 'diurno' : 'noturno'}.
        </p>
      )}
      {!lancs.carregando && turnoEfetivo && pelotao && /^\d{4}-\d{2}-\d{2}$/.test(data) && data <= hoje && (
        <FormProducao
          key={`${data}_${pelotao}_${turnoEfetivo}`}
          unidade={p.unidade}
          sigla={p.sigla}
          autor={p.autor}
          data={data}
          pelotao={pelotao}
          turno={turnoEfetivo}
          existente={existente}
        />
      )}
    </section>
  );
}

const textosDe = (itens?: Itens): Record<ItemId, string> =>
  Object.fromEntries(ITENS_PRODUCAO.map((i) => [i.id, itens ? textoQuantidade(itens[i.id], 'decimal' in i && i.decimal) : ''])) as Record<ItemId, string>;

function FormProducao(p: { unidade: UnidadeId; sigla: string; autor?: string; data: string; pelotao: PelotaoId; turno: TurnoLancamento; existente?: Producao }) {
  const [textos, setTextos] = useState<Record<ItemId, string>>(() => textosDe(p.existente?.itens));
  const [taloes, setTaloes] = useState<Talao[]>(() => p.existente?.taloes ?? []);
  const [novoTalao, setNovoTalao] = useState<Talao>({ numero: '', bopc: '', data: p.data, natureza: '' });
  const [erroTalao, setErroTalao] = useState('');
  const [erros, setErros] = useState<ErrosProducao>({});
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const autor = quemSou() ?? p.autor ?? p.sigla;

  // Conferências na hora (só quando os números estão válidos).
  const numeros = Object.fromEntries(
    ITENS_PRODUCAO.map((i) => [i.id, lerQuantidade(textos[i.id], 'decimal' in i && i.decimal) ?? 0]),
  ) as Itens;
  const avisos = avisosProducao(numeros, taloes);

  function incluirTalao() {
    const e = validarTalao(novoTalao, taloes);
    setErroTalao(e);
    if (e) return;
    setTaloes((t) => [
      ...t,
      { numero: normalizarTalao(novoTalao.numero), bopc: normalizarTalao(novoTalao.bopc), data: novoTalao.data, natureza: novoTalao.natureza },
    ]);
    setNovoTalao((t) => ({ ...t, numero: '', bopc: '', natureza: '' }));
  }

  function aoTeclarTalao(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    incluirTalao();
  }

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setMensagem('');
    setErro('');
    const r = validarProducao({ data: p.data, pelotao: p.pelotao, turno: p.turno, textos, taloes }, p.unidade, hojeISO());
    setErros(r.erros);
    if (!r.itens) return;
    if (novoTalao.numero.trim() || novoTalao.bopc.trim() || novoTalao.natureza) {
      setErroTalao('Toque em "Incluir flagrante" (ou apague os números) antes de salvar.');
      return;
    }
    setOcupado(true);
    try {
      await salvarProducao(db, { unidade: p.unidade, data: p.data, pelotao: p.pelotao, turno: p.turno, itens: r.itens, taloes, por: autor });
      setMensagem(`Lançamento do ${rotuloPelotao(p.pelotao, p.unidade, p.turno)} de ${formatarData(p.data)} salvo.`);
    } catch {
      setErro('Não foi possível salvar. Verifique a conexão e tente de novo.');
    }
    setOcupado(false);
  }

  async function excluir() {
    if (!p.existente) return;
    setOcupado(true);
    try {
      await excluirProducao(db, p.existente, autor);
      setConfirmarExclusao(false);
      setTextos(textosDe());
      setTaloes([]);
      setMensagem('Lançamento apagado.');
    } catch {
      setErro('Não foi possível apagar. Tente de novo.');
    }
    setOcupado(false);
  }

  return (
    <form className="formulario-producao" onSubmit={salvar} noValidate aria-label={`Produção do ${rotuloPelotao(p.pelotao, p.unidade, p.turno)} em ${formatarData(p.data)}`}>
      <h3 className="titulo-secao">
        {rotuloPelotao(p.pelotao, p.unidade, p.turno)} · {formatarData(p.data)} ({diaDaSemanaPorExtenso(p.data)})
      </h3>
      {p.existente ? (
        <p className="mensagem atencao" role="status">
          Já lançado por {p.existente.lancadoPor} em {quando(p.existente.lancadoEm)}
          {p.existente.atualizadoPor && p.existente.atualizadoEm && quando(p.existente.atualizadoEm) !== quando(p.existente.lancadoEm)
            ? ` · alterado por ${p.existente.atualizadoPor} em ${quando(p.existente.atualizadoEm)}`
            : ''}
          . Você está corrigindo.
        </p>
      ) : (
        <p className="item-info">Deixe em branco o que foi zero.</p>
      )}

      {GRUPOS_PRODUCAO.map((g) => (
        <fieldset key={g.id} className="cartao grupo">
          <legend>{g.rotulo}</legend>
          <div className="grade-producao">
            {ITENS_PRODUCAO.filter((i) => i.grupo === g.id).map((i) => {
              const decimal = 'decimal' in i && i.decimal;
              return (
                <Campo key={i.id} rotulo={i.rotulo} erro={erros[i.id]}>
                  <input
                    inputMode={decimal ? 'decimal' : 'numeric'}
                    autoComplete="off"
                    placeholder="0"
                    value={textos[i.id]}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTextos((t) => ({ ...t, [i.id]: v }));
                    }}
                  />
                </Campo>
              );
            })}
          </div>
        </fieldset>
      ))}

      <fieldset className="cartao grupo">
        <legend>Flagrantes de delito</legend>
        <p className="item-info">
          Preencher em caso de flagrante de delito: o nº do talão, o nº do BOPC, o dia e a natureza da ocorrência. A P/3 usa para colher os dados
          oficiais e para os Documentos Mensais.
        </p>
        <div className="grade-producao">
          <Campo rotulo="Nº do talão" erro={erroTalao || erros.taloes}>
            <input
              inputMode="numeric"
              autoComplete="off"
              value={novoTalao.numero}
              onKeyDown={aoTeclarTalao}
              onChange={(e) => {
                const v = e.target.value;
                setNovoTalao((t) => ({ ...t, numero: v }));
              }}
            />
          </Campo>
          <Campo rotulo="Nº do BOPC">
            <input
              inputMode="numeric"
              autoComplete="off"
              value={novoTalao.bopc}
              onKeyDown={aoTeclarTalao}
              onChange={(e) => {
                const v = e.target.value;
                setNovoTalao((t) => ({ ...t, bopc: v }));
              }}
            />
          </Campo>
          <Campo rotulo="Dia da ocorrência">
            <input
              type="date"
              value={novoTalao.data}
              max={somarDias(p.data, 1)}
              onChange={(e) => {
                const v = e.target.value;
                setNovoTalao((t) => ({ ...t, data: v }));
              }}
            />
          </Campo>
          <Campo rotulo="Natureza da ocorrência">
            <select
              value={novoTalao.natureza}
              onChange={(e) => {
                const v = e.target.value as NaturezaFlagrante | '';
                setNovoTalao((t) => ({ ...t, natureza: v }));
              }}
            >
              <option value="">Escolha…</option>
              {NATUREZAS_FLAGRANTE.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.rotulo}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <div className="acoes-linha">
          <button className="botao secundario" type="button" onClick={incluirTalao}>
            + Incluir flagrante
          </button>
        </div>
        {taloes.length > 0 && (
          <ul className="lista-taloes" aria-label="Flagrantes anotados">
            {taloes.map((t) => (
              <li key={t.numero}>
                <span>
                  Talão <strong>{t.numero}</strong> · BOPC {t.bopc ? <strong>{t.bopc}</strong> : <em>a completar</em>} · {formatarData(t.data)} ·{' '}
                  {t.natureza ? rotuloNatureza(t.natureza) : <em>natureza a completar</em>}
                </span>
                <button
                  className="botao-tirar-talao"
                  type="button"
                  aria-label={`Tirar o flagrante do talão ${t.numero}`}
                  onClick={() => setTaloes((l) => l.filter((x) => x.numero !== t.numero))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {avisos.length > 0 && (
        <ul className="mensagem atencao lista-avisos" aria-label="Conferências">
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      {mensagem && (
        <p className="mensagem aviso" role="status">
          {mensagem}
        </p>
      )}
      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}
      <p className="item-info">Fica registrado quem lançou: {autor}.</p>

      <div className="barra-acoes">
        {p.existente && !confirmarExclusao && (
          <button className="botao secundario" type="button" disabled={ocupado} onClick={() => setConfirmarExclusao(true)}>
            Apagar lançamento
          </button>
        )}
        {confirmarExclusao && (
          <span className="acoes-linha" role="alertdialog" aria-label="Confirmar exclusão do lançamento">
            <span>Apagar este lançamento?</span>
            <button className="botao secundario" type="button" disabled={ocupado} onClick={() => setConfirmarExclusao(false)}>
              Cancelar
            </button>
            <button className="botao perigo" type="button" disabled={ocupado} onClick={excluir}>
              Apagar
            </button>
          </span>
        )}
        <button className="botao destaque" type="submit" disabled={ocupado}>
          {ocupado ? 'Salvando…' : p.existente ? 'Salvar correção' : 'Salvar lançamento'}
        </button>
      </div>
    </form>
  );
}

function ResumoDoMes({ unidade, sigla }: { unidade: UnidadeId; sigla: string }) {
  const hoje = hojeISO();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const valido = ehMes(mes);
  const lancs = useAoVivo<Producao[]>(
    (ok, erro) => (valido ? observarProducaoDaCia(db, unidade, mes, ok, erro) : (ok([]), () => undefined)),
    [unidade, mes, valido],
    'Não foi possível carregar os lançamentos.',
  );
  const primeiro = useAoVivo<string | null>((ok, erro) => observarPrimeiroLancamento(db, unidade, ok, erro), [unidade]);
  const lista = lancs.valor ?? [];
  const pels = pelotoesDa(unidade);
  const porPelotao = pels.map((x) => somarItens(lista.filter((l) => l.pelotao === x.id)));
  const total = somarItens(lista);
  const pend = valido ? pendencias(lista, mes, hoje, primeiro.valor ?? null, unidade) : [];
  const taloes = lista
    .flatMap((l) => l.taloes.map((t) => ({ ...t, pelotao: l.pelotao })))
    .sort((a, b) => a.data.localeCompare(b.data) || a.numero.localeCompare(b.numero));
  const dias = [...new Set(lista.map((l) => l.data))].sort().reverse();
  const fmt = (v: number, id: ItemId) => (v ? textoQuantidade(v, ehDecimal(id)) : '—');

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Resumo do mês</h2>
        <button
          className="botao secundario"
          type="button"
          disabled={!valido || lista.length === 0}
          onClick={() => baixarXlsx(nomePlanilha(mes, unidade), abasDaProducao(lista, [unidade]))}
        >
          Baixar planilha do mês
        </button>
      </div>
      <Campo rotulo="Mês">
        <input type="month" value={mes} max={hoje.slice(0, 7)} onChange={(e) => setMes(e.target.value)} />
      </Campo>
      {lancs.erro && <p className="mensagem erro">{lancs.erro}</p>}
      {lancs.carregando && <p className="carregando">Carregando…</p>}

      {valido && !lancs.carregando && (
        <>
          <h3 className="titulo-secao">Turnos sem lançamento (até ontem)</h3>
          {primeiro.valor === null ? (
            <p className="vazio">Ainda não há lançamentos: os turnos pendentes passam a contar a partir do primeiro.</p>
          ) : pend.length === 0 ? (
            <p className="vazio">Nenhum turno pendente.</p>
          ) : (
            <>
              <p className="mensagem atencao" role="status">
                {turnosPendentes(pend)} turno(s) sem lançamento em {pend.length} dia(s).
              </p>
              <ul className="lista-pendencias">
                {pend.map((x) => (
                  <li key={x.data}>
                    <a href={`#/sala/${x.data}`}>
                      {formatarData(x.data)} ({diaDaSemanaPorExtenso(x.data)})
                    </a>
                    : falta {[x.faltaDia && 'o turno do dia', x.faltaNoite && 'o turno da noite'].filter(Boolean).join(' e ')}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3 className="titulo-secao">Totais por pelotão</h3>
          <div className="tabela-rolagem">
            <table className="tabela-icc tabela-producao" aria-label={`Produção de ${sigla} por pelotão`}>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  {pels.map((x) => (
                    <th key={x.id} scope="col">
                      {x.rotulo}
                    </th>
                  ))}
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {ITENS_PRODUCAO.map((i) => (
                  <tr key={i.id}>
                    <th scope="row">{i.rotulo}</th>
                    {porPelotao.map((s, k) => (
                      <td key={pels[k].id}>{fmt(s[i.id], i.id)}</td>
                    ))}
                    <td className="linha-total">{fmt(total[i.id], i.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="titulo-secao">Lançamentos ({lista.length})</h3>
          {dias.length === 0 && <p className="vazio">Nenhum lançamento neste mês.</p>}
          <ul className="lista-lancamentos">
            {dias.map((d) => (
              <li key={d}>
                <span className="dia-lancamento">
                  {formatarData(d)} ({diaDaSemanaPorExtenso(d)})
                </span>
                <span className="chips-cias">
                  {lista
                    .filter((l) => l.data === d)
                    .map((l) => (
                      <button key={l.id} type="button" className="chip-cia chip-gravado" onClick={() => irPara(`#/sala/${d}/${l.pelotao}`)}>
                        {pels.find((x) => x.id === l.pelotao)?.rotulo ?? l.pelotao}
                      </button>
                    ))}
                </span>
              </li>
            ))}
          </ul>

          <h3 className="titulo-secao">Flagrantes do mês ({taloes.length})</h3>
          {taloes.length === 0 ? (
            <p className="vazio">Nenhum flagrante anotado.</p>
          ) : (
            <ul className="lista-taloes" aria-label="Flagrantes do mês">
              {taloes.map((t) => (
                <li key={`${t.numero}_${t.pelotao}`}>
                  <span>
                    Talão <strong>{t.numero}</strong> · BOPC {t.bopc || '—'} · {formatarData(t.data)} · {rotuloNatureza(t.natureza)} ·{' '}
                    {pels.find((x) => x.id === t.pelotao)?.rotulo ?? t.pelotao}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
