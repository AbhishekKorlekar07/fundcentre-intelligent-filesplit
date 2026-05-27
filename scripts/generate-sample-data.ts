/* eslint-disable no-console */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import path from 'node:path';

interface DocSpec {
  investor: string;
  investorId: string;
  fund: string;
  account: string;
  type: string;
  pages: number; // total pages including continuation
}

const DOCS: DocSpec[] = [
  { investor: 'John Smith', investorId: 'LP-1001', fund: 'ADFund2 LP', account: 'John Smith Family Trust', type: 'K-1', pages: 2 },
  { investor: 'Acme Capital Partners', investorId: 'LP-1002', fund: 'ADFund2 LP', account: 'Acme Capital Partners', type: 'Capital Statement', pages: 2 },
  { investor: 'Sarah Chen', investorId: 'LP-1003', fund: 'Bridgewater Growth Fund III', account: 'Chen Holdings LLC', type: 'Capital Call Notice', pages: 1 },
  { investor: 'Northgate Pension', investorId: 'LP-1004', fund: 'Bridgewater Growth Fund III', account: 'Northgate Master Account', type: 'Distribution Notice', pages: 2 },
  { investor: 'Highland Family Office', investorId: 'LP-1005', fund: 'Catalyst Opportunities IV', account: 'Highland Family Office', type: 'Quarterly Report', pages: 2 },
];

async function makePagePdf(spec: DocSpec, pageIdx: number, isFirst: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  if (isFirst) {
    page.drawText(spec.fund, { x: 50, y: 740, size: 18, font: bold, color: rgb(0.1, 0.15, 0.4) });
    page.drawText(`${spec.type}`, { x: 50, y: 715, size: 14, font: bold });
    page.drawText(`Investor: ${spec.investor}`, { x: 50, y: 685, size: 11, font });
    page.drawText(`Investor ID: ${spec.investorId}`, { x: 50, y: 670, size: 11, font });
    page.drawText(`Account: ${spec.account}`, { x: 50, y: 655, size: 11, font });
    page.drawText(`As of: 2026-03-31`, { x: 50, y: 640, size: 11, font });
    page.drawText('Summary', { x: 50, y: 600, size: 13, font: bold });
    page.drawText('Beginning balance ........................ $1,250,000.00', { x: 50, y: 580, size: 10, font });
    page.drawText('Contributions ............................. $   50,000.00', { x: 50, y: 565, size: 10, font });
    page.drawText('Distributions ............................. $  (12,500.00)', { x: 50, y: 550, size: 10, font });
    page.drawText('Ending balance ............................ $1,287,500.00', { x: 50, y: 535, size: 10, font });
  } else {
    page.drawText(`(continued from previous page — ${spec.investor})`, { x: 50, y: 740, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText('Detail of activity', { x: 50, y: 700, size: 13, font: bold });
    for (let i = 0; i < 8; i++) {
      page.drawText(`2026-0${(i % 9) + 1}-15   Activity line ${i + 1} ........... $ ${(1000 * (i + 1)).toLocaleString()}.00`, {
        x: 50, y: 680 - i * 15, size: 10, font,
      });
    }
  }

  page.drawText(`Page ${pageIdx + 1}`, { x: 530, y: 30, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  return await doc.save();
}

async function buildCombinedPdf(): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  let pageCounter = 0;
  for (const spec of DOCS) {
    for (let p = 0; p < spec.pages; p++) {
      const pageBytes = await makePagePdf(spec, pageCounter, p === 0);
      const src = await PDFDocument.load(pageBytes);
      const [copied] = await out.copyPages(src, [0]);
      out.addPage(copied);
      pageCounter++;
    }
  }
  return await out.save();
}

async function buildPresplitZip(): Promise<Buffer> {
  const zip = new JSZip();
  for (const spec of DOCS) {
    const pdf = await PDFDocument.create();
    for (let p = 0; p < spec.pages; p++) {
      const pageBytes = await makePagePdf(spec, p, p === 0);
      const src = await PDFDocument.load(pageBytes);
      const [copied] = await pdf.copyPages(src, [0]);
      pdf.addPage(copied);
    }
    const bytes = await pdf.save();
    const safe = `${spec.fund.replace(/\W+/g, '_')}/${spec.investor.replace(/\W+/g, '_')}_${spec.type.replace(/\W+/g, '_')}.pdf`;
    zip.file(safe, bytes);
  }
  return await zip.generateAsync({ type: 'nodebuffer' });
}

async function main() {
  const dir = path.join(process.cwd(), 'sample-data');
  await fs.mkdir(dir, { recursive: true });

  const combined = await buildCombinedPdf();
  await fs.writeFile(path.join(dir, 'combined.pdf'), combined);
  console.log(`✓ wrote sample-data/combined.pdf (${combined.length} bytes)`);

  const zip = await buildPresplitZip();
  await fs.writeFile(path.join(dir, 'presplit.zip'), zip);
  console.log(`✓ wrote sample-data/presplit.zip (${zip.length} bytes)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
