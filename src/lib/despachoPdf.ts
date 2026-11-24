import { cabecalhoDespacho, nomeArquivoDespacho, type DespachoCgp } from '../domain/despacho';

// PDF do despacho (A4, pronto para imprimir). O jsPDF só é carregado quando alguém baixa.

export async function baixarDespachoPdf(d: DespachoCgp): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const margem = 25;
  const largura = 210 - margem * 2;
  let y = 30;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('DESPACHO', 105, y, { align: 'center' });
  y += 6;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(pdf.splitTextToSize(`${d.numero} — ${d.titulo}`, largura), 105, y, { align: 'center' });
  y += 14;

  pdf.setFontSize(12);
  for (const linha of cabecalhoDespacho(d.unidadeId, d.data, d.pelotao)) {
    pdf.text(linha, margem, y);
    y += 7;
  }
  y += 5;

  const corpo = pdf.splitTextToSize(d.texto, largura) as string[];
  for (const linha of corpo) {
    if (y > 240) {
      pdf.addPage();
      y = 25;
    }
    pdf.text(linha, margem, y);
    y += 6;
  }

  // Assinatura (desenhada com o dedo) sobre a linha do assinante, centralizada.
  if (y > 225) {
    pdf.addPage();
    y = 25;
  }
  y += 12;
  const props = pdf.getImageProperties(d.assinatura);
  const alt = 22;
  const larg = Math.min(80, (props.width / props.height) * alt);
  pdf.addImage(d.assinatura, 'PNG', 105 - larg / 2, y, larg, alt);
  y += alt + 2;
  pdf.line(105 - 40, y, 105 + 40, y);
  y += 6;
  pdf.text(d.assinante, 105, y, { align: 'center' });

  pdf.save(nomeArquivoDespacho(d));
}
