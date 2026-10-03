import React, { useState, useCallback, useMemo } from 'react';
import { type CustomSymbol, type Settings } from '../types';
import { generateSymbolSvg } from '../services/geminiService';
import { BrainCircuitIcon, EraserIcon, PencilSquareIcon, PlusIcon, UploadIcon, DownloadIcon, EyeIcon, EyeSlashIcon } from './icons';
import { parseDxfForSymbol } from '../utils/dxfParser.ts';
import { exportSymbolsToDxf } from '../utils/symbolDxf.ts';
import { useAppState } from '../contexts/AppStateContext.tsx';
import { SURVEY_SYMBOL_LIBRARY, getSymbolCategories, searchSymbols, getSymbolsByCategory, type LibrarySymbol } from '../data/surveySymbolLibrary.ts';


// FIX: Removed apiKey from props to align with guidelines.
interface SymbolManagerPanelProps {
  symbols: CustomSymbol[];
  onAddSymbol: (symbol: CustomSymbol) => void;
  onUpdateSymbol: (symbol: CustomSymbol) => void;
  onDeleteSymbol: (symbolId: string) => void;
  settings: Settings;
  /** Built-in library ids the user has opted into showing ('*' = all). */
  enabledBuiltinSymbolIds?: Set<string>;
  /** Toggle a single built-in library symbol's canvas visibility. */
  onToggleBuiltinSymbol?: (libId: string, enabled: boolean) => void;
  /** Toggle all built-in library symbols at once. */
  onToggleAllBuiltins?: (enabled: boolean) => void;
}

const DxfUploader: React.FC<{ onFileUpload: (file: File) => void, isParsing: boolean }> = ({ onFileUpload, isParsing }) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onFileUpload(e.target.files[0]);
        }
    };

    const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
    const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); }, []);
    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onFileUpload(e.dataTransfer.files[0]);
            e.dataTransfer.clearData();
        }
    }, [onFileUpload]);
    
    const handleClick = () => {
        document.getElementById('symbol-dxf-input')?.click();
    };

    return (
        <div 
            onClick={handleClick}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`cursor-pointer flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg transition-colors duration-300 h-full ${isDragging ? 'border-yellow-400 bg-gray-700/50' : 'border-gray-600 hover:border-yellow-500'}`}
        >
            <input id="symbol-dxf-input" type="file" className="hidden" accept=".dxf" onChange={handleFileChange} />
            {isParsing ? (
                 <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
            ) : (
                <>
                    <UploadIcon className="w-8 h-8 text-gray-500 mb-2" />
                    <span className="text-sm font-semibold text-white">Drop a .dxf here</span>
                    <span className="text-xs text-gray-400 mt-1">or click to browse</span>
                </>
            )}
        </div>
    );
};


