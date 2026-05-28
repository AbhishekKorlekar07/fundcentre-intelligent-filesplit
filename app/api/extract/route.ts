import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { randomUUID } from 'node:crypto';
import { extractFromPdfBuffer, isLive } from '@/lib/extractor';
import { extractSinglePagePdf, getPageCount } from '@/lib/pdf';
import { groupPagesIntoDocuments } from '@/lib/boundary';
import { saveJob } from '@/lib/jobStore';
import { validateExtractedFields } from '@/lib/sourceOfTruth';
import type { PageExtraction, DocumentRow, ExtractResponse } from '@/lib/types';

function applyValidation(row: DocumentRow): DocumentRow {
  const result = validateExtractedFields({
    investorName: row.investorName,
    investorId: row.investorId,
    fundName: row.fundName,
    accountName: row.accountName,
  });
  // Lower confidence when any provided field failed validation, to nudge
  // the GP toward reviewing it first.
  let confidence = row.confidence;
  const v = result.validation;
  const failed = [v.investorName, v.investorId, v.fundName, v.accountName].filter((s) => s === 'not_found').length;
  if (failed > 0) confidence = Math.min(confidence, 0.5 - failed * 0.1);
  if (v.relationship === 'mismatch') confidence = Math.min(confidence, 0.4);

  return {
    ...row,
    investorName: result.investorName,
    investorId: result.investorId,
    fundName: result.fundName,
    accountName: result.accountName,
    investorExternalId: result.investorExternalId,
    fundExternalId: result.fundExternalId,
    accountExternalId: result.accountExternalId,
    confidence: Math.max(0, confidence),
    validation: result.validation,
  };
}

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const mode = formData.get('mode') as 'split-code' | 'no-split' | null;
  const file = formData.get('file') as File | null;

  if (!mode || !file) {
    return NextResponse.json({ error: 'mode and file are required' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const jobId = randomUUID();

  if (mode === 'split-code') {
    return await handleSplitCode(jobId, buffer);
  }
  return await handleNoSplit(jobId, buffer);
}

async function handleSplitCode(jobId: string, pdfBuffer: Buffer): Promise<NextResponse<ExtractResponse>> {
  const totalPages = await getPageCount(pdfBuffer);
  const pages: PageExtraction[] = [];

  // Cap at 25 pages for hackathon perf
  const cap = Math.min(totalPages, 25);

  // Process in parallel batches of 4 to keep API friendly
  const BATCH = 4;
  for (let i = 0; i < cap; i += BATCH) {
    const slice = Array.from({ length: Math.min(BATCH, cap - i) }, (_, k) => i + k);
    const results = await Promise.all(
      slice.map(async (idx) => {
        const pageBuf = await extractSinglePagePdf(pdfBuffer, idx);
        const meta = await extractFromPdfBuffer(pageBuf, { label: `page-${idx + 1}`, isSinglePage: true });
        return { ...meta, pageNumber: idx + 1 } as PageExtraction;
      })
    );
    pages.push(...results);
  }

  const rawRows = groupPagesIntoDocuments(pages);
  const rows = rawRows.map(applyValidation);
  saveJob(jobId, { mode: 'split-code', pdfBuffer, rows, totalPages });

  return NextResponse.json({
    mode: 'split-code',
    jobId,
    rows,
    totalPages,
    usingMock: !isLive(),
  });
}

async function handleNoSplit(jobId: string, zipBuffer: Buffer): Promise<NextResponse<ExtractResponse>> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const pdfEntries = Object.values(zip.files).filter((f) => !f.dir && f.name.toLowerCase().endsWith('.pdf'));

  const files: { path: string; buffer: Buffer }[] = [];
  for (const entry of pdfEntries) {
    const buf = Buffer.from(await entry.async('uint8array'));
    files.push({ path: entry.name, buffer: buf });
  }

  const cap = Math.min(files.length, 25);
  const sliced = files.slice(0, cap);

  const rows: DocumentRow[] = [];
  const BATCH = 4;
  for (let i = 0; i < sliced.length; i += BATCH) {
    const slice = sliced.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map(async (f, k) => {
        const meta = await extractFromPdfBuffer(f.buffer, { label: f.path });
        const idx = i + k + 1;
        const row: DocumentRow = {
          id: `doc-${idx}`,
          startPage: 1,
          endPage: 1,
          pageRange: '1',
          investorName: meta.investorName,
          investorId: meta.investorId,
          fundName: meta.fundName,
          accountName: meta.accountName,
          investorExternalId: null,
          fundExternalId: null,
          accountExternalId: null,
          classCode: meta.classCode,
          documentType: meta.documentType,
          confidence: meta.confidence,
          sourcePath: f.path,
        };
        return applyValidation(row);
      })
    );
    rows.push(...results);
  }

  saveJob(jobId, { mode: 'no-split', files, rows });

  return NextResponse.json({
    mode: 'no-split',
    jobId,
    rows,
    totalFiles: files.length,
    usingMock: !isLive(),
  });
}
