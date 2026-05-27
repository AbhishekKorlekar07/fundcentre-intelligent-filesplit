/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { extractFromPdfBuffer, backendName } from '../lib/extractor';

async function main() {
  console.log('backend:', backendName());
  const pdf = fs.readFileSync(path.join(process.cwd(), 'sample-data', 'combined.pdf'));
  // Send only the first page to keep the probe fast/cheap.
  const { extractSinglePagePdf } = await import('../lib/pdf');
  const page1 = await extractSinglePagePdf(pdf, 0);
  const meta = await extractFromPdfBuffer(page1, { label: 'page-1', isSinglePage: true });
  console.log('extracted:', meta);
}

main().catch((e) => {
  console.error('PROBE FAILED:', e?.message ?? e);
  console.error(e);
  process.exit(1);
});
