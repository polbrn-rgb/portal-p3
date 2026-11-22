import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, test } from 'vitest';
import {
  DIAS_ORDEM_APOS_FIM,
  diasDoPeriodo,
  idMissaoCgp,
  LIMITE_PDF_ORDEM,
  missoesDoDia,
  ordemApagaEm,
  proximasMissoes,
  tamanhoTexto,
  textoOrdemApagaEm,
  validarFotoCgp,
  validarLinkOrdem,
  validarPdfOrdem,
  validarPeriodo,
  type MissaoCgp,
} from '../../src/domain/cgp';

const logica: Record<string, unknown> = {};
runInNewContext(readFileSync('apps-script/Logica.gs', 'utf8'), logica);

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

  test('ordem de serviço: só PDF de até 10 MB', () => {
    expect(validarPdfOrdem({ name: 'OS 123.pdf', type: 'application/pdf', size: 500_000 })).toBe('');
    expect(validarPdfOrdem({ name: 'OS.PDF', type: '', size: 10 })).toBe('');
    expect(validarPdfOrdem({ name: 'OS.docx', type: 'application/msword', size: 10 })).toMatch(/PDF/);
    expect(validarPdfOrdem({ name: 'OS.pdf', type: 'application/pdf', size: 0 })).toMatch(/vazio/);
    expect(validarPdfOrdem({ name: 'OS.pdf', type: 'application/pdf', size: LIMITE_PDF_ORDEM })).toBe('');
    expect(validarPdfOrdem({ name: 'OS.pdf', type: 'application/pdf', size: LIMITE_PDF_ORDEM + 1 })).toMatch(/Google Drive/);
  });

  test('ordem de serviço: link só do Google Drive/Docs', () => {
    expect(validarLinkOrdem('https://drive.google.com/file/d/1AbC/view?usp=sharing')).toBe('');
    expect(validarLinkOrdem('  https://docs.google.com/document/d/1AbC/edit  ')).toBe('');
    expect(validarLinkOrdem('')).toMatch(/Cole/);
    expect(validarLinkOrdem('http://drive.google.com/file/d/1')).toMatch(/Google Drive/);
    expect(validarLinkOrdem('https://drive.google.com.golpe.com/x')).toMatch(/Google Drive/);
    expect(validarLinkOrdem('https://exemplo.com/os.pdf')).toMatch(/Google Drive/);
  });

  test('ordem de serviço sai 7 dias depois do fim da missão; portal e motor batem', () => {
    expect(logica.ORDENS_DIAS_APOS_FIM).toBe(DIAS_ORDEM_APOS_FIM);
    expect(ordemApagaEm('2026-11-27')).toBe('2026-12-05');
    expect(textoOrdemApagaEm('2026-11-27')).toBe('Sai do sistema em 05/12/2026 (7 dias depois do fim da missão)');
    const limite = logica.limiteOrdensVencidas as (agora: number) => string;
    // O motor apaga quando fim < limite (horário de Brasília).
    expect(limite(Date.parse('2026-12-05T02:59:00Z'))).toBe('2026-11-27'); // 04/12 23h59 em Brasília: fica
    expect(limite(Date.parse('2026-12-05T03:00:00Z'))).toBe('2026-11-28'); // 05/12 0h em Brasília: sai
    expect('2026-11-27' < limite(Date.parse('2026-12-05T03:00:00Z'))).toBe(true);
    expect(limite(Date.parse('2027-01-03T12:00:00Z'))).toBe('2026-12-27');
  });

  test('tamanho do PDF na tela', () => {
    expect(tamanhoTexto(850 * 1024)).toBe('850 KB');
    expect(tamanhoTexto(2.4 * 1024 * 1024)).toBe('2,4 MB');
    expect(tamanhoTexto(10)).toBe('1 KB');
  });
});
