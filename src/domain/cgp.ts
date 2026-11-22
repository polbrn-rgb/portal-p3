// CGP de cada Cia/FT: página administrada pela própria Cia (não tem login próprio).
// - Missões: demandas enviadas para o CGP com o período (de/até), vindas do Numerador da Cia ou das
//   demandas que a P/3 mandou para a Cia. Uma demanda só vai uma vez (o id é fixo: não duplica serviço).
// - Fotos: importação sem limite, com descrição, local e observação; fica gravado quem importou e quando.
// - Recados: a Cia escreve para o CGP.
import { ehDataISO, formatarData, somarDias } from './datas';
import type { UnidadeId } from './unidades';

export const COLECAO_MISSOES_CGP = 'cgpMissoes';
export const COLECAO_RECADOS_CGP = 'recadosCgp';
/** Ordem de serviço da missão (mesmo id da missão): PDF em partes (ordensCgp/{id}/partes/{n}) ou link do Google Drive. */
export const COLECAO_ORDENS_CGP = 'ordensCgp';
export const COLECAO_FOTOS_CGP = 'fotosCgp';
export const COLECAO_FOTOS_CGP_DADOS = 'fotosCgpDados';
/** Fotos do CGP que a Cia encaminhou à P/3: cópia (mesmo id da foto do CGP), a Cia e o CGP apagam as deles sem tirar da P/3. */
export const COLECAO_FOTOS_ENCAMINHADAS = 'fotosEncaminhadas';
export const COLECAO_FOTOS_ENCAMINHADAS_DADOS = 'fotosEncaminhadasDados';

/** De onde veio a missão: demanda da P/3 (encaminhamento) ou do Numerador da Cia. */
export type OrigemMissaoCgp = 'enc' | 'numerador';

export type MissaoCgp = {
  id: string;
  unidadeId: UnidadeId;
  origem: OrigemMissaoCgp;
  /** id do encaminhamento ou da demanda do Numerador da Cia. */
  refId: string;
  numero: string;
  titulo: string;
  inicio: string;
  fim: string;
  criadoPor: string;
  criadoEm: Date | null;
};

export type PeriodoCgp = { inicio: string; fim: string };
export type ErrosPeriodo = Partial<Record<keyof PeriodoCgp, string>>;

export function idMissaoCgp(unidade: UnidadeId, origem: OrigemMissaoCgp, refId: string): string {
  return `${unidade}_${origem}_${refId}`;
}

export function validarPeriodo(p: PeriodoCgp): ErrosPeriodo {
  const e: ErrosPeriodo = {};
  if (!ehDataISO(p.inicio)) e.inicio = 'Escolha o primeiro dia.';
  if (!ehDataISO(p.fim)) e.fim = 'Escolha o último dia.';
  else if (!e.inicio && p.fim < p.inicio) e.fim = 'O último dia não pode ser antes do primeiro.';
  return e;
}

/** Quantos dias a missão dura (contando o primeiro e o último). */
export function diasDoPeriodo(p: PeriodoCgp): number {
  if (Object.keys(validarPeriodo(p)).length) return 0;
  const um = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((um(p.fim) - um(p.inicio)) / 86_400_000) + 1;
}

