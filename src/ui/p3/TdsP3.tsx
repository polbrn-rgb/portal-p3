import { useState } from 'react';
import { apagarFotosTds, lerFotoTds, observarFotosDoMes } from '../../data/tds';
import { formatarData, hojeISO } from '../../domain/datas';
import { agruparPorCfp, caminhoNoZip, FOTOS_POR_MES, mesAnterior, mesDe, nomeMes, nomeZip, type FotoTds } from '../../domain/tds';
import { db } from '../../lib/firebase';
import { base64ParaBytes } from '../../lib/imagem';
import { useAoVivo } from '../../lib/useAoVivo';
import { zip } from '../../lib/xlsx';
import { Campo } from '../Campo';

function ultimosMeses(quantos = 12): string[] {
  const lista = [mesDe(hojeISO())];
  while (lista.length < quantos) lista.push(mesAnterior(lista[lista.length - 1]));
  return lista;
}

function megas(caracteres: number): string {
  return `${((caracteres * 0.75) / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function entregar(nome: string, dados: Uint8Array) {
  const url = URL.createObjectURL(new Blob([dados as BlobPart], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Aba CFP → TDS da P/3: fotos do mês por CFP, baixar tudo em .zip e apagar do sistema. */
export function TdsP3() {
  const [mes, setMes] = useState(() => mesDe(hojeISO()));
  const fotos = useAoVivo<FotoTds[]>((ok, erro) => observarFotosDoMes(db, mes, ok, erro), [mes], 'Não foi possível carregar as fotos.');
  const lista = fotos.valor ?? [];
  const grupos = agruparPorCfp(lista);
  const [baixando, setBaixando] = useState<string>('');
  const [baixadas, setBaixadas] = useState<{ mes: string; ids: string[] } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  // Só oferece apagar o que foi baixado (e ainda está no sistema).
  const paraApagar = baixadas?.mes === mes ? baixadas.ids.filter((id) => lista.some((f) => f.id === id)) : [];

  function trocarMes(m: string) {
    setMes(m);
    setConfirmando(false);
    setErro('');
    setAviso('');
  }

  async function baixar() {
    setErro('');
    setAviso('');
    setConfirmando(false);
    const todas = grupos.flatMap((g) => g.fotos);
    try {
      const arquivos: { nome: string; dados: Uint8Array }[] = [];
      for (const [i, f] of todas.entries()) {
        setBaixando(`Baixando ${i + 1} de ${todas.length}…`);
        arquivos.push({ nome: `TDS ${mes}/${caminhoNoZip(f)}`, dados: base64ParaBytes(await lerFotoTds(db, f.id)) });
      }
      entregar(nomeZip(mes), zip(arquivos));
      setBaixadas({ mes, ids: todas.map((f) => f.id) });
      setAviso(`${todas.length} foto(s) baixada(s) em "${nomeZip(mes)}". Confira o arquivo antes de apagar do sistema.`);
    } catch {
      setErro('Não foi possível baixar as fotos. Tente de novo.');
    }
    setBaixando('');
  }

  async function apagar() {
    setApagando(true);
    setErro('');
    try {
      await apagarFotosTds(db, paraApagar);
      setAviso(`${paraApagar.length} foto(s) apagada(s) do sistema.`);
      setBaixadas(null);
      setConfirmando(false);
    } catch {
      setErro('Não foi possível apagar. Tente de novo.');
    }
    setApagando(false);
  }

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>TDS — fotos de instrução</h2>
      </div>
      <p className="ajuda-pendentes">
        Cada CFP manda até {FOTOS_POR_MES} fotos por mês pela página dele. Baixe o .zip do mês (uma pasta por CFP) e depois apague do sistema para
        liberar espaço.
      </p>
      <div className="acoes-linha acoes-quebra">
        <Campo rotulo="Mês" className="campo-mes-lista">
          <select value={mes} onChange={(e) => trocarMes(e.target.value)}>
            {ultimosMeses().map((m) => (
              <option key={m} value={m}>
                {nomeMes(m)}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      {fotos.carregando && <p className="carregando">Carregando…</p>}
      {fotos.erro && <p className="mensagem erro">{fotos.erro}</p>}
      {!fotos.carregando && !fotos.erro && !lista.length && <p className="vazio">Nenhuma foto em {nomeMes(mes)}.</p>}

      {lista.length > 0 && (
        <div className="cartao grupo">
          <p className="pendente-detalhe">
            {lista.length} foto(s) de {grupos.length} CFP · {megas(lista.reduce((s, f) => s + f.tamanho, 0))}
          </p>
          <div className="acoes-linha acoes-quebra">
            <button className="botao destaque" type="button" disabled={!!baixando || apagando} onClick={baixar}>
              {baixando || `⬇️ Baixar fotos de ${nomeMes(mes)} (.zip)`}
            </button>
            {paraApagar.length > 0 && !confirmando && (
              <button className="botao perigo" type="button" disabled={!!baixando || apagando} onClick={() => setConfirmando(true)}>
                🗑️ Apagar do sistema
              </button>
            )}
          </div>
          {confirmando && paraApagar.length > 0 && (
            <div className="confirmar-linha" role="alertdialog" aria-label="Confirmar exclusão das fotos">
              <p>
                Apagar do sistema as {paraApagar.length} foto(s) baixada(s) de {nomeMes(mes)}? Elas só ficam no .zip que você baixou. Não dá para desfazer.
              </p>
              <div className="acoes-linha">
                <button className="botao secundario" type="button" onClick={() => setConfirmando(false)}>
                  Cancelar
                </button>
                <button className="botao perigo" type="button" disabled={apagando} onClick={apagar}>
                  {apagando ? 'Apagando…' : 'Sim, apagar'}
                </button>
              </div>
            </div>
          )}
        </div>
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

      {grupos.map((g) => (
        <article key={g.re} className="cartao grupo" aria-label={`${g.cfp.posto} ${g.cfp.nomeGuerra}`}>
          <div className="item-topo">
            <h3>
              {g.cfp.posto} {g.cfp.nomeGuerra}
            </h3>
            <span className="selo situacao-respondida">
              {g.fotos.length} de {FOTOS_POR_MES}
            </span>
          </div>
          <p className="pendente-detalhe">RE {g.re}</p>
          <ul className="grade-fotos">
            {g.fotos.map((f) => (
              <li key={f.id}>
                <img src={`data:image/jpeg;base64,${f.miniatura}`} alt={`${f.assunto} (${formatarData(f.data)})`} />
                <span className="legenda-foto">
                  {formatarData(f.data)} · {f.assunto}
                </span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}
