import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { SessionFile } from '../../types';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://esm.sh/pdfjs-dist@5.4.394/build/pdf.worker.mjs';

export interface CalibrationPick {
  /** Top-left page space, in PDF points. */
  page: { x: number; y: number };
}

interface RedlineCalibrationCanvasProps {
  file: SessionFile;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  pointA?: { x: number; y: number } | null;
  pointB?: { x: number; y: number } | null;
  onPick: (pick: CalibrationPick) => void;
}

function base64Bytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const binary = atob(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Renders one PDF page and captures calibration clicks. A new component (rather
 * than a change to PdfViewerPanel) keeps the shared viewer stable.
 */
export const RedlineCalibrationCanvas: React.FC<RedlineCalibrationCanvasProps> = ({
  file,
  pageIndex,
  pageWidth,
  pageHeight,
  pointA,
  pointB,
  onPick,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    if (!file.fileData) {
      setError('This PDF has no file data in the session.');
      setLoading(false);
      return;
    }

    const render = async () => {
      setLoading(true);
      setError(null);
      try {
        const pdf = await pdfjsLib.getDocument({ data: base64Bytes(file.fileData!) }).promise;
        const page = await pdf.getPage(pageIndex + 1);
        const base = page.getViewport({ scale: 1 });
        const available = Math.max(320, container.clientWidth || 640);
        const fitScale = Math.min(2.2, available / Math.max(1, base.width));
        const viewport = page.getViewport({ scale: fitScale });
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D context is unavailable.');
        await page.render({
          canvasContext: context,
          canvas,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        }).promise;
        if (!cancelled) setScale(fitScale);
        page.cleanup();
        await pdf.destroy();
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : 'Could not render the PDF page.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void render();
    return () => {
      cancelled = true;
    };
  }, [file.fileData, file.name, pageIndex]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ((event.clientX - rect.left) / rect.width) * (pageWidth || rect.width / scale);
    const y = ((event.clientY - rect.top) / rect.height) * (pageHeight || rect.height / scale);
    onPick({ page: { x, y } });
  };

  return (
    <div ref={containerRef} className="relative w-full overflow-auto rounded-lg border border-slate-700 bg-slate-950/60 p-2">
      {loading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/60 text-xs text-slate-300">Rendering sheet…</div>}
      {error ? (
        <div className="p-4 text-xs text-rose-300">{error}</div>
      ) : (
        <div className="relative inline-block">
          <canvas
            ref={canvasRef}
            onClick={handleClick}
            className="block max-w-full cursor-crosshair rounded"
            aria-label="Calibration sheet. Click a known point."
          />
          {pointA && (
            <span
              className="pointer-events-none absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-red-300 bg-red-500/80 text-[9px] font-bold text-white shadow"
              style={{ left: `${pointA.x * scale}px`, top: `${pointA.y * scale}px` }}
            >
              A
            </span>
          )}
          {pointB && (
            <span
              className="pointer-events-none absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-sky-300 bg-sky-500/80 text-[9px] font-bold text-white shadow"
              style={{ left: `${pointB.x * scale}px`, top: `${pointB.y * scale}px` }}
            >
              B
            </span>
          )}
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400">
        Click a known point on the sheet. Repeat for point B, then enter the project easting/northing for each.
      </p>
    </div>
  );
};
