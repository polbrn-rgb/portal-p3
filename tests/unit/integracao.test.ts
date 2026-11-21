import { describe, expect, test } from 'vitest';
import { camposDaUnidade, DOCUMENTOS } from '../../src/domain/documentosMensais';
import { DA_PRODUCAO, divergencias, preencherDaProducao, racDaProducao, situacaoProducaoMes } from '../../src/domain/integracao';
import { producaoAtual, racVazio, totalPelotao } from '../../src/domain/rac';
import { diasDoMes, IDS_ITENS, itensZerados, lerItens, pelotoesDa, type Itens, type Producao, type Talao } from '../../src/domain/producao';
import type { UnidadeId } from '../../src/domain/unidades';

const MES = '2026-10';
const HOJE = '2026-11-03';

/** Um lançamento por turno em todos os dias do mês (Cia: Pel A de dia e Pel B de noite; FT: Pel A). */
function mesCompleto(unidade: UnidadeId, itens: Partial<Itens> = {}, taloes: Talao[] = []): Producao[] {
  const pels = unidade === 'ft' ? ['pelA'] : ['pelA', 'pelB'];
  return diasDoMes(MES).flatMap((data, i) =>
    pels.map((pelotao) => ({
      id: `${unidade}_${data}_${pelotao}`,
      unidadeId: unidade,
      data,
      mes: MES,
      pelotao: pelotao as Producao['pelotao'],
      itens: { ...itensZerados(), ...itens },
      taloes: i === 0 && pelotao === 'pelA' ? taloes : [],
      lancadoPor: 'x',
      lancadoEm: null,
      atualizadoPor: 'x',
      atualizadoEm: null,
    })),
  );
}
const camposDe = (docId: string, u: UnidadeId = '1cia') => camposDaUnidade(DOCUMENTOS.find((d) => d.id === docId)!, u).map((c) => c.id);

