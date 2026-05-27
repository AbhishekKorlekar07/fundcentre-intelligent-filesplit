import { PDFDocument } from 'pdf-lib';

export async function extractSinglePagePdf(pdfBytes: Uint8Array, pageIndex: number): Promise<Buffer> {
  const src = await PDFDocument.load(pdfBytes);
  const out = await PDFDocument.create();
  const [copied] = await out.copyPages(src, [pageIndex]);
  out.addPage(copied);
  const bytes = await out.save();
  return Buffer.from(bytes);
}

export async function getPageCount(pdfBytes: Uint8Array): Promise<number> {
  const src = await PDFDocument.load(pdfBytes);
  return src.getPageCount();
}

export async function extractPageRangePdf(
  pdfBytes: Uint8Array,
  startPage1Based: number,
  endPage1Based: number
): Promise<Buffer> {
  const src = await PDFDocument.load(pdfBytes);
  const out = await PDFDocument.create();
  const indices: number[] = [];
  for (let i = startPage1Based - 1; i <= endPage1Based - 1; i++) indices.push(i);
  const copied = await out.copyPages(src, indices);
  copied.forEach((p) => out.addPage(p));
  const bytes = await out.save();
  return Buffer.from(bytes);
}
