import { type FormEvent, useState } from 'react';
import { enviarSolicitacao, observarSolicitacoesDaOperacao } from '../../data/efetivo';
import { formatarData, hojeISO } from '../../domain/datas';
import { baixarXlsx } from '../../lib/xlsx';
import type { Demanda } from '../../domain/demanda';
import {
  CAMPOS_EXTRAS,
  contarPorPosto,
  planilhaDoEfetivo,
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
import { Campo, Obrigatorio } from '../Campo';

type PropsPedido = { demanda: Demanda; aoFechar: () => void; anterior?: PedidoEfetivo };

/** P/3: quantos policiais de cada posto cada Cia manda, que dados pedir e até quando (enviar ou editar). */
export function FormPedidoEfetivo({ demanda, aoFechar, anterior }: PropsPedido) {
  const [prazo, setPrazo] = useState(anterior?.prazo ?? '');
  const [campos, setCampos] = useState<CampoExtra[]>(anterior?.campos ?? []);
  const [cias, setCias] = useState<UnidadeId[]>(() =>
    UNIDADES.map((u) => u.id).filter((id) => totalDe(anterior?.quantidades[id]) > 0),
  );
  const [quantidades, setQuantidades] = useState<Partial<Record<UnidadeId, Quantidades>>>(anterior?.quantidades ?? {});
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
      await enviarSolicitacao(db, demanda, pedido, anterior);
      aoFechar();
    } catch (e) {
      setErroGeral(
        (e as { code?: string }).code === 'permission-denied'
          ? 'O banco recusou o envio: as regras novas do Firestore ainda não foram publicadas (npm run deploy:regras ou console do Firebase).'
          : 'Não foi possível enviar. Verifique a conexão e tente de novo.',
      );
      setEnviando(false);
    }
  }

  return (
    <form className="detalhe-item pedido-efetivo" onSubmit={enviar} noValidate aria-label="Solicitação de efetivo">
      <Campo rotulo="Prazo para as Cias preencherem" erro={erros.prazo} obrigatorio>
        <input type="date" value={prazo} min={anterior ? undefined : hojeISO()} onChange={(e) => setPrazo(e.target.value)} />
      </Campo>

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
        <legend>
          Cias e quantidade de policiais
          <Obrigatorio />
        </legend>
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

      {anterior && (
        <p className="pendente-detalhe">
          Cia desmarcada perde a solicitação (e o efetivo que já mandou). Se mudar as quantidades ou pedir um dado novo, a
          Cia que já respondeu volta a ver como pendente, com os policiais que já tinha mandado.
        </p>
      )}
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
          {enviando ? 'Salvando…' : anterior ? 'Salvar alterações' : 'Enviar solicitação às Cias'}
        </button>
      </div>
    </form>
  );
}

/** P/3: depois de enviada, quem já respondeu e quem foi escalado; dá para editar e baixar em Excel. */
export function AndamentoEfetivo({ demanda, pedido }: { demanda: Demanda; pedido: PedidoEfetivo }) {
  const numero = demanda.id;
  const [editando, setEditando] = useState(false);
  const solicitacoes = useAoVivo<SolicitacaoEfetivo[]>(
    (ok, erro) => observarSolicitacoesDaOperacao(db, numero, ok, erro),
    [numero],
  );
  const hoje = hojeISO();
  const lista = [...(solicitacoes.valor ?? [])].sort(
    (a, b) => UNIDADES.findIndex((u) => u.id === a.unidadeId) - UNIDADES.findIndex((u) => u.id === b.unidadeId),
  );
  const extras = CAMPOS_EXTRAS.filter((c) => pedido.campos.includes(c.id));
  const temEfetivo = lista.some((s) => s.policiais.length > 0);

  if (editando) return <FormPedidoEfetivo demanda={demanda} anterior={pedido} aoFechar={() => setEditando(false)} />;

  function baixar() {
    baixarXlsx(`efetivo-op-${numero}.xlsx`, planilhaDoEfetivo(lista, pedido, hoje));
  }

  return (
    <div className="detalhe-item">
      <span className="pendente-detalhe">Prazo para as Cias: {formatarData(pedido.prazo)}</span>
      <div className="acoes-linha acoes-efetivo">
        <button className="botao secundario" type="button" onClick={() => setEditando(true)}>
          ✏️ Editar solicitação
        </button>
        <button
          className="botao secundario"
          type="button"
          onClick={baixar}
          disabled={!temEfetivo}
          title={temEfetivo ? undefined : 'Nenhuma Cia mandou efetivo ainda'}
        >
          ⬇️ Baixar efetivo (Excel)
        </button>
      </div>
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
