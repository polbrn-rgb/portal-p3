// Gera um arquivo Excel (.xlsx) de verdade, sem biblioteca: o .xlsx é um ZIP de alguns XMLs.
// O ZIP vai sem compressão ("stored"), que todo Excel/Google Planilhas/LibreOffice abre.

export type Celula = string | number;
export type Aba = { nome: string; linhas: Celula[][] };

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(dados: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(arquivos: { nome: string; dados: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let posicao = 0;
  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const crc = crc32(a.dados);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true); // sem compressão
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x21, true); // 01/01/1980
    local.setUint32(14, crc, true);
    local.setUint32(18, a.dados.length, true);
    local.setUint32(22, a.dados.length, true);
    local.setUint16(26, nome.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nome, a.dados);

    const cab = new DataView(new ArrayBuffer(46));
    cab.setUint32(0, 0x02014b50, true);
    cab.setUint16(4, 20, true);
    cab.setUint16(6, 20, true);
    cab.setUint16(8, 0x0800, true);
    cab.setUint16(10, 0, true);
    cab.setUint16(12, 0, true);
    cab.setUint16(14, 0x21, true);
    cab.setUint32(16, crc, true);
    cab.setUint32(20, a.dados.length, true);
    cab.setUint32(24, a.dados.length, true);
    cab.setUint16(28, nome.length, true);
    cab.setUint32(42, posicao, true);
    central.push(new Uint8Array(cab.buffer), nome);
    posicao += 30 + nome.length + a.dados.length;
  }
  const tamanhoCentral = central.reduce((t, p) => t + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, posicao, true);
  const tudo = [...partes, ...central, new Uint8Array(fim.buffer)];
  const saida = new Uint8Array(tudo.reduce((t, p) => t + p.length, 0));
  let i = 0;
  for (const p of tudo) {
    saida.set(p, i);
    i += p.length;
  }
  return saida;
}

function xml(texto: string): string {
  return texto
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 0 -> A, 25 -> Z, 26 -> AA */
export function coluna(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Nome de aba que o Excel aceita (até 31 caracteres, sem []:*?/\), sem repetir. */
function nomesDeAba(abas: Aba[]): string[] {
  const usados = new Set<string>();
  return abas.map((a, i) => {
    let nome = a.nome.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || `Planilha${i + 1}`;
    while (usados.has(nome.toLowerCase())) nome = `${nome.slice(0, 28)} ${i + 1}`;
    usados.add(nome.toLowerCase());
    return nome;
  });
}

function planilhaXml(linhas: Celula[][]): string {
  const larguras: number[] = [];
  for (const l of linhas) l.forEach((v, c) => (larguras[c] = Math.max(larguras[c] ?? 0, String(v).length)));
  const cols = larguras.length
    ? `<cols>${larguras.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${Math.min(50, Math.max(8, w + 2))}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const corpo = linhas
    .map((l, r) => {
      const celulas = l
        .map((v, c) => {
          const ref = `${coluna(c)}${r + 1}`;
          const estilo = r === 0 ? ' s="1"' : '';
          if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${estilo}><v>${v}</v></c>`;
          return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${celulas}</row>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `${cols}<sheetData>${corpo}</sheetData></worksheet>`
  );
}

/** Monta o .xlsx. A primeira linha de cada aba sai em negrito e fica congelada. */
export function gerarXlsx(abas: Aba[]): Uint8Array {
  const enc = new TextEncoder();
  const nomes = nomesDeAba(abas);
  const arquivos = [
    {
      nome: '[Content_Types].xml',
      texto:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '</Types>',
    },
    {
      nome: '_rels/.rels',
      texto:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      nome: 'xl/workbook.xml',
      texto:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        nomes.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>',
    },
    {
      nome: 'xl/_rels/workbook.xml.rels',
      texto:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      nome: 'xl/styles.xml',
      texto:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>',
    },
    ...abas.map((a, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, texto: planilhaXml(a.linhas) })),
  ];
  return zip(arquivos.map((a) => ({ nome: a.nome, dados: enc.encode(a.texto) })));
}

/** Baixa o arquivo no navegador (funciona no celular também). */
export function baixarXlsx(nomeArquivo: string, abas: Aba[]): void {
  const dados = gerarXlsx(abas);
  const url = URL.createObjectURL(
    new Blob([dados as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
