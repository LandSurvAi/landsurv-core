import React, { useState, useCallback, useMemo } from 'react';
import type { LegalWriterStylePrefs } from '../types.ts';

interface LegalWriterPanelProps {
    /** Initial legal text generated from the boundary file. */
    initialText: string;
    /** Display name of the source boundary file (used in the download filename). */
    fileName: string;
    /** Initial style prefs the legal text was generated with. */
    initialStylePrefs?: LegalWriterStylePrefs;
    /**
     * Re-run the writer with new style prefs. Should return the regenerated
     * text. Async so the host can pull fresh state / call AI rewriters later.
     */
    onRegenerate: (stylePrefs: LegalWriterStylePrefs) => Promise<string> | string;
    /** Return to the canvas view. */
    onBack: () => void;
}

const PRESET_OPTIONS: Array<{ value: NonNullable<LegalWriterStylePrefs['preset']>; label: string }> = [
    { value: 'default', label: 'Default — generic intro' },
    { value: 'pa-conventional', label: 'Pennsylvania — conventional' },
    { value: 'tx-conventional', label: 'Texas — conventional' },
    { value: 'concise', label: 'Concise — no preamble' },
];

const LegalWriterPanel: React.FC<LegalWriterPanelProps> = ({
    initialText,
    fileName,
    initialStylePrefs,
    onRegenerate,
    onBack,
}) => {
    const [text, setText] = useState<string>(initialText);
    const [prefs, setPrefs] = useState<LegalWriterStylePrefs>(() => ({
        includeHeading: true,
        includeAcreage: true,
        includePobCoords: true,
        preset: 'default',
        notes: '',
        examples: [],
        ...(initialStylePrefs || {}),
    }));
    const [busy, setBusy] = useState(false);
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

    const safeFileName = useMemo(
        () => `${(fileName || 'legal').replace(/[^a-z0-9._-]/gi, '_')}_legal.txt`,
        [fileName],
    );

    const handleRegenerate = useCallback(async () => {
        setBusy(true);
        try {
            const next = await onRegenerate(prefs);
            setText(next);
        } finally {
            setBusy(false);
        }
    }, [onRegenerate, prefs]);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopyStatus('copied');
            setTimeout(() => setCopyStatus('idle'), 1500);
        } catch {
            /* ignore */
        }
    }, [text]);

    const handleDownload = useCallback(() => {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = safeFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [text, safeFileName]);

    const handleUploadExample = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const content = String(reader.result || '');
            if (!content.trim()) return;
            setPrefs(p => ({ ...p, examples: [...(p.examples || []), content] }));
        };
        reader.readAsText(file);
        // reset so the same file can be re-picked
        e.target.value = '';
    }, []);

    const removeExample = useCallback((idx: number) => {
        setPrefs(p => ({ ...p, examples: (p.examples || []).filter((_, i) => i !== idx) }));
    }, []);

    return (
        <div className="w-full h-full flex flex-col bg-gray-900 text-gray-100">
            {/* Header strip */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-700 bg-gray-800/60">
                <button
                    onClick={onBack}
                    className="px-3 py-1 text-xs font-semibold rounded bg-gray-700 hover:bg-gray-600 text-gray-100"
                    title="Return to canvas"
                >
                    ← Back to Canvas
                </button>
                <span className="text-sm font-semibold text-indigo-300">Legal Writer</span>
                <span className="text-xs text-gray-500">— {fileName}</span>
                <div className="flex-grow" />
                <button
                    onClick={handleCopy}
                    className="px-3 py-1 text-xs font-semibold rounded bg-gray-700 hover:bg-gray-600 text-gray-100"
                    title="Copy to clipboard"
                >
                    {copyStatus === 'copied' ? 'Copied ✓' : 'Copy'}
                </button>
                <button
                    onClick={handleDownload}
                    className="px-3 py-1 text-xs font-semibold rounded bg-emerald-700 hover:bg-emerald-600 text-white"
                    title="Download as .txt"
                >
                    Download .txt
                </button>
            </div>

            {/* Body: legal text on the left, style panel on the right */}
            <div className="flex-1 min-h-0 flex">
                <div className="flex-1 min-w-0 p-4">
                    <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        spellCheck={false}
                        className="w-full h-full p-4 bg-gray-950 text-gray-100 font-mono text-sm rounded border border-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                </div>

                <aside className="w-80 border-l border-gray-700 bg-gray-900/80 p-4 overflow-y-auto">
                    <h3 className="text-sm font-semibold text-indigo-300 mb-3">Standardization</h3>

                    <label className="block text-xs text-gray-400 mb-1">Preset</label>
                    <select
                        value={prefs.preset ?? 'default'}
                        onChange={e => setPrefs(p => ({ ...p, preset: e.target.value as LegalWriterStylePrefs['preset'] }))}
                        className="w-full mb-4 px-2 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-gray-100"
                    >
                        {PRESET_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>

                    <div className="space-y-2 mb-4">
                        <label className="flex items-center gap-2 text-xs text-gray-300">
                            <input
                                type="checkbox"
                                checked={prefs.includeHeading ?? true}
                                onChange={e => setPrefs(p => ({ ...p, includeHeading: e.target.checked }))}
                            />
                            Include heading block
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-300">
                            <input
                                type="checkbox"
                                checked={prefs.includePobCoords ?? true}
                                onChange={e => setPrefs(p => ({ ...p, includePobCoords: e.target.checked }))}
                            />
                            Show POB N/E coordinates
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-300">
                            <input
                                type="checkbox"
                                checked={prefs.includeAcreage ?? true}
                                onChange={e => setPrefs(p => ({ ...p, includeAcreage: e.target.checked }))}
                            />
                            Include acreage sentence
                        </label>
                    </div>

                    <label className="block text-xs text-gray-400 mb-1">Style notes (optional)</label>
                    <textarea
                        value={prefs.notes ?? ''}
                        onChange={e => setPrefs(p => ({ ...p, notes: e.target.value }))}
                        rows={4}
                        placeholder='e.g. "Reference Deed Book 1234, page 56." Notes are appended at the end and will be passed to the AI rewriter in a future release.'
                        className="w-full mb-4 px-2 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />

                    <label className="block text-xs text-gray-400 mb-1">Example legal descriptions</label>
                    <p className="text-[10px] text-gray-500 mb-2">
                        Upload a .txt of an existing legal you want the writer to imitate. (Currently stored for review; AI-driven rewrite hooks land next.)
                    </p>
                    <label className="block w-full px-2 py-1.5 mb-2 text-xs text-center rounded border border-dashed border-gray-600 text-gray-300 cursor-pointer hover:bg-gray-800">
                        + Upload example (.txt)
                        <input type="file" accept=".txt,text/plain" onChange={handleUploadExample} className="hidden" />
                    </label>
                    {(prefs.examples || []).length > 0 && (
                        <ul className="space-y-1 mb-4">
                            {(prefs.examples || []).map((ex, i) => (
                                <li key={i} className="flex items-center gap-2 px-2 py-1 bg-gray-800 rounded text-[11px] text-gray-300">
                                    <span className="flex-grow truncate" title={ex.slice(0, 200)}>Example #{i + 1} ({ex.length} chars)</span>
                                    <button
                                        onClick={() => removeExample(i)}
                                        className="text-rose-400 hover:text-rose-300"
                                        title="Remove"
                                    >×</button>
                                </li>
                            ))}
                        </ul>
                    )}

                    <button
                        onClick={handleRegenerate}
                        disabled={busy}
                        className="w-full px-3 py-2 mt-2 text-sm font-semibold rounded bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-700 text-white"
                    >
                        {busy ? 'Regenerating…' : 'Regenerate'}
                    </button>
                </aside>
            </div>
        </div>
    );
};

export default LegalWriterPanel;
