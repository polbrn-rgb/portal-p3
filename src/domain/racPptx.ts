import { corVariacao, nomeUnidadeRac, rotuloMesLongo, tabelasDoRac, textoVariacao, type LinhaRpm, type RacDados, type RpmId, type Tabela } from './rac';
import type { SlotPrint } from './racPrints';

// RAC → apresentação (.pptx) a partir do "Modelo RAC - MES26.pptx" da P/3 (public/rac/modelo-rac.pptx).
// O modelo tem 16 slides; cada slide do RAC é uma cópia de um deles com o título, a tabela ou o print trocados.
// Para compilar várias unidades, basta juntar os planos de slides (cada unidade repete os slides do modelo).

export type Arquivos = Map<string, Uint8Array>;
export type ImagemPrint = { jpeg: Uint8Array; largura: number; altura: number };
export type RacParaSlides = { dados: RacDados; prints: Partial<Record<SlotPrint, ImagemPrint>>; rpmAnterior?: Record<RpmId, LinhaRpm> };

type PlanoSlide = { base: number; titulo?: true; tabela?: Tabela['id']; print?: SlotPrint; trocarTitulo?: [string, string] };

/** Slides de cada unidade, na ordem da apresentação (números = slides do modelo). */
export function planoDeSlides(d: RacDados): PlanoSlide[] {
  const producao: PlanoSlide[] = [{ base: 13 }, { base: 14, tabela: 'pelotao' }, { base: 15, tabela: 'prodMensal' }, { base: 16, tabela: 'prodAnual' }];
  // Força Tática: a tabela por pelotão tem as 14 linhas, então usa o slide de 14 linhas do modelo.
  // Batalhão: como o RAC BTL (sem inconsistências, só os 4 painéis, Produtividade RPM no lugar da por pelotão).
  if (d.unidade === 'btl')
    return [
      { base: 1, titulo: true },
      { base: 2, tabela: 'anual' },
      { base: 4, tabela: 'trimestral' },
      { base: 5 },
      { base: 6, print: 'rvPainel' },
      { base: 8, print: 'fvPainel' },
      { base: 10, print: 'roPainel' },
      { base: 12, print: 'foPainel' },
      { base: 13 },
      { base: 14, tabela: 'rpm', trocarTitulo: ['PRODUTIVIDADE MENSAL', 'PRODUTIVIDADE RPM'] },
      { base: 15, tabela: 'prodMensal' },
      { base: 16, tabela: 'prodAnual' },
    ];
  if (d.unidade === 'ft')
    return [
      { base: 1, titulo: true },
      { base: 13 },
      { base: 15, tabela: 'pelotao', trocarTitulo: ['COMPARATIVO PRODUTIVIDADE MENSAL', 'PRODUTIVIDADE MENSAL'] },
      { base: 15, tabela: 'prodMensal' },
      { base: 16, tabela: 'prodAnual' },
    ];
  return [
    { base: 1, titulo: true },
    { base: 2, tabela: 'anual' },
    { base: 3, tabela: 'inconsistencias' },
    { base: 4, tabela: 'trimestral' },
    { base: 5 },
    { base: 6, print: 'rvPainel' },
    { base: 7, print: 'rvMapa' },
    { base: 8, print: 'fvPainel' },
    { base: 9, print: 'fvMapa' },
    { base: 10, print: 'roPainel' },
    { base: 11, print: 'roMapa' },
    { base: 12, print: 'foPainel' },
    ...producao,
  ];
}

/** Título de cada slide do modelo (para a pré-visualização na tela). */
export const TITULO_DO_SLIDE: Record<number, string> = {
  5: 'INDICADORES CRIMINAIS',
  6: 'ROUBO DE VEÍCULOS',
  7: 'ROUBO DE VEÍCULOS',
  8: 'FURTO DE VEÍCULOS',
  9: 'FURTO DE VEÍCULOS',
  10: 'ROUBO OUTROS',
  11: 'ROUBO OUTROS',
  12: 'FURTO OUTROS',
  13: 'PRODUTIVIDADE POLICIAL',
};

export const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- tabelas ----------

const RE_PPR = /<a:pPr[^>]*\/>|<a:pPr[^>]*>[\s\S]*?<\/a:pPr>/;
const RE_END = /<a:endParaRPr[^>]*\/>|<a:endParaRPr[^>]*>[\s\S]*?<\/a:endParaRPr>/;
const RE_RPR = /<a:rPr[^>]*\/>|<a:rPr[^>]*>[\s\S]*?<\/a:rPr>/;

