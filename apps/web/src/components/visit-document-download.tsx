'use client';
import { useState } from 'react';

export function VisitDocumentDownload({ visitId, kind, children }: { visitId: string; kind: 'record' | 'discharge' | 'receipt'; children: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/visits/${encodeURIComponent(visitId)}/documents/${kind}`);
      if (!response.ok) {
        const payload = await response.json() as { message?: string };
        throw new Error(payload.message ?? 'Could not generate this document.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = `${kind}-${visitId}.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not download this document.'); }
    finally { setBusy(false); }
  }
  return <div><button type="button" className="button-secondary" disabled={busy} onClick={() => void download()}>{busy ? 'Generating PDF…' : children}</button>{error ? <p className="form-error" role="alert">{error}</p> : null}</div>;
}
