import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore';
import type { FontesBanco } from '../domain/banco';
import type { UnidadeRac } from '../domain/rac';
import { paraEnvio } from './documentosMensais';
import { COLECAO_PRODUCAO, paraProducao } from './producao';
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
