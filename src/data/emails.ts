import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import type { DadosDemanda } from '../domain/demanda';
import {
  CID_CHEFE,
  CID_TRANSMISSOR,
  idAssinatura,
  listaEmails,
  montarHtmlEmail,
  numeroMensagem,
  type AnexoEmail,
  type Assinatura,
  type DadosAssinatura,
  type AtalhoEmail,
  type DadosEmail,
  type EmailEnviado,
  type PedidoEmail,
} from '../domain/email';
import { enviarArquivo } from './arquivos';
import { criarDemandaNumerada } from './demandas';

// Atalho de e-mail: o portal grava o pedido em emails/{id} (status "pedido") e o motor (Apps Script)
// envia pelo Gmail da P/3, com as assinaturas (assinaturas/{id}) como imagens no corpo e os anexos.
// Os últimos Para/Cc de cada atalho ficam em config/emails para virem preenchidos da próxima vez.

export function observarAssinaturas(db: Firestore, ok: (l: Assinatura[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(
    collection(db, 'assinaturas'),
    (s) => ok(s.docs.map((d) => ({ ...(d.data() as Omit<Assinatura, 'id'>), id: d.id }))),
    erro,
  );
}

/** Grava os dados da assinatura de um Responsável (a imagem é desenhada pelo portal na hora do e-mail). */
export async function salvarAssinatura(db: Firestore, id: string, d: DadosAssinatura): Promise<void> {
  await setDoc(doc(db, 'assinaturas', id), {
    nome: d.nome,
    re: d.re.trim(),
    nomeCompleto: d.nomeCompleto.trim(),
    posto: d.posto.trim(),
    atualizadoEm: serverTimestamp(),
  });
}

export const assinaturaDe = (lista: Assinatura[], nome: string) => lista.find((a) => a.id === idAssinatura(nome));

export type UltimosEnderecos = { para: string; cc: string };

export async function ultimosEnderecos(db: Firestore, atalho: AtalhoEmail): Promise<UltimosEnderecos | null> {
  const s = await getDoc(doc(db, 'config', 'emails'));
  const v = s.exists() ? (s.data() as Record<string, UltimosEnderecos>)[atalho] : undefined;
  return v ?? null;
}

export function observarEmails(
  db: Firestore,
  atalho: AtalhoEmail,
  refId: string,
  ok: (l: EmailEnviado[]) => void,
  erro: (e: Error) => void,
): () => void {
  return onSnapshot(
    query(collection(db, 'emails'), where('atalho', '==', atalho), where('refId', '==', refId)),
    (s) => {
      const lista = s.docs.map((d) => ({ ...(d.data() as PedidoEmail), id: d.id }) as EmailEnviado);
      lista.sort((a, b) => b.demandaNumero - a.demandaNumero);
      ok(lista);
    },
    erro,
  );
}

export type PedidoAtalho = {
  atalho: AtalhoEmail;
  refId: string;
  email: DadosEmail;
  /** Linha que entra no Numerador (dá o nº da mensagem). */
  demanda: DadosDemanda;
  anexos: AnexoEmail[];
  /** Assinaturas já desenhadas (data URL PNG). */
  imagens: { chefe: string; transmissor: string };
  pdf?: File | null;
};

/** Lança no Numerador, monta o e-mail com o nº e põe na fila do motor. Devolve o nº da demanda. */
export async function enviarEmailAtalho(db: Firestore, p: PedidoAtalho, aoProgredir?: (feito: number) => void): Promise<number> {
  const anexos = [...p.anexos];
  if (p.pdf) {
    const a = await enviarArquivo(db, p.pdf, aoProgredir);
    anexos.push({ tipo: 'pdf', id: a.id, nome: a.nome });
  }
  const { numero, numeroDocumento } = await criarDemandaNumerada(db, p.demanda);
  const nMsg = numeroMensagem({ numero, numeroDocumento, dataEntrada: p.demanda.dataEntrada });
  const pedido: PedidoEmail = {
    atalho: p.atalho,
    refId: p.refId,
    para: listaEmails(p.email.para),
    cc: listaEmails(p.email.cc),
    assunto: `MENSAGEM ELETRÔNICA Nº ${nMsg} - ${p.email.assunto.trim()}`,
    numeroMensagem: nMsg,
    demandaNumero: numero,
    transmissor: idAssinatura(p.email.transmissor),
    html: montarHtmlEmail(
      { data: p.demanda.dataEntrada, numeroMensagem: nMsg, ao: p.email.ao.trim(), assunto: p.email.assunto.trim(), corpo: p.email.corpo },
      { chefe: `cid:${CID_CHEFE}`, transmissor: `cid:${CID_TRANSMISSOR}` },
    ),
    anexos,
    imagens: p.imagens,
    status: 'pedido',
  };
  await addDoc(collection(db, 'emails'), { ...pedido, criadoEm: serverTimestamp() });
  await setDoc(doc(db, 'config', 'emails'), { [p.atalho]: { para: p.email.para.trim(), cc: p.email.cc.trim() } }, { merge: true });
  return numero;
}

/** Deu erro no envio: põe de novo na fila (mesmo nº, sem lançar outra demanda). */
export async function reenviarEmail(db: Firestore, id: string): Promise<void> {
  await updateDoc(doc(db, 'emails', id), { status: 'pedido', erro: '' });
}
