# FundCentre · Intelligent Filesplit (Hackathon)

An AI-powered enhancement to FundCentre Reporting's web-based filesplit feature.
Handles **both** GP workflows in one tool:

| Mode | Input | What the AI does | Output |
|---|---|---|---|
| **Split-code** | One combined PDF (e.g. 50-page K-1 batch) | Reads each page, detects investor / fund / account / doc type, and groups continuation pages into documents | ZIP of per-investor PDFs + manifest.xlsx |
| **No-split** | ZIP of pre-split PDFs | Tags every PDF with extracted metadata | manifest.xlsx with investor / fund / account / source path |

Both flows share one review screen where the GP can edit any field before finalising.

## Stack
- Next.js 14 (App Router) + TypeScript + Tailwind
- `@anthropic-ai/sdk` — sends the PDF directly to Claude (no rasterisation needed) and uses tool-use for structured output
- `pdf-lib` for PDF page extraction / re-assembly
- `jszip` + `xlsx` for archive/manifest output

## Run it

```bash
npm install
cp .env.example .env.local
# (optional) put your real key in .env.local — without it, the app uses a built-in mock extractor
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Generate sample data
```bash
npx tsx scripts/generate-sample-data.ts
```
This produces:
- `sample-data/combined.pdf` — 9-page bulk file with 5 investors (some 2-page documents)
- `sample-data/presplit.zip` — the same documents, pre-split into individual PDFs

Use `combined.pdf` for split-code mode, `presplit.zip` for no-split mode.

## How extraction works
For every page (split-code) or every file (no-split) the server:
1. Extracts a single-page PDF buffer via `pdf-lib`
2. Sends it to Claude with a `record_page_metadata` tool definition (forced via `tool_choice`)
3. Receives structured JSON: `{ investorName, investorId, fundName, accountName, documentType, isContinuation, confidence }`
4. For split-code mode, groups consecutive pages where `isContinuation=true` into a single document row

## Source-of-truth validation
Every extracted field is checked against `data/{investors,funds,accounts}.json` before being shown on the review screen. Behaviour:

- **Matched** → the AI's value is replaced with the canonical name from your records (so `"AD Fund 2, L.P."` becomes `"ADFund2 LP"`). Field shows a green ✓.
- **Not found** → the field is blanked on the review screen with a red **"not in records"** badge. The GP can override by typing.
- **Relationship mismatch** → investor and fund both validated, but they don't belong together for any account. The row is highlighted; the account field is blanked.

Investor lookup tries `investorId` (exact) first and falls back to fuzzy name match. If only one of investor or fund is provided, the other can still validate independently — but the account can only validate when both anchors are present.

Matching is case-insensitive, punctuation-stripped, and tolerates ~20% Levenshtein edit distance (max 4 chars), so OCR noise like `"acmne capital partners"` still resolves cleanly.

To test: `npx tsx scripts/test-validation.ts`

To swap the JSON files for a real DB later, replace the `load()` function in `lib/sourceOfTruth.ts` — the matcher contract stays the same.

## Future hooks (next iteration)
- **Distribution** — the finalize endpoint already produces a manifest with a clean folder structure (`fund/investor/`); wiring this to LP folders is mechanical.
- **Batch sizes >25** — the 25 page/file cap in `app/api/extract/route.ts` is for hackathon demo speed; remove it for real workloads (and consider an SSE/streaming progress UI).

## Project layout
```
app/
  page.tsx                  — Screen 1: upload + mode picker
  review/[jobId]/page.tsx   — Screen 2: editable review table
  api/extract/route.ts      — POST: PDF or ZIP -> rows + jobId
  api/finalize/route.ts     — POST: jobId + edited rows -> ZIP or XLSX
data/
  investors.json            — master investor list (id, name)
  funds.json                — master fund list (id, name)
  accounts.json             — joined investor+fund+account triples
lib/
  extractor.ts              — Claude tool-use call + mock fallback
  pdf.ts                    — pdf-lib helpers
  boundary.ts               — continuation-page grouping
  jobStore.ts               — in-memory job cache
  fuzzyMatch.ts             — Levenshtein + normalisation helpers
  sourceOfTruth.ts          — validates extracted fields against master data
  types.ts
scripts/
  generate-sample-data.ts
```
