import { describe, expect, test } from 'vitest';
import { diasDoPeriodo, idMissaoCgp, missoesDoDia, proximasMissoes, validarFotoCgp, validarPeriodo, type MissaoCgp } from '../../src/domain/cgp';

const m = (id: string, inicio: string, fim: string) => ({ id, inicio, fim }) as MissaoCgp;

describe('CGP', () => {
  test('período: de 17/11/26 até 27/11/26 = 11 dias; fim antes do início é erro', () => {
    expect(diasDoPeriodo({ inicio: '2026-11-17', fim: '2026-11-27' })).toBe(11);
    expect(diasDoPeriodo({ inicio: '2026-11-17', fim: '2026-11-17' })).toBe(1);
    expect(validarPeriodo({ inicio: '2026-11-17', fim: '2026-11-10' }).fim).toBeTruthy();
    expect(validarPeriodo({ inicio: '', fim: '' })).toHaveProperty('inicio');
  });

  test('id fixo por Cia + origem + demanda (não duplica)', () => {
    expect(idMissaoCgp('1cia', 'enc', '2151_1cia')).toBe('1cia_enc_2151_1cia');
    expect(idMissaoCgp('ft', 'numerador', 'ft_2026_OFICIO_1')).toBe('ft_numerador_ft_2026_OFICIO_1');
  });

  test('missões do dia e próximas', () => {
    const l = [m('a', '2026-11-17', '2026-11-27'), m('b', '2026-11-25', '2026-11-25'), m('c', '2026-12-01', '2026-12-02')];
    expect(missoesDoDia(l, '2026-11-20').map((x) => x.id)).toEqual(['a']);
    expect(missoesDoDia(l, '2026-11-25').map((x) => x.id)).toEqual(['a', 'b']);
    expect(proximasMissoes(l, '2026-11-20').map((x) => x.id)).toEqual(['b', 'c']);
  });

  test('foto: descrição, local, observação e ao menos uma foto são obrigatórios', () => {
    expect(Object.keys(validarFotoCgp({ descricao: '', local: '', observacao: '' }, 0)).sort()).toEqual(['descricao', 'fotos', 'local', 'observacao']);
    expect(validarFotoCgp({ descricao: 'Operação', local: 'Praça', observacao: 'Equipe 1, VTR 08-123' }, 3)).toEqual({});
  });
});
