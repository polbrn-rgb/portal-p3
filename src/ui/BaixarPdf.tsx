import { useState } from 'react';
import { salvarNoAparelho } from '../data/arquivos';
import { db } from '../lib/firebase';

/** Botão "📄 nome.pdf" que baixa o PDF guardado no banco (também no celular). */
export function BaixarPdf({ id, nome }: { id: string; nome: string }) {
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState('');

  async function baixar() {
    setBaixando(true);
    setErro('');
    try {
      await salvarNoAparelho(db, id);
    } catch {
      setErro('Não foi possível baixar o PDF. Ele pode ter sido apagado ao finalizar a demanda.');
    }
    setBaixando(false);
  }

  return (
    <span className="baixar-pdf">
      <button className="botao-link" type="button" onClick={baixar} disabled={baixando}>
        📄 {baixando ? 'Baixando…' : nome}
      </button>
      {erro && (
        <span className="mensagem erro" role="alert">
          {erro}
        </span>
      )}
    </span>
  );
}
