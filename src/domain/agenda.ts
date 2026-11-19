// Agenda da P/3 dentro do portal: eventos próprios (com repetição) + as datas do Numerador
// (Prazo CPA, Prazo Cia, Início/Término Btl) + a agenda do CFP. A agenda do Google continua como está.
import { diasEntre, ehDataISO, somarDias } from './datas';
import type { Demanda } from './demanda';
import type { MissaoCfp } from '../data/missoes';
import { numeroExibido } from './numeracao';
import type { UnidadeId } from './unidades';

export type Visao = 'dia' | 'semana' | 'mes';
export const VISOES: { id: Visao; rotulo: string }[] = [
  { id: 'dia', rotulo: 'Dia' },
  { id: 'semana', rotulo: 'Semana' },
  { id: 'mes', rotulo: 'Mês' },
];

export type Repeticao = 'nao' | 'diaria' | 'semanal' | 'mensal' | 'anual';
export const REPETICOES: { id: Repeticao; rotulo: string }[] = [
  { id: 'nao', rotulo: 'Não se repete' },
  { id: 'diaria', rotulo: 'Todos os dias' },
  { id: 'semanal', rotulo: 'Toda semana' },
  { id: 'mensal', rotulo: 'Todo mês' },
  { id: 'anual', rotulo: 'Todo ano' },
];

export type CorAgenda = 'azul' | 'verde' | 'amarelo' | 'laranja' | 'vermelho' | 'roxo' | 'cinza';
export const CORES: { id: CorAgenda; rotulo: string }[] = [
  { id: 'azul', rotulo: 'Azul' },
  { id: 'verde', rotulo: 'Verde' },
  { id: 'amarelo', rotulo: 'Amarelo' },
  { id: 'laranja', rotulo: 'Laranja' },
  { id: 'vermelho', rotulo: 'Vermelho' },
  { id: 'roxo', rotulo: 'Roxo' },
  { id: 'cinza', rotulo: 'Cinza' },
];

/** Camadas que dá para ligar/desligar (como as agendas da lateral do Google). */
export type Camada = 'compromisso' | 'prazoCPA' | 'prazoCia' | 'periodo' | 'cfp' | 'prazoP3';
export const CAMADAS: { id: Camada; rotulo: string; cor: CorAgenda }[] = [
  { id: 'compromisso', rotulo: 'Eventos da P/3', cor: 'azul' },
  { id: 'prazoCPA', rotulo: 'Prazo CPA', cor: 'vermelho' },
  { id: 'prazoCia', rotulo: 'Prazo Cia', cor: 'laranja' },
  { id: 'periodo', rotulo: 'Início/Término Btl', cor: 'roxo' },
  { id: 'cfp', rotulo: 'Agenda do CFP', cor: 'verde' },
];
export const CAMADAS_PADRAO: Camada[] = ['compromisso', 'prazoCPA', 'prazoCia', 'periodo'];

/**
 * Agenda de cada Cia/FT e da Sala de Operações: independente da agenda da P/3 (não vê os eventos dela).
 * Tem os eventos próprios e, só leitura, os prazos que a P/3 deu para aquela página.
 */
export type DonoAgenda = 'p3' | UnidadeId | 'sala';
export const CAMADAS_SETOR: { id: Camada; rotulo: string; cor: CorAgenda }[] = [
  { id: 'compromisso', rotulo: 'Meus eventos', cor: 'azul' },
  { id: 'prazoP3', rotulo: 'Prazos da P/3', cor: 'laranja' },
];
export const CAMADAS_SETOR_PADRAO: Camada[] = ['compromisso', 'prazoP3'];

/** Um prazo que a P/3 deu para a Cia (demanda, efetivo, EAP, ICC, RAC, documento mensal). */
export type PrazoP3 = {
  chave: string;
  titulo: string;
  data: string;
  /** Já respondido/enviado: aparece riscado. */
  concluido: boolean;
  descricao?: string;
  /** Tela onde a Cia resolve o prazo. */
  href?: string;
  rotuloLink?: string;
};

export function itensDosPrazos(prazos: PrazoP3[], de: string, ate: string): ItemAgenda[] {
  return prazos
    .filter((p) => ehDataISO(p.data) && p.data >= de && p.data <= ate)
    .map((p) => ({
      chave: `p3-${p.chave}`,
      camada: 'prazoP3' as const,
      titulo: p.titulo,
      inicio: p.data,
      fim: p.data,
      diaInteiro: true,
      horaInicio: '',
      horaFim: '',
      cor: 'laranja' as const,
      concluido: p.concluido,
      descricao: p.descricao,
      href: p.href,
      rotuloLink: p.rotuloLink,
    }));
}

