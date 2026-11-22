import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, test } from 'vitest';
import { sessaoDosClaims } from '../../src/domain/contas';
import { emailSalaCia, gerarSenhaSala, situacaoSenhaSala, TAMANHO_SENHA, type SenhaSalaCia } from '../../src/domain/salaCia';
import { UNIDADES } from '../../src/domain/unidades';

const ctx: Record<string, unknown> = {};
runInNewContext(readFileSync('apps-script/Logica.gs', 'utf8'), ctx);
const motor = ctx as unknown as {
  emailSalaCia: (u: string) => string;
  claimsSalaCia: (u: string) => Record<string, unknown>;
  UNIDADES_SALA_CIA: string[];
};

describe('Sala de Operações das Cias', () => {
  test('a conta de cada Cia é a mesma no portal e no motor', () => {
    expect(emailSalaCia('1cia')).toBe('sala-1cia@portal-p3.firebaseapp.com');
    expect(motor.UNIDADES_SALA_CIA).toEqual(UNIDADES.map((u) => u.id));
    for (const u of UNIDADES) expect(motor.emailSalaCia(u.id)).toBe(emailSalaCia(u.id));
  });

  test('o perfil gravado pelo motor abre só a Sala da Cia', () => {
    const claims = motor.claimsSalaCia('ft');
    expect(claims).toEqual({ perfil: 'salaCia', unidade: 'ft' });
    expect(sessaoDosClaims(claims)).toEqual({ tipo: 'salaCia', unidade: 'ft', sigla: 'Sala de Operações CIA FT' });
    expect(sessaoDosClaims({ perfil: 'salaCia', unidade: 'xx' })).toEqual({ tipo: 'sem-perfil' });
  });

  test('senha gerada: 10 caracteres, maiúscula, minúscula e número, sem 0/O/1/l/I', () => {
    const vistas = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const s = gerarSenhaSala();
      expect(s).toHaveLength(TAMANHO_SENHA);
      expect(s).toMatch(/[A-Z]/);
      expect(s).toMatch(/[a-z]/);
      expect(s).toMatch(/[2-9]/);
      expect(s).not.toMatch(/[0O1lI]/);
      vistas.add(s);
    }
    expect(vistas.size).toBe(200);
  });

  test('senha que não tem os três tipos é sorteada de novo', () => {
    let rodada = 0;
    // 1ª rodada: só "A" (índice 0); 2ª: mistura.
    const s = gerarSenhaSala((n) => new Uint32Array(n).map((_, i) => (rodada++ < n ? 0 : i * 7)));
    expect(s).toMatch(/[A-Z]/);
    expect(s).toMatch(/[a-z]/);
    expect(s).toMatch(/[2-9]/);
  });

  test('situação na lista da P/3', () => {
    const base: SenhaSalaCia = { id: '1cia', ativo: true, sincronizar: false, status: 'ok', erro: '', pedidoPor: 'P/3', pedidoEm: null, aplicadoEm: '' };
    expect(situacaoSenhaSala(undefined).texto).toBe('Sem senha');
    expect(situacaoSenhaSala({ ...base, sincronizar: true, status: 'pendente' }).texto).toContain('Aplicando');
    expect(situacaoSenhaSala(base).texto).toBe('Ativa');
    expect(situacaoSenhaSala({ ...base, ativo: false }).texto).toBe('Bloqueada');
    expect(situacaoSenhaSala({ ...base, status: 'erro', erro: 'x' }).texto).toBe('Erro: x');
  });
});
