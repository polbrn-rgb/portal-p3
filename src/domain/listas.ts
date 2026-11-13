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
  'PAAVI',
  'PARTE',
  'PTAC',
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

export const MEIOS_SAIDA = ['SEI', 'E-mail', 'Físico'] as const;

export const RESPOSTAS = ['Não', 'Sim'] as const;

/** Planilha aberta quando a demanda tem link de evento/formulário. */
export const URL_PLANILHA_EVENTO =
  'https://docs.google.com/spreadsheets/d/1vhjgFRdWOWXmMngQvgd7UgqYQqiieh54h8g3w3zPVZk/edit?gid=519271515#gid=519271515';

export const RESPONSAVEIS = ['Cap Filipi', 'Sgt Sousa', 'Cb Pecorari', 'Cb Holanda', 'Cb Haffner', 'Sd Priscila'] as const;

export type Origem = (typeof ORIGENS)[number];
export type TipoSaida = (typeof TIPOS_SAIDA)[number];
export type Categoria = (typeof CATEGORIAS)[number];
export type Responsavel = (typeof RESPONSAVEIS)[number];
export type MeioSaida = (typeof MEIOS_SAIDA)[number];
export type RespostaSN = (typeof RESPOSTAS)[number];
