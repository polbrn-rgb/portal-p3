import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { alterarStatus, atualizarDemanda, ConflitoEdicao, criarDemanda, obterDemanda } from '../../data/demandas';
import { edicaoPrecisaAutomacao, precisaAutomacao } from '../../domain/automacao';
import { hojeISO } from '../../domain/datas';
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
import { ROTULO_SITUACAO, situacaoDaDemanda } from '../../domain/situacao';
import { ORDEM_DESTINOS, siglaDoDestino, UNIDADES, type DestinoId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { cutucarMotor } from '../../lib/motor';
import { irPara } from '../../lib/navegacao';
import { RespostasCias } from './RespostasCias';
import { StatusAutomacao } from './StatusAutomacao';

export function NovaDemanda() {
  return <FormDemanda />;
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
        <a href="#/demandas">Voltar para a lista</a>
      </section>
    );
  }
  return <FormDemanda key={demanda.id} existente={demanda} />;
}

function Campo({ rotulo, erro, children }: { rotulo: string; erro?: string; children: ReactNode }) {
  return (
    <label className="campo">
      {rotulo}
      {children}
      {erro && <span className="erro-campo">{erro}</span>}
    </label>
  );
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

function Registrada({ numero, aoNova }: { numero: number; aoNova: () => void }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(String(numero));
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
        <strong className="numero-gerado">Nº {numero}</strong>
        <div className="acoes-linha">
          <button className="botao secundario" type="button" onClick={copiar}>
            {copiado ? 'Copiado!' : 'Copiar número'}
          </button>
          <button className="botao destaque" type="button" onClick={aoNova}>
            Lançar outra
          </button>
        </div>
        <a href="#/demandas">Ver lista</a>
      </div>
    </section>
  );
}

function FormDemanda({ existente }: { existente?: Demanda }) {
  const [original] = useState<DadosDemanda>(() => (existente ? dadosDe(existente) : novaComResponsavel()));
  const [dados, setDados] = useState<DadosDemanda>(original);
  const [registrada, setRegistrada] = useState<number | null>(null);
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
        const numero = await criarDemanda(db, limpo);
        if (precisaAutomacao(limpo)) cutucarMotor();
        setRegistrada(numero);
        setSalvando(false);
      }
    } catch (e) {
      if (e instanceof ConflitoEdicao) {
        const campos = e.campos.map((c) => ROTULO_CAMPO[c]).join(', ');
        setErroGeral(`Outra pessoa alterou ${campos} desta demanda enquanto você editava. Nada foi salvo.`);
        setConflito(true);
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
        numero={registrada}
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

      <fieldset className="cartao grupo">
        <legend>Entrada</legend>
        <div className="grade">
          <Campo rotulo="Data de entrada" erro={erros.dataEntrada}>
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
          <Campo rotulo={ehSEI ? 'Nº do processo SEI' : 'Nº da origem'} erro={erros.numeroOrigem}>
            <input
              value={dados.numeroOrigem}
              inputMode={ehSEI ? 'numeric' : 'text'}
              onChange={(e) => mudar('numeroOrigem', e.target.value)}
            />
          </Campo>
        </div>
      </fieldset>

      <fieldset className="cartao grupo">
        <legend>Saída</legend>
        <Campo rotulo="Demanda (resumo)" erro={erros.saida}>
          <textarea rows={3} value={dados.saida} onChange={(e) => mudar('saida', e.target.value)} />
        </Campo>
        <div className="grade">
          <Campo rotulo="Tipo de saída" erro={erros.tipoSaida}>
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
          <Campo rotulo="Categoria" erro={erros.categoria}>
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
          <Campo rotulo="Resposta?" erro={erros.resposta}>
            <select value={dados.resposta} onChange={(e) => mudar('resposta', e.target.value as DadosDemanda['resposta'])}>
              {RESPOSTAS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Campo>
        </div>
      </fieldset>

      <fieldset className="cartao grupo">
        <legend>Destinos</legend>
        <div className="opcoes">
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

      <fieldset className="cartao grupo">
        <legend>Prazos</legend>
        <div className="grade">
          <Campo rotulo="Prazo CPA" erro={erros.prazoCPA}>
            <input type="date" value={dados.prazoCPA} onChange={(e) => mudar('prazoCPA', e.target.value)} />
          </Campo>
          <Campo rotulo="Prazo Cia" erro={erros.prazoCia}>
            <input type="date" value={dados.prazoCia} onChange={(e) => mudar('prazoCia', e.target.value)} />
          </Campo>
          <Campo rotulo="Início Btl" erro={erros.inicioBtl}>
            <input type="date" value={dados.inicioBtl} onChange={(e) => mudar('inicioBtl', e.target.value)} />
          </Campo>
          <Campo rotulo="Término Btl" erro={erros.terminoBtl}>
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

      <fieldset className="cartao grupo bloco-largo">
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
        <a className="botao secundario" href="#/demandas">
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
