import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, test } from 'vitest';
import {
  acessoVazio,
  ehAdminRE,
  emailDeLogin,
  identificacaoDoLogin,
  reDoLogin,
  responsavelDoRE,
  montarAcesso,
  reBase,
  situacaoAcesso,
  unidadeDaOpm,
  validarAcesso,
  type Acesso,
  type DadosAcesso,
} from '../../src/domain/acessos';

const ctx: Record<string, unknown> = {};
runInNewContext(readFileSync('apps-script/Logica.gs', 'utf8'), ctx);
const motor = ctx as unknown as {
  emailDeLoginAcesso: (re: string) => string;
  claimsDoAcesso: (a: Record<string, unknown>) => Record<string, unknown>;
  linhasDoEfetivo: (v: unknown[][]) => Record<string, string>[];
  htmlLinkSenha: (a: Record<string, unknown>, link: string, primeiro: boolean) => string;
};

const dados = (extra: Partial<DadosAcesso> = {}): DadosAcesso => ({
  ...acessoVazio(),
  re: '144602-9',
  nomeCompleto: 'Fulano de Tal',
  nomeGuerra: 'Sousa',
  posto: '2º Sgt PM',
  email: 'sousa@policiamilitar.sp.gov.br',
  perfil: 'p3',
  ...extra,
});

describe('RE e conta de login', () => {
  test('com ou sem dígito dá a mesma conta (portal e motor iguais)', () => {
    for (const re of ['144602-9', '1446029', '144602', ' 144.602-9 ']) {
      expect(reBase(re)).toBe('144602');
      expect(emailDeLogin(re)).toBe('re144602@portal-p3.firebaseapp.com');
      expect(motor.emailDeLoginAcesso(re)).toBe(emailDeLogin(re));
    }
    expect(emailDeLogin('141018-A')).toBe('re141018@portal-p3.firebaseapp.com');
  });

  test('só os dois REs do chefe e do encarregado são Administrador', () => {
    expect(ehAdminRE('144602-9')).toBe(true);
    expect(ehAdminRE('130155-1')).toBe(true);
    expect(ehAdminRE('111111-1')).toBe(false);
  });
});

describe('Cia pela coluna OPM do banco', () => {
  test('Cias, FT e EM', () => {
    expect(unidadeDaOpm('1ªCia - 8ºBPM/M')).toBe('1cia');
    expect(unidadeDaOpm('6ªCia - 8ºBPM/M')).toBe('6cia');
    expect(unidadeDaOpm('3a Cia')).toBe('3cia');
    expect(unidadeDaOpm('FT - 8ºBPM/M')).toBe('ft');
    expect(unidadeDaOpm('EM - 8ºBPM/M')).toBe('');
    expect(unidadeDaOpm('')).toBe('');
  });

  test('o motor lê a OPM do banco de efetivo', () => {
    const linhas = motor.linhasDoEfetivo([
      ['Coluna 1', 'Post/Grad', 'RE', 'NOME COMPLETO', 'NOME DE GUERRA', 'Telefone', 'OPM', 'APTO SPM', 'Email'],
      [1, 'Sd PM', '194899-7', 'FULANO', 'ABDO', '11 9', '3ªCia - 8ºBPM/M', 'Sim', 'abdo@policiamilitar.sp.gov.br'],
    ]);
    expect(linhas[0]).toMatchObject({ chave: '194899', opm: '3ªCia - 8ºBPM/M', email: 'abdo@policiamilitar.sp.gov.br' });
  });
});

