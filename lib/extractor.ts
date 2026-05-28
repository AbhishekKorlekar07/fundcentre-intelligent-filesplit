import Anthropic from '@anthropic-ai/sdk';
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import type { ExtractedMetadata, DocumentType } from './types';

const USE_BEDROCK =
  process.env.USE_BEDROCK === '1' ||
  Boolean(process.env.AWS_PROFILE || process.env.AWS_ACCESS_KEY_ID);

const MODEL = process.env.ANTHROPIC_MODEL
  || (USE_BEDROCK ? 'global.anthropic.claude-opus-4-7' : 'claude-sonnet-4-6');

const SYSTEM_PROMPT = `You are an expert at reading private-equity / hedge-fund investor documents (K-1s, capital statements, capital call notices, distribution notices, quarterly reports).
You will be given the contents of one or more pages from a fund-reporting PDF.
Your job is to extract structured metadata about the investor (LP), fund, and account this page belongs to, plus the document type.

How to identify the INVESTOR NAME (this is the most important field — multiple names appear on a typical page, only one is the investor):

PREFERRED — the investor is the named subject of the body text. Look for sentences like:
  "<NAME> hereby advises you that..."
  "<NAME> hereby provides notice that..."
  "On behalf of <NAME>..."
  "Dear <NAME>,"     (when followed by a real name, not "Investor")
  An "Investor:" / "Limited Partner:" / "LP Name:" labelled field.
The name you pull from one of these patterns is the investorName.

DO NOT use any of these as the investor name:
- The recipient/mailing-label line near the top of the page (often appears as
  "<entity>, LP Number: AC-NNNNN /XXXX-XXXX-XXXX-XXXX"). This is a routing
  label for envelope addressing, not the actual investor.
- "Dear Investor," or "Dear Limited Partner," generic salutations.
- Placeholder strings like "Test Investor 1", "Test Investor", "Investor Name",
  "[LP NAME]", "<NAME>". If you see "Test Investor" in any form treat it as
  a TEMPLATE PLACEHOLDER, never as the investor.
- Names appearing in possessive form like "regarding X's commitment" — these
  refer to the subject the document is ABOUT (often a placeholder); the
  ACTUAL investor is the subject of "<NAME> hereby advises you...".
- The fund name, the GP name, or the fund administrator's name.

Worked example. Suppose the page contains:
  "Capital Call Notice
   Keystone Capital Fund I
   Agrica Investment Trust, LP Number: AC-40686 /AFNR-8ZK6-G6TT-6DC7
   Dear Investor,
   Harbour Trust Group hereby advises you that ... regarding Test
   Investor 1's commitment ..."

The CORRECT extraction is:
  investorName = "Harbour Trust Group"   (subject of "hereby advises you")
  investorId   = null                    (no labelled investor ID)
  fundName     = "Keystone Capital Fund I"
  accountName  = null                    (no explicit account label)
  documentType = "Capital Call Notice"

It is INCORRECT to extract "Agrica Investment Trust" (mailing label) or
"Test Investor 1" (placeholder).

For investorId: extract any internal identifier explicitly tied to the
investor (e.g. "LP-00123", "Investor ID: 4567"). Many template documents
have URI markers like
"URI::INTRALINKS:PDFDOCUMENTS?accountid=NNNN&investorid=NNNN" — these
identify the recipient routing, not necessarily the investor named in the
body, so do NOT use them as investorId. Leave investorId null when no
explicit investor-labelled ID is present.

Other rules:
- If a page is clearly a continuation of the prior page (no new fund header, no new salutation, no new "X hereby advises you" sentence, no new title), set isContinuation=true and leave all metadata fields null.
- A new document typically starts with a fresh fund header, statement title, or "<NAME> hereby advises you" sentence.
- documentType must be one of: "K-1", "Capital Statement", "Capital Call Notice", "Distribution Notice", "Quarterly Report", "Annual Report", "Other".
- classCode: extract any class/share class identifier (e.g. "Class A", "Series B", "Common", "Class 1") if explicitly mentioned. Leave null if not present.
- Confidence is 0-1. Use lower confidence when fields are inferred or partially visible. Use HIGH confidence (>=0.9) only when a clear "<NAME> hereby advises you" or labelled investor field is present.
- Be concise. Do not invent values — use null when unsure.`;

