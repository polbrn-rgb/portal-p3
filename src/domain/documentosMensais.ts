import { hojeISO } from './datas';
import { UNIDADES, type UnidadeId } from './unidades';

// Operações → Documentos Mensais: planilhas que as Cias preenchem todo mês até o Nº dia útil
// (pasta "DOCUMENTOS MENSAIS" do Drive da P/3). As Cias preenchem pelo portal; o motor (Apps Script)
// grava cada número na célula certa, marca a legenda e, ao virar o mês, guarda uma cópia e zera a planilha.
// Uma planilha nova entra aqui só por configuração (sem programar de novo).

export type Campo = { id: string; rotulo: string; grupo?: string; texto?: boolean; decimal?: boolean };

export type DocumentoMensal = {
  id: string;
  nome: string;
  diaUtil: number; // prazo das Cias: Nº dia útil do mês
  planilhaId: string;
  meses?: number[]; // só nesses meses (ex.: trimestral). Vazio = todo mês
  // Preenchido pelas Cias no portal (sem isto, a P/3 só acompanha e marca "feito"):
  aba?: string;
  campos?: Campo[];
  celulas?: Partial<Record<UnidadeId, Record<string, string>>>; // Cia -> campo -> célula (ex.: "C3")
  legenda?: { modelo: string; celulas: Partial<Record<UnidadeId, string>> }; // "Preenchimento do Mês de {Mes} - {QUEM}"
  mes?: { celula: string; modelo: string }; // cabeçalho com o mês de referência
  ancoras?: Record<string, string>; // textos que precisam estar na planilha (senão o motor não grava)
  zerarCom?: '' | 0;
};

const CIAS: UnidadeId[] = ['1cia', '2cia', '3cia', '4cia', '5cia', '6cia', 'ft'];

/** Itens nas linhas e uma coluna por Cia. */
function colunaPorCia(colunas: Partial<Record<UnidadeId, string>>, linhas: Record<string, number>) {
  const out: Partial<Record<UnidadeId, Record<string, string>>> = {};
  for (const [cia, col] of Object.entries(colunas) as [UnidadeId, string][]) {
    out[cia] = Object.fromEntries(Object.entries(linhas).map(([campo, linha]) => [campo, `${col}${linha}`]));
  }
  return out;
}

/** Uma linha (ou bloco de linhas) por Cia e os campos nas colunas. */
function linhaPorCia(linhas: Partial<Record<UnidadeId, number>>, campos: Record<string, { coluna: string; desloca?: number }>) {
  const out: Partial<Record<UnidadeId, Record<string, string>>> = {};
  for (const [cia, linha] of Object.entries(linhas) as [UnidadeId, number][]) {
    out[cia] = Object.fromEntries(Object.entries(campos).map(([campo, c]) => [campo, `${c.coluna}${linha + (c.desloca ?? 0)}`]));
  }
  return out;
}

const COLUNAS = (inicio: string): Record<UnidadeId, string> =>
  Object.fromEntries(CIAS.map((c, i) => [c, String.fromCharCode(inicio.charCodeAt(0) + i)])) as Record<UnidadeId, string>;

const LEGENDA_PADRAO = 'Preenchimento do Mês de {Mes} - {QUEM}';
const linhasLegenda = (coluna: string, linha1Cia: number, ate: UnidadeId[] = CIAS) =>
  Object.fromEntries(ate.map((c) => [c, `${coluna}${linha1Cia + CIAS.indexOf(c)}`])) as Partial<Record<UnidadeId, string>>;

const VISTORIA_TIPOS = { bike: 'Bicicleta elétrica', ciclo: 'Ciclomotor', auto: 'Autopropelido' };
const VISTORIA_ACOES = { vist: ['B', 'Vistoriado'], rem: ['C', 'Removido'], loc: ['D', 'Localizado'], aut: ['E', 'Autuado'] } as const;

