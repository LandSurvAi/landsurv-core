/**
 * SymbolCell Component
 * 
 * Interactive cell for the Symbol column in StandardsEditor.
 * Features:
 * - Thumbnail preview of SVG symbol
 * - AI Generate button (Gemini)
 * - Upload DXF button
 * - Click to view enlarged preview
 * - Edit/clear actions
 * 
 * Phase 2: Enhanced with survey-specific AI generation
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useMirrorError } from '../../hooks/useMirrorError';
import { SymbolDefinition } from '../../contexts/types/CadManager.types';
import { generateSymbolSvg, generateSymbolDxfBlock } from '../../services/geminiService';
import { parseDxfForSymbol } from '../../utils/dxfParser';
import { BrainCircuitIcon, UploadIcon, EraserIcon, EyeIcon, SparklesIcon, DownloadIcon, BookOpenIcon } from '../icons';
import { SURVEY_SYMBOL_LIBRARY, findMatchingSymbol, libraryToSymbolDefinition, LibrarySymbol } from '../../data/surveySymbolLibrary';

interface SymbolCellProps {
  /** Current symbol - can be string (legacy) or SymbolDefinition */
  symbol?: string | SymbolDefinition;
  /** Code name - used for AI generation context */
  codeName: string;
  /** Description - used for AI generation context */
  codeDescription: string;
  /** Category - used for AI generation context */
  category?: string;
  /** API key for Gemini */
  userApiKey?: string;
  /** Callback when symbol changes */
  onSymbolChange: (symbol: SymbolDefinition | string | undefined) => void;
  /** Whether cell is in a locked/protected state */
  isLocked?: boolean;
  /** Show preview modal */
  onShowPreview?: (symbol: SymbolDefinition) => void;
}

/**
 * Helper to get display name from symbol
 */
const getSymbolName = (symbol?: string | SymbolDefinition): string => {
  if (!symbol) return '-';
  if (typeof symbol === 'string') return symbol;
  return symbol.name || '-';
};

/**
 * Helper to check if symbol has SVG data
 */
const hasSymbolSvg = (symbol?: string | SymbolDefinition): symbol is SymbolDefinition => {
  return typeof symbol === 'object' && symbol !== null && !!symbol.svgPath;
};

/**
 * SVG Preview thumbnail component
 */
const SymbolThumbnail: React.FC<{ symbol: SymbolDefinition; size?: number }> = ({ symbol, size = 24 }) => {
  const { svgPath, fillPath, viewBox } = symbol;
  
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox || '0 0 24 24'}
      className="flex-shrink-0"
    >
      {/* Main outline path */}
      <path
        d={svgPath}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Optional fill path */}
      {fillPath && (
        <path
          d={fillPath}
          fill="currentColor"
          stroke="none"
        />
      )}
    </svg>
  );
};

/**
 * Library Quick Picker - Compact symbol picker with search and suggestions
 */
interface LibraryQuickPickerProps {
  codeName: string;
  codeDescription: string;
  category?: string;
  onSelect: (symbol: LibrarySymbol) => void;
}

