import { describe, expect, test } from 'vitest';
import {
  assuntoEap,
  corpoPadrao,
  dataPorExtenso,
  assinaturaChefe,
  cargoDoPosto,
  linhaCargo,
  validarAssinatura,
  idAssinatura,
  listaEmails,
  montarHtmlEmail,
  numeroMensagem,
  validarEmail,
  type DadosEmail,
} from '../../src/domain/email';

const dados = (extra: Partial<DadosEmail> = {}): DadosEmail => ({
  para: 'cpam11secop@policiamilitar.sp.gov.br',
  cc: '8bpmmp3@policiamilitar.sp.gov.br',
  ao: 'Ao Sr. Cmt CPA M-11',
  assunto: 'EAP - EAD novembro com Presencial em dezembro',
  corpo: 'Encaminho…',
  transmissor: 'Sd Priscila',
  anexarPlanilha: true,
  ...extra,
});

describe('endereços', () => {
  test('aceita vírgula, ponto e vírgula e espaço; tira repetidos', () => {
    expect(listaEmails(' A@x.com; b@y.com,  a@x.com\nc@z.com ')).toEqual(['a@x.com', 'b@y.com', 'c@z.com']);
    expect(listaEmails('')).toEqual([]);
  });

  test('validação: Para obrigatório e válido; Cc opcional; transmissor obrigatório', () => {
    expect(validarEmail(dados())).toEqual({});
    expect(validarEmail(dados({ para: '' }))).toHaveProperty('para');
    expect(validarEmail(dados({ para: 'cpam11secop' }))).toHaveProperty('para');
    expect(validarEmail(dados({ cc: '' }))).toEqual({});
    expect(validarEmail(dados({ cc: 'errado@' }))).toHaveProperty('cc');
    expect(validarEmail(dados({ transmissor: '' }))).toHaveProperty('transmissor');
    expect(validarEmail(dados({ assunto: ' ', corpo: '' }))).toMatchObject({ assunto: expect.any(String), corpo: expect.any(String) });
  });
});

describe('textos do padrão', () => {
  test('data por extenso', () => {
    expect(dataPorExtenso('2026-11-04')).toBe('04 de novembro de 2026');
    expect(dataPorExtenso('2027-03-15')).toBe('15 de março de 2027');
  });

  test('nº da mensagem: até 2026 pelo nº do Numerador; de 2027 pelo nº do documento', () => {
    expect(numeroMensagem({ numero: 2044, dataEntrada: '2026-11-04' })).toBe('8BPMM-2044/03/26');
    expect(numeroMensagem({ numero: 2300, numeroDocumento: 'MSG ELETRÔNICA 8BPMM-001/03/27', dataEntrada: '2027-01-05' })).toBe(
      '8BPMM-001/03/27',
    );
  });

  test('assunto e texto padrão do EAP', () => {
    const assunto = assuntoEap({ mesEad: 11, mesPresencial: 12 });
    expect(assunto).toBe('EAP - EAD novembro com Presencial em dezembro');
    expect(corpoPadrao(assunto)).toBe(
      'Encaminho a V.S ª expediente anexo, referente a EAP - EAD novembro com Presencial em dezembro, para conhecimento e possíveis providências.',
    );
  });
});

describe('HTML do e-mail', () => {
  const html = montarHtmlEmail(
    {
      data: '2026-11-04',
      numeroMensagem: '8BPMM-2044/03/26',
      ao: 'Ao Sr. Cmt CPA M-11',
      assunto: 'EAP <teste>',
      corpo: 'Primeiro parágrafo.\n\nSegundo & último.',
    },
    { chefe: 'cid:assinaturaChefe', transmissor: 'cid:assinaturaTransmissor' },
  );

  test('segue o padrão, na ordem', () => {
    const ordem = [
      'SECRETARIA DA SEGURANÇA PÚBLICA',
      'POLÍCIA MILITAR DO ESTADO DE SÃO PAULO',
      'São Paulo, 04 de novembro de 2026.',
      'MENSAGEM ELETRÔNICA Nº 8BPMM-2044/03/26',
      'Do Ch Seç Op do 8º BPM/M',
      'Ao Sr. Cmt CPA M-11',
      'Assunto: EAP &lt;teste&gt;',
      'Primeiro parágrafo.',
      'Segundo &amp; último.',
      'SOLICITAÇÃO DE CONFIRMAÇÃO DE RECEBIMENTO (NOME e RE)',
      'I-31-PM – Art. 15 – Inc. IV',
      'cid:assinaturaChefe',
      'Transmitido por:',
      'cid:assinaturaTransmissor',
    ];
    const posicoes = ordem.map((t) => html.indexOf(t));
    expect(posicoes.every((p) => p >= 0)).toBe(true);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
  });

  test('texto da P/3 não vira HTML (escapado)', () => {
    expect(html).not.toContain('<teste>');
  });
});

describe('assinaturas', () => {
  test('id a partir do nome', () => {
    expect(idAssinatura('Sd Priscila')).toBe('sd-priscila');
    expect(idAssinatura('Cap Filipi')).toBe('cap-filipi');
  });

  test('cargo pela graduação', () => {
    expect(linhaCargo('Cap PM')).toBe('Cap PM - Chefe Seção Operacional');
    expect(linhaCargo('2º SGT PM')).toBe('2º SGT PM - Encarregado Seção Operacional');
    expect(linhaCargo('SD PM - 1C')).toBe('SD PM - 1C - Auxiliar de operações');
    expect(linhaCargo('CB PM')).toBe('CB PM - Auxiliar de operações');
    expect(cargoDoPosto('1º Ten PM')).toBe('');
    expect(linhaCargo('1º Ten PM')).toBe('1º Ten PM');
  });

  test('a do Capitão é a do chefe (vai em todos os e-mails)', () => {
    const a = (nome: string, posto: string) => ({ id: nome, nome, re: '', nomeCompleto: `${nome} completo`, posto });
    expect(assinaturaChefe([a('Sd Priscila', 'SD PM - 1C'), a('Cap Filipi', 'Cap PM')])?.nome).toBe('Cap Filipi');
    expect(assinaturaChefe([a('Sd Priscila', 'SD PM - 1C')])).toBeUndefined();
  });

  test('nome completo e posto obrigatórios', () => {
    expect(validarAssinatura({ nome: 'Sd Priscila', re: '', nomeCompleto: 'Priscila Santos', posto: 'SD PM - 1C' })).toEqual({});
    expect(validarAssinatura({ nome: 'Sd Priscila', re: '', nomeCompleto: ' ', posto: '' })).toMatchObject({
      nomeCompleto: expect.any(String),
      posto: expect.any(String),
    });
  });
});
});
