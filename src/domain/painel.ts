import { diasEntre, somarDias } from './datas';
import type { Demanda } from './demanda';
import { andamentoPorDemanda, encAtrasado, STATUS_PENDENTES, type Encaminhamento } from './encaminhamento';
import { situacaoDaDemanda } from './situacao';
import { UNIDADES, type UnidadeId } from './unidades';

export type LinhaCia = { unidade: UnidadeId; sigla: string; pendentes: number; atrasadas: number; aguardandoAceite: number };
export type Prazo = { demandaId: string; numero: number; saida: string; data: string; tipo: 'CPA' | 'Cia'; dias: number };

export type Painel = {
  atrasadas: number;
  venceHoje: number;
  proximos3: number;
  ciasAtrasadas: number;
  aguardandoAceite: number;
  porCia: LinhaCia[];
  proximosPrazos: Prazo[];
};

/**
 * Resumo para o painel da P/3, a partir do que a lista já carrega
 * (demandas abertas + encaminhamentos não finalizados): não gasta leitura extra.
 */
export function montarPainel(abertas: readonly Demanda[], encs: readonly Encaminhamento[], hoje: string): Painel {
  const andamento = andamentoPorDemanda(encs);
  const daqui3 = somarDias(hoje, 3);
  const p: Painel = { atrasadas: 0, venceHoje: 0, proximos3: 0, ciasAtrasadas: 0, aguardandoAceite: 0, porCia: [], proximosPrazos: [] };

  for (const d of abertas) {
    const s = situacaoDaDemanda(d, hoje, andamento[d.id] ?? { pendentes: 0, respondidas: 0 });
    if (s === 'atrasado') p.atrasadas++;
    if (s === 'vence_hoje') p.venceHoje++;
    if (s === 'cia_atrasada') p.ciasAtrasadas++;
    if (d.prazoCPA > hoje && d.prazoCPA <= daqui3) p.proximos3++;
    // Próximos prazos: o do CPA e o da Cia (se ainda houver Cia devendo), de hoje em diante.
    if (d.prazoCPA && d.prazoCPA >= hoje) {
      p.proximosPrazos.push({ demandaId: d.id, numero: d.numero, saida: d.saida, data: d.prazoCPA, tipo: 'CPA', dias: diasEntre(hoje, d.prazoCPA) });
    }
    if (d.prazoCia && d.prazoCia >= hoje && (andamento[d.id]?.pendentes ?? 0) > 0) {
      p.proximosPrazos.push({ demandaId: d.id, numero: d.numero, saida: d.saida, data: d.prazoCia, tipo: 'Cia', dias: diasEntre(hoje, d.prazoCia) });
    }
  }
  p.proximosPrazos.sort((a, b) => a.data.localeCompare(b.data) || a.numero - b.numero);
  p.proximosPrazos = p.proximosPrazos.slice(0, 10);

  p.porCia = UNIDADES.map((u) => {
    const daCia = encs.filter((e) => e.unidadeId === u.id);
    return {
      unidade: u.id,
      sigla: u.sigla,
      pendentes: daCia.filter((e) => STATUS_PENDENTES.includes(e.status)).length,
      atrasadas: daCia.filter((e) => encAtrasado(e, hoje)).length,
      aguardandoAceite: daCia.filter((e) => e.status === 'respondido').length,
    };
  });
  p.aguardandoAceite = p.porCia.reduce((t, c) => t + c.aguardandoAceite, 0);
  return p;
}