const LibraryQuickPicker: React.FC<LibraryQuickPickerProps> = ({
  codeName,
  codeDescription,
  category,
  onSelect,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Get suggested symbols based on code context
  const suggested = React.useMemo(() => {
    const match = findMatchingSymbol(codeName, codeDescription);
    if (match) return [match];
    // Fallback: search by code name
    const searchResults = SURVEY_SYMBOL_LIBRARY.filter(s => 
      s.name.toLowerCase().includes(codeName.toLowerCase()) ||
      s.tags.some(k => k.toLowerCase().includes(codeName.toLowerCase()))
    );
    return searchResults.slice(0, 3);
  }, [codeName, codeDescription]);

  // Get categories
  const categories = React.useMemo((): string[] => {
    const cats = new Set(SURVEY_SYMBOL_LIBRARY.map(s => s.category));
    return ['all', ...Array.from(cats).sort()];
  }, []);

  // Filter symbols
  const filteredSymbols = React.useMemo(() => {
    let result = SURVEY_SYMBOL_LIBRARY;
    if (selectedCategory !== 'all') {
      result = result.filter(s => s.category === selectedCategory);
    }
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(lower) ||
        s.tags.some(k => k.toLowerCase().includes(lower))
      );
    }
    return result;
  }, [search, selectedCategory]);

  return (
    <div className="space-y-2">
      {/* Suggested symbols */}
      {suggested.length > 0 && !search && selectedCategory === 'all' && (
        <div className="mb-3">
          <div className="text-xs text-cyan-400 mb-1 flex items-center gap-1">
            ✨ Suggested for "{codeName}"
          </div>
          <div className="flex flex-wrap gap-1">
            {suggested.map(s => (
              <button
                key={s.id}
                onClick={() => onSelect(s)}
                className="flex items-center gap-1.5 px-2 py-1 bg-cyan-900/30 hover:bg-cyan-800/50 border border-cyan-700/50 rounded text-xs text-cyan-300 transition-colors"
                title={s.description}
              >
                <svg
                  className="w-4 h-4"
                  viewBox={s.viewBox || '0 0 24 24'}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d={s.svgPath} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search & Category */}
      <div className="flex gap-1">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search symbols..."
          className="flex-1 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-gray-200 placeholder-gray-500"
        />
        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          className="px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-gray-200"
        >
          {categories.map(cat => (
            <option key={cat} value={cat}>
              {cat === 'all' ? 'All' : cat}
            </option>
          ))}
        </select>
      </div>

      {/* Symbol Grid */}
      <div className="grid grid-cols-4 gap-1 max-h-48 overflow-y-auto">
        {filteredSymbols.map(s => (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            className="flex flex-col items-center gap-0.5 p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs text-gray-300 hover:text-white transition-colors"
            title={`${s.name}\n${s.description}`}
          >
            <svg
              className="w-5 h-5"
              viewBox={s.viewBox || '0 0 24 24'}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d={s.svgPath} strokeLinecap="round" strokeLinejoin="round" />
              {s.fillPath && <path d={s.fillPath} fill="currentColor" stroke="none" />}
            </svg>
            <span className="text-[9px] text-gray-400 truncate w-full text-center">{s.name}</span>
          </button>
        ))}
      </div>

      {filteredSymbols.length === 0 && (
        <div className="text-xs text-gray-500 text-center py-4">
          No symbols found
        </div>
      )}
    </div>
  );
};

export const SymbolCell: React.FC<SymbolCellProps> = ({
  symbol,
  codeName,
  codeDescription,
  category,
  userApiKey,
  onSymbolChange,
  isLocked,
  onShowPreview,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useMirrorError(error, { title: 'Symbol', kind: 'symbolcell-error' });
  const [showActions, setShowActions] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const symbolName = getSymbolName(symbol);
  const hasPreview = hasSymbolSvg(symbol);

  /**
   * Handle selection from library
   */
  const handleLibrarySelect = useCallback((librarySymbol: LibrarySymbol) => {
    const symbolDef = libraryToSymbolDefinition(librarySymbol);
    onSymbolChange(symbolDef);
    setShowLibrary(false);
  }, [onSymbolChange]);

  /**
   * Generate symbol via AI (Phase 2: Enhanced with survey context)
   */
  const handleGenerate = useCallback(async () => {
    if (isGenerating) return;
    
    setIsGenerating(true);
    setError(null);
    
    try {
      // Phase 2: Pass code and category context for better generation
      const result = await generateSymbolSvg(
        codeDescription, 
        userApiKey,
        {
          codeContext: codeName,
          categoryContext: category,
          forceSimple: false,
        }
      );
      
      const newSymbol: SymbolDefinition = {
        name: codeName,
        svgPath: result.svgPath,
        fillPath: result.fillPath,
        viewBox: result.viewBox,
        source: 'ai',
        createdAt: new Date().toISOString(),
        description: codeDescription,
      };
      
      onSymbolChange(newSymbol);
    } catch (err) {
      console.error('Failed to generate symbol:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate symbol');
    } finally {
      setIsGenerating(false);
    }
  }, [codeName, codeDescription, userApiKey, onSymbolChange, isGenerating]);

  /**
   * Handle DXF file upload
   */
  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.dxf')) {
      setError('Please upload a .dxf file');
      return;
    }
    
    setIsParsing(true);
    setError(null);
    
    try {
      const text = await file.text();
      const parsed = parseDxfForSymbol(text);
      
      if (!parsed || !parsed.svgPath) {
        throw new Error('Could not parse symbol from DXF file');
      }
      
      const newSymbol: SymbolDefinition = {
        name: codeName || file.name.replace('.dxf', ''),
        svgPath: parsed.svgPath,
        // DXF doesn't support fillPath currently
        viewBox: parsed.viewBox || '0 0 24 24',
        source: 'upload',
        dxfContent: text,
        createdAt: new Date().toISOString(),
      };
      
      onSymbolChange(newSymbol);
    } catch (err) {
      console.error('Failed to parse DXF:', err);
      setError(err instanceof Error ? err.message : 'Failed to parse DXF file');
    } finally {
      setIsParsing(false);
    }
  }, [codeName, onSymbolChange]);

  /**
   * Clear symbol
   */
  const handleClear = useCallback(() => {
    onSymbolChange(undefined);
    setError(null);
  }, [onSymbolChange]);

  /**
   * Handle file input change
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className="relative flex items-center gap-1 min-w-0 group/symbol"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".dxf"
        className="hidden"
        onChange={handleFileChange}
      />
      
      {/* Symbol preview/name */}
      <div 
        className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
        onClick={() => hasPreview && onShowPreview?.(symbol as SymbolDefinition)}
        title={hasPreview ? 'Click to view larger' : undefined}
      >
        {hasPreview ? (
          <>
            <div className="w-6 h-6 flex items-center justify-center text-cyan-400">
              <SymbolThumbnail symbol={symbol as SymbolDefinition} size={20} />
            </div>
            <span className="text-xs text-gray-400 truncate">{symbolName}</span>
          </>
        ) : (
          <span className={`text-sm truncate ${symbolName === '-' ? 'text-gray-600' : ''}`}>
            {symbolName}
          </span>
        )}
      </div>

      {/* Action buttons - show on hover */}
      {(showActions || isGenerating || isParsing) && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Pick from Library */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowLibrary(true); }}
            disabled={isGenerating || isParsing}
            className="p-1 rounded hover:bg-gray-600 text-gray-400 hover:text-purple-400 transition-colors disabled:opacity-50"
            title="Pick from symbol library"
          >
            <BookOpenIcon className="w-4 h-4" />
          </button>
          
          {/* Generate with AI */}
          <button
            onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
            disabled={isGenerating || isParsing}
            className="p-1 rounded hover:bg-gray-600 text-gray-400 hover:text-yellow-400 transition-colors disabled:opacity-50"
            title="Generate symbol with AI"
          >
            {isGenerating ? (
              <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <SparklesIcon className="w-4 h-4" />
            )}
          </button>
          
          {/* Upload DXF */}
          <button
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            disabled={isGenerating || isParsing}
            className="p-1 rounded hover:bg-gray-600 text-gray-400 hover:text-blue-400 transition-colors disabled:opacity-50"
            title="Upload DXF symbol"
          >
            {isParsing ? (
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <UploadIcon className="w-4 h-4" />
            )}
          </button>
          
          {/* Clear symbol */}
          {(hasPreview || (typeof symbol === 'string' && symbol !== '-')) && (
            <button
              onClick={(e) => { e.stopPropagation(); handleClear(); }}
              disabled={isGenerating || isParsing}
              className="p-1 rounded hover:bg-gray-600 text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50"
              title="Clear symbol"
            >
              <EraserIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Error tooltip */}
      {error && (
        <div className="absolute top-full left-0 mt-1 z-50 px-2 py-1 bg-red-900/90 border border-red-700 rounded text-xs text-red-200 whitespace-nowrap">
          {error}
        </div>
      )}

      {/* Library Picker Popup */}
      {showLibrary && (
        <div className="absolute top-full left-0 mt-1 z-50 w-80 max-h-96 bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 bg-gray-700 border-b border-gray-600 flex justify-between items-center">
            <span className="text-sm font-medium text-gray-200">📚 Symbol Library</span>
            <button
              onClick={() => setShowLibrary(false)}
              className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="p-2 overflow-y-auto max-h-80">
            <LibraryQuickPicker
              codeName={codeName}
              codeDescription={codeDescription}
              category={category}
              onSelect={handleLibrarySelect}
            />
          </div>
        </div>
      )}

      {/* Locked indicator */}
      {isLocked && (
        <span 
          className="text-emerald-500 text-xs opacity-60 group-hover/symbol:opacity-100"
          title="AI-Protected"
        >
          🛡️
        </span>
      )}
    </div>
  );
};

