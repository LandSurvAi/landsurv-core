import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Replace,
  Save,
  Search,
  WrapText,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { type SessionFile, type PointList } from '../types';

interface TextEditorPanelProps {
  files: (SessionFile | null)[];
  generatedFiles: SessionFile[];
  pointLists: PointList[];
  activeFile: string | null;
  onFileSelect: (fileName: string) => void;
  content: string;
  onContentChange: (newContent: string) => void;
  onSaveChanges: () => void;
  hasUnsavedChanges: boolean;
}

const LINE_HEIGHT = 22;
const MIN_FONT_SIZE = 11;
const MAX_FONT_SIZE = 20;

const TextEditorPanel: React.FC<TextEditorPanelProps> = ({
  files,
  generatedFiles,
  pointLists,
  activeFile,
  onFileSelect,
  content,
  onContentChange,
  onSaveChanges,
  hasUnsavedChanges,
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

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);

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
    <div className="flex h-full w-full flex-col overflow-hidden rounded-md bg-gray-950 light-theme:bg-white">
      <header className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-700/50 bg-gray-900/80 px-4 py-2.5 backdrop-blur light-theme:border-gray-300 light-theme:bg-gray-50">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold leading-tight text-gray-100 light-theme:text-gray-800">Text Editor</h3>
              {hasUnsavedChanges ? (
                <span className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                  <AlertCircle className="h-3 w-3" /> Unsaved
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                  <Check className="h-3 w-3" /> Saved
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <select
                value={activeFile || ''}
                onChange={(event) => onFileSelect(event.target.value)}
                aria-label="File"
                className="max-w-[280px] rounded-md border border-gray-600 bg-gray-800 px-2 py-1 font-mono text-xs text-gray-100 outline-none focus:border-cyan-500 light-theme:border-gray-300 light-theme:bg-white light-theme:text-gray-900"
              >
                <option value="" disabled>Select a file or point list to edit…</option>
                {uniqueOptions.map(file => (
                  <option key={file.name} value={file.name}>{file.name}</option>
                ))}
              </select>
              {activeFile && (
                <span className="hidden text-[10px] text-gray-500 sm:inline">
                  {lineCount.toLocaleString()} lines · {eolLabel} · UTF-8
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setWordWrap(previous => !previous)}
            className={`rounded-md border p-1.5 transition-colors ${wordWrap ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' : 'border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
            title={wordWrap ? 'Word wrap on' : 'Word wrap off'}
            aria-label="Toggle word wrap"
            aria-pressed={wordWrap}
          >
            <WrapText className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => openFind(false)}
            className={`rounded-md border p-1.5 transition-colors ${isFindOpen ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' : 'border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
            title="Find (Ctrl+F)"
            aria-label="Find"
          >
            <Search className="h-4 w-4" />
          </button>
          <div className="flex items-center overflow-hidden rounded-md border border-gray-700">
            <button
              type="button"
              onClick={() => setFontSize(size => Math.max(MIN_FONT_SIZE, size - 1))}
              className="p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200 disabled:opacity-40"
              disabled={fontSize <= MIN_FONT_SIZE}
              title="Decrease font size"
              aria-label="Decrease font size"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="w-8 text-center text-[10px] tabular-nums text-gray-500">{fontSize}</span>
            <button
              type="button"
              onClick={() => setFontSize(size => Math.min(MAX_FONT_SIZE, size + 1))}
              className="p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200 disabled:opacity-40"
              disabled={fontSize >= MAX_FONT_SIZE}
              title="Increase font size"
              aria-label="Increase font size"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={copyAll}
            className="rounded-md border border-gray-700 p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
            title="Copy the whole file"
            aria-label="Copy all"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <FileText className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onSaveChanges}
            disabled={!hasUnsavedChanges}
            className="ml-1 flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
            title="Save changes (Ctrl+S)"
          >
            <Save className="h-4 w-4" />
            Save
          </button>
        </div>
      </header>

      {isFindOpen && (
        <div className="flex flex-shrink-0 flex-col gap-1.5 border-b border-gray-700/60 bg-gray-900/95 px-4 py-2 light-theme:border-gray-300 light-theme:bg-gray-100">
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
              className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 font-mono text-xs text-gray-100 outline-none placeholder-gray-500 focus:border-cyan-500"
            />
            <span className="w-20 flex-shrink-0 text-right text-[10px] tabular-nums text-gray-400">
              {query ? (matches.length > 0 ? `${activeMatch + 1} / ${matches.length}` : 'No matches') : ''}
            </span>
            <button
              type="button"
              onClick={() => selectMatch(activeMatch - 1)}
              disabled={matches.length === 0}
              className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-40"
              title="Previous match (Shift+Enter)"
              aria-label="Previous match"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => selectMatch(activeMatch + 1)}
              disabled={matches.length === 0}
              className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-40"
              title="Next match (Enter)"
              aria-label="Next match"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMatchCase(previous => !previous)}
              className={`rounded px-1.5 py-1 text-[10px] font-semibold transition-colors ${matchCase ? 'bg-cyan-500/20 text-cyan-300' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
              title="Match case"
              aria-label="Match case"
              aria-pressed={matchCase}
            >
              Aa
            </button>
            <button
              type="button"
              onClick={() => setShowReplace(previous => !previous)}
              className={`rounded p-1 transition-colors ${showReplace ? 'bg-cyan-500/20 text-cyan-300' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
              title="Toggle replace"
              aria-label="Toggle replace"
              aria-pressed={showReplace}
            >
              <Replace className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsFindOpen(false)}
              className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
              title="Close find"
              aria-label="Close find"
            >
              <X className="h-4 w-4" />
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
                className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-800 px-2 py-1 font-mono text-xs text-gray-100 outline-none placeholder-gray-500 focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={replaceCurrent}
                disabled={matches.length === 0}
                className="rounded border border-gray-600 px-2 py-1 text-[10px] font-medium text-gray-200 hover:bg-gray-800 disabled:opacity-40"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={replaceAll}
                disabled={matches.length === 0}
                className="rounded border border-cyan-600/60 bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40"
              >
                Replace all
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {activeFile ? (
          <div className="flex min-h-0 flex-1 bg-[#0b1220] light-theme:bg-gray-50">
            <div
              ref={gutterRef}
              className="flex-shrink-0 select-none overflow-hidden border-r border-gray-800/80 bg-gray-950/60 py-4 text-right light-theme:border-gray-300 light-theme:bg-gray-100"
              style={{ width: `${Math.max(3, String(lineCount).length) + 1}ch`, minWidth: 48 }}
              aria-hidden="true"
            >
              <pre
                className="m-0 pr-3 text-gray-600"
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
              className="h-full w-full flex-1 resize-none overflow-auto bg-transparent px-3 py-4 font-mono text-gray-100 caret-cyan-400 outline-none placeholder-gray-600 light-theme:text-gray-900"
              style={{ fontSize, lineHeight: `${LINE_HEIGHT}px` }}
              placeholder={`Content of ${activeFile}…`}
            />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-sm rounded-xl border border-gray-800 bg-gray-900/60 p-6 text-center light-theme:border-gray-300 light-theme:bg-gray-100">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                <FileText className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-gray-200 light-theme:text-gray-800">No file open</p>
              <p className="mt-1 text-xs text-gray-500">
                Choose a file or point list above, or open one from the File Manager to begin editing.
              </p>
            </div>
          </div>
        )}
      </div>

      <footer className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-800 bg-gray-900/80 px-4 py-1.5 text-[10px] text-gray-500 light-theme:border-gray-300 light-theme:bg-gray-100">
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
            className="w-14 rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-center font-mono text-[10px] text-gray-200 outline-none placeholder-gray-600 focus:border-cyan-500"
            placeholder="1"
            aria-label="Go to line"
          />
        </div>
      </footer>
    </div>
  );
};

export default TextEditorPanel;
