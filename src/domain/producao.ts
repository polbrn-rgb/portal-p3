// Produção diária dos pelotões, lançada pela Sala de Operações de cada Cia/FT no fim do turno.
//
// - Turno de 12x36: Pel A e Pel C de dia, Pel B e Pel D de noite (na FT: Pel A de dia, Pel B de noite). RE e RPM à parte.
// - Um lançamento por pelotão por dia de serviço (o turno da noite usa a data em que começou).
// - O resultado da BCS entra no resultado do pelotão.
// - Os números dos talões ficam guardados com a data da ocorrência: a P/3 usa para colher os dados oficiais do QMO.
//
// É o banco de onde saem as planilhas (CPA diário, RAC por pelotão, trimestral, BCS...). Os códigos dos itens são os
// mesmos do RAC (domain/rac.ts) para o RAC poder ser preenchido daqui.
import { ehDataISO, formatarData, somarDias } from './datas';
import { UNIDADES, type UnidadeId } from './unidades';

/** Uma aba de planilha (o mesmo formato que lib/xlsx grava). */
type Celula = string | number;
export type AbaPlanilha = { nome: string; linhas: Celula[][] };

export type PelotaoId = 'pelA' | 'pelB' | 'pelC' | 'pelD' | 're' | 'rpm';
export type Turno = 'dia' | 'noite' | '';

export const PELOTOES: readonly { id: PelotaoId; rotulo: string; turno: Turno }[] = [
  { id: 'pelA', rotulo: 'Pel A', turno: 'dia' },
  { id: 'pelB', rotulo: 'Pel B', turno: 'noite' },
  { id: 'pelC', rotulo: 'Pel C', turno: 'dia' },
  { id: 'pelD', rotulo: 'Pel D', turno: 'noite' },
  { id: 're', rotulo: 'RE', turno: '' },
  { id: 'rpm', rotulo: 'RPM', turno: '' },
];

/** Pelotões de cada unidade (os mesmos do RAC: Cia com Pel A–D, RE e RPM; FT com Pel A e B). */
export function pelotoesDa(unidade: UnidadeId) {
  return unidade === 'ft' ? PELOTOES.filter((p) => p.id === 'pelA' || p.id === 'pelB') : PELOTOES;
}

export function rotuloPelotao(id: string): string {
  const p = PELOTOES.find((x) => x.id === id);
  if (!p) return id;
  return p.turno ? `${p.rotulo} (${p.turno})` : p.rotulo;
}

export const turnoDo = (id: string): Turno => PELOTOES.find((p) => p.id === id)?.turno ?? '';

export const GRUPOS_PRODUCAO = [
  { id: 'abordagens', rotulo: 'Abordagens' },
  { id: 'prisoes', rotulo: 'Prisões' },
  { id: 'apreensoes', rotulo: 'Apreensões' },
  { id: 'transito', rotulo: 'Trânsito' },
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
  { id: 'entorpecentesKg', rotulo: 'Entorpecentes apreendidos (kg)', grupo: 'apreensoes', decimal: true },
  { id: 'veiculosRecuperados', rotulo: 'Veículos recuperados', grupo: 'apreensoes' },
  { id: 'veiculosApreendidos', rotulo: 'Carros apreendidos', grupo: 'apreensoes' },
  { id: 'motosApreendidas', rotulo: 'Motos apreendidas', grupo: 'apreensoes' },
  { id: 'documentos', rotulo: 'Documentos apreendidos', grupo: 'apreensoes' },
  { id: 'ait', rotulo: 'AIT (CET)', grupo: 'transito' },
  { id: 'ai', rotulo: 'AI (DETRAN)', grupo: 'transito' },
  { id: 'ocorrencias', rotulo: 'Ocorrências atendidas', grupo: 'registros' },
  { id: 'bopm', rotulo: 'BOPM elaborados', grupo: 'registros' },
  { id: 'operacoes', rotulo: 'Operações realizadas', grupo: 'registros' },
  { id: 'raiia', rotulo: 'RAIIA', grupo: 'registros' },
  { id: 'palestras', rotulo: 'Palestras realizadas', grupo: 'registros' },
] as const satisfies readonly { id: string; rotulo: string; grupo: GrupoProducao; decimal?: boolean }[];

export type ItemId = (typeof ITENS_PRODUCAO)[number]['id'];
export type Itens = Record<ItemId, number>;
export const IDS_ITENS = ITENS_PRODUCAO.map((i) => i.id) as ItemId[];
export const ehDecimal = (id: ItemId): boolean => ITENS_PRODUCAO.some((i) => i.id === id && 'decimal' in i && i.decimal);

export const MAXIMO_QUANTIDADE = 99_999;
export const MAXIMO_TALOES = 100;
export const LIMITE_TALAO = 30;

export type Talao = { numero: string; data: string };

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

/** '' = pode incluir; senão, o erro. */
export function validarTalao(t: Talao, ja: readonly Talao[]): string {
  const n = normalizarTalao(t.numero);
  if (!n) return 'Digite o número do talão.';
  if (n.length > LIMITE_TALAO || !/^[0-9A-Z./-]+$/.test(n)) return 'Use só números (e letras, se o talão tiver).';
  if (!ehDataISO(t.data)) return 'Informe o dia da ocorrência.';
  if (ja.some((x) => normalizarTalao(x.numero) === n)) return 'Este talão já está na lista.';
  if (ja.length >= MAXIMO_TALOES) return `Até ${MAXIMO_TALOES} talões por lançamento.`;
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
  if (p.taloes.length > MAXIMO_TALOES) erros.taloes = `Até ${MAXIMO_TALOES} talões por lançamento.`;
  return { erros, itens: Object.keys(erros).length ? null : itens };
}

