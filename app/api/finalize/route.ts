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
      const filename = `${safeFund}/${safeInvestor}/${safeType}_p${row.pageRange}.pdf`;
      zip.file(filename, pdf);
    }
    const manifest = buildManifest(body.rows);
    zip.file('manifest.xlsx', manifest);
    const out = await zip.generateAsync({ type: 'nodebuffer' });
    return new NextResponse(new Uint8Array(out), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="filesplit-${body.jobId.slice(0, 8)}.zip"`,
      },
    });
  }

  // no-split: just produce the manifest xlsx
  const manifest = buildManifest(body.rows);
  return new NextResponse(new Uint8Array(manifest), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="manifest-${body.jobId.slice(0, 8)}.xlsx"`,
    },
  });
}

function buildManifest(rows: DocumentRow[]): Buffer {
  const data = rows.map((r) => ({
    'Investor Name': r.investorName ?? '',
    'Investor ID': r.investorId ?? '',
    'Fund Name': r.fundName ?? '',
    'Account Name': r.accountName ?? '',
    'Document Type': r.documentType ?? '',
    'Page Range': r.pageRange,
    'Source Path': r.sourcePath ?? '',
    Confidence: r.confidence,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Manifest');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  return buf;
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9 _.\-]/g, '_').replace(/\s+/g, '_').slice(0, 60) || 'Unknown';
}
