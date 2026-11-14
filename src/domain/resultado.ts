// Planilha de resultados: cópia do modelo na pasta do CFP. A Sala de Operações lança pelo portal
// e o motor (Apps Script) grava na coluna do dia: linha 3 = protocolo do resultado, demais = indicadores.

/** Uma linha de indicador da planilha (ex.: linha 9, "Pessoas Abordadas", grupo "OCOR. COMUNS"). */
export type CampoPlanilha = { linha: number; rotulo: string; grupo: string };

export type PlanilhaResultado = {
  status: 'pedida' | 'pronta' | 'erro';
  id?: string;
  url?: string;
  campos?: CampoPlanilha[];
  observacao?: string;
  /** Dias (AAAA-MM-DD) que estão na linha 1 da planilha. */
  dias?: string[];
  saida?: string;
  erro?: string;
};

/** Lançamento da Sala de Operações (coleção "resultados", id = numero_dia). */
export type Resultado = {
  numero: string;
  dia: string;
  protocoloResultado: string;
  valores: Record<string, number>;
  salvoPor: string;
  gravado: boolean;
  erro?: string;
};

export function idResultado(numero: string, dia: string): string {
  return `${numero}_${dia}`;
}

export function gruposDeCampos(campos: CampoPlanilha[]): { grupo: string; campos: CampoPlanilha[] }[] {
  const grupos: { grupo: string; campos: CampoPlanilha[] }[] = [];
  for (const c of campos) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.grupo === c.grupo) ultimo.campos.push(c);
    else grupos.push({ grupo: c.grupo, campos: [c] });
  }
  return grupos;
}

/** Campos em branco ficam de fora (não apagam o que já está na planilha); o resto vira número. */
export function valoresPreenchidos(texto: Record<string, string>): { valores: Record<string, number>; erro: string } {
  const valores: Record<string, number> = {};
  for (const [linha, v] of Object.entries(texto)) {
    const limpo = v.trim().replace(',', '.');
    if (!limpo) continue;
    const n = Number(limpo);
    if (!Number.isFinite(n) || n < 0) return { valores: {}, erro: 'Use só números (sem sinal negativo).' };
    valores[linha] = n;
  }
  return { valores, erro: '' };
}

/** As planilhas que têm o dia escolhido. */
export function operacoesDoDia<T extends { planilha: PlanilhaResultado }>(lista: T[], dia: string): T[] {
  return lista.filter((o) => o.planilha.status === 'pronta' && (o.planilha.dias ?? []).includes(dia));
}

/** A planilha precisa ser atualizada quando os dias da operação mudaram depois de gerada. */
export function diasMudaram(planilha: PlanilhaResultado | undefined, dias: string[]): boolean {
  if (planilha?.status !== 'pronta') return false;
  return (planilha.dias ?? []).join(',') !== dias.join(',');
}
