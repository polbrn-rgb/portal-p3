import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { alterarStatus, atualizarDemanda, criarDemanda, obterDemanda } from '../../data/demandas';
import { hojeISO } from '../../domain/datas';
import {
  dadosDe,
  demandaVazia,
  normalizarDemanda,
  validarDemanda,
  type DadosDemanda,
  type Demanda,
  type ErrosDemanda,
} from '../../domain/demanda';
import { CATEGORIAS, ORIGENS, RESPONSAVEIS, TIPOS_SAIDA } from '../../domain/listas';
import { ROTULO_SITUACAO, situacaoDaDemanda } from '../../domain/situacao';
import { ORDEM_DESTINOS, siglaDoDestino, UNIDADES, type DestinoId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { irPara } from '../../lib/navegacao';

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

function FormDemanda({ existente }: { existente?: Demanda }) {
  const original = existente ? dadosDe(existente) : demandaVazia(hojeISO());
  const [dados, setDados] = useState<DadosDemanda>(original);
  const [erros, setErros] = useState<ErrosDemanda>({});
  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState('');

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
      if (existente) await atualizarDemanda(db, existente.id, original, limpo);
      else await criarDemanda(db, limpo);
      irPara('#/demandas');
    } catch {
      setErroGeral('Não foi possível salvar. Verifique a conexão e tente de novo.');
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
        <Campo rotulo="Saída (assunto)" erro={erros.saida}>
          <textarea rows={3} value={dados.saida} onChange={(e) => mudar('saida', e.target.value)} />
        </Campo>
        <div className="grade">
          <Campo rotulo="Tipo de saída" erro={erros.tipoSaida}>
            <select value={dados.tipoSaida} onChange={(e) => mudar('tipoSaida', e.target.value as DadosDemanda['tipoSaida'])}>
              <option value="">—</option>
              {TIPOS_SAIDA.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Nº da saída" erro={erros.numeroSaida}>
            <input value={dados.numeroSaida} onChange={(e) => mudar('numeroSaida', e.target.value)} />
          </Campo>
          <Campo rotulo="Categoria" erro={erros.categoria}>
            <select value={dados.categoria} onChange={(e) => mudar('categoria', e.target.value as DadosDemanda['categoria'])}>
              <option value="">Escolha…</option>
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
            Adicionar para o CFP
          </label>
          <label className="opcao">
            <input type="checkbox" checked={dados.agendaCPA} onChange={(e) => mudar('agendaCPA', e.target.checked)} />
            Agenda CPA
          </label>
          <label className="opcao">
            <input type="checkbox" checked={dados.agendaCia} onChange={(e) => mudar('agendaCia', e.target.checked)} />
            Agenda Cia
          </label>
        </div>
      </fieldset>

      <fieldset className="cartao grupo bloco-largo">
        <legend>Complemento</legend>
        <Campo rotulo="Resposta" erro={erros.resposta}>
          <textarea rows={3} value={dados.resposta} onChange={(e) => mudar('resposta', e.target.value)} />
        </Campo>
        <Campo rotulo="Observação" erro={erros.observacao}>
          <textarea rows={2} value={dados.observacao} onChange={(e) => mudar('observacao', e.target.value)} />
        </Campo>
        <Campo rotulo="Link do evento" erro={erros.linkEvento}>
          <input type="url" inputMode="url" value={dados.linkEvento} onChange={(e) => mudar('linkEvento', e.target.value)} />
        </Campo>
      </fieldset>

      {erroGeral && (
        <p className="mensagem erro" role="alert">
          {erroGeral}
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
