import { type FormEvent, useState } from 'react';
import { alterarStatusDemandaCia, atualizarDemandaCia, criarDemandaCia, excluirDemandaCia } from '../../data/numeradorCia';
import { formatarData, hojeISO } from '../../domain/datas';
import { ORIGENS, TIPOS_SAIDA } from '../../domain/listas';
import {
  atrasadaCia,
  dadosDaDemandaCia,
  demandaCiaVazia,
  formatarNumeroCia,
  ordenarDemandasCia,
  ROTULO_STATUS_CIA,
  validarDemandaCia,
  type DadosDemandaCia,
  type DemandaCia,
  type ErrosDemandaCia,
} from '../../domain/numeradorCia';
import { UNIDADES, type UnidadeId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { irPara } from '../../lib/navegacao';
import { quemSou } from '../../lib/quemSou';
import { Campo } from '../Campo';

// Numerador próprio da Cia/FT: cria a demanda com número (8BPMM-001/103/27…) e põe o prazo na agenda da Cia.
// Não distribui para ninguém.

const autor = (unidade: UnidadeId) => quemSou() ?? UNIDADES.find((u) => u.id === unidade)?.sigla ?? unidade;

type Aba = 'abertas' | 'concluidas';

export function ListaNumeradorCia(p: { unidade: UnidadeId; lista: DemandaCia[]; carregando: boolean; erro: string }) {
  const [aba, setAba] = useState<Aba>('abertas');
  const [texto, setTexto] = useState('');
  const hoje = hojeISO();
  const ordenada = ordenarDemandasCia(p.lista);
  const abertas = ordenada.filter((d) => d.status === 'em_aberto');
  const concluidas = ordenada.filter((d) => d.status === 'concluida');
  const busca = texto.trim().toLowerCase();
  const visiveis = (aba === 'abertas' ? abertas : concluidas).filter(
    (d) => !busca || `${d.numeroDocumento} ${d.saida} ${d.responsavel} ${d.numeroOrigem}`.toLowerCase().includes(busca),
  );

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Numerador</h2>
        <a className="botao destaque" href="#/numerador/nova">
          + Nova demanda
        </a>
      </div>
      <div className="abas" role="tablist">
        <button type="button" role="tab" aria-selected={aba === 'abertas'} onClick={() => setAba('abertas')}>
          Em aberto ({abertas.length})
        </button>
        <button type="button" role="tab" aria-selected={aba === 'concluidas'} onClick={() => setAba('concluidas')}>
          Concluídas ({concluidas.length})
        </button>
      </div>
      <input className="busca" type="search" placeholder="Buscar nº, assunto, responsável…" value={texto} onChange={(e) => setTexto(e.target.value)} />

      {p.erro && (
        <p className="mensagem erro" role="alert">
          {p.erro}
        </p>
      )}
      {p.carregando && <p className="carregando">Carregando…</p>}
      {!p.carregando && !p.erro && visiveis.length === 0 && <p className="vazio">Nada por aqui.</p>}

      <ul className="lista">
        {visiveis.map((d) => {
          const atrasada = atrasadaCia(d, hoje);
          return (
            <li key={d.id}>
              <a
                className={`item-demanda item-cia ${atrasada ? 'borda-atrasado' : d.status === 'concluida' ? 'borda-enc-aceito' : 'borda-enc-novo'}`}
                href={`#/numerador/${d.id}`}
              >
                <span className="item-topo">
                  <strong className="item-num">{d.numeroDocumento}</strong>
                  <span className={`selo ${atrasada ? 'selo-atrasado' : d.status === 'concluida' ? 'enc-aceito' : 'enc-novo'}`}>
                    {atrasada ? 'Atrasado' : ROTULO_STATUS_CIA[d.status]}
                  </span>
                </span>
                <span className="item-saida">{d.saida}</span>
                <span className="item-info">
                  <span className="item-cat">{d.responsavel}</span>
                  <span className="item-prazo">{d.prazo ? `Prazo ${formatarData(d.prazo)}` : ''}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Nova demanda (sem `existente`) ou edição. */
export function FormNumeradorCia({ unidade, existente }: { unidade: UnidadeId; existente?: DemandaCia }) {
  // O responsável é sempre quem está logado (ao criar e ao editar).
  const comResponsavel = (d: DadosDemandaCia): DadosDemandaCia => ({ ...d, responsavel: autor(unidade) });
  const [dados, setDados] = useState<DadosDemandaCia>(() => comResponsavel(existente ? dadosDaDemandaCia(existente) : demandaCiaVazia(hojeISO())));
  const [erros, setErros] = useState<ErrosDemandaCia>({});
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [criada, setCriada] = useState('');
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  const mudar = <K extends keyof DadosDemandaCia>(campo: K, valor: DadosDemandaCia[K]) => setDados((d) => ({ ...d, [campo]: valor }));

  async function executar(acao: () => Promise<void>) {
    setOcupado(true);
    setErro('');
    try {
      await acao();
    } catch {
      setErro('Não foi possível gravar. Verifique a conexão e tente de novo.');
    }
    setOcupado(false);
  }

  function salvar(ev: FormEvent) {
    ev.preventDefault();
    const e = validarDemandaCia(dados);
    setErros(e);
    if (Object.keys(e).length) return;
    void executar(async () => {
      if (existente) {
        await atualizarDemandaCia(db, existente, dados, autor(unidade));
        irPara('#/numerador');
      } else {
        const r = await criarDemandaCia(db, unidade, dados, autor(unidade));
        setCriada(r.numeroDocumento);
      }
    });
  }

  if (criada) {
    return (
      <section className="painel painel-estreito">
        <div className="cartao registrada" role="status">
          <p>Demanda registrada</p>
          <strong className="numero-gerado">{criada}</strong>
          {dados.prazo && <p>Prazo de {formatarData(dados.prazo)} colocado na Agenda.</p>}
          <div className="acoes-linha">
            <a className="botao secundario" href="#/numerador">
              Voltar ao Numerador
            </a>
            <button
              className="botao destaque"
              type="button"
              onClick={() => {
                setCriada('');
                setDados(comResponsavel(demandaCiaVazia(hojeISO())));
              }}
            >
              Nova demanda
            </button>
          </div>
        </div>
      </section>
    );
  }

  const previa = !existente && dados.tipoSaida && /^\d{4}-/.test(dados.dataEntrada) ? formatarNumeroCia(dados.tipoSaida, unidade, 0, dados.dataEntrada).replace('-000/', '-___/') : '';

  return (
    <form className="painel painel-estreito formulario-demanda" onSubmit={salvar} noValidate>
      <div className="painel-cabecalho">
        <h2>{existente ? existente.numeroDocumento : 'Nova demanda'}</h2>
        {existente && <span className={`selo ${existente.status === 'concluida' ? 'enc-aceito' : 'enc-novo'}`}>{ROTULO_STATUS_CIA[existente.status]}</span>}
      </div>
      {previa && <p className="vazio">O número sai ao salvar: {previa}</p>}

      <fieldset className="cartao grupo">
        <legend>Entrada</legend>
        <div className="grade">
          <Campo rotulo="Data de entrada" erro={erros.dataEntrada} obrigatorio>
            <input type="date" value={dados.dataEntrada} disabled={!!existente} onChange={(e) => mudar('dataEntrada', e.target.value)} />
          </Campo>
          <Campo rotulo="Origem" erro={erros.origem}>
            <select value={dados.origem} onChange={(e) => mudar('origem', e.target.value)}>
              <option value="">Selecione…</option>
              {ORIGENS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Nº da origem" erro={erros.numeroOrigem}>
            <input value={dados.numeroOrigem} onChange={(e) => mudar('numeroOrigem', e.target.value)} />
          </Campo>
        </div>
      </fieldset>

      <fieldset className="cartao grupo">
        <legend>Saída</legend>
        <Campo rotulo="Demanda (resumo)" erro={erros.saida} obrigatorio>
          <textarea rows={2} value={dados.saida} onChange={(e) => mudar('saida', e.target.value)} />
        </Campo>
        <div className="grade">
          <Campo rotulo="Tipo de saída" erro={erros.tipoSaida} obrigatorio>
            <select value={dados.tipoSaida} disabled={!!existente} onChange={(e) => mudar('tipoSaida', e.target.value)}>
              {(existente && !TIPOS_SAIDA.includes(existente.tipoSaida as never) ? [existente.tipoSaida, ...TIPOS_SAIDA] : TIPOS_SAIDA).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Prazo (vai para a Agenda)" erro={erros.prazo}>
            <input type="date" value={dados.prazo} onChange={(e) => mudar('prazo', e.target.value)} />
          </Campo>
          <Campo rotulo="Responsável (quem está logado)" erro={erros.responsavel}>
            <input value={dados.responsavel} readOnly />
          </Campo>
        </div>
        <Campo rotulo="Observação" erro={erros.observacao}>
          <textarea rows={3} value={dados.observacao} onChange={(e) => mudar('observacao', e.target.value)} />
        </Campo>
      </fieldset>

      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}

      <div className="barra-acoes">
        <a className="botao secundario" href="#/numerador">
          Voltar
        </a>
        {existente && (
          <>
            <button
              className="botao secundario"
              type="button"
              disabled={ocupado}
              onClick={() => setConfirmarExclusao(true)}
            >
              Excluir
            </button>
            <button
              className="botao secundario"
              type="button"
              disabled={ocupado}
              onClick={() =>
                executar(async () => {
                  await alterarStatusDemandaCia(db, existente, existente.status === 'concluida' ? 'em_aberto' : 'concluida', autor(unidade));
                  irPara('#/numerador');
                })
              }
            >
              {existente.status === 'concluida' ? 'Reabrir' : 'Concluir'}
            </button>
          </>
        )}
        <button className="botao destaque" type="submit" disabled={ocupado}>
          {existente ? 'Salvar' : 'Gerar número'}
        </button>
      </div>

      {existente && confirmarExclusao && (
        <div className="fundo-dialogo" onClick={() => !ocupado && setConfirmarExclusao(false)}>
          <div className="dialogo" role="alertdialog" aria-modal="true" aria-labelledby="titulo-excluir-cia" onClick={(e) => e.stopPropagation()}>
            <h3 id="titulo-excluir-cia">Excluir {existente.numeroDocumento}?</h3>
            <p>O evento do prazo sai da Agenda. O número não é reaproveitado.</p>
            <div className="acoes-linha">
              <button className="botao secundario" type="button" autoFocus disabled={ocupado} onClick={() => setConfirmarExclusao(false)}>
                Cancelar
              </button>
              <button
                className="botao perigo"
                type="button"
                disabled={ocupado}
                onClick={() =>
                  executar(async () => {
                    await excluirDemandaCia(db, existente);
                    irPara('#/numerador');
                  })
                }
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
