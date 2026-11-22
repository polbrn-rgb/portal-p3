// Produção diária dos pelotões, lançada pela Sala de Operações de cada Cia/FT no fim do turno.
//
// - Cias, turno de 12x36: Pel A e Pel C de dia, Pel B e Pel D de noite. A Ronda Escolar e a RPM
//   entram no resultado do pelotão (não têm lançamento à parte).
// - Força Tática: Pel A e Pel B de dia, em dias alternados (não tem turno da noite).
// - Um lançamento por pelotão por dia de serviço (o turno da noite usa a data em que começou).
// - O resultado da BCS entra no resultado do pelotão.
// - Nos flagrantes de delito ficam o nº do talão, o nº do BOPC, o dia e a natureza da ocorrência: a P/3 usa para colher
//   os dados oficiais do QMO, e a natureza separa o flagrante de tráfico dos outros na Avaliação Periódica.
// - Os itens também pré-preenchem os Documentos Mensais (ver domain/integracao.ts).
//
// É o banco de onde saem as planilhas (CPA diário, RAC por pelotão, trimestral, BCS...). Os códigos dos itens são os
// mesmos do RAC (domain/rac.ts) para o RAC poder ser preenchido daqui.
import { ehDataISO, formatarData, somarDias } from './datas';
import { UNIDADES, type UnidadeId } from './unidades';

/** Uma aba de planilha (o mesmo formato que lib/xlsx grava). */
type Celula = string | number;
export type AbaPlanilha = { nome: string; linhas: Celula[][] };

export type PelotaoId = 'pelA' | 'pelB' | 'pelC' | 'pelD';
export type Turno = 'dia' | 'noite' | '';

export const PELOTOES: readonly { id: PelotaoId; rotulo: string; turno: Turno }[] = [
  { id: 'pelA', rotulo: 'Pel A', turno: 'dia' },
  { id: 'pelB', rotulo: 'Pel B', turno: 'noite' },
  { id: 'pelC', rotulo: 'Pel C', turno: 'dia' },
  { id: 'pelD', rotulo: 'Pel D', turno: 'noite' },
];

/** Força Tática: Pel A e Pel B trabalham de dia, em dias alternados (não há turno da noite). */
const PELOTOES_FT: readonly { id: PelotaoId; rotulo: string; turno: Turno }[] = [
  { id: 'pelA', rotulo: 'Pel A', turno: 'dia' },
  { id: 'pelB', rotulo: 'Pel B', turno: 'dia' },
];

/** Pelotões de cada unidade: Cia com Pel A–D (Ronda Escolar e RPM entram no pelotão); FT com Pel A e B. */
export function pelotoesDa(unidade: UnidadeId) {
  return unidade === 'ft' ? PELOTOES_FT : PELOTOES;
}

/** Turno do pelotão na unidade. */
export function turnoDo(id: string, unidade: UnidadeId): Turno {
  return pelotoesDa(unidade).find((p) => p.id === id)?.turno ?? '';
}

/** "Pel A (dia)", "Pel D (noite)", "RPM". */
export function rotuloPelotao(id: string, unidade: UnidadeId): string {
  const p = pelotoesDa(unidade).find((x) => x.id === id);
  if (!p) return id;
  return p.turno ? `${p.rotulo} (${p.turno})` : p.rotulo;
}

/** A unidade tem turno da noite (a Força Tática não tem). */
export const temTurnoNoite = (unidade: UnidadeId): boolean => pelotoesDa(unidade).some((p) => p.turno === 'noite');

export const GRUPOS_PRODUCAO = [
  { id: 'abordagens', rotulo: 'Abordagens' },
  { id: 'prisoes', rotulo: 'Prisões' },
  { id: 'apreensoes', rotulo: 'Apreensões' },
  { id: 'transito', rotulo: 'Trânsito' },
  { id: 'ciclos', rotulo: 'Bicicletas elétricas, ciclomotores e autopropelidos' },
  { id: 'registros', rotulo: 'Atendimentos e registros' },
] as const;
export type GrupoProducao = (typeof GRUPOS_PRODUCAO)[number]['id'];

