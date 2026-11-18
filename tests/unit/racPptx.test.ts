import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { DELITOS, nomeRacGeral, racVazio, type RacDados } from '../../src/domain/rac';
import { construirTabela, dimensoesJpeg, encaixarPrint, montarApresentacao, nomeArquivoRac, planoDeSlides, textoNaCelula } from '../../src/domain/racPptx';
import { base64ParaBytes, bytesParaBase64 } from '../../src/lib/imagem';
import { zip } from '../../src/lib/xlsx';
import { deszipar } from '../../src/lib/zipLeitura';

// Apresentação gerada a partir do "Modelo RAC - MES26.pptx" da P/3 (public/rac/modelo-rac.pptx).

const dec = new TextDecoder();
const modelo = () => deszipar(new Uint8Array(readFileSync('public/rac/modelo-rac.pptx')));
const txt = (a: Map<string, Uint8Array>, n: string) => dec.decode(a.get(n));
// JPEG mínimo: só o cabeçalho com o tamanho (SOF0), basta para o encaixe e para o pacote.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x06, 0x07, 0x45, 0x03, 0x01, 0x22, 0x00, 0xff, 0xd9]);

function cia1(): RacDados {
  const d = racVazio('1cia', '2026-09');
  const ano = [0, 6, 106, 102, 376, 0, 2, 0, 0];
  const atual = [0, 1, 62, 84, 292, 0, 0, 0, 0];
  DELITOS.forEach((x, i) => (d.crimes[x.id] = { anoAnterior: ano[i], atual: atual[i], mesRetrasado: 0, mesAnterior: 0, inconsistencias: i === 2 ? 1 : 0 }));
  return d;
}

