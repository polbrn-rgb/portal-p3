import { useState, type FormEvent } from 'react';
import type { Firestore } from 'firebase/firestore';
import { acessoExiste, bloquearAcesso, excluirAcesso, observarAcessos, reenviarLinkAcesso, salvarAcesso } from '../../data/acessos';
import { buscarPolicial } from '../../data/efetivo';
import {
  acessoVazio,
  ehAdminRE,
  PERFIS_ACESSO,
  reBase,
  rotuloAcesso,
  situacaoAcesso,
  unidadeDaOpm,
  validarAcesso,
  type Acesso,
  type DadosAcesso,
  type ErrosAcesso,
  type PerfilAcesso,
} from '../../domain/acessos';
import { UNIDADES, type UnidadeId } from '../../domain/unidades';
import { useAoVivo } from '../../lib/useAoVivo';
import { Campo } from '../Campo';

/**
 * Administrador → Acessos: cada policial entra com o RE e a senha dele. Cadastro pelo banco de efetivo
 * (ou à mão, para quem não está no banco); o motor cria a conta e manda o link de primeiro acesso.
 */
export function AdminAcessos({ db }: { db: Firestore }) {
  const lista = useAoVivo<Acesso[]>((ok, erro) => observarAcessos(db, ok, erro), [db], 'Não foi possível carregar os acessos.');
  const [editando, setEditando] = useState<Acesso | null>(null);
  const [chaveForm, setChaveForm] = useState(0);

  const grupos = [
    ...UNIDADES.map((u) => ({ titulo: u.sigla, filtro: (a: Acesso) => a.perfil === 'unidade' && a.unidade === u.id })),
    { titulo: 'CFP', filtro: (a: Acesso) => a.perfil === 'cfp' },
    { titulo: 'Sala de Operações', filtro: (a: Acesso) => a.perfil === 'sala' },
    { titulo: 'P/3', filtro: (a: Acesso) => a.perfil === 'p3' },
  ];

  return (
    <section className="painel admin-acessos" aria-label="Acessos">
      <h2>Acessos (login por RE)</h2>
      <p className="pendente-detalhe">
        Cada policial entra com o RE (com ou sem dígito) e a senha que ele mesmo cria pelo link enviado ao e-mail funcional. Esqueceu a
        senha: a pessoa pede pela tela de login e o link vai para o mesmo e-mail.
      </p>
      <FormAcesso
        key={chaveForm}
        db={db}
        existente={editando}
        aoTerminar={() => {
          setEditando(null);
          setChaveForm((n) => n + 1);
        }}
      />
      {lista.erro && <p className="mensagem erro">{lista.erro}</p>}
      {grupos.map((g) => {
        const itens = (lista.valor ?? []).filter(g.filtro);
        return (
          <details key={g.titulo} className="grupo-acessos" open={itens.length > 0 && itens.length <= 12}>
            <summary>
              {g.titulo} <span className="pendente-detalhe">({itens.length})</span>
            </summary>
            {itens.length === 0 ? (
              <p className="pendente-detalhe">Ninguém cadastrado.</p>
            ) : (
              <ul className="lista-acessos">
                {itens.map((a) => (
                  <ItemAcesso
                    key={a.id}
                    db={db}
                    acesso={a}
                    aoEditar={() => {
                      setEditando(a);
                      setChaveForm((n) => n + 1);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                ))}
              </ul>
            )}
          </details>
        );
      })}
    </section>
  );
}

function dadosDe(a: Acesso): DadosAcesso {
  return {
    re: a.re,
    nomeCompleto: a.nomeCompleto,
    nomeGuerra: a.nomeGuerra,
    posto: a.posto,
    email: a.email,
    perfil: a.perfil,
    unidade: a.unidade,
    manual: a.manual,
  };
}

function FormAcesso({ db, existente, aoTerminar }: { db: Firestore; existente: Acesso | null; aoTerminar: () => void }) {
  const [d, setD] = useState<DadosAcesso>(() => (existente ? dadosDe(existente) : acessoVazio()));
  const [erros, setErros] = useState<ErrosAcesso>({});
  const [aviso, setAviso] = useState('');
  const [buscado, setBuscado] = useState(Boolean(existente));
  const [salvando, setSalvando] = useState(false);
  const novo = !existente;

  const mudar = <K extends keyof DadosAcesso>(k: K, v: DadosAcesso[K]) => setD((x) => ({ ...x, [k]: v }));

  async function buscar() {
    setAviso('');
    setErros({});
    if (reBase(d.re).length < 6) {
      setErros({ re: 'Digite o RE (6 números, com ou sem dígito).' });
      return;
    }
    if (await acessoExiste(db, d.re).catch(() => false)) {
      setAviso('Este RE já tem acesso: use "Editar" na lista abaixo.');
      return;
    }
    const p = await buscarPolicial(db, d.re).catch(() => null);
    setBuscado(true);
    if (!p) {
      setD((x) => ({ ...acessoVazio(), re: x.re, manual: true }));
      setAviso('RE fora do banco de efetivo: preencha os dados à mão.');
      return;
    }
    const unidade = unidadeDaOpm(p.opm ?? '');
    const email = (p.email ?? '').includes('@') ? (p.email ?? '') : '';
    setD((x) => ({
      ...x,
      re: p.re || x.re,
      nomeCompleto: p.nomeCompleto ?? '',
      nomeGuerra: p.nomeGuerra,
      posto: p.posto,
      email,
      unidade,
      perfil: unidade ? 'unidade' : '',
      manual: false,
    }));
    if (!email) setAviso('O banco não tem e-mail para este policial: digite o e-mail funcional.');
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const encontrados = validarAcesso(d);
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) return;
    setSalvando(true);
    try {
      await salvarAcesso(db, d, { novo, ativo: existente?.ativo });
      aoTerminar();
    } catch {
      setAviso('Não foi possível salvar. Confira a internet e tente de novo.');
      setSalvando(false);
    }
  }

  const admin = d.perfil === 'p3' && ehAdminRE(d.re);
  return (
    <form className="cartao grupo form-acesso" onSubmit={salvar} noValidate>
      <h3>{novo ? 'Novo acesso' : `Editar ${existente.posto} ${existente.nomeGuerra}`}</h3>
      <div className="linha-re">
        <Campo rotulo="RE" obrigatorio erro={erros.re}>
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            value={d.re}
            readOnly={!novo}
            placeholder="ex.: 144602-9"
            onChange={(e) => {
              mudar('re', e.target.value);
              setBuscado(false);
            }}
          />
        </Campo>
        {novo && (
          <button className="botao secundario" type="button" onClick={() => void buscar()}>
            Buscar no banco
          </button>
        )}
      </div>
      {aviso && <p className="mensagem aviso">{aviso}</p>}

      {buscado && (
        <>
          <Campo rotulo="Nome completo" obrigatorio erro={erros.nomeCompleto}>
            <input type="text" value={d.nomeCompleto} onChange={(e) => mudar('nomeCompleto', e.target.value)} />
          </Campo>
          <div className="linha-dupla">
            <Campo rotulo="Posto/graduação" obrigatorio erro={erros.posto}>
              <input type="text" value={d.posto} placeholder="ex.: Sd PM" onChange={(e) => mudar('posto', e.target.value)} />
            </Campo>
            <Campo rotulo="Nome de guerra">
              <input type="text" value={d.nomeGuerra} onChange={(e) => mudar('nomeGuerra', e.target.value)} />
            </Campo>
          </div>
          <Campo rotulo="E-mail funcional" obrigatorio erro={erros.email}>
            <input type="email" inputMode="email" value={d.email} onChange={(e) => mudar('email', e.target.value)} />
          </Campo>
          <Campo rotulo="Acesso" obrigatorio erro={erros.perfil}>
            <select value={d.perfil} onChange={(e) => mudar('perfil', e.target.value as PerfilAcesso | '')}>
              <option value="">Escolha…</option>
              {PERFIS_ACESSO.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.rotulo}
                </option>
              ))}
            </select>
          </Campo>
          {d.perfil && <p className="pendente-detalhe">{PERFIS_ACESSO.find((p) => p.id === d.perfil)?.ajuda}</p>}
          {d.perfil === 'unidade' && (
            <Campo rotulo="Cia" obrigatorio erro={erros.unidade}>
              <select value={d.unidade} onChange={(e) => mudar('unidade', e.target.value as UnidadeId | '')}>
                <option value="">Escolha…</option>
                {UNIDADES.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.sigla}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          {admin && <p className="mensagem aviso">Chefe/encarregado da P/3: este acesso também vê a aba Administrador.</p>}
          <div className="acoes-linha">
            <button className="botao destaque" type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : novo ? 'Cadastrar e enviar link' : 'Salvar'}
            </button>
            <button className="botao secundario" type="button" onClick={aoTerminar} disabled={salvando}>
              {novo ? 'Limpar' : 'Cancelar'}
            </button>
          </div>
          {novo && <p className="pendente-detalhe">Ao cadastrar, o policial recebe no e-mail funcional o link para criar a senha (em até 5 minutos).</p>}
        </>
      )}
    </form>
  );
}

