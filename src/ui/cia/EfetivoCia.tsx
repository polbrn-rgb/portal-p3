import { type FormEvent, useState } from 'react';
import { buscarPolicial, responderSolicitacao } from '../../data/efetivo';
import { formatarData, hojeISO } from '../../domain/datas';
import {
  CAMPOS_EXTRAS,
  categoriaDoPosto,
  contarPorPosto,
  normalizarRE,
  POSTOS,
  ROTULO_SITUACAO,
  situacaoSolicitacao,
  totalDe,
  validarPolicialEscalado,
  validarResposta,
  type CampoExtra,
  type PolicialEscalado,
  type SolicitacaoEfetivo,
} from '../../domain/efetivo';
import { db } from '../../lib/firebase';
import { irPara } from '../../lib/navegacao';

const CHAVE_NOME = 'portalp3.respondidoPor';

function periodo(s: Pick<SolicitacaoEfetivo, 'inicio' | 'termino'>): string {
  if (!s.inicio) return '';
  return !s.termino || s.termino === s.inicio ? formatarData(s.inicio) : `${formatarData(s.inicio)} a ${formatarData(s.termino)}`;
}

/** Bloco no topo do painel da Cia. */
export function SolicitacoesEfetivo({ lista }: { lista: SolicitacaoEfetivo[] }) {
  const hoje = hojeISO();
  // Respondidas há tempo saem da frente: ficam as abertas e as de operação ainda por vir.
  const visiveis = lista.filter((s) => s.status !== 'respondida' || (s.termino || s.inicio || s.prazo) >= hoje);
  if (!visiveis.length) return null;
  return (
    <section className="bloco-efetivo" aria-label="Solicitações de efetivo">
      <h3>Solicitações de efetivo</h3>
      <ul className="lista">
        {visiveis.map((s) => {
          const situacao = situacaoSolicitacao(s, hoje);
          return (
            <li key={s.id}>
              <a className={`item-pendente link-cartao borda-situacao-${situacao}`} href={`#/efetivo/${s.id}`}>
                <span className="item-topo">
                  <strong>Nº {s.numero}</strong>
                  <span className={`selo situacao-${situacao}`}>{ROTULO_SITUACAO[situacao]}</span>
                </span>
                <span className="pendente-assunto">{s.saida}</span>
                <span className="pendente-detalhe">
                  {periodo(s)} · Prazo {formatarData(s.prazo)} · {s.policiais.length} de {totalDe(s.quantidades)} policiais
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function lerNome(): string {
  try {
    return localStorage.getItem(CHAVE_NOME) ?? '';
  } catch {
    return '';
  }
}

const policialVazio = (): PolicialEscalado => ({ re: '', posto: '', nomeGuerra: '', telefone: '', extras: {} });

/** A Cia informa quem vai: digita o RE e o banco de efetivo completa o resto. */
export function PreencherEfetivo({ s }: { s: SolicitacaoEfetivo }) {
  const [policiais, setPoliciais] = useState<PolicialEscalado[]>(s.policiais);
  const [novo, setNovo] = useState<PolicialEscalado>(policialVazio);
  const [busca, setBusca] = useState<'nada' | 'buscando' | 'achou' | 'nao-achou'>('nada');
  const [erroNovo, setErroNovo] = useState('');
  const [nome, setNome] = useState(lerNome);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const contagem = contarPorPosto(policiais);
  const extras = CAMPOS_EXTRAS.filter((c) => s.campos.includes(c.id));

  async function buscar() {
    setErroNovo('');
    if (normalizarRE(novo.re).length < 5) {
      setErroNovo('Digite o RE (com ou sem dígito).');
      return;
    }
    setBusca('buscando');
    try {
      const p = await buscarPolicial(db, novo.re);
      if (p) {
        setNovo((n) => ({ ...n, ...p }));
        setBusca('achou');
      } else {
        setNovo((n) => ({ ...n, posto: '', nomeGuerra: '', telefone: '' }));
        setBusca('nao-achou');
      }
    } catch {
      setBusca('nada');
      setErroNovo('Não foi possível buscar agora. Tente de novo.');
    }
  }

  function adicionar(e: FormEvent) {
    e.preventDefault();
    const msg = validarPolicialEscalado(novo, s.campos);
    if (msg) return setErroNovo(msg);
    if (policiais.some((p) => normalizarRE(p.re) === normalizarRE(novo.re))) return setErroNovo('Este RE já está na lista.');
    const extrasPedidos = Object.fromEntries(extras.map((c) => [c.id, (novo.extras[c.id] ?? '').trim()]));
    setPoliciais((l) => [...l, { ...novo, re: novo.re.trim(), extras: extrasPedidos }]);
    setNovo(policialVazio());
    setBusca('nada');
    setErroNovo('');
    setEnviado(false);
  }

  async function enviar() {
    const msg = validarResposta(policiais, nome);
    setErro(msg);
    if (msg) return;
    setEnviando(true);
    try {
      try {
        localStorage.setItem(CHAVE_NOME, nome.trim());
      } catch {
        /* sem armazenamento: segue */
      }
      await responderSolicitacao(db, s.id, policiais, nome);
      setEnviado(true);
    } catch {
      setErro('Não foi possível enviar. Verifique a conexão e tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="painel painel-estreito">
      <div className="painel-cabecalho">
        <h2>Efetivo · Nº {s.numero}</h2>
        <span className={`selo situacao-${situacaoSolicitacao(s, hojeISO())}`}>{ROTULO_SITUACAO[situacaoSolicitacao(s, hojeISO())]}</span>
      </div>

      <div className="cartao grupo">
        <p className="item-saida">{s.saida}</p>
        <p className="pendente-detalhe">
          {periodo(s)} · Prazo para enviar: {formatarData(s.prazo)}
        </p>
        <div className="grade-postos" aria-label="Pedido da P/3">
          {POSTOS.filter((p) => s.quantidades[p.id] > 0).map((p) => (
            <span key={p.id} className={`contador-posto ${contagem[p.id] >= s.quantidades[p.id] ? 'completo' : ''}`}>
              {p.rotulo}
              <strong>
                {contagem[p.id]}/{s.quantidades[p.id]}
              </strong>
            </span>
          ))}
        </div>
      </div>

      <form className="cartao grupo" onSubmit={adicionar} noValidate aria-label="Adicionar policial">
        <div className="linha-busca">
          <label className="campo">
            RE do policial
            <input
              value={novo.re}
              inputMode="numeric"
              placeholder="123456-7"
              onChange={(e) => {
                setNovo({ ...policialVazio(), re: e.target.value, extras: novo.extras });
                setBusca('nada');
              }}
              onBlur={() => busca === 'nada' && novo.re.trim() && void buscar()}
            />
          </label>
          <button className="botao secundario" type="button" onClick={() => void buscar()} disabled={busca === 'buscando'}>
            {busca === 'buscando' ? 'Buscando…' : 'Buscar'}
          </button>
        </div>

        {busca === 'achou' && (
          <p className="policial-achado" role="status">
            {novo.posto} {novo.nomeGuerra}
            {novo.telefone ? ` · ${novo.telefone}` : ''}
          </p>
        )}
        {busca === 'nao-achou' && (
          <>
            <p className="pendente-detalhe" role="status">
              RE não encontrado no banco de efetivo. Preencha os dados:
            </p>
            <div className="grade">
              <label className="campo">
                Posto/graduação
                <input value={novo.posto} placeholder="Ex.: Cb PM" onChange={(e) => setNovo({ ...novo, posto: e.target.value })} />
              </label>
              <label className="campo">
                Nome de guerra
                <input value={novo.nomeGuerra} onChange={(e) => setNovo({ ...novo, nomeGuerra: e.target.value })} />
              </label>
              <label className="campo">
                Telefone
                <input value={novo.telefone} inputMode="tel" onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} />
              </label>
            </div>
          </>
        )}

        {extras.length > 0 && (
          <div className="grade">
            {extras.map((c) => (
              <label key={c.id} className="campo">
                {c.rotulo}
                <input
                  value={novo.extras[c.id] ?? ''}
                  inputMode={c.id === 'cpf' ? 'numeric' : undefined}
                  onChange={(e) => setNovo({ ...novo, extras: { ...novo.extras, [c.id as CampoExtra]: e.target.value } })}
                />
              </label>
            ))}
          </div>
        )}
        {erroNovo && <span className="erro-campo">{erroNovo}</span>}
        <button className="botao secundario" type="submit">
          + Adicionar policial
        </button>
      </form>

      <div className="cartao grupo">
        <strong>Policiais ({policiais.length})</strong>
        {policiais.length === 0 && <p className="vazio">Nenhum policial adicionado.</p>}
        <ul className="escalados">
          {policiais.map((p) => (
            <li key={p.re}>
              <span>
                {p.posto} {p.nomeGuerra} · RE {p.re}
                {p.telefone ? ` · ${p.telefone}` : ''}
                {extras.map((c) => (p.extras[c.id] ? ` · ${c.rotulo}: ${p.extras[c.id]}` : '')).join('')}
                {categoriaDoPosto(p.posto) === 'outro' ? ' (fora das categorias pedidas)' : ''}
              </span>
              <button
                className="botao-link"
                type="button"
                aria-label={`Remover ${p.nomeGuerra}`}
                onClick={() => {
                  setPoliciais((l) => l.filter((x) => x.re !== p.re));
                  setEnviado(false);
                }}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
        <label className="campo">
          Enviado por
          <input value={nome} placeholder="Posto/graduação e nome" onChange={(e) => setNome(e.target.value)} />
        </label>
      </div>

      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}
      {enviado && (
        <p className="mensagem aviso" role="status">
          Efetivo enviado para a P/3. Se precisar, corrija e envie de novo.
        </p>
      )}

      <div className="barra-acoes">
        <button className="botao secundario" type="button" onClick={() => irPara('#/')}>
          Voltar
        </button>
        <button className="botao destaque" type="button" disabled={enviando} onClick={() => void enviar()}>
          {enviando ? 'Enviando…' : s.status === 'respondida' ? 'Reenviar efetivo' : 'Enviar efetivo'}
        </button>
      </div>
    </section>
  );
}
