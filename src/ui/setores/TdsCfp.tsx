import { useEffect, useRef, useState } from 'react';
import { buscarPolicial } from '../../data/efetivo';
import { cadastrarPolicial, enviarFotosTds, observarFotosDoCfp } from '../../data/tds';
import { formatarData, hojeISO } from '../../domain/datas';
import { normalizarRE, type Policial } from '../../domain/efetivo';
import {
  FOTOS_POR_MES,
  LIMITE_ASSUNTO,
  LIMITE_ORIGINAL,
  mesDe,
  nomeMes,
  POSTOS_GRADUACOES,
  validarCadastroManual,
  validarEnvioTds,
  vagasLivres,
  type DadosManuais,
  type ErrosEnvioTds,
  type ErrosManuais,
  type FotoTds,
} from '../../domain/tds';
import { db } from '../../lib/firebase';
import { reduzirFoto, type FotoReduzida } from '../../lib/imagem';
import { useAoVivo } from '../../lib/useAoVivo';
import { meuRE } from '../../lib/quemSou';
import { Campo } from '../Campo';

const CHAVE_RE = 'portalp3.reCfp';
const MANUAL_VAZIO: DadosManuais = { posto: '', nomeGuerra: '', nomeCompleto: '', telefone: '' };

type Escolhida = { arquivo: File; url: string };

function lerRE(): string {
  try {
    return localStorage.getItem(CHAVE_RE) ?? '';
  } catch {
    return '';
  }
}