export const LIMITE_TITULO = 200;
export const LIMITE_DESCRICAO = 5000;
export const SEM_FIM = '9999-12-31';

// Datas AAAA-MM-DD, horas HH:MM. Evento com hora fica num dia só (data = dataFim).
export type DadosCompromisso = {
  titulo: string;
  diaInteiro: boolean;
  data: string;
  dataFim: string;
  horaInicio: string;
  horaFim: string;
  local: string;
  descricao: string;
  cor: CorAgenda;
  repeticao: Repeticao;
  /** '' = repete sem fim. */
  repetirAte: string;
  /** Integração com o Numerador: demanda ligada ao evento. */
  demandaId: string;
  demandaNumero: number | null;
  demandaTitulo: string;
};

export type Compromisso = DadosCompromisso & {
  id: string;
  /** Dias da série que foram apagados ("só este dia"). */
  excecoes: string[];
  criadoPor: string;
  atualizadoPor?: string;
};

export type ErrosCompromisso = Partial<Record<keyof DadosCompromisso, string>>;

/** Evento novo começando no dia (e hora, na visão Dia/Semana) que a pessoa clicou. */
export function compromissoVazio(dia: string, hora?: number): DadosCompromisso {
  const comHora = hora !== undefined;
  const h = Math.min(Math.max(hora ?? 9, 0), 22);
  return {
    titulo: '',
    diaInteiro: !comHora,
    data: dia,
    dataFim: dia,
    horaInicio: `${String(h).padStart(2, '0')}:00`,
    horaFim: `${String(h + 1).padStart(2, '0')}:00`,
    local: '',
    descricao: '',
    cor: 'azul',
    repeticao: 'nao',
    repetirAte: '',
    demandaId: '',
    demandaNumero: null,
    demandaTitulo: '',
  };
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function minutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/** Tira espaços; evento com hora fica num dia só; dia inteiro não guarda hora. */
export function normalizarCompromisso(d: DadosCompromisso): DadosCompromisso {
  const dataFim = d.diaInteiro ? d.dataFim || d.data : d.data;
  return {
    ...d,
    titulo: d.titulo.trim(),
    local: d.local.trim(),
    descricao: d.descricao.trim(),
    dataFim,
    horaInicio: d.diaInteiro ? '' : d.horaInicio,
    horaFim: d.diaInteiro ? '' : d.horaFim,
    repetirAte: d.repeticao === 'nao' ? '' : d.repetirAte,
    demandaId: d.demandaNumero ? d.demandaId : '',
    demandaTitulo: d.demandaNumero ? d.demandaTitulo : '',
  };
}

export function validarCompromisso(bruto: DadosCompromisso): ErrosCompromisso {
  const d = normalizarCompromisso(bruto);
  const erros: ErrosCompromisso = {};
  if (!d.titulo) erros.titulo = 'Informe o título.';
  else if (d.titulo.length > LIMITE_TITULO) erros.titulo = `O título pode ter até ${LIMITE_TITULO} caracteres.`;
  if (d.descricao.length > LIMITE_DESCRICAO) erros.descricao = `A descrição pode ter até ${LIMITE_DESCRICAO} caracteres.`;
  if (!ehDataISO(d.data)) erros.data = 'Informe a data.';
  if (d.diaInteiro) {
    if (!ehDataISO(d.dataFim)) erros.dataFim = 'Data inválida.';
    else if (!erros.data && d.dataFim < d.data) erros.dataFim = 'O fim não pode ser antes do início.';
  } else {
    if (!HORA.test(d.horaInicio)) erros.horaInicio = 'Informe a hora de início.';
    if (!HORA.test(d.horaFim)) erros.horaFim = 'Informe a hora de término.';
    else if (!erros.horaInicio && minutos(d.horaFim) <= minutos(d.horaInicio)) erros.horaFim = 'O término tem que ser depois do início.';
  }
  if (d.repeticao !== 'nao' && d.repetirAte) {
    if (!ehDataISO(d.repetirAte)) erros.repetirAte = 'Data inválida.';
    else if (!erros.data && d.repetirAte < d.data) erros.repetirAte = 'Tem que ser depois do início.';
  }
  if (d.demandaNumero !== null && !d.demandaId) erros.demandaNumero = 'Demanda não encontrada no Numerador.';
  return erros;
}

/** Último dia em que o evento (ou a série) ainda aparece: usado na busca do banco. */
export function fimDaSerie(d: DadosCompromisso): string {
  if (d.repeticao === 'nao') return d.dataFim || d.data;
  return d.repetirAte || SEM_FIM;
}

// ---------- Datas ----------

function partes(iso: string): [number, number, number] {
  const [a, m, d] = iso.split('-').map(Number);
  return [a, m, d];
}

function iso(a: number, m: number, d: number): string {
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function diasNoMes(a: number, m: number): number {
  return new Date(a, m, 0).getDate();
}

/** 0 = domingo. */
export function diaDaSemana(dia: string): number {
  const [a, m, d] = partes(dia);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** A semana começa no domingo (como a agenda do Google no Brasil). */
export function inicioDaSemana(dia: string): string {
  return somarDias(dia, -diaDaSemana(dia));
}

export function diasDaSemana(dia: string): string[] {
  const inicio = inicioDaSemana(dia);
  return Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
}

/** Semanas (de domingo a sábado) que cobrem o mês inteiro: 4 a 6 linhas de 7 dias. */
export function gradeDoMes(dia: string): string[][] {
  const [a, m] = partes(dia);
  const primeiro = iso(a, m, 1);
  const ultimo = iso(a, m, diasNoMes(a, m));
  const semanas: string[][] = [];
  for (let inicio = inicioDaSemana(primeiro); inicio <= ultimo; inicio = somarDias(inicio, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, i) => somarDias(inicio, i)));
  }
  return semanas;
}

export function mesmoMes(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** Primeiro e último dia mostrados na tela. */
export function periodoDaVisao(visao: Visao, dia: string): { de: string; ate: string } {
  if (visao === 'dia') return { de: dia, ate: dia };
  if (visao === 'semana') {
    const s = diasDaSemana(dia);
    return { de: s[0], ate: s[6] };
  }
  const g = gradeDoMes(dia);
  return { de: g[0][0], ate: g[g.length - 1][6] };
}

/** Mesmo dia no mês seguinte/anterior (31/01 + 1 mês = 28 ou 29/02). */
export function somarMeses(dia: string, meses: number): string {
  const [a, m, d] = partes(dia);
  const total = a * 12 + (m - 1) + meses;
  const na = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return iso(na, nm, Math.min(d, diasNoMes(na, nm)));
}

/** Botões ‹ e ›: anda um dia, uma semana ou um mês. */
export function andar(visao: Visao, dia: string, passo: 1 | -1): string {
  if (visao === 'dia') return somarDias(dia, passo);
  if (visao === 'semana') return somarDias(dia, 7 * passo);
  return somarMeses(dia, passo);
}

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTOS = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
export const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const DIAS_CURTOS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

/** Texto do topo: "novembro de 2026", "15 – 21 de nov. de 2026", "quarta-feira, 18 de novembro de 2026". */
export function tituloDoPeriodo(visao: Visao, dia: string): string {
  const [a, m, d] = partes(dia);
  if (visao === 'mes') return `${MESES[m - 1]} de ${a}`;
  if (visao === 'dia') return `${DIAS_SEMANA[diaDaSemana(dia)]}, ${d} de ${MESES[m - 1]} de ${a}`;
  const s = diasDaSemana(dia);
  const [a1, m1, d1] = partes(s[0]);
  const [a2, m2, d2] = partes(s[6]);
  if (a1 !== a2) return `${d1} de ${MESES_CURTOS[m1 - 1]} de ${a1} – ${d2} de ${MESES_CURTOS[m2 - 1]} de ${a2}`;
  if (m1 !== m2) return `${d1} de ${MESES_CURTOS[m1 - 1]} – ${d2} de ${MESES_CURTOS[m2 - 1]} de ${a2}`;
  return `${d1} – ${d2} de ${MESES_CURTOS[m2 - 1]} de ${a2}`;
}

/** "quarta-feira, 18 de novembro de 2026" (detalhe do evento). */
export function dataPorExtenso(dia: string): string {
  const [a, m, d] = partes(dia);
  return `${DIAS_SEMANA[diaDaSemana(dia)]}, ${d} de ${MESES[m - 1]} de ${a}`;
}

// ---------- Repetição ----------

/** Dias de início de cada vez que o evento acontece e que aparecem entre `de` e `ate`. */
export function ocorrencias(c: Pick<Compromisso, 'data' | 'dataFim' | 'repeticao' | 'repetirAte'> & { excecoes?: string[] }, de: string, ate: string): string[] {
  const duracao = Math.max(0, diasEntre(c.data, c.dataFim || c.data));
  const fim = c.repeticao === 'nao' ? c.data : c.repetirAte && c.repetirAte < ate ? c.repetirAte : ate;
  const pula = new Set(c.excecoes ?? []);
  const lista: string[] = [];
  const entra = (inicio: string) => {
    if (inicio >= c.data && inicio <= fim && somarDias(inicio, duracao) >= de && inicio <= ate && !pula.has(inicio)) lista.push(inicio);
  };
  if (c.repeticao === 'nao') {
    entra(c.data);
    return lista;
  }
  if (c.repeticao === 'diaria' || c.repeticao === 'semanal') {
    const passo = c.repeticao === 'diaria' ? 1 : 7;
    // Começa perto de `de` (uma série diária de anos não precisa ser percorrida desde o início).
    const desde = somarDias(de, -duracao);
    const saltos = desde > c.data ? Math.floor(diasEntre(c.data, desde) / passo) : 0;
    for (let i = saltos; ; i++) {
      const dia = somarDias(c.data, i * passo);
      if (dia > fim) break;
      entra(dia);
    }
    return lista;
  }
  const [a0, m0, d0] = partes(c.data);
  const meses = c.repeticao === 'mensal' ? 1 : 12;
  for (let i = 0; ; i++) {
    const total = a0 * 12 + (m0 - 1) + i * meses;
    const a = Math.floor(total / 12);
    const m = (total % 12) + 1;
    const primeiroDoMes = iso(a, m, 1);
    if (primeiroDoMes > fim) break;
    // Mês sem o dia (31, 29/02): não acontece nesse mês, como no Google.
    if (d0 <= diasNoMes(a, m)) entra(iso(a, m, d0));
  }
  return lista;
}

// ---------- O que aparece na tela ----------

export type ItemAgenda = {
  chave: string;
  camada: Camada;
  titulo: string;
  inicio: string;
  fim: string;
  diaInteiro: boolean;
  horaInicio: string;
  horaFim: string;
  cor: CorAgenda;
  /** Demanda já concluída: aparece riscada. */
  concluido?: boolean;
  local?: string;
  descricao?: string;
  compromisso?: Compromisso;
  ocorrencia?: string;
  demandaId?: string;
  demandaNumero?: string;
  pastaUrl?: string;
  /** Prazo da P/3 (agenda das Cias): tela onde a Cia resolve. */
  href?: string;
  rotuloLink?: string;
};

export function itensDosCompromissos(lista: Compromisso[], de: string, ate: string): ItemAgenda[] {
  const itens: ItemAgenda[] = [];
  for (const c of lista) {
    const duracao = Math.max(0, diasEntre(c.data, c.dataFim || c.data));
    for (const inicio of ocorrencias(c, de, ate)) {
      itens.push({
        chave: `c-${c.id}-${inicio}`,
        camada: 'compromisso',
        titulo: c.titulo,
        inicio,
        fim: somarDias(inicio, duracao),
        diaInteiro: c.diaInteiro,
        horaInicio: c.horaInicio,
        horaFim: c.horaFim,
        cor: c.cor,
        local: c.local,
        descricao: c.descricao,
        compromisso: c,
        ocorrencia: inicio,
        demandaId: c.demandaId || undefined,
        demandaNumero: c.demandaNumero ? `Nº ${c.demandaNumero}` : undefined,
      });
    }
  }
  return itens;
}

/** As datas do Numerador viram eventos de dia inteiro (só leitura: muda-se pela demanda). */
export function itensDasDemandas(demandas: Demanda[], de: string, ate: string): ItemAgenda[] {
  const itens: ItemAgenda[] = [];
  const dentro = (inicio: string, fim: string) => fim >= de && inicio <= ate;
  for (const d of demandas) {
    if (d.status === 'excluido') continue;
    const numero = numeroExibido(d);
    const base = {
      diaInteiro: true,
      horaInicio: '',
      horaFim: '',
      concluido: d.status === 'concluido',
      descricao: d.observacao || undefined,
      demandaId: d.id,
      demandaNumero: numero,
    };
    if (ehDataISO(d.prazoCPA) && dentro(d.prazoCPA, d.prazoCPA)) {
      itens.push({ ...base, chave: `cpa-${d.id}`, camada: 'prazoCPA', cor: 'vermelho', titulo: `Prazo CPA · ${numero} — ${d.saida}`, inicio: d.prazoCPA, fim: d.prazoCPA });
    }
    if (ehDataISO(d.prazoCia) && dentro(d.prazoCia, d.prazoCia)) {
      itens.push({ ...base, chave: `cia-${d.id}`, camada: 'prazoCia', cor: 'laranja', titulo: `Prazo Cia · ${numero} — ${d.saida}`, inicio: d.prazoCia, fim: d.prazoCia });
    }
    if (ehDataISO(d.inicioBtl)) {
      const fim = ehDataISO(d.terminoBtl) && d.terminoBtl >= d.inicioBtl ? d.terminoBtl : d.inicioBtl;
      if (dentro(d.inicioBtl, fim)) {
        itens.push({ ...base, chave: `btl-${d.id}`, camada: 'periodo', cor: 'roxo', titulo: `${numero} — ${d.saida}`, inicio: d.inicioBtl, fim });
      }
    }
  }
  return itens;
}

export function itensDoCfp(missoes: MissaoCfp[], de: string, ate: string): ItemAgenda[] {
  return missoes
    .filter((m) => ehDataISO(m.inicio) && (m.fim || m.inicio) >= de && m.inicio <= ate)
    .map((m) => ({
      chave: `cfp-${m.id}`,
      camada: 'cfp' as const,
      titulo: `CFP · ${m.titulo}`,
      inicio: m.inicio,
      fim: m.fim && m.fim >= m.inicio ? m.fim : m.inicio,
      diaInteiro: true,
      horaInicio: '',
      horaFim: '',
      cor: 'verde' as const,
      pastaUrl: m.pastaUrl || undefined,
      demandaNumero: m.numero ? `Nº ${m.numero}` : undefined,
    }));
}

/** Dia inteiro primeiro (os mais longos antes), depois pela hora; empate pelo título. */
export function ordenarItens(itens: ItemAgenda[]): ItemAgenda[] {
  return itens.slice().sort((a, b) => {
    if (a.diaInteiro !== b.diaInteiro) return a.diaInteiro ? -1 : 1;
    if (a.diaInteiro && a.inicio !== b.inicio) return a.inicio < b.inicio ? -1 : 1;
    if (a.diaInteiro) {
      const da = diasEntre(a.inicio, a.fim);
      const dbb = diasEntre(b.inicio, b.fim);
      if (da !== dbb) return dbb - da;
    }
    if (a.horaInicio !== b.horaInicio) return a.horaInicio < b.horaInicio ? -1 : 1;
    return a.titulo.localeCompare(b.titulo, 'pt-BR');
  });
}

export function itensDoDia(itens: ItemAgenda[], dia: string): ItemAgenda[] {
  return ordenarItens(itens.filter((i) => i.inicio <= dia && i.fim >= dia));
}

export type Posicionado = { item: ItemAgenda; topo: number; altura: number; coluna: number; colunas: number };

const MINIMO_MIN = 20; // evento curto ainda dá para tocar

/** Visão Dia/Semana: eventos com hora que se sobrepõem ficam lado a lado (como no Google). */
export function posicionarNoDia(itens: ItemAgenda[]): Posicionado[] {
  const comHora = itens
    .filter((i) => !i.diaInteiro)
    .map((item) => {
      const ini = minutos(item.horaInicio);
      const fim = Math.max(minutos(item.horaFim), ini + MINIMO_MIN);
      return { item, ini, fim };
    })
    .sort((a, b) => a.ini - b.ini || b.fim - a.fim);
  const saida: Posicionado[] = [];
  let grupo: { item: ItemAgenda; ini: number; fim: number; coluna: number }[] = [];
  let fimGrupo = -1;
  const fechar = () => {
    const colunas = grupo.reduce((m, g) => Math.max(m, g.coluna + 1), 0);
    for (const g of grupo) saida.push({ item: g.item, topo: g.ini, altura: g.fim - g.ini, coluna: g.coluna, colunas });
    grupo = [];
  };
  for (const atual of comHora) {
    if (grupo.length && atual.ini >= fimGrupo) fechar();
    const ocupadas = new Set(grupo.filter((g) => g.fim > atual.ini).map((g) => g.coluna));
    let coluna = 0;
    while (ocupadas.has(coluna)) coluna++;
    grupo.push({ ...atual, coluna });
    fimGrupo = Math.max(fimGrupo, atual.fim);
  }
  if (grupo.length) fechar();
  return saida;
}

/** "09:00 – 10:30" ou "Dia inteiro" / "18/11 – 20/11". */
export function quandoDoItem(i: ItemAgenda): string {
  const curta = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  if (!i.diaInteiro) return `${i.horaInicio} – ${i.horaFim}`;
  return i.inicio === i.fim ? 'Dia inteiro' : `${curta(i.inicio)} – ${curta(i.fim)}`;
}