describe('produção → documentos mensais', () => {
  test('todo campo integrado existe no documento e toda fonte usa itens que existem na produção', () => {
    for (const [docId, campos] of Object.entries(DA_PRODUCAO)) {
      const doc = DOCUMENTOS.find((d) => d.id === docId);
      expect(doc, docId).toBeTruthy();
      for (const c of Object.keys(campos)) expect(doc!.campos!.some((x) => x.id === c), `${docId}.${c}`).toBe(true);
      // Somar itens "1" em tudo não pode dar NaN (item com nome errado).
      const um = Object.fromEntries(IDS_ITENS.map((id) => [id, 1])) as Itens;
      for (const f of Object.values(campos)) expect(Number.isFinite(f.calc(um, []))).toBe(true);
    }
  });

  test('mês completo: soma o mês inteiro (31 dias × 2 turnos)', () => {
    const lancs = mesCompleto('1cia', { pessoasAbordadas: 10, veiculosVistoriados: 2, motosVistoriadas: 1, cicloVist: 1, ai: 1, trv: 2 });
    const r = preencherDaProducao('avaliacao-periodica', camposDe('avaliacao-periodica'), lancs, MES, '1cia', HOJE);
    expect(r.completa).toBe(true);
    expect(r.valores.abordadas_atu).toBe(620);
    expect(r.valores.veiculos_atu).toBe(186);
    expect(r.valores).not.toHaveProperty('abordadas_ant'); // ano anterior continua digitado
    const c = preencherDaProducao('vistoria-ciclomotores', camposDe('vistoria-ciclomotores'), lancs, MES, '1cia', HOJE);
    expect(c.valores.ciclo_vist).toBe(62);
    expect(c.valores.bike_vist).toBe(0);
    const t = preencherDaProducao('atividades-transito', camposDe('atividades-transito'), lancs, MES, '1cia', HOJE);
    expect(t.valores).toEqual({ autAi: 62, autAit: 0, autTrv: 124 });
  });

  test('veículos apreendidos = delegacia + removidos ao pátio', () => {
    const lancs = mesCompleto('1cia', { veiculosApreendidos: 1, carrosRemovidos: 1, motosApreendidas: 1, cicloRem: 1, caminhoesRemovidos: 1 });
    const r = preencherDaProducao('veiculos-apreendidos', ['v4', 'v2', 'cam'], lancs, MES, '1cia', HOJE);
    expect(r.valores).toEqual({ v4: 124, v2: 124, cam: 62 });
  });

  test('faltando um turno: não pré-preenche e mostra o que falta', () => {
    const lancs = mesCompleto('1cia', { pessoasAbordadas: 10 }).filter((l) => !(l.data === '2026-10-05' && l.pelotao === 'pelB'));
    const r = preencherDaProducao('avaliacao-periodica', camposDe('avaliacao-periodica'), lancs, MES, '1cia', HOJE);
    expect(r.completa).toBe(false);
    expect(r.valores).toEqual({});
    expect(r.pendencias).toEqual([{ data: '2026-10-05', faltaDia: false, faltaNoite: true }]);
    expect(r.turnosFaltando).toBe(1);
  });

  test('mês sem nenhum lançamento conta todos os dias (não só depois do primeiro lançamento)', () => {
    const s = situacaoProducaoMes([], MES, '1cia', HOJE);
    expect(s.completa).toBe(false);
    expect(s.turnosFaltando).toBe(62);
  });

  test('mês em andamento nunca está completo', () => {
    expect(situacaoProducaoMes(mesCompleto('1cia'), MES, '1cia', '2026-10-31').completa).toBe(false);
  });

  test('Força Tática: só o turno do dia', () => {
    expect(pelotoesDa('ft').length).toBe(2);
    expect(situacaoProducaoMes(mesCompleto('ft'), MES, 'ft', HOJE).completa).toBe(true);
  });

  test('flagrantes de tráfico e outros pela natureza; sem natureza não pré-preenche esses dois', () => {
    const taloes: Talao[] = [
      { numero: '1', bopc: '', data: '2026-10-01', natureza: 'trafico' },
      { numero: '2', bopc: '', data: '2026-10-01', natureza: 'roubo' },
      { numero: '3', bopc: '', data: '2026-10-01', natureza: 'furto' },
    ];
    const ok = preencherDaProducao('avaliacao-periodica', camposDe('avaliacao-periodica'), mesCompleto('1cia', {}, taloes), MES, '1cia', HOJE);
    expect(ok.valores.trafico_atu).toBe(1);
    expect(ok.valores.flagrantes_atu).toBe(2);
    const sem = preencherDaProducao(
      'avaliacao-periodica',
      camposDe('avaliacao-periodica'),
      mesCompleto('1cia', {}, [...taloes, { numero: '4', bopc: '', data: '2026-10-01', natureza: '' }]),
      MES,
      '1cia',
      HOJE,
    );
    expect(sem.valores).not.toHaveProperty('trafico_atu');
    expect(sem.valores.abordadas_atu).toBe(0);
    expect(sem.avisos[0]).toMatch(/sem a natureza/);
  });

  test('escoltas: não atendidas = recebidas − atendidas', () => {
    const r = preencherDaProducao('escoltas-fundacao-casa', camposDe('escoltas-fundacao-casa'), mesCompleto('1cia', { escoltasRecebidas: 1 }), MES, '1cia', HOJE);
    expect(r.valores).toEqual({ recebidos: 62, atendidos: 0, naoAtendidos: 62 });
  });

  test('divergências: o que a Cia mudou em relação à produção', () => {
    expect(divergencias({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual(['b']);
    expect(divergencias(undefined, { a: 1 })).toEqual([]);
  });

  test('lançamento antigo de "ciclomotores removidos" vira "ciclomotores removidos" do bloco novo', () => {
    expect(lerItens({ ciclomotoresRemovidos: 3 }).cicloRem).toBe(3);
    expect(lerItens({ ciclomotoresRemovidos: 3, cicloRem: 1 }).cicloRem).toBe(1);
  });

  test('RAC: produtividade por pelotão e itens à parte vêm da produção; RE e RPM com 0; não apaga o que a Cia digitou', () => {
    const lancs = mesCompleto('1cia', { pessoasAbordadas: 2, ocorrencias: 1, bopm: 1 });
    const d = racVazio('1cia', MES);
    d.pelotoes.armas.pelA = 7; // a Cia já tinha digitado
    const r = racDaProducao(d, lancs, HOJE);
    expect(r.completa).toBe(true);
    expect(r.rac.pelotoes.pessoasAbordadas.pelA).toBe(62); // 31 dias × 2
    expect(r.rac.pelotoes.pessoasAbordadas.pelB).toBe(62);
    expect(r.rac.pelotoes.pessoasAbordadas.pelC).toBe(0);
    expect(r.rac.pelotoes.pessoasAbordadas.re).toBe(0);
    expect(r.rac.pelotoes.pessoasAbordadas.rpm).toBe(0);
    expect(totalPelotao(r.rac, 'pessoasAbordadas')).toBe(124);
    expect(r.rac.pelotoes.armas.pelA).toBe(7);
    expect(r.daProducao['pelotoes.armas.pelA']).toBe(0);
    expect(producaoAtual(r.rac).ocorrencias).toBe(62);
    expect(producaoAtual(r.rac).bopm).toBe(62);
  });

  test('RAC: produção incompleta não mexe em nada; FT usa Pel A e B', () => {
    const d = racVazio('1cia', MES);
    const r = racDaProducao(d, mesCompleto('1cia').slice(1), HOJE);
    expect(r.completa).toBe(false);
    expect(r.rac).toBe(d);
    const ft = racDaProducao(racVazio('ft', MES), mesCompleto('ft', { armas: 1 }), HOJE);
    expect(ft.rac.pelotoes.armas.pelA).toBe(31);
    expect(ft.rac.pelotoes.armas.pelB).toBe(0);
  });
});
