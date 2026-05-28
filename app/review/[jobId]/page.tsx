'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { DocumentRow, ExtractResponse, DocumentType, ValidationStatus } from '@/lib/types';

const DOC_TYPES: DocumentType[] = [
  'K-1',
  'Capital Statement',
  'Capital Call Notice',
  'Distribution Notice',
  'Quarterly Report',
  'Annual Report',
  'Other',
];

export default function ReviewPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const [data, setData] = useState<ExtractResponse | null>(null);
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(`job:${jobId}`);
    if (raw) {
      const parsed: ExtractResponse = JSON.parse(raw);
      setData(parsed);
      setRows(parsed.rows);
    }
  }, [jobId]);

  function updateRow(id: string, patch: Partial<DocumentRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function handleConfirm() {
    if (!data) return;
    setDownloading(true);
    try {
      const res = await fetch('/api/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, rows }),
      });
      if (!res.ok) throw new Error('Finalize failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.mode === 'split-code'
        ? `filesplit-${jobId.slice(0, 8)}.zip`
        : `metadata-${jobId.slice(0, 8)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  if (!data) {
    return (
      <div className="max-w-screen-2xl mx-auto text-gray-600">
        Loading job… If this persists, the session may have expired.
        <Link href="/" className="ml-2 text-brand-600 underline">Start over</Link>
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-brand-600 hover:underline">← Upload another file</Link>
          <h1 className="text-2xl font-semibold text-gray-900 mt-1">Review extracted metadata</h1>
          <p className="text-sm text-gray-600 mt-1">
            {data.mode === 'split-code'
              ? `${data.totalPages ?? rows.length} pages → ${rows.length} documents detected.`
              : `${data.totalFiles ?? rows.length} files tagged.`}
            {data.usingMock && (
              <span className="ml-2 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-xs">
                Mock mode (no API key set)
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleConfirm}
          disabled={downloading}
          className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium"
        >
          {downloading ? 'Generating…' : data.mode === 'split-code' ? 'Confirm & download split ZIP' : 'Confirm & download ZIP'}
        </button>
      </div>

      <ValidationSummary rows={rows} />

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-700 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">{data.mode === 'split-code' ? 'Pages' : 'Source path'}</th>
                <th className="px-3 py-2 font-medium">Investor</th>
                <th className="px-3 py-2 font-medium">Investor Ext ID</th>
                <th className="px-3 py-2 font-medium">Fund</th>
                <th className="px-3 py-2 font-medium">Fund Ext ID</th>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Account Ext ID</th>
                <th className="px-3 py-2 font-medium">Class Code</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Conf.</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className={`hover:bg-gray-50 ${r.validation?.relationship === 'mismatch' ? 'bg-red-50/40' : ''}`}>
                  <td className="px-3 py-2 text-gray-700 font-mono text-xs">
                    {data.mode === 'split-code' ? r.pageRange : r.sourcePath}
                  </td>
                  <td className="px-3 py-2"><Cell value={r.investorName} status={r.validation?.investorName} onChange={(v) => updateRow(r.id, { investorName: v })} /></td>
                  <td className="px-3 py-2 text-gray-700 font-mono text-xs">{r.investorExternalId ?? '—'}</td>
                  <td className="px-3 py-2"><Cell value={r.fundName} status={r.validation?.fundName} onChange={(v) => updateRow(r.id, { fundName: v })} /></td>
                  <td className="px-3 py-2 text-gray-700 font-mono text-xs">{r.fundExternalId ?? '—'}</td>
                  <td className="px-3 py-2"><Cell value={r.accountName} status={r.validation?.accountName} onChange={(v) => updateRow(r.id, { accountName: v })} /></td>
                  <td className="px-3 py-2 text-gray-700 font-mono text-xs">{r.accountExternalId ?? '—'}</td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={r.classCode ?? ''}
                      onChange={(e) => updateRow(r.id, { classCode: e.target.value || null })}
                      placeholder="—"
                      className="w-full border border-transparent hover:border-gray-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 rounded px-2 py-1 outline-none bg-transparent"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.documentType ?? ''}
                      onChange={(e) => updateRow(r.id, { documentType: (e.target.value || null) as DocumentType | null })}
                      className="border rounded px-2 py-1 text-sm w-full"
                    >
                      <option value="">—</option>
                      {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <ConfidenceBadge value={r.confidence} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Tip: fields shown blank with a red <span className="text-red-700">"not in records"</span> badge were extracted from the PDF but didn't match any entry in your master lists, so the value was cleared. Edit the field to override.
      </div>
    </div>
  );
}

function ValidationSummary({ rows }: { rows: DocumentRow[] }) {
  const blanked = rows.filter((r) =>
    r.validation && (
      r.validation.investorName === 'not_found' ||
      r.validation.fundName === 'not_found' ||
      r.validation.accountName === 'not_found' ||
      r.validation.relationship === 'mismatch'
    )
  );
  if (blanked.length === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-lg text-sm">
      <strong>{blanked.length}</strong> {blanked.length === 1 ? 'row has' : 'rows have'} fields that didn't match your investor / fund / account records. Review the rows highlighted below.
    </div>
  );
}

function Cell({
  value, onChange, status,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  status?: ValidationStatus;
}) {
  const placeholder =
    status === 'not_found' ? 'extracted value not in records' : '—';
  return (
    <div className="space-y-1">
      <input
        type="text"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value || null)}
        className={`w-full border rounded px-2 py-1 outline-none bg-transparent ${
          status === 'not_found'
            ? 'border-red-200 placeholder:text-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500'
            : 'border-transparent hover:border-gray-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500'
        }`}
      />
      {status === 'not_found' && (
        <span className="inline-block text-[10px] text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
          not in records
        </span>
      )}
      {status === 'matched' && value && (
        <span className="inline-block text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
          matched
        </span>
      )}
    </div>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone =
    value >= 0.8 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : value >= 0.6 ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-red-50 text-red-700 border-red-200';
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded border ${tone}`}>{pct}%</span>
  );
}
