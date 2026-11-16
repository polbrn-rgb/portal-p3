import { describe, expect, test } from 'vitest';
import {
  agruparPorCfp,
  caminhoNoZip,
  encaixar,
  idFotoTds,
  mesAnterior,
  nomeMes,
  validarCadastroManual,
  validarEnvioTds,
  vagasLivres,
  type FotoTds,
} from '../../src/domain/tds';

const foto = (x: Partial<FotoTds>): FotoTds => ({
  id: 'x',
  mes: '2026-11',
  re: '123456',
  cfp: { posto: '1º Ten PM', nomeGuerra: 'SOUZA' },
  data: '2026-11-10',
  assunto: 'Abordagem',
  vaga: 1,
  miniatura: '',
  tamanho: 1,
  ...x,
});

describe('TDS', () => {
  test('id e vagas: até 5 por CFP no mês', () => {
    expect(idFotoTds('2026-11', '123456-7', 3)).toBe('2026-11_123456_3');
    expect(vagasLivres([])).toEqual([1, 2, 3, 4, 5]);
    expect(vagasLivres([{ vaga: 1 }, { vaga: 4 }])).toEqual([2, 3, 5]);
    expect(vagasLivres([1, 2, 3, 4, 5].map((vaga) => ({ vaga })))).toEqual([]);
  });

  test('meses', () => {
    expect(nomeMes('2026-11')).toBe('novembro de 2026');
    expect(mesAnterior('2026-11')).toBe('2026-10');
    expect(mesAnterior('2027-01')).toBe('2026-12');
  });

  test('envio: RE, data (deste mês ou do passado, até hoje), assunto e fotos dentro do que falta', () => {
    const ok = { re: '123456-7', data: '2026-11-10', assunto: 'Abordagem', quantidade: 2, livres: 5 };
    expect(validarEnvioTds(ok, '2026-11-16')).toEqual({});
    expect(validarEnvioTds({ ...ok, data: '2026-10-31' }, '2026-11-16')).toEqual({});
    expect(validarEnvioTds({ ...ok, data: '2026-09-30' }, '2026-11-16').data).toMatch(/mês passado/);
    expect(validarEnvioTds({ ...ok, data: '2026-11-17' }, '2026-11-16').data).toMatch(/depois de hoje/);
    expect(validarEnvioTds({ re: '12', data: '', assunto: ' ', quantidade: 0, livres: 5 }, '2026-11-16')).toEqual({
      re: expect.any(String),
      data: expect.any(String),
      assunto: expect.any(String),
      fotos: 'Escolha pelo menos uma foto.',
    });
    expect(validarEnvioTds({ ...ok, quantidade: 3, livres: 2 }, '2026-11-16').fotos).toMatch(/ainda pode mandar 2 foto/);
    expect(validarEnvioTds({ ...ok, livres: 0 }, '2026-11-16').fotos).toMatch(/já enviou as 5/);
    expect(validarEnvioTds({ ...ok, assunto: 'a'.repeat(121) }, '2026-11-16').assunto).toMatch(/120/);
  });

  test('cadastro manual: posto, nome de guerra e nome completo obrigatórios', () => {
    expect(validarCadastroManual({ posto: 'Sd PM', nomeGuerra: 'Lima', nomeCompleto: 'José Lima', telefone: '' })).toEqual({});
    expect(Object.keys(validarCadastroManual({ posto: '', nomeGuerra: ' ', nomeCompleto: '', telefone: '' }))).toEqual(['posto', 'nomeGuerra', 'nomeCompleto']);
  });

  test('redução: maior lado cabe no limite, sem aumentar foto pequena', () => {
    expect(encaixar(4000, 3000, 1600)).toEqual({ largura: 1600, altura: 1200 });
    expect(encaixar(3000, 4000, 1600)).toEqual({ largura: 1200, altura: 1600 });
    expect(encaixar(800, 600, 1600)).toEqual({ largura: 800, altura: 600 });
  });

  test('agrupa por CFP e monta o caminho no .zip (uma pasta por CFP)', () => {
    const grupos = agruparPorCfp([
      foto({ id: 'a', vaga: 2, data: '2026-11-12' }),
      foto({ id: 'b', re: '654321', cfp: { posto: 'Cap PM', nomeGuerra: 'ALVES' } }),
      foto({ id: 'c', vaga: 1, data: '2026-11-12' }),
      foto({ id: 'd', vaga: 3, data: '2026-11-02' }),
    ]);
    expect(grupos.map((g) => g.cfp.nomeGuerra)).toEqual(['ALVES', 'SOUZA']);
    expect(grupos[1].fotos.map((f) => f.id)).toEqual(['d', 'c', 'a']);
    expect(caminhoNoZip(foto({ assunto: 'Uso / progressivo: "força"' }))).toBe('1º Ten PM SOUZA - RE 123456/2026-11-10 - Uso progressivo força - 1.jpg');
  });
});