describe('peças da apresentação', () => {
  test('tamanho do JPEG e encaixe do print sem deformar', () => {
    expect(dimensoesJpeg(JPEG)).toEqual({ largura: 1861, altura: 774 });
    expect(dimensoesJpeg(new Uint8Array([1, 2, 3]))).toBeNull();
    const p = encaixarPrint(1861, 774); // painel: limitado pela largura
    expect(p.cx).toBe(8686800);
    expect(Math.round((p.cx / p.cy) * 100)).toBe(Math.round((1861 / 774) * 100));
    const mapa = encaixarPrint(1175, 664); // mapa: limitado pela altura e centralizado
    expect(mapa.cy).toBe(4050000);
    expect(mapa.x).toBeGreaterThan(228600);
  });
  test('texto da célula: mantém a fonte do modelo, centraliza e escapa XML', () => {
    const tc = '<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="l"/><a:endParaRPr b="1"><a:latin typeface="Calibri"/></a:endParaRPr></a:p></a:txBody><a:tcPr anchor="b"></a:tcPr></a:tc>';
    const r = textoNaCelula(tc, 'A & B');
    expect(r).toContain('<a:pPr algn="ctr"/>');
    expect(r).toContain('<a:r><a:rPr b="1"><a:latin typeface="Calibri"/></a:rPr><a:t>A &amp; B</a:t></a:r>');
    expect(r).toContain('anchor="ctr"');
  });
  test('nome do arquivo', () => {
    expect(nomeArquivoRac('1ª Cia', '2026-09')).toBe('RAC 1ª Cia - SETEMBRO-2026.pptx');
  });
  test('plano de slides: Cia 16 (como o modelo), Força Tática 5', () => {
    expect(planoDeSlides(cia1()).map((p) => p.base)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(planoDeSlides(racVazio('ft', '2026-09')).length).toBe(5);
    // Batalhão como o RAC BTL: sem inconsistências, 4 painéis, RPM.
    expect(planoDeSlides(racVazio('btl', '2026-09')).map((p) => p.base)).toEqual([1, 2, 4, 5, 6, 8, 10, 12, 13, 14, 15, 16]);
  });
});

describe('apresentação montada do modelo', () => {
  test('1ª Cia + FT: slides, título, tabelas com cores, prints e pacote válido', async () => {
    const m = await modelo();
    const tblModelo = /<a:tbl>[\s\S]*<\/a:tbl>/.exec(txt(m, 'ppt/slides/slide2.xml'))![0];
    expect(construirTabela(tblModelo, { id: 'anual', titulo: '', fonte: '', cabecalho: ['DELITO', 'a', 'b', 'Var %'], linhas: [], tipoVar: 'crime' }, 1268025).largura).toBe(6804775);

    const a = montarApresentacao(m, [
      { dados: cia1(), prints: { rvPainel: { jpeg: JPEG, largura: 1861, altura: 774 } } },
      { dados: racVazio('ft', '2026-09'), prints: {} },
    ]);
    const slides = [...a.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k));
    expect(slides.length).toBe(21);
    expect([...a.keys()].some((k) => k.includes('notesSlides'))).toBe(false);
    expect(txt(a, 'ppt/presentation.xml').match(/<p:sldId /g)?.length).toBe(21);
    const tipos = txt(a, '[Content_Types].xml');
    expect(tipos.match(/presentationml\.slide\+xml/g)?.length).toBe(21);
    expect(tipos).toContain('Extension="jpeg"');
    expect(tipos).not.toContain('notesSlide+xml" PartName');

    expect(txt(a, 'ppt/slides/slide1.xml')).toContain('<a:t>RAC – 1ª Cia - </a:t><');
    expect(txt(a, 'ppt/slides/slide1.xml')).toContain('SETEMBRO/2026');
    const anual = txt(a, 'ppt/slides/slide2.xml');
    for (const t of ['set/25', 'set/26', 'ROUBO VEÍCULO', '-83%', '93C47D']) expect(anual).toContain(t);
    expect(txt(a, 'ppt/slides/slide3.xml')).toContain('<a:t>61</a:t>'); // Real do furto de veículo

    expect(txt(a, 'ppt/slides/slide6.xml')).toContain('r:embed="rIdPrint"');
    expect(txt(a, 'ppt/slides/_rels/slide6.xml.rels')).toContain('../media/rac_print_1.jpeg');
    expect(a.get('ppt/media/rac_print_1.jpeg')).toEqual(JPEG);
    expect(txt(a, 'ppt/slides/slide7.xml')).toContain('Print não enviado');
    expect(txt(a, 'ppt/slides/_rels/slide7.xml.rels')).not.toContain('notesSlide');

    expect(txt(a, 'ppt/slides/slide17.xml')).toContain('RAC – Cia FT - ');
    expect(txt(a, 'ppt/slides/slide19.xml')).toContain('<a:t>PRODUTIVIDADE MENSAL</a:t>'); // por pelotão da FT
    expect(txt(a, 'ppt/slides/slide19.xml')).toContain('<a:t>Pel B</a:t>');

    // O .pptx (zip) abre de novo com os mesmos arquivos.
    const de = await deszipar(zip([...a].map(([nome, dados]) => ({ nome, dados }))));
    expect([...de.keys()].sort()).toEqual([...a.keys()].sort());
  });
});

describe('RAC GERAL', () => {
  test('Cia + FT + Batalhão num .pptx só, Batalhão com RPM e título', async () => {
    const btl = racVazio('btl', '2026-09');
    btl.rpm!.pessoasAbordadas = { mesAnterior: 1462, atual: 1936, totalGeral: null };
    const a = montarApresentacao(await modelo(), [
      { dados: cia1(), prints: {} },
      { dados: racVazio('ft', '2026-09'), prints: {} },
      { dados: btl, prints: { foPainel: { jpeg: JPEG, largura: 1861, altura: 774 } } },
    ]);
    expect([...a.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).length).toBe(16 + 5 + 12);
    expect(txt(a, 'ppt/slides/slide22.xml')).toContain('RAC – Batalhão - ');
    const rpm = txt(a, 'ppt/slides/slide31.xml');
    for (const t of ['PRODUTIVIDADE RPM', 'Moto Abordada-(LÍCITO)', '<a:t>3398</a:t>', 'TOTAL GERAL']) expect(rpm).toContain(t);
    expect(txt(a, 'ppt/slides/slide29.xml')).toContain('r:embed="rIdPrint"'); // furto outros do Batalhão
  });
});

describe('arquivar o RAC GERAL', () => {
  test('nome do arquivo no Drive e base64 de arquivo grande (ida e volta)', () => {
    expect(nomeRacGeral('2026-09')).toBe('RAC GERAL - SETEMBRO-2026.pptx');
    const grande = new Uint8Array(300_000).map((_, i) => (i * 7919) % 256);
    expect(base64ParaBytes(bytesParaBase64(grande))).toEqual(grande);
  });
});
