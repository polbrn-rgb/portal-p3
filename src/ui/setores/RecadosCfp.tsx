import { useState, type FormEvent } from 'react';
import { apagarRecadoCfp, enviarRecadoCfp, observarRecadosCfp, type RecadoCfp } from '../../data/recados';
import { LIMITE_RECADO, quandoFoi, validarRecado } from '../../domain/recado';
import { db } from '../../lib/firebase';
import { useAoVivo } from '../../lib/useAoVivo';

/**
 * Recados do Cmt do P3. Para o CFP: só leitura, no alto da página.
 * Para a P/3 (podeEnviar): botão "Recado para o CFP" e os recados enviados, com Apagar.
 */
export function RecadosCfp({ podeEnviar = false }: { podeEnviar?: boolean }) {
  const recados = useAoVivo<RecadoCfp[]>((ok, erro) => observarRecadosCfp(db, ok, erro), [], 'Não foi possível carregar os recados.');
  const lista = recados.valor ?? [];
  const [escrevendo, setEscrevendo] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const problema = validarRecado(texto);
    setErro(problema);
    if (problema) return;
    setEnviando(true);
    try {
      await enviarRecadoCfp(db, texto);
      setTexto('');
      setEscrevendo(false);
      setAviso('Recado enviado. O CFP já vê na página dele.');
    } catch {
      setErro('Não foi possível enviar. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  async function apagar(id: string) {
    setAviso('');
    try {
      await apagarRecadoCfp(db, id);
    } catch {
      setAviso('Não foi possível apagar o recado.');
    }
  }

  if (!podeEnviar && lista.length === 0 && !recados.erro) return null;

  return (
    <section className="painel recados-cfp" aria-label="Recados para o CFP">
      {podeEnviar && (
        <div className="painel-cabecalho">
          <h2>Recados para o CFP</h2>
          {!escrevendo && (
            <button className="botao destaque" type="button" onClick={() => { setEscrevendo(true); setAviso(''); }}>
              ✉️ Recado para o CFP
            </button>
          )}
        </div>
      )}
      {podeEnviar && escrevendo && (
        <form className="cartao-recado" onSubmit={enviar} noValidate>
          <label className="campo">
            Recado (aparece para o CFP como "Recado do Cmt do P3")
            <textarea rows={4} maxLength={LIMITE_RECADO} value={texto} autoFocus onChange={(e) => setTexto(e.target.value)} />
            {erro && <span className="erro-campo">{erro}</span>}
          </label>
          <div className="acoes-linha">
            <button className="botao secundario" type="button" onClick={() => { setEscrevendo(false); setErro(''); }}>
              Cancelar
            </button>
            <button className="botao destaque" type="submit" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar recado'}
            </button>
          </div>
        </form>
      )}
      {aviso && (
        <p className="mensagem aviso" role="status">
          {aviso}
        </p>
      )}
      {recados.erro && <p className="mensagem erro">{recados.erro}</p>}
      {podeEnviar && !recados.carregando && lista.length === 0 && <p className="vazio">Nenhum recado enviado.</p>}
      <ul className="lista lista-recados">
        {lista.map((r) => (
          <li key={r.id}>
            <article className="cartao-recado" aria-label="Recado do Cmt do P3">
              <span className="item-topo">
                <strong>📢 Recado do Cmt do P3</strong>
                <span className="pendente-data">{quandoFoi(r.criadoEm)}</span>
              </span>
              <p className="recado-texto">{r.texto}</p>
              {podeEnviar && (
                <button className="botao secundario" type="button" onClick={() => apagar(r.id)}>
                  Apagar recado
                </button>
              )}
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
