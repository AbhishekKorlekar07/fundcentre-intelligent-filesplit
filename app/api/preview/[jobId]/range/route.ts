import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/jobStore';
import { extractPageRangePdf } from '@/lib/pdf';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const job = getJob(params.jobId);
  if (!job) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 });
  }
  if (job.mode !== 'split-code') {
    return NextResponse.json({ error: 'range preview is only valid for split-code jobs' }, { status: 400 });
  }

  const start = parseInt(req.nextUrl.searchParams.get('start') ?? '', 10);
  const end = parseInt(req.nextUrl.searchParams.get('end') ?? '', 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) {
    return NextResponse.json({ error: 'invalid start/end' }, { status: 400 });
  }
  if (end > job.totalPages) {
    return NextResponse.json({ error: 'end exceeds totalPages' }, { status: 400 });
  }

  const buf = await extractPageRangePdf(job.pdfBuffer, start, end);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="pages-${start}-${end}.pdf"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
