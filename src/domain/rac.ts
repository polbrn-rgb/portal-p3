import type { UnidadeId } from './unidades';

// RAC mensal das Cias, da Força Tática e do Batalhão (Fase 1: regras, contas e alertas).
// Ninguém digita Real, Var % nem TOTAL: o portal calcula. O mês é o de REFERÊNCIA, que a P/3 informa
// (o RAC de setembro é feito em outubro). Meses no formato 'AAAA-MM'.

export type Valor = number | null; // null = campo ainda vazio
export type UnidadeRac = UnidadeId | 'btl';

export const DELITOS = [
  { id: 'homicidio', rotulo: 'HOMICÍDIO' },
  { id: 'rouboVeiculo', rotulo: 'ROUBO VEÍCULO' },
  { id: 'furtoVeiculo', rotulo: 'FURTO VEÍCULO' },
  { id: 'rouboOutros', rotulo: 'ROUBO OUTROS' },
  { id: 'furtosOutros', rotulo: 'FURTOS OUTROS' },
  { id: 'rouboCarga', rotulo: 'ROUBO CARGA' },
  { id: 'estupro', rotulo: 'ESTUPRO' },
  { id: 'rouboBanco', rotulo: 'ROUBO A BANCO' },
  { id: 'latrocinio', rotulo: 'LATROCÍNIO' },
] as const;
export type DelitoId = (typeof DELITOS)[number]['id'];

// Ordem e nomes do "Comparativo Produtividade" (QMO).
export const PRODUTIVIDADE = [
  { id: 'flagrante', rotulo: 'Flagrante' },
  { id: 'atosInfracionais', rotulo: 'Atos Infracionais' },
  { id: 'armas', rotulo: 'Armas Apreendidas' },
  { id: 'pessoasAbordadas', rotulo: 'Pessoas Abordadas' },
  { id: 'procurados', rotulo: 'Procurados Capturados' },
  { id: 'veiculosVistoriados', rotulo: 'Veículos Vistoriados' },
  { id: 'motosVistoriadas', rotulo: 'Motos Vistoriadas' },
  { id: 'veiculosApreendidos', rotulo: 'Veículos apreendidos' },
  { id: 'motosApreendidas', rotulo: 'Motos apreendidas' },
  { id: 'ait', rotulo: 'AIT' },
  { id: 'ai', rotulo: 'AI' },
  { id: 'documentos', rotulo: 'Documentos Apreendidos' },
  { id: 'bopm', rotulo: 'BOPM Elaborados' },
  { id: 'ocorrencias', rotulo: 'Ocorrências atendidas' },
] as const;
export type ProdId = (typeof PRODUTIVIDADE)[number]['id'];

// Linhas da "Produtividade Mensal" por pelotão das Cias. Cada uma alimenta um item do comparativo.
const PELOTAO_CIA: readonly { id: ProdId; rotulo: string }[] = [
  { id: 'flagrante', rotulo: 'Flagrantes' },
  { id: 'procurados', rotulo: 'Procurados' },
  { id: 'armas', rotulo: 'Armas Apreendidas' },
  { id: 'motosApreendidas', rotulo: 'Motos Apreendidas' },
  { id: 'veiculosApreendidos', rotulo: 'Carros Apreendidos' },
  { id: 'ai', rotulo: 'AI' },
  { id: 'ait', rotulo: 'AIT' },
  { id: 'pessoasAbordadas', rotulo: 'Pessoas Abordadas' },
  { id: 'motosVistoriadas', rotulo: 'Motos Abordadas' },
  { id: 'veiculosVistoriados', rotulo: 'Carros Abordados' },
];
const COLUNAS_CIA = [
  { id: 'pelA', rotulo: 'Pel A' },
  { id: 'pelB', rotulo: 'Pel B' },
  { id: 'pelC', rotulo: 'Pel C' },
  { id: 'pelD', rotulo: 'Pel D' },
  { id: 're', rotulo: 'RE' },
  { id: 'rpm', rotulo: 'RPM' },
] as const;
const COLUNAS_FT = [
  { id: 'pelA', rotulo: 'Pel A' },
  { id: 'pelB', rotulo: 'Pel B' },
] as const;

