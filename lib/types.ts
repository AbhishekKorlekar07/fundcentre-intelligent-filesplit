export type DocumentType =
  | 'K-1'
  | 'Capital Statement'
  | 'Capital Call Notice'
  | 'Distribution Notice'
  | 'Quarterly Report'
  | 'Annual Report'
  | 'Other';

export interface ExtractedMetadata {
  investorName: string | null;
  investorId: string | null;
  fundName: string | null;
  accountName: string | null;
  documentType: DocumentType | null;
  isContinuation: boolean;
  confidence: number;
  notes?: string;
}

export interface PageExtraction extends ExtractedMetadata {
  pageNumber: number;
}

export type ValidationStatus = 'matched' | 'not_found' | 'not_provided';

export interface RowValidation {
  investorName: ValidationStatus;
  investorId: ValidationStatus;
  fundName: ValidationStatus;
  accountName: ValidationStatus;
  relationship: 'matched' | 'mismatch' | 'partial' | 'not_provided';
}

export interface DocumentRow {
  id: string;
  pageRange: string;
  startPage: number;
  endPage: number;
  investorName: string | null;
  investorId: string | null;
  fundName: string | null;
  accountName: string | null;
  investorExternalId: string | null;
  fundExternalId: string | null;
  accountExternalId: string | null;
  documentType: DocumentType | null;
  confidence: number;
  sourcePath?: string;
  validation?: RowValidation;
}

export interface ExtractResponse {
  mode: 'split-code' | 'no-split';
  jobId: string;
  rows: DocumentRow[];
  totalPages?: number;
  totalFiles?: number;
  usingMock: boolean;
}
