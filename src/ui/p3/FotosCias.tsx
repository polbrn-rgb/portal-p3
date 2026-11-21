import { useState } from 'react';
import { apagarFotosEncaminhadas, lerFotoEncaminhada, observarFotosEncaminhadas } from '../../data/fotosEncaminhadas';
import { nomeArquivoFotoCgp, type FotoEncaminhada } from '../../domain/cgp';
import { hojeISO } from '../../domain/datas';
import { DIAS_NO_SISTEMA, textoApagaEm } from '../../domain/fotos';
import { quandoFoi } from '../../domain/recado';
import { UNIDADES, type UnidadeId } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { base64ParaBytes } from '../../lib/imagem';
import { useAoVivo } from '../../lib/useAoVivo';
import { zip } from '../../lib/xlsx';
import { Campo } from '../Campo';

function entregar(nome: string, dados: Uint8Array, tipo: string) {
  const url = URL.createObjectURL(new Blob([dados as BlobPart], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const siglaDe = (id: UnidadeId) => UNIDADES.find((u) => u.id === id)?.sigla ?? id;

/** Nomes dentro do .zip: uma pasta por Cia; fotos com o mesmo nome ganham (2), (3)… */
function caminhosNoZip(lista: FotoEncaminhada[]): string[] {
  const usados = new Map<string, number>();
  return lista.map((f) => {
    const base = `${siglaDe(f.unidadeId)}/${nomeArquivoFotoCgp(f)}`;
    const n = (usados.get(base) ?? 0) + 1;
    usados.set(base, n);
    return n === 1 ? base : `${siglaDe(f.unidadeId)}/${nomeArquivoFotoCgp(f, n)}`;
  });
}

/** P/3 → Fotos das Cias: as fotos do CGP que cada Cia encaminhou. Baixar (uma ou todas em .zip) e apagar. */
export function FotosCias() {
  const fotos = useAoVivo<FotoEncaminhada[]>((ok, erro) => observarFotosEncaminhadas(db, ok, erro), [], 'Não foi possível carregar as fotos.');
  const [cia, setCia] = useState<UnidadeId | 'todas'>('todas');
  const [baixando, setBaixando] = useState('');
  const [baixadas, setBaixadas] = useState<string[]>([]);
  const [confirmando, setConfirmando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [confirmarId, setConfirmarId] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const todas = fotos.valor ?? [];
  const lista = cia === 'todas' ? todas : todas.filter((f) => f.unidadeId === cia);
  const grupos = UNIDADES.map((u) => ({ unidade: u, fotos: lista.filter((f) => f.unidadeId === u.id) })).filter((g) => g.fotos.length);
  // Só oferece apagar em lote o que foi baixado e ainda está no sistema.
  const paraApagar = baixadas.filter((id) => todas.some((f) => f.id === id));

  function limparMensagens() {
    setErro('');
    setAviso('');
  }

  async function baixarUma(f: FotoEncaminhada) {
    limparMensagens();
    try {
      entregar(nomeArquivoFotoCgp(f), base64ParaBytes(await lerFotoEncaminhada(db, f.id)), 'image/jpeg');
    } catch {
      setErro('Não foi possível baixar a foto.');
    }
  }

  async function baixarTodas() {
    limparMensagens();
    setConfirmando(false);
    const ordem = grupos.flatMap((g) => g.fotos);
    const nomes = caminhosNoZip(ordem);
    try {
      const arquivos: { nome: string; dados: Uint8Array }[] = [];
      for (const [i, f] of ordem.entries()) {
        setBaixando(`Baixando ${i + 1} de ${ordem.length}…`);
        arquivos.push({ nome: nomes[i], dados: base64ParaBytes(await lerFotoEncaminhada(db, f.id)) });
      }
      const nome = `Fotos das Cias ${cia === 'todas' ? '' : siglaDe(cia) + ' '}${hojeISO()}.zip`;
      entregar(nome, zip(arquivos), 'application/zip');
      setBaixadas(ordem.map((f) => f.id));
      setAviso(`${ordem.length} foto(s) baixada(s) em "${nome}". Confira o arquivo antes de apagar do sistema.`);
    } catch {
      setErro('Não foi possível baixar as fotos. Tente de novo.');
    }
    setBaixando('');
  }

  async function apagar(ids: string[]) {
    setApagando(true);
    limparMensagens();
    try {
      await apagarFotosEncaminhadas(db, ids);
      setBaixadas((b) => b.filter((id) => !ids.includes(id)));
      setAviso(`${ids.length} foto(s) apagada(s) do sistema.`);
    } catch {
      setErro('Não foi possível apagar. Tente de novo.');
    }
    setApagando(false);
    setConfirmando(false);
    setConfirmarId('');
  }

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Fotos das Cias</h2>
      </div>
      <p className="ajuda-pendentes">
        Fotos do CGP que as Cias encaminharam à P/3. Cada foto fica {DIAS_NO_SISTEMA} dias no sistema depois de encaminhada e então é apagada
        sozinha: baixe antes desse prazo.
      </p>
      <div className="acoes-linha acoes-quebra">
        <Campo rotulo="Cia" className="campo-mes-lista">
          <select value={cia} onChange={(e) => (setCia(e.target.value as UnidadeId | 'todas'), setConfirmando(false))}>
            <option value="todas">Todas</option>
            {UNIDADES.map((u) => (
              <option key={u.id} value={u.id}>
                {u.sigla}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      {fotos.carregando && <p className="carregando">Carregando…</p>}
      {fotos.erro && <p className="mensagem erro">{fotos.erro}</p>}
      {!fotos.carregando && !fotos.erro && !lista.length && <p className="vazio">Nenhuma foto encaminhada{cia === 'todas' ? '' : ` pela ${siglaDe(cia)}`}.</p>}

      {lista.length > 0 && (
        <div className="cartao grupo">
          <p className="pendente-detalhe">
            {lista.length} foto(s) de {grupos.length} unidade(s)
          </p>
          <div className="acoes-linha acoes-quebra">
            <button className="botao destaque" type="button" disabled={!!baixando || apagando} onClick={baixarTodas}>
              {baixando || `⬇️ Baixar ${lista.length === 1 ? 'a foto' : `as ${lista.length} fotos`} (.zip)`}
            </button>
            {paraApagar.length > 0 && !confirmando && (
              <button className="botao perigo" type="button" disabled={!!baixando || apagando} onClick={() => setConfirmando(true)}>
                🗑️ Apagar as baixadas do sistema
              </button>
            )}
          </div>
          {confirmando && paraApagar.length > 0 && (
            <div className="confirmar-linha" role="alertdialog" aria-label="Confirmar exclusão das fotos">
              <p>Apagar do sistema as {paraApagar.length} foto(s) baixada(s)? Elas só ficam no .zip que você baixou. Não dá para desfazer.</p>
              <div className="acoes-linha">
                <button className="botao secundario" type="button" onClick={() => setConfirmando(false)}>
                  Cancelar
                </button>
                <button className="botao perigo" type="button" disabled={apagando} onClick={() => apagar(paraApagar)}>
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
        <article key={g.unidade.id} className="cartao grupo" aria-label={g.unidade.sigla}>
          <div className="item-topo">
            <h3>{g.unidade.sigla}</h3>
            <span className="selo situacao-respondida">{g.fotos.length} foto(s)</span>
          </div>
          <ul className="grade-fotos">
            {g.fotos.map((f) => (
              <li key={f.id}>
                <img src={`data:image/jpeg;base64,${f.miniatura}`} alt={`${f.descricao} — ${f.local}`} />
                <span className="legenda-foto">
                  <strong>{f.descricao}</strong> · {f.local}
                  <br />
                  {f.observacao}
                  <br />
                  Importada por {f.enviadoPor} · encaminhada por {f.encaminhadaPor} em {quandoFoi(f.encaminhadaEm)}
                  <br />
                  <span className="item-info">{textoApagaEm(f.encaminhadaEm)}</span>
                </span>
                {confirmarId === f.id ? (
                  <div className="confirmar-foto" role="alertdialog" aria-label="Confirmar exclusão da foto">
                    <p>Apagar esta foto do sistema? Não dá para desfazer.</p>
                    <div className="acoes-linha">
                      <button className="botao secundario" type="button" disabled={apagando} onClick={() => setConfirmarId('')}>
                        Cancelar
                      </button>
                      <button className="botao perigo" type="button" disabled={apagando} onClick={() => apagar([f.id])}>
                        {apagando ? 'Apagando…' : 'Sim, apagar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <span className="acoes-linha">
                    <button className="botao secundario" type="button" onClick={() => baixarUma(f)}>
                      Baixar
                    </button>
                    <button className="botao secundario" type="button" onClick={() => setConfirmarId(f.id)}>
                      Apagar
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}
