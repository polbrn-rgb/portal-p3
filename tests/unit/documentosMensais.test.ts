import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, test } from 'vitest';
import {
  ciasDoDocumento,
  configParaMotor,
  DOCUMENTOS,
  documentosDoMes,
  feriados,
  lerValores,
  linhasDosValores,
  mesDoPrazo,
  mesReferencia,
  nesimoDiaUtil,
  preenchidoPeloPortal,
  rotuloSituacao,
  situacaoDoDocumento,
  situacaoEnvio,
  urlAbaDaCia,
  valoresDaLista,
  versaoConfig,
  zeraAoArquivar,
  type EnvioMensal,
} from '../../src/domain/documentosMensais';

type Logica = {
  proximoMes: (m: string) => string;
  textoDoMes: (modelo: string, mes: string, quem?: string) => string;
  conferirAncoras: (a: Record<string, string>, lidos: Record<string, string>) => string;
  acaoEnvioMensal: (mesPlanilha: string | undefined, mesEnvio: string) => string;
  celulasParaZerar: (doc: unknown) => string[];
  valoresParaZerar: (doc: unknown, mes: string) => { u: string; celula: string; valor: unknown }[];
  resolverCelula: (c: string, mes: string, colJan: string | null, colTri?: string | null) => string;
  ancorasDoMes: (doc: unknown, mes: string) => Record<string, string>;
  abaDaCia: (doc: unknown, u: string) => string;
  nomeArquivoMensal: (nome: string, mes: string) => string;
  zerarDireto: (direto: unknown, mes: string) => { abas: string[]; limpar: string; mes: { aba: string; celula: string; valor: string } | null };
};
const ctx: Record<string, unknown> = {};
runInNewContext(readFileSync('apps-script/Logica.gs', 'utf8'), ctx);
const gs = ctx as unknown as Logica;
const doc = (id: string) => DOCUMENTOS.find((d) => d.id === id)!;

describe('dias úteis e mês de referência', () => {
  test('feriados móveis e fixos de 2026', () => {
    const f = feriados(2026);
    for (const d of ['2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04', '2026-01-25', '2026-07-09', '2026-11-20']) expect(f.has(d)).toBe(true);
    expect(f.has('2026-02-18')).toBe(false); // Cinzas conta como dia útil
  });

  test('Nº dia útil pula fim de semana e feriado', () => {
    expect(nesimoDiaUtil('2026-11', 1)).toBe('2026-11-03'); // 01 é domingo e 02 é Finados
    expect(nesimoDiaUtil('2026-11', 4)).toBe('2026-11-06');
    expect(nesimoDiaUtil('2026-12', 1)).toBe('2026-12-01');
    expect(nesimoDiaUtil('2027-01', 1)).toBe('2027-01-04');
  });

  test('em novembro as Cias mandam os dados de outubro; trimestrais só nos meses delas', () => {
    expect(mesReferencia('2026-11-15')).toBe('2026-10');
    expect(mesReferencia('2027-01-05')).toBe('2026-12');
    expect(mesDoPrazo('2026-12')).toBe('2027-01');
    expect(documentosDoMes('2026-09').some((d) => d.id === 'bcs-quadro')).toBe(true);
    expect(documentosDoMes('2026-10').some((d) => d.id === 'bcs-quadro')).toBe(false);
  });
});

