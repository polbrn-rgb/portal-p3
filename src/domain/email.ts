import { MESES_EAP } from './eap';
import { NUMERO_SECAO, PREFIXO_DOCUMENTO } from './numeracao';

// Atalho de e-mail do portal: a P/3 monta a mensagem eletrônica no padrão, o Numerador dá o número
// e o motor (Apps Script) envia pelo Gmail da P/3 com as assinaturas e os anexos.

export const EMAIL_FUNCIONAL = '8bpmmp3@policiamilitar.sp.gov.br';
/** Assinatura que vai em todo e-mail (Ch Seç Op / Cmt da P/3). */
export const ID_ASSINATURA_CHEFE = 'chefe';
export const DE_PADRAO = 'Ch Seç Op do 8º BPM/M';
export const TAMANHO_MAXIMO_ASSINATURA = 300 * 1024;

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
  status: StatusEmail;
  erro?: string;
  enviadoEm?: string;
};

export type EmailEnviado = PedidoEmail & { id: string; criadoEm?: { toDate: () => Date } | null };

export type Assinatura = { id: string; nome: string; imagem: string };

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

/** Assinatura: imagem PNG ou JPG pequena (vai dentro do banco). */
export function erroDaAssinatura(arquivo: { name: string; size: number; type: string }): string {
  if (!/^image\/(png|jpe?g)$/.test(arquivo.type) && !/\.(png|jpe?g)$/i.test(arquivo.name)) return 'A assinatura precisa ser imagem PNG ou JPG.';
  if (arquivo.size > TAMANHO_MAXIMO_ASSINATURA) return 'A imagem pode ter no máximo 300 KB.';
  return '';
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
    src ? `<img src="${esc(src)}" alt="${esc(alt)}" style="display:block;max-width:100%;height:auto;border:0;">` : '';
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
