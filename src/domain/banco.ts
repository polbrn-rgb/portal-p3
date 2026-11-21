// Banco de dados do Batalhão: TODOS os números que o portal guarda, separados por Cia e por mês, com o mesmo nome
// (o "indicador") venha de onde vier:
//   - produção dos pelotões (Sala de Operações, por dia/turno/pelotão) — somada no mês;
//   - flagrantes da produção, contados pela natureza da ocorrência;
//   - Documentos Mensais enviados pelas Cias (todos os campos, inclusive texto e listas);
//   - RAC enviado pelas Cias (crimes do mês e inconsistências).
// Nada é gravado em dobro: o banco é montado na hora a partir das coleções de origem (que nunca são zeradas).
// Uma planilha nova pedida por escalão superior é adequada a partir daqui (ver INDICADORES) e o painel estatístico
// do Batalhão usa a série diária (serieDiaria).
import { daUnidade, documentosDoMes, DOCUMENTOS, mesReferencia, prazoDoDocumento, type EnvioMensal } from './documentosMensais';
import { situacaoProducaoMes } from './integracao';
import {
  GRUPOS_PRODUCAO,
  ITENS_PRODUCAO,
  NATUREZAS_FLAGRANTE,
  somarItens,
  totalDrogasKg,
  type Itens,
  type Producao,
} from './producao';
import { DELITOS, type RacSalvo } from './rac';
import { UNIDADES, type UnidadeId } from './unidades';

export type OrigemIndicador = 'producao' | 'flagrantes' | 'documento' | 'rac';
export type Indicador = {
  /** Nome fixo, nunca muda (ex.: "producao.pessoasAbordadas", "doc.bo-eletronico.furtoCel", "rac.crime.homicidio"). */
  id: string;
  rotulo: string;
  grupo: string;
  origem: OrigemIndicador;
  tipo: 'numero' | 'texto';
  /** Documento Mensal de onde vem (origem "documento"). */
  docId?: string;
};
export type ValorBanco = number | string;

export const ROTULO_ORIGEM: Record<OrigemIndicador, string> = {
  producao: 'Produção dos pelotões',
  flagrantes: 'Flagrantes (produção)',
  documento: 'Documentos Mensais',
  rac: 'RAC',
};

const grupoProducao = (g: string) => `Produção · ${GRUPOS_PRODUCAO.find((x) => x.id === g)?.rotulo ?? g}`;

function indicadoresDosDocumentos(): Indicador[] {
  return DOCUMENTOS.flatMap((d) => {
    const doc = (campo: string, rotulo: string, tipo: Indicador['tipo'], grupo?: string): Indicador => ({
      id: `doc.${d.id}.${campo}`,
      rotulo,
      grupo: grupo ? `${d.nome} · ${grupo}` : d.nome,
      origem: 'documento',
      tipo,
      docId: d.id,
    });
    const campos = (d.campos ?? []).filter((c) => !c.daLista).map((c) => doc(c.id, c.rotulo, c.texto ? 'texto' : 'numero', c.grupo));
    const lista = d.lista ? [doc('linhas', 'Linhas informadas (quantidade)', 'numero'), doc('lista', 'Linhas informadas', 'texto')] : [];
    return [...campos, ...lista, doc('preenchidoPor', d.direto ? 'Confirmado por' : 'Preenchido por', 'texto')];
  });
}

/** O catálogo: cada número que o banco guarda, com nome fixo. */
export const INDICADORES: readonly Indicador[] = [
  ...ITENS_PRODUCAO.map((i) => ({ id: `producao.${i.id}`, rotulo: i.rotulo, grupo: grupoProducao(i.grupo), origem: 'producao' as const, tipo: 'numero' as const })),
  { id: 'producao.drogasTotalKg', rotulo: 'Entorpecentes - total (kg)', grupo: grupoProducao('apreensoes'), origem: 'producao', tipo: 'numero' },
  { id: 'producao.lancamentos', rotulo: 'Lançamentos de produção no mês', grupo: 'Produção · Controle', origem: 'producao', tipo: 'numero' },
  { id: 'producao.turnosSemLancamento', rotulo: 'Turnos sem lançamento no mês', grupo: 'Produção · Controle', origem: 'producao', tipo: 'numero' },
  { id: 'flagrantes.total', rotulo: 'Flagrantes anotados (talões)', grupo: 'Flagrantes por natureza', origem: 'flagrantes', tipo: 'numero' },
  ...NATUREZAS_FLAGRANTE.map((n) => ({ id: `flagrantes.${n.id}`, rotulo: n.rotulo, grupo: 'Flagrantes por natureza', origem: 'flagrantes' as const, tipo: 'numero' as const })),
  { id: 'flagrantes.semNatureza', rotulo: 'Sem natureza informada', grupo: 'Flagrantes por natureza', origem: 'flagrantes', tipo: 'numero' },
  { id: 'flagrantes.semBopc', rotulo: 'Sem nº do BOPC', grupo: 'Flagrantes por natureza', origem: 'flagrantes', tipo: 'numero' },
  ...DELITOS.map((c) => ({ id: `rac.crime.${c.id}`, rotulo: c.rotulo, grupo: 'RAC · Crimes do mês', origem: 'rac' as const, tipo: 'numero' as const })),
  ...DELITOS.map((c) => ({ id: `rac.inconsistencia.${c.id}`, rotulo: c.rotulo, grupo: 'RAC · Inconsistências', origem: 'rac' as const, tipo: 'numero' as const })),
  ...indicadoresDosDocumentos(),
];

