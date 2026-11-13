import { collection, getDocs, type Firestore } from 'firebase/firestore';
import { hojeISO } from '../domain/datas';
import type { Demanda } from '../domain/demanda';
import type { Encaminhamento } from '../domain/encaminhamento';
import { montarCsv } from '../domain/exportar';

/**
 * Lê todas as demandas e respostas e baixa a planilha de backup.
 * Cada backup lê todos os documentos uma vez (com ~2.100 demandas, cerca de 6 mil leituras,
 * bem dentro da cota gratuita de 50 mil por dia).
 */
export async function baixarPlanilha(db: Firestore): Promise<number> {
  const [demandas, encs] = await Promise.all([
    getDocs(collection(db, 'demandas')),
    getDocs(collection(db, 'encaminhamentos')),
  ]);
  const hoje = hojeISO();
  const csv = montarCsv(
    demandas.docs.map((d) => ({ ...(d.data() as Omit<Demanda, 'id'>), id: d.id })),
    encs.docs.map((e) => ({ ...(e.data() as Omit<Encaminhamento, 'id'>), id: e.id })),
    hoje,
  );

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `portal-p3-backup-${hoje}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return demandas.size;
}