/**
 * Itens do lançamento. Cobrem: planilha diária do CPA, RAC (por pelotão e comparativo), trimestral do RAC e BCS.
 * `decimal`: aceita casas decimais (kg).
 */
export const ITENS_PRODUCAO = [
  { id: 'pessoasAbordadas', rotulo: 'Pessoas abordadas', grupo: 'abordagens' },
  { id: 'veiculosVistoriados', rotulo: 'Carros abordados / vistoriados', grupo: 'abordagens' },
  { id: 'motosVistoriadas', rotulo: 'Motos abordadas / vistoriadas', grupo: 'abordagens' },
  { id: 'ocorrenciasComPrisao', rotulo: 'Ocorrências com prisão', grupo: 'prisoes' },
  { id: 'flagrante', rotulo: 'Pessoas presas em flagrante', grupo: 'prisoes' },
  { id: 'procurados', rotulo: 'Procurados capturados (presos por mandado)', grupo: 'prisoes' },
  { id: 'atosInfracionais', rotulo: 'Atos infracionais (adolescentes apreendidos)', grupo: 'prisoes' },
  { id: 'armas', rotulo: 'Armas de fogo apreendidas', grupo: 'apreensoes' },
  { id: 'armasBrancas', rotulo: 'Armas brancas apreendidas', grupo: 'apreensoes' },
  { id: 'maconhaKg', rotulo: 'Maconha (kg)', grupo: 'apreensoes', decimal: true },
  { id: 'cocainaKg', rotulo: 'Cocaína (kg)', grupo: 'apreensoes', decimal: true },
  { id: 'crackKg', rotulo: 'Crack (kg)', grupo: 'apreensoes', decimal: true },
  { id: 'outrasDrogasKg', rotulo: 'Outras drogas (kg)', grupo: 'apreensoes', decimal: true },
  { id: 'veiculosRecuperados', rotulo: 'Veículos recuperados (L01)', grupo: 'apreensoes' },
  { id: 'veiculosApreendidos', rotulo: 'Carros apreendidos pela delegacia', grupo: 'apreensoes' },
  { id: 'motosApreendidas', rotulo: 'Motos apreendidas pela delegacia', grupo: 'apreensoes' },
  { id: 'caminhoesApreendidos', rotulo: 'Caminhões apreendidos pela delegacia', grupo: 'apreensoes' },
  { id: 'documentos', rotulo: 'Documentos apreendidos', grupo: 'apreensoes' },
  { id: 'ait', rotulo: 'AIT (CET)', grupo: 'transito' },
  { id: 'ai', rotulo: 'AI (DETRAN)', grupo: 'transito' },
  { id: 'trv', rotulo: 'TRV', grupo: 'transito' },
  { id: 'carrosRemovidos', rotulo: 'Carros removidos ao pátio', grupo: 'transito' },
  { id: 'motosRemovidas', rotulo: 'Motos removidas ao pátio', grupo: 'transito' },
  { id: 'caminhoesRemovidos', rotulo: 'Caminhões removidos ao pátio', grupo: 'transito' },
  { id: 'bikeVist', rotulo: 'Bicicletas elétricas vistoriadas', grupo: 'ciclos' },
  { id: 'bikeRem', rotulo: 'Bicicletas elétricas removidas', grupo: 'ciclos' },
  { id: 'bikeLoc', rotulo: 'Bicicletas elétricas localizadas', grupo: 'ciclos' },
  { id: 'bikeAut', rotulo: 'Bicicletas elétricas autuadas', grupo: 'ciclos' },
  { id: 'cicloVist', rotulo: 'Ciclomotores vistoriados', grupo: 'ciclos' },
  { id: 'cicloRem', rotulo: 'Ciclomotores removidos', grupo: 'ciclos' },
  { id: 'cicloLoc', rotulo: 'Ciclomotores localizados', grupo: 'ciclos' },
  { id: 'cicloAut', rotulo: 'Ciclomotores autuados', grupo: 'ciclos' },
  { id: 'autoVist', rotulo: 'Autopropelidos vistoriados', grupo: 'ciclos' },
  { id: 'autoRem', rotulo: 'Autopropelidos removidos', grupo: 'ciclos' },
  { id: 'autoLoc', rotulo: 'Autopropelidos localizados', grupo: 'ciclos' },
  { id: 'autoAut', rotulo: 'Autopropelidos autuados', grupo: 'ciclos' },
  { id: 'ocorrencias', rotulo: 'Ocorrências atendidas', grupo: 'registros' },
  { id: 'bopm', rotulo: 'BOPM elaborados', grupo: 'registros' },
  { id: 'operacoes', rotulo: 'Operações realizadas', grupo: 'registros' },
  { id: 'raiia', rotulo: 'RAIIA', grupo: 'registros' },
  { id: 'palestras', rotulo: 'Palestras realizadas', grupo: 'registros' },
  { id: 'escoltasRecebidas', rotulo: 'Pedidos de escolta da Fundação Casa recebidos', grupo: 'registros' },
  { id: 'escoltasAtendidas', rotulo: 'Pedidos de escolta da Fundação Casa atendidos', grupo: 'registros' },
] as const satisfies readonly { id: string; rotulo: string; grupo: GrupoProducao; decimal?: boolean }[];

