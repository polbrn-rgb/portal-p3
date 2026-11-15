import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore';
import {
  idControleOperacao,
  validarControle,
  validarPedidoRelatorio,
  type DadosControle,
  type OperacaoControle,
  type PedidoRelatorio,
  type Relatorio,
} from '../domain/controle';

// Controle de Operações (coleção "controleOperacoes") e pedidos do Relatório de Indicadores ("relatorios").
// Só a P/3 acessa. O motor também traz para cá as linhas da aba Operações da planilha antiga.

const COLECAO = 'controleOperacoes';
const RELATORIOS_NA_TELA = 5;

export class OperacaoJaExiste extends Error {
  constructor() {
    super('Já existe uma operação com esse nome e essa data de início.');
    this.name = 'OperacaoJaExiste';
  }
}

function limpar(d: DadosControle): DadosControle {
  return {
    nome: d.nome.trim(),
    inicio: d.inicio,
    termino: d.termino,
    objetivo: d.objetivo.trim(),
    ordem: d.ordem.trim(),
    origem: d.origem.trim(),
    opm: d.opm.trim(),
    observacao: d.observacao.trim(),
  };
}

function conferir(d: DadosControle) {
  const erros = validarControle(d);
  const primeiro = Object.values(erros)[0];
  if (primeiro) throw new Error(primeiro);
}

export async function criarOperacaoControle(db: Firestore, d: DadosControle): Promise<string> {
  conferir(d);
  const dados = limpar(d);
  const id = idControleOperacao(dados.nome, dados.inicio);
  const ref = doc(db, COLECAO, id);
  if ((await getDoc(ref)).exists()) throw new OperacaoJaExiste();
  await setDoc(ref, { ...dados, fonte: 'portal', excluida: false, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() });
  return id;
}

export async function atualizarOperacaoControle(db: Firestore, id: string, d: DadosControle): Promise<void> {
  conferir(d);
  await updateDoc(doc(db, COLECAO, id), { ...limpar(d), atualizadoEm: serverTimestamp() });
}

/** Não apaga de verdade: some da lista e do relatório, e a planilha antiga não traz de novo. */
export async function excluirOperacaoControle(db: Firestore, id: string): Promise<void> {
  await updateDoc(doc(db, COLECAO, id), { excluida: true, atualizadoEm: serverTimestamp() });
}

export function observarControle(
  db: Firestore,
  aoMudar: (lista: OperacaoControle[]) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, COLECAO),
    (s) =>
      aoMudar(
        s.docs.map((d) => {
          const x = d.data() as Partial<OperacaoControle>;
          return {
            id: d.id,
            nome: x.nome ?? '',
            inicio: x.inicio ?? '',
            termino: x.termino ?? '',
            objetivo: x.objetivo ?? '',
            ordem: x.ordem ?? '',
            origem: x.origem ?? '',
            opm: x.opm ?? '',
            observacao: x.observacao ?? '',
            fonte: x.fonte === 'planilha' ? 'planilha' : 'portal',
            excluida: x.excluida === true,
          };
        }),
      ),
    aoFalhar,
  );
}

export async function pedirRelatorio(db: Firestore, p: PedidoRelatorio): Promise<string> {
  const erro = Object.values(validarPedidoRelatorio(p))[0];
  if (erro) throw new Error(erro);
  const ref = await addDoc(collection(db, 'relatorios'), {
    mes: p.mes,
    numero: p.numero.trim(),
    status: 'pedido',
    pedidoEm: serverTimestamp(),
  });
  return ref.id;
}

/** Os últimos pedidos, do mais novo para o mais antigo, com o andamento ao vivo. */
export function observarRelatorios(
  db: Firestore,
  aoMudar: (lista: Relatorio[]) => void,
  aoFalhar: (erro: Error) => void,
): () => void {
  const q = query(collection(db, 'relatorios'), orderBy('pedidoEm', 'desc'), limit(RELATORIOS_NA_TELA));
  return onSnapshot(
    q,
    (s) =>
      aoMudar(
        s.docs.map((d) => {
          const x = d.data({ serverTimestamps: 'estimate' }) as Omit<Relatorio, 'id' | 'pedidoEm'> & { pedidoEm?: Timestamp | null };
          return { ...x, id: d.id, pedidoEm: x.pedidoEm?.toDate() ?? null };
        }),
      ),
    aoFalhar,
  );
}
