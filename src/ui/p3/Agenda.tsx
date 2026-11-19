import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent } from 'react';
import {
  atualizarCompromisso,
  buscarDemandaPorNumero,
  criarCompromisso,
  excluirCompromisso,
  excluirOcorrencia,
  observarCompromissos,
  observarCompromissosDaDemanda,
  observarDemandasDoPeriodo,
} from '../../data/agenda';
import { obterDemanda } from '../../data/demandas';
import { observarAgendaCfp, type AgendaCfp } from '../../data/missoes';
import {
  andar,
  CAMADAS,
  CAMADAS_PADRAO,
  CAMADAS_SETOR,
  CAMADAS_SETOR_PADRAO,
  compromissoVazio,
  CORES,
  dataPorExtenso,
  diaDaSemana,
  DIAS_CURTOS,
  diasDaSemana,
  gradeDoMes,
  itensDasDemandas,
  itensDoCfp,
  itensDoDia,
  itensDosPrazos,
  itensDosCompromissos,
  mesmoMes,
  minutos,
  periodoDaVisao,
  posicionarNoDia,
  quandoDoItem,
  REPETICOES,
  tituloDoPeriodo,
  validarCompromisso,
  VISOES,
  type Camada,
  type Compromisso,
  type DadosCompromisso,
  type DonoAgenda,
  type ErrosCompromisso,
  type PrazoP3,
  type ItemAgenda,
  type Visao,
} from '../../domain/agenda';
import { formatarData, hojeISO } from '../../domain/datas';
import { UNIDADES } from '../../domain/unidades';
import type { Demanda } from '../../domain/demanda';
import { db } from '../../lib/firebase';
import { irPara } from '../../lib/navegacao';
import { quemSou } from '../../lib/quemSou';
import { useAoVivo } from '../../lib/useAoVivo';
import { Campo } from '../Campo';

const HORA_PX = 48;
const HORAS = Array.from({ length: 24 }, (_, h) => h);
const MAX_CHIPS_MES = 3;

function lerGuardado<T>(chave: string, padrao: T, valido: (v: unknown) => v is T): T {
  try {
    const v = JSON.parse(localStorage.getItem(chave) ?? 'null');
    return valido(v) ? v : padrao;
  } catch {
    return padrao;
  }
}

function guardar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* navegador sem armazenamento: só não lembra a escolha */
  }
}

const ehVisao = (v: unknown): v is Visao => VISOES.some((x) => x.id === v);
const ehCamadasDe = (lista: { id: Camada }[]) => (v: unknown): v is Camada[] =>
  Array.isArray(v) && v.every((c) => lista.some((x) => x.id === c));

type Formulario = { inicial: DadosCompromisso; existente?: Compromisso };

/**
 * Agenda: visões Dia, Semana e Mês e eventos próprios. Na P/3 (dono 'p3') mostra também as datas do Numerador
 * e a agenda do CFP; nas Cias/FT e na Sala, cada uma tem a sua (independente) com os prazos dados pela P/3.
 */