function ItemAcesso({ db, acesso: a, aoEditar }: { db: Firestore; acesso: Acesso; aoEditar: () => void }) {
  const [confirmar, setConfirmar] = useState(false);
  const [msg, setMsg] = useState('');
  const s = situacaoAcesso(a);
  const fazer = (p: Promise<unknown>, ok: string) =>
    void p.then(() => setMsg(ok)).catch(() => setMsg('Não foi possível. Confira a internet.'));

  return (
    <li className="cartao item-acesso">
      <div className="item-acesso-topo">
        <strong>
          {a.posto} {a.nomeGuerra}
        </strong>
        <span className={`selo ${s.classe}`}>{s.texto}</span>
      </div>
      <span className="pendente-detalhe">
        RE {a.re} · {rotuloAcesso(a)} · {a.email}
        {a.manual ? ' · fora do banco' : ''}
      </span>
      {confirmar ? (
        <div className="acoes-linha">
          <span className="pendente-detalhe">Excluir o acesso? A pessoa deixa de entrar no portal.</span>
          <button className="botao perigo" type="button" onClick={() => fazer(excluirAcesso(db, a.id), 'Excluindo…')}>
            Sim, excluir
          </button>
          <button className="botao secundario" type="button" onClick={() => setConfirmar(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <div className="acoes-linha acoes-acesso">
          <button className="botao-link" type="button" onClick={aoEditar}>
            Editar
          </button>
          <button className="botao-link" type="button" onClick={() => fazer(reenviarLinkAcesso(db, a.id), 'Link pedido.')}>
            Reenviar link
          </button>
          <button className="botao-link" type="button" onClick={() => fazer(bloquearAcesso(db, a.id, !a.ativo), a.ativo ? 'Bloqueando…' : 'Desbloqueando…')}>
            {a.ativo ? 'Bloquear' : 'Desbloquear'}
          </button>
          <button className="botao-link perigo-link" type="button" onClick={() => setConfirmar(true)}>
            Excluir
          </button>
        </div>
      )}
      {msg && <span className="pendente-detalhe">{msg}</span>}
    </li>
  );
}
