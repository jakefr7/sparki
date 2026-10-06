'use client';

import { useEffect, useRef, useState } from 'react';

export function VisitDocumentPreview({ visitId }: { visitId: string }) {
  const pages = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const container = pages.current;
    let objectUrl: string | null = null;
    let worker: Worker | undefined;
    let task: { destroy: () => Promise<void> } | undefined;
    setUrl(null); setReady(false); setError('');
    container?.replaceChildren();
    async function load() {
      try {
        const response = await fetch(`/api/visits/${encodeURIComponent(visitId)}/documents/discharge`, { signal: controller.signal });
        if (!response.ok) throw new Error('Could not load the discharge PDF. Please try again.');
        const data = await response.arrayBuffer();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
        setUrl(objectUrl);
        const pdfjs = await import('pdfjs-dist');
        if (controller.signal.aborted) return;
        worker = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' });
        const pdfWorker = pdfjs.PDFWorker.create({ port: worker });
        const loading = pdfjs.getDocument({ data, worker: pdfWorker });
        task = loading;
        const pdf = await loading.promise;
        for (let index = 1; index <= pdf.numPages; index++) {
          if (controller.signal.aborted) return;
          const page = await pdf.getPage(index);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width; canvas.height = viewport.height;
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', `Discharge PDF page ${index} of ${pdf.numPages}`);
          await page.render({ canvas, viewport }).promise;
          if (controller.signal.aborted) return;
          container?.appendChild(canvas);
        }
        setReady(true);
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Could not load the PDF.');
      }
    }
    void load();
    return () => { controller.abort(); void task?.destroy(); worker?.terminate(); if (objectUrl) URL.revokeObjectURL(objectUrl); container?.replaceChildren(); };
  }, [visitId, attempt]);
  return <div className="visit-document-preview" aria-busy={!ready && !error}>
    {!ready && !error ? <div className="visit-document-preview-loading" role="status"><span className="visit-document-preview-spinner" aria-hidden="true" /><span>Loading PDF…</span></div> : null}
    {error ? <div role="alert"><p>Could not display the PDF. Try again or open the document below.</p><button type="button" className="button-secondary" onClick={() => setAttempt((value) => value + 1)}>Retry preview</button></div> : null}
    <div ref={pages} hidden={!ready} className="visit-document-preview-pages" aria-label="Discharge PDF preview" />
    {error && url ? <a href={url} target="_blank" rel="noopener noreferrer">Open PDF in a new tab</a> : null}
  </div>;
}
