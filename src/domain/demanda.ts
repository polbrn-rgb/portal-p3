import type { Automacao } from './automacao';
import { ehDataISO } from './datas';
import {
  CATEGORIAS,
  MEIOS_SAIDA,
  ORIGENS,
  RESPONSAVEIS,
  RESPOSTAS,
  TIPOS_SAIDA,
  type Categoria,
  type MeioSaida,
  type Origem,
  type Responsavel,
  type RespostaSN,
  type TipoSaida,
} from './listas';
import { ORDEM_DESTINOS, UNIDADES, type DestinoId } from './unidades';

export type StatusDemanda = 'em_aberto' | 'concluido';

// Campos que a P/3 preenche (as colunas do numerador). Datas no formato AAAA-MM-DD.
// `saida` guarda a coluna "Demanda" (o resumo do assunto); `meioSaida` é a coluna "Saída" (SEI/E-mail/Físico).
export type DadosDemanda = {
  dataEntrada: string;
  origem: Origem | '';
  numeroOrigem: string;
  tipoSaida: TipoSaida | '';
  saida: string;
  meioSaida: MeioSaida | '';
  numeroSaida: string;
  destinos: DestinoId[];
  inicioBtl: string;
  terminoBtl: string;
  prazoCPA: string;
  prazoCia: string;
  adicionarCFP: boolean;
  agendaCPA: boolean;
  agendaCia: boolean;
  responsavel: Responsavel | '';
  resposta: RespostaSN;
  categoria: Categoria | '';
  observacao: string;
  linkEvento: boolean;
};

export type Demanda = DadosDemanda & {
  id: string;
  numero: number;
  status: StatusDemanda;
  /** Preenchido pelo Apps Script da P/3 (agenda, pasta CFP). */
  automacao?: Automacao;
  automacaoPendente?: boolean;
};

export type ErrosDemanda = Partial<Record<keyof DadosDemanda, string>>;

export function demandaVazia(hoje: string): DadosDemanda {
  return {
    dataEntrada: hoje,
    origem: '',
    numeroOrigem: '',
    tipoSaida: 'OFÍCIO',
    saida: '',
    meioSaida: 'SEI',
    numeroSaida: '',
    destinos: [],
    inicioBtl: '',
    terminoBtl: '',
    prazoCPA: '',
    prazoCia: '',
    adicionarCFP: false,
    agendaCPA: false,
    agendaCia: false,
    responsavel: '',
    resposta: 'Não',
    categoria: 'Outras Demandas',
    observacao: '',
    linkEvento: false,
  };
}

/** Só os campos do formulário, sem id/número/status (para comparar e gravar). */
export function dadosDe(d: Demanda): DadosDemanda {
  const base = demandaVazia('');
  const dados = { ...base };
  for (const campo of Object.keys(base) as (keyof DadosDemanda)[]) {
    (dados as Record<string, unknown>)[campo] = d[campo] ?? base[campo];
  }
  return dados;
}

const IDS_UNIDADE = new Set<string>(UNIDADES.map((u) => u.id));

/** Tira espaços e organiza os destinos: sem repetidos, na ordem oficial; com TODAS, as Cias saem. */
export function normalizarDemanda(d: DadosDemanda): DadosDemanda {
  const marcados = new Set<string>(d.destinos);
  const todas = marcados.has('TODAS');
  const destinos = ORDEM_DESTINOS.filter((id) => marcados.has(id) && !(todas && IDS_UNIDADE.has(id)));
  return {
    ...d,
    numeroOrigem: d.numeroOrigem.trim(),
    saida: d.saida.trim(),
    numeroSaida: d.numeroSaida.trim(),
    observacao: d.observacao.trim(),
    destinos,
  };
}

function dataInvalida(valor: string): boolean {
  return valor !== '' && !ehDataISO(valor);
}

export function validarDemanda(d: DadosDemanda): ErrosDemanda {
  const erros: ErrosDemanda = {};

  if (!ehDataISO(d.dataEntrada)) erros.dataEntrada = 'Informe a data de entrada.';
  if (d.origem && !(ORIGENS as readonly string[]).includes(d.origem)) erros.origem = 'Origem inválida.';
  if (d.origem === 'SEI' && !d.numeroOrigem.trim()) erros.numeroOrigem = 'Informe o número do processo SEI.';
  if (!d.saida.trim()) erros.saida = 'Informe a demanda (resumo).';
  if (!(CATEGORIAS as readonly string[]).includes(d.categoria)) erros.categoria = 'Escolha a categoria.';
  if (!(TIPOS_SAIDA as readonly string[]).includes(d.tipoSaida)) erros.tipoSaida = 'Escolha o tipo de saída.';
  if (d.meioSaida && !(MEIOS_SAIDA as readonly string[]).includes(d.meioSaida)) erros.meioSaida = 'Meio de saída inválido.';
  if (!(RESPOSTAS as readonly string[]).includes(d.resposta)) erros.resposta = 'Escolha Sim ou Não.';
  if (d.responsavel && !(RESPONSAVEIS as readonly string[]).includes(d.responsavel)) erros.responsavel = 'Responsável inválido.';

  for (const campo of ['inicioBtl', 'terminoBtl', 'prazoCPA', 'prazoCia'] as const) {
    if (dataInvalida(d[campo])) erros[campo] = 'Data inválida.';
  }
  if (!erros.prazoCia && d.prazoCia && d.prazoCPA && d.prazoCia > d.prazoCPA) {
    erros.prazoCia = 'O prazo da Cia não pode ser depois do prazo do CPA.';
  }
  if (!erros.terminoBtl && d.inicioBtl && d.terminoBtl && d.terminoBtl < d.inicioBtl) {
    erros.terminoBtl = 'O término não pode ser antes do início.';
  }
  // O evento do CFP vai do início ao término: sem as duas datas não dá para agendar.
  if (d.adicionarCFP && !erros.inicioBtl && !d.inicioBtl) erros.inicioBtl = 'Para o CFP, informe o início.';
  if (d.adicionarCFP && !erros.terminoBtl && !d.terminoBtl) erros.terminoBtl = 'Para o CFP, informe o término.';
  return erros;
}

/** Quais campos mudaram entre a versão salva e a editada (vai para o histórico). */
export function camposAlterados(antes: DadosDemanda, depois: DadosDemanda): (keyof DadosDemanda)[] {
  return (Object.keys(depois) as (keyof DadosDemanda)[]).filter(
    (campo) => JSON.stringify(antes[campo]) !== JSON.stringify(depois[campo]),
  );
}

/** Nome de cada campo como aparece na tela (para avisos e histórico). */
export const ROTULO_CAMPO: Record<keyof DadosDemanda, string> = {
  dataEntrada: 'Data de entrada',
  origem: 'Origem',
  numeroOrigem: 'Nº da origem',
  tipoSaida: 'Tipo de saída',
  saida: 'Demanda (resumo)',
  meioSaida: 'Meio de saída',
  numeroSaida: 'Nº da saída',
  destinos: 'Destinos',
  inicioBtl: 'Início Btl',
  terminoBtl: 'Término Btl',
  prazoCPA: 'Prazo CPA',
  prazoCia: 'Prazo Cia',
  adicionarCFP: 'Adicionar para o CFP',
  agendaCPA: 'Agenda CPA',
  agendaCia: 'Agenda Cia',
  responsavel: 'Responsável',
  resposta: 'Resposta?',
  categoria: 'Categoria',
  observacao: 'Observação',
  linkEvento: 'Link de evento / formulário',
};
