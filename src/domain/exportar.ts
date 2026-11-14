import { formatarData } from './datas';
import type { Demanda } from './demanda';
import { andamentoPorDemanda, ROTULO_ENC, type Encaminhamento } from './encaminhamento';
import { ROTULO_SITUACAO, situacaoDaDemanda } from './situacao';
import { siglaDoDestino } from './unidades';

// Planilha de backup no mesmo formato de colunas do numerador (abre no Excel e no Google Planilhas).
const COLUNAS = [
  'Nº Demanda',
  'Demanda',
  'Data Entrada',
  'Origem',
  'Nº Origem',
  'Tipo de Saída',
  'Saída',
  'Destino',
  'Nº Saída',
  'Inicio Btl',
  'Termino Btl',
  'Adicionar para o CFP?',
  'Prazo CPA',
  'Prazo Cia',
  'Responsável',
  'Resposta',
  'Categoria',
  'Observação',
  'Status',
  'Link de Evento?',
  'Respostas das Cias',
];

function celula(valor: string | number): string {
  const texto = String(valor ?? '');
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

const simNao = (v: boolean) => (v ? 'Sim' : 'Não');

function respostasDasCias(encs: readonly Encaminhamento[]): string {
  return encs
    .filter((e) => e.status !== 'cancelado')
    .map((e) => {
      const quem = e.respondidoPor ? ` (${e.respondidoPor})` : '';
      const texto = e.resposta ? `: ${e.resposta}` : '';
      return `${siglaDoDestino(e.unidadeId)} - ${ROTULO_ENC[e.status]}${quem}${texto}`;
    })
    .join(' | ');
}

/** Gera o CSV (separado por ";", com BOM para o Excel reconhecer os acentos). Mais nova primeiro. */
export function montarCsv(demandas: readonly Demanda[], encaminhamentos: readonly Encaminhamento[], hoje: string): string {
  const andamento = andamentoPorDemanda(encaminhamentos);
  const porDemanda = new Map<string, Encaminhamento[]>();
  for (const e of encaminhamentos) porDemanda.set(e.demandaId, [...(porDemanda.get(e.demandaId) ?? []), e]);

  const linhas = [...demandas]
    .sort((a, b) => b.numero - a.numero)
    .map((d) => {
      const situacao = situacaoDaDemanda(d, hoje, andamento[d.id] ?? { pendentes: 0, respondidas: 0 });
      return [
        d.numero,
        d.saida,
        formatarData(d.dataEntrada),
        d.origem,
        d.numeroOrigem,
        d.tipoSaida,
        d.meioSaida ?? '',
        d.destinos.map(siglaDoDestino).join(', '),
        d.numeroSaida,
        formatarData(d.inicioBtl),
        formatarData(d.terminoBtl),
        simNao(d.adicionarCFP),
        formatarData(d.prazoCPA),
        formatarData(d.prazoCia),
        d.responsavel,
        d.resposta ?? '',
        d.categoria,
        d.observacao,
        ROTULO_SITUACAO[situacao],
        simNao(d.linkEvento === true),
        respostasDasCias(porDemanda.get(d.id) ?? []),
      ]
        .map(celula)
        .join(';');
    });

  return '﻿' + [COLUNAS.join(';'), ...linhas].join('\r\n') + '\r\n';
}
