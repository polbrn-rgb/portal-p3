import { idRac, temCrimes, type Alerta, type RacDados, type UnidadeRac } from './rac';

// RAC → prints do painel da Coordenadoria Operacional. Os prints entram só como imagem nos slides:
// os números são sempre digitados pela Cia (a leitura automática dos prints foi retirada por não ser confiável).

export const SLOTS_PRINT = [
  { id: 'rvPainel', delito: 'rouboVeiculo', tipo: 'painel', rotulo: 'Roubo de veículo — Indicadores Criminais' },
  { id: 'rvMapa', delito: 'rouboVeiculo', tipo: 'mapa', rotulo: 'Roubo de veículo — Painel de Roubo e Furto de Veículo' },
  { id: 'fvPainel', delito: 'furtoVeiculo', tipo: 'painel', rotulo: 'Furto de veículo — Indicadores Criminais' },
  { id: 'fvMapa', delito: 'furtoVeiculo', tipo: 'mapa', rotulo: 'Furto de veículo — Painel de Roubo e Furto de Veículo' },
  { id: 'roPainel', delito: 'rouboOutros', tipo: 'painel', rotulo: 'Roubo outros — Indicadores Criminais' },
  { id: 'roMapa', delito: 'rouboOutros', tipo: 'mapa', rotulo: 'Roubo outros — Painel de Roubos' },
  { id: 'foPainel', delito: 'furtosOutros', tipo: 'painel', rotulo: 'Furto outros — Indicadores Criminais' },
] as const;
export type SlotPrint = (typeof SLOTS_PRINT)[number]['id'];
export const IDS_SLOTS: readonly string[] = SLOTS_PRINT.map((s) => s.id);

/** Cia: os 7 prints. Batalhão: só os 4 painéis (como no RAC BTL). Força Tática: nenhum. */
export function slotsDaUnidade(u: UnidadeRac): readonly (typeof SLOTS_PRINT)[number][] {
  if (!temCrimes(u)) return [];
  return u === 'btl' ? SLOTS_PRINT.filter((s) => s.tipo === 'painel') : SLOTS_PRINT;
}
export const idPrint = (mes: string, u: UnidadeRac, slot: SlotPrint) => `${idRac(mes, u)}_${slot}`;

export type PrintSalvo = { slot: SlotPrint };

/** Erro (impede o envio): falta print da unidade. */
export function conferirPrints(d: RacDados, prints: readonly PrintSalvo[]): Alerta[] {
  return slotsDaUnidade(d.unidade)
    .filter((s) => !prints.some((p) => p.slot === s.id))
    .map((s) => ({ id: `prints.${s.id}`, nivel: 'erro' as const, campo: `prints.${s.id}`, mensagem: `Envie o print: ${s.rotulo}.` }));
}

/** Mensagem que diz por que o print não foi (em vez de uma mensagem genérica). */
export function motivoDoErroDoPrint(etapa: 'preparar' | 'enviar', e: unknown): string {
  if (etapa === 'preparar') return 'Esse arquivo não abriu como imagem. Escolha o print (PNG ou JPG) e tente de novo.';
  const codigo = (e as { code?: string } | null)?.code ?? '';
  if (codigo.includes('permission-denied'))
    return 'O banco recusou o print: o RAC deste mês pode ter sido encerrado ou as regras do portal ainda não foram publicadas. Avise a P/3.';
  if (codigo.includes('unavailable') || codigo.includes('deadline-exceeded')) return 'Sem conexão com o portal agora. Tente de novo em instantes.';
  return `Não foi possível enviar o print (${codigo || 'erro desconhecido'}). Tente de novo; se repetir, avise a P/3.`;
}