export interface LinhaCrime {
  anoAnterior: Valor; // mesmo mês do ano anterior
  mesRetrasado: Valor; // trimestral, 1ª coluna
  mesAnterior: Valor; // trimestral, 2ª coluna
  atual: Valor;
  inconsistencias: Valor; // ocorrências da Cia que aconteceram em outra área
}
export interface LinhaProd {
  anoAnterior: Valor;
  mesAnterior: Valor;
  atual: Valor; // Cias: só os itens fora da tabela por pelotão; FT: não usa; Batalhão: soma
}
export interface RacDados {
  unidade: UnidadeRac;
  mes: string;
  crimes: Record<DelitoId, LinhaCrime>;
  pelotoes: Record<string, Record<string, Valor>>; // linha -> coluna -> valor
  producao: Record<ProdId, LinhaProd>;
  justificativas: Record<string, string>; // id do aviso -> texto
}

export const temCrimes = (u: UnidadeRac): boolean => u !== 'ft';
export const temPelotoes = (u: UnidadeRac): boolean => u !== 'btl';
export function linhasPelotao(u: UnidadeRac): readonly { id: ProdId; rotulo: string }[] {
  if (u === 'btl') return [];
  return u === 'ft' ? PRODUTIVIDADE : PELOTAO_CIA;
}
export function colunasPelotao(u: UnidadeRac): readonly { id: string; rotulo: string }[] {
  if (u === 'btl') return [];
  return u === 'ft' ? COLUNAS_FT : COLUNAS_CIA;
}
/** Itens do comparativo de produtividade que a Cia digita à parte (não estão na tabela por pelotão). */
export function prodDigitadaAParte(u: UnidadeRac): ProdId[] {
  if (u === 'btl') return [];
  const doPelotao = new Set(linhasPelotao(u).map((l) => l.id));
  return PRODUTIVIDADE.map((p) => p.id).filter((id) => !doPelotao.has(id));
}

// ---------- meses ----------

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
/** '2026-09' -> 'set/26' (como nas tabelas do RAC). */
export function rotuloCurto(mes: string): string {
  const [a, m] = mes.split('-');
  return `${MESES_CURTOS[Number(m) - 1]}/${a.slice(2)}`;
}
export function mesesDoRac(mes: string) {
  return { atual: mes, mesAnterior: somarMeses(mes, -1), mesRetrasado: somarMeses(mes, -2), anoAnterior: somarMeses(mes, -12) };
}

// ---------- contas ----------

/** Variação em fração (-0.83 = -83%). Base 0: 0 -> 0 dá 0; 0 -> qualquer outro dá null ("—"). */
export function variacao(antes: Valor, depois: Valor): number | null {
  if (antes === null || depois === null) return null;
  if (antes === 0) return depois === 0 ? 0 : null;
  return (depois - antes) / antes;
}
export function textoVariacao(v: number | null): string {
  if (v === null) return '—';
  const p = Math.round(v * 100);
  return `${p === 0 ? 0 : p}%`;
}

// Cores das células de Var % nos slides atuais.
export const CORES_VAR = { azul: '6FA8DC', verdeCrime: '93C47D', verdeProd: '6AA84F', vermelho: 'CC0000' } as const;
/** Crime: cair é bom (verde). Produtividade: subir é bom. Zero: azul. Sem base: sem cor. */
export function corVariacao(v: number | null, tipo: 'crime' | 'producao'): string | null {
  if (v === null) return null;
  if (Math.round(v * 100) === 0) return CORES_VAR.azul;
  const melhorou = tipo === 'crime' ? v < 0 : v > 0;
  if (!melhorou) return CORES_VAR.vermelho;
  return tipo === 'crime' ? CORES_VAR.verdeCrime : CORES_VAR.verdeProd;
}

function somar(vs: Valor[]): Valor {
  return vs.some((v) => v === null) ? null : vs.reduce<number>((s, v) => s + (v as number), 0);
}
export function totalPelotao(d: RacDados, linha: string): Valor {
  return somar(colunasPelotao(d.unidade).map((c) => d.pelotoes[linha]?.[c.id] ?? null));
}
export function realCrime(l: LinhaCrime): Valor {
  return l.atual === null || l.inconsistencias === null ? null : l.atual - l.inconsistencias;
}
/** Produtividade do mês: tabela por pelotão (TOTAL) + itens digitados à parte; Batalhão: a soma gravada. */
export function producaoAtual(d: RacDados): Record<ProdId, Valor> {
  const doPelotao = new Set<string>(linhasPelotao(d.unidade).map((l) => l.id));
  const r = {} as Record<ProdId, Valor>;
  for (const p of PRODUTIVIDADE) r[p.id] = doPelotao.has(p.id) ? totalPelotao(d, p.id) : d.producao[p.id].atual;
  return r;
}

