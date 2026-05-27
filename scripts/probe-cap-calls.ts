/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { extractFromPdfBuffer, backendName } from '../lib/extractor';
import { extractSinglePagePdf, getPageCount } from '../lib/pdf';
import { validateExtractedFields } from '../lib/sourceOfTruth';

async function main() {
  console.log('backend:', backendName());
  const pdf = fs.readFileSync(path.join(process.cwd(), 'sample-data', 'Cap Calls.pdf'));
  const total = await getPageCount(pdf);
  console.log(`pages: ${total}\n`);

  const expected = [
    'Habour Trust Group',
    'Alaska Permanent',
    'Alaska Permanent',
    'Liberty Insurance',
    'Liberty Insurance',
  ];

  for (let i = 0; i < total; i++) {
    const buf = await extractSinglePagePdf(pdf, i);
    const meta = await extractFromPdfBuffer(buf, { label: `page-${i + 1}`, isSinglePage: true });
    const validated = validateExtractedFields({
      investorName: meta.investorName,
      investorId: meta.investorId,
      fundName: meta.fundName,
      accountName: meta.accountName,
    });
    const ok = validated.investorName === expected[i];
    console.log(`page ${i + 1}  ${ok ? '✓' : '✗ EXPECTED ' + expected[i]}`);
    console.log('  raw      :', { name: meta.investorName, id: meta.investorId, fund: meta.fundName });
    console.log('  validated:', { name: validated.investorName, fund: validated.fundName, account: validated.accountName });
    console.log('  flags    :', validated.validation);
    console.log();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
