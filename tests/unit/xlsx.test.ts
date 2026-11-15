import { crc32 as crcNode } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { coluna, crc32, gerarXlsx } from '../../src/lib/xlsx';

/** Lê o ZIP sem compressão que o gerarXlsx monta: nome -> conteúdo. */
function abrirZip(z: Uint8Array): Map<string, string> {
  const v = new DataView(z.buffer, z.byteOffset, z.byteLength);
  const arquivos = new Map<string, string>();
  let i = 0;
  while (v.getUint32(i, true) === 0x04034b50) {
    expect(v.getUint16(i + 8, true)).toBe(0);
    const crc = v.getUint32(i + 14, true);
    const tamanho = v.getUint32(i + 18, true);
    const nomeLen = v.getUint16(i + 26, true);
    const nome = new TextDecoder().decode(z.subarray(i + 30, i + 30 + nomeLen));
    const dados = z.subarray(i + 30 + nomeLen, i + 30 + nomeLen + tamanho);
    expect(crcNode(dados)).toBe(crc);
    arquivos.set(nome, new TextDecoder().decode(dados));
    i += 30 + nomeLen + tamanho;
  }
  expect(v.getUint32(z.length - 22, true)).toBe(0x06054b50);
  expect(v.getUint16(z.length - 22 + 10, true)).toBe(arquivos.size);
  return arquivos;
}

describe('gerador de Excel (.xlsx)', () => {
  test('CRC e letras das colunas', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect([0, 25, 26, 27, 701, 702].map(coluna)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });

  test('pacote com as abas, cabeçalho em negrito, números como número e texto escapado', () => {
    const z = abrirZip(
      gerarXlsx([
        { nome: 'Efetivo', linhas: [['Cia', 'Qtd'], ['3ª CIA & <FT>', 2]] },
        { nome: 'Resumo/com:nome*ruim', linhas: [['x']] },
      ]),
    );
    expect([...z.keys()]).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]);
    expect(z.get('xl/workbook.xml')).toContain('<sheet name="Efetivo" sheetId="1" r:id="rId1"/>');
    expect(z.get('xl/workbook.xml')).toContain('name="Resumo com nome ruim"');
    const aba = z.get('xl/worksheets/sheet1.xml') ?? '';
    expect(aba).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Cia</t></is></c>');
    expect(aba).toContain('3ª CIA &amp; &lt;FT&gt;');
    expect(aba).toContain('<c r="B2"><v>2</v></c>');
    expect(aba).toContain('state="frozen"');
  });
});
