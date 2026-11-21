import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, test } from 'vitest';
import { apagaEm, DIAS_NO_SISTEMA, PRAZO_DESDE, textoApagaEm } from '../../src/domain/fotos';
import { nomeArquivoFotoCgp } from '../../src/domain/cgp';

const logica: Record<string, unknown> = {};
runInNewContext(readFileSync('apps-script/Logica.gs', 'utf8'), logica);

describe('fotos: 15 dias no sistema', () => {
  test('portal e motor usam o mesmo prazo e a mesma data de início', () => {
    expect(logica.FOTOS_DIAS_NO_SISTEMA).toBe(DIAS_NO_SISTEMA);
    expect(logica.FOTOS_PRAZO_DESDE).toBe(PRAZO_DESDE);
  });

  test('foto nova sai 15 dias depois; a que já estava conta a partir do início da regra', () => {
    expect(apagaEm(new Date('2026-12-01T13:00:00Z'))?.toISOString()).toBe('2026-12-16T13:00:00.000Z');
    expect(apagaEm(new Date('2026-10-01T13:00:00Z'))?.toISOString()).toBe('2026-12-07T03:00:00.000Z');
    expect(apagaEm(null)).toBeNull();
  });

  test('o motor só apaga o que o portal mostra como vencido', () => {
    const limite = logica.limiteFotosVencidas as (agora: number) => string;
    expect(limite(Date.parse('2026-12-07T02:59:00Z'))).toBe('');
    const agora = Date.parse('2026-12-20T12:00:00Z');
    const corte = Date.parse(limite(agora));
    expect(apagaEm(new Date(corte - 1))!.getTime()).toBeLessThan(agora);
    expect(apagaEm(new Date(corte + 1))!.getTime()).toBeGreaterThan(agora);
  });

  test('texto da tela', () => {
    const agora = new Date(2026, 11, 10, 9);
    expect(textoApagaEm(new Date(2026, 11, 1, 10), agora)).toBe('Sai do sistema em 16/12/2026');
    expect(textoApagaEm(new Date(2026, 10, 26, 10), agora)).toBe('Sai do sistema amanhã');
    expect(textoApagaEm(new Date(2026, 10, 25, 10), agora)).toBe('Sai do sistema hoje');
    expect(textoApagaEm(null, agora)).toBe('Fica 15 dias no sistema');
  });

  test('nome do arquivo sem caracteres proibidos', () => {
    expect(nomeArquivoFotoCgp({ descricao: 'Operação 1/2', local: 'Rua: A' })).toBe('CGP Operação 1-2 - Rua- A.jpg');
    expect(nomeArquivoFotoCgp({ descricao: 'Op', local: 'X' }, 2)).toBe('CGP Op - X (2).jpg');
  });
});
