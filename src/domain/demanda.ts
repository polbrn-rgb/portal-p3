import { ehDataISO } from './datas';
import { CATEGORIAS, ORIGENS, RESPONSAVEIS, TIPOS_SAIDA, type Categoria, type Origem, type Responsavel, type TipoSaida } from './listas';
import { ORDEM_DESTINOS, UNIDADES, type DestinoId } from './unidades';

export type StatusDemanda = 'em_aberto' | 'concluido';

// Campos que a P/3 preenche (as colunas do numerador). Datas no formato AAAA-MM-DD.
export type DadosDemanda = {
  dataEntrada: string;
  origem: Origem;
  numeroOrigem: string;
  tipoSaida: TipoSaida | '';
  saida: string;
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
  resposta: string;
  categoria: Categoria | '';
  observacao: string;
  linkEvento: string;
};

export type Demanda = DadosDemanda & { id: string; numero: number; status: StatusDemanda };

export type ErrosDemanda = Partial<Record<keyof DadosDemanda, string>>;

export function demandaVazia(hoje: string): DadosDemanda {
  return {
    dataEntrada: hoje,
    origem: 'E-mail',
    numeroOrigem: '',
    tipoSaida: '',
    saida: '',
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
    resposta: '',
    categoria: '',
    observacao: '',
    linkEvento: '',
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
    resposta: d.resposta.trim(),
    observacao: d.observacao.trim(),
    linkEvento: d.linkEvento.trim(),
    destinos,
  };
}

function dataInvalida(valor: string): boolean {
  return valor !== '' && !ehDataISO(valor);
}

export function validarDemanda(d: DadosDemanda): ErrosDemanda {
  const erros: ErrosDemanda = {};

  if (!ehDataISO(d.dataEntrada)) erros.dataEntrada = 'Informe a data de entrada.';
  if (!(ORIGENS as readonly string[]).includes(d.origem)) erros.origem = 'Escolha a origem.';
  if (d.origem === 'SEI' && !d.numeroOrigem.trim()) erros.numeroOrigem = 'Informe o número do processo SEI.';
  if (!d.saida.trim()) erros.saida = 'Informe a saída (assunto).';
  if (!(CATEGORIAS as readonly string[]).includes(d.categoria)) erros.categoria = 'Escolha a categoria.';
  if (d.tipoSaida && !(TIPOS_SAIDA as readonly string[]).includes(d.tipoSaida)) erros.tipoSaida = 'Tipo de saída inválido.';
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
  if (d.linkEvento && !/^https?:\/\/\S+$/.test(d.linkEvento.trim())) {
    erros.linkEvento = 'O link precisa começar com http:// ou https://';
  }
  return erros;
}

/** Quais campos mudaram entre a versão salva e a editada (vai para o histórico). */
export function camposAlterados(antes: DadosDemanda, depois: DadosDemanda): (keyof DadosDemanda)[] {
  return (Object.keys(depois) as (keyof DadosDemanda)[]).filter(
    (campo) => JSON.stringify(antes[campo]) !== JSON.stringify(depois[campo]),
  );
}
