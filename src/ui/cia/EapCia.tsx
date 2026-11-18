import { useState, type FormEvent } from 'react';
import { enviarRespostaEap } from '../../data/eap';
import { buscarPolicial } from '../../data/efetivo';
import { formatarData, hojeISO } from '../../domain/datas';
import {
  errosPolicialEap,
  errosRespostaEap,
  LISTAS_LIVRES_EAP,
  MAX_LISTA_LIVRE,
  policialEapVazio,
  rotuloTurma,
  totalVagasDaCia,
  type ListaEap,
  type PolicialEap,
  type RespostaEap,
} from '../../domain/eap';
import { normalizarRE } from '../../domain/efetivo';
import { db } from '../../lib/firebase';
import { quemSou } from '../../lib/quemSou';
import { Campo } from '../Campo';

const CHAVE_NOME = 'portalp3.respondidoPor';

function lerNome(): string {
  try {
    return localStorage.getItem(CHAVE_NOME) ?? '';
  } catch {
    return '';
  }
}

function situacao(r: RespostaEap, hoje: string): { texto: string; classe: string } {
  if (r.status === 'enviada') return { texto: 'Enviado', classe: 'situacao-respondida' };
  if (r.prazo < hoje) return { texto: 'Atrasado', classe: 'situacao-atrasada' };
  return { texto: 'Aguardando', classe: 'situacao-aguardando' };
}