export type ItemId = (typeof ITENS_PRODUCAO)[number]['id'];
export type Itens = Record<ItemId, number>;
export const IDS_ITENS = ITENS_PRODUCAO.map((i) => i.id) as ItemId[];
export const ehDecimal = (id: ItemId): boolean => ITENS_PRODUCAO.some((i) => i.id === id && 'decimal' in i && i.decimal);

/** Entorpecentes: soma dos tipos (a planilha do CPA e a BCS pedem o total em kg). */
export const IDS_DROGAS: readonly ItemId[] = ['maconhaKg', 'cocainaKg', 'crackKg', 'outrasDrogasKg'];
export function totalDrogasKg(itens: Itens): number {
  return Math.round(IDS_DROGAS.reduce((s, id) => s + (itens[id] ?? 0), 0) * 1000) / 1000;
}

export const MAXIMO_QUANTIDADE = 99_999;
export const MAXIMO_TALOES = 100;
export const LIMITE_TALAO = 30;

/** Natureza da ocorrência do flagrante (a lista pode crescer; "outra" cobre o resto). */
export const NATUREZAS_FLAGRANTE = [
  { id: 'trafico', rotulo: 'Tráfico de drogas' },
  { id: 'roubo', rotulo: 'Roubo' },
  { id: 'furto', rotulo: 'Furto' },
  { id: 'receptacao', rotulo: 'Receptação' },
  { id: 'armaFogo', rotulo: 'Porte / posse ilegal de arma de fogo' },
  { id: 'violenciaDomestica', rotulo: 'Violência doméstica (Maria da Penha)' },
  { id: 'embriaguez', rotulo: 'Embriaguez ao volante' },
  { id: 'lesao', rotulo: 'Lesão corporal' },
  { id: 'homicidio', rotulo: 'Homicídio (consumado ou tentado)' },
  { id: 'estupro', rotulo: 'Estupro' },
  { id: 'ameaca', rotulo: 'Ameaça' },
  { id: 'dano', rotulo: 'Dano' },
  { id: 'desacato', rotulo: 'Desacato / resistência / desobediência' },
  { id: 'outra', rotulo: 'Outra' },
] as const;
export type NaturezaFlagrante = (typeof NATUREZAS_FLAGRANTE)[number]['id'];
export const ehNatureza = (v: unknown): v is NaturezaFlagrante => NATUREZAS_FLAGRANTE.some((n) => n.id === v);
/** "Tráfico de drogas"; '' (lançamento antigo, sem natureza) vira "—". */
export const rotuloNatureza = (id: string): string => NATUREZAS_FLAGRANTE.find((n) => n.id === id)?.rotulo ?? '—';

/**
 * Flagrante de delito: nº do talão, nº do BOPC (pode ficar para depois), o dia e a natureza da ocorrência.
 * `natureza` = '' nos lançamentos feitos antes de o campo existir.
 */