describe('células de cada Cia', () => {
  test('posições conferidas com as planilhas', () => {
    expect(doc('veiculos-apreendidos').celulas?.['1cia']).toEqual({ v4: 'C3', v2: 'C4', cam: 'C5' });
    expect(doc('veiculos-apreendidos').celulas?.ft?.cam).toBe('I5');
    expect(doc('veiculos-apreendidos').legenda?.celulas.ft).toBe('D16');
    expect(doc('vistoria-ciclomotores').celulas?.['2cia']?.ciclo_rem).toBe('C7');
    expect(doc('vistoria-ciclomotores').celulas?.['6cia']?.auto_aut).toBe('E24');
    expect(doc('vistoria-ciclomotores').celulas?.ft).toBeUndefined();
    expect(doc('escoltas-fundacao-casa').celulas?.ft?.naoAtendidos).toBe('K8');
    expect(doc('atividades-transito').celulas?.['3cia']?.canTrv).toBe('E18');
    expect(doc('escolas-ronda-escolar').celulas?.['6cia']?.obs).toBe('N16');
    expect(ciasDoDocumento(doc('escolas-ronda-escolar'))).not.toContain('ft');
  });

  test('nenhuma célula repetida na mesma aba (nem entre dados e legenda) e todo documento do portal tem âncoras', () => {
    for (const d of DOCUMENTOS.filter(preenchidoPeloPortal)) {
      const cfg = configParaMotor([d])[0];
      const todas = [
        ...Object.entries(d.celulas ?? {}).flatMap(([u, c]) => Object.values(c).map((x) => `${gs.abaDaCia(cfg, u)}!${x}`)),
        ...Object.entries(d.legenda?.celulas ?? {}).map(([u, x]) => `${gs.abaDaCia(cfg, u)}!${x}`),
      ];
      expect(new Set(todas).size, d.id).toBe(todas.length);
      expect(Object.keys(d.ancoras ?? {}).length, d.id).toBeGreaterThan(2);
      const zerar = gs.valoresParaZerar(cfg, '2026-10');
      expect(zerar.length, d.id).toBe(d.zerar === false ? 0 : Object.values(d.celulas ?? {}).flatMap((c) => Object.values(c)).length);
    }
  });

  test('BO Eletrônico: aba de cada Cia e a coluna do mês', () => {
    const cfg = configParaMotor([doc('bo-eletronico')])[0];
    expect(gs.abaDaCia(cfg, '5cia')).toBe('5ª CIA');
    expect(gs.abaDaCia(cfg, 'ft')).toBe('F TAT');
    expect(gs.resolverCelula(doc('bo-eletronico').celulas!['1cia']!.acidente, '2026-10', 'E')).toBe('N30');
    expect(gs.resolverCelula(doc('bo-eletronico').celulas!['1cia']!.desap, '2026-01', 'E')).toBe('E21');
    expect(gs.resolverCelula('E11', '2026-10', 'E')).toBe('E11');
    expect(gs.ancorasDoMes(cfg, '2026-10')).toMatchObject({ N18: 'OUT.-26', A30: 'ACIDENTE DE TRÂNSITO' });
  });

  test('BCS: só 1ª, 4ª e 6ª Cia; coluna do trimestre; só nos meses do trimestre', () => {
    const prod = configParaMotor([doc('bcs-produtividade')])[0];
    const quadro = configParaMotor([doc('bcs-quadro')])[0];
    expect(ciasDoDocumento(doc('bcs-produtividade'))).toEqual(['1cia', '4cia', '6cia']);
    expect(gs.resolverCelula(doc('bcs-produtividade').celulas!['4cia']!.flagrantes, '2026-09', null, 'E')).toBe('G10');
    expect(gs.resolverCelula(doc('bcs-quadro').celulas!['6cia']!.furtoOutros, '2026-12', null, 'C')).toBe('F22');
    expect(gs.ancorasDoMes(prod, '2026-09')).toMatchObject({ G9: '3º Trimes' });
    expect(gs.ancorasDoMes(quadro, '2026-03')).toMatchObject({ C13: '1º Trimestre' });
    expect(gs.abaDaCia(quadro, '1cia')).toBe('1ª Cia ');
    expect(doc('bcs-funcionamento').celulas?.['6cia']).toMatchObject({ tipo: 'C10', populacao: 'J10' });
    expect(gs.textoDoMes('{TRI} TRIMESTRE DE {ANO}', '2026-09')).toBe('3º TRIMESTRE DE 2026');
    expect(documentosDoMes('2026-09').filter((d) => d.id.startsWith('bcs')).length).toBe(3);
    expect(documentosDoMes('2026-11').filter((d) => d.id.startsWith('bcs')).length).toBe(0);
    const f = lerValores(doc('bcs-funcionamento'), '1cia', { tipo: 'BCS', endereco: '', municipio: 'SP', telefone: '1', vtr: '1', efetivo: '2', area: '2.600', populacao: '25.000' });
    expect(Object.keys(f.erros)).toEqual(['endereco']);
  });

  test('Plano Diretor: linhas de cada Cia na coluna do mês', () => {
    const d = doc('plano-diretor');
    expect(gs.resolverCelula(d.celulas!['1cia']!.icc, '2026-10', 'G')).toBe('P20');
    expect(gs.resolverCelula(d.celulas!['2cia']!.icc, '2026-10', 'G')).toBe('P27');
    expect(gs.resolverCelula(d.celulas!.ft!.reunioes, '2026-12', 'G')).toBe('R38');
    expect(gs.ancorasDoMes(configParaMotor([d])[0], '2026-03')).toMatchObject({ I6: 'MARÇO' });
  });

  test('Avaliação Periódica: duas colunas por mês; FT só a produtividade', () => {
    const d = doc('avaliacao-periodica');
    const cfg = configParaMotor([d])[0];
    expect(gs.resolverCelula(d.celulas!['1cia']!.homicidio_ant, '2026-01', 'C')).toBe('C5');
    expect(gs.resolverCelula(d.celulas!['1cia']!.homicidio_atu, '2026-01', 'C')).toBe('D5');
    expect(gs.resolverCelula(d.celulas!['3cia']!.veiculos_atu, '2026-12', 'C')).toBe('Z25');
    expect(gs.ancorasDoMes(cfg, '2026-10')).toMatchObject({ U3: 'OUTUBRO', U4: '2025', V4: '2026' });
    expect(gs.abaDaCia(cfg, 'ft')).toBe('FT');
    expect(Object.keys(d.celulas!.ft!)).toHaveLength(16);
    expect(Object.keys(d.celulas!['2cia']!)).toHaveLength(34);
  });

  test('Distribuição A.I. CET: bloco de linhas de cada Cia', () => {
    const d = doc('distribuicao-ai-cet');
    expect(d.celulas?.['1cia']).toMatchObject({ l1_data: 'B10', l1_nome: 'E10', l1_tipo0: 'G10', l1_tipo1: 'H10', l13_re: 'D22' });
    expect(d.celulas?.['1cia']?.l14_re).toBeUndefined();
    expect(d.celulas?.ft).toMatchObject({ l1_re: 'D73', l10_tipo1: 'H82' });
    expect(gs.valoresParaZerar(configParaMotor([d])[0], '2026-10').find((x) => x.celula === 'G10')?.valor).toBe(false);
  });
});

