import type { TipoSaida } from './listas';

// Numeração das demandas.
// - Até 2026: um número só, sequencial (Nº 2151, 2152…), no contador "contadores/demandas".
// - A partir de 2027: além do nº interno (que continua único e é o id da demanda), cada tipo de saída
//   tem a sua sequência, que volta para 001 todo ano: OFÍCIO 8BPMM-001/03/27 (03 = nº da seção, fixo; 27 = ano).
//   O contador de cada tipo fica em "contadores/tipo_{ano}_{TIPO}" e é criado sozinho no 1º uso do ano.

export const ANO_NUMERACAO_POR_TIPO = 2027;
export const PREFIXO_DOCUMENTO = '8BPMM-';
/** Número da seção (P/3): fixo no número de todo documento. */
export const NUMERO_SECAO = '03';
export const ID_CONTADOR_GERAL = 'demandas';

export function anoDe(dataISO: string): number {
  return Number(dataISO.slice(0, 4));
}

export function usaNumeracaoPorTipo(dataEntrada: string): boolean {
  return anoDe(dataEntrada) >= ANO_NUMERACAO_POR_TIPO;
}

/** "ORDEM DE SERVIÇO" -> "ORDEM_DE_SERVICO" (id de documento sem acento nem espaço). */
export function slugTipo(tipo: string): string {
  return tipo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function idContadorTipo(ano: number, tipo: TipoSaida | string): string {
  return `tipo_${ano}_${slugTipo(tipo)}`;
}

/** OFÍCIO, 1, 2027-08-10 -> "OFÍCIO 8BPMM-001/03/27" (03 = seção; o ano vem da data de entrada). */
export function formatarNumeroDocumento(tipo: string, sequencia: number, dataEntrada: string): string {
  const ano = dataEntrada.slice(2, 4);
  return `${tipo} ${PREFIXO_DOCUMENTO}${String(sequencia).padStart(3, '0')}/${NUMERO_SECAO}/${ano}`;
}

/** Como o número aparece nas listas: o nº do documento (2027 em diante) ou "Nº 2151". */
export function numeroExibido(d: { numero: number; numeroDocumento?: string }): string {
  return d.numeroDocumento || `Nº ${d.numero}`;
}

/** Nome de um contador para a tela do Administrador. */
export function rotuloContador(id: string, tipos: readonly string[]): string {
  if (id === ID_CONTADOR_GERAL) return 'Geral (nº interno)';
  const m = /^tipo_(\d{4})_(.+)$/.exec(id);
  if (!m) return id;
  const tipo = tipos.find((t) => slugTipo(t) === m[2]) ?? m[2];
  return `${tipo} (${m[1]})`;
}
