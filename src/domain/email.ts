import { MESES_EAP } from './eap';
import { categoriaDoPosto } from './efetivo';
import { NUMERO_SECAO, PREFIXO_DOCUMENTO } from './numeracao';

// Atalho de e-mail do portal: a P/3 monta a mensagem eletrônica no padrão, o Numerador dá o número
// e o motor (Apps Script) envia pelo Gmail da P/3 com as assinaturas e os anexos.

export const EMAIL_FUNCIONAL = '8bpmmp3@policiamilitar.sp.gov.br';
export const DE_PADRAO = 'Ch Seç Op do 8º BPM/M';

// Assinatura padrão (imagem montada pelo portal sobre public/assinatura-modelo.png).
export const FONES_ASSINATURA = 'Fones: 2295-6517';
export const ENDERECO_ASSINATURA = 'RUA VILELA, 331 - TATUAPÉ - SÃO PAULO - SP';
/** Largura em que a assinatura aparece no e-mail (a imagem tem o dobro, para ficar nítida). */
export const LARGURA_ASSINATURA = 397;

export type AtalhoEmail = 'eap';
export type StatusEmail = 'pedido' | 'enviando' | 'enviado' | 'erro';

/** O que a P/3 preenche no atalho. Para e Cc: e-mails separados por vírgula, ponto e vírgula ou espaço. */
export type DadosEmail = {
  para: string;
  cc: string;
  ao: string;
  assunto: string;
  corpo: string;
  transmissor: string;
  anexarPlanilha: boolean;
};

export type AnexoEmail = { tipo: 'planilha'; id: string; nome: string } | { tipo: 'pdf'; id: string; nome: string };

export type PedidoEmail = {
  atalho: AtalhoEmail;
  refId: string;
  para: string[];
  cc: string[];
  assunto: string;
  numeroMensagem: string;
  demandaNumero: number;
  transmissor: string;
  html: string;
  anexos: AnexoEmail[];
  /** Assinaturas já desenhadas (PNG em data URL): a do Ch Seç Op e a de quem transmitiu. */
  imagens: { chefe: string; transmissor: string };
  status: StatusEmail;
  erro?: string;
  enviadoEm?: string;
};

export type EmailEnviado = PedidoEmail & { id: string; criadoEm?: { toDate: () => Date } | null };

/** Dados da assinatura de cada Responsável do numerador (o Administrador preenche). */
export type DadosAssinatura = { nome: string; re: string; nomeCompleto: string; posto: string };
export type Assinatura = DadosAssinatura & { id: string };

/** Cargo pela graduação: Cap = chefe; Sgt/Subten = encarregado; Cb/Sd = auxiliar. */
export function cargoDoPosto(posto: string): string {
  const c = categoriaDoPosto(posto);
  if (c === 'cap') return 'Chefe Seção Operacional';
  if (c === 'subsgt') return 'Encarregado Seção Operacional';
  if (c === 'cbsd') return 'Auxiliar de operações';
  return '';
}

/** "SD PM - 1C - Auxiliar de operações" */
export function linhaCargo(posto: string): string {
  const cargo = cargoDoPosto(posto);
  return cargo ? `${posto.trim()} - ${cargo}` : posto.trim();
}

/** A assinatura do Capitão (chefe da seção) vai em todos os e-mails. */
export function assinaturaChefe(lista: Assinatura[]): Assinatura | undefined {
  return lista.find((a) => categoriaDoPosto(a.posto) === 'cap' && a.nomeCompleto.trim());
}

export function validarAssinatura(d: DadosAssinatura): Partial<Record<keyof DadosAssinatura, string>> {
  const e: Partial<Record<keyof DadosAssinatura, string>> = {};
  if (!d.nomeCompleto.trim()) e.nomeCompleto = 'Informe o nome completo.';
  if (!d.posto.trim()) e.posto = 'Informe o posto/graduação (ex.: SD PM - 1C).';
  return e;
}

export type ErrosEmail = Partial<Record<keyof DadosEmail, string>>;

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** "a@x.com; b@y.com c@z.com" -> lista sem repetidos (minúsculas). */
export function listaEmails(texto: string): string[] {
  const vistos = new Set<string>();
  return (texto ?? '')
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && !vistos.has(e) && vistos.add(e));
}

export function validarEmail(d: DadosEmail): ErrosEmail {
  const e: ErrosEmail = {};
  const para = listaEmails(d.para);
  if (!para.length) e.para = 'Informe para quem vai o e-mail.';
  else if (para.some((x) => !EMAIL.test(x))) e.para = 'Confira os endereços (um deles está inválido).';
  if (listaEmails(d.cc).some((x) => !EMAIL.test(x))) e.cc = 'Confira os endereços (um deles está inválido).';
  if (!d.ao.trim()) e.ao = 'Informe a quem se dirige (ex.: Ao Sr. Cmt CPA M-11).';
  if (!d.assunto.trim()) e.assunto = 'Informe o assunto.';
  if (!d.corpo.trim()) e.corpo = 'Escreva o texto do e-mail.';
  if (!d.transmissor) e.transmissor = 'Escolha quem está transmitindo.';
  return e;
}