const TOOL_SCHEMA = {
  name: 'record_page_metadata',
  description: 'Record extracted metadata for a single page of a fund-reporting document.',
  input_schema: {
    type: 'object' as const,
    properties: {
      investorName: { type: ['string', 'null'], description: 'Full LP / investor name as printed' },
      investorId: { type: ['string', 'null'], description: 'Internal account or investor identifier' },
      fundName: { type: ['string', 'null'], description: 'Fund name (e.g. "ADFund2 LP")' },
      accountName: { type: ['string', 'null'], description: 'Account/sub-account label, may equal investor name' },
      classCode: { type: ['string', 'null'], description: 'Class or share class identifier (e.g. "Class A", "Series B")' },
      documentType: {
        type: ['string', 'null'],
        enum: ['K-1', 'Capital Statement', 'Capital Call Notice', 'Distribution Notice', 'Quarterly Report', 'Annual Report', 'Other', null],
      },
      isContinuation: { type: 'boolean', description: 'True if this page continues the previous document with no new header' },
      confidence: { type: 'number', description: '0..1 confidence in the extracted fields' },
      notes: { type: ['string', 'null'], description: 'Optional short note about ambiguity' },
    },
    required: ['investorName', 'investorId', 'fundName', 'accountName', 'classCode', 'documentType', 'isContinuation', 'confidence'],
  },
};

type BedrockOrAnthropic = Anthropic | AnthropicBedrock;

function getClient(): BedrockOrAnthropic | null {
  if (USE_BEDROCK) {
    // AnthropicBedrock picks up AWS_PROFILE / AWS creds + region from the
    // standard AWS chain. AWS SDK SSO works automatically as long as the
    // profile is logged in (`aws sso login --profile <name>`).
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    return new AnthropicBedrock({ awsRegion: region });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

export function isLive(): boolean {
  return USE_BEDROCK || Boolean(process.env.ANTHROPIC_API_KEY);
}

export function backendName(): string {
  if (USE_BEDROCK) return `bedrock (${MODEL})`;
  if (process.env.ANTHROPIC_API_KEY) return `anthropic (${MODEL})`;
  return 'mock';
}

export async function extractFromPdfBuffer(
  pdfBytes: Buffer,
  context: { label: string; isSinglePage?: boolean }
): Promise<ExtractedMetadata> {
  const client = getClient();
  if (!client) {
    return mockExtract(context.label);
  }

  const base64 = pdfBytes.toString('base64');
  const userText = context.isSinglePage
    ? `This is a single page extracted from a larger PDF (${context.label}). Extract metadata for this page only. Decide isContinuation based on whether the page has a fresh document header.`
    : `This is the file "${context.label}". Extract metadata representing the whole document (treat isContinuation as false).`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'record_page_metadata' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          },
          { type: 'text', text: userText },
        ],
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Claude did not return tool_use block');
  }
  const input = toolUse.input as Record<string, unknown>;
  return normalize(input);
}

function normalize(input: Record<string, unknown>): ExtractedMetadata {
  const docType = input.documentType as DocumentType | null;
  return {
    investorName: (input.investorName as string | null) ?? null,
    investorId: (input.investorId as string | null) ?? null,
    fundName: (input.fundName as string | null) ?? null,
    accountName: (input.accountName as string | null) ?? null,
    classCode: (input.classCode as string | null) ?? null,
    documentType: docType ?? null,
    isContinuation: Boolean(input.isContinuation),
    confidence: typeof input.confidence === 'number' ? input.confidence : 0.5,
    notes: (input.notes as string | undefined) ?? undefined,
  };
}

const MOCK_INVESTORS = [
  { investorName: 'New York Pension Fund', investorId: '1002', fundName: 'Keystone Capital Fund I', accountName: 'default', classCode: 'Class A' },
  { investorName: 'Habour Trust Group', investorId: '1001', fundName: 'Keystone Capital Fund II', accountName: 'default', classCode: 'Class B' },
  { investorName: 'Howard Endowment', investorId: '1006', fundName: 'Keystone Emerging Fund I', accountName: 'default', classCode: 'Series 1' },
  { investorName: 'Liberty Insurance', investorId: '1003', fundName: 'Keystone Offshore Fund II', accountName: 'default', classCode: 'Common' },
  { investorName: 'Atlas Crest Capital', investorId: '1009', fundName: 'Keystone Emerging Fund III', accountName: 'default', classCode: 'Class A' },
];
const MOCK_TYPES: DocumentType[] = ['K-1', 'Capital Statement', 'Capital Call Notice', 'Distribution Notice', 'Quarterly Report'];

function mockExtract(label: string): ExtractedMetadata {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  const investor = MOCK_INVESTORS[hash % MOCK_INVESTORS.length];
  const docType = MOCK_TYPES[(hash >> 3) % MOCK_TYPES.length];
  // Continuation pages: when label looks like "page-2" of a multi-page doc, treat ~30% as continuation in mock mode
  const pageMatch = /page[-_ ]?(\d+)/i.exec(label);
  const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : 1;
  const isContinuation = pageNum % 2 === 0; // even pages are continuation in our mock combined PDF
  if (isContinuation) {
    return {
      investorName: null,
      investorId: null,
      fundName: null,
      accountName: null,
      classCode: null,
      documentType: null,
      isContinuation: true,
      confidence: 0.92,
      notes: 'mock: continuation page',
    };
  }
  return {
    ...investor,
    documentType: docType,
    isContinuation: false,
    confidence: 0.88,
    notes: 'mock data — set ANTHROPIC_API_KEY for live extraction',
  };
}
