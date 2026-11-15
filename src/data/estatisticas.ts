import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore';
import type { Demanda } from '../domain/demanda';

// As demandas do ano (pela data de entrada), lidas uma vez e guardadas por 10 minutos neste aparelho:
// abrir e fechar o Painel não gasta leitura de novo (cada carga lê ~1 documento por demanda do ano).
const VALIDADE_MS = 10 * 60 * 1000;
const guardado = new Map<number, { em: number; lista: Demanda[] }>();

export async function demandasDoAno(db: Firestore, ano: number, forcar = false): Promise<Demanda[]> {
  const ja = guardado.get(ano);
  if (!forcar && ja && Date.now() - ja.em < VALIDADE_MS) return ja.lista;
  const q = query(collection(db, 'demandas'), where('dataEntrada', '>=', `${ano}-01-01`), where('dataEntrada', '<=', `${ano}-12-31`));
  const s = await getDocs(q);
  const lista = s.docs.map((d) => ({ ...(d.data() as Omit<Demanda, 'id'>), id: d.id })).filter((d) => d.status !== 'excluido');
  guardado.set(ano, { em: Date.now(), lista });
  return lista;
}
