import { useState } from 'react';
import { salvarNoAparelho } from '../../data/arquivos';
import { enviarRespostaIcc } from '../../data/icc';
import { formatarData } from '../../domain/datas';
import { GRADUACOES_ICC, lerQuantidadesIcc, situacaoRespostaIcc, totalIcc, type GraduacaoIcc, type Icc, type RespostaIcc } from '../../domain/icc';
import type { UnidadeId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { cutucarMotor } from '../../lib/motor';
import { quemSou } from '../../lib/quemSou';
import { Campo } from '../Campo';

const ROTULO = { gravado: '✅ Na planilha', enviado: '⏳ Enviado', erro: '❌ Erro ao gravar', pendente: 'Pendente', atrasado: 'Atrasado' } as const;
const CHAVE_NOME = 'portalp3.respondidoPor';

export function contarPendentesIcc(iccs: Icc[], respostas: RespostaIcc[]): number {
  return iccs.filter((i) => !respostas.some((r) => r.iccId === i.id)).length;
}

/** Aperfeiçoamento da Cia: cada ICC aberta com a ordem para baixar e o formulário. */
export function AperfeicoamentoCia(p: { unidade: UnidadeId; iccs: Icc[]; respostas: RespostaIcc[]; carregando: boolean }) {
  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Aperfeiçoamento</h2>
      </div>
      {p.carregando && <p className="carregando">Carregando…</p>}
      {!p.carregando && !p.iccs.length && <p className="vazio">Nenhuma ICC aberta.</p>}
      {p.iccs.map((i) => (
        <CartaoIccCia key={i.id} icc={i} unidade={p.unidade} resposta={p.respostas.find((r) => r.iccId === i.id)} />
      ))}
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

function CartaoIccCia(p: { icc: Icc; unidade: UnidadeId; resposta?: RespostaIcc }) {
  const { icc, resposta } = p;
  const s = situacaoRespostaIcc(resposta, icc.prazo);
  const [rascunho, setRascunho] = useState<Partial<Record<GraduacaoIcc, string>>>(() =>
    resposta ? Object.fromEntries(GRADUACOES_ICC.map((g) => [g.id, String(resposta[g.id])])) : {},
  );
  const [nome, setNome] = useState(quemSou() ?? (resposta?.respondidoPor || lerNome()));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState<'' | 'baixando' | 'enviando'>('');
  const { valores } = lerQuantidadesIcc(rascunho);

  async function baixar() {
    setOcupado('baixando');
    try {
      await salvarNoAparelho(db, icc.arquivo.id);
    } catch {
      setErro('Não foi possível baixar a ordem. Tente de novo.');
    }
    setOcupado('');
  }

  async function enviar() {
    const { valores: q, erros: e } = lerQuantidadesIcc(rascunho);
    const todos: Record<string, string> = { ...e };
    if (!nome.trim()) todos.__nome = 'Informe quem preencheu (posto/graduação e nome).';
    setErros(todos);
    setErro('');
    setAviso('');
    if (Object.keys(todos).length) return;
    setOcupado('enviando');
    try {
      const envio = enviarRespostaIcc(db, icc.id, p.unidade, q, nome);
      envio.catch(() => undefined);
      await Promise.race([envio, new Promise((ok) => setTimeout(ok, 3000))]);
      try {
        localStorage.setItem(CHAVE_NOME, nome.trim());
      } catch {
        /* sem armazenamento: segue */
      }
      cutucarMotor();
      setAviso('Enviado para a P/3.');
    } catch {
      setErro('Não foi possível enviar. Verifique a conexão e tente de novo.');
    }
    setOcupado('');
  }

  return (
    <article className="cartao grupo" aria-label={`ICC ${icc.numero}`}>
      <div className="item-topo">
        <h3>ICC {icc.numero}</h3>
        <span className={`selo selo-doc-${s}`}>{ROTULO[s]}</span>
      </div>
      <p className="pendente-detalhe">Prazo {formatarData(icc.prazo)}</p>
      <div className="acoes-linha">
        <button className="botao secundario" type="button" disabled={ocupado === 'baixando'} onClick={baixar}>
          {ocupado === 'baixando' ? 'Baixando…' : '📄 Baixar a ordem (PDF)'}
        </button>
      </div>
      <p className="legenda-grupo">PM que participaram da ICC</p>
      <div className="grade-3">
        {GRADUACOES_ICC.map((g) => (
          <Campo key={g.id} rotulo={g.rotulo} obrigatorio erro={erros[g.id]}>
            <input inputMode="numeric" value={rascunho[g.id] ?? ''} onChange={(e) => setRascunho({ ...rascunho, [g.id]: e.target.value })} />
          </Campo>
        ))}
      </div>
      <p className="pendente-detalhe">Total: {totalIcc(valores)}</p>
      <Campo rotulo="Preenchido por" obrigatorio erro={erros.__nome}>
        <input value={nome} readOnly={Boolean(quemSou())} placeholder="Posto/graduação e nome" autoComplete="name" onChange={(e) => setNome(e.target.value)} />
      </Campo>
      {resposta?.erro && !resposta.gravado && (
        <p className="mensagem erro" role="alert">
          A P/3 foi avisada: {resposta.erro}
        </p>
      )}
      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="mensagem aviso" role="status">
          {aviso}
        </p>
      )}
      <div className="acoes-linha">
        <button className="botao destaque" type="button" disabled={ocupado === 'enviando'} onClick={enviar}>
          {ocupado === 'enviando' ? 'Enviando…' : resposta ? 'Atualizar envio' : 'Enviar'}
        </button>
      </div>
    </article>
  );
}
