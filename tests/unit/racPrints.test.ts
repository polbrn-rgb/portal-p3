import { describe, expect, test } from 'vitest';
import { racVazio } from '../../src/domain/rac';
import { conferirPrints, idPrint, motivoDoErroDoPrint, SLOTS_PRINT, slotsDaUnidade } from '../../src/domain/racPrints';

// Prints do RAC: só imagem para os slides (os números são sempre digitados).

describe('prints do RAC', () => {
  test('Cia manda os 7; Batalhão só os 4 painéis; Força Tática nenhum', () => {
    expect(slotsDaUnidade('2cia').map((s) => s.id)).toEqual(SLOTS_PRINT.map((s) => s.id));
    expect(slotsDaUnidade('btl').map((s) => s.id)).toEqual(['rvPainel', 'fvPainel', 'roPainel', 'foPainel']);
    expect(slotsDaUnidade('ft')).toEqual([]);
    expect(idPrint('2026-09', '1cia', 'fvMapa')).toBe('2026-09_1cia_fvMapa');
  });
  test('falta de print é erro (impede o envio); com todos, nada', () => {
    const faltando = conferirPrints(racVazio('2cia', '2026-09'), []);
    expect(faltando.map((a) => `${a.nivel}:${a.campo}`)).toEqual(SLOTS_PRINT.map((s) => `erro:prints.${s.id}`));
    expect(faltando[0].mensagem).toBe('Envie o print: Roubo de veículo — Indicadores Criminais.');
    expect(conferirPrints(racVazio('ft', '2026-09'), [])).toEqual([]);
    expect(conferirPrints(racVazio('1cia', '2026-09'), SLOTS_PRINT.map((s) => ({ slot: s.id })))).toEqual([]);
  });
  test('erro ao enviar o print: a mensagem diz o motivo', () => {
    expect(motivoDoErroDoPrint('preparar', new Error('x'))).toContain('não abriu como imagem');
    expect(motivoDoErroDoPrint('enviar', { code: 'permission-denied' })).toContain('regras do portal ainda não foram publicadas');
    expect(motivoDoErroDoPrint('enviar', { code: 'unavailable' })).toContain('Sem conexão');
    expect(motivoDoErroDoPrint('enviar', { code: 'resource-exhausted' })).toContain('(resource-exhausted)');
    expect(motivoDoErroDoPrint('enviar', null)).toContain('(erro desconhecido)');
  });
});
