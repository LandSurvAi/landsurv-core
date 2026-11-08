import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  FilePlus2,
  FileText,
  Maximize2,
  Save,
  Upload,
  X,
} from 'lucide-react';
import type { SessionFile } from '../types.ts';

export interface A2UITextEditorProps {
  /** Every project file the text surface may open. */
  files: SessionFile[];
  /** File to select when the surface opens. */
  initialFileName?: string | null;
  /** Inline content for a file that is not in the project list yet. */
  initialContent?: string | null;
  /** Open the New text form immediately. */
  initialMode?: 'edit' | 'new';
  onSaveFile?: (fileName: string, content: string) => void;
  onCreateFile?: (fileName: string, content: string) => void;
  onImportFile?: (fileName: string, content: string) => void;
  /** Hand the current file/content to the full workspace editor. */
  onOpenFullEditor?: (fileName: string, content: string) => void;
}

const TEXT_EXTENSION_RE = /\.(?:txt|md|markdown)$/i;
const FORMAT_OPTIONS = [
  { value: '.md', label: 'Markdown (.md)' },
  { value: '.txt', label: 'Plain text (.txt)' },
] as const;

function uniqueFileName(name: string, taken: Set<string>): string {
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  let index = 2;
  let candidate = `${base} (${index})${extension}`;
  while (taken.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${base} (${index})${extension}`;
  }
  return candidate;
}

/**
 * Compact text editor for the in-chat A2UI surface.
 *
 * The full TextEditorPanel remains the power-editor (line numbers, find,
 * replace, go-to-line). This surface is deliberately lighter so agents can
 * bring a deed transcript, note, or markdown file into the conversation
 * without taking over the canvas. It follows the same surface grammar as the
 * other A2UI tools: a compact header, one scrollable body, and a live footer.
 */
export const A2UITextEditor: React.FC<A2UITextEditorProps> = ({
  files,
  initialFileName = null,
  initialContent = null,
  initialMode = 'edit',
  onSaveFile,
  onCreateFile,
  onImportFile,
  onOpenFullEditor,
}) => {
  const fileMap = useMemo(() => {
    const map = new Map<string, SessionFile>();
    for (const file of files) map.set(file.name, file);
    return map;
  }, [files]);

  const [activeName, setActiveName] = useState<string | null>(() => {
    if (initialMode === 'new') return null;
    return initialFileName ?? files[0]?.name ?? null;
  });
  const [draft, setDraft] = useState<string>(() => {
    if (initialMode === 'new') return '';
    if (initialContent != null) return initialContent;
    if (initialFileName && fileMap.has(initialFileName)) {
      return fileMap.get(initialFileName)?.content ?? '';
    }
    return files[0]?.content ?? '';
  });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isNewOpen, setIsNewOpen] = useState(initialMode === 'new' || files.length === 0);
  const [newName, setNewName] = useState('');
  const [newFormat, setNewFormat] = useState<(typeof FORMAT_OPTIONS)[number]['value']>('.md');
  const [feedback, setFeedback] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);

  // A new chat request can re-bind this surface to another file without
  // remounting the whole surface host.
  useEffect(() => {
    if (initialMode === 'new') {
      setActiveName(null);
      setDraft('');
      setIsNewOpen(true);
      setDirty(false);
      setSaved(false);
      return;
    }
    if (!initialFileName) return;
    const file = fileMap.get(initialFileName);
    setActiveName(initialFileName);
    setDraft(initialContent ?? file?.content ?? '');
    setIsNewOpen(false);
    setDirty(false);
    setSaved(false);
    setFeedback(null);
    // Deliberately bind to the request identity, not every file-list refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFileName, initialContent, initialMode]);

  const activeFile = activeName ? fileMap.get(activeName) : undefined;
  const activeContent = activeName ? draft : '';
  const lineCount = activeName ? Math.max(1, activeContent.split('\n').length) : 0;
  const wordCount = activeName
    ? (activeContent.trim().match(/\S+/g)?.length ?? 0)
    : 0;
  const isMarkdown = Boolean(activeName && /\.(?:md|markdown)$/i.test(activeName));
  const selectableNames = useMemo(() => {
    const names = Array.from(fileMap.keys());
    if (activeName && !fileMap.has(activeName)) names.unshift(activeName);
    return names;
  }, [activeName, fileMap]);

  const selectFile = (name: string) => {
    const file = fileMap.get(name);
    setActiveName(name);
    setDraft(file?.content ?? '');
    setIsNewOpen(false);
    setDirty(false);
    setSaved(false);
    setFeedback(null);
  };

  const openNewTextForm = () => {
    setIsNewOpen(true);
    setNewName('');
    setFeedback(null);
  };

  const createTextFile = () => {
    const base = newName.trim() || 'Untitled';
    const fileName = TEXT_EXTENSION_RE.test(base) ? base : `${base}${newFormat}`;
    const finalName = uniqueFileName(fileName, new Set(fileMap.keys()));
    onCreateFile?.(finalName, '');
    setActiveName(finalName);
    setDraft('');
    setDirty(false);
    setSaved(false);
    setIsNewOpen(false);
    setNewName('');
    setFeedback(`Created ${finalName}`);
  };

  const saveFile = () => {
    if (!activeName) return;
    onSaveFile?.(activeName, draft);
    setDirty(false);
    setSaved(true);
    setFeedback(`Saved ${activeName}`);
  };

  const openFullEditor = () => {
    if (!activeName) return;
    onOpenFullEditor?.(activeName, draft);
  };

  const importFile = async (file: File) => {
    try {
      const content = await file.text();
      const fileName = uniqueFileName(file.name, new Set(fileMap.keys()));
      onImportFile?.(fileName, content);
      setActiveName(fileName);
      setDraft(content);
      setIsNewOpen(false);
      setDirty(false);
      setSaved(false);
      setFeedback(`Imported ${fileName}`);
    } catch {
      setFeedback('Could not read that text file.');
    }
  };

  return (
    <div
      data-testid="a2ui-text-editor"
      className="flex min-h-[340px] w-full flex-col font-mono text-slate-200"
    >
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.08] bg-white/[0.02] px-2.5 py-2">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/25 bg-cyan-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-cyan-200">
          <FileText className="h-3 w-3" />
          Text
        </span>
        <select
          aria-label="Text file"
          value={activeName ?? ''}
          onChange={event => selectFile(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-white/[0.09] bg-[#050b13] px-2 py-1 text-[11px] text-slate-200 outline-none transition-colors focus:border-cyan-400/50"
        >
          <option value="" disabled>
            Select a text file…
          </option>
          {selectableNames.map(name => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {isMarkdown && (
          <span className="rounded border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.1em] text-emerald-200">
            MD
          </span>
        )}
        <button
          type="button"
          onClick={openNewTextForm}
          className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[9.5px] font-semibold text-cyan-200 transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/20"
          title="Start a new .txt or .md note"
        >
          <FilePlus2 className="h-3 w-3" />
          New text
        </button>
        <button
          type="button"
          onClick={() => importRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-md border border-white/[0.09] bg-white/[0.03] px-2 py-1 text-[9.5px] font-semibold text-slate-300 transition-colors hover:border-cyan-400/35 hover:text-cyan-200"
          title="Import a .txt or .md file"
        >
          <Upload className="h-3 w-3" />
          Import
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".txt,.md,.markdown,text/plain,text/markdown"
          className="hidden"
          aria-label="Import text file"
          onChange={event => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={openFullEditor}
          disabled={!activeName}
          className="inline-flex items-center gap-1 rounded-md border border-white/[0.09] bg-white/[0.03] px-2 py-1 text-[9.5px] font-semibold text-slate-300 transition-colors hover:border-cyan-400/35 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
          title="Open this file in the full Text Editor"
        >
          <Maximize2 className="h-3 w-3" />
          Full editor
        </button>
      </div>

      {isNewOpen && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.08] bg-[#050b13] px-2.5 py-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-cyan-300">
            New text
          </span>
          <input
            value={newName}
            onChange={event => setNewName(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                createTextFile();
              }
            }}
            placeholder="Untitled"
            aria-label="New text file name"
            className="min-w-[120px] flex-1 rounded-md border border-white/[0.09] bg-[#070e18] px-2 py-1 text-[11px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
          />
          <select
            aria-label="New text format"
            value={newFormat}
            onChange={event =>
              setNewFormat(event.target.value as (typeof FORMAT_OPTIONS)[number]['value'])
            }
            className="rounded-md border border-white/[0.09] bg-[#070e18] px-2 py-1 text-[10px] text-slate-200 outline-none focus:border-cyan-400/50"
          >
            {FORMAT_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={createTextFile}
            className="rounded-md border border-cyan-400/40 bg-cyan-400/15 px-2 py-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-cyan-100 transition-colors hover:bg-cyan-400/25"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setIsNewOpen(false)}
            aria-label="Cancel new text"
            className="rounded-md border border-white/[0.08] p-1 text-slate-400 transition-colors hover:text-slate-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {activeName ? (
        <textarea
          value={draft}
          onChange={event => {
            setDraft(event.target.value);
            setDirty(true);
            setSaved(false);
            setFeedback(null);
          }}
          spellCheck={false}
          aria-label="A2UI text content"
          className="min-h-[220px] flex-1 resize-y overflow-auto bg-[#050b13] px-3 py-2.5 font-mono text-[12px] leading-5 text-slate-200 caret-cyan-300 outline-none selection:bg-cyan-500/25"
          placeholder={`Content of ${activeName}…`}
        />
      ) : (
        <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-2 bg-[#050b13] px-5 text-center">
          <FileText className="h-6 w-6 text-cyan-300/70" />
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300">
            No text open
          </p>
          <p className="max-w-[300px] text-[10.5px] leading-relaxed text-slate-500">
            Choose a project file above, start a new .txt or .md note, or import a
            text file. Every agent can open this same surface.
          </p>
          <button
            type="button"
            onClick={openNewTextForm}
            className="mt-1 inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1.5 text-[10px] font-semibold text-cyan-200 transition-colors hover:bg-cyan-400/20"
          >
            <FilePlus2 className="h-3 w-3" />
            New text
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[8.5px] text-slate-500">
        <span className="tabular-nums">{lineCount.toLocaleString()} lines</span>
        <span className="tabular-nums">{wordCount.toLocaleString()} words</span>
        <span className="tabular-nums">{activeContent.length.toLocaleString()} chars</span>
        {activeFile?.name.endsWith('.md') && <span>UTF-8 · Markdown</span>}
        {feedback && (
          <span className="inline-flex items-center gap-1 text-emerald-300">
            <Check className="h-2.5 w-2.5" />
            {feedback}
          </span>
        )}
        {dirty && <span className="text-amber-300">Unsaved changes</span>}
        <button
          type="button"
          onClick={saveFile}
          disabled={!activeName || (!dirty && saved)}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-emerald-200 transition-colors hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save className="h-3 w-3" />
          Save
        </button>
      </div>
    </div>
  );
};

export default A2UITextEditor;
