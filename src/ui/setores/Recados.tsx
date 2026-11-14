import { useState, type FormEvent } from 'react';
import { apagarRecado, enviarRecado, observarRecados, type Recado, type SetorRecado } from '../../data/recados';
import { LIMITE_RECADO, quandoFoi, validarRecado } from '../../domain/recado';
import { db } from '../../lib/firebase';
import { useAoVivo } from '../../lib/useAoVivo';

const NOMES: Record<SetorRecado, { titulo: string; botao: string }> = {
  cfp: { titulo: 'Recados para o CFP', botao: '✉️ Recado para o CFP' },
  sala: { titulo: 'Recados para a Sala de Operações', botao: '✉️ Recado para a Sala' },
};

/**
 * Recados do Cmt do P3. Para o setor (CFP ou Sala): só leitura, no alto da página.
 * Para a P/3 (podeEnviar): botão "Recado para ..." e os recados enviados, com Apagar.
 */
export function Recados({ setor, podeEnviar = false }: { setor: SetorRecado; podeEnviar?: boolean }) {
  const nome = NOMES[setor];
  const recados = useAoVivo<Recado[]>((ok, erro) => observarRecados(db, setor, ok, erro), [setor], 'Não foi possível carregar os recados.');
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
      await enviarRecado(db, setor, texto);
      setTexto('');
      setEscrevendo(false);
      setAviso(`Recado enviado. ${setor === 'cfp' ? 'O CFP' : 'A Sala de Operações'} já vê na página.`);
    } catch {
      setErro('Não foi possível enviar. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  async function apagar(id: string) {
    setAviso('');
    try {
      await apagarRecado(db, setor, id);
    } catch {
      setAviso('Não foi possível apagar o recado.');
    }
  }

  if (!podeEnviar && lista.length === 0 && !recados.erro) return null;

  return (
    <section className="painel recados" aria-label={nome.titulo}>
      {podeEnviar && (
        <div className="painel-cabecalho">
          <h2>{nome.titulo}</h2>
          {!escrevendo && (
            <button className="botao destaque" type="button" onClick={() => { setEscrevendo(true); setAviso(''); }}>
              {nome.botao}
            </button>
          )}
        </div>
      )}
      {podeEnviar && escrevendo && (
        <form className="cartao-recado" onSubmit={enviar} noValidate>
          <label className="campo">
            Recado (aparece como "Recado do Cmt do P3")
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
