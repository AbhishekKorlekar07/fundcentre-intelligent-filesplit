import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/jobStore';
import { extractSinglePagePdf } from '@/lib/pdf';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string; pageNumber: string } }
) {
  const job = getJob(params.jobId);
  if (!job) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 });
  }

  const pageNumber = parseInt(params.pageNumber, 10);
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return NextResponse.json({ error: 'invalid pageNumber' }, { status: 400 });
  }

  if (job.mode === 'split-code') {
    if (pageNumber > job.totalPages) {
      return NextResponse.json({ error: 'pageNumber out of range' }, { status: 400 });
    }
    const pageBuf = await extractSinglePagePdf(job.pdfBuffer, pageNumber - 1);
    return new NextResponse(new Uint8Array(pageBuf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="page-${pageNumber}.pdf"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  }

  // no-split: ?path=<sourcePath> picks the file; pageNumber is always 1.
  const sourcePath = req.nextUrl.searchParams.get('path');
  if (!sourcePath) {
    return NextResponse.json({ error: 'path query param required for no-split mode' }, { status: 400 });
  }
  const file = job.files.find((f) => f.path === sourcePath);
  if (!file) {
    return NextResponse.json({ error: 'file not found in job' }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(sourcePath)}"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