export function Agenda({ rota, dono = 'p3', prazos = [] }: { rota: string; dono?: DonoAgenda; prazos?: PrazoP3[] }) {
  const ehP3 = dono === 'p3';
  const listaCamadas = ehP3 ? CAMADAS : CAMADAS_SETOR;
  const chave = ehP3 ? 'agenda' : `agenda.${dono}`;
  const [visao, setVisao] = useState<Visao>(() => lerGuardado(`${chave}.visao`, 'mes', ehVisao));
  const [camadas, setCamadas] = useState<Camada[]>(() =>
    lerGuardado(`${chave}.camadas`, ehP3 ? CAMADAS_PADRAO : CAMADAS_SETOR_PADRAO, ehCamadasDe(listaCamadas)),
  );
  const [dia, setDia] = useState(hojeISO);
  const [aberto, setAberto] = useState<ItemAgenda | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const hoje = hojeISO();

  const { de, ate } = periodoDaVisao(visao, dia);
  const comp = useAoVivo<Compromisso[]>((ok, erro) => observarCompromissos(db, de, ate, ok, erro, dono), [de, ate, dono], 'Não foi possível carregar a agenda.');
  const dem = useAoVivo<Demanda[]>(
    (ok, erro) => {
      if (ehP3) return observarDemandasDoPeriodo(db, de, ate, ok, erro);
      ok([]);
      return () => undefined;
    },
    [de, ate, ehP3],
    'Não foi possível carregar as datas do Numerador.',
  );
  const comCfp = ehP3 && camadas.includes('cfp');
  const cfp = useAoVivo<AgendaCfp | null>(
    (ok, erro) => {
      if (comCfp) return observarAgendaCfp(db, ok, erro);
      ok(null);
      return () => undefined;
    },
    [comCfp],
    'Não foi possível carregar a agenda do CFP.',
  );

  // Vindo da tela da demanda ("📅 Agendar"): abre o evento novo já ligado a ela.
  const daDemanda = ehP3 ? /^#\/agenda\/demanda\/([\w-]+)$/.exec(rota)?.[1] : undefined;
  useEffect(() => {
    if (!daDemanda) return;
    let vivo = true;
    obterDemanda(db, daDemanda).then((d) => {
      if (!vivo || !d) return;
      const data = d.prazoCia || d.prazoCPA || d.inicioBtl || hojeISO();
      setDia(data);
      setForm({
        inicial: { ...compromissoVazio(data), titulo: d.saida.slice(0, 200), demandaId: d.id, demandaNumero: d.numero, demandaTitulo: d.saida },
      });
    });
    return () => {
      vivo = false;
    };
  }, [daDemanda]);

  const itens = useMemo(() => {
    const todos = [
      ...itensDosCompromissos(comp.valor ?? [], de, ate),
      ...itensDasDemandas(dem.valor ?? [], de, ate),
      ...itensDoCfp(cfp.valor?.eventos ?? [], de, ate),
      ...(ehP3 ? [] : itensDosPrazos(prazos, de, ate)),
    ];
    return todos.filter((i) => camadas.includes(i.camada));
  }, [comp.valor, dem.valor, cfp.valor, prazos, ehP3, camadas, de, ate]);

  const trocarVisao = (v: Visao) => {
    setVisao(v);
    guardar(`${chave}.visao`, v);
  };
  const trocarCamada = (c: Camada) => {
    const nova = camadas.includes(c) ? camadas.filter((x) => x !== c) : [...camadas, c];
    setCamadas(nova);
    guardar(`${chave}.camadas`, nova);
  };
  const abrirDia = (d: string) => {
    setDia(d);
    trocarVisao('dia');
  };
  const novo = (d: string, hora?: number) => setForm({ inicial: compromissoVazio(d, hora) });
  /** Botões "+ Novo evento": com hora (a próxima hora cheia hoje; 9h nos outros dias), como no Google. */
  const novoComHora = (d: string) => novo(d, d === hoje ? new Date().getHours() + 1 : 9);
  const fecharForm = () => {
    setForm(null);
    if (daDemanda) irPara('#/agenda');
  };
  const erro = comp.erro || dem.erro || cfp.erro;

  return (
    <section className="painel agenda">
      <div className="painel-cabecalho">
        <h2>Agenda</h2>
        <button className="botao destaque" type="button" onClick={() => novoComHora(dia)}>
          + Novo evento
        </button>
      </div>

      <div className="agenda-barra">
        <div className="agenda-navegar">
          <button className="botao secundario" type="button" onClick={() => setDia(hoje)}>
            Hoje
          </button>
          <button className="botao secundario agenda-seta" type="button" aria-label="Anterior" onClick={() => setDia(andar(visao, dia, -1))}>
            ‹
          </button>
          <button className="botao secundario agenda-seta" type="button" aria-label="Próximo" onClick={() => setDia(andar(visao, dia, 1))}>
            ›
          </button>
          <p className="agenda-titulo" aria-live="polite">
            {tituloDoPeriodo(visao, dia)}
          </p>
        </div>
        <div className="abas agenda-visoes" role="tablist" aria-label="Visualização">
          {VISOES.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={visao === v.id} onClick={() => trocarVisao(v.id)}>
              {v.rotulo}
            </button>
          ))}
        </div>
      </div>

      <fieldset className="agenda-camadas">
        <legend>Mostrar</legend>
        {listaCamadas.map((c) => (
          <label key={c.id} className={`agenda-camada cor-${c.cor}`}>
            <input type="checkbox" checked={camadas.includes(c.id)} onChange={() => trocarCamada(c.id)} />
            <span>{c.rotulo}</span>
          </label>
        ))}
      </fieldset>

      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}

      {visao === 'mes' ? (
        <VisaoMes
          dia={dia}
          hoje={hoje}
          itens={itens}
          aoSelecionar={setDia}
          aoAbrirDia={abrirDia}
          aoNovo={novo}
          aoNovoComHora={novoComHora}
          aoAbrir={setAberto}
        />
      ) : (
        <VisaoHoras
          dias={visao === 'dia' ? [dia] : diasDaSemana(dia)}
          hoje={hoje}
          itens={itens}
          aoAbrirDia={abrirDia}
          aoNovo={novo}
          aoAbrir={setAberto}
        />
      )}

      {aberto && (
        <DetalheItem
          item={aberto}
          dono={dono}
          aoFechar={() => setAberto(null)}
          aoEditar={(c) => {
            setAberto(null);
            setForm({ inicial: c, existente: c });
          }}
        />
      )}
      {form && <FormCompromisso key={form.existente?.id ?? 'novo'} {...form} dono={dono} aoFechar={fecharForm} />}
    </section>
  );
}