/** "2026-11-04" -> "04 de novembro de 2026" */
export function dataPorExtenso(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d} de ${MESES_EAP[Number(m) - 1].toLowerCase()} de ${a}`;
}

/**
 * Nº da mensagem a partir da demanda do Numerador: "8BPMM-2044/03/26".
 * De 2027 em diante usa o nº do documento por tipo ("MSG ELETRÔNICA 8BPMM-001/03/27" -> "8BPMM-001/03/27").
 */
export function numeroMensagem(d: { numero: number; numeroDocumento?: string; dataEntrada: string }): string {
  const i = d.numeroDocumento?.indexOf(PREFIXO_DOCUMENTO) ?? -1;
  if (d.numeroDocumento && i >= 0) return d.numeroDocumento.slice(i);
  return `${PREFIXO_DOCUMENTO}${d.numero}/${NUMERO_SECAO}/${d.dataEntrada.slice(2, 4)}`;
}

/** "EAP - EAD novembro com Presencial em dezembro" */
export function assuntoEap(e: { mesEad: number; mesPresencial: number }): string {
  const mes = (n: number) => MESES_EAP[n - 1].toLowerCase();
  return `EAP - EAD ${mes(e.mesEad)} com Presencial em ${mes(e.mesPresencial)}`;
}

export function corpoPadrao(assunto: string): string {
  return `Encaminho a V.S ª expediente anexo, referente a ${assunto}, para conhecimento e possíveis providências.`;
}

export function idAssinatura(nome: string): string {
  return (
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'sem-nome'
  );
}

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Imagens das assinaturas: "cid:..." no e-mail enviado; endereço da imagem na prévia. */
export const CID_CHEFE = 'assinaturaChefe';
export const CID_TRANSMISSOR = 'assinaturaTransmissor';

export type ConteudoEmail = { data: string; numeroMensagem: string; de?: string; ao: string; assunto: string; corpo: string };

/** HTML da mensagem eletrônica no padrão da P/3 (estilos em linha: funciona no Gmail e no Outlook). */
export function montarHtmlEmail(c: ConteudoEmail, img: { chefe: string; transmissor: string }): string {
  const fonte = 'font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#000;';
  const p = (estilo: string, texto: string) => `<p style="margin:0;${estilo}">${texto}</p>`;
  const paragrafos = c.corpo
    .trim()
    .split(/\n{2,}/)
    .map((t) => p('text-indent:48px;text-align:justify;margin-bottom:12px;', esc(t).replace(/\n/g, '<br>')))
    .join('');
  const imagem = (src: string, alt: string) =>
    src
      ? `<img src="${esc(src)}" alt="${esc(alt)}" width="${LARGURA_ASSINATURA}" style="display:block;width:${LARGURA_ASSINATURA}px;max-width:100%;height:auto;border:0;">`
      : '';
  return [
    `<div style="${fonte}line-height:1.4;max-width:640px;">`,
    p('text-align:center;font-weight:bold;', 'SECRETARIA DA SEGURANÇA PÚBLICA'),
    p('text-align:center;font-weight:bold;margin-bottom:16px;', 'POLÍCIA MILITAR DO ESTADO DE SÃO PAULO'),
    p('text-align:right;margin-bottom:16px;', `São Paulo, ${esc(dataPorExtenso(c.data))}.`),
    p('font-weight:bold;margin-bottom:12px;', `MENSAGEM ELETRÔNICA Nº ${esc(c.numeroMensagem)}`),
    p('', `Do ${esc((c.de ?? DE_PADRAO).replace(/^Do\s+/i, ''))}`),
    p('', esc(c.ao)),
    p('margin-bottom:16px;', `Assunto: ${esc(c.assunto)}`),
    paragrafos,
    `<div style="margin:24px 0 16px 48px;font-size:12px;">`,
    p('font-weight:bold;', 'SOLICITAÇÃO DE CONFIRMAÇÃO DE RECEBIMENTO (NOME e RE)'),
    p(
      'text-align:justify;',
      'I-31-PM – Art. 15 – Inc. IV: a opção de solicitar a confirmação de envio e leitura de programa de gerenciamento de e-mail, deverá estar habilitada, e caberá ao destinatário confirmar o recebimento em qualquer circunstância.',
    ),
    '</div>',
    imagem(img.chefe, 'Assinatura do Ch Seç Op'),
    p('margin:16px 0 4px;', 'Transmitido por:'),
    imagem(img.transmissor, 'Assinatura de quem transmitiu'),
    '</div>',
  ].join('');
}
