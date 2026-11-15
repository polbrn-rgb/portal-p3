import { useEffect, useState, type FormEvent } from 'react';
import {
  atualizarOperacaoControle,
  criarOperacaoControle,
  excluirOperacaoControle,
  observarControle,
  observarRelatorios,
  OperacaoJaExiste,
  pedirRelatorio,
} from '../../data/controle';
import {
  controleVazio,
  filtrarControle,
  mesAnterior,
  mesDe,
  periodoControle,
  PREFIXO_RELATORIO,
  rotuloMes,
  validarControle,
  validarPedidoRelatorio,
  type DadosControle,
  type ErrosControle,
  type ErrosRelatorio,
  type OperacaoControle,
  type Relatorio,
} from '../../domain/controle';
import { db } from '../../lib/firebase';
import { cutucarMotor } from '../../lib/motor';
import { useAoVivo } from '../../lib/useAoVivo';
import { hojeISO } from '../../domain/datas';
import { Campo } from '../Campo';

/** Operações → Controle de Operações: registro das operações (com o Objetivo) e o Relatório de Indicadores. */
export function ControleOperacoes() {
  const ops = useAoVivo<OperacaoControle[]>((ok, erro) => observarControle(db, ok, erro), [], 'Não foi possível carregar as operações.');
  const [mes, setMes] = useState(mesAnterior()); // do relatório
  const [visao, setVisao] = useState<'mes' | 'todas'>('mes');
  const [mesLista, setMesLista] = useState(mesDe(hojeISO()));
  const [editando, setEditando] = useState<string | null>(null); // 'nova' ou o id
  const [aExcluir, setAExcluir] = useState<OperacaoControle | null>(null);
  const [aviso, setAviso] = useState('');

  const lista = filtrarControle(ops.valor ?? [], visao === 'todas' ? null : mesLista);
  const doMes = filtrarControle(ops.valor ?? [], mes);
  const semObjetivo = doMes.filter((o) => !o.objetivo.trim());

  function salvo(d: DadosControle, nova: boolean) {
    setEditando(null);
    setAviso(nova ? `Operação registrada (${rotuloMes(mesDe(d.inicio))}).` : 'Operação atualizada.');
    if (visao === 'mes') setMesLista(mesDe(d.inicio)); // mostra a operação que acabou de salvar
  }

  async function confirmarExclusao() {
    if (!aExcluir) return;
    try {
      await excluirOperacaoControle(db, aExcluir.id);
      setAviso('Operação excluída.');
    } catch {
      setAviso('Não foi possível excluir. Verifique a conexão e tente de novo.');
    }
    setAExcluir(null);
  }

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Controle de Operações</h2>
        {editando !== 'nova' && (
          <button className="botao destaque" type="button" onClick={() => setEditando('nova')}>
            + Nova operação
          </button>
        )}
      </div>
      <p className="ajuda-pendentes">
        As operações com pasta do CFP e as da aba Operações do numerador antigo entram sozinhas. O Objetivo de cada uma vai
        para o Relatório de Indicadores.
      </p>

      {editando === 'nova' && <FormControle aoCancelar={() => setEditando(null)} aoSalvar={(d) => salvo(d, true)} />}

      <RelatorioIndicadores mes={mes} aoMudarMes={setMes} semObjetivo={semObjetivo} totalDoMes={doMes.length} />

      {aviso && (
        <p className="mensagem aviso" role="status">
          {aviso}
        </p>
      )}

      <div className="cartao grupo" role="group" aria-label="Visualizar operações">
        <h3>👁️ Visualizar operações</h3>
        <div className="abas" role="tablist" aria-label="Período">
          <button type="button" role="tab" aria-selected={visao === 'mes'} onClick={() => setVisao('mes')}>
            Por mês
          </button>
          <button type="button" role="tab" aria-selected={visao === 'todas'} onClick={() => setVisao('todas')}>
            Todas
          </button>
        </div>
        {visao === 'mes' && (
          <Campo rotulo="Mês" className="campo-mes-lista">
            <input type="month" value={mesLista} onChange={(e) => e.target.value && setMesLista(e.target.value)} />
          </Campo>
        )}
        <p className="pendente-detalhe">
          {visao === 'todas' ? 'Todas as operações' : `Operações de ${rotuloMes(mesLista)}`}: {lista.length}
        </p>
      </div>

      {ops.erro && (
        <p className="mensagem erro" role="alert">
          {ops.erro}
        </p>
      )}
      {ops.carregando && <p className="carregando">Carregando…</p>}
      {!ops.carregando && !ops.erro && lista.length === 0 && <p className="vazio">Nenhuma operação neste período.</p>}

      {agruparPorMes(lista, visao === 'todas').map((g) => (
        <section key={g.mes} className="grupo-mes-controle" aria-label={g.rotulo || undefined}>
          {g.rotulo && (
            <h3 className="titulo-aba-cia">
              {g.rotulo} ({g.itens.length})
            </h3>
          )}
          <ul className="lista lista-pendentes">
            {g.itens.map((o) => (
              <li key={o.id}>
                {editando === o.id ? (
                  <FormControle operacao={o} aoCancelar={() => setEditando(null)} aoSalvar={(d) => salvo(d, false)} />
                ) : (
                  <CartaoControle operacao={o} aoEditar={() => setEditando(o.id)} aoExcluir={() => setAExcluir(o)} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {aExcluir && <ConfirmarExclusao operacao={aExcluir} aoConfirmar={confirmarExclusao} aoCancelar={() => setAExcluir(null)} />}
    </section>
  );
}

/** Em "Todas": um título por mês (pelo mês de início), do mais recente ao mais antigo. */
function agruparPorMes(lista: OperacaoControle[], agrupar: boolean) {
  if (!agrupar) return [{ mes: 'mes', rotulo: '', itens: lista }];
  const grupos: { mes: string; rotulo: string; itens: OperacaoControle[] }[] = [];
  for (const o of lista) {
    const m = mesDe(o.inicio);
    if (grupos.at(-1)?.mes !== m) grupos.push({ mes: m, rotulo: rotuloMes(m), itens: [] });
    grupos.at(-1)!.itens.push(o);
  }
  return grupos;
}

function CartaoControle(p: { operacao: OperacaoControle; aoEditar: () => void; aoExcluir: () => void }) {
  const o = p.operacao;
  const extras = [o.ordem && `Ordem ${o.ordem}`, o.origem && `Origem ${o.origem}`, o.opm, o.observacao].filter(Boolean).join(' · ');
  return (
    <article className={`item-pendente ${o.objetivo ? '' : 'borda-sem-objetivo'}`} aria-label={o.nome}>
      <span className="item-topo">
        <strong className="pendente-assunto">{o.nome}</strong>
        <span className="pendente-detalhe">{periodoControle(o)}</span>
      </span>
      {o.objetivo ? (
        <p className="objetivo-controle">
          <strong>Objetivo:</strong> {o.objetivo}
        </p>
      ) : (
        <p className="objetivo-controle sem-objetivo">⚠️ Sem objetivo (vai em branco no relatório)</p>
      )}
      {extras && <p className="pendente-detalhe">{extras}</p>}
      <div className="acoes-linha">
        <button className="botao secundario" type="button" onClick={p.aoEditar}>
          ✏️ Editar
        </button>
        <button className="botao-lixeira" type="button" aria-label={`Excluir ${o.nome}`} onClick={p.aoExcluir}>
          🗑️
        </button>
      </div>
    </article>
  );
}

function FormControle(p: { operacao?: OperacaoControle; aoCancelar: () => void; aoSalvar: (d: DadosControle) => void }) {
  const [d, setD] = useState<DadosControle>(() => {
    if (!p.operacao) return controleVazio();
    const { nome, inicio, termino, objetivo, ordem, origem, opm, observacao } = p.operacao;
    return { nome, inicio, termino, objetivo, ordem, origem, opm, observacao };
  });
  const [erros, setErros] = useState<ErrosControle>({});
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const mudar = (campo: keyof DadosControle) => (e: { target: { value: string } }) => setD({ ...d, [campo]: e.target.value });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const v = validarControle(d);
    setErros(v);
    setErro('');
    if (Object.keys(v).length) return;
    setSalvando(true);
    try {
      if (p.operacao) await atualizarOperacaoControle(db, p.operacao.id, d);
      else await criarOperacaoControle(db, d);
      p.aoSalvar(d);
    } catch (falha) {
      setErro(falha instanceof OperacaoJaExiste ? falha.message : 'Não foi possível salvar. Verifique a conexão e tente de novo.');
      setSalvando(false);
    }
  }

  return (
    <form className="cartao grupo form-controle" onSubmit={salvar} noValidate aria-label={p.operacao ? 'Editar operação' : 'Nova operação'}>
      <h3>{p.operacao ? 'Editar operação' : 'Nova operação'}</h3>
      <div className="grade">
        <Campo rotulo="Operação" obrigatorio erro={erros.nome}>
          <input value={d.nome} onChange={mudar('nome')} />
        </Campo>
        <div className="grade-2">
          <Campo rotulo="Data início" obrigatorio erro={erros.inicio}>
            <input type="date" value={d.inicio} onChange={mudar('inicio')} />
          </Campo>
          <Campo rotulo="Data término" erro={erros.termino}>
            <input type="date" value={d.termino} min={d.inicio || undefined} onChange={mudar('termino')} />
          </Campo>
        </div>
        <Campo rotulo="Objetivo (vai para o relatório)">
          <textarea rows={3} value={d.objetivo} placeholder="Ex.: reduzir os roubos na área do Btl" onChange={mudar('objetivo')} />
        </Campo>
        <div className="grade-3">
          <Campo rotulo="Ordem">
            <input value={d.ordem} onChange={mudar('ordem')} />
          </Campo>
          <Campo rotulo="Origem">
            <input value={d.origem} onChange={mudar('origem')} />
          </Campo>
          <Campo rotulo="OPM">
            <input value={d.opm} onChange={mudar('opm')} />
          </Campo>
        </div>
        <Campo rotulo="Observação">
          <input value={d.observacao} onChange={mudar('observacao')} />
        </Campo>
      </div>
      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}
      <div className="acoes-linha">
        <button className="botao secundario" type="button" disabled={salvando} onClick={p.aoCancelar}>
          Cancelar
        </button>
        <button className="botao destaque" type="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar operação'}
        </button>
      </div>
    </form>
  );
}

function RelatorioIndicadores(p: { mes: string; aoMudarMes: (m: string) => void; semObjetivo: OperacaoControle[]; totalDoMes: number }) {
  const relatorios = useAoVivo<Relatorio[]>((ok, erro) => observarRelatorios(db, ok, erro), []);
  const [numero, setNumero] = useState('');
  const [erros, setErros] = useState<ErrosRelatorio>({});
  const [erro, setErro] = useState('');
  const [pedindo, setPedindo] = useState(false);

  async function gerar() {
    const v = validarPedidoRelatorio({ mes: p.mes, numero });
    setErros(v);
    setErro('');
    if (Object.keys(v).length) return;
    setPedindo(true);
    try {
      await pedirRelatorio(db, { mes: p.mes, numero });
      cutucarMotor();
      setNumero('');
    } catch {
      setErro('Não foi possível pedir o relatório. Verifique a conexão e tente de novo.');
    }
    setPedindo(false);
  }

  return (
    <div className="cartao grupo" role="group" aria-label="Relatório de Indicadores">
      <h3>📄 Relatório de Indicadores</h3>
      <div className="grade-2">
        <Campo rotulo="Mês de referência" obrigatorio erro={erros.mes}>
          <input type="month" value={p.mes} onChange={(e) => e.target.value && p.aoMudarMes(e.target.value)} />
        </Campo>
        <Campo rotulo={`Número do relatório (o ${PREFIXO_RELATORIO} é automático)`} obrigatorio erro={erros.numero}>
          <input value={numero} placeholder="2085/03/26" inputMode="numeric" onChange={(e) => setNumero(e.target.value)} />
        </Campo>
      </div>
      <p className="pendente-detalhe">
        {p.totalDoMes} operação(ões) em {rotuloMes(p.mes)}
        {p.semObjetivo.length > 0 && <strong className="texto-alerta"> · {p.semObjetivo.length} sem objetivo</strong>}
      </p>
      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}
      <div className="acoes-linha">
        <button className="botao destaque" type="button" disabled={pedindo} onClick={gerar}>
          {pedindo ? 'Pedindo…' : 'Gerar relatório'}
        </button>
      </div>
      {(relatorios.valor ?? []).length > 0 && (
        <ul className="lista-relatorios" aria-label="Relatórios pedidos">
          {(relatorios.valor ?? []).map((r) => (
            <li key={r.id}>
              <span>
                Nº {PREFIXO_RELATORIO}
                {r.numero} · {rotuloMes(r.mes)}
              </span>
              {r.status === 'pedido' && <span className="selo selo-em_aberto">⏳ Gerando…</span>}
              {r.status === 'pronto' && r.url && (
                <a href={r.url} target="_blank" rel="noreferrer">
                  ✅ Abrir/baixar o Word ({r.qtdOperacoes ?? 0} operações)
                </a>
              )}
              {r.status === 'erro' && <span className="texto-alerta">❌ {r.erro || 'Erro ao gerar'}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConfirmarExclusao(p: { operacao: OperacaoControle; aoConfirmar: () => void; aoCancelar: () => void }) {
  const [excluindo, setExcluindo] = useState(false);
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') p.aoCancelar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [p]);
  return (
    <div className="fundo-dialogo" onClick={() => !excluindo && p.aoCancelar()}>
      <div className="dialogo" role="alertdialog" aria-modal="true" aria-labelledby="titulo-excluir-op" onClick={(e) => e.stopPropagation()}>
        <h3 id="titulo-excluir-op">Excluir esta operação?</h3>
        <p className="dialogo-saida">{p.operacao.nome}</p>
        <p>Ela sai do Controle de Operações e do Relatório de Indicadores.</p>
        <div className="acoes-linha">
          <button className="botao secundario" type="button" autoFocus disabled={excluindo} onClick={p.aoCancelar}>
            Cancelar
          </button>
          <button
            className="botao perigo"
            type="button"
            disabled={excluindo}
            onClick={() => {
              setExcluindo(true);
              p.aoConfirmar();
            }}
          >
            {excluindo ? 'Excluindo…' : '🗑️ Sim, excluir'}
          </button>
        </div>
      </div>
    </div>
  );
}
