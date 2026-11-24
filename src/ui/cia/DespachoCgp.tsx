import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { buscarPolicial } from '../../data/efetivo';
import { excluirDespacho, salvarDespacho } from '../../data/despachos';
import { formatarData, hojeISO } from '../../domain/datas';
import { cabecalhoDespacho, linhaAssinante, validarDespacho, type DespachoCgp, type ErrosDespacho } from '../../domain/despacho';
import type { MissaoCgp } from '../../domain/cgp';
import { auth, db } from '../../lib/firebase';
import { baixarDespachoPdf } from '../../lib/despachoPdf';
import { meuRE, quemSou } from '../../lib/quemSou';
import { Campo } from '../Campo';

/** Quadro para assinar com o dedo (ou mouse). Devolve o PNG ('' = em branco). */
function AssinaturaDedo({ aoMudar, erro }: { aoMudar: (png: string) => void; erro?: string }) {
  const tela = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const [vazia, setVazia] = useState(true);

  useEffect(() => {
    const c = tela.current;
    if (!c) return;
    // Resolução de acordo com o tamanho na tela, para o traço não sair borrado.
    const r = c.getBoundingClientRect();
    c.width = Math.max(1, Math.round(r.width * 2));
    c.height = Math.max(1, Math.round(r.height * 2));
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(2, 2);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0b1f4d';
  }, []);

  const ponto = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function comecar(e: PointerEvent<HTMLCanvasElement>) {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    desenhando.current = true;
    const p = ponto(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
  }

  function mover(e: PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = ponto(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function terminar() {
    if (!desenhando.current) return;
    desenhando.current = false;
    setVazia(false);
    aoMudar(reduzida(tela.current));
  }

  function limpar() {
    const c = tela.current;
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    setVazia(true);
    aoMudar('');
  }

  return (
    <div className="campo">
      <span className="rotulo-campo">
        Assinatura <span className="obrigatorio">*</span>
      </span>
      <canvas
        ref={tela}
        className={`quadro-assinatura${erro ? ' campo-erro' : ''}`}
        aria-label="Quadro de assinatura: assine com o dedo"
        role="img"
        onPointerDown={comecar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        onPointerLeave={terminar}
      />
      <div className="acoes-linha">
        <span className="item-info">{vazia ? 'Assine com o dedo no quadro acima.' : 'Assinado.'}</span>
        <button className="botao secundario" type="button" onClick={limpar} disabled={vazia}>
          Limpar assinatura
        </button>
      </div>
      {erro && (
        <span className="erro-campo" role="alert">
          {erro}
        </span>
      )}
    </div>
  );
}

/** PNG da assinatura em tamanho menor (cabe folgado no banco). */
function reduzida(c: HTMLCanvasElement | null): string {
  if (!c) return '';
  const alvo = document.createElement('canvas');
  const escala = Math.min(1, 600 / c.width);
  alvo.width = Math.round(c.width * escala);
  alvo.height = Math.round(c.height * escala);
  alvo.getContext('2d')?.drawImage(c, 0, 0, alvo.width, alvo.height);
  return alvo.toDataURL('image/png');
}

/** Quem está logado, como vai no despacho ("2º Sgt PM 144602-9 Sousa"): do banco de efetivo; sem ele, do login. Dá para corrigir. */
function useAssinante(): [string, (v: string) => void] {
  const re = meuRE();
  const [valor, setValor] = useState(() => {
    const nome = String(auth.currentUser?.displayName ?? '').trim();
    if (!re) return '';
    // displayName = "2º Sgt PM Sousa": o RE entra antes do nome de guerra (última palavra).
    const partes = nome.split(/\s+/).filter(Boolean);
    return partes.length > 1 ? linhaAssinante({ posto: partes.slice(0, -1).join(' '), re, nomeGuerra: partes.at(-1) }) : linhaAssinante({ re, nomeGuerra: nome });
  });
  useEffect(() => {
    if (!re) return;
    let vivo = true;
    buscarPolicial(db, re)
      .then((p) => {
        if (vivo && p) setValor(linhaAssinante({ posto: p.posto, re: p.re || re, nomeGuerra: p.nomeGuerra }));
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [re]);
  return [valor, setValor];
}

export function FormDespacho({ missao, aoFechar }: { missao: MissaoCgp; aoFechar: () => void }) {
  const hoje = hojeISO();
  const [pelotao, setPelotao] = useState('');
  const [texto, setTexto] = useState('');
  const [assinatura, setAssinatura] = useState('');
  const [assinante, setAssinante] = useAssinante();
  const [erros, setErros] = useState<ErrosDespacho>({});
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [linha1, , linha3] = cabecalhoDespacho(missao.unidadeId, hoje, pelotao);
  const [tentou, setTentou] = useState(false);
  // Depois da primeira tentativa, os avisos somem assim que o campo é preenchido.
  useEffect(() => {
    if (tentou) setErros(validarDespacho({ pelotao, texto, assinante, assinatura }));
  }, [tentou, pelotao, texto, assinante, assinatura]);

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    setErro('');
    const e = validarDespacho({ pelotao, texto, assinante, assinatura });
    setTentou(true);
    setErros(e);
    if (Object.keys(e).length) return;
    setOcupado(true);
    try {
      await salvarDespacho(db, {
        unidadeId: missao.unidadeId,
        missaoId: missao.id,
        numero: missao.numero,
        titulo: missao.titulo,
        data: hoje,
        pelotao,
        texto,
        assinante,
        assinatura,
        criadoPor: quemSou() ?? assinante,
      });
      aoFechar();
    } catch {
      setErro('Não foi possível salvar o despacho. Verifique a conexão e tente de novo.');
    }
    setOcupado(false);
  }

  return (
    <form className="cartao grupo form-despacho" onSubmit={salvar} noValidate aria-label={`Despacho de ${missao.numero}`}>
      <h4>Despacho</h4>
      <div className="cabecalho-despacho">
        <p>{linha1}</p>
        <p className="linha-pelotao">
          <span>Do CGP {missao.unidadeId === 'ft' ? 'FT' : missao.unidadeId.replace('cia', '')} Pel</span>
          <input
            aria-label="Pelotão"
            className={erros.pelotao ? 'campo-erro' : ''}
            value={pelotao}
            maxLength={30}
            placeholder="seu pelotão"
            onChange={(e) => setPelotao(e.target.value)}
          />
        </p>
        {erros.pelotao && <span className="erro-campo">{erros.pelotao}</span>}
        <p>{linha3}</p>
      </div>
      <Campo rotulo="O que foi feito" erro={erros.texto} obrigatorio>
        <textarea rows={7} value={texto} onChange={(e) => setTexto(e.target.value)} />
      </Campo>
      <Campo rotulo="Assinado por" erro={erros.assinante} obrigatorio>
        <input value={assinante} placeholder="Posto/graduação RE Nome" onChange={(e) => setAssinante(e.target.value)} />
      </Campo>
      <AssinaturaDedo aoMudar={setAssinatura} erro={erros.assinatura} />
      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}
      <div className="barra-acoes">
        <button className="botao secundario" type="button" onClick={aoFechar} disabled={ocupado}>
          Cancelar
        </button>
        <button className="botao destaque" type="submit" disabled={ocupado}>
          {ocupado ? 'Salvando…' : 'Salvar despacho'}
        </button>
      </div>
    </form>
  );
}

/** Despachos já feitos na missão: baixar o PDF (Cia e CGP); a Cia pode apagar. */
export function DespachosDaMissao({ despachos, podeApagar }: { despachos: DespachoCgp[]; podeApagar: boolean }) {
  const [aviso, setAviso] = useState('');
  const [aApagar, setAApagar] = useState('');
  if (!despachos.length) return null;

  async function baixar(d: DespachoCgp) {
    setAviso('');
    try {
      await baixarDespachoPdf(d);
    } catch {
      setAviso('Não foi possível gerar o PDF. Tente de novo.');
    }
  }

  async function apagar(id: string) {
    try {
      await excluirDespacho(db, id);
    } catch {
      setAviso('Não foi possível apagar. Tente de novo.');
    }
    setAApagar('');
  }

  return (
    <div className="despachos-missao">
      <ul className="lista-despachos" aria-label="Despachos">
        {despachos.map((d) => (
          <li key={d.id}>
            <span>
              📝 Despacho de {formatarData(d.data)} · Pel {d.pelotao} · {d.assinante}
            </span>
            <span className="acoes-linha">
              <button className="botao secundario" type="button" onClick={() => baixar(d)}>
                Baixar PDF
              </button>
              {podeApagar &&
                (aApagar === d.id ? (
                  <>
                    <button className="botao secundario" type="button" onClick={() => setAApagar('')}>
                      Cancelar
                    </button>
                    <button className="botao perigo" type="button" onClick={() => apagar(d.id)}>
                      Apagar despacho
                    </button>
                  </>
                ) : (
                  <button className="botao secundario" type="button" onClick={() => setAApagar(d.id)}>
                    Apagar
                  </button>
                ))}
            </span>
          </li>
        ))}
      </ul>
      {aviso && (
        <p className="mensagem erro" role="alert">
          {aviso}
        </p>
      )}
    </div>
  );
}
