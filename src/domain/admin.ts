// Aba Administrador: o que o botão "Zerar portal" apaga e o que fica.

/** Apagadas por inteiro na zeragem (tudo que foi lançado nos testes). */
export const COLECOES_ZERAR = [
  'encaminhamentos',
  'caixaEntrada',
  'operacoes',
  'resultados',
  'solicitacoesEfetivo',
  'controleOperacoes',
  'relatorios',
  'docsMensais',
  'docsMensaisHistorico',
  'eap',
  'eapRespostas',
  'iccs',
  'respostasIcc',
  'racMeses',
  'racs',
  'racPrints',
  'racPrintsDados',
  'racArquivo',
  'arquivos',
  'fotosTds',
  'fotosTdsDados',
  'recadosCfp',
  'recadosSala',
  'emails',
  'agenda',
] as const;

/**
 * Ficam: banco de efetivo, configurações, a cópia da agenda do CFP (o motor mantém igual à agenda real)
 * o estado das planilhas dos Documentos Mensais (acompanha as planilhas do Drive, que a zeragem não mexe)
 * e as assinaturas dos e-mails.
 */
export const COLECOES_MANTIDAS = ['efetivo', 'config', 'agendaCfp', 'estadoDocsMensais', 'assinaturas'] as const;

export const PALAVRA_CONFIRMACAO = 'ZERAR';

/** Texto digitado -> último número usado (inteiro >= 0), ou mensagem de erro. */
export function lerUltimoNumero(texto: string): number | string {
  const t = texto.trim();
  if (!/^\d{1,7}$/.test(t)) return 'Informe um número inteiro (0 ou mais).';
  return Number(t);
}

/** Dividido em lotes de até 400 gravações (o limite do Firestore é 500 por lote). */
export function emLotes<T>(itens: readonly T[], tamanho = 400): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}
