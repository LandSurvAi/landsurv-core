import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  FilePlus2,
  FileText,
  Replace,
  Save,
  Search,
  Upload,
  WrapText,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { type SessionFile, type PointList } from '../types';
import { CommandHelpView, type CommandReference } from './CommandHelpView';

export type TextEditorTone = 'normal' | 'ok' | 'error' | 'info' | 'warn';

interface TextEditorPanelProps {
  files: (SessionFile | null)[];
  generatedFiles: SessionFile[];
  pointLists: PointList[];
  activeFile: string | null;
  onFileSelect: (fileName: string) => void;
  content: string;
  /** Terminal tone carried over when a command result is opened here. */
  contentTone?: TextEditorTone;
  /** Formatted HELP reference opened from the command line; renders as cards. */
  reference?: CommandReference | null;
  onContentChange: (newContent: string) => void;
  onSaveChanges: () => void;
  hasUnsavedChanges: boolean;
  /** Create and open a new .txt or .md file. */
  onCreateFile?: (fileName: string, content: string) => void;
  /** Import local .txt / .md files into the project list. */
  onImportTextFiles?: (files: SessionFile[]) => void;
}

const LINE_HEIGHT = 22;
const MIN_FONT_SIZE = 11;
const MAX_FONT_SIZE = 20;

