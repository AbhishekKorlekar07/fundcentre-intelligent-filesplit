import type { DocumentRow } from './types';

interface SplitCodeJob {
  mode: 'split-code';
  pdfBuffer: Buffer;
  rows: DocumentRow[];
  totalPages: number;
}

interface NoSplitJob {
  mode: 'no-split';
  files: { path: string; buffer: Buffer }[];
  rows: DocumentRow[];
}

export type Job = SplitCodeJob | NoSplitJob;

declare global {
  // eslint-disable-next-line no-var
  var __fundcentreJobStore: Map<string, Job> | undefined;
}

const store: Map<string, Job> = globalThis.__fundcentreJobStore ?? new Map<string, Job>();
if (!globalThis.__fundcentreJobStore) {
  globalThis.__fundcentreJobStore = store;
}

export function saveJob(id: string, job: Job) {
  store.set(id, job);
}

export function getJob(id: string): Job | undefined {
  return store.get(id);
}

export function updateRows(id: string, rows: DocumentRow[]) {
  const job = store.get(id);
  if (!job) return;
  job.rows = rows;
}
