import { useState } from 'react';
import { bloquearSalaCia, observarSenhasSalaCia, pedirSenhaSalaCia } from '../../data/senhasSalaCia';
import { formatarData, hojeISO } from '../../domain/datas';
import { gerarSenhaSala, situacaoSenhaSala, type SenhaSalaCia } from '../../domain/salaCia';
import { UNIDADES, type UnidadeId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { cutucarMotor } from '../../lib/motor';
import { quemSou } from '../../lib/quemSou';
import { useAoVivo } from '../../lib/useAoVivo';

/**
 * P/3 → Sala de Operações → Senhas das Cias: gera a senha da Sala de Operações de cada Cia/FT. Quem entra com ela
 * (tela de login → "Entrar na Sala de Operações da Cia") vê só a Sala de Operações daquela Cia.
 */
export function SenhasSalaCia() {
  const lista = useAoVivo<SenhaSalaCia[]>((ok, erro) => observarSenhasSalaCia(db, ok, erro), [], 'Não foi possível carregar as senhas.');
  return (
    <section className="painel admin-acessos" aria-label="Senhas da Sala de Operações das Cias">
      <h2>Senhas da Sala de Operações das Cias</h2>
      <p className="pendente-detalhe">
        Cada Cia/FT tem uma senha própria para a Sala de Operações. Na tela de login, a Sala escolhe{' '}
        <strong>Entrar na Sala de Operações da Cia</strong>, a Cia e digita a senha: entra só na Sala de Operações daquela Cia
        (lançar a produção dos pelotões e o resumo do mês). A senha aparece uma vez só, ao gerar: anote e entregue. Gerar
        uma senha nova desconecta os aparelhos que estavam com a antiga.
      </p>
      {lista.erro && <p className="mensagem erro">{lista.erro}</p>}
      {lista.carregando ? (
        <p className="carregando">Carregando…</p>
      ) : (
        <ul className="lista-acessos">
          {UNIDADES.map((u) => (
            <ItemSala key={u.id} unidade={u.id} sigla={u.sigla} atual={(lista.valor ?? []).find((s) => s.id === u.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ItemSala({ unidade, sigla, atual }: { unidade: UnidadeId; sigla: string; atual?: SenhaSalaCia }) {
  const [confirmar, setConfirmar] = useState(false);
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const s = situacaoSenhaSala(atual);
  const por = quemSou() ?? 'P/3';

  async function fazer(acao: () => Promise<unknown>, ok: string): Promise<boolean> {
    setOcupado(true);
    setMsg('');
    try {
      await acao();
      cutucarMotor();
      setMsg(ok);
      return true;
    } catch {
      setMsg('Não foi possível. Confira a internet.');
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function gerar() {
    setConfirmar(false);
    const nova = gerarSenhaSala();
    if (await fazer(() => pedirSenhaSalaCia(db, unidade, nova, por), '')) setSenha(nova);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(senha);
      setMsg('Senha copiada.');
    } catch {
      setMsg('Não foi possível copiar: anote a senha.');
    }
  }

  return (
    <li className="cartao item-acesso">
      <div className="item-acesso-topo">
        <strong>Sala de Operações {sigla}</strong>
        <span className={`selo ${s.classe}`}>{s.texto}</span>
      </div>
      {atual?.pedidoEm && (
        <span className="pendente-detalhe">
          Última alteração: {formatarData(hojeISO(atual.pedidoEm))}
          {atual.pedidoPor ? ` · ${atual.pedidoPor}` : ''}
        </span>
      )}
      {senha && (
        <div className="cartao grupo senha-gerada" role="status" aria-label={`Senha nova da Sala de Operações ${sigla}`}>
          <span className="pendente-detalhe">Senha nova (aparece só agora; vale assim que a situação ficar "Ativa"):</span>
          <code className="senha-sala">{senha}</code>
          <div className="acoes-linha">
            <button className="botao secundario" type="button" onClick={() => void copiar()}>
              Copiar
            </button>
            <button className="botao-link" type="button" onClick={() => setSenha('')}>
              Já anotei, esconder
            </button>
          </div>
        </div>
      )}
      {confirmar ? (
        <div className="acoes-linha">
          <span className="pendente-detalhe">Gerar senha nova? A senha atual deixa de valer e quem estiver logado sai.</span>
          <button className="botao destaque" type="button" disabled={ocupado} onClick={() => void gerar()}>
            Sim, gerar
          </button>
          <button className="botao secundario" type="button" onClick={() => setConfirmar(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <div className="acoes-linha acoes-acesso">
          <button
            className="botao destaque"
            type="button"
            disabled={ocupado}
            onClick={() => (atual ? setConfirmar(true) : void gerar())}
          >
            {atual ? 'Gerar senha nova' : 'Gerar senha'}
          </button>
          {atual && atual.status === 'ok' && (
            <button
              className="botao-link"
              type="button"
              disabled={ocupado}
              onClick={() => void fazer(() => bloquearSalaCia(db, unidade, atual.ativo, por), atual.ativo ? 'Bloqueando…' : 'Desbloqueando…')}
            >
              {atual.ativo ? 'Bloquear' : 'Desbloquear'}
            </button>
          )}
        </div>
      )}
      {msg && <span className="pendente-detalhe">{msg}</span>}
    </li>
  );
}