describe('formulário e situação', () => {
  test('número obrigatório (zero vale), inteiro onde precisa, texto livre', () => {
    const r = lerValores(doc('escolas-ronda-escolar'), '1cia', { vtr: '1,5', efetivo: '3', estEx: '', estAt: '2.5', munEx: '0', munAt: '0', parEx: '-1', parAt: '0', obs: '' });
    expect(r.valores).toMatchObject({ vtr: 1.5, efetivo: 3, munEx: 0, obs: '' });
    expect(Object.keys(r.erros).sort()).toEqual(['estAt', 'estEx', 'parEx']);
  });

  test('lista: linhas viram as células do bloco; sem linha vai "NÃO HOUVE"; volta para editar', () => {
    const d = doc('distribuicao-ai-cet');
    const ok = valoresDaLista(d, '2cia', [{ data: '2026-10-05', qtd: '1', re: '104720-5', nome: 'Duílio', tipo: '0' }]);
    expect(ok.erros).toEqual({});
    expect(ok.valores).toMatchObject({ l1_data: '05/10/2026', l1_qtd: 1, l1_nome: 'DUÍLIO', l1_tipo0: true, l1_tipo1: false, l2_nome: '', l10_tipo0: false });
    expect(Object.keys(ok.valores)).toHaveLength(10 * 6);
    expect(linhasDosValores(d, '2cia', ok.valores)).toEqual([{ data: '2026-10-05', qtd: '1', re: '104720-5', nome: 'DUÍLIO', tipo: '0' }]);

    const nada = valoresDaLista(d, '2cia', []);
    expect(nada.valores.l1_nome).toBe('NÃO HOUVE');
    expect(linhasDosValores(d, '2cia', nada.valores)).toEqual([]);

    const ruim = valoresDaLista(d, '2cia', [{ data: '', qtd: 'x', re: '1', nome: 'A' }]);
    expect(Object.keys(ruim.erros).sort()).toEqual(['l1_data', 'l1_qtd', 'l1_tipo']);
    expect(valoresDaLista(d, '2cia', Array.from({ length: 11 }, () => ({}))).erros.__lista).toMatch(/No máximo 10/);
  });

  test('situação do envio', () => {
    const e = (x: Partial<EnvioMensal>) => ({ id: 'x', docId: 'd', mesRef: '2026-10', unidadeId: '1cia', valores: {}, respondidoPor: 'Sd', gravado: false, ...x }) as EnvioMensal;
    expect(situacaoEnvio(undefined, '2026-11-03', '2026-11-03')).toBe('pendente');
    expect(situacaoEnvio(undefined, '2026-11-03', '2026-11-04')).toBe('atrasado');
    expect(situacaoEnvio(e({}), '2026-11-03', '2026-11-09')).toBe('enviado');
    expect(situacaoEnvio(e({ gravado: true }), '2026-11-03')).toBe('gravado');
    expect(situacaoEnvio(e({ erro: 'mudou' }), '2026-11-03')).toBe('erro');
  });

  test('versão da configuração muda quando a configuração muda', () => {
    expect(versaoConfig()).toBe(versaoConfig());
    expect(versaoConfig(DOCUMENTOS.slice(1))).not.toBe(versaoConfig());
  });
});

