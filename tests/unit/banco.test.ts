import { describe, expect, test } from 'vitest';
import { abasDoBanco, documentosEsperados, INDICADORES, mesesEntre, montarBanco, serieDiaria, somarIndicador } from '../../src/domain/banco';
import { DOCUMENTOS, type EnvioMensal } from '../../src/domain/documentosMensais';
import { diasDoMes, IDS_ITENS, itensZerados, type Producao } from '../../src/domain/producao';
import { racVazio, type RacSalvo } from '../../src/domain/rac';

const lanc = (x: Partial<Producao>): Producao => ({
  id: '',
  unidadeId: '1cia',
  data: '2026-10-01',
  mes: '2026-10',
  pelotao: 'pelA',
  itens: itensZerados(),
  taloes: [],
  lancadoPor: 'x',
  lancadoEm: null,
  atualizadoPor: 'x',
  atualizadoEm: null,
  ...x,
});
const envio = (x: Partial<EnvioMensal>): EnvioMensal => ({
  id: '',
  docId: 'veiculos-apreendidos',
  mesRef: '2026-10',
  unidadeId: '1cia',
  valores: {},
  respondidoPor: 'Cb PM X',
  gravado: true,
  ...x,
});

describe('banco de dados', () => {
  test('catálogo: códigos únicos; todo item da produção e todo campo de documento estão nele', () => {
    const ids = INDICADORES.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of IDS_ITENS) expect(ids).toContain(`producao.${id}`);
    for (const d of DOCUMENTOS) for (const c of (d.campos ?? []).filter((x) => !x.daLista)) expect(ids).toContain(`doc.${d.id}.${c.id}`);
  });

  test('meses do período', () => {
    expect(mesesEntre('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(mesesEntre('2026-03', '2026-02')).toEqual([]);
  });

  test('por Cia e por mês: produção somada, flagrantes por natureza, documentos e RAC', () => {
    const producao = [
      lanc({ itens: { ...itensZerados(), pessoasAbordadas: 10, maconhaKg: 0.5 }, taloes: [{ numero: '1', bopc: '', data: '2026-10-01', natureza: 'trafico' }] }),
      lanc({ pelotao: 'pelB', itens: { ...itensZerados(), pessoasAbordadas: 5, crackKg: 0.25 }, taloes: [{ numero: '2', bopc: 'B', data: '2026-10-01', natureza: '' }] }),
      lanc({ unidadeId: '2cia', itens: { ...itensZerados(), pessoasAbordadas: 7 } }),
      lanc({ mes: '2026-11', data: '2026-11-01', itens: { ...itensZerados(), pessoasAbordadas: 100 } }),
    ];
    const rac: RacSalvo = { ...racVazio('1cia', '2026-10'), id: '2026-10_1cia', status: 'enviado', preenchidoPor: 'x' };
    rac.crimes.homicidio.atual = 2;
    const envios = [
      envio({ valores: { v4: 3, v2: 1, cam: 0 } }),
      envio({ docId: 'bo-eletronico', valores: { treinados: 12, recursos: 'Sim', furtoCel: 4 } }),
      envio({
        docId: 'distribuicao-ai-cet',
        valores: { l1_data: '05/10/2026', l1_qtd: 2, l1_re: '123456-7', l1_nome: 'SILVA', l1_tipo0: true, l1_tipo1: false, l2_nome: '' },
      }),
    ];
    const [r1, r2, ...resto] = montarBanco({ producao, envios, racs: [rac] }, ['2026-10'], '2026-11-03');
    expect(resto.map((r) => r.unidadeId)).toEqual(['3cia', '4cia', '5cia', '6cia', 'ft']);
    expect(r1.valores['producao.pessoasAbordadas']).toBe(15);
    expect(r1.valores['producao.drogasTotalKg']).toBe(0.75);
    expect(r1.valores['producao.lancamentos']).toBe(2);
    expect(r1.valores['producao.turnosSemLancamento']).toBe(60); // só o dia 1 foi lançado
    expect(r1.valores['flagrantes.total']).toBe(2);
    expect(r1.valores['flagrantes.trafico']).toBe(1);
    expect(r1.valores['flagrantes.semNatureza']).toBe(1);
    expect(r1.valores['flagrantes.semBopc']).toBe(1);
    expect(r1.valores['doc.veiculos-apreendidos.v4']).toBe(3);
    expect(r1.valores['doc.bo-eletronico.recursos']).toBe('Sim');
    expect(r1.valores['doc.bo-eletronico.furtoCel']).toBe(4);
    expect(r1.valores['doc.distribuicao-ai-cet.linhas']).toBe(1);
    expect(r1.valores['doc.distribuicao-ai-cet.lista']).toBe('05/10/2026 · 2 · 123456-7 · SILVA · Alocação');
    expect(r1.valores['doc.veiculos-apreendidos.preenchidoPor']).toBe('Cb PM X');
    expect(r1.valores['rac.crime.homicidio']).toBe(2);
    expect(r1.valores).not.toHaveProperty('rac.crime.latrocinio'); // vazio no RAC
    expect(r1.situacao).toMatchObject({ lancamentos: 2, producaoCompleta: false, racEnviado: true });
    expect(r1.situacao.documentosEnviados).toEqual(['veiculos-apreendidos', 'bo-eletronico', 'distribuicao-ai-cet']);
    expect(r2.valores['producao.pessoasAbordadas']).toBe(7);
    expect(r2.situacao.racEnviado).toBe(false);
    expect(resto[0].valores).toEqual({});
    expect(resto[0].situacao.producaoCompleta).toBeNull();
  });

  test('RAC em rascunho não entra; soma do Batalhão e do período', () => {
    const rac: RacSalvo = { ...racVazio('1cia', '2026-10'), id: 'x', status: 'rascunho', preenchidoPor: '' };
    rac.crimes.homicidio.atual = 9;
    const producao = [
      lanc({ itens: { ...itensZerados(), ai: 2 } }),
      lanc({ unidadeId: 'ft', itens: { ...itensZerados(), ai: 3 } }),
      lanc({ mes: '2026-11', data: '2026-11-01', itens: { ...itensZerados(), ai: 4 } }),
    ];
    const regs = montarBanco({ producao, envios: [], racs: [rac] }, ['2026-10', '2026-11'], '2026-12-01');
    expect(regs[0].valores).not.toHaveProperty('rac.crime.homicidio');
    expect(somarIndicador(regs.filter((r) => r.mes === '2026-10'), 'producao.ai')).toBe(5);
    expect(somarIndicador(regs, 'producao.ai')).toBe(9);
  });

  test('produção completa no mês', () => {
    const producao = diasDoMes('2026-10').flatMap((data) => (['pelA', 'pelB'] as const).map((pelotao) => lanc({ data, pelotao })));
    const [r] = montarBanco({ producao, envios: [], racs: [] }, ['2026-10'], '2026-11-03', ['1cia']);
    expect(r.situacao.producaoCompleta).toBe(true);
    expect(r.valores['producao.turnosSemLancamento']).toBe(0);
  });

  test('documentos esperados: trimestrais só no mês certo; BCS só nas Cias que têm', () => {
    expect(documentosEsperados('2026-12', '1cia')).toContain('bcs-produtividade'); // prazo em janeiro
    expect(documentosEsperados('2026-11', '1cia')).not.toContain('bcs-produtividade');
    expect(documentosEsperados('2026-12', '2cia')).not.toContain('bcs-produtividade');
    expect(documentosEsperados('2026-10', 'ft')).not.toContain('vistoria-ciclomotores');
  });

  test('série diária por Cia (painel do Batalhão)', () => {
    const s = serieDiaria([
      lanc({ data: '2026-10-02', itens: { ...itensZerados(), armas: 1 } }),
      lanc({ data: '2026-10-01', pelotao: 'pelB', itens: { ...itensZerados(), armas: 2 }, taloes: [{ numero: '1', bopc: '', data: '2026-10-01', natureza: 'trafico' }] }),
      lanc({ data: '2026-10-01', itens: { ...itensZerados(), armas: 1 } }),
    ]);
    expect(s.map((d) => [d.data, d.lancamentos, d.itens.armas, d.flagrantesTrafico])).toEqual([
      ['2026-10-01', 2, 3, 1],
      ['2026-10-02', 1, 1, 0],
    ]);
  });

  test('planilha do banco: uma linha por valor, cobertura e catálogo', () => {
    const regs = montarBanco({ producao: [lanc({ itens: { ...itensZerados(), ai: 2 } })], envios: [], racs: [] }, ['2026-10'], '2026-11-03', ['1cia']);
    const [banco, cobertura, catalogo] = abasDoBanco(regs);
    expect(banco.linhas[0]).toEqual(['Mês', 'Unidade', 'Origem', 'Grupo', 'Indicador', 'Valor', 'Código do indicador']);
    expect(banco.linhas).toContainEqual(['2026-10', '1ª CIA', 'Produção dos pelotões', 'Produção · Trânsito', 'AI (DETRAN)', 2, 'producao.ai']);
    expect(cobertura.linhas[1].slice(0, 5)).toEqual(['2026-10', '1ª CIA', 1, 'não', 61]);
    expect(catalogo.linhas.length).toBe(INDICADORES.length + 1);
    for (const a of [banco, cobertura, catalogo]) expect(a.nome.length).toBeLessThanOrEqual(31);
  });
});