export type Talao = { numero: string; bopc: string; data: string; natureza: NaturezaFlagrante | '' };

export type Producao = {
  id: string;
  unidadeId: UnidadeId;
  /** Dia do serviço (o turno da noite usa a data em que começou). */
  data: string;
  mes: string;
  pelotao: PelotaoId;
  itens: Itens;
  taloes: Talao[];
  lancadoPor: string;
  lancadoEm: Date | null;
  atualizadoPor: string;
  atualizadoEm: Date | null;
};

export function idProducao(unidade: UnidadeId, data: string, pelotao: PelotaoId): string {
  return `${unidade}_${data}_${pelotao}`;
}

export function itensZerados(): Itens {
  return Object.fromEntries(IDS_ITENS.map((id) => [id, 0])) as Itens;
}

/** O que veio do banco, com tudo o que faltar zerado (item novo na lista não quebra lançamento antigo). */
export function lerItens(bruto: unknown): Itens {
  const x = (bruto ?? {}) as Record<string, unknown>;
  const r = itensZerados();
  for (const id of IDS_ITENS) {
    const v = Number(x[id]);
    r[id] = Number.isFinite(v) && v >= 0 ? v : 0;
  }
  // Lançamento antigo: "Ciclomotores removidos ao pátio" virou "Ciclomotores removidos" (bloco das bicicletas/ciclomotores).
  if (x.cicloRem === undefined && Number(x.ciclomotoresRemovidos) > 0) r.cicloRem = Number(x.ciclomotoresRemovidos);
  return r;
}

/**
 * Lê o que a pessoa digitou. Vazio = 0. Inteiro nos itens de quantidade; até 3 casas (vírgula ou ponto) no kg.
 * null = inválido.
 */
export function lerQuantidade(texto: string, decimal = false): number | null {
  const t = texto.trim().replace(/\s/g, '');
  if (t === '') return 0;
  const m = decimal ? /^(\d{1,6})(?:[.,](\d{1,3}))?$/.exec(t) : /^(\d{1,6})$/.exec(t);
  if (!m) return null;
  const v = decimal && m[2] ? Number(`${m[1]}.${m[2]}`) : Number(m[1]);
  return v <= MAXIMO_QUANTIDADE ? v : null;
}

/** Como o número aparece no campo: 0 vira vazio; kg com vírgula. */
export function textoQuantidade(v: number, decimal = false): string {
  if (!v) return '';
  return decimal ? String(Number(v.toFixed(3))).replace('.', ',') : String(v);
}

/** Nº do talão: sem espaços, maiúsculo. */
export function normalizarTalao(numero: string): string {
  return numero.replace(/\s+/g, '').toUpperCase();
}

const NUMERO_VALIDO = /^[0-9A-Z./-]+$/;

/** '' = pode incluir; senão, o erro. */
export function validarTalao(t: Talao, ja: readonly Talao[]): string {
  const n = normalizarTalao(t.numero);
  const bopc = normalizarTalao(t.bopc ?? '');
  if (!n) return 'Digite o número do talão.';
  if (n.length > LIMITE_TALAO || !NUMERO_VALIDO.test(n)) return 'Talão: use só números (e letras, se tiver).';
  if (bopc && (bopc.length > LIMITE_TALAO || !NUMERO_VALIDO.test(bopc))) return 'BOPC: use só números (e letras, se tiver).';
  if (!ehDataISO(t.data)) return 'Informe o dia da ocorrência.';
  if (!ehNatureza(t.natureza)) return 'Escolha a natureza da ocorrência.';
  if (ja.some((x) => normalizarTalao(x.numero) === n)) return 'Este talão já está na lista.';
  if (ja.length >= MAXIMO_TALOES) return `Até ${MAXIMO_TALOES} flagrantes por lançamento.`;
  return '';
}

export type ErrosProducao = Partial<Record<ItemId | 'data' | 'pelotao' | 'taloes', string>>;

