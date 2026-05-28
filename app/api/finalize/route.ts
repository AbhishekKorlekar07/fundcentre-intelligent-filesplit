import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { getJob, updateRows } from '@/lib/jobStore';
import { extractPageRangePdf } from '@/lib/pdf';
import type { DocumentRow } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { jobId: string; rows: DocumentRow[] };
  const job = getJob(body.jobId);
  if (!job) return NextResponse.json({ error: 'job not found' }, { status: 404 });

  updateRows(body.jobId, body.rows);

  if (job.mode === 'split-code') {
    const zip = new JSZip();
    for (const row of body.rows) {
      const pdf = await extractPageRangePdf(job.pdfBuffer, row.startPage, row.endPage);
      const safeInvestor = sanitize(row.investorName || 'Unknown');
      const safeFund = sanitize(row.fundName || 'Unknown');
      const safeType = sanitize(row.documentType || 'Document');
      // Flat structure: just filename at root level
      const filename = `${safeFund}_${safeInvestor}_${safeType}_p${row.pageRange}.pdf`;
      zip.file(filename, pdf);
    }
    const manifest = buildManifest(body.rows);
    zip.file('PRE_SPLIT_SPREADSHEET.xlsx', manifest);
    const out = await zip.generateAsync({ type: 'nodebuffer' });
    return new NextResponse(new Uint8Array(out), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="filesplit-${body.jobId.slice(0, 8)}.zip"`,
      },
    });
  }

  // no-split: produce the manifest xlsx in a zip along with original PDFs
  const manifest = buildManifest(body.rows);
  const zip = new JSZip();
  zip.file('PRE_SPLIT_SPREADSHEET.xlsx', manifest);

  // Add all uploaded PDF files to the zip at root level (no folders)
  if ('files' in job && job.files) {
    for (const file of job.files) {
      // Extract just the filename from the path (remove any folder structure)
      const filename = file.path.split('/').pop() || file.path;
      zip.file(filename, file.buffer);
    }
  }

  const out = await zip.generateAsync({ type: 'nodebuffer' });
  return new NextResponse(new Uint8Array(out), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="metadata-${body.jobId.slice(0, 8)}.zip"`,
    },
  });
}

function buildManifest(rows: DocumentRow[]): Buffer {
  const data = rows.map((r) => {
    const safeInvestor = sanitize(r.investorName || 'Unknown');
    const safeFund = sanitize(r.fundName || 'Unknown');
    const safeType = sanitize(r.documentType || 'Document');
    // Flat structure: underscore-separated filename at root level
    const filename = `${safeFund}_${safeInvestor}_${safeType}_p${r.pageRange}.pdf`;

    return {
      'FileName*': r.sourcePath ?? filename,
      'Investor Id': r.investorExternalId ?? '',
      'Account Id': r.accountExternalId ?? '',
      'Fund Id': r.fundExternalId ?? '',
      'Class Code': r.classCode ?? '',
    };
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  return buf;
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9 _.\-]/g, '_').replace(/\s+/g, '_').slice(0, 60) || 'Unknown';
}