/**
 * Symbol Preview Modal
 * Shows enlarged symbol with actions
 */
interface SymbolPreviewModalProps {
  symbol: SymbolDefinition;
  codeName: string;
  onClose: () => void;
  onRegenerate?: () => void;
  onRegenerateAll?: () => void;
  onClear?: () => void;
}

export const SymbolPreviewModal: React.FC<SymbolPreviewModalProps> = ({
  symbol,
  codeName,
  onClose,
  onRegenerate,
  onRegenerateAll,
  onClear,
}) => {
  const [copied, setCopied] = useState(false);
  const [showRegenerateOptions, setShowRegenerateOptions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowRegenerateOptions(false);
      }
    };
    if (showRegenerateOptions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showRegenerateOptions]);

  // Export symbol as DXF block
  const handleExportDxf = useCallback(() => {
    const dxfContent = generateSymbolDxfBlock(
      symbol.name || codeName,
      symbol.svgPath,
      symbol.fillPath,
      1  // scale
    );
    
    const blob = new Blob([dxfContent], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${symbol.name || codeName}.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  }, [symbol, codeName]);

  // Copy SVG path to clipboard
  const handleCopyPath = useCallback(() => {
    const pathData = {
      svgPath: symbol.svgPath,
      fillPath: symbol.fillPath,
      viewBox: symbol.viewBox,
    };
    navigator.clipboard.writeText(JSON.stringify(pathData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [symbol]);

  return (
    <div 
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{symbol.name || codeName}</h3>
            <p className="text-sm text-gray-400">{symbol.description}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1"
          >
            ✕
          </button>
        </div>
        
        {/* Large preview */}
        <div className="bg-gray-900 rounded-lg p-8 flex items-center justify-center mb-4">
          <svg
            width={120}
            height={120}
            viewBox={symbol.viewBox || '0 0 24 24'}
            className="text-cyan-400"
          >
            <path
              d={symbol.svgPath}
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {symbol.fillPath && (
              <path
                d={symbol.fillPath}
                fill="currentColor"
                stroke="none"
              />
            )}
          </svg>
        </div>
        
        {/* Info */}
        <div className="text-xs text-gray-500 space-y-1 mb-4">
          <p>Source: <span className="text-gray-300 capitalize">{symbol.source}</span></p>
          <p>Created: <span className="text-gray-300">{new Date(symbol.createdAt).toLocaleString()}</span></p>
          <p>ViewBox: <span className="text-gray-300 font-mono">{symbol.viewBox}</span></p>
        </div>

        {/* Export Actions */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={handleExportDxf}
            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium flex items-center justify-center gap-2"
            title="Download as DXF block"
          >
            <DownloadIcon className="w-4 h-4" />
            Export DXF
          </button>
          <button
            onClick={handleCopyPath}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm flex items-center gap-1"
            title="Copy SVG path data"
          >
            {copied ? '✓ Copied!' : '📋 Copy Path'}
          </button>
        </div>
        
        {/* Main Actions */}
        <div className="flex gap-2">
          {onRegenerate && (
            <div ref={dropdownRef} className="relative flex-1">
              <button
                onClick={() => setShowRegenerateOptions(!showRegenerateOptions)}
                className="w-full px-3 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-sm font-medium flex items-center justify-center gap-2"
              >
                <SparklesIcon className="w-4 h-4" />
                Regenerate
                <span className="ml-1">▾</span>
              </button>
              
              {/* Dropdown options */}
              {showRegenerateOptions && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-700 border border-gray-600 rounded-lg shadow-xl overflow-hidden z-10">
                  <button
                    onClick={() => {
                      setShowRegenerateOptions(false);
                      onRegenerate();
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm text-gray-200 hover:bg-gray-600 flex items-center gap-2"
                  >
                    <SparklesIcon className="w-4 h-4 text-yellow-400" />
                    <div>
                      <div className="font-medium">This Symbol Only</div>
                      <div className="text-xs text-gray-400">Regenerate symbol for {codeName}</div>
                    </div>
                  </button>
                  {onRegenerateAll && (
                    <button
                      onClick={() => {
                        setShowRegenerateOptions(false);
                        onRegenerateAll();
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm text-gray-200 hover:bg-gray-600 flex items-center gap-2 border-t border-gray-600"
                    >
                      <SparklesIcon className="w-4 h-4 text-purple-400" />
                      <div>
                        <div className="font-medium">All Missing Symbols</div>
                        <div className="text-xs text-gray-400">Auto-assign from library for all codes</div>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {onClear && (
            <button
              onClick={onClear}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SymbolCell;