/** Confere o formulário. Sem erros, devolve os itens já como números. */
export function validarProducao(
  p: { data: string; pelotao: string; textos: Record<ItemId, string>; taloes: readonly Talao[] },
  unidade: UnidadeId,
  hoje: string,
): { erros: ErrosProducao; itens: Itens | null } {
  const erros: ErrosProducao = {};
  if (!ehDataISO(p.data)) erros.data = 'Informe o dia do serviço.';
  else if (p.data > hoje) erros.data = 'O dia do serviço não pode ser depois de hoje.';
  if (!pelotoesDa(unidade).some((x) => x.id === p.pelotao)) erros.pelotao = 'Escolha o pelotão.';
  const itens = itensZerados();
  for (const it of ITENS_PRODUCAO) {
    const decimal = 'decimal' in it && it.decimal;
    const v = lerQuantidade(p.textos[it.id] ?? '', decimal);
    if (v === null) erros[it.id] = decimal ? 'Número em kg, com até 3 casas (ex.: 0,250).' : 'Só números inteiros.';
    else itens[it.id] = v;
  }
  if (p.taloes.length > MAXIMO_TALOES) erros.taloes = `Até ${MAXIMO_TALOES} flagrantes por lançamento.`;
  return { erros, itens: Object.keys(erros).length ? null : itens };
}

/** Conferências que não impedem salvar: só chamam a atenção para números que não batem. */
export function avisosProducao(itens: Itens, taloes: readonly Talao[]): string[] {
  const avisos: string[] = [];
  const presos = itens.flagrante + itens.procurados;
  if (presos > 0 && itens.ocorrenciasComPrisao === 0) avisos.push('Houve presos: informe quantas ocorrências tiveram prisão.');
  if (itens.ocorrenciasComPrisao > presos) avisos.push('Há mais ocorrências com prisão do que presos (flagrante + mandado).');
  if (itens.ocorrenciasComPrisao > itens.ocorrencias) avisos.push('Ocorrências atendidas menor que as ocorrências com prisão.');
  if (itens.flagrante > 0 && taloes.length === 0) avisos.push('Houve flagrante: anote o nº do talão e o nº do BOPC (a P/3 usa para colher os dados).');
  if (taloes.some((t) => !t.bopc)) avisos.push('Há flagrante sem nº do BOPC: complete quando tiver.');
  if (taloes.some((t) => !t.natureza)) avisos.push('Há flagrante sem a natureza da ocorrência: tire e inclua de novo com a natureza.');
  if (itens.escoltasAtendidas > itens.escoltasRecebidas) avisos.push('Há mais escoltas atendidas do que pedidos de escolta recebidos.');
  return avisos;
}

// ---------- somas e pendências ----------

const arredondar = (v: number) => Math.round(v * 1000) / 1000;

export function somarItens(lista: readonly { itens: Itens }[]): Itens {
  const r = itensZerados();
  for (const l of lista) for (const id of IDS_ITENS) r[id] = arredondar(r[id] + (l.itens[id] ?? 0));
  return r;
}

export function diasDoMes(mes: string): string[] {
  const dias: string[] = [];
  for (let d = `${mes}-01`; d.startsWith(mes); d = somarDias(d, 1)) dias.push(d);
  return dias;
}

export type PendenciaDia = { data: string; faltaDia: boolean; faltaNoite: boolean };

/**
 * Dias do mês (até ontem) em que faltou o lançamento do turno do dia ou da noite (na Força Tática, só o do dia:
 * lá não tem turno da noite). Hoje não conta: o lançamento é feito no fim do turno. Só conta a partir do primeiro
 * lançamento da unidade (`desde`; null = a unidade ainda não começou a lançar): os dias de antes do sistema não
 * viram pendência.
 */