export const DOCUMENTOS: DocumentoMensal[] = [
  {
    id: 'veiculos-apreendidos',
    nome: 'Veículos Apreendidos',
    diaUtil: 1,
    planilhaId: '1ZJ7svWIWrqBJIK2amh2WSMe9SqF-pv2s1UnU7mddGPk',
    aba: 'Página1',
    campos: [
      { id: 'v4', rotulo: 'Veículos 4 rodas' },
      { id: 'v2', rotulo: 'Veículos 2 rodas' },
      { id: 'cam', rotulo: 'Caminhões' },
    ],
    celulas: colunaPorCia(COLUNAS('C'), { v4: 3, v2: 4, cam: 5 }),
    legenda: { modelo: LEGENDA_PADRAO, celulas: linhasLegenda('D', 10) },
    ancoras: { C2: '1ª Cia', I2: 'FT', A3: 'VEÍCULOS 4 RODAS', A5: 'CAMINHÕES', B10: '1ª', B16: 'FT' },
    zerarCom: '',
  },
  {
    id: 'vistoria-ciclomotores',
    nome: 'Vistoria de Ciclomotores',
    diaUtil: 1,
    planilhaId: '1X12Uv8a6yF5F5XIbkeT9jbazKGrHtewAt5_d-SyM5y8',
    aba: 'Vistoria de Ciclomotores',
    campos: Object.entries(VISTORIA_TIPOS).flatMap(([t, tipo]) =>
      Object.entries(VISTORIA_ACOES).map(([a, [, acao]]) => ({ id: `${t}_${a}`, rotulo: acao, grupo: tipo })),
    ),
    celulas: linhaPorCia(
      { '1cia': 2, '2cia': 6, '3cia': 10, '4cia': 14, '5cia': 18, '6cia': 22 },
      Object.fromEntries(
        Object.keys(VISTORIA_TIPOS).flatMap((t, i) =>
          Object.entries(VISTORIA_ACOES).map(([a, [coluna]]) => [`${t}_${a}`, { coluna, desloca: i }]),
        ),
      ),
    ),
    legenda: { modelo: LEGENDA_PADRAO, celulas: linhasLegenda('H', 6, CIAS.slice(0, 6)) },
    ancoras: { A1: 'RESULTADOS 1ªCia', A5: 'RESULTADOS 2ªCia', A21: 'RESULTADOS 6ªCia', B1: 'VISTORIADO', E1: 'AUTUADO', A2: 'BICICLETA ELÉTRICA', G6: '1ª' },
    zerarCom: '',
  },
  {
    id: 'escoltas-fundacao-casa',
    nome: 'Escoltas Fundação Casa',
    diaUtil: 2,
    planilhaId: '1AyoPtq1gLS7TWHrjgwWbz1F6oSE-hzL32GwIstyLa4k',
    aba: 'Consolidado BTL',
    campos: [
      { id: 'recebidos', rotulo: 'Nº de pedidos de escolta recebidos' },
      { id: 'atendidos', rotulo: 'Nº de pedidos de escolta atendidos' },
      { id: 'naoAtendidos', rotulo: 'Nº de pedidos de escolta não atendidos' },
    ],
    celulas: colunaPorCia(COLUNAS('E'), { recebidos: 6, atendidos: 7, naoAtendidos: 8 }),
    legenda: { modelo: LEGENDA_PADRAO, celulas: linhasLegenda('B', 12) },
    mes: { celula: 'A8', modelo: 'Mês: {MES}' },
    ancoras: { E5: '1ª Cia', K5: 'Cia FT', B6: 'PEDIDOS DE ESCOLTA RECEBIDOS', A12: '1ª', A18: 'FT' },
    zerarCom: '',
  },
  {
    id: 'atividades-transito',
    nome: 'Atividades de Trânsito',
    diaUtil: 3,
    planilhaId: '1P-wnDnCxmmAPn3bRmxnk7U1Y9nkdYPBUHEXVuQ-kbuo',
    aba: 'ATIVIDADE DE TRÂNSITO',
    campos: [
      { id: 'eapOf', rotulo: 'Oficiais PM', grupo: 'PM que participaram do EAP de trânsito' },
      { id: 'eapSgt', rotulo: 'Subten/Sgt PM', grupo: 'PM que participaram do EAP de trânsito' },
      { id: 'eapSd', rotulo: 'Cb/Sd PM', grupo: 'PM que participaram do EAP de trânsito' },
      { id: 'autAi', rotulo: 'AI (DETRAN)', grupo: 'Total de autuações' },
      { id: 'autAit', rotulo: 'AIT (CET)', grupo: 'Total de autuações' },
      { id: 'autTrv', rotulo: 'TRV', grupo: 'Total de autuações' },
      { id: 'canAi', rotulo: 'AI (DETRAN)', grupo: 'Total de autuações canceladas' },
      { id: 'canAit', rotulo: 'AIT (CET)', grupo: 'Total de autuações canceladas' },
      { id: 'canTrv', rotulo: 'TRV', grupo: 'Total de autuações canceladas' },
    ],
    celulas: colunaPorCia(COLUNAS('C'), { eapOf: 8, eapSgt: 9, eapSd: 10, autAi: 12, autAit: 13, autTrv: 14, canAi: 16, canAit: 17, canTrv: 18 }),
    mes: { celula: 'A5', modelo: 'Mês referente: {SIGLA}/{AA}' },
    ancoras: { C7: '1ª Cia PM', I7: 'Cia FT', A8: 'Oficiais PM', A12: 'AI (DETRAN)', A15: 'autuações canceladas', A16: 'AI (DETRAN)' },
    zerarCom: 0,
  },
  {
    id: 'escolas-ronda-escolar',
    nome: 'Escolas Atendidas Ronda Escolar',
    diaUtil: 3,
    planilhaId: '1x7pTZ3OvTha5yXuDiBPRQkSA7uEg_6IkRD19SLqCYws',
    aba: 'Consolidado BTL',
    campos: [
      { id: 'vtr', rotulo: 'Média de Vtr operando no Pol Escolar', decimal: true },
      { id: 'efetivo', rotulo: 'Média do efetivo empregado no Pol Escolar', decimal: true },
      { id: 'estEx', rotulo: 'Nº existentes', grupo: 'Escolas do Estado' },
      { id: 'estAt', rotulo: 'Nº atendidas', grupo: 'Escolas do Estado' },
      { id: 'munEx', rotulo: 'Nº existentes', grupo: 'Escolas do Município' },
      { id: 'munAt', rotulo: 'Nº atendidas', grupo: 'Escolas do Município' },
      { id: 'parEx', rotulo: 'Nº existentes', grupo: 'Escolas particulares' },
      { id: 'parAt', rotulo: 'Nº atendidas', grupo: 'Escolas particulares' },
      { id: 'obs', rotulo: 'Observações (razões da diferença entre existentes e atendidas)', texto: true },
    ],
    celulas: linhaPorCia(
      { '1cia': 11, '2cia': 12, '3cia': 13, '4cia': 14, '5cia': 15, '6cia': 16 },
      {
        vtr: { coluna: 'F' },
        efetivo: { coluna: 'G' },
        estEx: { coluna: 'H' },
        estAt: { coluna: 'I' },
        munEx: { coluna: 'J' },
        munAt: { coluna: 'K' },
        parEx: { coluna: 'L' },
        parAt: { coluna: 'M' },
        obs: { coluna: 'N' },
      },
    ),
    mes: { celula: 'A4', modelo: 'RELATÓRIO DE ESCOLAS ATENDIDAS PELO PROGRAMA DE POLICIAMENTO ESCOLAR - MÊS DE {MES}- {ANO}' },
    ancoras: { D11: '1ª', D16: '6ª', F8: 'Média de Vtr', N8: 'Observações' },
    zerarCom: '',
  },
  // Ainda preenchidas direto na planilha: a P/3 acompanha, marca "feito" e arquiva a cópia do mês.
  { id: 'plano-diretor', nome: 'Plano Diretor', diaUtil: 1, planilhaId: '1vSY6-9aHU7xKGLdSWwzpu9lgp1SgL5lwfhrTRji98ZM' },
  { id: 'avaliacao-periodica', nome: 'Avaliação Periódica e Cumprimento de Metas', diaUtil: 2, planilhaId: '1kLHkeia6NozgBm8nCvDal4xLC6M2CtWdkXmeNVsOZXM' },
  { id: 'bo-eletronico', nome: 'Dados Sobre BO Eletrônico', diaUtil: 3, planilhaId: '1HyLiAMGWe6ZtfrkvPcCXSrf6SAyi0h2S4wxXyRAhPLY' },
  { id: 'relacao-remessa', nome: 'R.R. - Relação de Remessa', diaUtil: 4, planilhaId: '1ZLsK2mL--WcHvwzLFpHdcwLyLK6LFJPYHnJgH3fntP0' },
  { id: 'distribuicao-ai-cet', nome: 'Distribuição A.I. CET - Município', diaUtil: 4, planilhaId: '10CWe0-ZJ1_gIypULTm315UeljHurhHXB2yM-O3h3w2c' },
  { id: 'bcs-funcionamento', nome: 'BCS - Funcionamento (trimestral)', diaUtil: 4, planilhaId: '1MM1dkckQZ-9GFH1C7gOyrI3WZS_tCBlDwl6kBD7Xpwo', meses: [1, 4, 7, 10] },
  { id: 'bcs-produtividade', nome: 'BCS - Relatório Trimestral de Produtividade', diaUtil: 4, planilhaId: '1y_AgfUW7TaSc1jbWIMGegkrkj0RXd0a2gO3cfetDCto', meses: [1, 4, 7, 10] },
  { id: 'bcs-quadro', nome: 'BCS - Quadro Comparativo de Indicadores', diaUtil: 4, planilhaId: '1MtYGl3FzkQWxSOxK_EcB4bsSX_8dT4I1dIdVbr5ITV8', meses: [1, 4, 7, 10] },
];