// ---------- dados vazios e histórico ----------

const linhaCrimeVazia = (): LinhaCrime => ({ anoAnterior: null, mesRetrasado: null, mesAnterior: null, atual: null, inconsistencias: null });
const linhaProdVazia = (): LinhaProd => ({ anoAnterior: null, mesAnterior: null, atual: null });

export function racVazio(unidade: UnidadeRac, mes: string): RacDados {
  const crimes = {} as Record<DelitoId, LinhaCrime>;
  for (const c of DELITOS) crimes[c.id] = linhaCrimeVazia();
  const producao = {} as Record<ProdId, LinhaProd>;
  for (const p of PRODUTIVIDADE) producao[p.id] = linhaProdVazia();
  const pelotoes: RacDados['pelotoes'] = {};
  for (const l of linhasPelotao(unidade)) pelotoes[l.id] = Object.fromEntries(colunasPelotao(unidade).map((c) => [c.id, null]));
  return { unidade, mes, crimes, pelotoes, producao, justificativas: {} };
}

export interface Historico {
  mesAnterior?: RacDados; // RAC enviado pela mesma unidade no mês anterior
  anoAnterior?: RacDados; // RAC do mesmo mês do ano anterior
}

/** Completa os campos ainda vazios com o que a própria unidade já mandou nos RAC anteriores. */
export function preencherDoHistorico(d: RacDados, h: Historico): RacDados {
  const n = structuredClone(d);
  const usar = (atual: Valor, doHistorico: Valor | undefined): Valor => (atual === null ? (doHistorico ?? null) : atual);
  const ant = h.mesAnterior;
  const ano = h.anoAnterior;
  for (const c of DELITOS) {
    const l = n.crimes[c.id];
    l.mesAnterior = usar(l.mesAnterior, ant?.crimes[c.id].atual);
    l.mesRetrasado = usar(l.mesRetrasado, ant?.crimes[c.id].mesAnterior);
    l.anoAnterior = usar(l.anoAnterior, ano?.crimes[c.id].atual);
  }
  const prodAnt = ant ? producaoAtual(ant) : undefined;
  const prodAno = ano ? producaoAtual(ano) : undefined;
  for (const p of PRODUTIVIDADE) {
    const l = n.producao[p.id];
    l.mesAnterior = usar(l.mesAnterior, prodAnt?.[p.id]);
    l.anoAnterior = usar(l.anoAnterior, prodAno?.[p.id]);
  }
  return n;
}

// ---------- conferência ----------

export interface Alerta {
  id: string; // erro: caminho do campo; aviso: chave da justificativa
  nivel: 'erro' | 'aviso';
  campo: string; // caminho do campo para levar o cursor até ele (ex.: 'crimes.furtoVeiculo.inconsistencias')
  mensagem: string;
}

const rotuloDelito = (id: DelitoId) => DELITOS.find((c) => c.id === id)!.rotulo;
const rotuloProd = (id: ProdId) => PRODUTIVIDADE.find((p) => p.id === id)!.rotulo;

