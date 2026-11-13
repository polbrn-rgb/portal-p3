// Unidades que têm login e recebem encaminhamento (ordem oficial de exibição).
export const UNIDADES = [
  { id: '1cia', sigla: '1ª CIA', nome: '1ª Companhia' },
  { id: '2cia', sigla: '2ª CIA', nome: '2ª Companhia' },
  { id: '3cia', sigla: '3ª CIA', nome: '3ª Companhia' },
  { id: '4cia', sigla: '4ª CIA', nome: '4ª Companhia' },
  { id: '5cia', sigla: '5ª CIA', nome: '5ª Companhia' },
  { id: '6cia', sigla: '6ª CIA', nome: '6ª Companhia' },
  { id: 'ft', sigla: 'CIA FT', nome: 'Força Tática' },
] as const;

// Destinos só de registro: aparecem na demanda, mas não têm login nem encaminhamento.
export const DESTINOS_REGISTRO = [
  { id: 'secop', sigla: 'Sec Op M11' },
  { id: 'gt', sigla: 'GT M11' },
  { id: 'spjmd', sigla: 'SPJMD' },
  { id: 'cfp', sigla: 'CFP' },
  { id: 'p1', sigla: 'P/1' },
  { id: 'p2', sigla: 'P/2' },
  { id: 'p4', sigla: 'P/4' },
  { id: 'p5', sigla: 'P/5' },
  { id: 'dejem', sigla: 'DEJEM' },
  { id: 'subfrota', sigla: 'Sub Frota' },
  { id: '21bpmm', sigla: '21º BPM/M' },
  { id: 'outros', sigla: 'OUTROS' },
] as const;

export type UnidadeId = (typeof UNIDADES)[number]['id'];
export type RegistroId = (typeof DESTINOS_REGISTRO)[number]['id'];
export type DestinoId = UnidadeId | RegistroId | 'TODAS';

/** Ordem oficial de exibição de todos os destinos. */
export const ORDEM_DESTINOS: readonly DestinoId[] = [
  'TODAS',
  ...UNIDADES.map((u) => u.id),
  ...DESTINOS_REGISTRO.map((d) => d.id),
];

export function siglaDoDestino(id: DestinoId): string {
  if (id === 'TODAS') return 'TODAS';
  return [...UNIDADES, ...DESTINOS_REGISTRO].find((d) => d.id === id)?.sigla ?? id;
}

const IDS_UNIDADES = UNIDADES.map((u) => u.id) as UnidadeId[];
const IDS_VALIDOS = new Set<string>([...IDS_UNIDADES, ...DESTINOS_REGISTRO.map((d) => d.id), 'TODAS']);

/**
 * Recebe os destinos marcados na demanda e devolve as unidades que devem
 * receber encaminhamento: "TODAS" vira as 7 unidades, repetidos são
 * removidos, destinos só de registro são ignorados e a ordem é a oficial.
 */
export function unidadesParaEncaminhar(destinos: readonly DestinoId[]): UnidadeId[] {
  const desconhecido = destinos.find((d) => !IDS_VALIDOS.has(d));
  if (desconhecido !== undefined) throw new Error(`Destino desconhecido: ${desconhecido}`);
  if (destinos.includes('TODAS')) return [...IDS_UNIDADES];
  const marcados = new Set<string>(destinos);
  return IDS_UNIDADES.filter((id) => marcados.has(id));
}