const POR_ID = new Map(INDICADORES.map((i) => [i.id, i]));
export const indicador = (id: string): Indicador | undefined => POR_ID.get(id);

// ---------- montagem ----------

export type SituacaoCiaMes = {
  lancamentos: number;
  /** null = a Cia não lançou nada na produção neste mês. */
  producaoCompleta: boolean | null;
  turnosSemLancamento: number;
  documentosEnviados: string[];
  documentosEsperados: string[];
  racEnviado: boolean;
};

/** Um mês de uma Cia: todos os indicadores que têm valor. */
export type RegistroBanco = { mes: string; unidadeId: UnidadeId; valores: Record<string, ValorBanco>; situacao: SituacaoCiaMes };

export type FontesBanco = {
  producao: readonly Producao[];
  envios: readonly EnvioMensal[];
  racs: readonly RacSalvo[];
};

/** "2026-01".."2026-03" -> ["2026-01", "2026-02", "2026-03"]. */
export function mesesEntre(de: string, ate: string): string[] {
  const r: string[] = [];
  let [a, m] = de.split('-').map(Number);
  const [a2, m2] = ate.split('-').map(Number);
  while ((a < a2 || (a === a2 && m <= m2)) && r.length < 600) {
    r.push(`${a}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) [a, m] = [a + 1, 1];
  }
  return r;
}

function valoresDaProducao(lancs: readonly Producao[], mes: string, u: UnidadeId, hoje: string, v: Record<string, ValorBanco>) {
  if (!lancs.length) return;
  const soma: Itens = somarItens(lancs);
  for (const i of ITENS_PRODUCAO) v[`producao.${i.id}`] = soma[i.id];
  v['producao.drogasTotalKg'] = totalDrogasKg(soma);
  v['producao.lancamentos'] = lancs.length;
  v['producao.turnosSemLancamento'] = situacaoProducaoMes(lancs, mes, u, hoje).turnosFaltando;
  const taloes = lancs.flatMap((l) => l.taloes);
  v['flagrantes.total'] = taloes.length;
  for (const n of NATUREZAS_FLAGRANTE) v[`flagrantes.${n.id}`] = taloes.filter((t) => t.natureza === n.id).length;
  v['flagrantes.semNatureza'] = taloes.filter((t) => !t.natureza).length;
  v['flagrantes.semBopc'] = taloes.filter((t) => !t.bopc).length;
}

function valoresDoEnvio(e: EnvioMensal, v: Record<string, ValorBanco>) {
  const d = DOCUMENTOS.find((x) => x.id === e.docId);
  if (!d) return;
  for (const c of d.campos ?? []) {
    if (c.daLista) continue;
    const x = e.valores[c.id];
    if (typeof x === 'number' || (typeof x === 'string' && x !== '')) v[`doc.${d.id}.${c.id}`] = x;
  }
  if (d.lista) {
    const linhas: string[] = [];
    for (let i = 1; ; i++) {
      const cols = d.lista.colunas.map((c) => String(e.valores[`l${i}_${c.id}`] ?? '').trim());
      if (cols.every((t) => !t) || cols.includes(d.lista.semRegistro.texto)) break;
      const opcao = d.lista.opcao?.opcoes.find((_, k) => e.valores[`l${i}_${d.lista!.opcao!.id}${k}`] === true)?.rotulo;
      linhas.push([...cols, ...(opcao ? [opcao] : [])].join(' · '));
    }
    v[`doc.${d.id}.linhas`] = linhas.length;
    v[`doc.${d.id}.lista`] = linhas.length ? linhas.join(' | ') : d.lista.semRegistro.texto;
  }
  v[`doc.${d.id}.preenchidoPor`] = e.respondidoPor;
}

function valoresDoRac(r: RacSalvo, v: Record<string, ValorBanco>) {
  for (const c of DELITOS) {
    const l = r.crimes[c.id];
    if (l?.atual !== null && l?.atual !== undefined) v[`rac.crime.${c.id}`] = l.atual;
    if (l?.inconsistencias !== null && l?.inconsistencias !== undefined) v[`rac.inconsistencia.${c.id}`] = l.inconsistencias;
  }
}

/** O banco do período: um registro por Cia por mês (inclusive os meses sem nada, para ver o que falta). */
export function montarBanco(f: FontesBanco, meses: readonly string[], hoje: string, unidades: readonly UnidadeId[] = UNIDADES.map((u) => u.id)): RegistroBanco[] {
  return meses.flatMap((mes) =>
    unidades.map((u) => {
      const valores: Record<string, ValorBanco> = {};
      const lancs = f.producao.filter((l) => l.unidadeId === u && l.mes === mes);
      valoresDaProducao(lancs, mes, u, hoje, valores);
      const envios = f.envios.filter((e) => e.unidadeId === u && e.mesRef === mes);
      for (const e of envios) valoresDoEnvio(e, valores);
      const rac = f.racs.find((r) => r.unidade === u && r.mes === mes && r.status === 'enviado');
      if (rac) valoresDoRac(rac, valores);
      const s = lancs.length ? situacaoProducaoMes(lancs, mes, u, hoje) : null;
      return {
        mes,
        unidadeId: u,
        valores,
        situacao: {
          lancamentos: lancs.length,
          producaoCompleta: s ? s.completa : null,
          turnosSemLancamento: s ? s.turnosFaltando : 0,
          documentosEnviados: envios.map((e) => e.docId),
          documentosEsperados: documentosEsperados(mes, u),
          racEnviado: !!rac,
        },
      };
    }),
  );
}

/** Documentos Mensais que a Cia deve enviar com os dados deste mês. */
export function documentosEsperados(mes: string, u: UnidadeId): string[] {
  return documentosDoMes(mes)
    .filter((d) => daUnidade(d, u))
    .map((d) => d.id);
}

/** Soma de um indicador numérico em vários registros (ex.: o Batalhão todo, o trimestre). */
export function somarIndicador(registros: readonly RegistroBanco[], id: string): number {
  return Math.round(registros.reduce((s, r) => s + (typeof r.valores[id] === 'number' ? (r.valores[id] as number) : 0), 0) * 1000) / 1000;
}

// ---------- série diária (para o painel estatístico do Batalhão) ----------

export type DiaBanco = { data: string; unidadeId: UnidadeId; lancamentos: number; itens: Itens; flagrantes: number; flagrantesTrafico: number };

/** Produção somada por dia e por Cia. */
export function serieDiaria(lancs: readonly Producao[]): DiaBanco[] {
  const porChave = new Map<string, Producao[]>();
  for (const l of lancs) {
    const k = `${l.data}|${l.unidadeId}`;
    porChave.set(k, [...(porChave.get(k) ?? []), l]);
  }
  return [...porChave.entries()]
    .map(([k, ls]) => {
      const [data, unidadeId] = k.split('|') as [string, UnidadeId];
      const taloes = ls.flatMap((l) => l.taloes);
      return {
        data,
        unidadeId,
        lancamentos: ls.length,
        itens: somarItens(ls),
        flagrantes: taloes.length,
        flagrantesTrafico: taloes.filter((t) => t.natureza === 'trafico').length,
      };
    })
    .sort((a, b) => a.data.localeCompare(b.data) || UNIDADES.findIndex((u) => u.id === a.unidadeId) - UNIDADES.findIndex((u) => u.id === b.unidadeId));
}

// ---------- planilha do banco (cópia de segurança e base para adequar planilhas pedidas) ----------

type Celula = string | number;
const siglaDe = (u: string) => UNIDADES.find((x) => x.id === u)?.sigla ?? u;

/** Abas: o banco em linhas (Mês × Cia × indicador), a cobertura de cada mês e o catálogo. */
export function abasDoBanco(registros: readonly RegistroBanco[]): { nome: string; linhas: Celula[][] }[] {
  const linhas: Celula[][] = [['Mês', 'Unidade', 'Origem', 'Grupo', 'Indicador', 'Valor', 'Código do indicador']];
  for (const r of registros)
    for (const ind of INDICADORES) {
      const v = r.valores[ind.id];
      if (v === undefined) continue;
      linhas.push([r.mes, siglaDe(r.unidadeId), ROTULO_ORIGEM[ind.origem], ind.grupo, ind.rotulo, v, ind.id]);
    }
  const cobertura: Celula[][] = [
    ['Mês', 'Unidade', 'Lançamentos de produção', 'Produção completa', 'Turnos sem lançamento', 'Documentos enviados', 'Documentos esperados', 'Documentos faltando', 'RAC enviado'],
    ...registros.map((r) => {
      const s = r.situacao;
      const faltando = s.documentosEsperados.filter((d) => !s.documentosEnviados.includes(d)).map((d) => DOCUMENTOS.find((x) => x.id === d)?.nome ?? d);
      return [
        r.mes,
        siglaDe(r.unidadeId),
        s.lancamentos,
        s.producaoCompleta === null ? 'sem lançamentos' : s.producaoCompleta ? 'sim' : 'não',
        s.turnosSemLancamento,
        s.documentosEnviados.length,
        s.documentosEsperados.length,
        faltando.join(', '),
        s.racEnviado ? 'sim' : 'não',
      ];
    }),
  ];
  const catalogo: Celula[][] = [['Código do indicador', 'Indicador', 'Grupo', 'Origem', 'Tipo'], ...INDICADORES.map((i) => [i.id, i.rotulo, i.grupo, ROTULO_ORIGEM[i.origem], i.tipo])];
  return [
    { nome: 'Banco (Cia x mês)', linhas },
    { nome: 'Cobertura', linhas: cobertura },
    { nome: 'Catálogo', linhas: catalogo },
  ];
}

// ---------- histórico e cópia de segurança ----------

export type HistoricoProducao = {
  producaoId: string;
  unidadeId: UnidadeId;
  mes: string;
  acao: 'lancado' | 'corrigido' | 'excluido';
  itens: Itens;
  taloes: Producao['taloes'];
  por: string;
  em: Date | null;
};
export type HistoricoEnvio = {
  envioId: string;
  docId: string;
  mesRef: string;
  unidadeId: UnidadeId;
  valores: Record<string, ValorBanco | boolean>;
  daProducao?: Record<string, number>;
  respondidoPor: string;
  em: Date | null;
};

const ROTULO_ACAO = { lancado: 'lançado', corrigido: 'corrigido', excluido: 'excluído' } as const;
const dataHora = (d: Date | null) =>
  d
    ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    : '';

/** Abas do histórico: cada lançamento/correção/exclusão da produção e cada envio de Documento Mensal. */
export function abasDoHistorico(producao: readonly HistoricoProducao[], envios: readonly HistoricoEnvio[]): { nome: string; linhas: Celula[][] }[] {
  const porData = <T extends { em: Date | null }>(l: readonly T[]) => [...l].sort((a, b) => (a.em?.getTime() ?? 0) - (b.em?.getTime() ?? 0));
  const nomeDoc = (id: string) => DOCUMENTOS.find((d) => d.id === id)?.nome ?? id;
  return [
    {
      nome: 'Histórico da produção',
      linhas: [
        ['Quando', 'Unidade', 'Lançamento', 'Ação', 'Por', ...ITENS_PRODUCAO.map((i) => i.rotulo), 'Flagrantes'],
        ...porData(producao).map((h) => [
          dataHora(h.em),
          siglaDe(h.unidadeId),
          h.producaoId,
          ROTULO_ACAO[h.acao] ?? h.acao,
          h.por,
          ...ITENS_PRODUCAO.map((i) => h.itens[i.id] ?? 0),
          h.taloes.map((t) => `${t.numero}${t.natureza ? ` (${t.natureza})` : ''}`).join(', '),
        ]),
      ],
    },
    {
      nome: 'Histórico dos documentos',
      linhas: [
        ['Quando', 'Unidade', 'Documento', 'Mês dos dados', 'Por', 'Valores enviados', 'Vindos da produção'],
        ...porData(envios).map((h) => [
          dataHora(h.em),
          siglaDe(h.unidadeId),
          nomeDoc(h.docId),
          h.mesRef,
          h.respondidoPor,
          Object.entries(h.valores)
            .filter(([, v]) => v !== '' && v !== false)
            .map(([k, v]) => `${k}=${v}`)
            .join('; '),
          h.daProducao ? Object.entries(h.daProducao).map(([k, v]) => `${k}=${v}`).join('; ') : '',
        ]),
      ],
    },
  ];
}

/** "Banco de dados 8º BPM-M 2026-10.xlsx" / "... 2026-01 a 2026-10.xlsx". */
export function nomeCopia(de: string, ate: string): string {
  return `Banco de dados 8º BPM-M ${de === ate ? de : `${de} a ${ate}`}.xlsx`;
}

/**
 * Mês que já pode ter a cópia automática: o mês de referência, depois do prazo do último Documento Mensal dele
 * (aí as Cias já enviaram tudo). null = ainda não.
 */
export function mesDaCopiaAutomatica(hoje: string): string | null {
  const mes = mesReferencia(hoje);
  const ultimo = documentosDoMes(mes).reduce((m, d) => (prazoDoDocumento(d, mes) > m ? prazoDoDocumento(d, mes) : m), '');
  return hoje > ultimo ? mes : null;
}