/**
 * Troca o texto da célula mantendo a formatação do modelo (a do texto, a dada ou a do fim de parágrafo),
 * centralizado na horizontal e na vertical como nos slides das Cias.
 */
export function textoNaCelula(tc: string, texto: string, rPrFixo?: string): string {
  const pPrModelo = RE_PPR.exec(tc)?.[0] ?? '<a:pPr/>';
  const pPr = /\balgn="/.test(pPrModelo) ? pPrModelo.replace(/\balgn="[a-z]+"/, 'algn="ctr"') : pPrModelo.replace('<a:pPr', '<a:pPr algn="ctr"');
  const fim = RE_END.exec(tc)?.[0] ?? '<a:endParaRPr lang="pt-BR"/>';
  const rPr = rPrFixo ?? RE_RPR.exec(tc)?.[0] ?? fim.replace('<a:endParaRPr', '<a:rPr').replace('</a:endParaRPr>', '</a:rPr>');
  const p = `<a:p>${pPr}<a:r>${rPr}<a:t>${esc(texto)}</a:t></a:r>${fim}</a:p>`;
  const ancorado = /<a:tcPr[^>]*\banchor="/.test(tc) ? tc.replace(/(<a:tcPr[^>]*\b)anchor="[a-z]+"/, '$1anchor="ctr"') : tc.replace('<a:tcPr', '<a:tcPr anchor="ctr"');
  return ancorado.replace(/<a:txBody>[\s\S]*?<\/a:txBody>/, `<a:txBody><a:bodyPr/><a:lstStyle/>${p}</a:txBody>`);
}
/** Cor de fundo da célula (o preenchimento que fica depois das bordas). */
export function fundoDaCelula(tc: string, hex: string): string {
  return tc.replace(/(<\/a:lnB>)<a:solidFill><a:srgbClr val="[0-9A-Fa-f]{6}"\/><\/a:solidFill>/, `$1<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`);
}

const SEM_BASE = 'BFBFBF'; // Var % sem base (—)
const ALTURA_SLIDE = 5143500;
const MARGEM_BAIXO = 220000;

const formatar = (v: number | null) => (v === null ? '—' : String(v));

/** Monta a tabela do slide a partir da tabela do modelo: mesmas cores, bordas e fontes; linhas e colunas do RAC. */
export function construirTabela(tblModelo: string, t: Tabela, topo: number): { xml: string; largura: number; altura: number } {
  const tblPr = /<a:tblPr>[\s\S]*?<\/a:tblPr>|<a:tblPr[^>]*\/>/.exec(tblModelo)?.[0] ?? '<a:tblPr/>';
  const larguras = [...tblModelo.matchAll(/<a:gridCol w="(\d+)"/g)].map((m) => Number(m[1]));
  const linhas = [...tblModelo.matchAll(/<a:tr h="(\d+)">([\s\S]*?)<\/a:tr>/g)].map((m) => ({
    h: Number(m[1]),
    celulas: [...m[2].matchAll(/<a:tc>[\s\S]*?<\/a:tc>/g)].map((c) => c[0].replace(/<a:extLst>[\s\S]*?<\/a:extLst>/g, '')),
  }));
  const n = t.cabecalho.length;
  const total = larguras.reduce((s, w) => s + w, 0);
  const primeira = Math.max(larguras[0], Math.round(total * 0.3));
  const cols = n === larguras.length ? larguras : [primeira, ...Array.from({ length: n - 1 }, () => Math.floor((total - primeira) / (n - 1)))];
  const qtd = t.linhas.length + 1;
  const h = Math.min(linhas[0].h, Math.floor((ALTURA_SLIDE - topo - MARGEM_BAIXO) / qtd));
  // Fonte única no corpo (a do primeiro texto do modelo), como nas tabelas preenchidas à mão.
  const rPrCorpo = linhas.slice(1).flatMap((l) => l.celulas).map((c) => RE_RPR.exec(c)?.[0]).find(Boolean);
  const molde = (celulas: string[], j: number) => (j === 0 ? celulas[0] : j === n - 1 ? celulas[celulas.length - 1] : celulas[Math.min(j, celulas.length - 2)]);

  const cab = t.cabecalho.map((c, j) => textoNaCelula(molde(linhas[0].celulas, j), c)).join('');
  const corpo = t.linhas
    .map((l, i) => {
      const modelo = linhas[1 + (i % Math.max(1, Math.min(2, linhas.length - 1)))].celulas;
      const celulas = Array.from({ length: n }, (_, j) => {
        let tc = molde(modelo, j);
        if (j === 0) return textoNaCelula(tc, l.rotulo, rPrCorpo);
        const ehVar = t.tipoVar && j === n - 1;
        if (!ehVar) {
          // Última coluna sem Var % (ex.: TOTAL) num modelo que tinha Var %: fundo igual ao das outras células.
          if (j === n - 1 && !t.tipoVar) {
            const fundo = /<\/a:lnB><a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(molde(modelo, 1))?.[1];
            if (fundo) tc = fundoDaCelula(tc, fundo);
          }
          return textoNaCelula(tc, formatar(l.valores[j - 1] ?? null), rPrCorpo);
        }
        const v = l.variacao ?? null;
        tc = fundoDaCelula(tc, corVariacao(v, t.tipoVar!) ?? SEM_BASE);
        return textoNaCelula(tc, textoVariacao(v), rPrCorpo);
      });
      return `<a:tr h="${h}">${celulas.join('')}</a:tr>`;
    })
    .join('');
  const grade = `<a:tblGrid>${cols.map((w) => `<a:gridCol w="${w}"/>`).join('')}</a:tblGrid>`;
  return { xml: `<a:tbl>${tblPr}${grade}<a:tr h="${h}">${cab}</a:tr>${corpo}</a:tbl>`, largura: cols.reduce((s, w) => s + w, 0), altura: h * qtd };
}

