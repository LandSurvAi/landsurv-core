/**
 * A2UIRasterUnderlay
 *
 * First-class A2UI surface for importing a plan PDF or raster scan onto the
 * drawing canvas, setting two image anchor points, and associating each anchor
 * with a project point. The two pairs fit a similarity transform (uniform
 * scale, rotation, translation) so the underlay aligns to the survey.
 *
 * Rendered inline in chat, floating over the canvas, docked in the Agent Tool
 * Shelf, and fullscreen by the shared A2UI surface host. The anchor picker can
 * additionally expand to the full browser viewport for precise clicking.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { RasterAsset, RasterUnderlay, RasterUnderlayAnchor, SurveyPoint } from '../types.ts';
import {
  fitUnderlayTransform,
  isPdfFile,
  readPdfPageAsset,
  readRasterImageAsset,
  refreshAnchorCoordinates,
} from '../utils/rasterUnderlay.ts';
import { deriveRasterUnderlayWorkflow } from '../services/rasterUnderlayWorkflow.ts';

export interface A2UIRasterUnderlayProps {
  underlays: RasterUnderlay[];
  selectedId: string | null;
  points: SurveyPoint[];
  onSelect: (id: string | null) => void;
  onAdd: (asset: RasterAsset) => void;
  onUpdate: (id: string, patch: Partial<RasterUnderlay>) => void;
  onDelete: (id: string) => void;
}

type AnchorSlot = 0 | 1;

const emptyAnchor = (): RasterUnderlayAnchor => ({
  imageX: 0,
  imageY: 0,
  imagePointSet: false,
  easting: 0,
  northing: 0,
});

/** Two anchor pairs are enough to pin translation, scale, and rotation. */
const withAnchor = (
  anchors: RasterUnderlayAnchor[],
  slot: AnchorSlot,
  patch: Partial<RasterUnderlayAnchor>,
): RasterUnderlayAnchor[] => {
  const next: RasterUnderlayAnchor[] = [anchors[0] ?? emptyAnchor(), anchors[1] ?? emptyAnchor()];
  next[slot] = {
    ...next[slot],
    ...patch,
    imagePointSet:
      patch.imageX !== undefined || patch.imageY !== undefined
        ? true
        : next[slot].imagePointSet,
  };
  return next;
};

const hasImageAnchor = (anchor: RasterUnderlayAnchor | undefined) =>
  !!anchor &&
  anchor.imagePointSet !== false &&
  Number.isFinite(anchor.imageX) &&
  Number.isFinite(anchor.imageY);

const hasWorldAnchor = (anchor: RasterUnderlayAnchor | undefined) =>
  !!anchor && !!anchor.pointNumber;

const anchorsReady = (anchors: RasterUnderlayAnchor[]) =>
  hasImageAnchor(anchors[0]) &&
  hasImageAnchor(anchors[1]) &&
  hasWorldAnchor(anchors[0]) &&
  hasWorldAnchor(anchors[1]);