// ---------- Visão Mês ----------

type PropsVisao = {
  hoje: string;
  itens: ItemAgenda[];
  aoAbrirDia: (dia: string) => void;
  aoNovo: (dia: string, hora?: number) => void;
  aoAbrir: (i: ItemAgenda) => void;
};

function Chip({ item, aoAbrir, curto = false }: { item: ItemAgenda; aoAbrir: (i: ItemAgenda) => void; curto?: boolean }) {
  return (
    <button
      type="button"
      className={`agenda-chip cor-${item.cor}${item.diaInteiro ? ' inteiro' : ''}${item.concluido ? ' concluido' : ''}`}
      title={`${item.titulo} · ${quandoDoItem(item)}`}
      aria-label={`${item.titulo} · ${quandoDoItem(item)}`}
      onClick={(e) => {
        e.stopPropagation();
        aoAbrir(item);
      }}
    >
      {!item.diaInteiro && !curto && <span className="agenda-chip-hora">{item.horaInicio}</span>}
      <span className="agenda-chip-titulo">{item.titulo}</span>
    </button>
  );
}

function VisaoMes({
  dia,
  hoje,
  itens,
  aoSelecionar,
  aoAbrirDia,
  aoNovo,
  aoNovoComHora,
  aoAbrir,
}: PropsVisao & { dia: string; aoSelecionar: (d: string) => void; aoNovoComHora: (d: string) => void }) {
  const grade = gradeDoMes(dia);
  const doSelecionado = itensDoDia(itens, dia);
  return (
    <>
      <div className="agenda-mes" role="grid" aria-label={tituloDoPeriodo('mes', dia)}>
        <div className="agenda-mes-linha agenda-mes-cabecalho" role="row">
          {DIAS_CURTOS.map((d) => (
            <span key={d} role="columnheader">
              {d}
            </span>
          ))}
        </div>
        {grade.map((semana) => (
          <div key={semana[0]} className="agenda-mes-linha" role="row">
            {semana.map((d) => {
              const doDia = itensDoDia(itens, d);
              const extra = doDia.length - MAX_CHIPS_MES;
              const classes = ['agenda-celula', mesmoMes(d, dia) ? '' : 'fora', d === hoje ? 'hoje' : '', d === dia ? 'selecionado' : '']
                .filter(Boolean)
                .join(' ');
              return (
                <div
                  key={d}
                  role="gridcell"
                  aria-selected={d === dia}
                  aria-label={`${dataPorExtenso(d)}: ${doDia.length} evento(s)`}
                  className={classes}
                  onClick={() => aoSelecionar(d)}
                  onDoubleClick={() => aoNovo(d)}
                >
                  <button
                    type="button"
                    className="agenda-num-dia"
                    aria-label={`Abrir o dia ${formatarData(d)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      aoAbrirDia(d);
                    }}
                  >
                    {Number(d.slice(8))}
                  </button>
                  <div className="agenda-chips">
                    {doDia.slice(0, MAX_CHIPS_MES).map((i) => (
                      <Chip key={i.chave} item={i} aoAbrir={aoAbrir} />
                    ))}
                    {extra > 0 && (
                      <button
                        type="button"
                        className="agenda-mais"
                        onClick={(e) => {
                          e.stopPropagation();
                          aoAbrirDia(d);
                        }}
                      >
                        +{extra} mais
                      </button>
                    )}
                  </div>
                  {doDia.length > 0 && (
                    <span className="agenda-pontos" aria-hidden="true">
                      {doDia.slice(0, 4).map((i) => (
                        <i key={i.chave} className={`cor-${i.cor}`} />
                      ))}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* No celular os eventos do dia tocado aparecem aqui embaixo (a grade só mostra os pontos coloridos). */}
      <div className="agenda-lista-dia">
        <h3 className="titulo-secao">{dataPorExtenso(dia)}</h3>
        {doSelecionado.length === 0 ? (
          <p className="vazio">Nada neste dia.</p>
        ) : (
          <ul className="agenda-lista">
            {doSelecionado.map((i) => (
              <li key={i.chave}>
                <button
                  type="button"
                  className={`agenda-linha cor-${i.cor}${i.concluido ? ' concluido' : ''}`}
                  aria-label={`${i.titulo} · ${quandoDoItem(i)}`}
                  onClick={() => aoAbrir(i)}
                >
                  <span className="agenda-linha-quando">{quandoDoItem(i)}</span>
                  <span className="agenda-linha-titulo">{i.titulo}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button className="botao secundario" type="button" onClick={() => aoNovoComHora(dia)}>
          + Evento em {formatarData(dia)}
        </button>
      </div>
    </>
  );
}

// ---------- Visões Dia e Semana (grade de horas) ----------

function useAgoraMin(): number {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return agora.getHours() * 60 + agora.getMinutes();
}

function VisaoHoras({ dias, hoje, itens, aoAbrirDia, aoNovo, aoAbrir }: PropsVisao & { dias: string[] }) {
  const rolagem = useRef<HTMLDivElement>(null);
  const agoraMin = useAgoraMin();
  useEffect(() => {
    // Abre já no começo do expediente, como o Google.
    if (rolagem.current) rolagem.current.scrollTop = 7 * HORA_PX;
  }, [dias.length]);

  const clicarHora = (d: string) => (e: MouseEvent<HTMLDivElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    const hora = Math.floor((e.clientY - caixa.top) / HORA_PX);
    aoNovo(d, Math.min(Math.max(hora, 0), 23));
  };

  return (
    <div className={`agenda-horas ${dias.length === 1 ? 'um-dia' : 'semana'}`} ref={rolagem}>
      <div className="agenda-horas-conteudo" style={{ '--dias': dias.length } as CSSProperties}>
        <div className="agenda-horas-topo">
          <span className="agenda-canto" />
          {dias.map((d) => (
            <button
              key={d}
              type="button"
              className={`agenda-cabeca-dia${d === hoje ? ' hoje' : ''}`}
              aria-label={`Abrir o dia ${formatarData(d)}`}
              onClick={() => aoAbrirDia(d)}
            >
              <span>{DIAS_CURTOS[diaDaSemana(d)]}</span>
              <strong>{Number(d.slice(8))}</strong>
            </button>
          ))}
          <span className="agenda-canto agenda-rotulo-inteiro">Dia todo</span>
          {dias.map((d) => (
            <div key={d} className="agenda-dia-inteiro">
              {itensDoDia(itens, d)
                .filter((i) => i.diaInteiro)
                .map((i) => (
                  <Chip key={i.chave} item={i} aoAbrir={aoAbrir} curto />
                ))}
            </div>
          ))}
        </div>

        <div className="agenda-horas-corpo" style={{ height: 24 * HORA_PX }}>
          <div className="agenda-coluna-horas" aria-hidden="true">
            {HORAS.map((h) => (
              <span key={h} style={{ top: h * HORA_PX }}>
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </span>
            ))}
          </div>
          {dias.map((d) => (
            <div
              key={d}
              className="agenda-coluna-dia"
              data-dia={d}
              aria-label={`Horários de ${formatarData(d)}`}
              onClick={clicarHora(d)}
            >
              {d === hoje && <span className="agenda-agora" style={{ top: (agoraMin / 60) * HORA_PX }} aria-hidden="true" />}
              {posicionarNoDia(itensDoDia(itens, d)).map((p) => (
                <button
                  key={p.item.chave}
                  type="button"
                  className={`agenda-evento cor-${p.item.cor}${p.item.concluido ? ' concluido' : ''}`}
                  aria-label={`${p.item.titulo} · ${quandoDoItem(p.item)}`}
                  style={{
                    top: (p.topo / 60) * HORA_PX,
                    height: Math.max((p.altura / 60) * HORA_PX - 2, 18),
                    left: `calc(${(p.coluna / p.colunas) * 100}% + 1px)`,
                    width: `calc(${100 / p.colunas}% - 3px)`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    aoAbrir(p.item);
                  }}
                >
                  <strong>{p.item.titulo}</strong>
                  <span>{quandoDoItem(p.item)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Detalhe do evento ----------

function useEsc(fechar: () => void, travado = false) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !travado) fechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [fechar, travado]);
}

const ROTULO_CAMADA = Object.fromEntries(CAMADAS.map((c) => [c.id, c.rotulo])) as Record<Camada, string>;
const ROTULO_CAMADA_SETOR = Object.fromEntries(CAMADAS_SETOR.map((c) => [c.id, c.rotulo])) as Partial<Record<Camada, string>>;

function DetalheItem({
  item: i,
  dono,
  aoFechar,
  aoEditar,
}: {
  item: ItemAgenda;
  dono: DonoAgenda;
  aoFechar: () => void;
  aoEditar: (c: Compromisso) => void;
}) {
  const ehP3 = dono === 'p3';
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [falha, setFalha] = useState('');
  useEsc(aoFechar, ocupado);
  const c = i.compromisso;
  const repete = c && c.repeticao !== 'nao';

  const apagar = async (soEste: boolean) => {
    if (!c) return;
    setOcupado(true);
    setFalha('');
    try {
      if (soEste && i.ocorrencia) await excluirOcorrencia(db, c.id, i.ocorrencia, quemSou() ?? autorPadrao(dono), dono);
      else await excluirCompromisso(db, c.id, dono);
      aoFechar();
    } catch {
      setFalha('Não foi possível excluir. Tente de novo.');
      setOcupado(false);
    }
  };

  const quando = i.inicio === i.fim ? dataPorExtenso(i.inicio) : `${formatarData(i.inicio)} a ${formatarData(i.fim)}`;
  return (
    <div className="fundo-dialogo" onClick={() => !ocupado && aoFechar()}>
      <div className={`dialogo agenda-detalhe cor-${i.cor}`} role="dialog" aria-modal="true" aria-labelledby="titulo-evento" onClick={(e) => e.stopPropagation()}>
        <span className="agenda-detalhe-camada">{(ehP3 ? ROTULO_CAMADA : ROTULO_CAMADA_SETOR)[i.camada]}</span>
        <h3 id="titulo-evento" className={i.concluido ? 'concluido' : undefined}>
          {i.titulo}
        </h3>
        <p>
          {quando}
          {!i.diaInteiro && ` · ${i.horaInicio} – ${i.horaFim}`}
        </p>
        {c && repete && <p>🔁 {REPETICOES.find((r) => r.id === c.repeticao)?.rotulo}{c.repetirAte ? ` até ${formatarData(c.repetirAte)}` : ''}</p>}
        {i.local && <p>📍 {i.local}</p>}
        {i.descricao && <p className="agenda-detalhe-texto">{i.descricao}</p>}
        {i.concluido && <p>{i.camada === 'prazoP3' ? '✅ Já respondido/enviado' : '✅ Demanda concluída no Numerador'}</p>}
        {i.href && (
          <a className="botao secundario" href={i.href} onClick={aoFechar}>
            📄 {i.rotuloLink ?? 'Abrir'}
          </a>
        )}
        {ehP3 && i.demandaId && (
          <a className="botao secundario" href={`#/demanda/${i.demandaId}`}>
            📄 Abrir demanda {i.demandaNumero} no Numerador
          </a>
        )}
        {i.pastaUrl && (
          <a className="botao secundario" href={i.pastaUrl} target="_blank" rel="noreferrer">
            📁 Pasta do CFP
          </a>
        )}
        {c && <p className="agenda-detalhe-quem">Lançado por {c.criadoPor}{c.atualizadoPor ? ` · alterado por ${c.atualizadoPor}` : ''}</p>}
        {!c && i.camada === 'prazoP3' && <p className="agenda-detalhe-quem">Prazo definido pela P/3: não dá para mudar aqui.</p>}
        {!c && i.camada !== 'cfp' && i.camada !== 'prazoP3' && <p className="agenda-detalhe-quem">Vem do Numerador: para mudar a data, edite a demanda.</p>}
        {falha && (
          <p className="mensagem erro" role="alert">
            {falha}
          </p>
        )}

        {confirmar && c ? (
          <div className="confirmar-linha" role="alertdialog" aria-label="Confirmar exclusão do evento">
            <p>{repete ? 'Excluir só este dia ou a série inteira?' : 'Excluir este evento da agenda?'}</p>
            <div className="acoes-linha">
              <button className="botao secundario" type="button" disabled={ocupado} onClick={() => setConfirmar(false)}>
                Cancelar
              </button>
              {repete && (
                <button className="botao" type="button" disabled={ocupado} onClick={() => apagar(true)}>
                  Só este dia
                </button>
              )}
              <button className="botao destaque" type="button" disabled={ocupado} onClick={() => apagar(false)}>
                {repete ? 'Toda a série' : '🗑️ Sim, excluir'}
              </button>
            </div>
          </div>
        ) : (
          <div className="acoes-linha">
            <button className="botao secundario" type="button" autoFocus onClick={aoFechar}>
              Fechar
            </button>
            {c && (
              <>
                <button className="botao secundario" type="button" onClick={() => setConfirmar(true)}>
                  🗑️ Excluir
                </button>
                <button className="botao" type="button" onClick={() => aoEditar(c)}>
                  ✏️ Editar
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Criar / editar ----------

/** Quem lançou, quando a conta não tem login individual. */
function autorPadrao(dono: DonoAgenda): string {
  if (dono === 'p3') return 'P/3';
  if (dono === 'sala') return 'Sala de Operações';
  return UNIDADES.find((u) => u.id === dono)?.sigla ?? dono;
}

function FormCompromisso({ inicial, existente, dono, aoFechar }: Formulario & { dono: DonoAgenda; aoFechar: () => void }) {
  const [d, setD] = useState<DadosCompromisso>(inicial);
  const [numeroTexto, setNumeroTexto] = useState(inicial.demandaNumero ? String(inicial.demandaNumero) : '');
  const [erros, setErros] = useState<ErrosCompromisso>({});
  const [ocupado, setOcupado] = useState(false);
  const [falha, setFalha] = useState('');
  useEsc(aoFechar, ocupado);
  const muda = <K extends keyof DadosCompromisso>(campo: K, valor: DadosCompromisso[K]) => setD((x) => ({ ...x, [campo]: valor }));

  /** Liga o evento à demanda do Numerador pelo número; devolve os dados atualizados. */
  const ligarDemanda = async (atual: DadosCompromisso): Promise<DadosCompromisso> => {
    const n = Number(numeroTexto.replace(/\D/g, ''));
    if (!numeroTexto.trim()) return { ...atual, demandaId: '', demandaNumero: null, demandaTitulo: '' };
    if (atual.demandaId && atual.demandaNumero === n) return atual;
    const achada = n > 0 ? await buscarDemandaPorNumero(db, n) : null;
    const novo = achada
      ? { ...atual, demandaId: achada.id, demandaNumero: achada.numero, demandaTitulo: achada.saida }
      : { ...atual, demandaId: '', demandaNumero: n || -1, demandaTitulo: '' };
    setD(novo);
    return novo;
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setFalha('');
    setOcupado(true);
    try {
      const dados = dono === 'p3' ? await ligarDemanda(d) : d;
      const encontrados = validarCompromisso(dados);
      setErros(encontrados);
      if (Object.keys(encontrados).length) return setOcupado(false);
      const quem = quemSou() ?? autorPadrao(dono);
      if (existente) await atualizarCompromisso(db, existente.id, dados, quem, dono);
      else await criarCompromisso(db, dados, quem, dono);
      aoFechar();
    } catch {
      setFalha('Não foi possível salvar. Tente de novo.');
      setOcupado(false);
    }
  };

  return (
    <div className="fundo-dialogo" onClick={() => !ocupado && aoFechar()}>
      <form
        className="dialogo agenda-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-form-evento"
        onClick={(e) => e.stopPropagation()}
        onSubmit={salvar}
        noValidate
      >
        <h3 id="titulo-form-evento">{existente ? 'Editar evento' : 'Novo evento'}</h3>
        {existente && existente.repeticao !== 'nao' && <p>A mudança vale para todos os dias da série.</p>}
        <Campo rotulo="Título" obrigatorio erro={erros.titulo}>
          <input value={d.titulo} maxLength={200} autoFocus onChange={(e) => muda('titulo', e.target.value)} />
        </Campo>
        <label className="agenda-marcar">
          <input type="checkbox" checked={d.diaInteiro} onChange={(e) => muda('diaInteiro', e.target.checked)} />
          Dia inteiro
        </label>
        {d.diaInteiro ? (
          <div className="grade agenda-grade-2">
            <Campo rotulo="Início" obrigatorio erro={erros.data}>
              <input
                type="date"
                value={d.data}
                onChange={(e) => setD((x) => ({ ...x, data: e.target.value, dataFim: x.dataFim < e.target.value ? e.target.value : x.dataFim }))}
              />
            </Campo>
            <Campo rotulo="Fim" erro={erros.dataFim}>
              <input type="date" value={d.dataFim} min={d.data} onChange={(e) => muda('dataFim', e.target.value)} />
            </Campo>
          </div>
        ) : (
          <div className="grade agenda-grade-3">
            <Campo rotulo="Data" obrigatorio erro={erros.data}>
              <input type="date" value={d.data} onChange={(e) => setD((x) => ({ ...x, data: e.target.value, dataFim: e.target.value }))} />
            </Campo>
            <Campo rotulo="Das" obrigatorio erro={erros.horaInicio}>
              <input
                type="time"
                value={d.horaInicio}
                onChange={(e) => {
                  const v = e.target.value;
                  // Mantém a duração ao mudar o início (como no Google).
                  setD((x) => {
                    if (!/^\d\d:\d\d$/.test(v) || !/^\d\d:\d\d$/.test(x.horaInicio) || !/^\d\d:\d\d$/.test(x.horaFim)) return { ...x, horaInicio: v };
                    const fim = Math.min(minutos(v) + Math.max(minutos(x.horaFim) - minutos(x.horaInicio), 15), 23 * 60 + 59);
                    return { ...x, horaInicio: v, horaFim: `${String(Math.floor(fim / 60)).padStart(2, '0')}:${String(fim % 60).padStart(2, '0')}` };
                  });
                }}
              />
            </Campo>
            <Campo rotulo="Até" obrigatorio erro={erros.horaFim}>
              <input type="time" value={d.horaFim} onChange={(e) => muda('horaFim', e.target.value)} />
            </Campo>
          </div>
        )}
        <div className="grade agenda-grade-2">
          <Campo rotulo="Repetir">
            <select value={d.repeticao} onChange={(e) => muda('repeticao', e.target.value as DadosCompromisso['repeticao'])}>
              {REPETICOES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.rotulo}
                </option>
              ))}
            </select>
          </Campo>
          {d.repeticao !== 'nao' && (
            <Campo rotulo="Repetir até (vazio = sem fim)" erro={erros.repetirAte}>
              <input type="date" value={d.repetirAte} min={d.data} onChange={(e) => muda('repetirAte', e.target.value)} />
            </Campo>
          )}
        </div>
        <Campo rotulo="Local">
          <input value={d.local} onChange={(e) => muda('local', e.target.value)} />
        </Campo>
        <Campo rotulo="Descrição" erro={erros.descricao}>
          <textarea rows={3} value={d.descricao} onChange={(e) => muda('descricao', e.target.value)} />
        </Campo>
        <fieldset className="agenda-cores">
          <legend>Cor</legend>
          {CORES.map((c) => (
            <label key={c.id} className={`agenda-cor cor-${c.id}`} title={c.rotulo}>
              <input type="radio" name="cor" value={c.id} checked={d.cor === c.id} onChange={() => muda('cor', c.id)} aria-label={c.rotulo} />
            </label>
          ))}
        </fieldset>
        {dono === 'p3' && (
        <Campo rotulo="Demanda do Numerador (nº)" erro={erros.demandaNumero}>
          <input
            inputMode="numeric"
            value={numeroTexto}
            placeholder="Opcional"
            onChange={(e) => {
              setNumeroTexto(e.target.value);
              setErros((x) => ({ ...x, demandaNumero: undefined }));
            }}
            onBlur={() => void ligarDemanda(d).catch(() => undefined)}
          />
        </Campo>
        )}
        {dono === 'p3' && d.demandaId && d.demandaNumero && (
          <p className="agenda-ligada">
            🔗 Nº {d.demandaNumero} — {d.demandaTitulo}
          </p>
        )}
        {falha && (
          <p className="mensagem erro" role="alert">
            {falha}
          </p>
        )}
        <div className="acoes-linha">
          <button className="botao secundario" type="button" disabled={ocupado} onClick={aoFechar}>
            Cancelar
          </button>
          <button className="botao destaque" type="submit" disabled={ocupado}>
            {ocupado ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- Na tela da demanda (Numerador) ----------

/** Eventos da agenda ligados à demanda e o atalho para agendar um novo. */
export function AgendaDaDemanda({ demandaId }: { demandaId: string }) {
  const lista = useAoVivo<Compromisso[]>((ok, erro) => observarCompromissosDaDemanda(db, demandaId, ok, erro), [demandaId]);
  return (
    <div className="cartao grupo agenda-da-demanda">
      <div className="painel-cabecalho">
        <h3 className="titulo-secao">📅 Agenda</h3>
        <a className="botao secundario" href={`#/agenda/demanda/${demandaId}`}>
          + Agendar evento
        </a>
      </div>
      {(lista.valor ?? []).length === 0 ? (
        <p className="vazio">Nenhum evento da agenda ligado a esta demanda.</p>
      ) : (
        <ul className="agenda-lista">
          {lista.valor!.map((c) => (
            <li key={c.id} className={`agenda-linha cor-${c.cor}`}>
              <span className="agenda-linha-quando">
                {formatarData(c.data)}
                {c.diaInteiro ? '' : ` ${c.horaInicio}`}
              </span>
              <span className="agenda-linha-titulo">{c.titulo}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