const TOPO_TABELA_ALTA = 880300; // como nos slides de comparativo de produtividade (título no alto)
const TOPO_TITULO_ALTO = 37344;
const ALTURA_MINIMA_LINHA = 285000; // altura real de uma linha com o texto do modelo

function trocarTabela(slide: string, t: Tabela): string {
  const tbl = /<a:tbl>[\s\S]*<\/a:tbl>/.exec(slide)?.[0];
  const pos = /<p:graphicFrame>[\s\S]*?<a:off x="(\d+)" y="(\d+)"\/>/.exec(slide);
  if (!tbl || !pos) return slide;
  let topo = Number(pos[2]);
  // Tabela que não cabe (ex.: Força Tática com 14 linhas no slide de 10): sobe a tabela e o título.
  if (topo > TOPO_TABELA_ALTA && topo + (t.linhas.length + 1) * ALTURA_MINIMA_LINHA > ALTURA_SLIDE - MARGEM_BAIXO) {
    topo = TOPO_TABELA_ALTA;
    slide = slide.replace(/(<p:sp>[\s\S]*?<p:ph[^>]*type="title"[\s\S]*?<a:off x="\d+" y=")\d+(")/, `$1${TOPO_TITULO_ALTO}$2`);
  }
  const { xml, largura, altura } = construirTabela(tbl, t, topo);
  return slide
    .replace(tbl, () => xml)
    .replace(/(<p:graphicFrame>[\s\S]*?<a:off x="\d+" y=")\d+("\/>)<a:ext cx="\d+" cy="\d+"\/>/, `$1${topo}$2<a:ext cx="${largura}" cy="${altura}"/>`);
}

// ---------- prints ----------

const CAIXA_PRINT = { x: 228600, y: 975000, largura: 8686800, altura: 4050000 };
const SLIDE = { largura: 9144000, altura: 5143500 }; // tamanho do slide do modelo (16:9)

/** A imagem ocupa o slide inteiro, de ponta a ponta, esticada (sem cortes). */
export function encaixarPrint() {
  return { x: 0, y: 0, cx: SLIDE.largura, cy: SLIDE.altura };
}

