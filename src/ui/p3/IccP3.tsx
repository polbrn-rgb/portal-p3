import { useState } from 'react';
import { salvarNoAparelho } from '../../data/arquivos';
import { alterarPrazoIcc, criarIcc, encerrarIcc, observarRespostasDaIcc } from '../../data/icc';
import { formatarData, hojeISO } from '../../domain/datas';
import {
  GRADUACOES_ICC,
  prazoPadraoIcc,
  situacaoRespostaIcc,
  totalIcc,
  validarIcc,
  type ErrosIcc,
  type Icc,
  type RespostaIcc,
} from '../../domain/icc';
import { UNIDADES } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { cutucarMotor } from '../../lib/motor';
import { irPara } from '../../lib/navegacao';
import { useAoVivo } from '../../lib/useAoVivo';
import { Campo } from '../Campo';

const ICONE = { gravado: '✅', enviado: '⏳', erro: '❌', pendente: '·', atrasado: '🔴' } as const;
const CIAS = UNIDADES.filter((u) => ['1cia', '2cia', '3cia', '4cia', '5cia', '6cia', 'ft'].includes(u.id));
const sigla = (id: string) => (id === 'ft' ? 'FT' : (UNIDADES.find((u) => u.id === id)?.sigla ?? id).replace(' CIA', ''));

export function situacaoPlanilhaIcc(i: Icc): string {
  if (i.planilha?.status === 'pronta') return 'planilha pronta';
  if (i.planilha?.status === 'erro') return 'erro ao criar a planilha';
  return 'criando a planilha…';
}

