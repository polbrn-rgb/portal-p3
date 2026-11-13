import { useState } from 'react';
import { aceitarResposta, devolverResposta, observarDaDemanda } from '../../data/encaminhamentos';
import { formatarData } from '../../domain/datas';
import { ROTULO_ENC, type Encaminhamento } from '../../domain/encaminhamento';
import { siglaDoDestino, UNIDADES } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { useAoVivo } from '../../lib/useAoVivo';

const ORDEM = UNIDADES.map((u) => u.id as string);

/** Dentro da demanda: o andamento de cada Cia, com aceitar/devolver a resposta. */
export function RespostasCias({ demandaId }: { demandaId: string }) {
  const encs = useAoVivo<Encaminhamento[]>((ok, erro) => observarDaDemanda(db, demandaId, ok, erro), [demandaId]);
  const lista = (encs.valor ?? [])
    .filter((e) => e.status !== 'cancelado')
    .sort((a, b) => ORDEM.indexOf(a.unidadeId) - ORDEM.indexOf(b.unidadeId));

  return (
    <fieldset className="cartao grupo bloco-largo">
      <legend>Respostas das Cias</legend>
      {encs.carregando && <p className="carregando">Carregando…</p>}
      {encs.erro && <p className="mensagem erro">{encs.erro}</p>}
      {!encs.carregando && lista.length === 0 && <p className="vazio">Nenhuma Cia nesta demanda.</p>}
      <ul className="lista">
        {lista.map((e) => (
          <li key={e.id}>
            <RespostaCia enc={e} />
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function RespostaCia({ enc }: { enc: Encaminhamento }) {
  const [devolvendo, setDevolvendo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  async function executar(acao: () => Promise<void>) {
    setOcupado(true);
    setErro('');
    try {
      await acao();
      setDevolvendo(false);
      setMotivo('');
    } catch {
      setErro('Não foi possível gravar. Tente de novo.');
    }
    setOcupado(false);
  }

  const sigla = siglaDoDestino(enc.unidadeId);
  return (
    <article className="resposta-cia" aria-label={`Resposta ${sigla}`}>
      <header className="item-topo">
        <strong>{sigla}</strong>
        <span className={`selo enc-${enc.status}`}>{ROTULO_ENC[enc.status]}</span>
      </header>
      {enc.resposta ? (
        <>
          <p className="texto-resposta">{enc.resposta}</p>
          <p className="item-info">Respondido por {enc.respondidoPor}</p>
        </>
      ) : (
        <p className="item-info">Sem resposta ainda{enc.prazoCia ? ` · prazo ${formatarData(enc.prazoCia)}` : ''}.</p>
      )}
      {enc.status === 'devolvido' && enc.motivoDevolucao && (
        <p className="mensagem aviso-devolvido">Devolvido: {enc.motivoDevolucao}</p>
      )}
      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}

      {enc.status === 'respondido' && !devolvendo && (
        <div className="acoes-linha">
          <button className="botao secundario" type="button" disabled={ocupado} onClick={() => setDevolvendo(true)}>
            Devolver
          </button>
          <button className="botao" type="button" disabled={ocupado} onClick={() => executar(() => aceitarResposta(db, enc))}>
            Aceitar
          </button>
        </div>
      )}

      {devolvendo && (
        <div className="devolucao">
          <label className="campo">
            Motivo da devolução
            <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          <div className="acoes-linha">
            <button className="botao secundario" type="button" onClick={() => setDevolvendo(false)}>
              Cancelar
            </button>
            <button
              className="botao destaque"
              type="button"
              disabled={ocupado || !motivo.trim()}
              onClick={() => executar(() => devolverResposta(db, enc, motivo))}
            >
              Confirmar devolução
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