export const A2UIRasterUnderlay: React.FC<A2UIRasterUnderlayProps> = ({
  underlays,
  selectedId,
  points,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
}) => {
  const selected = underlays.find(underlay => underlay.id === selectedId) ?? null;
  const [activeSlot, setActiveSlot] = useState<AnchorSlot>(0);
  const [status, setStatus] = useState<string | null>(null);
  const [lastPick, setLastPick] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isAnchorFullscreen, setIsAnchorFullscreen] = useState(false);
  const [fullscreenZoom, setFullscreenZoom] = useState<number | 'fit'>('fit');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fullscreenZoomRef = useRef<number | 'fit'>('fit');
  const anchorViewportRef = useRef<HTMLDivElement | null>(null);
  const anchorImageRef = useRef<HTMLDivElement | null>(null);
  const pendingWheelZoomRef = useRef<{
    clientX: number;
    clientY: number;
    ratioX: number;
    ratioY: number;
  } | null>(null);

  const sortedPoints = useMemo(
    () =>
      [...points].sort((a, b) =>
        a.pointNumber.localeCompare(b.pointNumber, undefined, { numeric: true }),
      ),
    [points],
  );
  const underlayWorkflow = useMemo(
    () => deriveRasterUnderlayWorkflow(underlays),
    [underlays],
  );

  // Escape closes only the fullscreen anchor picker. Capture + immediate stop
  // keeps the global A2UI host from also closing the parent surface.
  useEffect(() => {
    if (!isAnchorFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setIsAnchorFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [isAnchorFullscreen]);

  useEffect(() => {
    if (!selected) setIsAnchorFullscreen(false);
  }, [selected]);

  // Mouse wheel zooms the fullscreen anchor picker around the cursor. The
  // native non-passive listener is required so the page behind stays put.
  useEffect(() => {
    if (!isAnchorFullscreen) return;
    const viewport = anchorViewportRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      if (!selected || event.deltaY === 0) return;
      event.preventDefault();

      const imageRect = anchorImageRef.current?.getBoundingClientRect();
      const current = fullscreenZoomRef.current;
      const displayedScale =
        imageRect && imageRect.width > 0 && selected.imageWidth > 0
          ? imageRect.width / selected.imageWidth
          : 1;
      const base = current === 'fit' ? displayedScale : current;
      const factor = event.deltaY < 0 ? 1.2 : 1 / 1.2;
      const next = Math.max(0.1, Math.min(8, base * factor));
      if (Math.abs(next - base) < 1e-4) return;

      if (imageRect && imageRect.width > 0 && imageRect.height > 0) {
        pendingWheelZoomRef.current = {
          clientX: event.clientX,
          clientY: event.clientY,
          ratioX: Math.max(0, Math.min(1, (event.clientX - imageRect.left) / imageRect.width)),
          ratioY: Math.max(0, Math.min(1, (event.clientY - imageRect.top) / imageRect.height)),
        };
      }
      fullscreenZoomRef.current = next;
      setFullscreenZoom(next);
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [isAnchorFullscreen, selected]);

  // After a wheel zoom, keep the image point that was under the cursor there.
  useLayoutEffect(() => {
    const pending = pendingWheelZoomRef.current;
    const viewport = anchorViewportRef.current;
    const image = anchorImageRef.current;
    if (!pending || !viewport || !image) return;
    pendingWheelZoomRef.current = null;

    const rect = image.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const targetLeft = pending.clientX - pending.ratioX * rect.width;
    const targetTop = pending.clientY - pending.ratioY * rect.height;
    viewport.scrollLeft += rect.left - targetLeft;
    viewport.scrollTop += rect.top - targetTop;
  }, [fullscreenZoom]);

  const applyFit = useCallback(
    (anchors: RasterUnderlayAnchor[], announce: boolean) => {
      if (!selected) return;
      const resolved = refreshAnchorCoordinates(anchors, points);
      if (!anchorsReady(resolved)) {
        if (announce) setStatus('Set an image anchor and a project point for both pairs first.');
        return;
      }
      const transform = fitUnderlayTransform(resolved);
      if (!transform) {
        if (announce) setStatus('The anchor pairs are too close together to fit a transform.');
        return;
      }
      onUpdate(selected.id, { anchors: resolved, transform });
      if (announce) setStatus('Aligned the underlay to the two anchor pairs.');
    },
    [onUpdate, points, selected],
  );

  const commitAnchors = useCallback(
    (anchors: RasterUnderlayAnchor[]) => {
      if (!selected) return;
      const resolved = refreshAnchorCoordinates(anchors, points);
      const transform = anchorsReady(resolved) ? fitUnderlayTransform(resolved) : null;
      onUpdate(
        selected.id,
        transform ? { anchors: resolved, transform } : { anchors: resolved },
      );
    },
    [onUpdate, points, selected],
  );

  const handleFile = useCallback(
    async (file: File) => {
      setIsImporting(true);
      setStatus(null);
      try {
        if (isPdfFile(file)) {
          const asset = await readPdfPageAsset(file, 1);
          setPdfFile(file);
          setPdfPage(asset.pageNumber ?? 1);
          onAdd(asset);
          setStatus(
            asset.pageCount && asset.pageCount > 1
              ? `Imported page 1 of ${asset.pageCount}. Load other pages below.`
              : 'PDF page imported. Place two anchors to align it.',
          );
        } else if (file.type.startsWith('image/')) {
          const asset = await readRasterImageAsset(file);
          setPdfFile(null);
          onAdd(asset);
          setStatus('Image imported. Place two anchors to align it.');
        } else {
          setStatus('Choose a PDF or raster image (PNG, JPG, WebP, TIFF…).');
        }
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Could not import that file.');
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [onAdd],
  );

  const loadPdfPage = useCallback(async () => {
    if (!pdfFile) return;
    setIsImporting(true);
    try {
      const asset = await readPdfPageAsset(pdfFile, pdfPage);
      onAdd(asset);
      setStatus(`Imported PDF page ${asset.pageNumber} of ${asset.pageCount}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not render that PDF page.');
    } finally {
      setIsImporting(false);
    }
  }, [onAdd, pdfFile, pdfPage]);

  const handlePreviewClick = useCallback(
    (event: React.MouseEvent<HTMLImageElement>) => {
      if (!selected) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const imageX = ((event.clientX - rect.left) / rect.width) * selected.imageWidth;
      const imageY = ((event.clientY - rect.top) / rect.height) * selected.imageHeight;
      const clampedX = Math.round(Math.max(0, Math.min(selected.imageWidth, imageX)) * 10) / 10;
      const clampedY = Math.round(Math.max(0, Math.min(selected.imageHeight, imageY)) * 10) / 10;
      const anchors = withAnchor(selected.anchors ?? [], activeSlot, {
        imageX: clampedX,
        imageY: clampedY,
      });
      commitAnchors(anchors);
      setActiveSlot(activeSlot === 0 ? 1 : 0);
      setLastPick(`A${activeSlot + 1} set at ${clampedX.toFixed(1)}, ${clampedY.toFixed(1)} px`);
      setStatus(
        `Image anchor ${activeSlot + 1} set at pixel ${clampedX.toFixed(1)}, ${clampedY.toFixed(1)}.`,
      );
    },
    [activeSlot, commitAnchors, selected],
  );

  const assignPoint = useCallback(
    (slot: AnchorSlot, pointNumber: string) => {
      if (!selected) return;
      if (!pointNumber) {
        const anchors = withAnchor(selected.anchors ?? [], slot, {
          pointNumber: undefined,
          easting: 0,
          northing: 0,
        });
        commitAnchors(anchors);
        return;
      }
      const point = points.find(candidate => candidate.pointNumber === pointNumber);
      if (!point) return;
      const anchors = withAnchor(selected.anchors ?? [], slot, {
        pointNumber,
        easting: point.easting,
        northing: point.northing,
      });
      commitAnchors(anchors);
      setStatus(`Anchor ${slot + 1} associated with point ${point.pointNumber}.`);
    },
    [commitAnchors, points, selected],
  );

  const patchSelected = useCallback(
    (patch: Partial<RasterUnderlay>) => {
      if (selected) onUpdate(selected.id, patch);
    },
    [onUpdate, selected],
  );

  const patchTransform = useCallback(
    (patch: Partial<RasterUnderlay['transform']>) => {
      if (!selected) return;
      onUpdate(selected.id, { transform: { ...selected.transform, ...patch } });
    },
    [onUpdate, selected],
  );

  const updateWidth = useCallback(
    (value: number) => {
      if (!selected || !Number.isFinite(value) || value <= 0) return;
      patchTransform({ scale: value / Math.max(1, selected.imageWidth) });
    },
    [patchTransform, selected],
  );

  const applyFullscreenZoom = useCallback((next: number | 'fit') => {
    const clamped = next === 'fit' ? 'fit' : Math.max(0.1, Math.min(8, next));
    fullscreenZoomRef.current = clamped;
    setFullscreenZoom(clamped);
  }, []);

  const anchors = selected?.anchors ?? [];
  const canFit = anchorsReady(anchors);

  const renderSlotButtons = () =>
    ([0, 1] as AnchorSlot[]).map(slot => (
      <button
        key={slot}
        type="button"
        onClick={() => setActiveSlot(slot)}
        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
          activeSlot === slot
            ? 'bg-amber-500/25 text-amber-200'
            : 'bg-white/5 text-slate-400 hover:bg-white/10'
        }`}
        title={`The next preview click sets image anchor ${slot + 1}`}
      >
        Set A{slot + 1}
      </button>
    ));

  const renderAnchorMarkers = () =>
    ([0, 1] as AnchorSlot[]).map(slot => {
      const anchor = anchors[slot];
      if (!selected || !hasImageAnchor(anchor)) return null;
      return (
        <span
          key={slot}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-200 bg-amber-500/90 px-1 text-[9px] font-bold text-slate-950 shadow"
          style={{
            left: `${(anchor!.imageX / selected.imageWidth) * 100}%`,
            top: `${(anchor!.imageY / selected.imageHeight) * 100}%`,
          }}
        >
          A{slot + 1}
        </span>
      );
    });

  const renderAnchorImage = (fullscreen: boolean) => {
    if (!selected) return null;
    const numericZoom = fullscreen && fullscreenZoom !== 'fit' ? fullscreenZoom : null;
    const fullscreenFit = fullscreen && fullscreenZoom === 'fit';
    // The inline-block wrapper is exactly the rendered image box, so percentage
    // markers stay on the pixels even when the image is letterboxed, scaled, or zoomed.
    return (
      <div
        ref={fullscreen ? anchorImageRef : undefined}
        className={
          numericZoom
            ? 'relative inline-block shrink-0'
            : 'relative inline-block max-w-full'
        }
        style={
          numericZoom
            ? { width: Math.max(1, selected.imageWidth * numericZoom) }
            : undefined
        }
      >
        <img
          src={selected.dataUrl}
          alt={selected.name}
          onClick={handlePreviewClick}
          draggable={false}
          className={
            numericZoom
              ? 'block h-auto w-full max-w-none cursor-crosshair rounded-sm'
              : fullscreenFit
                ? 'block max-h-[calc(100dvh-9rem)] w-auto max-w-full cursor-crosshair rounded-sm'
                : 'block max-h-64 w-auto max-w-full cursor-crosshair'
          }
        />
        {renderAnchorMarkers()}
        {!fullscreen && (
          <div className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[9.5px] text-amber-200">
            Click image to place anchor A{activeSlot + 1}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div
        data-testid="a2ui-raster-underlay"
        className="space-y-3 p-3 text-xs text-slate-300"
      >
        <div
          data-testid="underlay-workflow-progress"
          data-complete={underlayWorkflow.isComplete ? 'true' : undefined}
          className={`rounded-lg border px-2.5 py-2 ${
            underlayWorkflow.isComplete
              ? 'border-emerald-400/25 bg-emerald-400/[0.05]'
              : 'border-amber-400/20 bg-amber-400/[0.04]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-[9px] font-bold uppercase tracking-[0.14em] ${
                underlayWorkflow.isComplete ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              Underlay workflow
            </span>
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-slate-500">
              {underlayWorkflow.progressLabel}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {underlayWorkflow.steps.map((step, index) => (
              <span key={step.id} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border font-mono text-[8px] font-bold ${
                    step.status === 'complete'
                      ? 'border-emerald-400/50 bg-emerald-400/20 text-emerald-200'
                      : step.status === 'current'
                        ? 'border-amber-300/50 bg-amber-400/15 text-amber-100'
                        : 'border-white/15 text-slate-500'
                  }`}
                >
                  {step.status === 'complete' ? '✓' : index + 1}
                </span>
                <span
                  className={`text-[10px] ${
                    step.status === 'current'
                      ? 'font-semibold text-slate-100'
                      : step.status === 'complete'
                        ? 'text-slate-300'
                        : 'text-slate-500'
                  }`}
                >
                  {step.label}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                Import
              </div>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Drop in a plan PDF or raster scan, then pin two anchor pairs.
              </p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="shrink-0 rounded-md border border-amber-500/40 bg-amber-500/15 px-2.5 py-1.5 text-[11px] font-bold text-amber-200 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
            >
              {isImporting ? 'Importing…' : 'Choose file'}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf,image/*"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          {pdfFile && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="truncate text-[10px] text-slate-400" title={pdfFile.name}>
                {pdfFile.name}
              </span>
              <input
                type="number"
                min={1}
                value={pdfPage}
                onChange={event =>
                  setPdfPage(Math.max(1, Math.round(Number(event.target.value) || 1)))
                }
                className="w-14 rounded border border-white/15 bg-[#0b1420] px-1.5 py-0.5 font-mono text-[11px] text-white"
                title="PDF page number"
              />
              <button
                type="button"
                onClick={() => void loadPdfPage()}
                disabled={isImporting}
                className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-200 hover:bg-white/10 disabled:opacity-50"
              >
                Load page
              </button>
            </div>
          )}
          {status && <p className="mt-2 text-[10px] leading-snug text-cyan-300">{status}</p>}
        </div>

        {underlays.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Placed underlays ({underlays.length})
            </div>
            {underlays.map(underlay => (
              <div
                key={underlay.id}
                className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${
                  underlay.id === selectedId
                    ? 'border-amber-500/50 bg-amber-500/10'
                    : 'border-white/10 bg-black/20 hover:border-white/20'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(underlay.id)}
                  className="min-w-0 flex-1 text-left"
                  title={`Select ${underlay.name}`}
                >
                  <div className="truncate text-[11px] font-semibold text-slate-200">
                    {underlay.name}
                  </div>
                  <div className="text-[9.5px] text-slate-500">
                    {underlay.kind === 'pdf'
                      ? `PDF page ${underlay.pageNumber ?? 1}`
                      : 'Raster image'}
                    {' · '}
                    {underlay.imageWidth}×{underlay.imageHeight}px
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate(underlay.id, { visible: !underlay.visible })}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    underlay.visible ? 'bg-cyan-500/20 text-cyan-200' : 'bg-white/5 text-slate-500'
                  }`}
                  title={underlay.visible ? 'Hide underlay' : 'Show underlay'}
                >
                  {underlay.visible ? 'On' : 'Off'}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(underlay.id)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-500/20"
                  title="Delete underlay"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {selected && (
          <>
            <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Placement
              </div>
              <label className="flex items-center gap-2">
                <span className="w-24 text-[11px] text-slate-400">Width</span>
                <input
                  type="number"
                  min={0.001}
                  step={1}
                  value={Math.round(selected.transform.scale * selected.imageWidth * 1000) / 1000}
                  onChange={event => updateWidth(Number(event.target.value))}
                  className="min-w-0 flex-1 rounded border border-white/15 bg-[#0b1420] px-2 py-1 font-mono text-[11px] text-white"
                />
                <span className="text-[10px] text-slate-500">drawing units</span>
              </label>
              <label className="flex items-center gap-2">
                <span className="w-24 text-[11px] text-slate-400">Rotation</span>
                <input
                  type="number"
                  step={1}
                  value={Math.round(selected.transform.rotationDeg * 1000) / 1000}
                  onChange={event =>
                    patchTransform({ rotationDeg: Number(event.target.value) || 0 })
                  }
                  className="min-w-0 flex-1 rounded border border-white/15 bg-[#0b1420] px-2 py-1 font-mono text-[11px] text-white"
                />
                <span className="text-[10px] text-slate-500">deg</span>
              </label>
              <label className="flex items-center gap-2">
                <span className="w-24 text-[11px] text-slate-400">Opacity</span>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={selected.opacity}
                  onChange={event => patchSelected({ opacity: Number(event.target.value) })}
                  className="min-w-0 flex-1 accent-amber-400"
                />
                <span className="w-8 text-right font-mono text-[10px] text-slate-400">
                  {Math.round(selected.opacity * 100)}%
                </span>
              </label>
              <div className="flex items-center gap-3 pt-0.5 text-[11px]">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={selected.visible}
                    onChange={event => patchSelected({ visible: event.target.checked })}
                    className="accent-cyan-500"
                  />
                  Visible
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={selected.locked}
                    onChange={event => patchSelected({ locked: event.target.checked })}
                    className="accent-amber-500"
                  />
                  Lock position
                </label>
                <span className="ml-auto text-[10px] text-slate-500">
                  Drag the image on the canvas to move it.
                </span>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Anchor pairs
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1">
                  {renderSlotButtons()}
                  <button
                    type="button"
                    onClick={() => {
                      applyFullscreenZoom('fit');
                      setIsAnchorFullscreen(true);
                    }}
                    data-testid="raster-underlay-anchor-fullscreen"
                    className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200 transition-colors hover:bg-amber-500/20"
                    title="Expand the anchor picker to the full screen"
                  >
                    <Maximize2 className="h-3 w-3" />
                    Fullscreen &amp; Zoom
                  </button>
                </div>
              </div>

              <div className="flex justify-center overflow-hidden rounded border border-white/15 bg-slate-900 p-1">
                {renderAnchorImage(false)}
              </div>

              {([0, 1] as AnchorSlot[]).map(slot => {
                const anchor = anchors[slot];
                return (
                  <div key={slot} className="grid grid-cols-[42px_1fr] items-center gap-2">
                    <span className="text-[10px] font-bold text-amber-300">A{slot + 1}</span>
                    <select
                      value={anchor?.pointNumber ?? ''}
                      onChange={event => assignPoint(slot, event.target.value)}
                      className="min-w-0 rounded border border-white/15 bg-[#0b1420] px-1.5 py-1 text-[11px] text-white"
                      title={`Associate anchor ${slot + 1} with a project point`}
                    >
                      <option value="">Associate project point…</option>
                      {sortedPoints.map(point => (
                        <option key={point.pointNumber} value={point.pointNumber}>
                          {point.pointNumber} — {point.description || 'point'}
                        </option>
                      ))}
                    </select>
                    <span className="col-start-2 text-[9.5px] text-slate-500">
                      {hasImageAnchor(anchor)
                        ? `image ${anchor!.imageX.toFixed(1)}, ${anchor!.imageY.toFixed(1)}px`
                        : 'no image point'}
                      {' · '}
                      {hasWorldAnchor(anchor)
                        ? `E ${anchor!.easting.toFixed(2)} N ${anchor!.northing.toFixed(2)}`
                        : 'no project point'}
                    </span>
                  </div>
                );
              })}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => applyFit(anchors, true)}
                  disabled={!canFit}
                  className="rounded border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-200 hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Recalculate scale and rotation from the two anchor pairs"
                >
                  Align to anchors
                </button>
                <button
                  type="button"
                  onClick={() => patchSelected({ anchors: [] })}
                  className="rounded border border-white/15 px-2 py-1 text-[10px] text-slate-400 hover:bg-white/10"
                >
                  Clear anchors
                </button>
                {canFit && (
                  <span className="ml-auto text-[9.5px] text-emerald-300">2 pairs ready</span>
                )}
              </div>
            </div>
          </>
        )}

        {underlays.length === 0 && (
          <p className="px-1 text-[11px] leading-relaxed text-slate-500">
            Imported images render beneath survey linework. Place two image anchors and
            associate each with a project point to scale and rotate the underlay into place.
          </p>
        )}
      </div>

      {isAnchorFullscreen &&
        selected &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-testid="raster-underlay-anchor-fullscreen-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Place anchor points on ${selected.name}`}
            className="fixed inset-0 z-[11000] flex flex-col bg-[#03070d]/97 text-slate-200 backdrop-blur-md"
          >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.02] px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-amber-200">
                  Place anchor points — {selected.name}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  Click the plan to set image anchor A{activeSlot + 1}. Switch slots above;
                  Esc or Exit fullscreen when done.
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                {renderSlotButtons()}
                <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5">
                  <span className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500">
                    Wheel to zoom
                  </span>
                  <button
                    type="button"
                    onClick={() => applyFullscreenZoom('fit')}
                    title="Reset zoom to fit"
                    data-testid="raster-underlay-zoom-label"
                    className="min-w-[46px] rounded px-1 py-0.5 text-center font-mono text-[10px] font-semibold text-amber-200 hover:bg-white/10"
                  >
                    {fullscreenZoom === 'fit' ? 'Fit' : `${Math.round(fullscreenZoom * 100)}%`}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAnchorFullscreen(false)}
                  className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-100 transition-colors hover:bg-amber-500/25"
                  title="Exit fullscreen anchor picker (Esc)"
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                  Exit fullscreen
                </button>
              </div>
            </div>

            <div
              ref={anchorViewportRef}
              data-testid="raster-underlay-anchor-viewport"
              className="min-h-0 flex-1 overflow-auto overscroll-contain p-3"
            >
              <div
                className={
                  fullscreenZoom === 'fit'
                    ? 'flex min-h-full items-center justify-center'
                    : 'flex min-h-full w-max min-w-full items-start justify-start'
                }
              >
                {renderAnchorImage(true)}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-black/20 px-4 py-2 text-[10.5px] text-slate-400">
              <span className="text-amber-200/90">
                {lastPick ?? `Click the image to set anchor A${activeSlot + 1}.`}
                <span className="ml-2 text-slate-500">
                  Scroll to zoom at the cursor; drag the scrollbars to pan.
                </span>
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                {hasImageAnchor(anchors[0])
                  ? `A1 ${anchors[0].imageX.toFixed(1)}, ${anchors[0].imageY.toFixed(1)}px`
                  : 'A1 not set'}
                {' · '}
                {hasImageAnchor(anchors[1])
                  ? `A2 ${anchors[1].imageX.toFixed(1)}, ${anchors[1].imageY.toFixed(1)}px`
                  : 'A2 not set'}
              </span>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

export default A2UIRasterUnderlay;
