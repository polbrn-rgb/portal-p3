// CGP de cada Cia/FT: página administrada pela própria Cia (não tem login próprio).
// - Missões: demandas enviadas para o CGP com o período (de/até), vindas do Numerador da Cia ou das
//   demandas que a P/3 mandou para a Cia. Uma demanda só vai uma vez (o id é fixo: não duplica serviço).
// - Fotos: importação sem limite, com descrição, local e observação; fica gravado quem importou e quando.
// - Recados: a Cia escreve para o CGP.
import { ehDataISO } from './datas';
import type { UnidadeId } from './unidades';

export const COLECAO_MISSOES_CGP = 'cgpMissoes';
export const COLECAO_RECADOS_CGP = 'recadosCgp';
export const COLECAO_FOTOS_CGP = 'fotosCgp';
export const COLECAO_FOTOS_CGP_DADOS = 'fotosCgpDados';

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
