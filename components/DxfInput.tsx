
import React, { useState, useCallback } from 'react';
import { DxfIcon } from './icons';
import { UploadShell, UploadPanel, UploadDropzone, UploadPrimaryButton, UploadGhostButton } from './UploadShell.tsx';
import { useErrorReporter } from '../contexts/AppStateContext';
import { parseDxfLayers } from '../utils/dxfLayerParser';

interface DxfUploadOptions {
  smoothSplines?: boolean;
  quantizationBits?: 16 | 32;
  splineLayers?: string[];
}

interface DxfInputProps {
  onDxfUploaded: (content: string, fileName: string, options?: DxfUploadOptions) => void;
  onGoBack: () => void;
  backButtonTitle?: string;
}

const DxfInput: React.FC<DxfInputProps> = ({ onDxfUploaded, onGoBack, backButtonTitle = 'Go to Home Screen' }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [smoothSplines, setSmoothSplines] = useState(false);
  const [quantizationBits, setQuantizationBits] = useState<16 | 32>(16);
  const [splineLayersText, setSplineLayersText] = useState('');
  const [pending, setPending] = useState<{ name: string; content: string; layers: { name: string; entityCount: number }[] } | null>(null);
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(new Set());
  const [layerSearch, setLayerSearch] = useState('');
  const { reportError } = useErrorReporter();

  const handleFile = useCallback((file: File) => {
    if (file && (file.name.toLowerCase().endsWith('.dxf') || file.type === 'application/dxf' || file.type === 'image/vnd.dxf' || file.type === 'text/plain')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        if (smoothSplines) {
          const layers = parseDxfLayers(content).layers.map(l => ({ name: l.name, entityCount: l.entityCount }));
          setPending({ name: file.name, content, layers });
          setSelectedLayers(new Set());
          setLayerSearch('');
          return;
        }
        onDxfUploaded(content, file.name, { smoothSplines, quantizationBits });
      };
      reader.readAsText(file);
    } else {
      reportError({ title: 'Invalid file', message: 'Please upload a valid .dxf file.' });
    }
  }, [onDxfUploaded, reportError, smoothSplines, quantizationBits]);

  const confirmLoad = useCallback(() => {
    if (!pending) return;
    onDxfUploaded(pending.content, pending.name, { smoothSplines, quantizationBits, splineLayers: Array.from(selectedLayers) });
    setPending(null);
  }, [pending, onDxfUploaded, smoothSplines, quantizationBits, selectedLayers]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  }, [handleFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const handleClick = () => {
    document.getElementById('dxf-file-input')?.click();
  };

  return (
    <UploadShell
      icon={DxfIcon}
      accent="#818cf8"
      title="DXF Agent"
      description="Drop a .dxf to draw it immediately on the canvas, then analyze layers, entities, and CAD geometry with the agent."
      onGoBack={onGoBack}
      backTitle={backButtonTitle}
    >
      <UploadPanel>
        <UploadDropzone
          id="dxf-file-input"
          accept=".dxf,application/dxf,image/vnd.dxf,text/plain"
          onFiles={(selected) => {
            const file = selected?.[0];
            if (file) handleFile(file);
          }}
          onDrop={handleDrop}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          isDragging={isDragging}
          title="Drop your .dxf file here"
          hint="or click to browse local files"
          icon={DxfIcon}
        />

        <div className="mt-3.5 flex flex-col gap-2.5">
          <label className="flex cursor-pointer select-none items-center gap-2.5 rounded-lg border border-white/[0.08] bg-black/20 px-3.5 py-2.5 text-[12px] text-slate-300 transition-colors hover:border-[color:var(--up-accent)]">
            <input
              type="checkbox"
              checked={smoothSplines}
              onChange={(e) => setSmoothSplines(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-white/20 accent-indigo-500"
            />
            <span className="flex-1 font-medium text-slate-200">Convert long segment strings to weighted T-splines</span>
            <span className="rounded border border-[color:var(--up-accent)]/40 bg-indigo-500/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-indigo-300">
              Smooth
            </span>
          </label>

          {smoothSplines && (
            <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-white/[0.08] bg-black/20 px-3.5 py-2.5 text-[11.5px] text-slate-400">
              <span className="font-medium text-slate-400">Quantization</span>
              <div className="inline-flex overflow-hidden rounded-md border border-white/[0.10]">
                <button
                  type="button"
                  onClick={() => setQuantizationBits(16)}
                  className={`px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors ${
                    quantizationBits === 16 ? 'bg-indigo-500/80 text-white' : 'text-slate-400 hover:bg-white/[0.06]'
                  }`}
                  title="16-bit fixed point bounding-box grid (65,535 steps) with smart curvature decimation"
                >
                  16-bit
                </button>
                <button
                  type="button"
                  onClick={() => setQuantizationBits(32)}
                  className={`border-l border-white/[0.10] px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors ${
                    quantizationBits === 32 ? 'bg-indigo-500/80 text-white' : 'text-slate-400 hover:bg-white/[0.06]'
                  }`}
                  title="32-bit high-precision grid (4.29B steps) with smart curvature decimation"
                >
                  32-bit
                </button>
              </div>
              <span className="text-[10.5px] text-slate-500">Precision grows with sheet size — 16-bit is plenty for most plans.</span>
            </div>
          )}
        </div>
      </UploadPanel>

      {pending && (() => {
        const term = layerSearch.trim().toLowerCase();
        const visible = term ? pending.layers.filter(l => l.name.toLowerCase().includes(term)) : pending.layers;
        return (
          <UploadPanel
            eyebrow="Spline conversion"
            title={`${pending.name} — layers to smooth`}
            action={
              <span className="flex gap-3 text-[10.5px] font-medium">
                <button type="button" className="text-indigo-300 hover:text-indigo-200" onClick={() => setSelectedLayers(prev => new Set([...prev, ...visible.map(l => l.name)]))}>{term ? 'Select shown' : 'All'}</button>
                <button type="button" className="text-slate-500 hover:text-slate-300" onClick={() => setSelectedLayers(prev => { const next = new Set(prev); visible.forEach(l => next.delete(l.name)); return next; })}>{term ? 'Clear shown' : 'None'}</button>
              </span>
            }
          >
            <input
              type="search"
              value={layerSearch}
              onChange={(e) => setLayerSearch(e.target.value)}
              placeholder="Search layers (matches anywhere in name)"
              className="mb-2 w-full rounded-md border border-white/[0.08] bg-black/30 px-2.5 py-1.5 text-[11.5px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-[color:var(--up-accent)]"
            />
            <p className="mb-2 text-[10.5px] text-slate-500">None checked = smooth every layer.</p>
            <div className="grid max-h-48 grid-cols-1 gap-0.5 overflow-y-auto">
              {visible.length === 0 && <span className="text-[11px] text-slate-500">No matching layers</span>}
              {visible.map(l => (
                <label key={l.name} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[11.5px] text-slate-300 hover:bg-white/[0.04]">
                  <input
                    type="checkbox"
                    checked={selectedLayers.has(l.name)}
                    onChange={(e) => setSelectedLayers(prev => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(l.name); else next.delete(l.name);
                      return next;
                    })}
                    className="h-3.5 w-3.5 rounded border-white/20 accent-indigo-500"
                  />
                  <span className="truncate font-mono">{l.name}</span>
                  <span className="ml-auto text-slate-500">{l.entityCount}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <UploadGhostButton onClick={() => setPending(null)}>Cancel</UploadGhostButton>
              <UploadPrimaryButton onClick={confirmLoad}>Load drawing</UploadPrimaryButton>
            </div>
          </UploadPanel>
        );
      })()}
    </UploadShell>
  );
};

export default DxfInput;