/** Mirrors the command line's tone colors (emerald ok, sky info, amber warn, red error). */
const EDITOR_TONES: Record<TextEditorTone, { text: string; chip: string; label: string }> = {
  normal: { text: 'text-gray-200', chip: 'border-gray-700 bg-gray-800/40 text-gray-400', label: '' },
  ok: { text: 'text-emerald-300', chip: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', label: 'SUCCESS' },
  error: { text: 'text-red-300', chip: 'border-red-500/40 bg-red-500/10 text-red-300', label: 'ERROR' },
  info: { text: 'text-sky-300', chip: 'border-sky-500/40 bg-sky-500/10 text-sky-300', label: 'INFO' },
  warn: { text: 'text-amber-300', chip: 'border-amber-500/40 bg-amber-500/10 text-amber-300', label: 'WARNING' },
};

const TextEditorPanel: React.FC<TextEditorPanelProps> = ({
  files,
  generatedFiles,
  pointLists,
  activeFile,
  onFileSelect,
  content,
  contentTone = 'normal',
  reference = null,
  onContentChange,
  onSaveChanges,
  hasUnsavedChanges,
  onCreateFile,
  onImportTextFiles,
}) => {
  const [fontSize, setFontSize] = useState(13);
  const [wordWrap, setWordWrap] = useState(true);
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const [caret, setCaret] = useState({ line: 1, col: 1 });
  const [selectionLength, setSelectionLength] = useState(0);
  const [goToLine, setGoToLine] = useState('');
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<'reference' | 'source'>('source');
  const [isNewTextOpen, setIsNewTextOpen] = useState(false);
  const [newTextName, setNewTextName] = useState('');
  const [newTextFormat, setNewTextFormat] = useState<'.txt' | '.md'>('.md');

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const fileOptions = [...files.filter((f): f is SessionFile => f !== null), ...generatedFiles];
  const pointListOptions = pointLists.map(list => ({ name: list.name, content: '' }));
  const allOptions = [...fileOptions, ...pointListOptions];
  const uniqueOptions = Array.from(new Map(allOptions.map(item => [item.name, item])).values());

  const lineCount = Math.max(1, content.split('\n').length);
  const lineNumbers = useMemo(
    () => Array.from({ length: lineCount }, (_, index) => index + 1).join('\n'),
    [lineCount],
  );
  const eolLabel = content.includes('\r\n') ? 'CRLF' : 'LF';
  const tone = EDITOR_TONES[contentTone] ?? EDITOR_TONES.normal;
  const toneLabel = contentTone === 'normal' ? null : tone.label;
  // Editing the plain text leaves the formatted reference out of date.
  const isReferenceStale = Boolean(reference?.text) && content !== reference?.text;

  const matches = useMemo(() => {
    if (!query) return [] as number[];
    const haystack = matchCase ? content : content.toLowerCase();
    const needle = matchCase ? query : query.toLowerCase();
    const found: number[] = [];
    if (!needle) return found;
    let index = haystack.indexOf(needle);
    while (index !== -1 && found.length < 5000) {
      found.push(index);
      index = haystack.indexOf(needle, index + Math.max(1, needle.length));
    }
    return found;
  }, [content, query, matchCase]);

  const activeMatch = matches.length === 0 ? 0 : Math.min(matchIndex, matches.length - 1);

  useEffect(() => {
    setMatchIndex(0);
  }, [query, matchCase, activeFile]);

  useEffect(() => {
    if (!activeFile) {
      setIsFindOpen(false);
      setQuery('');
      setReplacement('');
      setCaret({ line: 1, col: 1 });
      setSelectionLength(0);
    }
  }, [activeFile]);

  // A command result opened with a formatted reference lands on the reference
  // view; the plain text stays one click away under SOURCE.
  useEffect(() => {
    setView(reference?.groups.length ? 'reference' : 'source');
  }, [reference]);

  const syncCaret = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const before = textarea.value.slice(0, start);
    const lines = before.split('\n');
    setCaret({ line: lines.length, col: (lines[lines.length - 1]?.length ?? 0) + 1 });
    setSelectionLength(Math.abs(textarea.selectionEnd - start));
  }, []);

  const selectMatch = useCallback((index: number) => {
    const textarea = textareaRef.current;
    if (!textarea || matches.length === 0) return;
    const normalized = ((index % matches.length) + matches.length) % matches.length;
    setMatchIndex(normalized);
    const start = matches[normalized];
    textarea.focus();
    textarea.setSelectionRange(start, start + query.length);
    const lineIndex = content.slice(0, start).split('\n').length - 1;
    textarea.scrollTop = Math.max(0, lineIndex * LINE_HEIGHT - textarea.clientHeight / 2);
    syncCaret();
  }, [matches, query, content, syncCaret]);

  const openFind = (withReplace: boolean) => {
    // Find and replace act on the editable text, so jump to SOURCE first.
    if (view === 'reference') setView('source');
    setIsFindOpen(true);
    setShowReplace(withReplace);
    window.setTimeout(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    }, 0);
  };

  const replaceCurrent = () => {
    if (matches.length === 0) return;
    const start = matches[activeMatch];
    onContentChange(content.slice(0, start) + replacement + content.slice(start + query.length));
    window.setTimeout(() => { findInputRef.current?.focus(); }, 0);
  };

  const replaceAll = () => {
    if (!query) return;
    if (matchCase) {
      onContentChange(content.split(query).join(replacement));
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      onContentChange(content.replace(new RegExp(escaped, 'gi'), () => replacement));
    }
    setMatchIndex(0);
  };

  const handleScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const jumpToLine = () => {
    const textarea = textareaRef.current;
    const target = Number.parseInt(goToLine, 10);
    if (!textarea || !Number.isFinite(target)) return;
    const line = Math.max(1, Math.min(lineCount, target));
    const offset = content.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0);
    textarea.focus();
    textarea.setSelectionRange(offset, offset);
    textarea.scrollTop = Math.max(0, (line - 1) * LINE_HEIGHT - textarea.clientHeight / 2);
    setGoToLine('');
    syncCaret();
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const createTextFile = () => {
    const base = newTextName.trim() || 'Untitled';
    const fileName = /\.(?:txt|md|markdown)$/i.test(base) ? base : `${base}${newTextFormat}`;
    onCreateFile?.(fileName, '');
    setIsNewTextOpen(false);
    setNewTextName('');
  };

  const importTextFiles = async (fileList: FileList | null) => {
    if (!fileList?.length || !onImportTextFiles) return;
    const imported = await Promise.all(
      Array.from(fileList).map(async file => ({ name: file.name, content: await file.text() })),
    );
    onImportTextFiles(imported);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const meta = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (meta && key === 's') {
      event.preventDefault();
      onSaveChanges();
      return;
    }
    if (meta && key === 'f') {
      event.preventDefault();
      openFind(false);
      return;
    }
    if (meta && key === 'h') {
      event.preventDefault();
      openFind(true);
      return;
    }
    if (event.key === 'Escape' && isFindOpen) {
      event.preventDefault();
      setIsFindOpen(false);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const textarea = event.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      onContentChange(content.slice(0, start) + '  ' + content.slice(end));
      window.setTimeout(() => {
        textarea.setSelectionRange(start + 2, start + 2);
        syncCaret();
      }, 0);
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-cyan-400/25 bg-[#070e18]/95 font-mono shadow-[0_18px_60px_-30px_rgba(34,211,238,0.35)]">
      <header className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-white/[0.02] px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 select-none text-xs font-bold leading-none text-cyan-300">A2UI</span>
          <span className="shrink-0 select-none text-xs font-bold leading-none text-gray-600">::</span>
          <FileText className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-[10px] font-extrabold uppercase leading-none tracking-[0.18em] text-gray-200">Text Editor</h3>
              {activeFile && /\.(?:md|markdown)$/i.test(activeFile) && (
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-[0.1em] text-emerald-300">
                  MD
                </span>
              )}
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-[0.1em] text-cyan-300">
                TXT / MD
              </span>
              {hasUnsavedChanges ? (
                <span className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-[0.1em] text-amber-300">
                  <AlertCircle className="h-2.5 w-2.5" /> Unsaved
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-[0.1em] text-emerald-300">
                  <Check className="h-2.5 w-2.5" /> Saved
                </span>
              )}
              {toneLabel && (
                <span className={`flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-[0.1em] ${tone.chip}`}>
                  {toneLabel}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <select
                value={activeFile || ''}
                onChange={(event) => onFileSelect(event.target.value)}
                aria-label="File"
                className="max-w-[280px] rounded border border-gray-800 bg-[#0b1220] px-1.5 py-0.5 font-mono text-[10px] text-gray-200 outline-none transition-colors focus:border-cyan-500/60"
              >
                <option value="" disabled>Select a file or point list to edit…</option>
                {uniqueOptions.map(file => (
                  <option key={file.name} value={file.name}>{file.name}</option>
                ))}
              </select>
              {activeFile && (
                <span className="hidden text-[9px] text-gray-500 sm:inline">
                  {lineCount.toLocaleString()} lines · {eolLabel} · UTF-8
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {reference?.groups.length ? (
            <div className="mr-1 flex items-center overflow-hidden rounded border border-gray-800 bg-[#0b1220]">
              <button
                type="button"
                onClick={() => setView('reference')}
                disabled={isReferenceStale}
                className={`px-1.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] transition-colors ${view === 'reference' ? 'bg-cyan-500/20 text-cyan-300' : 'text-gray-400 hover:bg-gray-800 hover:text-cyan-300'} disabled:cursor-not-allowed disabled:text-gray-600`}
                title={isReferenceStale ? 'The source text was edited — the formatted reference is out of date' : 'Formatted command reference'}
                aria-pressed={view === 'reference'}
              >
                Reference
              </button>
              <button
                type="button"
                onClick={() => setView('source')}
                className={`px-1.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] transition-colors ${view === 'source' ? 'bg-cyan-500/20 text-cyan-300' : 'text-gray-400 hover:bg-gray-800 hover:text-cyan-300'}`}
                title="Plain text (editable)"
                aria-pressed={view === 'source'}
              >
                Source
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setWordWrap(previous => !previous)}
            className={`rounded border p-1 transition-colors ${wordWrap ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' : 'border-gray-800 bg-[#0b1220] text-gray-400 hover:border-cyan-500/40 hover:text-cyan-300'}`}
            title={wordWrap ? 'Word wrap on' : 'Word wrap off'}
            aria-label="Toggle word wrap"
            aria-pressed={wordWrap}
          >
            <WrapText className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => openFind(false)}
            className={`rounded border p-1 transition-colors ${isFindOpen ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' : 'border-gray-800 bg-[#0b1220] text-gray-400 hover:border-cyan-500/40 hover:text-cyan-300'}`}
            title="Find (Ctrl+F)"
            aria-label="Find"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center overflow-hidden rounded border border-gray-800 bg-[#0b1220]">
            <button
              type="button"
              onClick={() => setFontSize(size => Math.max(MIN_FONT_SIZE, size - 1))}
              className="p-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-cyan-300 disabled:opacity-40"
              disabled={fontSize <= MIN_FONT_SIZE}
              title="Decrease font size"
              aria-label="Decrease font size"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="w-6 text-center text-[9px] tabular-nums text-gray-500">{fontSize}</span>
            <button
              type="button"
              onClick={() => setFontSize(size => Math.min(MAX_FONT_SIZE, size + 1))}
              className="p-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-cyan-300 disabled:opacity-40"
              disabled={fontSize >= MAX_FONT_SIZE}
              title="Increase font size"
              aria-label="Increase font size"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={copyAll}
            className="rounded border border-gray-800 bg-[#0b1220] p-1 text-gray-400 transition-colors hover:border-cyan-500/40 hover:text-cyan-300"
            title="Copy the whole file"
            aria-label="Copy all"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <FileText className="h-3.5 w-3.5" />}
          </button>
          {onCreateFile && (
            <button
              type="button"
              onClick={() => setIsNewTextOpen(previous => !previous)}
              className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] transition-colors ${
                isNewTextOpen
                  ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
                  : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:border-cyan-400/50 hover:bg-cyan-500/20'
              }`}
              title="Start a new .txt or .md document"
            >
              <FilePlus2 className="h-3 w-3" />
              New text
            </button>
          )}
          {onImportTextFiles && (
            <>
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className="inline-flex items-center gap-1 rounded border border-gray-800 bg-[#0b1220] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-gray-300 transition-colors hover:border-cyan-500/40 hover:text-cyan-200"
                title="Import a .txt or .md file"
              >
                <Upload className="h-3 w-3" />
                Import
              </button>
              <input
                ref={importInputRef}
                type="file"
                multiple
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                className="hidden"
                aria-label="Import text files"
                onChange={event => {
                  void importTextFiles(event.target.files);
                  event.target.value = '';
                }}
              />
            </>
          )}
          <button
            type="button"
            onClick={onSaveChanges}
            disabled={!hasUnsavedChanges}
            className="ml-1 inline-flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-300 transition-colors hover:border-emerald-400 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:border-gray-800 disabled:bg-transparent disabled:text-gray-600"
            title="Save changes (Ctrl+S)"
          >
            <Save className="h-3 w-3" />
            Save
          </button>
        </div>
      </header>

      {isNewTextOpen && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 border-b border-gray-800/80 bg-[#05080d] px-3 py-1.5">
          <FilePlus2 className="h-3.5 w-3.5 flex-shrink-0 text-cyan-400" />
          <input
            value={newTextName}
            onChange={event => setNewTextName(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                createTextFile();
              } else if (event.key === 'Escape') {
                setIsNewTextOpen(false);
              }
            }}
            placeholder="Untitled"
            aria-label="New text file name"
            className="min-w-[140px] flex-1 rounded border border-gray-800 bg-[#0b1220] px-1.5 py-0.5 font-mono text-[10px] text-gray-200 outline-none placeholder-gray-600 focus:border-cyan-500/60"
          />
          <select
            aria-label="New text format"
            value={newTextFormat}
            onChange={event => setNewTextFormat(event.target.value as '.txt' | '.md')}
            className="rounded border border-gray-800 bg-[#0b1220] px-1.5 py-0.5 font-mono text-[10px] text-gray-200 outline-none focus:border-cyan-500/60"
          >
            <option value=".md">Markdown (.md)</option>
            <option value=".txt">Plain text (.txt)</option>
          </select>
          <button
            type="button"
            onClick={createTextFile}
            className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-cyan-300 hover:border-cyan-400 hover:bg-cyan-500/20"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setIsNewTextOpen(false)}
            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-cyan-200"
            aria-label="Cancel new text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {isFindOpen && (
        <div className="flex flex-shrink-0 flex-col gap-1.5 border-b border-gray-800/80 bg-[#05080d] px-3 py-1.5">
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 flex-shrink-0 text-cyan-400" />
            <input
              ref={findInputRef}
              value={query}
              onChange={event => { setQuery(event.target.value); setMatchIndex(0); }}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  selectMatch(event.shiftKey ? activeMatch - 1 : activeMatch + 1);
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setIsFindOpen(false);
                }
              }}
              placeholder="Find in file"
              aria-label="Find in file"
              spellCheck={false}
              className="min-w-0 flex-1 rounded border border-gray-800 bg-[#0b1220] px-1.5 py-0.5 font-mono text-[10px] text-gray-200 outline-none placeholder-gray-600 focus:border-cyan-500/60"
            />
            <span className="w-20 flex-shrink-0 text-right text-[9px] tabular-nums text-gray-500">
              {query ? (matches.length > 0 ? `${activeMatch + 1} / ${matches.length}` : 'No matches') : ''}
            </span>
            <button
              type="button"
              onClick={() => selectMatch(activeMatch - 1)}
              disabled={matches.length === 0}
              className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-cyan-200 disabled:opacity-40"
              title="Previous match (Shift+Enter)"
              aria-label="Previous match"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => selectMatch(activeMatch + 1)}
              disabled={matches.length === 0}
              className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-cyan-200 disabled:opacity-40"
              title="Next match (Enter)"
              aria-label="Next match"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setMatchCase(previous => !previous)}
              className={`rounded px-1.5 py-0.5 text-[9px] font-bold transition-colors ${matchCase ? 'bg-cyan-500/20 text-cyan-300' : 'text-gray-400 hover:bg-gray-800 hover:text-cyan-200'}`}
              title="Match case"
              aria-label="Match case"
              aria-pressed={matchCase}
            >
              Aa
            </button>
            <button
              type="button"
              onClick={() => setShowReplace(previous => !previous)}
              className={`rounded p-1 transition-colors ${showReplace ? 'bg-cyan-500/20 text-cyan-300' : 'text-gray-400 hover:bg-gray-800 hover:text-cyan-200'}`}
              title="Toggle replace"
              aria-label="Toggle replace"
              aria-pressed={showReplace}
            >
              <Replace className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsFindOpen(false)}
              className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-cyan-200"
              title="Close find"
              aria-label="Close find"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {showReplace && (
            <div className="flex items-center gap-2 pl-5">
              <Replace className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" />
              <input
                value={replacement}
                onChange={event => setReplacement(event.target.value)}
                onKeyDown={event => { if (event.key === 'Escape') setIsFindOpen(false); }}
                placeholder="Replace with"
                aria-label="Replace with"
                spellCheck={false}
                className="min-w-0 flex-1 rounded border border-gray-800 bg-[#0b1220] px-1.5 py-0.5 font-mono text-[10px] text-gray-200 outline-none placeholder-gray-600 focus:border-cyan-500/60"
              />
              <button
                type="button"
                onClick={replaceCurrent}
                disabled={matches.length === 0}
                className="rounded border border-gray-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-gray-300 hover:border-cyan-500/40 hover:text-cyan-200 disabled:opacity-40"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={replaceAll}
                disabled={matches.length === 0}
                className="rounded border border-cyan-500/40 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-cyan-300 hover:border-cyan-400 hover:bg-cyan-500/20 disabled:opacity-40"
              >
                Replace all
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {activeFile && reference?.groups.length && view === 'reference' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#05080d] px-4 py-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-gray-500">
              <span className="font-extrabold uppercase tracking-[0.18em] text-gray-300">Commands:</span>
              <span className="text-gray-600">·</span>
              <span className="italic">grouped reference — switch to SOURCE to edit the plain text</span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-cyan-300">
                  {reference.groups.length} groups
                </span>
                <span className="rounded border border-gray-700 bg-gray-800/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-gray-400">
                  {reference.groups.reduce((total, group) => total + group.entries.length, 0)} commands
                </span>
              </span>
            </div>
            <CommandHelpView groups={reference.groups} notes={reference.notes} textScale={reference.textScale} />
          </div>
        ) : activeFile ? (
          <div className="flex min-h-0 flex-1 bg-[#05080d]">
            <div
              ref={gutterRef}
              className="flex-shrink-0 select-none overflow-hidden border-r border-gray-800/80 bg-[#080d14] py-3 text-right"
              style={{ width: `${Math.max(3, String(lineCount).length) + 1}ch`, minWidth: 48 }}
              aria-hidden="true"
            >
              <pre
                className="m-0 pr-2.5 text-gray-600"
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: fontSize - 1,
                  lineHeight: `${LINE_HEIGHT}px`,
                }}
              >
                {lineNumbers}
              </pre>
            </div>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={event => { onContentChange(event.target.value); window.setTimeout(syncCaret, 0); }}
              onScroll={handleScroll}
              onSelect={syncCaret}
              onClick={syncCaret}
              onKeyUp={syncCaret}
              onKeyDown={handleKeyDown}
              wrap={wordWrap ? 'soft' : 'off'}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              aria-label="Text content"
              className={`h-full w-full flex-1 resize-none overflow-auto bg-transparent px-3 py-3 font-mono caret-cyan-400 outline-none selection:bg-cyan-500/30 placeholder-gray-600 ${tone.text}`}
              style={{ fontSize, lineHeight: `${LINE_HEIGHT}px` }}
              placeholder={`Content of ${activeFile}…`}
            />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-sm rounded border border-cyan-500/25 bg-[#080d14] p-5 text-center">
              <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                <FileText className="h-4 w-4" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-300">No file open</p>
              <p className="mt-1 text-[10px] leading-relaxed text-gray-500">
                Choose a file above, start a new .txt or .md note, or open one from the File Manager.
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {onCreateFile && (
                  <button
                    type="button"
                    onClick={() => setIsNewTextOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-cyan-300 transition-colors hover:border-cyan-400 hover:bg-cyan-500/20"
                  >
                    <FilePlus2 className="h-3 w-3" />
                    New text
                  </button>
                )}
                {onImportTextFiles && (
                  <button
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded border border-gray-700 bg-gray-800/40 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-gray-300 transition-colors hover:border-cyan-500/40 hover:text-cyan-200"
                  >
                    <Upload className="h-3 w-3" />
                    Import .txt / .md
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-800/80 bg-[#080d14] px-3 py-1 text-[9px] text-gray-500">
        <span className="tabular-nums">Ln {caret.line}, Col {caret.col}</span>
        {selectionLength > 0 && <span className="tabular-nums text-cyan-400">{selectionLength.toLocaleString()} selected</span>}
        <span className="tabular-nums">{lineCount.toLocaleString()} lines</span>
        <span className="tabular-nums">{content.length.toLocaleString()} chars</span>
        <span>{eolLabel}</span>
        <span>UTF-8</span>
        <span className="hidden lg:inline">Ctrl+S save · Ctrl+F find · Ctrl+H replace · Tab inserts 2 spaces</span>
        <div className="ml-auto flex items-center gap-1.5">
          <label htmlFor="go-to-line" className="text-gray-500">Go to line</label>
          <input
            id="go-to-line"
            value={goToLine}
            onChange={event => setGoToLine(event.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                jumpToLine();
              }
            }}
            className="w-14 rounded border border-gray-800 bg-[#0b1220] px-1.5 py-0.5 text-center font-mono text-[9px] text-gray-200 outline-none placeholder-gray-600 focus:border-cyan-500/60"
            placeholder="1"
            aria-label="Go to line"
          />
        </div>
      </footer>
    </div>
  );
};

export default TextEditorPanel;
