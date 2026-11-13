// Opções das listas do numerador (planilha de controle de demandas).

export const ORIGENS = ['E-mail', 'SEI', 'Pessoal', 'Ordem Verbal', 'Documento Físico'] as const;

export const TIPOS_SAIDA = [
  'ATA DE REUNIÃO',
  'DESPACHO',
  'MEMORANDO',
  'MSG ELETRÔNICA',
  'NOTA DE INSTRUÇÃO',
  'NOTA DE SERVIÇO',
  'NOTA PARA BOLETIM INTERNO',
  'OFÍCIO',
  'ORDEM COMPLEMENTAR',
  'ORDEM DE OPERAÇÕES',
  'ORDEM DE SERVIÇO',
  'PARTE',
  'RECIBO',
  'RELATÓRIO',
  'TERMO DE ENCERRAMENTO',
] as const;

export const CATEGORIAS = [
  'Operações Policiais',
  'Reintegração de Posse',
  'Escoltas',
  'Documentos Mensais',
  'Pedidos de Policiamento',
  'Aperfeiçoamento',
  'DEJEM',
  'Outras Demandas',
  'RAC',
] as const;

export const RESPONSAVEIS = ['Cap Filipi', 'Sgt Sousa', 'Cb Pecorari', 'Cb Holanda', 'Cb Haffner', 'Sd Priscila'] as const;

export type Origem = (typeof ORIGENS)[number];
export type TipoSaida = (typeof TIPOS_SAIDA)[number];
export type Categoria = (typeof CATEGORIAS)[number];
export type Responsavel = (typeof RESPONSAVEIS)[number];
