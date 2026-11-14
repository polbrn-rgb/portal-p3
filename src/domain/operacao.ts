import { ehDataISO } from './datas';
import type { Demanda } from './demanda';
import type { PedidoEfetivo } from './efetivo';
import type { PlanilhaResultado } from './resultado';

// Checklist Operações: toda demanda "ORDEM DE SERVIÇO" + "Operações Policiais" vira uma operação a acompanhar.

export const TIPO_SAIDA_OPERACAO = 'ORDEM DE SERVIÇO';
export const CATEGORIA_OPERACAO = 'Operações Policiais';

export function ehOperacao(d: { tipoSaida: string; categoria: string }): boolean {
  return d.tipoSaida === TIPO_SAIDA_OPERACAO && d.categoria === CATEGORIA_OPERACAO;
}

export const ITENS_CHECKLIST = [
  { id: 'osOk', rotulo: 'Ordem de Serviço ok' },
  { id: 'efetivoOk', rotulo: 'Solicitação de efetivo' },
  { id: 'pastaOk', rotulo: 'Pasta do CFP (OS incluída)' },
  { id: 'mapaForcaOk', rotulo: 'Mapa força Sicoordop' },
  { id: 'resultadoOk', rotulo: 'Planilha de resultado' },
] as const;

export type ItemChecklist = (typeof ITENS_CHECKLIST)[number]['id'];

/** O que a P/3 marca (coleção "operacoes", id = número da demanda). */
export type Checklist = Record<ItemChecklist, boolean> & {
  /** Protocolo do Mapa Força no Sicoordop, um por dia de operação (AAAA-MM-DD -> nº). */
  protocolos: Record<string, string>;
  concluida: boolean;
  /** Preenchido ao enviar a solicitação de efetivo às Cias. */
  efetivo?: PedidoEfetivo;
  /** Cópia do modelo de resultados na pasta do CFP (o motor cria). */
  planilha?: PlanilhaResultado;
};

export function checklistVazio(): Checklist {
  return {
    osOk: false,
    efetivoOk: false,
    pastaOk: false,
    mapaForcaOk: false,
    resultadoOk: false,
    protocolos: {},
    concluida: false,
  };
}

/** Junta o que veio do banco com os valores padrão (documento pode nem existir ainda). */
export function lerChecklist(dados: Partial<Checklist> | undefined): Checklist {
  const base = checklistVazio();
  if (!dados) return base;
  const c = { ...base };
  for (const item of ITENS_CHECKLIST) c[item.id] = dados[item.id] === true;
  c.protocolos = { ...(dados.protocolos ?? {}) };
  c.concluida = dados.concluida === true;
  if (dados.efetivo) c.efetivo = dados.efetivo;
  if (dados.planilha) c.planilha = dados.planilha;
  return c;
}

export function progresso(c: Checklist): { feitos: number; total: number } {
  return { feitos: ITENS_CHECKLIST.filter((i) => c[i.id]).length, total: ITENS_CHECKLIST.length };
}

const LIMITE_DIAS = 60;

/** Dias de operação = do Início ao Término Btl (inclusive). Sem as duas datas, nenhum dia. */
export function diasDaOperacao(inicio: string, termino: string): string[] {
  if (!ehDataISO(inicio)) return [];
  const fim = ehDataISO(termino) ? termino : inicio;
  if (fim < inicio) return [inicio];
  const dias: string[] = [];
  const d = new Date(`${inicio}T12:00:00Z`);
  while (dias.length < LIMITE_DIAS) {
    const iso = d.toISOString().slice(0, 10);
    dias.push(iso);
    if (iso >= fim) break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dias;
}

/** Quantos dias já têm protocolo do Mapa Força. */
export function protocolosPreenchidos(c: Checklist, dias: string[]): number {
  return dias.filter((dia) => (c.protocolos[dia] ?? '').trim() !== '').length;
}

export type Operacao = { demanda: Demanda; checklist: Checklist };

/** Operações em andamento: as não concluídas, a que começa primeiro em cima (sem data vai para o fim). */
export function operacoesEmAndamento(
  demandas: Demanda[],
  checklists: Record<string, Partial<Checklist>>,
): Operacao[] {
  return demandas
    .filter(ehOperacao)
    .map((demanda) => ({ demanda, checklist: lerChecklist(checklists[demanda.id]) }))
    .filter((o) => !o.checklist.concluida)
    .sort((a, b) => {
      const ia = a.demanda.inicioBtl || '9999';
      const ib = b.demanda.inicioBtl || '9999';
      return ia === ib ? b.demanda.numero - a.demanda.numero : ia.localeCompare(ib);
    });
}

/** Link da pasta do CFP gerada pelo motor (se já existir). */
export function pastaCfpDa(d: Demanda): string {
  return d.automacao?.cfp?.pastaUrl || d.automacao?.cfpPasta || '';
}
