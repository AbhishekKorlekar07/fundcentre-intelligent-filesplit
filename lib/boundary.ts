import type { PageExtraction, DocumentRow } from './types';

/**
 * Group consecutive pages into documents. A new document starts at any page
 * where isContinuation=false. Continuation pages inherit the prior doc's
 * metadata.
 */
export function groupPagesIntoDocuments(pages: PageExtraction[]): DocumentRow[] {
  const rows: DocumentRow[] = [];
  let current: DocumentRow | null = null;

  for (const p of pages) {
    if (!p.isContinuation || current === null) {
      if (current) {
        current.endPage = current.endPage; // finalize
        current.pageRange = formatRange(current.startPage, current.endPage);
      }
      current = {
        id: `doc-${rows.length + 1}`,
        startPage: p.pageNumber,
        endPage: p.pageNumber,
        pageRange: `${p.pageNumber}`,
        investorName: p.investorName,
        investorId: p.investorId,
        fundName: p.fundName,
        accountName: p.accountName,
        investorExternalId: null,
        fundExternalId: null,
        accountExternalId: null,
        classCode: p.classCode,
        documentType: p.documentType,
        confidence: p.confidence,
      };
      rows.push(current);
    } else {
      current.endPage = p.pageNumber;
      current.pageRange = formatRange(current.startPage, current.endPage);
      current.confidence = Math.min(current.confidence, p.confidence);
    }
  }

  return rows;
}

function formatRange(start: number, end: number): string {
  return start === end ? `${start}` : `${start}–${end}`;
}