export function pendencias(
  lancamentos: readonly Pick<Producao, 'data' | 'pelotao'>[],
  mes: string,
  hoje: string,
  desde: string | null,
  unidade: UnidadeId,
): PendenciaDia[] {
  const r: PendenciaDia[] = [];
  if (!desde) return r;
  const noite = temTurnoNoite(unidade);
  for (const data of diasDoMes(mes)) {
    if (data >= hoje) break;
    if (data < desde) continue;
    const doDia = lancamentos.filter((l) => l.data === data);
    const faltaDia = !doDia.some((l) => turnoDo(l.pelotao, unidade) === 'dia');
    const faltaNoite = noite && !doDia.some((l) => turnoDo(l.pelotao, unidade) === 'noite');
    if (faltaDia || faltaNoite) r.push({ data, faltaDia, faltaNoite });
  }
  return r;
}

/** Quantos turnos (dia/noite) ficaram sem lançamento. */
export const turnosPendentes = (p: readonly PendenciaDia[]): number => p.reduce((s, x) => s + Number(x.faltaDia) + Number(x.faltaNoite), 0);

// ---------- planilha ----------

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export function diaDaSemanaPorExtenso(data: string): string {
  const [a, m, d] = data.split('-').map(Number);
  return DIAS_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
}

const siglaDe = (u: string) => UNIDADES.find((x) => x.id === u)?.sigla ?? u;
const ordemUnidade = (u: string) => UNIDADES.findIndex((x) => x.id === u);
const ordemPelotao = (p: string) => PELOTOES.findIndex((x) => x.id === p);

function ordenar<T extends Pick<Producao, 'data' | 'unidadeId' | 'pelotao'>>(lista: readonly T[]): T[] {
  return [...lista].sort(
    (a, b) => a.data.localeCompare(b.data) || ordemUnidade(a.unidadeId) - ordemUnidade(b.unidadeId) || ordemPelotao(a.pelotao) - ordemPelotao(b.pelotao),
  );
}