/** No alto da página da Cia: os EAP abertos para ela. */
export function EapsDaCia({ lista }: { lista: RespostaEap[] }) {
  const hoje = hojeISO();
  if (!lista.length) return null;
  return (
    <section className="bloco-efetivo" aria-label="EAP">
      <h3>EAP · indicar efetivo</h3>
      <ul className="lista">
        {lista.map((r) => {
          const s = situacao(r, hoje);
          return (
            <li key={r.id}>
              <a className={`item-pendente link-cartao borda-${s.classe}`} href={`#/eap/${r.id}`}>
                <span className="item-topo">
                  <strong>{r.titulo}</strong>
                  <span className={`selo ${s.classe}`}>{s.texto}</span>
                </span>
                <span className="pendente-detalhe">
                  Prazo {formatarData(r.prazo)} · {totalVagasDaCia(r.vagas)} vaga(s) para a sua Cia
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type Busca = 'nada' | 'buscando' | 'achou' | 'nao-achou';

/** Formulário de um policial (RE puxa graduação, nome completo, e-mail e celular do banco de efetivo). */
function FormPolicialEap({ jaNaLista, aoAdicionar, aoCancelar }: { jaNaLista: string[]; aoAdicionar: (p: PolicialEap) => void; aoCancelar: () => void }) {
  const [p, setP] = useState<PolicialEap>(policialEapVazio);
  const [busca, setBusca] = useState<Busca>('nada');
  const [erros, setErros] = useState<ReturnType<typeof errosPolicialEap>>({});
  const mudar = (k: keyof PolicialEap, v: string) => setP((x) => ({ ...x, [k]: v }));

  async function buscar() {
    if (normalizarRE(p.re).length < 5) return setErros({ re: 'Informe o RE.' });
    setBusca('buscando');
    try {
      const achado = await buscarPolicial(db, p.re);
      if (!achado) return setBusca('nao-achou');
      setP((x) => ({
        ...x,
        grad: achado.posto || x.grad,
        nomeCompleto: achado.nomeCompleto || x.nomeCompleto,
        email: achado.email || x.email,
        celular: achado.telefone || x.celular,
      }));
      setBusca('achou');
      setErros({});
    } catch {
      setBusca('nao-achou');
    }
  }

  function adicionar(e: FormEvent) {
    e.preventDefault();
    const encontrados = errosPolicialEap(p);
    if (!encontrados.re && jaNaLista.includes(normalizarRE(p.re))) encontrados.re = 'Este RE já está neste EAP.';
    setErros(encontrados);
    if (Object.keys(encontrados).length) return;
    aoAdicionar(p);
  }

  return (
    <form className="cartao grupo" onSubmit={adicionar} noValidate aria-label="Adicionar policial ao EAP">
      <div className="linha-busca">
        <Campo rotulo="RE do policial" erro={erros.re} obrigatorio>
          <input
            value={p.re}
            inputMode="numeric"
            placeholder="123456-7"
            autoFocus
            onChange={(e) => {
              mudar('re', e.target.value);
              setBusca('nada');
            }}
            onBlur={() => busca === 'nada' && p.re.trim() && void buscar()}
          />
        </Campo>
        <button className="botao secundario" type="button" onClick={() => void buscar()} disabled={busca === 'buscando'}>
          {busca === 'buscando' ? 'Buscando…' : 'Buscar'}
        </button>
      </div>
      {busca === 'nao-achou' && <p className="pendente-detalhe">RE não está no banco de efetivo: preencha os dados.</p>}
      <div className="grade-2">
        <Campo rotulo="Graduação" erro={erros.grad} obrigatorio>
          <input value={p.grad} placeholder="Ex.: SD PM" onChange={(e) => mudar('grad', e.target.value)} />
        </Campo>
        <Campo rotulo="Nome completo" erro={erros.nomeCompleto} obrigatorio>
          <input value={p.nomeCompleto} onChange={(e) => mudar('nomeCompleto', e.target.value)} />
        </Campo>
        <Campo rotulo="E-mail funcional">
          <input type="email" value={p.email} onChange={(e) => mudar('email', e.target.value)} />
        </Campo>
        <Campo rotulo="Telefone celular">
          <input type="tel" value={p.celular} onChange={(e) => mudar('celular', e.target.value)} />
        </Campo>
        <Campo rotulo="BI ou NBI da IAS">
          <input value={p.ias} placeholder="Ex.: IAS260018653" onChange={(e) => mudar('ias', e.target.value)} />
        </Campo>
        <Campo rotulo="Validade da IAS" erro={erros.validadeIas}>
          <input type="date" value={p.validadeIas} onChange={(e) => mudar('validadeIas', e.target.value)} />
        </Campo>
      </div>
      <Campo rotulo="Observações">
        <input value={p.observacao} placeholder="Ex.: REAPRESENTAÇÃO" onChange={(e) => mudar('observacao', e.target.value)} />
      </Campo>
      <div className="acoes-linha">
        <button className="botao secundario" type="button" onClick={aoCancelar}>
          Cancelar
        </button>
        <button className="botao destaque" type="submit">
          Adicionar
        </button>
      </div>
    </form>
  );
}

function ListaDePoliciais({ lista, aoRemover }: { lista: PolicialEap[]; aoRemover: (i: number) => void }) {
  if (!lista.length) return null;
  return (
    <ul className="lista-policiais-eap">
      {lista.map((p, i) => (
        <li key={`${p.re}-${i}`}>
          <span>
            <strong>{p.grad}</strong> {p.nomeCompleto} · RE {p.re}
          </span>
          <button className="botao secundario" type="button" aria-label={`Remover ${p.nomeCompleto}`} onClick={() => aoRemover(i)}>
            Remover
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Cia indica o efetivo de cada turma (ou "sem efetivo") e envia; o motor grava na aba dela na planilha. */
export function ResponderEap({ r }: { r: RespostaEap }) {
  const hoje = hojeISO();
  const [blocos, setBlocos] = useState<Record<string, ListaEap>>(() => structuredClone(r.blocos ?? {}));
  const [adicionandoEm, setAdicionandoEm] = useState<string | null>(null);
  const [nome, setNome] = useState(() => quemSou() ?? (r.respondidoPor || lerNome()));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const s = situacao(r, hoje);
  const comVaga = r.turmas.filter((t) => (Number(r.vagas[t.id]) || 0) > 0);
  const semVaga = r.turmas.filter((t) => !(Number(r.vagas[t.id]) || 0));
  const todosRE = Object.values(blocos).flatMap((b) => b.policiais.map((p) => normalizarRE(p.re)));

  const lista = (id: string): ListaEap => blocos[id] ?? { semEfetivo: false, policiais: [] };
  const mudarLista = (id: string, f: (b: ListaEap) => ListaEap) => {
    setBlocos((x) => ({ ...x, [id]: f(x[id] ?? { semEfetivo: false, policiais: [] }) }));
    setAviso('');
  };

  async function enviar() {
    const encontrados = errosRespostaEap(r, blocos, nome);
    setErros(encontrados);
    if (Object.keys(encontrados).length) return;
    setEnviando(true);
    try {
      try {
        localStorage.setItem(CHAVE_NOME, nome.trim());
      } catch {
        /* sem armazenamento: segue */
      }
      await enviarRespostaEap(db, r.id, blocos, nome);
      setAviso('Enviado à P/3. O efetivo vai para a aba da sua Cia na planilha em até 5 minutos.');
    } catch {
      setAviso('Não foi possível enviar. Verifique a conexão e tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  function bloco(id: string, titulo: string, detalhe: string, vagas: number | null) {
    const b = lista(id);
    const cheio = vagas !== null ? b.policiais.length >= vagas : b.policiais.length >= MAX_LISTA_LIVRE;
    return (
      <section key={id} className="cartao turma-eap" aria-label={titulo}>
        <span className="item-topo">
          <h3>{titulo}</h3>
          {vagas !== null && (
            <span className={`contador-posto ${b.policiais.length >= vagas || b.semEfetivo ? 'completo' : ''}`}>
              <strong>
                {b.policiais.length}/{vagas}
              </strong>
            </span>
          )}
        </span>
        {detalhe && <p className="pendente-detalhe">{detalhe}</p>}
        <ListaDePoliciais lista={b.policiais} aoRemover={(i) => mudarLista(id, (x) => ({ ...x, policiais: x.policiais.filter((_, k) => k !== i) }))} />
        {vagas !== null && !b.policiais.length && (
          <label className="marcar-sem-efetivo">
            <input
              type="checkbox"
              checked={!!b.semEfetivo}
              onChange={(e) => mudarLista(id, (x) => ({ ...x, semEfetivo: e.target.checked }))}
            />
            Sem efetivo pendente de EAP
          </label>
        )}
        {adicionandoEm === id ? (
          <FormPolicialEap
            jaNaLista={todosRE}
            aoCancelar={() => setAdicionandoEm(null)}
            aoAdicionar={(p) => {
              mudarLista(id, (x) => ({ semEfetivo: false, policiais: [...x.policiais, p] }));
              setAdicionandoEm(null);
            }}
          />
        ) : (
          !cheio &&
          !b.semEfetivo && (
            <button className="botao secundario" type="button" onClick={() => setAdicionandoEm(id)}>
              + Adicionar policial
            </button>
          )
        )}
        {erros[id] && <span className="erro-campo">{erros[id]}</span>}
      </section>
    );
  }

  return (
    <section className="painel painel-estreito">
      <div className="painel-cabecalho">
        <h2>{r.titulo}</h2>
        <span className={`selo ${s.classe}`}>{s.texto}</span>
      </div>
      <p className="pendente-detalhe">
        Prazo para enviar: {formatarData(r.prazo)}
        {r.status === 'enviada' && r.respondidoPor ? ` · Enviado por ${r.respondidoPor}` : ''}
        {r.status === 'enviada' && r.gravado ? ' · já está na planilha' : ''}
      </p>
      {r.erro && <p className="mensagem erro">A P/3 vai conferir: {r.erro}</p>}

      {comVaga.map((t) => bloco(t.id, rotuloTurma(t), 'Apresentação às 07h45 no CPA/M-11.', Number(r.vagas[t.id]) || 0))}
      {semVaga.length > 0 && (
        <p className="pendente-detalhe">Sem vaga para a sua Cia: {semVaga.map((t) => rotuloTurma(t)).join('; ')}.</p>
      )}
      {LISTAS_LIVRES_EAP.map((l) => bloco(l.id, l.rotulo, l.detalhe ? `${l.detalhe}. Só se tiver alguém.` : 'Só se tiver alguém.', null))}

      <div className="cartao grupo">
        <Campo rotulo="Enviado por" erro={erros.nome && !nome.trim() ? erros.nome : undefined} obrigatorio>
          <input value={nome} readOnly={Boolean(quemSou())} placeholder="Posto/graduação e nome" onChange={(e) => setNome(e.target.value)} />
        </Campo>
        {aviso && (
          <p className="mensagem aviso" role="status">
            {aviso}
          </p>
        )}
        <div className="acoes-linha">
          <a className="botao secundario" href="#/">
            Voltar
          </a>
          <button className="botao destaque" type="button" disabled={enviando} onClick={() => void enviar()}>
            {enviando ? 'Enviando…' : r.status === 'enviada' ? 'Reenviar à P/3' : 'Enviar à P/3'}
          </button>
        </div>
      </div>
    </section>
  );
}
