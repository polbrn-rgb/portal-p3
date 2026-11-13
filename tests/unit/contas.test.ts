import { describe, expect, test } from 'vitest';
import { ALFABETO_SENHA, gerarSenha } from '../../scripts/senha';
import { CONTAS, emailDaConta, sessaoDosClaims } from '../../src/domain/contas';
import { mensagemErroLogin } from '../../src/domain/mensagens';

describe('contas', () => {
  test('P/3 usa o e-mail principal e as Cias usam +id', () => {
    expect(emailDaConta('p3')).toBe('8bpmm@gmail.com');
    expect(emailDaConta('1cia')).toBe('8bpmm+1cia@gmail.com');
    expect(emailDaConta('ft')).toBe('8bpmm+ft@gmail.com');
  });

  test('são 8 contas: P/3 + 7 unidades, sem e-mail repetido', () => {
    expect(CONTAS.map((c) => c.id)).toEqual(['p3', '1cia', '2cia', '3cia', '4cia', '5cia', '6cia', 'ft']);
    expect(new Set(CONTAS.map((c) => c.email)).size).toBe(8);
  });

  test('perfil gravado de cada conta', () => {
    expect(CONTAS[0].claims).toEqual({ perfil: 'p3' });
    expect(CONTAS.find((c) => c.id === '5cia')?.claims).toEqual({ perfil: 'unidade', unidade: '5cia' });
  });
});

describe('sessaoDosClaims', () => {
  test('P/3', () => {
    expect(sessaoDosClaims({ perfil: 'p3' })).toEqual({ tipo: 'p3', sigla: 'P/3' });
  });

  test('unidade válida', () => {
    expect(sessaoDosClaims({ perfil: 'unidade', unidade: 'ft' })).toEqual({
      tipo: 'unidade',
      unidade: 'ft',
      sigla: 'CIA FT',
    });
  });

  test('sem perfil, perfil estranho ou unidade inexistente', () => {
    expect(sessaoDosClaims({})).toEqual({ tipo: 'sem-perfil' });
    expect(sessaoDosClaims({ perfil: 'admin' })).toEqual({ tipo: 'sem-perfil' });
    expect(sessaoDosClaims({ perfil: 'unidade', unidade: '9cia' })).toEqual({ tipo: 'sem-perfil' });
    expect(sessaoDosClaims({ perfil: 'unidade' })).toEqual({ tipo: 'sem-perfil' });
  });
});

describe('mensagemErroLogin', () => {
  test('senha errada em qualquer formato do Firebase', () => {
    for (const codigo of ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found']) {
      expect(mensagemErroLogin(codigo)).toBe('Senha incorreta.');
    }
  });

  test('bloqueio, rede e erro desconhecido', () => {
    expect(mensagemErroLogin('auth/too-many-requests')).toContain('Muitas tentativas');
    expect(mensagemErroLogin('auth/network-request-failed')).toBe('Sem conexão com a internet.');
    expect(mensagemErroLogin('qualquer-coisa')).toBe('Não foi possível entrar. Tente de novo.');
  });
});

describe('gerarSenha', () => {
  test('tamanho certo, só caracteres sem ambiguidade e sempre diferente', () => {
    const senhas = Array.from({ length: 50 }, () => gerarSenha());
    for (const s of senhas) {
      expect(s).toHaveLength(10);
      expect([...s].every((c) => ALFABETO_SENHA.includes(c))).toBe(true);
    }
    expect(new Set(senhas).size).toBe(50);
  });
});