export const PASTA_ARQUIVO_MENSAIS = '1mkm8R8dTpYF1jp1C2kStpONI1eN95EpN';

export function urlPlanilha(d: DocumentoMensal): string {
  return `https://docs.google.com/spreadsheets/d/${d.planilhaId}/edit`;
}

export function preenchidoPeloPortal(d: DocumentoMensal): boolean {
  return !!(d.campos?.length && d.celulas);
}

export function camposDaUnidade(d: DocumentoMensal, u: UnidadeId): Campo[] {
  const cel = d.celulas?.[u];
  return cel ? (d.campos ?? []).filter((c) => cel[c.id]) : [];
}

export function ciasDoDocumento(d: DocumentoMensal): UnidadeId[] {
  return UNIDADES.map((u) => u.id).filter((u) => camposDaUnidade(d, u).length > 0);
}

// ---------- Mês de referência e dias úteis ----------

/** No mês M as Cias preenchem os dados do mês M-1 (o "mês de referência"). */
export function mesReferencia(hoje = hojeISO()): string {
  const [a, m] = hoje.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

/** Mês em que vence o preenchimento do mês de referência (o seguinte). */
export function mesDoPrazo(mesRef: string): string {
  const [a, m] = mesRef.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

export function documentosDoMes(mesRef: string, lista = DOCUMENTOS): DocumentoMensal[] {
  const mesPrazo = Number(mesDoPrazo(mesRef).slice(5));
  return lista.filter((d) => !d.meses?.length || d.meses.includes(mesPrazo));
}

function iso(d: Date): string {
  return hojeISO(d);
}

/** Domingo de Páscoa (algoritmo de Meeus). */
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

// Nacionais, estadual (9 de julho) e da cidade de São Paulo (25 de janeiro). Carnaval (segunda e terça),
// Sexta-feira Santa e Corpus Christi também não contam como dia útil.
const FIXOS = ['01-01', '01-25', '04-21', '05-01', '07-09', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];

export function feriados(ano: number): Set<string> {
  const p = pascoa(ano);
  const desloca = (dias: number) => iso(new Date(p.getFullYear(), p.getMonth(), p.getDate() + dias));
  return new Set([...FIXOS.map((f) => `${ano}-${f}`), desloca(-48), desloca(-47), desloca(-2), desloca(60)]);
}

export function ehDiaUtil(dia: string): boolean {
  const [a, m, d] = dia.split('-').map(Number);
  const sem = new Date(a, m - 1, d).getDay();
  return sem !== 0 && sem !== 6 && !feriados(a).has(dia);
}

/** "2026-11" + 3 -> data do 3º dia útil de novembro/2026. */
export function nesimoDiaUtil(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  let conta = 0;
  for (let d = 1; d <= 31; d++) {
    const dia = iso(new Date(a, m - 1, d));
    if (dia.slice(0, 7) !== mes) break;
    if (ehDiaUtil(dia) && ++conta === n) return dia;
  }
  return `${mes}-28`;
}

export function prazoDoDocumento(d: DocumentoMensal, mesRef: string): string {
  return nesimoDiaUtil(mesDoPrazo(mesRef), d.diaUtil);
}

// ---------- Envio da Cia ----------

export type ValoresEnvio = Record<string, number | string>;

export type EnvioMensal = {
  id: string;
  docId: string;
  mesRef: string;
  unidadeId: UnidadeId;
  valores: ValoresEnvio;
  respondidoPor: string;
  gravado: boolean;
  erro?: string;
};

export function idEnvio(docId: string, mesRef: string, u: UnidadeId): string {
  return `${docId}_${mesRef}_${u}`;
}

/** Campos em texto (rascunho do formulário) -> valores; e os erros por campo. */
export function lerValores(d: DocumentoMensal, u: UnidadeId, rascunho: Record<string, string>) {
  const valores: ValoresEnvio = {};
  const erros: Record<string, string> = {};
  for (const c of camposDaUnidade(d, u)) {
    const t = (rascunho[c.id] ?? '').trim();
    if (c.texto) {
      valores[c.id] = t;
      continue;
    }
    const n = Number(t.replace(',', '.'));
    if (t === '') erros[c.id] = 'Preencha (se não houver, coloque 0).';
    else if (!Number.isFinite(n) || n < 0) erros[c.id] = 'Número inválido.';
    else if (!c.decimal && !Number.isInteger(n)) erros[c.id] = 'Use número inteiro.';
    else valores[c.id] = n;
  }
  return { valores, erros };
}

export type SituacaoEnvio = 'enviado' | 'gravado' | 'erro' | 'pendente' | 'atrasado';

export function situacaoEnvio(envio: EnvioMensal | undefined, prazo: string, hoje = hojeISO()): SituacaoEnvio {
  if (envio?.erro && !envio.gravado) return 'erro';
  if (envio?.gravado) return 'gravado';
  if (envio) return 'enviado';
  return hoje > prazo ? 'atrasado' : 'pendente';
}

export const ROTULO_SITUACAO_ENVIO: Record<SituacaoEnvio, string> = {
  gravado: '✅ Na planilha',
  enviado: '⏳ Enviado',
  erro: '❌ Erro ao gravar',
  pendente: 'Pendente',
  atrasado: 'Atrasado',
};

// ---------- Estado de cada documento (gravado pelo motor; a P/3 pede arquivo e marca "feito") ----------

export type EstadoDocumento = {
  mesRef?: string; // mês que está na planilha agora
  arquivados?: Record<string, string>; // mês -> link da cópia
  pedidoArquivar?: string;
  feitos?: Record<string, boolean>;
  erro?: string;
};

// ---------- Configuração que o motor lê (publicada pela P/3 ao abrir a aba) ----------

export function configParaMotor(lista = DOCUMENTOS) {
  return lista.map((d) => {
    const { id, nome, planilhaId, aba, celulas, legenda, mes, ancoras, zerarCom } = d;
    return preenchidoPeloPortal(d)
      ? { id, nome, planilhaId, aba, celulas, legenda: legenda ?? null, mes: mes ?? null, ancoras: ancoras ?? {}, zerarCom: zerarCom ?? '' }
      : { id, nome, planilhaId };
  });
}

/** Muda sempre que a configuração muda (para publicar de novo). */
export function versaoConfig(lista = DOCUMENTOS): string {
  const s = JSON.stringify(configParaMotor(lista));
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `v${(h >>> 0).toString(36)}`;
}