function comPrint(slide: string, rId: string): string {
  const { x, y, cx, cy } = encaixarPrint();
  const pic =
    `<p:pic><p:nvPicPr><p:cNvPr id="9001" name="Print do painel"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  return slide.replace('</p:spTree>', `${pic}</p:spTree>`);
}

function semPrint(slide: string): string {
  const caixa =
    `<p:sp><p:nvSpPr><p:cNvPr id="9002" name="Print não enviado"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${CAIXA_PRINT.x}" y="2300000"/><a:ext cx="${CAIXA_PRINT.largura}" cy="500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="pt-BR" sz="2000" b="1"><a:solidFill><a:srgbClr val="CC0000"/></a:solidFill></a:rPr><a:t>Print não enviado</a:t></a:r></a:p></p:txBody></p:sp>`;
  return slide.replace('</p:spTree>', `${caixa}</p:spTree>`);
}

/** Largura e altura de um JPEG (lidas no cabeçalho SOF). */
export function dimensoesJpeg(b: Uint8Array): { largura: number; altura: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marca = b[i + 1];
    const tam = (b[i + 2] << 8) | b[i + 3];
    if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc)
      return { altura: (b[i + 5] << 8) | b[i + 6], largura: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + tam;
  }
  return null;
}

// ---------- pacote ----------

const enc = new TextEncoder();
const dec = new TextDecoder();
const ler = (a: Arquivos, nome: string) => dec.decode(a.get(nome) ?? new Uint8Array());
const TIPO_SLIDE = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml';
const REL_SLIDE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
const REL_IMAGEM = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

/** Nome do arquivo baixado: "RAC 1ª Cia - SETEMBRO-2026.pptx" (compilado: "RAC GERAL - SETEMBRO-2026.pptx"). */
export const nomeArquivoRac = (titulo: string, mes: string) => `RAC ${titulo} - ${rotuloMesLongo(mes).replace('/', '-')}.pptx`;

/**
 * Monta a apresentação de uma ou mais unidades (na ordem dada) a partir dos arquivos do modelo.
 * Devolve os arquivos do novo .pptx (para zipar).
 */
export function montarApresentacao(modelo: Arquivos, unidades: readonly RacParaSlides[]): Arquivos {
  const out: Arquivos = new Map([...modelo].filter(([n]) => !/^ppt\/(slides|notesSlides)\//.test(n)));
  const slides: string[] = [];
  let img = 0;
  for (const u of unidades) {
    const tabelas = tabelasDoRac(u.dados, u.rpmAnterior);
    for (const plano of planoDeSlides(u.dados)) {
      let xml = ler(modelo, `ppt/slides/slide${plano.base}.xml`);
      let rels = ler(modelo, `ppt/slides/_rels/slide${plano.base}.xml.rels`).replace(/<Relationship [^>]*notesSlide[^>]*\/>/g, '');
      if (plano.titulo)
        xml = xml
          .replace('<a:t>RAC – xª Cia - </a:t>', `<a:t>${esc(`RAC – ${nomeUnidadeRac(u.dados.unidade)} - `)}</a:t>`)
          .replace('<a:t>Mes/Ano Referência</a:t>', `<a:t>${esc(rotuloMesLongo(u.dados.mes))}</a:t>`);
      if (plano.trocarTitulo) xml = xml.replace(`<a:t>${plano.trocarTitulo[0]}</a:t>`, `<a:t>${esc(plano.trocarTitulo[1])}</a:t>`);
      if (plano.tabela) {
        const t = tabelas.find((x) => x.id === plano.tabela);
        if (t) xml = trocarTabela(xml, t);
      }
      if (plano.print) {
        const p = u.prints[plano.print];
        if (p) {
          const nome = `rac_print_${++img}.jpeg`;
          out.set(`ppt/media/${nome}`, p.jpeg);
          rels = rels.replace('</Relationships>', `<Relationship Id="rIdPrint" Type="${REL_IMAGEM}" Target="../media/${nome}"/></Relationships>`);
          xml = comPrint(xml, 'rIdPrint');
        } else xml = semPrint(xml);
      }
      slides.push(xml);
      const i = slides.length;
      out.set(`ppt/slides/slide${i}.xml`, enc.encode(xml));
      out.set(`ppt/slides/_rels/slide${i}.xml.rels`, enc.encode(rels));
    }
  }

  const ids = slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rIdRac${i + 1}"/>`).join('');
  out.set('ppt/presentation.xml', enc.encode(ler(modelo, 'ppt/presentation.xml').replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>${ids}</p:sldIdLst>`)));
  const relsPres = ler(modelo, 'ppt/_rels/presentation.xml.rels')
    .replace(new RegExp(`<Relationship [^>]*Type="${REL_SLIDE}"[^>]*/>`, 'g'), '')
    .replace('</Relationships>', `${slides.map((_, i) => `<Relationship Id="rIdRac${i + 1}" Type="${REL_SLIDE}" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>`);
  out.set('ppt/_rels/presentation.xml.rels', enc.encode(relsPres));
  let tipos = ler(modelo, '[Content_Types].xml').replace(/<Override [^>]*PartName="\/ppt\/(slides|notesSlides)\/[^"]*"[^>]*\/>/g, '');
  if (!/Extension="jpeg"/.test(tipos)) tipos = tipos.replace('</Types>', '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>');
  tipos = tipos.replace('</Types>', `${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${TIPO_SLIDE}"/>`).join('')}</Types>`);
  out.set('[Content_Types].xml', enc.encode(tipos));
  return out;
}
