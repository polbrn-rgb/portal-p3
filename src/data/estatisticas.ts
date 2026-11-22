import { collection, getCountFromServer, getDocs, query, Timestamp, where, type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore';
import type { Demanda } from '../domain/demanda';
import { juntarMudancas, resumoEstatistico, type DemandaEstatistica } from '../domain/estatisticas';

// Painel estatístico: as demandas do ano ficam guardadas neste aparelho (só os campos que o painel usa).
// Ao abrir de novo, busca no banco só as que mudaram desde a última vez (campo atualizadoEm) e confere
// pela contagem do servidor se nenhuma sumiu. Antes cada abertura lia todas as demandas do ano.
// O botão "Atualizar" do painel continua lendo tudo do banco.

type Guardado = { versao: 1; ano: number; marca: number; lista: DemandaEstatistica[] };

const VERSAO = 1;
const chave = (ano: number) => `portal-p3:estatisticas:${ano}`;
const naMemoria = new Map<number, Guardado>();

function ler(ano: number): Guardado | undefined {
  const ja = naMemoria.get(ano);
  if (ja) return ja;
  try {
    const g = JSON.parse(localStorage.getItem(chave(ano)) ?? 'null') as Guardado | null;
    if (g && g.versao === VERSAO && g.ano === ano && Array.isArray(g.lista) && typeof g.marca === 'number') return g;
  } catch {
    // aparelho sem localStorage (ou cheio): lê do banco
  }
  return undefined;
}

function guardar(g: Guardado) {
  naMemoria.set(g.ano, g);
  try {
    localStorage.setItem(chave(g.ano), JSON.stringify(g));
  } catch {
    // sem espaço: fica só na memória desta aba
  }
}

/** Maior atualizadoEm (em ms) entre os documentos lidos: a próxima busca começa daí. */
function maiorMarca(docs: QueryDocumentSnapshot[], inicial: number): number {
  return docs.reduce((m, d) => {
    const t = d.data().atualizadoEm;
    return t instanceof Timestamp ? Math.max(m, t.toMillis()) : m;
  }, inicial);
}

const resumo = (d: QueryDocumentSnapshot) => resumoEstatistico({ ...(d.data() as Omit<Demanda, 'id'>), id: d.id });
const semExcluidas = (lista: DemandaEstatistica[]) => lista.filter((d) => d.status !== 'excluido');

export async function demandasDoAno(db: Firestore, ano: number, forcar = false): Promise<DemandaEstatistica[]> {
  const demandas = collection(db, 'demandas');
  const doAno = query(demandas, where('dataEntrada', '>=', `${ano}-01-01`), where('dataEntrada', '<=', `${ano}-12-31`));

  const ja = forcar ? undefined : ler(ano);
  if (ja) {
    // ">=": quem foi gravado no mesmo instante da marca também volta (repetir não faz mal).
    const [mudadas, contagem] = await Promise.all([
      getDocs(query(demandas, where('atualizadoEm', '>=', Timestamp.fromMillis(ja.marca)))),
      getCountFromServer(doAno),
    ]);
    const lista = juntarMudancas(ja.lista, mudadas.docs.map(resumo), ano);
    // Mesma quantidade do banco: nada sumiu (ex.: zeragem). Diferente: lê tudo de novo.
    if (lista.length === contagem.data().count) {
      guardar({ versao: VERSAO, ano, marca: maiorMarca(mudadas.docs, ja.marca), lista });
      return semExcluidas(lista);
    }
  }

  const s = await getDocs(doAno);
  const lista = s.docs.map(resumo);
  const marca = maiorMarca(s.docs, 0);
  // Ano ainda sem demanda (sem marca): não guarda, a próxima busca lê o ano de novo (é pouca coisa).
  if (marca > 0) guardar({ versao: VERSAO, ano, marca, lista });
  return semExcluidas(lista);
}
