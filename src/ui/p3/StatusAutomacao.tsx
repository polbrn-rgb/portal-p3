import { observarDemanda } from '../../data/demandas';
import { formatarData } from '../../domain/datas';
import type { Demanda } from '../../domain/demanda';
import type { EventoFeito } from '../../domain/automacao';
import { db } from '../../lib/firebase';
import { useAoVivo } from '../../lib/useAoVivo';

function Linha({ rotulo, feito, pedido }: { rotulo: string; feito?: EventoFeito | null; pedido: boolean }) {
  if (!pedido && !feito) return null;
  let texto: string;
  if (feito) {
    texto = feito.inicio === feito.fim ? formatarData(feito.inicio) : `${formatarData(feito.inicio)} a ${formatarData(feito.fim)}`;
    texto = `na agenda (${texto})`;
  } else {
    texto = 'aguardando';
  }
  return (
    <li>
      <strong>{rotulo}:</strong> {feito ? '✅' : '⏳'} {texto}
    </li>
  );
}

/** Mostra o que o Apps Script já fez (agenda e pasta), atualizando sozinho. */
export function StatusAutomacao({ demandaId }: { demandaId: string }) {
  const atual = useAoVivo<Demanda | null>((ok, erro) => observarDemanda(db, demandaId, ok, erro), [demandaId]);
  const d = atual.valor;
  if (!d) return null;
  const a = d.automacao ?? {};
  const pedidoCfp = d.adicionarCFP && !!d.inicioBtl && !!d.terminoBtl;
  if (!d.prazoCPA && !d.prazoCia && !pedidoCfp && !a.agendaCPA && !a.agendaCia && !a.cfp) return null;

  return (
    <fieldset className="cartao grupo bloco-largo" aria-label="Agenda e pasta">
      <legend>Agenda e pasta</legend>
      <ul className="lista-status">
        <Linha rotulo="Prazo CPA" feito={a.agendaCPA} pedido={!!d.prazoCPA} />
        <Linha rotulo="Prazo Cia" feito={a.agendaCia} pedido={!!d.prazoCia} />
        <Linha rotulo="Agenda CFP" feito={a.cfp} pedido={pedidoCfp} />
      </ul>
      {a.cfp?.pastaUrl && (
        <a className="botao secundario" href={a.cfp.pastaUrl} target="_blank" rel="noreferrer">
          Abrir pasta CFP
        </a>
      )}
      {d.automacaoPendente && !a.erro && <p className="item-info">O Apps Script da P/3 atualiza a agenda em até 5 minutos.</p>}
      {a.erro && (
        <p className="mensagem erro" role="alert">
          Falha na agenda/pasta: {a.erro}. O Apps Script tenta de novo a cada 5 minutos.
        </p>
      )}
    </fieldset>
  );
}