/** Aba TDS da página do CFP: até 5 fotos por mês das instruções dadas durante o serviço. */
export function TdsCfp() {
  const [re, setRe] = useState(() => meuRE() ?? lerRE());
  const chave = normalizarRE(re);
  // undefined = ainda não buscou; null = não está no banco
  const [policial, setPolicial] = useState<Policial | null | undefined>(undefined);
  const [manual, setManual] = useState<DadosManuais>(MANUAL_VAZIO);
  const [data, setData] = useState(hojeISO);
  const [assunto, setAssunto] = useState('');
  const [escolhidas, setEscolhidas] = useState<Escolhida[]>([]);
  const [erros, setErros] = useState<ErrosEnvioTds & ErrosManuais>({});
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [etapa, setEtapa] = useState('');
  const urls = useRef<string[]>([]);

  const mes = mesDe(data || hojeISO());
  const fotos = useAoVivo<FotoTds[]>(
    (ok, falha) => {
      if (chave.length < 5) {
        ok([]);
        return () => undefined;
      }
      return observarFotosDoCfp(db, mes, chave, ok, falha);
    },
    [mes, chave],
    'Não foi possível carregar as suas fotos.',
  );
  const enviadas = fotos.valor ?? [];
  const livres = vagasLivres(enviadas);

  // Busca no banco de efetivo assim que o RE estiver completo.
  useEffect(() => {
    setPolicial(undefined);
    if (chave.length < 5) return;
    let vale = true;
    const t = setTimeout(() => {
      buscarPolicial(db, chave)
        .then((p) => vale && setPolicial(p))
        .catch(() => vale && setPolicial(null));
    }, 500);
    return () => {
      vale = false;
      clearTimeout(t);
    };
  }, [chave]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  function escolher(lista: FileList | null) {
    if (!lista?.length) return;
    const novas = Array.from(lista).map((arquivo) => {
      const url = URL.createObjectURL(arquivo);
      urls.current.push(url);
      return { arquivo, url };
    });
    setEscolhidas((atual) => [...atual, ...novas]);
    setErros((e) => ({ ...e, fotos: undefined }));
    setAviso('');
  }

  function tirar(url: string) {
    URL.revokeObjectURL(url);
    setEscolhidas((atual) => atual.filter((x) => x.url !== url));
  }

  async function enviar() {
    setErro('');
    setAviso('');
    const e: ErrosEnvioTds & ErrosManuais = validarEnvioTds({ re, data, assunto, quantidade: escolhidas.length, livres: livres.length });
    const precisaCadastrar = !e.re && policial === null;
    if (!e.re && policial === undefined) e.re = 'Aguarde a busca do RE.';
    if (precisaCadastrar) Object.assign(e, validarCadastroManual(manual));
    const grande = escolhidas.find((x) => x.arquivo.size > LIMITE_ORIGINAL);
    if (!e.fotos && grande) e.fotos = `A foto "${grande.arquivo.name}" é grande demais. Escolha outra.`;
    setErros(e);
    if (Object.values(e).some(Boolean)) return;

    try {
      let cfp = policial;
      if (precisaCadastrar) {
        setEtapa('Salvando seus dados…');
        cfp = await cadastrarPolicial(db, re, manual);
        setPolicial(cfp);
      }
      const reduzidas: FotoReduzida[] = [];
      for (const [i, x] of escolhidas.entries()) {
        setEtapa(`Preparando a foto ${i + 1} de ${escolhidas.length}…`);
        try {
          reduzidas.push(await reduzirFoto(x.arquivo));
        } catch {
          setErros({ fotos: `Não foi possível abrir a foto "${x.arquivo.name}". Tire da seleção ou escolha outra (JPG ou PNG).` });
          setEtapa('');
          return;
        }
      }
      setEtapa(`Enviando 0 de ${reduzidas.length}…`);
      const feitas = await enviarFotosTds(
        db,
        { cfp: { re, posto: cfp!.posto, nomeGuerra: cfp!.nomeGuerra }, data, assunto },
        reduzidas,
        livres,
        (n) => setEtapa(`Enviando ${n} de ${reduzidas.length}…`),
      );
      try {
        localStorage.setItem(CHAVE_RE, re.trim());
      } catch {
        /* sem armazenamento: segue */
      }
      escolhidas.forEach((x) => URL.revokeObjectURL(x.url));
      setEscolhidas([]);
      setAssunto('');
      setAviso(
        feitas === reduzidas.length
          ? `${feitas} foto(s) enviada(s) para a P/3. Obrigado!`
          : `Só ${feitas} de ${reduzidas.length} foto(s) couberam no limite de ${FOTOS_POR_MES} do mês.`,
      );
    } catch {
      setErro('Não foi possível enviar. Verifique a conexão e tente de novo.');
    }
    setEtapa('');
  }

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>TDS — fotos de instrução</h2>
      </div>
      <div className="cartao grupo instrucao-tds">
        <p>
          Envie até <strong>{FOTOS_POR_MES} fotos por mês</strong> das instruções que você deu durante o serviço.
        </p>
        <ul>
          <li>Informe o seu RE, a data e o assunto da instrução.</li>
          <li>Toque em <strong>📷 Escolher fotos</strong> e marque as fotos no álbum do celular.</li>
          <li>As fotos são reduzidas antes de enviar e ficam com a P/3.</li>
        </ul>
      </div>

      <div className="cartao grupo">
        <Campo rotulo="Seu RE" obrigatorio erro={erros.re}>
          <input inputMode="numeric" autoComplete="off" value={re} readOnly={Boolean(meuRE())} placeholder="123456-7" onChange={(e) => setRe(e.target.value)} />
        </Campo>
        {chave.length >= 5 && policial === undefined && <p className="carregando">Buscando o RE…</p>}
        {policial && (
          <p className="policial-achado" role="status">
            ✅ {policial.posto} {policial.nomeGuerra}
          </p>
        )}
        {policial === null && (
          <fieldset className="grupo-manual">
            <legend>RE não encontrado no banco de efetivo</legend>
            <p className="pendente-detalhe">Preencha seus dados. Eles ficam salvos e da próxima vez o RE já é encontrado.</p>
            <div className="grade-2">
              <Campo rotulo="Posto/graduação" obrigatorio erro={erros.posto}>
                <select value={manual.posto} onChange={(e) => setManual({ ...manual, posto: e.target.value })}>
                  <option value="">Escolha…</option>
                  {POSTOS_GRADUACOES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Nome de guerra" obrigatorio erro={erros.nomeGuerra}>
                <input value={manual.nomeGuerra} onChange={(e) => setManual({ ...manual, nomeGuerra: e.target.value })} />
              </Campo>
            </div>
            <Campo rotulo="Nome completo" obrigatorio erro={erros.nomeCompleto}>
              <input value={manual.nomeCompleto} autoComplete="name" onChange={(e) => setManual({ ...manual, nomeCompleto: e.target.value })} />
            </Campo>
            <Campo rotulo="Telefone" erro={erros.telefone}>
              <input type="tel" value={manual.telefone} autoComplete="tel" onChange={(e) => setManual({ ...manual, telefone: e.target.value })} />
            </Campo>
          </fieldset>
        )}
        {chave.length >= 5 && !fotos.carregando && (
          <p className={`contador-tds${livres.length ? '' : ' esgotado'}`}>
            {enviadas.length} de {FOTOS_POR_MES} fotos enviadas em {nomeMes(mes)}
          </p>
        )}
      </div>

      <div className="cartao grupo">
        <div className="grade-2">
          <Campo rotulo="Data da instrução" obrigatorio erro={erros.data}>
            <input type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value)} />
          </Campo>
          <Campo rotulo="Assunto" obrigatorio erro={erros.assunto}>
            <input value={assunto} maxLength={LIMITE_ASSUNTO} placeholder="Ex.: abordagem a veículo" onChange={(e) => setAssunto(e.target.value)} />
          </Campo>
        </div>
        <Campo rotulo={`Fotos (até ${livres.length} neste mês)`} obrigatorio erro={erros.fotos} className="campo-fotos">
          <span className="botao secundario botao-fotos">📷 Escolher fotos</span>
          <input
            className="entrada-oculta"
            type="file"
            accept="image/*"
            multiple
            disabled={!livres.length || !!etapa}
            onChange={(e) => {
              escolher(e.target.files);
              e.target.value = '';
            }}
          />
        </Campo>
        {escolhidas.length > 0 && (
          <ul className="grade-fotos" aria-label="Fotos escolhidas">
            {escolhidas.map((x) => (
              <li key={x.url}>
                <img src={x.url} alt={x.arquivo.name} />
                <button className="tirar-foto" type="button" aria-label={`Tirar ${x.arquivo.name}`} disabled={!!etapa} onClick={() => tirar(x.url)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

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
      <div className="barra-acoes">
        <button className="botao destaque" type="button" disabled={!!etapa} onClick={enviar}>
          {etapa || 'Enviar fotos'}
        </button>
      </div>

      {enviadas.length > 0 && (
        <>
          <h3>Suas fotos de {nomeMes(mes)}</h3>
          <ul className="grade-fotos" aria-label="Fotos enviadas">
            {[...enviadas]
              .sort((a, b) => a.vaga - b.vaga)
              .map((f) => (
                <li key={f.id}>
                  <img src={`data:image/jpeg;base64,${f.miniatura}`} alt={`${f.assunto} (${formatarData(f.data)})`} />
                  <span className="legenda-foto">
                    {formatarData(f.data)} · {f.assunto}
                  </span>
                </li>
              ))}
          </ul>
        </>
      )}
      {fotos.erro && <p className="mensagem erro">{fotos.erro}</p>}
    </section>
  );
}
