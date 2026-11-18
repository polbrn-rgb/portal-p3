import { useEffect, useState, type ReactNode } from 'react';
import { numeroExibido } from '../../domain/numeracao';
import { observarEapDaUnidade } from '../../data/eap';
import { observarSolicitacoesDaUnidade } from '../../data/efetivo';
import { marcarEmAndamento, marcarVisualizado, observarDaUnidade, responder } from '../../data/encaminhamentos';
import { formatarData, hojeISO } from '../../domain/datas';
import type { RespostaEap } from '../../domain/eap';
import type { SolicitacaoEfetivo } from '../../domain/efetivo';
import {
  abaDoEncaminhamento,
  abaDoPedido,
  encAtrasado,
  ROTULO_ENC,
  saiDaTelaDaCia,
  type AbaUnidade,
  type Encaminhamento,
} from '../../domain/encaminhamento';
import type { UnidadeId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { irPara, useHash } from '../../lib/navegacao';
import { useAoVivo } from '../../lib/useAoVivo';
import { BaixarPdf } from '../BaixarPdf';
import { Campo } from '../Campo';
import { MenuLateral } from '../MenuLateral';
import { observarEnviosDaUnidade } from '../../data/documentosMensais';
import { DOCUMENTOS, mesReferencia, type EnvioMensal } from '../../domain/documentosMensais';
import { ConfirmarDocumentoDireto, contarPendentesDocs, documentosDaUnidade, FormDocumentoCia, ListaDocumentosCia } from './DocumentosCia';
import { EapsDaCia, ResponderEap } from './EapCia';
import { observarIccsAbertas, observarRespostasIccDaUnidade } from '../../data/icc';
import type { Icc, RespostaIcc } from '../../domain/icc';
import { AperfeicoamentoCia, contarPendentesIcc } from './IccCia';
import { quemSou } from '../../lib/quemSou';
import { PreencherEfetivo, SolicitacoesEfetivo } from './EfetivoCia';
import { observarRacMesesAbertos, observarRacsDaUnidade } from '../../data/rac';
import type { RacMes, RacSalvo } from '../../domain/rac';
import { contarPendentesRac, FormRacCia, ListaRacCia } from './RacCia';

const ABAS: { id: AbaUnidade; rotulo: string }[] = [
  { id: 'pendentes', rotulo: 'Pendentes' },
  { id: 'respondidas', rotulo: 'Respondidas' },
  { id: 'finalizadas', rotulo: 'Finalizadas' },
];

type AbaCia = AbaUnidade | 'documentos' | 'aperfeicoamento' | 'rac';

function abaDaRota(hash: string): AbaCia | undefined {
  if (hash.startsWith('#/documentos')) return 'documentos';
  if (hash.startsWith('#/aperfeicoamento')) return 'aperfeicoamento';
  if (hash === '#/rac' || hash.startsWith('#/rac/')) return 'rac';
  if (hash === '#/respondidas') return 'respondidas';
  if (hash === '#/finalizadas') return 'finalizadas';
  if (/^#\/(enc|efetivo|eap)\//.test(hash)) return undefined;
  return 'pendentes';
}

const CHAVE_NOME = 'portalp3.respondidoPor';

/** Tela das Cias e da Força Tática: menu (lateral no computador, ☰ no celular) e o conteúdo ao lado. */
export function PainelUnidade({ unidade, sigla }: { unidade: UnidadeId; sigla: string }) {
  const hash = useHash();
  const encs = useAoVivo<Encaminhamento[]>(
    (ok, erro) => observarDaUnidade(db, unidade, ok, erro),
    [unidade],
    'Não foi possível carregar as demandas.',
  );
  const solicitacoes = useAoVivo<SolicitacaoEfetivo[]>(
    (ok, erro) => observarSolicitacoesDaUnidade(db, unidade, ok, erro),
    [unidade],
  );
  // Respondidas/finalizadas com o prazo vencido há um dia saem da tela (continuam no Numerador da P/3).
  const hoje = hojeISO();
  const lista = (encs.valor ?? []).filter((e) => !saiDaTelaDaCia(e, hoje));
  const eaps = useAoVivo<RespostaEap[]>((ok, erro) => observarEapDaUnidade(db, unidade, ok, erro), [unidade]);
  const aberto = /^#\/enc\/(.+)$/.exec(hash)?.[1];
  const efetivo = /^#\/efetivo\/(.+)$/.exec(hash)?.[1];
  const eapAberto = /^#\/eap\/(.+)$/.exec(hash)?.[1];
  const encAberto = aberto ? lista.find((e) => e.id === aberto) : undefined;
  const ativa: AbaCia | undefined = encAberto ? (abaDoEncaminhamento(encAberto.status) ?? undefined) : abaDaRota(hash);
  const mesRef = mesReferencia();
  const envios = useAoVivo<EnvioMensal[]>((ok, erro) => observarEnviosDaUnidade(db, unidade, mesRef, ok, erro), [unidade, mesRef]);
  const temDocs = documentosDaUnidade(unidade, mesRef).length > 0;
  const iccs = useAoVivo<Icc[]>((ok, erro) => observarIccsAbertas(db, ok, erro), []);
  const respostasIcc = useAoVivo<RespostaIcc[]>((ok, erro) => observarRespostasIccDaUnidade(db, unidade, ok, erro), [unidade]);
  const temIcc = (iccs.valor ?? []).length > 0;
  const racMeses = useAoVivo<RacMes[]>((ok, erro) => observarRacMesesAbertos(db, ok, erro), []);
  const racs = useAoVivo<RacSalvo[]>((ok, erro) => observarRacsDaUnidade(db, unidade, ok, erro), [unidade]);
  const temRac = (racMeses.valor ?? []).length > 0;
  const racAberto = /^#\/rac\/(\d{4}-\d{2})$/.exec(hash)?.[1];
  const itens = [
    ...ABAS.map((a) => ({
      id: a.id as AbaCia,
      href: `#/${a.id}`,
      rotulo: a.rotulo,
      contador:
        lista.filter((e) => abaDoEncaminhamento(e.status) === a.id).length +
        (a.id === 'pendentes'
          ? (solicitacoes.valor ?? []).filter((s) => s.status !== 'respondida').length + (eaps.valor ?? []).filter((r) => r.status !== 'enviada').length
          : 0),
    })),
    ...(temDocs
      ? [{ id: 'documentos' as AbaCia, href: '#/documentos', rotulo: 'Documentos Mensais', contador: contarPendentesDocs(unidade, mesRef, envios.valor ?? []) }]
      : []),
    ...(temIcc || ativa === 'aperfeicoamento'
      ? [
          {
            id: 'aperfeicoamento' as AbaCia,
            href: '#/aperfeicoamento',
            rotulo: 'Aperfeiçoamento',
            contador: contarPendentesIcc(iccs.valor ?? [], respostasIcc.valor ?? []),
          },
        ]
      : []),
    ...(temRac || ativa === 'rac'
      ? [{ id: 'rac' as AbaCia, href: '#/rac', rotulo: 'RAC', contador: contarPendentesRac(racMeses.valor ?? [], racs.valor ?? []) }]
      : []),
  ];
  const docAberto = /^#\/documentos\/([\w-]+)$/.exec(hash)?.[1];

  return (
    <div className="layout-p3">
      <MenuLateral id="menu-unidade" rotulo="Seções da Cia" titulo={sigla} itens={itens} ativa={ativa} />
      <div className="conteudo-p3">{conteudo()}</div>
    </div>
  );

  function conteudo(): ReactNode {
    if (ativa === 'rac') {
      if (racMeses.carregando || racs.carregando) return <p className="carregando">Carregando…</p>;
      const m = racAberto ? racMeses.valor?.find((x) => x.mes === racAberto) : undefined;
      if (racAberto && !m)
        return (
          <section className="painel">
            <p className="mensagem erro" role="alert">
              RAC não encontrado ou encerrado pela P/3.
            </p>
            <a href="#/rac">Voltar</a>
          </section>
        );
      if (m) return <FormRacCia key={m.mes} unidade={unidade} mes={m} racs={racs.valor ?? []} />;
      return <ListaRacCia meses={racMeses.valor ?? []} racs={racs.valor ?? []} carregando={false} />;
    }
    if (docAberto) {
      const d = DOCUMENTOS.find((x) => x.id === docAberto);
      if (!d) return <p className="mensagem erro">Documento não encontrado.</p>;
      if (envios.carregando) return <p className="carregando">Carregando…</p>;
      const envio = envios.valor?.find((e) => e.docId === d.id);
      if (d.direto) return <ConfirmarDocumentoDireto key={d.id} documento={d} unidade={unidade} mesRef={mesRef} envio={envio} />;
      return <FormDocumentoCia key={d.id} documento={d} unidade={unidade} mesRef={mesRef} envio={envio} />;
    }
    if (ativa === 'aperfeicoamento') {
      return (
        <AperfeicoamentoCia unidade={unidade} iccs={iccs.valor ?? []} respostas={respostasIcc.valor ?? []} carregando={iccs.carregando || respostasIcc.carregando} />
      );
    }
    if (ativa === 'documentos') {
      return <ListaDocumentosCia unidade={unidade} mesRef={mesRef} envios={envios.valor ?? []} carregando={envios.carregando} />;
    }
    if (eapAberto) {
      const r = eaps.valor?.find((x) => x.id === eapAberto);
      if (r) return <ResponderEap key={r.id} r={r} />;
      if (eaps.carregando) return <p className="carregando">Carregando…</p>;
      return (
        <section className="painel">
          <p className="mensagem erro" role="alert">
            EAP não encontrado.
          </p>
          <a href="#/">Voltar</a>
        </section>
      );
    }

    if (efetivo) {
      const s = solicitacoes.valor?.find((x) => x.id === efetivo);
      if (s) return <PreencherEfetivo key={s.id} s={s} />;
      if (solicitacoes.carregando) return <p className="carregando">Carregando…</p>;
      return (
        <section className="painel">
          <p className="mensagem erro" role="alert">
            Solicitação não encontrada.
          </p>
          <a href="#/">Voltar</a>
        </section>
      );
    }

    if (aberto) {
      if (encAberto) return <DetalheEncaminhamento key={encAberto.id} enc={encAberto} />;
      if (encs.carregando) return <p className="carregando">Carregando…</p>;
      return (
        <section className="painel">
          <p className="mensagem erro" role="alert">
            Demanda não encontrada.
          </p>
          <a href="#/">Voltar</a>
        </section>
      );
    }
    return (
      <ListaUnidade
        sigla={sigla}
        aba={ativa ?? 'pendentes'}
        lista={lista}
        carregando={encs.carregando}
        erro={encs.erro}
        solicitacoes={solicitacoes.valor ?? []}
        eaps={eaps.valor ?? []}
      />
    );
  }
}

function ListaUnidade(p: {
  sigla: string;
  aba: AbaUnidade;
  lista: Encaminhamento[];
  carregando: boolean;
  erro: string;
  solicitacoes: SolicitacaoEfetivo[];
  eaps: RespostaEap[];
}) {
  const hoje = hojeISO();
  const visiveis = p.lista.filter((e) => abaDoEncaminhamento(e.status) === p.aba);
  // Efetivo e EAP também seguem a aba: sem resposta em Pendentes, respondidos em Respondidas.
  const solicitacoes = p.solicitacoes.filter((s) => abaDoPedido(s.status === 'respondida') === p.aba);
  const eaps = p.eaps.filter((r) => abaDoPedido(r.status === 'enviada') === p.aba);
  const rotulo = ABAS.find((a) => a.id === p.aba)?.rotulo;

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>{p.sigla}</h2>
      </div>
      <EapsDaCia lista={eaps} />
      <SolicitacoesEfetivo lista={solicitacoes} />
      <h3 className="titulo-aba-cia">
        {rotulo} ({visiveis.length})
      </h3>

      {p.erro && (
        <p className="mensagem erro" role="alert">
          {p.erro}
        </p>
      )}
      {p.carregando && <p className="carregando">Carregando…</p>}
      {!p.carregando && !p.erro && visiveis.length === 0 && <p className="vazio">Nada por aqui.</p>}

      <ul className="lista">
        {visiveis.map((e) => {
          const atrasado = encAtrasado(e, hoje);
          return (
            <li key={e.id}>
              <a className={`item-demanda item-cia ${atrasado ? 'borda-atrasado' : `borda-enc-${e.status}`}`} href={`#/enc/${e.id}`}>
                <span className="item-topo">
                  <strong className="item-num">{numeroExibido(e)}</strong>
                  <span className={`selo ${atrasado ? 'selo-atrasado' : `enc-${e.status}`}`}>
                    {atrasado ? 'Atrasado' : ROTULO_ENC[e.status]}
                  </span>
                </span>
                <span className="item-saida">{e.saida}</span>
                <span className="item-info">
                  <span className="item-cat">{e.categoria}</span>
                  <span className="item-prazo">{e.prazoCia ? `Prazo ${formatarData(e.prazoCia)}` : ''}</span>
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

function DetalheEncaminhamento({ enc }: { enc: Encaminhamento }) {
  const [resposta, setResposta] = useState(enc.resposta);
  const [nome, setNome] = useState(quemSou() ?? (enc.respondidoPor || lerNome()));
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [faltando, setFaltando] = useState<{ resposta?: string; nome?: string }>({});
  const finalizado = enc.status === 'aceito' || enc.status === 'cancelado';

  // Abrir a demanda já avisa a P/3 que a Cia viu.
  useEffect(() => {
    marcarVisualizado(db, enc).catch(() => undefined);
    // só na primeira abertura
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function executar(acao: () => Promise<void>, voltar: boolean) {
    setOcupado(true);
    setErro('');
    try {
      await acao();
      if (voltar) irPara('#/');
    } catch {
      setErro('Não foi possível gravar. Verifique a conexão e tente de novo.');
    }
    setOcupado(false);
  }

  function enviar() {
    const f = {
      ...(!resposta.trim() ? { resposta: 'Escreva a resposta.' } : {}),
      ...(!nome.trim() ? { nome: 'Informe quem respondeu (posto/graduação e nome).' } : {}),
    };
    setFaltando(f);
    if (f.resposta || f.nome) return;
    try {
      localStorage.setItem(CHAVE_NOME, nome.trim());
    } catch {
      /* sem armazenamento: segue */
    }
    void executar(() => responder(db, enc, resposta, nome), true);
  }

  return (
    <section className="painel painel-estreito">
      <div className="painel-cabecalho">
        <h2>Demanda {enc.numeroDocumento || `nº ${enc.numero}`}</h2>
        <span className={`selo enc-${enc.status}`}>{ROTULO_ENC[enc.status]}</span>
      </div>

      <div className="cartao grupo">
        <p className="item-saida">{enc.saida}</p>
        <dl className="dados">
          <dt>Categoria</dt>
          <dd>{enc.categoria || '—'}</dd>
          <dt>Prazo</dt>
          <dd>{formatarData(enc.prazoCia) || '—'}</dd>
          {enc.tipoSaida && (
            <>
              <dt>Tipo de saída</dt>
              <dd>{enc.tipoSaida}</dd>
            </>
          )}
          {enc.numeroOrigem && (
            <>
              <dt>{enc.origem === 'SEI' ? 'Processo SEI' : 'Nº da origem'}</dt>
              <dd>{enc.numeroOrigem}</dd>
            </>
          )}
          {enc.observacao && (
            <>
              <dt>Observação</dt>
              <dd>{enc.observacao}</dd>
            </>
          )}
        </dl>
        {enc.arquivoId && <BaixarPdf id={enc.arquivoId} nome={enc.arquivoNome || 'documento.pdf'} />}
      </div>

      {enc.status === 'devolvido' && enc.motivoDevolucao && (
        <p className="mensagem aviso-devolvido" role="status">
          A P/3 devolveu a resposta: {enc.motivoDevolucao}
        </p>
      )}

      <div className="cartao grupo">
        <Campo rotulo="Resposta" erro={faltando.resposta && !resposta.trim() ? faltando.resposta : undefined} obrigatorio={!finalizado}>
          <textarea rows={5} value={resposta} disabled={finalizado} onChange={(e) => setResposta(e.target.value)} />
        </Campo>
        <Campo rotulo="Respondido por" erro={faltando.nome && !nome.trim() ? faltando.nome : undefined} obrigatorio={!finalizado}>
          <input
            value={finalizado ? enc.respondidoPor || nome : nome}
            disabled={finalizado}
            readOnly={Boolean(quemSou())}
            placeholder="Posto/graduação e nome"
            autoComplete="name"
            onChange={(e) => setNome(e.target.value)}
          />
        </Campo>
      </div>

      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}

      <div className="barra-acoes">
        <a className="botao secundario" href="#/">
          Voltar
        </a>
        {!finalizado && enc.status !== 'em_andamento' && enc.status !== 'respondido' && (
          <button
            className="botao secundario"
            type="button"
            disabled={ocupado}
            onClick={() => executar(() => marcarEmAndamento(db, enc), false)}
          >
            Em andamento
          </button>
        )}
        {!finalizado && (
          <button className="botao destaque" type="button" disabled={ocupado} onClick={enviar}>
            {enc.status === 'respondido' ? 'Atualizar resposta' : 'Enviar resposta'}
          </button>
        )}
      </div>
    </section>
  );
}
