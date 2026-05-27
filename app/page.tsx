'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import type { ExtractResponse } from '@/lib/types';

type Mode = 'split-code' | 'no-split';

export default function UploadPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('split-code');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept: Record<string, string[]> = mode === 'split-code'
    ? { 'application/pdf': ['.pdf'] }
    : { 'application/zip': ['.zip'], 'application/x-zip-compressed': ['.zip'] };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    maxFiles: 1,
    onDrop: (accepted) => {
      setError(null);
      if (accepted[0]) setFile(accepted[0]);
    },
  });

  async function handleSubmit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('mode', mode);
      fd.append('file', file);
      const res = await fetch('/api/extract', { method: 'POST', body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Extract failed (${res.status})`);
      }
      const data: ExtractResponse = await res.json();
      sessionStorage.setItem(`job:${data.jobId}`, JSON.stringify(data));
      router.push(`/review/${data.jobId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Upload documents for AI tagging</h1>
        <p className="text-sm text-gray-600 mt-1">
          Choose how your fund manager prepared the file. The AI will extract investor, fund, account, and document type for review.
        </p>
      </div>

      <div className="bg-white border rounded-xl p-6 shadow-sm space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <ModeCard
            active={mode === 'split-code'}
            onClick={() => { setMode('split-code'); setFile(null); }}
            title="Split-code mode"
            subtitle="Single combined PDF"
            description="Upload one bulk PDF (e.g. 50-page K-1 batch). AI detects per-page boundaries and groups continuation pages."
          />
          <ModeCard
            active={mode === 'no-split'}
            onClick={() => { setMode('no-split'); setFile(null); }}
            title="No-split mode"
            subtitle="Zip of pre-split PDFs"
            description="Upload a .zip containing already-separated PDFs. AI tags each file and produces an Excel manifest."
          />
        </div>

        <div
          {...getRootProps()}
          className={`dropzone ${isDragActive ? 'active' : ''}`}
        >
          <input {...getInputProps()} />
          {file ? (
            <div>
              <div className="font-medium text-gray-900">{file.name}</div>
              <div className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
              <button
                className="mt-3 text-sm text-brand-600 underline"
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
              >
                Choose a different file
              </button>
            </div>
          ) : (
            <div>
              <div className="font-medium text-gray-700">
                {mode === 'split-code' ? 'Drop a combined PDF here' : 'Drop a .zip of pre-split PDFs here'}
              </div>
              <div className="text-sm text-gray-500 mt-1">or click to browse</div>
            </div>
          )}
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {process.env.NEXT_PUBLIC_HAS_KEY === '1'
              ? 'Live extraction mode'
              : 'Set ANTHROPIC_API_KEY for live extraction — currently using mock data if missing.'}
          </div>
          <button
            disabled={!file || busy}
            onClick={handleSubmit}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg font-medium"
          >
            {busy ? 'Analysing…' : 'Analyse with AI'}
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Hackathon prototype · processing capped at 25 pages / files for demo speed.
      </div>
    </div>
  );
}

function ModeCard({
  active, onClick, title, subtitle, description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  description: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left p-4 rounded-lg border-2 transition ${
        active ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-gray-500">{subtitle}</div>
      <div className="font-semibold text-gray-900 mt-0.5">{title}</div>
      <div className="text-sm text-gray-600 mt-2">{description}</div>
    </button>
  );
}
