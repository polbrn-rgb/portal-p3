import type { Firestore } from 'firebase/firestore';
import { lerImagemPrint } from '../data/racPrints';
import { ordemDoCompilado, rotuloMesLongo, type LinhaRpm, type RacDados, type RacSalvo, type RpmId } from '../domain/rac';
import { dimensoesJpeg, montarApresentacao, nomeArquivoRac, type ImagemPrint, type RacParaSlides } from '../domain/racPptx';
import { idPrint, slotsDaUnidade, type SlotPrint } from '../domain/racPrints';
import { base64ParaBytes } from './imagem';
import { zip } from './xlsx';
import { deszipar, type ArquivosZip } from './zipLeitura';

// Gera e baixa o .pptx do RAC no próprio aparelho (modelo em public/rac/modelo-rac.pptx).

let modelo: Promise<ArquivosZip> | undefined;
function carregarModelo(): Promise<ArquivosZip> {
  modelo ??= fetch('/rac/modelo-rac.pptx')
    .then((r) => {
      if (!r.ok) throw new Error('Modelo do RAC não encontrado');
      return r.arrayBuffer();
    })
    .then((b) => deszipar(new Uint8Array(b)))
    .catch((e) => {
      modelo = undefined;
      throw e;
    });
  return modelo;
}

/** Os prints (em tamanho cheio) que a unidade já enviou; os que faltam ficam de fora. */
export async function imagensDoRac(db: Firestore, d: RacDados): Promise<Partial<Record<SlotPrint, ImagemPrint>>> {
  const saida: Partial<Record<SlotPrint, ImagemPrint>> = {};
  const u = d.unidade;
  await Promise.all(
    slotsDaUnidade(d.unidade).map(async (s) => {
      try {
        const jpeg = base64ParaBytes(await lerImagemPrint(db, idPrint(d.mes, u, s.id)));
        const dim = dimensoesJpeg(jpeg);
        if (dim) saida[s.id] = { jpeg, ...dim };
      } catch {
        /* print não enviado: o slide avisa */
      }
    }),
  );
  return saida;
}

export async function gerarPptx(unidades: RacParaSlides[]): Promise<Uint8Array> {
  const arquivos = montarApresentacao(await carregarModelo(), unidades);
  return zip([...arquivos].map(([nome, dados]) => ({ nome, dados })));
}

export function baixarArquivo(nome: string, dados: Uint8Array, tipo = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'): void {
  const url = URL.createObjectURL(new Blob([dados as BlobPart], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Baixa o RAC de uma unidade (com o que estiver preenchido; o que falta sai como "—"). */
export async function baixarRacDaUnidade(db: Firestore, d: RacDados, titulo: string, rpmAnterior?: Record<RpmId, LinhaRpm>): Promise<void> {
  const prints = await imagensDoRac(db, d);
  baixarArquivo(nomeArquivoRac(titulo, d.mes), await gerarPptx([{ dados: d, prints, rpmAnterior }]));
}

/** RAC GERAL: as Cias e a FT que enviaram, na ordem oficial, e o Batalhão no fim — um .pptx só. */
export async function baixarRacGeral(db: Firestore, mes: string, racs: readonly RacSalvo[], rpmAnterior?: Record<RpmId, LinhaRpm>): Promise<void> {
  const unidades = await Promise.all(
    ordemDoCompilado(racs, mes).map(async (dados) => ({ dados, prints: await imagensDoRac(db, dados), rpmAnterior: dados.unidade === 'btl' ? rpmAnterior : undefined })),
  );
  baixarArquivo(`RAC GERAL - ${rotuloMesLongo(mes).replace('/', '-')}.pptx`, await gerarPptx(unidades));
}
