import { ehDataISO, hojeISO } from './datas';
import { normalizarRE } from './efetivo';

// TDS (instrução durante o serviço): cada CFP manda até 5 fotos por mês pela página do CFP.
// As fotos ficam no banco (reduzidas no celular) até a P/3 baixar o .zip do mês e apagar.
//   fotosTds/{mes}_{re}_{vaga}       -> dados da foto + miniatura (lista da P/3 e contador do CFP)
//   fotosTdsDados/{mes}_{re}_{vaga}  -> a foto em si (base64), lida só pela P/3 ao baixar

export const FOTOS_POR_MES = 5;
export const LADO_FOTO = 1600; // maior lado da foto guardada, em pixels
export const LADO_MINIATURA = 320;
export const LIMITE_FOTO = 900_000; // caracteres de base64 (o documento do Firestore vai até 1 MB)
export const LIMITE_MINIATURA = 60_000;
export const LIMITE_ASSUNTO = 120;
export const LIMITE_ORIGINAL = 40 * 1024 * 1024; // foto escolhida no celular, antes de reduzir

/** Postos e graduações para o cadastro manual (quando o RE não está no banco de efetivo). */
export const POSTOS_GRADUACOES = [
  'Cel PM',
  'Ten Cel PM',
  'Maj PM',
  'Cap PM',
  '1º Ten PM',
  '2º Ten PM',
  'Asp Of PM',
  'Subten PM',
  '1º Sgt PM',
  '2º Sgt PM',
  '3º Sgt PM',
  'Cb PM',
  'Sd PM',
] as const;

export type CfpTds = { re: string; posto: string; nomeGuerra: string };

export type FotoTds = {
  id: string;
  mes: string; // AAAA-MM (mês da instrução)
  re: string; // RE sem dígito
  cfp: { posto: string; nomeGuerra: string };
  data: string;
  assunto: string;
  vaga: number; // 1 a 5
  miniatura: string; // base64 JPEG
  tamanho: number; // caracteres da foto em base64
  enviadoEm: Date | null; // sai do sistema 15 dias depois (domain/fotos.ts)
};

export type ErrosEnvioTds = Partial<Record<'re' | 'data' | 'assunto' | 'fotos', string>>;
export type DadosManuais = { posto: string; nomeGuerra: string; nomeCompleto: string; telefone: string };
export type ErrosManuais = Partial<Record<keyof DadosManuais, string>>;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function mesDe(data: string): string {
  return data.slice(0, 7);
}

/** "2026-11" -> "novembro de 2026". */
export function nomeMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return MESES[m - 1] ? `${MESES[m - 1]} de ${a}` : mes;
}

export function mesAnterior(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

export function idFotoTds(mes: string, re: string, vaga: number): string {
  return `${mes}_${normalizarRE(re)}_${vaga}`;
}

/** Vagas (1 a 5) que o CFP ainda tem no mês. */
export function vagasLivres(fotos: { vaga: number }[]): number[] {
  const usadas = new Set(fotos.map((f) => f.vaga));
  return Array.from({ length: FOTOS_POR_MES }, (_, i) => i + 1).filter((v) => !usadas.has(v));
}

export function validarEnvioTds(
  e: { re: string; data: string; assunto: string; quantidade: number; livres: number },
  hoje = hojeISO(),
): ErrosEnvioTds {
  const erros: ErrosEnvioTds = {};
  if (normalizarRE(e.re).length < 5) erros.re = 'Informe o seu RE.';
  if (!ehDataISO(e.data)) erros.data = 'Informe a data da instrução.';
  else if (e.data > hoje) erros.data = 'A data não pode ser depois de hoje.';
  else if (mesDe(e.data) < mesAnterior(mesDe(hoje))) erros.data = 'Só dá para enviar instrução deste mês ou do mês passado.';
  const assunto = e.assunto.trim();
  if (!assunto) erros.assunto = 'Informe o assunto da instrução.';
  else if (assunto.length > LIMITE_ASSUNTO) erros.assunto = `O assunto pode ter até ${LIMITE_ASSUNTO} letras.`;
  if (e.livres <= 0) erros.fotos = `Você já enviou as ${FOTOS_POR_MES} fotos deste mês.`;
  else if (e.quantidade <= 0) erros.fotos = 'Escolha pelo menos uma foto.';
  else if (e.quantidade > e.livres) erros.fotos = `Neste mês você ainda pode mandar ${e.livres} foto(s). Tire ${e.quantidade - e.livres} da seleção.`;
  return erros;
}

export function validarCadastroManual(d: DadosManuais): ErrosManuais {
  const erros: ErrosManuais = {};
  if (!d.posto.trim()) erros.posto = 'Escolha o posto/graduação.';
  if (!d.nomeGuerra.trim()) erros.nomeGuerra = 'Informe o nome de guerra.';
  else if (d.nomeGuerra.trim().length > 40) erros.nomeGuerra = 'Nome de guerra muito longo.';
  if (!d.nomeCompleto.trim()) erros.nomeCompleto = 'Informe o nome completo.';
  else if (d.nomeCompleto.trim().length > 120) erros.nomeCompleto = 'Nome completo muito longo.';
  if (d.telefone.trim().length > 20) erros.telefone = 'Telefone muito longo.';
  return erros;
}

/** Novo tamanho para o maior lado caber em "lado" (sem aumentar foto pequena). */
export function encaixar(largura: number, altura: number, lado: number): { largura: number; altura: number } {
  const escala = Math.min(1, lado / Math.max(largura, altura, 1));
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)) };
}

export type GrupoTds = { re: string; cfp: { posto: string; nomeGuerra: string }; fotos: FotoTds[] };

/** Fotos do mês separadas por CFP (ordem alfabética do nome de guerra; dentro, por data). */
export function agruparPorCfp(fotos: FotoTds[]): GrupoTds[] {
  const grupos = new Map<string, GrupoTds>();
  for (const f of fotos) {
    const g = grupos.get(f.re) ?? { re: f.re, cfp: f.cfp, fotos: [] };
    g.fotos.push(f);
    grupos.set(f.re, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, fotos: g.fotos.sort((a, b) => a.data.localeCompare(b.data) || a.vaga - b.vaga) }))
    .sort((a, b) => a.cfp.nomeGuerra.localeCompare(b.cfp.nomeGuerra, 'pt-BR'));
}

function limparNome(t: string): string {
  return t
    .replace(/[\\/:*?"<>|\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/** Caminho da foto dentro do .zip: uma pasta por CFP. */
export function caminhoNoZip(f: FotoTds): string {
  const pasta = limparNome(`${f.cfp.posto} ${f.cfp.nomeGuerra} - RE ${f.re}`);
  return `${pasta}/${f.data} - ${limparNome(f.assunto) || 'instrução'} - ${f.vaga}.jpg`;
}

export function nomeZip(mes: string): string {
  return `TDS ${mes}.zip`;
}