/** Missões que passam pelo dia. */
export function missoesDoDia(lista: MissaoCgp[], dia: string): MissaoCgp[] {
  return lista.filter((m) => m.inicio <= dia && dia <= m.fim).sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** As próximas (começam depois do dia), da mais perto para a mais longe. */
export function proximasMissoes(lista: MissaoCgp[], dia: string, quantas = 10): MissaoCgp[] {
  return lista
    .filter((m) => m.inicio > dia)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .slice(0, quantas);
}

// ---------- Ordem de serviço da missão ----------
// A Cia anexa a ordem (PDF ou link do Google Drive) para o CGP ler. O PDF fica no banco só enquanto serve:
// o motor apaga DIAS_ORDEM_APOS_FIM dias depois do último dia da missão (e sai junto quando a missão é excluída).
// Tem que bater com ORDENS_DIAS_APOS_FIM do apps-script/Logica.gs (o teste confere).

export const DIAS_ORDEM_APOS_FIM = 7;
/** Igual ao limite das regras do banco (10 MB). Maior que isso: use o link do Google Drive. */
export const LIMITE_PDF_ORDEM = 10 * 1024 * 1024;
export const LIMITE_LINK_ORDEM = 500;

export type OrdemCgp = {
  /** id da missão do CGP. */
  id: string;
  unidadeId: UnidadeId;
  tipo: 'pdf' | 'link';
  nome: string;
  /** Só no PDF. */
  tamanho?: number;
  partes?: number;
  /** Só no link. */
  link?: string;
  /** Último dia da missão (o motor apaga depois de DIAS_ORDEM_APOS_FIM dias). */
  fim: string;
  enviadoPor: string;
  enviadoEm: Date | null;
};

/** '' quando o arquivo serve; senão, o motivo. */
export function validarPdfOrdem(a: { name: string; type: string; size: number }): string {
  const ehPdf = a.type === 'application/pdf' || (!a.type && /\.pdf$/i.test(a.name));
  if (!ehPdf) return 'Escolha um arquivo PDF.';
  if (a.size <= 0) return 'O arquivo está vazio.';
  if (a.size > LIMITE_PDF_ORDEM) return 'PDF maior que 10 MB: coloque no Google Drive e cole o link.';
  return '';
}

/** Link do Google Drive/Docs (https). '' quando serve; senão, o motivo. */
export function validarLinkOrdem(link: string): string {
  const t = link.trim();
  if (!t) return 'Cole o link da ordem de serviço.';
  if (t.length > LIMITE_LINK_ORDEM) return `Até ${LIMITE_LINK_ORDEM} caracteres.`;
  if (!/^https:\/\/(drive|docs)\.google\.com\/\S+$/.test(t)) return 'Cole um link do Google Drive (https://drive.google.com/...).';
  return '';
}

/** Dia em que a ordem sai do sistema. */
export function ordemApagaEm(fim: string): string {
  return somarDias(fim, DIAS_ORDEM_APOS_FIM + 1);
}

export function textoOrdemApagaEm(fim: string): string {
  return `Sai do sistema em ${formatarData(ordemApagaEm(fim))} (${DIAS_ORDEM_APOS_FIM} dias depois do fim da missão)`;
}

/** Tamanho para a tela: "850 KB", "2,4 MB". */
export function tamanhoTexto(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

// ---------- Fotos ----------

export const LIMITE_TEXTO_FOTO = 300;

export type DadosFotoCgp = { descricao: string; local: string; observacao: string };
export type ErrosFotoCgp = Partial<Record<keyof DadosFotoCgp | 'fotos', string>>;

export type FotoCgp = DadosFotoCgp & {
  id: string;
  unidadeId: UnidadeId;
  miniatura: string;
  enviadoPor: string;
  enviadoEm: Date | null;
};

/** Foto do CGP que chegou à P/3 (encaminhada pela Cia). */
export type FotoEncaminhada = FotoCgp & { encaminhadaPor: string; encaminhadaEm: Date | null };

/** Nome do arquivo da foto (no download e dentro do .zip). */
export function nomeArquivoFotoCgp(f: Pick<FotoCgp, 'descricao' | 'local'>, n?: number): string {
  return `CGP ${f.descricao} - ${f.local}${n ? ` (${n})` : ''}.jpg`.replace(/[\\/:*?"<>|]/g, '-');
}

export function validarFotoCgp(d: DadosFotoCgp, quantas: number): ErrosFotoCgp {
  const e: ErrosFotoCgp = {};
  const campo = (k: keyof DadosFotoCgp, vazio: string) => {
    const t = d[k].trim();
    if (!t) e[k] = vazio;
    else if (t.length > LIMITE_TEXTO_FOTO) e[k] = `Até ${LIMITE_TEXTO_FOTO} caracteres.`;
  };
  campo('descricao', 'Informe a descrição (ex.: Operação, Intensificação).');
  campo('local', 'Informe o local da foto.');
  campo('observacao', 'Informe a observação (equipe, local, viatura).');
  if (quantas === 0) e.fotos = 'Escolha ao menos uma foto.';
  return e;
}
