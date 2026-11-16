import { type FormEvent, useEffect, useState } from 'react';
import {
  alterarStatus,
  atualizarDemanda,
  ConflitoEdicao,
  criarDemandaNumerada,
  obterDemanda,
  PendenteJaResolvida,
} from '../../data/demandas';
import { obterPendente } from '../../data/pendentes';
import { edicaoPrecisaAutomacao, precisaAutomacao } from '../../domain/automacao';
import { formatarData, hojeISO } from '../../domain/datas';
import {
  dadosDe,
  demandaVazia,
  normalizarDemanda,
  ROTULO_CAMPO,
  validarDemanda,
  type DadosDemanda,
  type Demanda,
  type ErrosDemanda,
} from '../../domain/demanda';
import {
  CATEGORIAS,
  MEIOS_SAIDA,
  ORIGENS,
  RESPONSAVEIS,
  RESPOSTAS,
  TIPOS_SAIDA,
  URL_PLANILHA_EVENTO,
} from '../../domain/listas';
import { demandaDaPendente, detalheDaPendente, ORIGEM_DO_TIPO, type Pendente } from '../../domain/pendente';
import { ROTULO_SITUACAO, situacaoDaDemanda } from '../../domain/situacao';
import { ORDEM_DESTINOS, siglaDoDestino, UNIDADES, type DestinoId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { cutucarMotor } from '../../lib/motor';
import { irPara } from '../../lib/navegacao';
import { RespostasCias } from './RespostasCias';
import { StatusAutomacao } from './StatusAutomacao';
import { Campo } from '../Campo';

export function NovaDemanda() {
  return <FormDemanda />;
}

/** "Dar destino" a uma pendente: formulário de demanda nova já preenchido. */
export function DestinarPendente({ id }: { id: string }) {
  const [pendente, setPendente] = useState<Pendente | null | undefined>(undefined);
  useEffect(() => {
    obterPendente(db, id).then(setPendente, () => setPendente(null));
  }, [id]);

  if (pendente === undefined) return <p className="carregando">Carregando…</p>;
  if (pendente === null || pendente.status !== 'pendente') {
    return (
      <section className="painel">
        <p className="mensagem erro" role="alert">
          {pendente?.numeroDemanda
            ? `Esta pendente já virou a demanda nº ${pendente.numeroDemanda}.`
            : 'Esta pendente não está mais na lista.'}
        </p>
        <a href="#/pendentes">Voltar para Demandas Pendentes</a>
      </section>
    );
  }
  return <FormDemanda key={pendente.id} pendente={pendente} />;
}

function OrigemPendente({ pendente: p }: { pendente: Pendente }) {
  const detalhe = detalheDaPendente(p);
  return (
    <section className="cartao grupo origem-pendente" aria-label="Pendente de origem">
      <span className="item-topo">
        <span className={`selo selo-tipo-${p.tipo}`}>{ORIGEM_DO_TIPO[p.tipo]}</span>
        <span className="pendente-data">{formatarData(p.dataEntrada)}</span>
      </span>
      <strong className="pendente-assunto">{p.assunto}</strong>
      {detalhe && <span className="pendente-detalhe">{detalhe}</span>}
      {p.texto && p.texto !== p.assunto && (
        <details className="pendente-texto">
          <summary>Ver texto</summary>
          <p className="texto-resposta">{p.texto}</p>
        </details>
      )}
      {(Boolean(p.anexos?.length) || Boolean(p.linkGmail)) && (
        <ul className="pendente-links">
          {p.anexos?.map((a) => (
            <li key={a.url}>
              <a href={a.url} target="_blank" rel="noreferrer">
                📎 {a.nome}
              </a>
            </li>
          ))}
          {p.linkGmail && (
            <li>
              <a href={p.linkGmail} target="_blank" rel="noreferrer">
                ✉️ Abrir no Gmail
              </a>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

export function EditarDemanda({ id }: { id: string }) {
  const [demanda, setDemanda] = useState<Demanda | null | undefined>(undefined);
  useEffect(() => {
    obterDemanda(db, id).then(setDemanda, () => setDemanda(null));
  }, [id]);

  if (demanda === undefined) return <p className="carregando">Carregando…</p>;
  if (demanda === null) {
    return (
      <section className="painel">
        <p className="mensagem erro" role="alert">
          Demanda nº {id} não encontrada.
        </p>
        <a href="#/demandas">Voltar para o Numerador</a>
      </section>
    );
  }
  if (demanda.status === 'excluido') {
    return (
      <section className="painel">
        <p className="mensagem erro" role="alert">
          A demanda nº {id} foi excluída.
        </p>
        <a href="#/demandas">Voltar para o Numerador</a>
      </section>
    );
  }
  return <FormDemanda key={demanda.id} existente={demanda} />;
}

const CHAVE_RESPONSAVEL = 'portalp3.responsavel';

// Como no painel do numerador: a demanda nova já vem com o último responsável usado neste aparelho.
function novaComResponsavel(): DadosDemanda {
  const nova = demandaVazia(hojeISO());
  try {
    const salvo = localStorage.getItem(CHAVE_RESPONSAVEL);
    if ((RESPONSAVEIS as readonly string[]).includes(salvo ?? '')) nova.responsavel = salvo as DadosDemanda['responsavel'];
  } catch {
    /* sem armazenamento */
  }
  return nova;
}

function Registrada({ numero, numeroDocumento, aoNova, dePendente }: { numero: number; numeroDocumento?: string; aoNova: () => void; dePendente: boolean }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(numeroDocumento || String(numero));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* navegador sem permissão de copiar */
    }
  }
  return (
    <section className="painel">
      <div className="cartao registrada" role="status">
        <p>Demanda registrada</p>
        <strong className="numero-gerado">{numeroDocumento || `Nº ${numero}`}</strong>
        {numeroDocumento && <span className="dica">Nº interno {numero}</span>}
        <div className="acoes-linha">
          <button className="botao secundario" type="button" onClick={copiar}>
            {copiado ? 'Copiado!' : 'Copiar número'}
          </button>
          {dePendente ? (
            <a className="botao destaque" href="#/pendentes">
              Próxima pendente
            </a>
          ) : (
            <button className="botao destaque" type="button" onClick={aoNova}>
              Lançar outra
            </button>
          )}
        </div>
        <a href="#/demandas">Ver lista</a>
      </div>
    </section>
  );
}

function FormDemanda({ existente, pendente }: { existente?: Demanda; pendente?: Pendente }) {
  const [original] = useState<DadosDemanda>(() =>
    existente ? dadosDe(existente) : pendente ? demandaDaPendente(pendente, novaComResponsavel()) : novaComResponsavel(),
  );
  const [dados, setDados] = useState<DadosDemanda>(original);
  const [destinosAbertos, setDestinosAbertos] = useState(false);
  const [registrada, setRegistrada] = useState<{ numero: number; numeroDocumento?: string } | null>(null);
  const [erros, setErros] = useState<ErrosDemanda>({});
  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState('');
  const [conflito, setConflito] = useState(false);

  function mudar<K extends keyof DadosDemanda>(campo: K, valor: DadosDemanda[K]) {
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  function alternarDestino(id: DestinoId) {
    setDados((d) => ({
      ...d,
      destinos: d.destinos.includes(id) ? d.destinos.filter((x) => x !== id) : [...d.destinos, id],
    }));
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const limpo = normalizarDemanda(dados);
    const encontrados = validarDemanda(limpo);
    setErros(encontrados);
    setErroGeral('');
    if (Object.keys(encontrados).length > 0) {
      setErroGeral('Confira os campos destacados.');
      return;
    }
    setSalvando(true);
    try {
      localStorage.setItem(CHAVE_RESPONSAVEL, limpo.responsavel);
    } catch {
      /* sem armazenamento */
    }
    try {
      if (existente) {
        const campos = await atualizarDemanda(db, existente.id, original, limpo);
        if (edicaoPrecisaAutomacao(campos)) cutucarMotor();
        irPara('#/demandas');
      } else {
        const gerado = await criarDemandaNumerada(db, limpo, pendente?.id);
        if (precisaAutomacao(limpo)) cutucarMotor();
        setRegistrada(gerado);
        setSalvando(false);
      }
    } catch (e) {
      if (e instanceof ConflitoEdicao) {
        const campos = e.campos.map((c) => ROTULO_CAMPO[c]).join(', ');
        setErroGeral(`Outra pessoa alterou ${campos} desta demanda enquanto você editava. Nada foi salvo.`);
        setConflito(true);
      } else if (e instanceof PendenteJaResolvida) {
        setErroGeral(`Outra pessoa já resolveu esta pendente${e.numeroDemanda ? ` (demanda nº ${e.numeroDemanda})` : ''}. Nada foi salvo.`);
      } else {
        setErroGeral('Não foi possível salvar. Verifique a conexão e tente de novo.');
      }
      setSalvando(false);
    }
  }

  async function mudarStatus() {
    if (!existente) return;
    setSalvando(true);
    setErroGeral('');
    try {
      await alterarStatus(db, existente.id, existente.status === 'concluido' ? 'em_aberto' : 'concluido');
      irPara('#/demandas');
    } catch {
      setErroGeral('Não foi possível alterar o status.');
      setSalvando(false);
    }
  }

  if (registrada !== null) {
    return (
      <Registrada
        numero={registrada.numero}
        numeroDocumento={registrada.numeroDocumento}
        dePendente={Boolean(pendente)}
        aoNova={() => {
          setDados(novaComResponsavel());
          setErros({});
          setRegistrada(null);
        }}
      />
    );
  }

  const ehSEI = dados.origem === 'SEI';
  const todas = dados.destinos.includes('TODAS');
  const resumoDestinos = ORDEM_DESTINOS.filter((id) => dados.destinos.includes(id))
    .map((id) => (id === 'TODAS' ? `TODAS (as ${UNIDADES.length} Cias)` : siglaDoDestino(id)))
    .join(', ');

  return (
    <form className="painel formulario-demanda" onSubmit={salvar} noValidate>
      <div className="painel-cabecalho">
        <h2>{existente ? `Demanda nº ${existente.numero}` : 'Nova demanda'}</h2>
        {existente && (
          <span className={`selo selo-${situacaoDaDemanda(existente, hojeISO())}`}>
            {ROTULO_SITUACAO[situacaoDaDemanda(existente, hojeISO())]}
          </span>
        )}
      </div>

      {pendente && <OrigemPendente pendente={pendente} />}

      <fieldset className="cartao grupo grupo-entrada">
        <legend>Entrada</legend>
        <div className="grade">
          <Campo rotulo="Data de entrada" erro={erros.dataEntrada} obrigatorio>
            <input type="date" value={dados.dataEntrada} onChange={(e) => mudar('dataEntrada', e.target.value)} />
          </Campo>
          <Campo rotulo="Origem" erro={erros.origem}>
            <select value={dados.origem} onChange={(e) => mudar('origem', e.target.value as DadosDemanda['origem'])}>
              <option value="">Selecione…</option>
              {ORIGENS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo={ehSEI ? 'Nº do processo SEI' : 'Nº da origem'} erro={erros.numeroOrigem} obrigatorio={ehSEI}>
            <input
              value={dados.numeroOrigem}
              inputMode={ehSEI ? 'numeric' : 'text'}
              onChange={(e) => mudar('numeroOrigem', e.target.value)}
            />
          </Campo>
        </div>
      </fieldset>

      <fieldset className="cartao grupo grupo-saida">
        <legend>Saída</legend>
        <Campo rotulo="Demanda (resumo)" erro={erros.saida} obrigatorio>
          <textarea rows={2} value={dados.saida} onChange={(e) => mudar('saida', e.target.value)} />
        </Campo>
        <div className="grade">
          <Campo rotulo="Tipo de saída" erro={erros.tipoSaida} obrigatorio>
            <select value={dados.tipoSaida} onChange={(e) => mudar('tipoSaida', e.target.value as DadosDemanda['tipoSaida'])}>
              {TIPOS_SAIDA.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Meio de saída" erro={erros.meioSaida}>
            <select value={dados.meioSaida} onChange={(e) => mudar('meioSaida', e.target.value as DadosDemanda['meioSaida'])}>
              {MEIOS_SAIDA.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Nº de saída SEI" erro={erros.numeroSaida}>
            <input value={dados.numeroSaida} onChange={(e) => mudar('numeroSaida', e.target.value)} />
          </Campo>
          <Campo rotulo="Categoria" erro={erros.categoria} obrigatorio>
            <select value={dados.categoria} onChange={(e) => mudar('categoria', e.target.value as DadosDemanda['categoria'])}>
              {CATEGORIAS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Responsável" erro={erros.responsavel}>
            <select
              value={dados.responsavel}
              onChange={(e) => mudar('responsavel', e.target.value as DadosDemanda['responsavel'])}
            >
              <option value="">—</option>
              {RESPONSAVEIS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Resposta?" erro={erros.resposta} obrigatorio>
            <select value={dados.resposta} onChange={(e) => mudar('resposta', e.target.value as DadosDemanda['resposta'])}>
              {RESPOSTAS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Campo>
        </div>
      </fieldset>

      <fieldset className="cartao grupo grupo-destinos">
        <legend>Destinos</legend>
        {/* Fechado mostra só os escolhidos; toca para abrir a lista e marcar. */}
        <button
          type="button"
          className="seletor-destinos"
          aria-expanded={destinosAbertos}
          aria-controls="opcoes-destinos"
          aria-label={`Escolher destinos (${resumoDestinos || 'nenhum'})`}
          onClick={() => setDestinosAbertos((a) => !a)}
        >
          <span className={resumoDestinos ? 'resumo-destinos' : 'resumo-destinos vazio-destinos'}>{resumoDestinos || 'Nenhum destino — escolher'}</span>
          <span className="seta-destinos" aria-hidden="true">
            {destinosAbertos ? '▲' : '▼'}
          </span>
        </button>
        <div id="opcoes-destinos" className="opcoes" hidden={!destinosAbertos}>
          {ORDEM_DESTINOS.map((id) => {
            const coberta = todas && UNIDADES.some((u) => u.id === id);
            return (
              <label key={id} className={`opcao${coberta ? ' coberta' : ''}`}>
                <input
                  type="checkbox"
                  checked={dados.destinos.includes(id) || coberta}
                  disabled={coberta}
                  onChange={() => alternarDestino(id)}
                />
                {siglaDoDestino(id)}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="cartao grupo grupo-prazos">
        <legend>Prazos</legend>
        <div className="grade">
          <Campo rotulo="Prazo CPA" erro={erros.prazoCPA}>
            <input type="date" value={dados.prazoCPA} onChange={(e) => mudar('prazoCPA', e.target.value)} />
          </Campo>
          <Campo rotulo="Prazo Cia" erro={erros.prazoCia}>
            <input type="date" value={dados.prazoCia} onChange={(e) => mudar('prazoCia', e.target.value)} />
          </Campo>
          <Campo rotulo="Início Btl" erro={erros.inicioBtl} obrigatorio={dados.adicionarCFP}>
            <input type="date" value={dados.inicioBtl} onChange={(e) => mudar('inicioBtl', e.target.value)} />
          </Campo>
          <Campo rotulo="Término Btl" erro={erros.terminoBtl} obrigatorio={dados.adicionarCFP}>
            <input type="date" value={dados.terminoBtl} onChange={(e) => mudar('terminoBtl', e.target.value)} />
          </Campo>
        </div>
        <div className="opcoes">
          <label className="opcao">
            <input type="checkbox" checked={dados.adicionarCFP} onChange={(e) => mudar('adicionarCFP', e.target.checked)} />
            Adicionar e gerar pasta CFP
          </label>
        </div>
      </fieldset>

      <fieldset className="cartao grupo grupo-complemento">
        <legend>Complemento</legend>
        <Campo rotulo="Observação" erro={erros.observacao}>
          <textarea rows={2} value={dados.observacao} onChange={(e) => mudar('observacao', e.target.value)} />
        </Campo>
        <div className="opcoes">
          <label className="opcao">
            <input type="checkbox" checked={dados.linkEvento} onChange={(e) => mudar('linkEvento', e.target.checked)} />
            Possui link de evento / formulário
          </label>
          {dados.linkEvento && (
            <a className="botao secundario" href={URL_PLANILHA_EVENTO} target="_blank" rel="noreferrer">
              Abrir planilha do evento
            </a>
          )}
        </div>
      </fieldset>

      {existente && <StatusAutomacao demandaId={existente.id} />}
      {existente && <RespostasCias demandaId={existente.id} />}

      {erroGeral && (
        <p className="mensagem erro" role="alert">
          {erroGeral}
          {conflito && (
            <>
              {' '}
              <button className="botao-link" type="button" onClick={() => window.location.reload()}>
                Ver a versão atual
              </button>
            </>
          )}
        </p>
      )}

      <div className="barra-acoes">
        <a className="botao secundario" href={pendente ? '#/pendentes' : '#/demandas'}>
          Voltar
        </a>
        {existente && (
          <button className="botao secundario" type="button" disabled={salvando} onClick={mudarStatus}>
            {existente.status === 'concluido' ? 'Reabrir' : 'Concluir'}
          </button>
        )}
        <button className="botao destaque" type="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