const quando = (d: Date | null) =>
  d ? `${formatarData(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';

/**
 * A planilha do mês (o "banco" aberto): todos os lançamentos, a soma por dia de cada unidade,
 * os totais do mês por unidade e os flagrantes (talão e BOPC).
 */
export function abasDaProducao(lancamentos: readonly Producao[], unidades: readonly UnidadeId[]): AbaPlanilha[] {
  const lista = ordenar(lancamentos.filter((l) => unidades.includes(l.unidadeId)));
  // Colunas: os itens, com o total de entorpecentes logo depois dos tipos de droga.
  const colunas: { rotulo: string; valor: (i: Itens) => number }[] = ITENS_PRODUCAO.flatMap((it) => {
    const c = { rotulo: it.rotulo, valor: (i: Itens) => i[it.id] };
    return it.id === 'outrasDrogasKg' ? [c, { rotulo: 'Entorpecentes - total (kg)', valor: totalDrogasKg }] : [c];
  });
  const rotulos = colunas.map((c) => c.rotulo);
  const flag = (t: Talao) => `${t.bopc ? `${t.numero} / BOPC ${t.bopc}` : t.numero}${t.natureza ? ` (${rotuloNatureza(t.natureza)})` : ''}`;

  const linhasLanc: Celula[][] = [
    ['Dia do serviço', 'Dia da semana', 'Unidade', 'Pelotão', 'Turno', ...rotulos, 'Flagrantes (talão / BOPC)', 'Lançado por', 'Lançado em', 'Atualizado por', 'Atualizado em'],
    ...lista.map((l) => [
      formatarData(l.data),
      diaDaSemanaPorExtenso(l.data),
      siglaDe(l.unidadeId),
      PELOTOES.find((p) => p.id === l.pelotao)?.rotulo ?? l.pelotao,
      turnoDo(l.pelotao, l.unidadeId),
      ...colunas.map((c) => c.valor(l.itens)),
      l.taloes.map(flag).join(', '),
      l.lancadoPor,
      quando(l.lancadoEm),
      l.atualizadoPor,
      quando(l.atualizadoEm),
    ]),
  ];

  const porDia = new Map<string, Producao[]>();
  for (const l of lista) {
    const k = `${l.data}|${l.unidadeId}`;
    porDia.set(k, [...(porDia.get(k) ?? []), l]);
  }
  const linhasDia: Celula[][] = [
    ['Dia', 'Dia da semana', 'Unidade', 'Lançamentos', ...rotulos],
    ...[...porDia.entries()].map(([k, ls]) => {
      const [data, u] = k.split('|');
      const soma = somarItens(ls);
      return [formatarData(data), diaDaSemanaPorExtenso(data), siglaDe(u), ls.length, ...colunas.map((c) => c.valor(soma))];
    }),
  ];

  const totais = unidades.map((u) => somarItens(lista.filter((l) => l.unidadeId === u)));
  const geral = somarItens(lista);
  const linhasTotais: Celula[][] = [
    ['Item', ...unidades.map(siglaDe), ...(unidades.length > 1 ? ['8º BPM/M'] : [])],
    ...colunas.map((c) => [c.rotulo, ...totais.map((t) => c.valor(t)), ...(unidades.length > 1 ? [c.valor(geral)] : [])]),
    ['Lançamentos', ...unidades.map((u) => lista.filter((l) => l.unidadeId === u).length), ...(unidades.length > 1 ? [lista.length] : [])],
  ];

  const linhasTaloes: Celula[][] = [
    ['Dia da ocorrência', 'Nº do talão', 'Nº do BOPC', 'Natureza', 'Unidade', 'Pelotão', 'Dia do serviço'],
    ...lista
      .flatMap((l) => l.taloes.map((t) => ({ t, l })))
      .sort((a, b) => a.t.data.localeCompare(b.t.data) || ordemUnidade(a.l.unidadeId) - ordemUnidade(b.l.unidadeId))
      .map(({ t, l }) => [formatarData(t.data), t.numero, t.bopc, t.natureza ? rotuloNatureza(t.natureza) : '', siglaDe(l.unidadeId), PELOTOES.find((p) => p.id === l.pelotao)?.rotulo ?? l.pelotao, formatarData(l.data)]),
  ];

  return [
    { nome: 'Lançamentos', linhas: linhasLanc },
    { nome: 'Por dia', linhas: linhasDia },
    { nome: 'Totais do mês', linhas: linhasTotais },
    { nome: 'Flagrantes', linhas: linhasTaloes },
  ];
}

/** "Produtividade 1ª CIA 2026-11.xlsx" / "Produtividade 8º BPM-M 2026-11.xlsx". */
export function nomePlanilha(mes: string, unidade?: UnidadeId): string {
  return `Produtividade ${unidade ? siglaDe(unidade) : '8º BPM-M'} ${mes}.xlsx`;
}

// ---------- P/3 → Sala de Operações → Resultados das Cias (consulta por período) ----------

/** Maior período de uma consulta (cada dia lê ~1 documento por pelotão que lançou). */
export const MAXIMO_DIAS_CONSULTA = 31;

/** O período pedido é válido? Devolve a mensagem do problema ou '' (tudo certo). */
export function erroPeriodo(de: string, ate: string, hoje: string): string {
  if (!ehDataISO(de) || !ehDataISO(ate)) return 'Informe as duas datas.';
  if (de > ate) return 'A data inicial é depois da final.';
  if (de > hoje) return 'A data inicial ainda não chegou.';
  if (somarDias(de, MAXIMO_DIAS_CONSULTA - 1) < ate) return `Escolha no máximo ${MAXIMO_DIAS_CONSULTA} dias.`;
  return '';
}

/** Os itens que têm algum valor em pelo menos uma das somas (o resto fica de fora da tabela). */
export function itensComValor(somas: readonly Itens[]): ItemId[] {
  return IDS_ITENS.filter((id) => somas.some((s) => (s[id] ?? 0) !== 0));
}

/** Ordena os lançamentos para mostrar: dia mais novo primeiro, depois a ordem dos pelotões. */
export function ordenarLancamentos<T extends Pick<Producao, 'data' | 'pelotao'>>(lista: readonly T[]): T[] {
  const ordem: readonly string[] = PELOTOES.map((p) => p.id);
  return [...lista].sort((a, b) => b.data.localeCompare(a.data) || ordem.indexOf(a.pelotao) - ordem.indexOf(b.pelotao));
}
