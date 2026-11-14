import { type FormEvent, useState } from 'react';
import { enviarSolicitacao, observarSolicitacoesDaOperacao } from '../../data/efetivo';
import { formatarData, hojeISO } from '../../domain/datas';
import type { Demanda } from '../../domain/demanda';
import {
  CAMPOS_EXTRAS,
  contarPorPosto,
  POSTOS,
  quantidadesVazias,
  ROTULO_SITUACAO,
  situacaoSolicitacao,
  totalDe,
  validarPedido,
  type CampoExtra,
  type ErrosPedido,
  type PedidoEfetivo,
  type PostoId,
  type Quantidades,
  type SolicitacaoEfetivo,
} from '../../domain/efetivo';
import { siglaDoDestino, UNIDADES, type UnidadeId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { useAoVivo } from '../../lib/useAoVivo';

/** P/3: quantos policiais de cada posto cada Cia manda, que dados pedir e até quando. */
export function FormPedidoEfetivo({ demanda, aoFechar }: { demanda: Demanda; aoFechar: () => void }) {
  const [prazo, setPrazo] = useState('');
  const [campos, setCampos] = useState<CampoExtra[]>([]);
  const [cias, setCias] = useState<UnidadeId[]>([]);
  const [quantidades, setQuantidades] = useState<Partial<Record<UnidadeId, Quantidades>>>({});
  const [erros, setErros] = useState<ErrosPedido>({});
  const [erroGeral, setErroGeral] = useState('');
  const [enviando, setEnviando] = useState(false);

  function alternarCia(cia: UnidadeId, marcada: boolean) {
    setCias((l) => (marcada ? [...l, cia] : l.filter((c) => c !== cia)));
    if (!marcada) setQuantidades((q) => ({ ...q, [cia]: undefined }));
  }

  function mudarQuantidade(cia: UnidadeId, posto: PostoId, valor: string) {
    const n = Math.max(0, Math.floor(Number(valor) || 0));
    setQuantidades((q) => ({ ...q, [cia]: { ...quantidadesVazias(), ...q[cia], [posto]: n } }));
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const pedido: PedidoEfetivo = {
      prazo,
      campos: CAMPOS_EXTRAS.map((c) => c.id).filter((id) => campos.includes(id)),
      quantidades: Object.fromEntries(cias.map((c) => [c, { ...quantidadesVazias(), ...quantidades[c] }])),
    };
    const encontrados = validarPedido(pedido);
    setErros(encontrados);
    setErroGeral('');
    if (Object.keys(encontrados).length) return;
    setEnviando(true);
    try {
      await enviarSolicitacao(db, demanda, pedido);
      aoFechar();
    } catch {
      setErroGeral('Não foi possível enviar. Verifique a conexão e tente de novo.');
      setEnviando(false);
    }
  }

  return (
    <form className="detalhe-item pedido-efetivo" onSubmit={enviar} noValidate aria-label="Solicitação de efetivo">
      <label className="campo">
        Prazo para as Cias preencherem
        <input type="date" value={prazo} min={hojeISO()} onChange={(e) => setPrazo(e.target.value)} />
        {erros.prazo && <span className="erro-campo">{erros.prazo}</span>}
      </label>

      <fieldset className="grupo-simples">
        <legend>Dados que as Cias devem informar</legend>
        <p className="pendente-detalhe">Posto/graduação, nome de guerra e telefone já vêm do RE.</p>
        <div className="opcoes">
          {CAMPOS_EXTRAS.map((c) => (
            <label key={c.id} className="opcao">
              <input
                type="checkbox"
                checked={campos.includes(c.id)}
                onChange={(e) => setCampos((l) => (e.target.checked ? [...l, c.id] : l.filter((x) => x !== c.id)))}
              />
              {c.rotulo}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grupo-simples">
        <legend>Cias e quantidade de policiais</legend>
        <div className="opcoes">
          {UNIDADES.map((u) => (
            <label key={u.id} className="opcao">
              <input type="checkbox" checked={cias.includes(u.id)} onChange={(e) => alternarCia(u.id, e.target.checked)} />
              {u.sigla}
            </label>
          ))}
        </div>
        {cias.length > 0 &&
          UNIDADES.filter((u) => cias.includes(u.id)).map((u) => (
            <div key={u.id} className="quantidades" role="group" aria-label={`Quantidades ${u.sigla}`}>
              <strong>
                {u.sigla} · total {totalDe(quantidades[u.id])}
              </strong>
              <div className="grade-postos">
                {POSTOS.map((p) => (
                  <label key={p.id} className="campo">
                    {p.rotulo}
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={quantidades[u.id]?.[p.id] || ''}
                      placeholder="0"
                      onChange={(e) => mudarQuantidade(u.id, p.id, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        {erros.quantidades && <span className="erro-campo">{erros.quantidades}</span>}
      </fieldset>

      {erroGeral && (
        <p className="mensagem erro" role="alert">
          {erroGeral}
        </p>
      )}
      <div className="acoes-linha">
        <button className="botao secundario" type="button" onClick={aoFechar} disabled={enviando}>
          Cancelar
        </button>
        <button className="botao destaque" type="submit" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar solicitação às Cias'}
        </button>
      </div>
    </form>
  );
}

/** P/3: depois de enviada, quem já respondeu e quem foi escalado. */
export function AndamentoEfetivo({ numero, pedido }: { numero: string; pedido: PedidoEfetivo }) {
  const solicitacoes = useAoVivo<SolicitacaoEfetivo[]>(
    (ok, erro) => observarSolicitacoesDaOperacao(db, numero, ok, erro),
    [numero],
  );
  const hoje = hojeISO();
  const lista = [...(solicitacoes.valor ?? [])].sort(
    (a, b) => UNIDADES.findIndex((u) => u.id === a.unidadeId) - UNIDADES.findIndex((u) => u.id === b.unidadeId),
  );
  const extras = CAMPOS_EXTRAS.filter((c) => pedido.campos.includes(c.id));

  return (
    <div className="detalhe-item">
      <span className="pendente-detalhe">Prazo para as Cias: {formatarData(pedido.prazo)}</span>
      {solicitacoes.erro && <p className="mensagem erro">{solicitacoes.erro}</p>}
      <ul className="lista-efetivo">
        {lista.map((s) => {
          const situacao = situacaoSolicitacao(s, hoje);
          const contagem = contarPorPosto(s.policiais);
          return (
            <li key={s.id}>
              <details>
                <summary>
                  <strong>{siglaDoDestino(s.unidadeId)}</strong>{' '}
                  <span className={`selo situacao-${situacao}`}>{ROTULO_SITUACAO[situacao]}</span>{' '}
                  <span className="pendente-detalhe">
                    {s.policiais.length} de {totalDe(s.quantidades)} policiais
                  </span>
                </summary>
                <p className="pendente-detalhe">
                  {POSTOS.filter((p) => s.quantidades[p.id] > 0)
                    .map((p) => `${p.rotulo}: ${contagem[p.id]}/${s.quantidades[p.id]}`)
                    .join(' · ')}
                </p>
                {s.policiais.length > 0 && (
                  <ul className="escalados">
                    {s.policiais.map((p) => (
                      <li key={p.re}>
                        {p.posto} {p.nomeGuerra} · RE {p.re}
                        {p.telefone ? ` · ${p.telefone}` : ''}
                        {extras.map((c) => (p.extras[c.id] ? ` · ${c.rotulo}: ${p.extras[c.id]}` : '')).join('')}
                      </li>
                    ))}
                  </ul>
                )}
                {s.respondidoPor && <p className="pendente-detalhe">Enviado por {s.respondidoPor}</p>}
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