export function ListaIccP3({ iccs }: { iccs: Icc[] }) {
  return (
    <>
      <div className="painel-cabecalho">
        <h3 className="titulo-secao">ICC</h3>
        <a className="botao destaque" href="#/aperfeicoamento/icc/nova">
          + Nova ICC
        </a>
      </div>
      {!iccs.length && <p className="vazio">Nenhuma ICC ainda.</p>}
      <ul className="lista">
        {iccs.map((i) => (
          <li key={i.id}>
            <a className="item-pendente link-cartao" href={`#/aperfeicoamento/icc/${i.id}`}>
              <span className="item-topo">
                <strong>ICC {i.numero}</strong>
                <span className={`selo ${i.status === 'aberta' ? 'situacao-aguardando' : 'situacao-respondida'}`}>
                  {i.status === 'aberta' ? 'Aberta' : 'Encerrada'}
                </span>
              </span>
              <span className="pendente-detalhe">
                Prazo das Cias {formatarData(i.prazo)} · {situacaoPlanilhaIcc(i)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

export function FormIcc() {
  const [numero, setNumero] = useState('');
  const [prazo, setPrazo] = useState(prazoPadraoIcc());
  const [pdf, setPdf] = useState<File | null>(null);
  const [erros, setErros] = useState<ErrosIcc>({});
  const [erro, setErro] = useState('');
  const [progresso, setProgresso] = useState<number | null>(null);

  async function salvar() {
    const v = validarIcc({ numero, prazo }, pdf);
    setErros(v);
    setErro('');
    if (Object.keys(v).length) return;
    setProgresso(0);
    try {
      const id = await criarIcc(db, { numero, prazo }, pdf!, setProgresso);
      cutucarMotor();
      irPara(`#/aperfeicoamento/icc/${id}`);
    } catch {
      setErro('Não foi possível enviar. Verifique a conexão e tente de novo.');
      setProgresso(null);
    }
  }

  return (
    <section className="painel painel-estreito">
      <div className="painel-cabecalho">
        <h2>Nova ICC</h2>
      </div>
      <p className="ajuda-pendentes">As Cias baixam a ordem e informam quantos PM participaram. O motor cria a planilha “ICC nº” (cópia zerada da anterior).</p>
      <div className="cartao grupo">
        <div className="grade-2">
          <Campo rotulo="Nº da ICC" obrigatorio erro={erros.numero}>
            <input inputMode="numeric" value={numero} placeholder="427" onChange={(e) => setNumero(e.target.value)} />
          </Campo>
          <Campo rotulo="Prazo das Cias" obrigatorio erro={erros.prazo}>
            <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </Campo>
        </div>
        <Campo rotulo="Anexo da ICC (PDF, até 10 MB)" obrigatorio erro={erros.arquivo}>
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
        </Campo>
      </div>
      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}
      <div className="barra-acoes">
        <a className="botao secundario" href="#/aperfeicoamento">
          Cancelar
        </a>
        <button className="botao destaque" type="button" disabled={progresso !== null} onClick={salvar}>
          {progresso !== null ? `Enviando o PDF… ${Math.round(progresso * 100)}%` : 'Publicar ICC'}
        </button>
      </div>
    </section>
  );
}

export function DetalheIcc({ icc }: { icc: Icc }) {
  const respostas = useAoVivo<RespostaIcc[]>((ok, e) => observarRespostasDaIcc(db, icc.id, ok, e), [icc.id], 'Não foi possível carregar as respostas.');
  const [baixando, setBaixando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const lista = respostas.valor ?? [];
  const soma = (g: (typeof GRADUACOES_ICC)[number]['id']) => lista.reduce((s, r) => s + r[g], 0);

  async function baixar() {
    setBaixando(true);
    try {
      await salvarNoAparelho(db, icc.arquivo.id);
    } catch {
      setAviso('Não foi possível baixar o PDF.');
    }
    setBaixando(false);
  }

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>ICC {icc.numero}</h2>
        <a className="botao secundario" href="#/aperfeicoamento">
          Voltar
        </a>
      </div>
      <div className="cartao grupo">
        <p className="pendente-detalhe">
          {icc.status === 'aberta' ? 'Aberta' : 'Encerrada'} · {situacaoPlanilhaIcc(icc)}
          {icc.planilha?.erro ? ` (${icc.planilha.erro})` : ''}
        </p>
        <div className="acoes-linha acoes-quebra">
          <button className="botao secundario" type="button" disabled={baixando} onClick={baixar}>
            {baixando ? 'Baixando…' : `📄 ${icc.arquivo.nome}`}
          </button>
          {icc.planilha?.url && (
            <a className="botao secundario" href={icc.planilha.url} target="_blank" rel="noreferrer">
              Abrir planilha
            </a>
          )}
        </div>
        {icc.status === 'aberta' && (
          <Campo rotulo="Prazo das Cias" className="campo-mes-lista">
            <input type="date" value={icc.prazo} onChange={(e) => e.target.value && void alterarPrazoIcc(db, icc.id, e.target.value)} />
          </Campo>
        )}
      </div>
      {aviso && <p className="mensagem erro">{aviso}</p>}

      <div className="tabela-rolagem">
        <table className="tabela-icc" aria-label={`Respostas da ICC ${icc.numero}`}>
          <thead>
            <tr>
              <th>Cia</th>
              {GRADUACOES_ICC.map((g) => (
                <th key={g.id}>{g.rotulo}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {CIAS.map((u) => {
              const r = lista.find((x) => x.unidadeId === u.id);
              const s = situacaoRespostaIcc(r, icc.prazo);
              return (
                <tr key={u.id} className={`linha-${s}`}>
                  <th scope="row">
                    {ICONE[s]} {sigla(u.id)}
                  </th>
                  {GRADUACOES_ICC.map((g) => (
                    <td key={g.id}>{r ? r[g.id] : '—'}</td>
                  ))}
                  <td>{r ? totalIcc(r) : '—'}</td>
                </tr>
              );
            })}
            <tr className="linha-total">
              <th scope="row">Total</th>
              {GRADUACOES_ICC.map((g) => (
                <td key={g.id}>{soma(g.id)}</td>
              ))}
              <td>{lista.reduce((s, r) => s + totalIcc(r), 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {lista
        .filter((r) => r.erro && !r.gravado)
        .map((r) => (
          <p key={r.id} className="mensagem erro">
            {sigla(r.unidadeId)}: {r.erro}
          </p>
        ))}
      <p className="pendente-detalhe">✅ na planilha · ⏳ enviado · 🔴 atrasado (prazo {formatarData(icc.prazo)}). O EM é preenchido direto na planilha.</p>

      {icc.status === 'aberta' &&
        (confirmando ? (
          <div className="confirmar-linha" role="alertdialog" aria-label="Confirmar encerramento">
            <p>Encerrar a ICC {icc.numero}? Ela some da tela das Cias (os dados continuam na planilha).</p>
            <div className="acoes-linha">
              <button className="botao secundario" type="button" onClick={() => setConfirmando(false)}>
                Cancelar
              </button>
              <button className="botao perigo" type="button" onClick={() => void encerrarIcc(db, icc.id)}>
                Sim, encerrar
              </button>
            </div>
          </div>
        ) : (
          <div className="barra-acoes">
            <button className="botao secundario" type="button" onClick={() => setConfirmando(true)}>
              Encerrar ICC
            </button>
          </div>
        ))}
      {hojeISO() > icc.prazo && icc.status === 'aberta' && <p className="pendente-detalhe">O prazo já passou.</p>}
    </section>
  );
}