/** Conferências que não impedem salvar: só chamam a atenção para números que não batem. */
export function avisosProducao(itens: Itens, taloes: readonly Talao[]): string[] {
  const avisos: string[] = [];
  const presos = itens.flagrante + itens.procurados;
  if (presos > 0 && itens.ocorrenciasComPrisao === 0) avisos.push('Houve presos: informe quantas ocorrências tiveram prisão.');
  if (itens.ocorrenciasComPrisao > presos) avisos.push('Há mais ocorrências com prisão do que presos (flagrante + mandado).');
  if (itens.ocorrenciasComPrisao > itens.ocorrencias) avisos.push('Ocorrências atendidas menor que as ocorrências com prisão.');
  if (itens.ocorrenciasComPrisao > 0 && taloes.length === 0) avisos.push('Anote os talões das ocorrências com prisão: a P/3 usa para colher os dados.');
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
 * Dias do mês (até ontem) em que faltou o lançamento do turno do dia ou da noite.
 * Hoje não conta: o lançamento é feito no fim do turno. Só conta a partir do primeiro lançamento da unidade
 * (`desde`; null = a unidade ainda não começou a lançar): os dias de antes do sistema não viram pendência.
 */
export function pendencias(
  lancamentos: readonly Pick<Producao, 'data' | 'pelotao'>[],
  mes: string,
  hoje: string,
  desde: string | null,
): PendenciaDia[] {
  const r: PendenciaDia[] = [];
  if (!desde) return r;
  for (const data of diasDoMes(mes)) {
    if (data >= hoje) break;
    if (data < desde) continue;
    const doDia = lancamentos.filter((l) => l.data === data);
    const faltaDia = !doDia.some((l) => turnoDo(l.pelotao) === 'dia');
    const faltaNoite = !doDia.some((l) => turnoDo(l.pelotao) === 'noite');
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
 * os totais do mês por unidade e os talões.
 */
export function abasDaProducao(lancamentos: readonly Producao[], unidades: readonly UnidadeId[]): AbaPlanilha[] {
  const lista = ordenar(lancamentos.filter((l) => unidades.includes(l.unidadeId)));
  const rotulos = ITENS_PRODUCAO.map((i) => i.rotulo);

  const linhasLanc: Celula[][] = [
    ['Dia do serviço', 'Dia da semana', 'Unidade', 'Pelotão', 'Turno', ...rotulos, 'Talões', 'Lançado por', 'Lançado em', 'Atualizado por', 'Atualizado em'],
    ...lista.map((l) => [
      formatarData(l.data),
      diaDaSemanaPorExtenso(l.data),
      siglaDe(l.unidadeId),
      PELOTOES.find((p) => p.id === l.pelotao)?.rotulo ?? l.pelotao,
      turnoDo(l.pelotao),
      ...IDS_ITENS.map((id) => l.itens[id]),
      l.taloes.map((t) => t.numero).join(', '),
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
      return [formatarData(data), diaDaSemanaPorExtenso(data), siglaDe(u), ls.length, ...IDS_ITENS.map((id) => soma[id])];
    }),
  ];

  const totais = unidades.map((u) => somarItens(lista.filter((l) => l.unidadeId === u)));
  const geral = somarItens(lista);
  const linhasTotais: Celula[][] = [
    ['Item', ...unidades.map(siglaDe), ...(unidades.length > 1 ? ['8º BPM/M'] : [])],
    ...ITENS_PRODUCAO.map((it, i) => [it.rotulo, ...totais.map((t) => t[IDS_ITENS[i]]), ...(unidades.length > 1 ? [geral[IDS_ITENS[i]]] : [])]),
    ['Lançamentos', ...unidades.map((u) => lista.filter((l) => l.unidadeId === u).length), ...(unidades.length > 1 ? [lista.length] : [])],
  ];

  const linhasTaloes: Celula[][] = [
    ['Dia da ocorrência', 'Nº do talão', 'Unidade', 'Pelotão', 'Dia do serviço'],
    ...lista
      .flatMap((l) => l.taloes.map((t) => ({ t, l })))
      .sort((a, b) => a.t.data.localeCompare(b.t.data) || ordemUnidade(a.l.unidadeId) - ordemUnidade(b.l.unidadeId))
      .map(({ t, l }) => [formatarData(t.data), t.numero, siglaDe(l.unidadeId), PELOTOES.find((p) => p.id === l.pelotao)?.rotulo ?? l.pelotao, formatarData(l.data)]),
  ];

  return [
    { nome: 'Lançamentos', linhas: linhasLanc },
    { nome: 'Por dia', linhas: linhasDia },
    { nome: 'Totais do mês', linhas: linhasTotais },
    { nome: 'Talões', linhas: linhasTaloes },
  ];
}

/** "Produtividade 1ª CIA 2026-11.xlsx" / "Produtividade 8º BPM-M 2026-11.xlsx". */
export function nomePlanilha(mes: string, unidade?: UnidadeId): string {
  return `Produtividade ${unidade ? siglaDe(unidade) : '8º BPM-M'} ${mes}.xlsx`;
}
