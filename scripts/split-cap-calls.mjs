import { PDFDocument } from 'pdf-lib';
import fs from 'node:fs/promises';
import path from 'node:path';

const src = 'sample-data/Cap Calls.pdf';
const outDir = 'sample-data/cap-calls-split';

const labels = [
  'cap-call-page-1-harbour-trust.pdf',
  'cap-call-page-2-alaska-permanent.pdf',
  'cap-call-page-3-alaska-permanent.pdf',
  'cap-call-page-4-liberty-insurance.pdf',
  'cap-call-page-5-liberty-insurance.pdf',
];

const bytes = await fs.readFile(src);
const doc = await PDFDocument.load(bytes);
const pageCount = doc.getPageCount();

if (pageCount !== 5) {
  console.warn(`Expected 5 pages, got ${pageCount} — will split all of them.`);
}

await fs.mkdir(outDir, { recursive: true });

for (let i = 0; i < pageCount; i++) {
  const out = await PDFDocument.create();
  const [page] = await out.copyPages(doc, [i]);
  out.addPage(page);
  const buf = await out.save();
  const name = labels[i] ?? `cap-call-page-${i + 1}.pdf`;
  await fs.writeFile(path.join(outDir, name), buf);
  console.log(`wrote ${name}`);
}
