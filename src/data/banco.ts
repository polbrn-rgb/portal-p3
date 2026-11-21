import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, where, type Firestore, type Timestamp } from 'firebase/firestore';
import {
  abasDoBanco,
  abasDoHistorico,
  mesesEntre,
  montarBanco,
  nomeCopia,
  type FontesBanco,
  type HistoricoEnvio,
  type HistoricoProducao,
} from '../domain/banco';
import { dividirEmPartes } from '../domain/icc';
import { abasDaProducao, ehNatureza, lerItens } from '../domain/producao';
import type { UnidadeRac } from '../domain/rac';
import { UNIDADES } from '../domain/unidades';
import { bytesParaBase64 } from '../lib/imagem';
import { gerarXlsx } from '../lib/xlsx';
import { paraEnvio } from './documentosMensais';
import { COLECAO_HISTORICO_PRODUCAO, COLECAO_PRODUCAO, paraProducao } from './producao';
import { paraRac } from './rac';

// Banco de dados (ver domain/banco.ts): lê as coleções de origem do período, de uma vez (só a P/3).
// Consultas por intervalo num campo só (mes / mesRef): não precisam de índice composto.

export async function carregarFontesBanco(db: Firestore, de: string, ate: string): Promise<FontesBanco> {
  const [producao, envios, racs] = await Promise.all([
    getDocs(query(collection(db, COLECAO_PRODUCAO), where('mes', '>=', de), where('mes', '<=', ate))),
    getDocs(query(collection(db, 'docsMensais'), where('mesRef', '>=', de), where('mesRef', '<=', ate))),
    getDocs(query(collection(db, 'racs'), where('mes', '>=', de), where('mes', '<=', ate))),
  ]);
  return {
    producao: producao.docs.map((d) => paraProducao(d.id, d.data({ serverTimestamps: 'estimate' }))),
    envios: envios.docs.map((d) => paraEnvio(d.id, d.data())),
    racs: racs.docs.map((d) => paraRac(d.id, d.data())).filter((r) => (r.unidade as UnidadeRac) !== 'btl'),
  };
}

const quando = (t: unknown): Date | null => (t as Timestamp | null | undefined)?.toDate?.() ?? null;

/** Histórico do período (cada lançamento, correção e exclusão; cada envio de documento). */
export async function carregarHistorico(db: Firestore, de: string, ate: string): Promise<{ producao: HistoricoProducao[]; envios: HistoricoEnvio[] }> {
  const [p, e] = await Promise.all([
    getDocs(query(collection(db, COLECAO_HISTORICO_PRODUCAO), where('mes', '>=', de), where('mes', '<=', ate))),
    getDocs(query(collection(db, 'docsMensaisHistorico'), where('mesRef', '>=', de), where('mesRef', '<=', ate))),
  ]);
  return {
    producao: p.docs.map((d) => {
      const x = d.data();
      return {
        producaoId: String(x.producaoId ?? ''),
        unidadeId: x.unidadeId,
        mes: String(x.mes ?? ''),
        acao: x.acao,
        itens: lerItens(x.itens),
        taloes: Array.isArray(x.taloes)
          ? x.taloes.map((t: Record<string, unknown>) => ({
              numero: String(t.numero ?? ''),
              bopc: String(t.bopc ?? ''),
              data: String(t.data ?? ''),
              natureza: ehNatureza(t.natureza) ? t.natureza : '',
            }))
          : [],
        por: String(x.por ?? ''),
        em: quando(x.em),
      };
    }),
    envios: e.docs.map((d) => {
      const x = d.data();
      return {
        envioId: String(x.envioId ?? ''),
        docId: String(x.docId ?? ''),
        mesRef: String(x.mesRef ?? ''),
        unidadeId: x.unidadeId,
        valores: x.valores ?? {},
        daProducao: x.daProducao,
        respondidoPor: String(x.respondidoPor ?? ''),
        em: quando(x.em),
      };
    }),
  };
}

/** A planilha completa do período: banco (Cia × mês), cobertura, catálogo, lançamentos da produção e histórico. */
export async function planilhaDoBanco(db: Firestore, de: string, ate: string, hoje: string): Promise<Uint8Array> {
  const [fontes, historico] = await Promise.all([carregarFontesBanco(db, de, ate), carregarHistorico(db, de, ate)]);
  const producao = abasDaProducao(fontes.producao, UNIDADES.map((u) => u.id)).map((a) => ({ ...a, nome: `Produção - ${a.nome}`.slice(0, 31) }));
  return gerarXlsx([...abasDoBanco(montarBanco(fontes, mesesEntre(de, ate), hoje)), ...producao, ...abasDoHistorico(historico.producao, historico.envios)]);
}

// ---------- cópia de segurança no Drive (o motor grava a planilha na pasta "Portal P3 - Banco de dados") ----------

export type CopiaBanco = { id: string; de: string; ate: string; nome: string; status: 'pedido' | 'pronto' | 'erro'; url?: string; erro?: string; automatica: boolean };

/** A planilha vai em partes para backupBanco/{id}/partes (cabeçalho por último, com status "pedido"). */
export async function pedirCopia(db: Firestore, p: { de: string; ate: string; xlsx: Uint8Array; automatica: boolean }): Promise<string> {
  const id = p.de === p.ate ? p.de : `${p.de}_${p.ate}`;
  const partes = dividirEmPartes(bytesParaBase64(p.xlsx));
  for (let i = 0; i < partes.length; i++) await setDoc(doc(db, 'backupBanco', id, 'partes', String(i)), { dados: partes[i] });
  await setDoc(doc(db, 'backupBanco', id), {
    de: p.de,
    ate: p.ate,
    nome: nomeCopia(p.de, p.ate),
    tamanho: p.xlsx.length,
    partes: partes.length,
    status: 'pedido',
    automatica: p.automatica,
    pedidoEm: serverTimestamp(),
  });
  return id;
}

export function observarCopias(db: Firestore, ok: (l: CopiaBanco[]) => void, erro: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, 'backupBanco'), orderBy('de', 'desc')),
    (s) =>
      ok(
        s.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            de: String(x.de ?? ''),
            ate: String(x.ate ?? ''),
            nome: String(x.nome ?? ''),
            status: x.status === 'pronto' || x.status === 'erro' ? x.status : 'pedido',
            ...(x.url ? { url: String(x.url) } : {}),
            ...(x.erro ? { erro: String(x.erro) } : {}),
            automatica: x.automatica === true,
          };
        }),
      ),
    erro,
  );
}

/**
 * Cópia automática: quando a P/3 abre o portal depois do prazo do último Documento Mensal do mês de referência e
 * a cópia desse mês ainda não existe, monta e manda para o motor. Devolve o mês copiado (ou null).
 */
export async function garantirCopiaAutomatica(db: Firestore, mes: string | null, hoje: string): Promise<string | null> {
  if (!mes) return null;
  if ((await getDoc(doc(db, 'backupBanco', mes))).exists()) return null;
  await pedirCopia(db, { de: mes, ate: mes, xlsx: await planilhaDoBanco(db, mes, mes, hoje), automatica: true });
  return mes;
}