describe('motor (Logica.gs)', () => {
  test('textos do mês e da legenda', () => {
    expect(gs.textoDoMes('Mês referente: {SIGLA}/{AA}', '2026-10')).toBe('Mês referente: OUT/26');
    expect(gs.textoDoMes('Mês: {MES}', '2026-03')).toBe('Mês: MARÇO');
    expect(gs.textoDoMes(doc('veiculos-apreendidos').legenda!.modelo, '2026-10', ' Cb PM Rodrigo ')).toBe('Preenchimento do Mês de Outubro - Cb PM Rodrigo');
    expect(gs.nomeArquivoMensal('Veículos Apreendidos', '2026-10')).toBe('Veículos Apreendidos - OUT2026');
    expect(gs.proximoMes('2026-12')).toBe('2027-01');
  });

  test('âncoras: ignora acento, espaço e maiúscula; aponta o que mudou', () => {
    expect(gs.conferirAncoras({ C2: '1ª Cia', A3: 'VEÍCULOS 4 RODAS' }, { C2: ' 1ª  CIA ', A3: 'Veiculos 4 rodas' })).toBe('');
    expect(gs.conferirAncoras({ C2: '1ª Cia' }, { C2: '2ª Cia' })).toMatch(/C2 devia ter "1ª Cia"/);
  });

  test('mês novo arquiva antes; mês antigo não grava', () => {
    expect(gs.acaoEnvioMensal(undefined, '2026-10')).toBe('gravar');
    expect(gs.acaoEnvioMensal('2026-10', '2026-10')).toBe('gravar');
    expect(gs.acaoEnvioMensal('2026-09', '2026-10')).toBe('arquivarAntes');
    expect(gs.acaoEnvioMensal('2026-11', '2026-10')).toBe('antigo');
  });
});

describe('R.R. - Relação de Remessa (direto na planilha)', () => {
  const rr = doc('relacao-remessa');
  test('todas as Cias e a FT, cada uma com o link para a própria aba', () => {
    expect(ciasDoDocumento(rr)).toEqual(['1cia', '2cia', '3cia', '4cia', '5cia', '6cia', 'ft']);
    expect(urlAbaDaCia(rr, '4cia')).toBe('https://docs.google.com/spreadsheets/d/1ZLsK2mL--WcHvwzLFpHdcwLyLK6LFJPYHnJgH3fntP0/edit#gid=1376035401');
    expect(preenchidoPeloPortal(rr)).toBe(false);
    expect(zeraAoArquivar(rr)).toBe(true);
  });

  test('a confirmação da Cia já conta como pronto', () => {
    const envio = { id: 'x', docId: rr.id, mesRef: '2026-10', unidadeId: '1cia', valores: {}, respondidoPor: 'Sgt', gravado: false } as EnvioMensal;
    expect(situacaoDoDocumento(rr, undefined, '2026-11-06', '2026-11-05')).toBe('pendente');
    expect(situacaoDoDocumento(rr, undefined, '2026-11-06', '2026-11-09')).toBe('atrasado');
    expect(situacaoDoDocumento(rr, envio, '2026-11-06', '2026-11-09')).toBe('gravado');
    expect(rotuloSituacao(rr, 'gravado')).toBe('✅ Confirmado');
  });

  test('zerar: apaga os BOs de todas as abas (Cias, Sede e M11) e põe o próximo mês no cabeçalho', () => {
    const cfg = configParaMotor([rr])[0] as unknown as { direto: unknown };
    const plano = gs.zerarDireto(cfg.direto, '2026-10');
    expect(plano.abas).toEqual(['8º _ 1ª Cia', '8º _ 2ª Cia', '8º _ 3ª Cia', '8º _ 4ª Cia', '8º _ 5ª Cia', '8º _ 6ª Cia', 'FT', 'Sede ', 'M11_8º']);
    expect(plano.limpar).toBe('B16:Q');
    expect(plano.mes).toEqual({ aba: '8º _ 1ª Cia', celula: 'A6', valor: 'OPM - 8º BPM/M -NOVEMBRO/2026' });
    expect(gs.zerarDireto(cfg.direto, '2026-12').mes?.valor).toBe('OPM - 8º BPM/M -JANEIRO/2027');
  });
});