export const SymbolManagerPanel: React.FC<SymbolManagerPanelProps> = ({ symbols, onAddSymbol, onUpdateSymbol, onDeleteSymbol, settings, enabledBuiltinSymbolIds, onToggleBuiltinSymbol, onToggleAllBuiltins }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingSymbol, setEditingSymbol] = useState<CustomSymbol | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isParsingDxf, setIsParsingDxf] = useState(false);

  const [creationMode, setCreationMode] = useState<'ai' | 'dxf'>('ai');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [terms, setTerms] = useState('');
  const [scale, setScale] = useState(1);
  
  const [generatedSymbol, setGeneratedSymbol] = useState<{ svgPath: string; fillPath?: string; viewBox: string } | null>(null);
  const { addNotification } = useAppState();

  // Built-in library browser (parity with CAD Manager's Symbol Library).
  const [builtinSearch, setBuiltinSearch] = useState('');
  const [builtinCategory, setBuiltinCategory] = useState('all');
  const builtinCategories = useMemo(() => ['all', ...getSymbolCategories()], []);
  const filteredBuiltins = useMemo<LibrarySymbol[]>(
    () => (builtinSearch ? searchSymbols(builtinSearch) : getSymbolsByCategory(builtinCategory)),
    [builtinSearch, builtinCategory],
  );
  const isBuiltinEnabled = useCallback((libId: string): boolean => {
    if (!enabledBuiltinSymbolIds || enabledBuiltinSymbolIds.size === 0) return false;
    return enabledBuiltinSymbolIds.has('*') || enabledBuiltinSymbolIds.has(libId);
  }, [enabledBuiltinSymbolIds]);
  const enabledBuiltinCount = useMemo(
    () => (enabledBuiltinSymbolIds?.has('*') ? SURVEY_SYMBOL_LIBRARY.length : (enabledBuiltinSymbolIds?.size ?? 0)),
    [enabledBuiltinSymbolIds],
  );

  const notifyError = useCallback((message: string) => {
    addNotification({ kind: 'symbol-manager', severity: 'error', title: 'Symbol Manager', message });
  }, [addNotification]);

  const handleGenerate = async () => {
    if (!description.trim()) {
      notifyError('Please provide a description for the symbol.');
      return;
    }
    setIsGenerating(true);
    setGeneratedSymbol(null);
    try {
      // FIX: Removed apiKey argument to align with refactored service.
      const result = await generateSymbolSvg(description, settings.userApiKey);
      setGeneratedSymbol(result);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to generate symbol.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDxfUpload = async (file: File) => {
    if (!file) return;
    setIsParsingDxf(true);
    setGeneratedSymbol(null);
    try {
        const content = await file.text();
        const result = parseDxfForSymbol(content);
        if (!result.svgPath) {
            throw new Error("Could not find any supported geometry (LINE, LWPOLYLINE) in the DXF file.");
        }
        setGeneratedSymbol(result);
        if (!name && file.name) {
            setName(file.name.replace(/\.[^/.]+$/, ""));
        }
    } catch (err) {
        notifyError(err instanceof Error ? err.message : 'Failed to parse DXF file.');
    } finally {
        setIsParsingDxf(false);
    }
  };

  const handleExportSymbols = () => {
    if (symbols.length === 0) {
        notifyError('There are no custom symbols to export.');
        return;
    }
    try {
        const dxfContent = exportSymbolsToDxf(symbols);
        const blob = new Blob([dxfContent], { type: 'application/dxf;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'landsurv_ai_symbols.dxf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error("Failed to export symbols:", err);
      notifyError('Failed to export symbols to DXF.');
    }
  };

  const resetForm = () => {
    setIsCreating(false);
    setName('');
    setDescription('');
    setEditingSymbol(null);
    setTerms('');
    setScale(1);
    setGeneratedSymbol(null);
    setCreationMode('ai');
  };

  const handleEdit = (symbol: CustomSymbol) => {
    setEditingSymbol(symbol);
    setName(symbol.name);
    setDescription(symbol.description);
    setTerms(symbol.associatedTerms.join(', '));
    setScale(symbol.scale || 1);
    setGeneratedSymbol({
        svgPath: symbol.svgPath,
        fillPath: symbol.fillPath,
        viewBox: symbol.viewBox
    });
    setIsCreating(true);
    setCreationMode('ai');
  };

  const handleSave = () => {
    const desc = creationMode === 'dxf' ? name : description;
    if (name.trim() && desc.trim() && generatedSymbol) {
        if (editingSymbol) {
            const updatedSymbol: CustomSymbol = {
                ...editingSymbol,
                name: name.trim(),
                description: desc.trim(),
                associatedTerms: terms.split(',').map(t => t.trim().toLowerCase()).filter(Boolean),
                svgPath: generatedSymbol.svgPath,
                fillPath: generatedSymbol.fillPath,
                viewBox: generatedSymbol.viewBox,
                scale: scale,
            };
            onUpdateSymbol(updatedSymbol);
        } else {
            const newSymbol: CustomSymbol = {
                id: Date.now().toString(),
                name: name.trim(),
                description: desc.trim(),
                associatedTerms: terms.split(',').map(t => t.trim().toLowerCase()).filter(Boolean),
                svgPath: generatedSymbol.svgPath,
                fillPath: generatedSymbol.fillPath,
                viewBox: generatedSymbol.viewBox,
                scale: scale,
            };
            onAddSymbol(newSymbol);
        }
      resetForm();
    } else {
      notifyError('Name, a symbol, and a description (for AI) are required.');
    }
  };

  return (
    <div className="w-full h-full bg-gray-900 flex flex-col rounded-md overflow-hidden light-theme:bg-white">
      <header className="flex-shrink-0 p-4 bg-gray-800/40 backdrop-blur border-b border-gray-700/30 flex justify-between items-center light-theme:bg-gray-50/40 light-theme:border-gray-300/30">
        <h3 className="text-xl font-semibold text-gray-300 flex items-center gap-2 light-theme:text-gray-700">
            <PencilSquareIcon className="w-6 h-6 text-yellow-400"/>
            Symbol Manager
        </h3>
        <div className="flex items-center gap-2">
            <button 
                onClick={handleExportSymbols}
                disabled={symbols.length === 0}
                className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center gap-2 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
                <DownloadIcon className="w-4 h-4" /> Export All Symbols
            </button>
            <button 
                onClick={() => { setIsCreating(p => !p); if(isCreating) resetForm(); }}
                className="px-4 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white rounded-md flex items-center gap-2"
            >
                <PlusIcon className="w-4 h-4" /> {isCreating ? 'Cancel' : 'New Symbol'}
            </button>
        </div>
      </header>
      
      {isCreating && (
        <div className="p-4 border-b border-gray-700 space-y-4 bg-gray-800 light-theme:bg-gray-100 light-theme:border-gray-300">
          <h4 className="font-semibold text-yellow-400">
            {editingSymbol ? `Editing Symbol: ${editingSymbol.name}` : 'Create New Symbol'}
          </h4>
          <div className="flex p-1 bg-gray-700 rounded-lg mb-4">
            <button onClick={() => setCreationMode('ai')} className={`flex-1 py-1 text-sm font-semibold rounded-md transition-colors ${creationMode === 'ai' ? 'bg-yellow-500 text-white' : 'text-gray-300 hover:bg-gray-600'}`}>
              Generate with AI
            </button>
            <button onClick={() => setCreationMode('dxf')} className={`flex-1 py-1 text-sm font-semibold rounded-md transition-colors ${creationMode === 'dxf' ? 'bg-yellow-500 text-white' : 'text-gray-300 hover:bg-gray-600'}`}>
              Upload DXF
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Symbol Name (e.g., 'Iron Pin Found')" className="p-2 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 light-theme:bg-white light-theme:border-gray-300"/>
              <input type="text" value={terms} onChange={e => setTerms(e.target.value)} placeholder="Associated Terms (comma-separated)" className="p-2 text-sm bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 light-theme:bg-white light-theme:border-gray-300"/>
          </div>

          <div className="flex gap-4">
            {creationMode === 'ai' ? (
                <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe the symbol for the AI... (e.g., 'a circle with a dot in the middle', 'a simple drawing of a deciduous tree')"
                    rows={3}
                    className="flex-grow p-2 text-sm bg-gray-700 border border-gray-600 rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-yellow-500 light-theme:bg-white light-theme:border-gray-300"
                />
            ) : (
                <div className="flex-grow">
                    <DxfUploader onFileUpload={handleDxfUpload} isParsing={isParsingDxf} />
                </div>
            )}
            <div className="flex-shrink-0 w-32 h-32 bg-gray-900/50 rounded-md flex items-center justify-center border border-gray-600 light-theme:bg-gray-200 light-theme:border-gray-300">
                {isGenerating || isParsingDxf ? (
                    <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
                ) : generatedSymbol ? (
                    <svg viewBox={generatedSymbol.viewBox} className="w-24 h-24 text-yellow-300">
                        <path d={generatedSymbol.svgPath} fill="none" stroke="currentColor" strokeWidth="0.5" />
                        {generatedSymbol.fillPath && (
                            <path d={generatedSymbol.fillPath} fill="currentColor" stroke="none" />
                        )}
                    </svg>
                ) : <span className="text-xs text-gray-500">Preview</span> }
            </div>
          </div>
          
          <div>
            <label htmlFor="symbolScale" className="block text-sm font-medium text-gray-400 mb-1">Scale Factor</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                id="symbolScale"
                min="0.5"
                max="3"
                step="0.1"
                value={scale}
                onChange={(e) => {
                  const next = parseFloat(e.target.value);
                  setScale(next);
                  // Live-persist scale changes while editing an existing symbol so the
                  // override is not lost if the user switches views before clicking Update.
                  if (editingSymbol) {
                    onUpdateSymbol({ ...editingSymbol, scale: next });
                  }
                }}
                className="w-full accent-yellow-500"
              />
              <span className="font-mono bg-gray-700 text-gray-200 px-3 py-1 rounded-md text-sm">{scale.toFixed(1)}x</span>
            </div>
          </div>


          <div className="flex justify-between items-center">
            {creationMode === 'ai' ? (
                 <button onClick={handleGenerate} disabled={isGenerating} className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center gap-2 disabled:bg-gray-600">
                    <BrainCircuitIcon className="w-5 h-5"/>
                    {isGenerating ? 'Generating...' : 'Generate with AI'}
                </button>
            ) : <div />}
             <div className="flex gap-2">
                <button onClick={resetForm} className="px-4 py-2 text-sm font-semibold bg-gray-600 hover:bg-gray-500 text-white rounded-md">Cancel</button>
                <button onClick={handleSave} disabled={!generatedSymbol || isGenerating || isParsingDxf} className="px-4 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white rounded-md disabled:bg-gray-600">{editingSymbol ? 'Update Symbol' : 'Save Symbol'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-grow overflow-auto p-4">
        {symbols.length === 0 && !isCreating ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>No custom symbols created yet. Click "New Symbol" to start.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {symbols.map(symbol => (
              <div key={symbol.id} className={`p-3 bg-gray-800/50 rounded-lg border border-gray-700 flex flex-col items-center gap-2 transition-opacity ${symbol.hidden ? 'opacity-50' : ''}`}>
                <div className="w-16 h-16 bg-gray-900 rounded-md flex items-center justify-center p-2">
                    <svg viewBox={symbol.viewBox} className="w-full h-full text-yellow-300">
                        <path d={symbol.svgPath} fill="none" stroke="currentColor" strokeWidth="0.5" />
                        {symbol.fillPath && (
                            <path d={symbol.fillPath} fill="currentColor" stroke="none" />
                        )}
                    </svg>
                </div>
                <h4 className="font-semibold text-sm text-gray-200">{symbol.name}</h4>
                <p className="text-xs text-gray-400 text-center flex-grow">"{symbol.description}"</p>
                <p className="text-xs font-mono text-yellow-300 bg-yellow-900/50 px-2 py-0.5 rounded-full">Scale: {symbol.scale || 1}x</p>
                 <div className="flex self-end gap-1 mt-1">
                    <button
                      onClick={() => onUpdateSymbol({ ...symbol, hidden: !symbol.hidden })}
                      className={`p-1.5 rounded-full ${symbol.hidden ? 'text-gray-500 hover:bg-gray-700/50' : 'text-green-400 hover:bg-green-800/50'}`}
                      title={symbol.hidden ? 'Show symbol on canvas' : 'Hide symbol on canvas'}
                    >
                      {symbol.hidden ? <EyeSlashIcon className="w-4 h-4"/> : <EyeIcon className="w-4 h-4"/>}
                    </button>
                    <button onClick={() => handleEdit(symbol)} className="p-1.5 text-blue-400 hover:bg-blue-800/50 rounded-full" title="Edit Symbol"><PencilSquareIcon className="w-4 h-4"/></button>
                    <button onClick={() => onDeleteSymbol(symbol.id)} className="p-1.5 text-red-400 hover:bg-red-800/50 rounded-full" title="Delete Symbol"><EraserIcon className="w-4 h-4"/></button>
                 </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Built-in Symbol Library (parity with CAD Manager) ──────────── */}
        {onToggleBuiltinSymbol && (
          <div className="mt-8 border-t border-gray-700/50 pt-6 light-theme:border-gray-300/50">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h4 className="font-semibold text-gray-200 flex items-center gap-2 light-theme:text-gray-700">
                  📚 Built-in Symbol Library
                  <span className="text-xs font-normal text-gray-400">
                    {enabledBuiltinCount} of {SURVEY_SYMBOL_LIBRARY.length} shown
                  </span>
                </h4>
                <p className="text-xs text-gray-500 mt-0.5">
                  Off by default. Toggle a symbol to show it on the canvas, or just ask the drafter (e.g. "draw tree symbols").
                </p>
              </div>
              {onToggleAllBuiltins && (
                <div className="flex gap-2">
                  <button
                    onClick={() => onToggleAllBuiltins(true)}
                    className="px-3 py-1.5 text-xs font-semibold bg-green-700/60 hover:bg-green-700 text-white rounded-md flex items-center gap-1"
                  >
                    <EyeIcon className="w-3.5 h-3.5" /> Show all
                  </button>
                  <button
                    onClick={() => onToggleAllBuiltins(false)}
                    className="px-3 py-1.5 text-xs font-semibold bg-gray-700 hover:bg-gray-600 text-white rounded-md flex items-center gap-1"
                  >
                    <EyeSlashIcon className="w-3.5 h-3.5" /> Hide all
                  </button>
                </div>
              )}
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <input
                type="text"
                value={builtinSearch}
                onChange={(e) => { setBuiltinSearch(e.target.value); if (e.target.value) setBuiltinCategory('all'); }}
                placeholder="Search built-in symbols... (e.g., iron, manhole, tree)"
                className="w-full px-3 py-2 pl-9 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-yellow-500 focus:outline-none light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-800"
              />
              <span className="absolute left-3 top-2.5 text-gray-500">🔍</span>
              {builtinSearch && (
                <button onClick={() => setBuiltinSearch('')} className="absolute right-2 top-2 text-gray-500 hover:text-white">✕</button>
              )}
            </div>

            {/* Category tabs */}
            {!builtinSearch && (
              <div className="flex gap-1 flex-wrap mb-3">
                {builtinCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setBuiltinCategory(cat)}
                    className={`px-2 py-1 rounded text-xs transition-colors ${builtinCategory === cat ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                  >
                    {cat === 'all' ? 'All' : cat.split(' - ').pop()}
                  </button>
                ))}
              </div>
            )}

            {/* Built-in symbol grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filteredBuiltins.map(symbol => {
                const enabled = isBuiltinEnabled(symbol.id);
                return (
                  <div key={symbol.id} className={`p-3 bg-gray-800/50 rounded-lg border border-gray-700 flex flex-col items-center gap-2 transition-opacity ${enabled ? '' : 'opacity-50'}`}>
                    <div className="w-16 h-16 bg-gray-900 rounded-md flex items-center justify-center p-2">
                      <svg viewBox={symbol.viewBox} className={`w-full h-full ${enabled ? 'text-yellow-300' : 'text-gray-400'}`}>
                        <path d={symbol.svgPath} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        {symbol.fillPath && <path d={symbol.fillPath} fill="currentColor" stroke="none" />}
                      </svg>
                    </div>
                    <h4 className="font-semibold text-sm text-gray-200 text-center light-theme:text-gray-700">{symbol.name}</h4>
                    <p className="text-xs text-gray-400 text-center flex-grow">{symbol.description}</p>
                    <div className="flex self-end gap-1 mt-1">
                      <button
                        onClick={() => onToggleBuiltinSymbol(symbol.id, !enabled)}
                        className={`p-1.5 rounded-full ${enabled ? 'text-green-400 hover:bg-green-800/50' : 'text-gray-500 hover:bg-gray-700/50'}`}
                        title={enabled ? 'Hide symbol on canvas' : 'Show symbol on canvas'}
                      >
                        {enabled ? <EyeIcon className="w-4 h-4"/> : <EyeSlashIcon className="w-4 h-4"/>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {filteredBuiltins.length === 0 && (
              <div className="text-center py-6 text-gray-500 text-sm">No built-in symbols match "{builtinSearch}".</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};