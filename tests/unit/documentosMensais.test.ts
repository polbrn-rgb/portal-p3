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
  mesDoPrazo,
  mesReferencia,
  nesimoDiaUtil,
  preenchidoPeloPortal,
  situacaoEnvio,
  versaoConfig,
  type EnvioMensal,
} from '../../src/domain/documentosMensais';

type Logica = {
  proximoMes: (m: string) => string;
  textoDoMes: (modelo: string, mes: string, quem?: string) => string;
  conferirAncoras: (a: Record<string, string>, lidos: Record<string, string>) => string;
  acaoEnvioMensal: (mesPlanilha: string | undefined, mesEnvio: string) => string;
  celulasParaZerar: (doc: unknown) => string[];
  nomeArquivoMensal: (nome: string, mes: string) => string;
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

  test('nenhuma célula repetida (nem entre dados e legenda) e todo documento do portal tem âncoras', () => {
    for (const d of DOCUMENTOS.filter(preenchidoPeloPortal)) {
      const todas = [...Object.values(d.celulas ?? {}).flatMap((c) => Object.values(c)), ...Object.values(d.legenda?.celulas ?? {})];
      expect(new Set(todas).size, d.id).toBe(todas.length);
      expect(Object.keys(d.ancoras ?? {}).length, d.id).toBeGreaterThan(2);
      expect(gs.celulasParaZerar(configParaMotor([d])[0]).length).toBe(Object.values(d.celulas ?? {}).flatMap((c) => Object.values(c)).length);
    }
  });
});

describe('formulário e situação', () => {
  test('número obrigatório (zero vale), inteiro onde precisa, texto livre', () => {
    const r = lerValores(doc('escolas-ronda-escolar'), '1cia', { vtr: '1,5', efetivo: '3', estEx: '', estAt: '2.5', munEx: '0', munAt: '0', parEx: '-1', parAt: '0', obs: '' });
    expect(r.valores).toMatchObject({ vtr: 1.5, efetivo: 3, munEx: 0, obs: '' });
    expect(Object.keys(r.erros).sort()).toEqual(['estAt', 'estEx', 'parEx']);
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
