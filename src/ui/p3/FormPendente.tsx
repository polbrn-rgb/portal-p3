import { type FormEvent, useState } from 'react';
import { criarPendente } from '../../data/pendentes';
import { hojeISO } from '../../domain/datas';
import {
  pendenteManualVazia,
  validarPendente,
  type DadosPendenteManual,
  type ErrosPendente,
  type TipoManual,
} from '../../domain/pendente';
import { db } from '../../lib/firebase';
import { irPara } from '../../lib/navegacao';
import { Campo } from '../Campo';

/** Lançar uma pendente de SEI (texto colado) ou de Ordem Verbal. */
export function FormPendente({ tipo }: { tipo: TipoManual }) {
  const [dados, setDados] = useState<DadosPendenteManual>(() => pendenteManualVazia(tipo, hojeISO()));
  const [erros, setErros] = useState<ErrosPendente>({});
  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState('');
  const ehSEI = tipo === 'sei';

  function mudar<K extends keyof DadosPendenteManual>(campo: K, valor: DadosPendenteManual[K]) {
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const encontrados = validarPendente(dados);
    setErros(encontrados);
    setErroGeral('');
    if (Object.keys(encontrados).length > 0) {
      setErroGeral('Confira os campos destacados.');
      return;
    }
    setSalvando(true);
    try {
      await criarPendente(db, dados);
      irPara('#/pendentes');
    } catch {
      setErroGeral('Não foi possível salvar. Verifique a conexão e tente de novo.');
      setSalvando(false);
    }
  }

  return (
    <form className="painel painel-estreito" onSubmit={salvar} noValidate>
      <div className="painel-cabecalho">
        <h2>{ehSEI ? 'Nova pendente — SEI' : 'Nova pendente — Ordem Verbal'}</h2>
      </div>

      <fieldset className="cartao grupo">
        <legend>{ehSEI ? 'Demanda do SEI' : 'Ordem Verbal'}</legend>
        <div className="grade">
          <Campo rotulo="Data de entrada" erro={erros.dataEntrada} obrigatorio>
            <input type="date" value={dados.dataEntrada} onChange={(e) => mudar('dataEntrada', e.target.value)} />
          </Campo>
          {ehSEI ? (
            <label className="campo">
              Nº do processo SEI
              <input value={dados.numeroSei} inputMode="numeric" onChange={(e) => mudar('numeroSei', e.target.value)} />
            </label>
          ) : (
            <Campo rotulo="Quem deu a ordem" erro={erros.quemOrdenou} obrigatorio>
              <input value={dados.quemOrdenou} onChange={(e) => mudar('quemOrdenou', e.target.value)} />
            </Campo>
          )}
        </div>
        <Campo rotulo={ehSEI ? 'Texto da demanda (cole aqui)' : 'Qual é a ordem'} erro={erros.texto} obrigatorio>
          <textarea rows={ehSEI ? 10 : 5} value={dados.texto} onChange={(e) => mudar('texto', e.target.value)} />
        </Campo>
        <p className="ajuda-pendentes">A primeira linha do texto vira o assunto na lista.</p>
      </fieldset>

      {erroGeral && (
        <p className="mensagem erro" role="alert">
          {erroGeral}
        </p>
      )}

      <div className="barra-acoes">
        <a className="botao secundario" href="#/pendentes">
          Voltar
        </a>
        <button className="botao destaque" type="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar pendente'}
        </button>
      </div>
    </form>
  );
}