describe('cadastro', () => {
  test('obrigatórios: RE, nome, posto, e-mail válido, acesso e Cia', () => {
    expect(validarAcesso(dados())).toEqual({});
    expect(validarAcesso(dados({ perfil: 'cgp', unidade: '' }))).toHaveProperty('unidade');
    expect(montarAcesso(dados({ perfil: 'cgp', unidade: '2cia' }), { novo: true }).unidade).toBe('2cia');
    expect(validarAcesso(dados({ email: 'Sem e-mail' }))).toHaveProperty('email');
    expect(validarAcesso(dados({ re: '123' }))).toHaveProperty('re');
    expect(validarAcesso(dados({ perfil: '' }))).toHaveProperty('perfil');
    expect(validarAcesso(dados({ perfil: 'unidade', unidade: '' }))).toHaveProperty('unidade');
    expect(validarAcesso(dados({ perfil: 'unidade', unidade: '2cia' }))).toEqual({});
  });

  test('o que vai para o banco: admin só P/3 dos dois REs; link só no cadastro novo', () => {
    expect(montarAcesso(dados(), { novo: true })).toMatchObject({ admin: true, enviarLink: true, sincronizar: true, ativo: true, unidade: '' });
    expect(montarAcesso(dados({ perfil: 'cfp' }), { novo: false })).toMatchObject({ admin: false });
    expect(montarAcesso(dados(), { novo: false })).not.toHaveProperty('enviarLink');
    expect(montarAcesso(dados({ re: '111111-1' }), { novo: true }).admin).toBe(false);
  });

  test('perfil da conta (motor): Cia leva a unidade; admin só no P/3 marcado', () => {
    expect(motor.claimsDoAcesso({ perfil: 'unidade', unidade: '2cia', re: '194899-7', admin: false })).toEqual({ perfil: 'unidade', unidade: '2cia', re: '194899' });
    expect(motor.claimsDoAcesso({ perfil: 'p3', re: '130155-1', admin: true })).toEqual({ perfil: 'p3', re: '130155', admin: true });
    expect(motor.claimsDoAcesso({ perfil: 'cfp', re: '222222-2', admin: true })).toEqual({ perfil: 'cfp', re: '222222' });
    expect(motor.claimsDoAcesso({ perfil: 'cgp', unidade: 'ft', re: '444444-4' })).toEqual({ perfil: 'cgp', unidade: 'ft', re: '444444' });
  });

  test('e-mail do link: botão, RE e sem HTML do nome', () => {
    const html = motor.htmlLinkSenha({ posto: 'Sd PM', nomeGuerra: '<b>X</b>' }, 'https://link', true);
    expect(html).toContain('Criar minha senha');
    expect(html).toContain('https://link');
    expect(html).not.toContain('<b>X</b>');
  });

  test('situação na lista', () => {
    const a = (extra: Partial<Acesso>) => ({ ...montarAcesso(dados(), { novo: false }), id: '144602', ...extra }) as Acesso;
    expect(situacaoAcesso(a({ status: 'ok', sincronizar: false })).texto).toBe('Ativo');
    expect(situacaoAcesso(a({ status: 'ok', sincronizar: false, ativo: false })).texto).toBe('Bloqueado');
    expect(situacaoAcesso(a({ status: 'erro', sincronizar: false, erro: 'x' })).texto).toBe('Erro: x');
    expect(situacaoAcesso(a({})).texto).toContain('Criando');
  });
});

describe('quem está logado', () => {
  test('RE e identificação só para login individual', () => {
    expect(reDoLogin('re194899@portal-p3.firebaseapp.com')).toBe('194899');
    expect(reDoLogin('8bpmmp3+1cia@gmail.com')).toBeNull();
    expect(reDoLogin('re194899@outro.com')).toBeNull();
    expect(identificacaoDoLogin('re194899@portal-p3.firebaseapp.com', 'Sd PM ABDO')).toBe('Sd PM ABDO (RE 194899)');
    expect(identificacaoDoLogin('re194899@portal-p3.firebaseapp.com', '')).toBe('RE 194899');
    expect(identificacaoDoLogin('8bpmmp3+1cia@gmail.com', 'Conta 1ª Cia')).toBeNull();
  });

  test('Responsável do numerador pelo RE de quem está logado (tabela de assinaturas)', () => {
    const lista = [
      { nome: 'Sd Priscila', re: '200000-1' },
      { nome: 'Cap Filipi', re: '130155-1' },
      { nome: 'Sem RE', re: '' },
    ];
    expect(responsavelDoRE(lista, '130155')).toBe('Cap Filipi');
    expect(responsavelDoRE(lista, '999999')).toBeNull();
    expect(responsavelDoRE(lista, null)).toBeNull();
  });
});