function camposDigitados(d: RacDados): { campo: string; valor: Valor; nome: string }[] {
  const out: { campo: string; valor: Valor; nome: string }[] = [];
  const m = mesesDoRac(d.mes);
  if (temCrimes(d.unidade) && d.unidade !== 'btl') {
    const colunas: [keyof LinhaCrime, string][] = [
      ['anoAnterior', rotuloCurto(m.anoAnterior)],
      ['mesRetrasado', rotuloCurto(m.mesRetrasado)],
      ['mesAnterior', rotuloCurto(m.mesAnterior)],
      ['atual', rotuloCurto(m.atual)],
      ['inconsistencias', 'Inconsistências'],
    ];
    for (const c of DELITOS)
      for (const [k, nome] of colunas) out.push({ campo: `crimes.${c.id}.${k}`, valor: d.crimes[c.id][k], nome: `${rotuloDelito(c.id)} — ${nome}` });
  }
  for (const l of linhasPelotao(d.unidade))
    for (const c of colunasPelotao(d.unidade))
      out.push({ campo: `pelotoes.${l.id}.${c.id}`, valor: d.pelotoes[l.id]?.[c.id] ?? null, nome: `${l.rotulo} — ${c.rotulo}` });
  if (d.unidade !== 'btl') {
    for (const id of prodDigitadaAParte(d.unidade))
      out.push({ campo: `producao.${id}.atual`, valor: d.producao[id].atual, nome: `${rotuloProd(id)} — ${rotuloCurto(m.atual)}` });
    for (const p of PRODUTIVIDADE) {
      out.push({ campo: `producao.${p.id}.mesAnterior`, valor: d.producao[p.id].mesAnterior, nome: `${p.rotulo} — ${rotuloCurto(m.mesAnterior)}` });
      out.push({ campo: `producao.${p.id}.anoAnterior`, valor: d.producao[p.id].anoAnterior, nome: `${p.rotulo} — ${rotuloCurto(m.anoAnterior)}` });
    }
  }
  return out;
}

