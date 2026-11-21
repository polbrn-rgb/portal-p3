import { useEffect, useState } from 'react';
import { marcarFeito, observarEnviosDoMes, observarEstados, pedirArquivamento, publicarConfig } from '../../data/documentosMensais';
import { observarProducaoDoMes } from '../../data/producao';
import { divergencias, situacaoProducaoMes, temIntegracao, type SituacaoProducaoMes } from '../../domain/integracao';
import type { Producao } from '../../domain/producao';
import { rotuloMes } from '../../domain/controle';
import { formatarData, hojeISO } from '../../domain/datas';
import {
  ciasDoDocumento,
  documentosDoMes,
  mesReferencia,
  preenchidoPeloPortal,
  prazoDoDocumento,
  situacaoDoDocumento,
  urlPlanilha,
  zeraAoArquivar,
  type DocumentoMensal,
  type EnvioMensal,
  type EstadoDocumento,
} from '../../domain/documentosMensais';
import { UNIDADES, type UnidadeId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { cutucarMotor } from '../../lib/motor';
import { useAoVivo } from '../../lib/useAoVivo';
import { Campo } from '../Campo';

const SIGLA = Object.fromEntries(UNIDADES.map((u) => [u.id, u.id === 'ft' ? 'FT' : u.sigla.replace(' CIA', '')]));
const ICONE = { gravado: '✅', enviado: '⏳', erro: '❌', pendente: '·', atrasado: '🔴' } as const;

/** Operações → Documentos Mensais (P/3): prazos por dia útil, quem já enviou e o arquivo do mês. */
export function DocumentosMensais() {
  const [mesRef, setMesRef] = useState(mesReferencia());
  const envios = useAoVivo<EnvioMensal[]>((ok, erro) => observarEnviosDoMes(db, mesRef, ok, erro), [mesRef], 'Não foi possível carregar os envios.');
  const estados = useAoVivo<Record<string, EstadoDocumento>>((ok, erro) => observarEstados(db, ok, erro), []);
  const [aviso, setAviso] = useState('');
  // Produção dos pelotões do mês: sem ela completa, os documentos integrados não são pré-preenchidos.
  const producao = useAoVivo<Producao[]>((ok, erro) => observarProducaoDoMes(db, mesRef, ok, erro), [mesRef], 'Não foi possível conferir a produção dos pelotões.');
  const hoje = hojeISO();
  const situacaoProd: Partial<Record<UnidadeId, SituacaoProducaoMes>> = producao.valor
    ? Object.fromEntries(UNIDADES.map((u) => [u.id, situacaoProducaoMes(producao.valor!.filter((l) => l.unidadeId === u.id), mesRef, u.id, hoje)]))
    : {};
  const incompletas = UNIDADES.filter((u) => situacaoProd[u.id] && !situacaoProd[u.id]!.completa);

  // O motor lê daqui as células de cada Cia: publica de novo quando a configuração muda.
  useEffect(() => {
    publicarConfig(db).catch(() => setAviso('Não foi possível publicar a configuração para o motor. Abra a aba de novo.'));
  }, []);

  const docs = documentosDoMes(mesRef);
  const dias = [...new Set(docs.map((d) => d.diaUtil))].sort((a, b) => a - b);

  async function arquivar(d: DocumentoMensal) {
    try {
      await pedirArquivamento(db, d.id, mesRef);
      cutucarMotor();
      setAviso(`Pedido enviado: o motor guarda a cópia de ${rotuloMes(mesRef)}${zeraAoArquivar(d) ? ' e zera a planilha' : ''}.`);
    } catch {
      setAviso('Não foi possível pedir. Verifique a conexão e tente de novo.');
    }
  }

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Documentos Mensais</h2>
      </div>
      <p className="ajuda-pendentes">
        As Cias preenchem pelo portal e o motor grava na planilha. Depois de enviar ao CPA, use “Arquivar e zerar”: a cópia
        do mês vai para a pasta de arquivo e a planilha fica pronta para o próximo mês.
      </p>
      <div className="cartao grupo">
        <Campo rotulo="Dados do mês" className="campo-mes-lista">
          <input type="month" value={mesRef} onChange={(e) => e.target.value && setMesRef(e.target.value)} />
        </Campo>
      </div>
      {aviso && (
        <p className="mensagem aviso" role="status">
          {aviso}
        </p>
      )}
      {producao.erro && (
        <p className="mensagem erro" role="alert">
          {producao.erro}
        </p>
      )}
      {incompletas.length > 0 && (
        <div className="mensagem erro" role="alert" aria-label="Produção incompleta">
          <p>
            <strong>Produção dos pelotões de {rotuloMes(mesRef)} incompleta.</strong> Os documentos com 🔗 dessas Cias não vêm pré-preenchidos: a Cia
            completa a produção ou preenche à mão antes de enviar.
          </p>
          <ul>
            {incompletas.map((u) => {
              const sp = situacaoProd[u.id]!;
              return (
                <li key={u.id}>
                  <strong>{SIGLA[u.id]}</strong>:{' '}
                  {sp.turnosFaltando
                    ? `${sp.turnosFaltando} turno(s) sem lançamento — ${sp.pendencias
                        .map((x) => `${formatarData(x.data).slice(0, 5)} ${[x.faltaDia && 'dia', x.faltaNoite && 'noite'].filter(Boolean).join('/')}`)
                        .join(', ')}`
                    : 'o mês ainda não terminou'}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {envios.erro && (
        <p className="mensagem erro" role="alert">
          {envios.erro}
        </p>
      )}

      {dias.map((dia) => (
        <section key={dia} className="grupo-mes-controle" aria-label={`${dia}º dia útil`}>
          <h3 className="titulo-aba-cia">
            {dia}º dia útil · {formatarData(prazoDoDocumento(docs.find((d) => d.diaUtil === dia)!, mesRef))}
          </h3>
          <ul className="lista lista-pendentes">
            {docs
              .filter((d) => d.diaUtil === dia)
              .map((d) => (
                <li key={d.id}>
                  <CartaoDocumento
                    documento={d}
                    mesRef={mesRef}
                    envios={(envios.valor ?? []).filter((e) => e.docId === d.id)}
                    estado={estados.valor?.[d.id]}
                    situacaoProd={situacaoProd}
                    aoArquivar={() => arquivar(d)}
                  />
                </li>
              ))}
          </ul>
        </section>
      ))}
    </section>
  );
}

function CartaoDocumento(p: {
  documento: DocumentoMensal;
  mesRef: string;
  envios: EnvioMensal[];
  estado?: EstadoDocumento;
  situacaoProd: Partial<Record<UnidadeId, SituacaoProducaoMes>>;
  aoArquivar: () => void;
}) {
  const d = p.documento;
  const prazo = prazoDoDocumento(d, p.mesRef);
  const portal = preenchidoPeloPortal(d);
  const comCias = portal || !!d.direto; // as Cias enviam ou confirmam pelo portal
  const zera = zeraAoArquivar(d);
  const cias = ciasDoDocumento(d);
  const situacoes = cias.map((u) => ({ u, s: situacaoDoDocumento(d, p.envios.find((e) => e.unidadeId === u), prazo) }));
  const prontas = situacoes.filter((x) => x.s === 'gravado').length;
  const arquivo = p.estado?.arquivados?.[p.mesRef];
  const pedido = p.estado?.pedidoArquivar === p.mesRef;
  const feito = comCias ? cias.length > 0 && prontas === cias.length : !!p.estado?.feitos?.[p.mesRef];
  const atrasado = !feito && hojeISO() > prazo;
  const erros = p.envios.filter((e) => e.erro && !e.gravado);
  const integrado = temIntegracao(d.id);
  const semProducao = (u: UnidadeId) => integrado && p.situacaoProd[u] !== undefined && !p.situacaoProd[u]!.completa;
  const nomeCampo = (id: string) => d.campos?.find((c) => c.id === id)?.rotulo ?? id;
  const alterados = p.envios
    .map((e) => ({ e, campos: divergencias(e.daProducao, e.valores) }))
    .filter((x) => x.campos.length);
  const [confirmando, setConfirmando] = useState(false);

  return (
    <article className={`item-pendente ${feito ? 'borda-doc-gravado' : atrasado ? 'borda-doc-atrasado' : ''}`} aria-label={d.nome}>
      <span className="item-topo">
        <strong className="pendente-assunto">{d.nome}</strong>
        <span className="pendente-detalhe">
          {d.direto ? 'Direto na planilha · ' : ''}
          {comCias ? `${prontas}/${cias.length} Cias` : 'Direto na planilha'}
        </span>
      </span>
      {comCias ? (
        <ul className="chips-cias" aria-label={`Envios — ${d.nome}`}>
          {situacoes.map(({ u, s }) => (
            <li key={u} className={`chip-cia chip-${s}`} title={semProducao(u) && s !== 'gravado' ? 'produção incompleta' : s}>
              {semProducao(u) && s !== 'gravado' ? '⚠️' : ICONE[s]} {SIGLA[u]}
            </li>
          ))}
        </ul>
      ) : (
        <label className="campo-check-linha">
          <input type="checkbox" checked={feito} onChange={(e) => void marcarFeito(db, d.id, p.mesRef, e.target.checked)} /> Feito em{' '}
          {rotuloMes(p.mesRef)}
        </label>
      )}
      {integrado && <p className="item-info">🔗 Pré-preenchido com a produção dos pelotões; a Cia confere e envia.</p>}
      {alterados.map(({ e, campos }) => (
        <p key={e.id} className="mensagem atencao">
          {SIGLA[e.unidadeId]} corrigiu o que veio da produção:{' '}
          {campos.map((c) => `${nomeCampo(c)} (produção ${e.daProducao![c]} → enviado ${e.valores[c]})`).join('; ')}
        </p>
      ))}
      {erros.map((e) => (
        <p key={e.id} className="mensagem erro" role="alert">
          {SIGLA[e.unidadeId]}: {e.erro}
        </p>
      ))}
      {p.estado?.erro && <p className="mensagem erro">{p.estado.erro}</p>}
      <div className="acoes-linha acoes-quebra">
        <a className="botao secundario" href={urlPlanilha(d)} target="_blank" rel="noreferrer">
          Abrir planilha
        </a>
        {arquivo ? (
          <a className="botao secundario" href={arquivo} target="_blank" rel="noreferrer">
            📦 Cópia de {rotuloMes(p.mesRef)}
          </a>
        ) : (
          <button className="botao secundario" type="button" disabled={pedido} onClick={() => setConfirmando(true)}>
            {pedido ? '⏳ Arquivando…' : zera ? '📦 Arquivar e zerar' : '📦 Arquivar cópia'}
          </button>
        )}
      </div>
      {confirmando && (
        <div className="confirmar-linha" role="alertdialog" aria-label={`Confirmar arquivo — ${d.nome}`}>
          <p>
            Guardar a cópia de {rotuloMes(p.mesRef)} na pasta de arquivo
            {zera ? ' e zerar a planilha para o próximo mês' : ''}?
          </p>
          <div className="acoes-linha">
            <button className="botao secundario" type="button" onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
            <button
              className="botao perigo"
              type="button"
              onClick={() => {
                setConfirmando(false);
                p.aoArquivar();
              }}
            >
              Sim, arquivar
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
