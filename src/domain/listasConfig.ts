import { CATEGORIAS, MEIOS_SAIDA, ORIGENS, RESPONSAVEIS, TIPOS_SAIDA } from './listas';

// Manutenção das listas do numerador (as "validações de dados" da planilha antiga), feita na aba Administrador.
// Fica em config/listas. Sem esse documento valem as listas padrão de listas.ts.
// Retirar um item só o tira das opções das demandas novas: as demandas antigas continuam valendo com ele,
// e dá para reativar depois. Itens usados pelo sistema (🔒) não podem ser retirados.

export type ChaveLista = 'origens' | 'tiposSaida' | 'meiosSaida' | 'categorias' | 'responsaveis';
export type ItemLista = { valor: string; ativo: boolean };
export type Listas = Record<ChaveLista, ItemLista[]>;

export const INFO_LISTAS: readonly { chave: ChaveLista; titulo: string }[] = [
  { chave: 'tiposSaida', titulo: 'Tipo de saída' },
  { chave: 'categorias', titulo: 'Categoria' },
  { chave: 'responsaveis', titulo: 'Responsável' },
  { chave: 'origens', titulo: 'Origem' },
  { chave: 'meiosSaida', titulo: 'Meio de saída' },
];

const PADRAO: Record<ChaveLista, readonly string[]> = {
  origens: ORIGENS,
  tiposSaida: TIPOS_SAIDA,
  meiosSaida: MEIOS_SAIDA,
  categorias: CATEGORIAS,
  responsaveis: RESPONSAVEIS,
};

/** Usados pelo sistema (padrões do formulário, pendentes, Checklist Operações, processo SEI). */
export const ITENS_FIXOS: Record<ChaveLista, readonly string[]> = {
  origens: ['E-mail', 'SEI', 'Ordem Verbal'],
  tiposSaida: ['OFÍCIO', 'ORDEM DE SERVIÇO', 'ORDEM DE OPERAÇÕES'],
  meiosSaida: ['SEI'],
  categorias: ['Operações Policiais', 'Outras Demandas'],
  responsaveis: [],
};

export const TAMANHO_MAXIMO_ITEM = 60;

export function listasPadrao(): Listas {
  const l = {} as Listas;
  for (const { chave } of INFO_LISTAS) l[chave] = PADRAO[chave].map((valor) => ({ valor, ativo: true }));
  return l;
}

/** Lê o documento do banco com cuidado: o que faltar ou vier quebrado volta para o padrão. */
export function lerListas(bruto: unknown): Listas {
  const base = listasPadrao();
  const doc = (bruto ?? {}) as Partial<Record<ChaveLista, unknown>>;
  for (const { chave } of INFO_LISTAS) {
    const lista = doc[chave];
    if (!Array.isArray(lista)) continue;
    const itens = lista
      .filter((i): i is ItemLista => !!i && typeof i.valor === 'string' && i.valor.trim() !== '')
      .map((i) => ({ valor: i.valor, ativo: i.ativo !== false }));
    // Os itens do sistema nunca somem nem ficam retirados.
    for (const fixo of ITENS_FIXOS[chave]) {
      const achado = itens.find((i) => i.valor === fixo);
      if (achado) achado.ativo = true;
      else itens.push({ valor: fixo, ativo: true });
    }
    base[chave] = itens;
  }
  return base;
}

/** Opções do formulário: os ativos e, se a demanda já tinha um item retirado, ele também (para não perder). */
export function opcoesDoCampo(listas: Listas, chave: ChaveLista, atual = ''): string[] {
  const ativos = listas[chave].filter((i) => i.ativo).map((i) => i.valor);
  return atual && !ativos.includes(atual) ? [...ativos, atual] : ativos;
}

/** Todos os conhecidos (ativos e retirados): servem para validar as demandas antigas. */
export function conhecidos(listas: Listas, chave: ChaveLista): string[] {
  return listas[chave].map((i) => i.valor);
}

export function ehFixo(chave: ChaveLista, valor: string): boolean {
  return ITENS_FIXOS[chave].includes(valor);
}

function igual(a: string, b: string): boolean {
  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  return n(a) === n(b);
}

/** Inclui no fim da lista. Devolve a lista nova ou a mensagem de erro. */
export function adicionarItem(lista: readonly ItemLista[], texto: string): ItemLista[] | string {
  const valor = texto.trim().replace(/\s+/g, ' ');
  if (!valor) return 'Digite o item.';
  if (valor.length > TAMANHO_MAXIMO_ITEM) return `Use no máximo ${TAMANHO_MAXIMO_ITEM} letras.`;
  const repetido = lista.find((i) => igual(i.valor, valor));
  if (repetido) return repetido.ativo ? 'Esse item já está na lista.' : 'Esse item foi retirado: use "Reativar".';
  return [...lista, { valor, ativo: true }];
}

/** Retirar / reativar. */
export function alternarItem(chave: ChaveLista, lista: readonly ItemLista[], valor: string): ItemLista[] | string {
  if (ehFixo(chave, valor)) return 'Esse item é usado pelo sistema e não pode ser retirado.';
  if (!lista.some((i) => i.valor === valor)) return 'Item não encontrado.';
  return lista.map((i) => (i.valor === valor ? { ...i, ativo: !i.ativo } : i));
}

/** Sobe (-1) ou desce (+1) na ordem das opções. */
export function moverItem(lista: readonly ItemLista[], valor: string, passo: -1 | 1): ItemLista[] {
  const i = lista.findIndex((x) => x.valor === valor);
  const j = i + passo;
  if (i < 0 || j < 0 || j >= lista.length) return [...lista];
  const nova = [...lista];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  return nova;
}