const iguais = (a: Valor[], b: Valor[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const algumPositivo = (a: Valor[]) => a.some((v) => (v ?? 0) > 0);

/**
 * Erros (impedem o envio): campo vazio, número inválido, inconsistências maiores que o total do mês.
 * Avisos (enviam com justificativa): coluna do ano anterior igual à do mês anterior (parece cópia) e
 * números diferentes do que a própria unidade mandou nos RAC anteriores.
 */
export function conferirRac(d: RacDados, h: Historico = {}): Alerta[] {
  const alertas: Alerta[] = [];
  for (const f of camposDigitados(d)) {
    if (f.valor === null) alertas.push({ id: f.campo, nivel: 'erro', campo: f.campo, mensagem: `Preencha ${f.nome}.` });
    else if (!Number.isInteger(f.valor) || f.valor < 0)
      alertas.push({ id: f.campo, nivel: 'erro', campo: f.campo, mensagem: `${f.nome}: use número inteiro, zero ou maior.` });
  }

  if (temCrimes(d.unidade)) {
    for (const c of DELITOS) {
      const l = d.crimes[c.id];
      if (l.atual !== null && l.inconsistencias !== null && l.inconsistencias > l.atual)
        alertas.push({
          id: `crimes.${c.id}.inconsistencias`,
          nivel: 'erro',
          campo: `crimes.${c.id}.inconsistencias`,
          mensagem: `${c.rotulo}: as inconsistências (${l.inconsistencias}) não podem passar do total do mês (${l.atual}).`,
        });
    }
    const ano = DELITOS.map((c) => d.crimes[c.id].anoAnterior);
    if (algumPositivo(ano) && iguais(ano, DELITOS.map((c) => d.crimes[c.id].mesAnterior)))
      alertas.push({
        id: 'copiaCrimes',
        nivel: 'aviso',
        campo: 'crimes.homicidio.anoAnterior',
        mensagem: `Crimes: a coluna ${rotuloCurto(mesesDoRac(d.mes).anoAnterior)} está igual à de ${rotuloCurto(mesesDoRac(d.mes).mesAnterior)}. Confira se não foi copiada.`,
      });
  }

  const ano = PRODUTIVIDADE.map((p) => d.producao[p.id].anoAnterior);
  if (algumPositivo(ano) && iguais(ano, PRODUTIVIDADE.map((p) => d.producao[p.id].mesAnterior)))
    alertas.push({
      id: 'copiaProducao',
      nivel: 'aviso',
      campo: 'producao.flagrante.anoAnterior',
      mensagem: `Produtividade: a coluna ${rotuloCurto(mesesDoRac(d.mes).anoAnterior)} está igual à de ${rotuloCurto(mesesDoRac(d.mes).mesAnterior)}. Confira se não foi copiada.`,
    });

  alertas.push(...conferirHistorico(d, h));
  return alertas;
}

function conferirHistorico(d: RacDados, h: Historico): Alerta[] {
  const out: Alerta[] = [];
  const difCrime: string[] = [];
  const difProd: string[] = [];
  let campoCrime = '';
  let campoProd = '';
  const anotar = (lista: string[], nome: string, digitado: Valor, enviado: Valor) => {
    if (digitado === null || enviado === null || digitado === enviado) return false;
    lista.push(`${nome}: ${digitado} (no RAC enviado: ${enviado})`);
    return true;
  };
  const m = mesesDoRac(d.mes);
  if (temCrimes(d.unidade)) {
    for (const c of DELITOS) {
      const l = d.crimes[c.id];
      const pares: [keyof LinhaCrime, Valor | undefined, string][] = [
        ['mesAnterior', h.mesAnterior?.crimes[c.id].atual, m.mesAnterior],
        ['mesRetrasado', h.mesAnterior?.crimes[c.id].mesAnterior, m.mesRetrasado],
        ['anoAnterior', h.anoAnterior?.crimes[c.id].atual, m.anoAnterior],
      ];
      for (const [k, enviado, mes] of pares)
        if (anotar(difCrime, `${c.rotulo} ${rotuloCurto(mes)}`, l[k], enviado ?? null) && !campoCrime) campoCrime = `crimes.${c.id}.${k}`;
    }
  }
  const prodAnt = h.mesAnterior ? producaoAtual(h.mesAnterior) : undefined;
  const prodAno = h.anoAnterior ? producaoAtual(h.anoAnterior) : undefined;
  for (const p of PRODUTIVIDADE) {
    const l = d.producao[p.id];
    if (anotar(difProd, `${p.rotulo} ${rotuloCurto(m.mesAnterior)}`, l.mesAnterior, prodAnt?.[p.id] ?? null) && !campoProd)
      campoProd = `producao.${p.id}.mesAnterior`;
    if (anotar(difProd, `${p.rotulo} ${rotuloCurto(m.anoAnterior)}`, l.anoAnterior, prodAno?.[p.id] ?? null) && !campoProd)
      campoProd = `producao.${p.id}.anoAnterior`;
  }
  if (difCrime.length)
    out.push({ id: 'historicoCrimes', nivel: 'aviso', campo: campoCrime, mensagem: `Crimes diferentes dos RAC já enviados — ${difCrime.join('; ')}.` });
  if (difProd.length)
    out.push({ id: 'historicoProducao', nivel: 'aviso', campo: campoProd, mensagem: `Produtividade diferente dos RAC já enviados — ${difProd.join('; ')}.` });
  return out;
}

/** Envia se não há erro e todo aviso tem justificativa. */
export function podeEnviar(d: RacDados, alertas: Alerta[]): boolean {
  return alertas.every((a) => a.nivel === 'aviso' && (d.justificativas[a.id] ?? '').trim() !== '');
}

// ---------- Batalhão ----------

const CIAS_RAC: UnidadeRac[] = ['1cia', '2cia', '3cia', '4cia', '5cia', '6cia'];

/**
 * RAC do Batalhão: crimes = soma das 6 Cias; produtividade = soma das 6 Cias e da Força Tática.
 * Se faltar o RAC de alguma delas (ou um número), o total fica vazio — nunca soma pela metade.
 */
export function somarBatalhao(racs: RacDados[], mes: string): RacDados {
  const btl = racVazio('btl', mes);
  const de = (u: UnidadeRac) => racs.find((r) => r.mes === mes && r.unidade === u);
  const cias = CIAS_RAC.map(de);
  const todas = [...cias, de('ft')];
  const soma = <T>(lista: (T | undefined)[], valor: (r: T) => Valor): Valor =>
    lista.some((r) => r === undefined) ? null : somar(lista.map((r) => valor(r as T)));
  for (const c of DELITOS)
    for (const k of Object.keys(btl.crimes[c.id]) as (keyof LinhaCrime)[]) btl.crimes[c.id][k] = soma(cias, (r) => r.crimes[c.id][k]);
  const atuais = todas.map((r) => (r ? producaoAtual(r) : undefined));
  for (const p of PRODUTIVIDADE) {
    btl.producao[p.id] = {
      atual: soma(atuais, (a) => a[p.id]),
      mesAnterior: soma(todas, (r) => r.producao[p.id].mesAnterior),
      anoAnterior: soma(todas, (r) => r.producao[p.id].anoAnterior),
    };
  }
  return btl;
}

// ---------- tabelas dos slides ----------

export interface LinhaTabela {
  rotulo: string;
  valores: Valor[];
  variacao?: number | null;
}
export interface Tabela {
  id: 'anual' | 'inconsistencias' | 'trimestral' | 'pelotao' | 'prodMensal' | 'prodAnual';
  titulo: string;
  fonte: string;
  cabecalho: string[];
  linhas: LinhaTabela[];
  tipoVar?: 'crime' | 'producao';
}

const NOME_UNIDADE: Record<UnidadeRac, string> = {
  '1cia': '1ª Cia',
  '2cia': '2ª Cia',
  '3cia': '3ª Cia',
  '4cia': '4ª Cia',
  '5cia': '5ª Cia',
  '6cia': '6ª Cia',
  ft: 'Cia FT',
  btl: 'Batalhão',
};
export const nomeUnidadeRac = (u: UnidadeRac) => NOME_UNIDADE[u];

/** As tabelas do RAC, na ordem dos slides, já com Real, TOTAL e Var % calculados. */
export function tabelasDoRac(d: RacDados): Tabela[] {
  const m = mesesDoRac(d.mes);
  const [ano, ant, ret, atu] = [m.anoAnterior, m.mesAnterior, m.mesRetrasado, m.atual].map(rotuloCurto);
  const t: Tabela[] = [];
  if (temCrimes(d.unidade)) {
    const cr = DELITOS.map((c) => ({ c, l: d.crimes[c.id] }));
    t.push({
      id: 'anual',
      titulo: 'COMPARATIVO ANUAL',
      fonte: 'FONTE: SICOORD - SPJ',
      cabecalho: ['DELITO', ano, atu, 'Var %'],
      linhas: cr.map(({ c, l }) => ({ rotulo: c.rotulo, valores: [l.anoAnterior, l.atual], variacao: variacao(l.anoAnterior, l.atual) })),
      tipoVar: 'crime',
    });
    t.push({
      id: 'inconsistencias',
      titulo: 'COMPARATIVO ANUAL COM INCONSISTÊNCIAS',
      fonte: 'FONTE: SICOORD - SPJ',
      cabecalho: ['DELITO', ano, atu, 'Inconsistências', 'Real', 'Var %'],
      linhas: cr.map(({ c, l }) => ({
        rotulo: c.rotulo,
        valores: [l.anoAnterior, l.atual, l.inconsistencias, realCrime(l)],
        variacao: variacao(l.anoAnterior, realCrime(l)),
      })),
      tipoVar: 'crime',
    });
    t.push({
      id: 'trimestral',
      titulo: 'COMPARATIVO TRIMESTRAL',
      fonte: 'FONTE: SICOORD',
      cabecalho: ['DELITO', ret, ant, atu],
      linhas: cr.map(({ c, l }) => ({ rotulo: c.rotulo, valores: [l.mesRetrasado, l.mesAnterior, l.atual] })),
    });
  }
  if (temPelotoes(d.unidade)) {
    t.push({
      id: 'pelotao',
      titulo: 'PRODUTIVIDADE MENSAL',
      fonte: 'FONTE QMO',
      cabecalho: [`8º BPMM – ${NOME_UNIDADE[d.unidade]}`, ...colunasPelotao(d.unidade).map((c) => c.rotulo), 'TOTAL'],
      linhas: linhasPelotao(d.unidade).map((l) => ({
        rotulo: l.rotulo,
        valores: [...colunasPelotao(d.unidade).map((c) => d.pelotoes[l.id]?.[c.id] ?? null), totalPelotao(d, l.id)],
      })),
    });
  }
  const atual = producaoAtual(d);
  const prod = (titulo: string, id: 'prodMensal' | 'prodAnual', rotuloAntes: string, chave: 'mesAnterior' | 'anoAnterior'): Tabela => ({
    id,
    titulo,
    fonte: 'FONTE QMO',
    cabecalho: ['PRODUTIVIDADE POLICIAL', rotuloAntes, atu, 'Var %'],
    linhas: PRODUTIVIDADE.map((p) => {
      const antes = d.producao[p.id][chave];
      return { rotulo: p.rotulo, valores: [antes, atual[p.id]], variacao: variacao(antes, atual[p.id]) };
    }),
    tipoVar: 'producao',
  });
  t.push(prod('COMPARATIVO PRODUTIVIDADE MENSAL', 'prodMensal', ant, 'mesAnterior'));
  t.push(prod('COMPARATIVO PRODUTIVIDADE ANUAL', 'prodAnual', ano, 'anoAnterior'));
  return t;
}
