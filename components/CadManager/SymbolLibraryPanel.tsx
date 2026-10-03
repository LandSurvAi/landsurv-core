/**
 * SymbolLibraryPanel Component
 * 
 * Browse and select from pre-defined survey symbols.
 * Can be embedded in F2F settings or used standalone.
 * 
 * Phase 3 of Symbol Management System
 */

import React, { useState, useMemo, useCallback } from 'react';
import { 
  SURVEY_SYMBOL_LIBRARY, 
  LibrarySymbol, 
  getSymbolCategories, 
  searchSymbols,
  getSymbolsByCategory,
  libraryToSymbolDefinition,
} from '../../data/surveySymbolLibrary';
import { SymbolDefinition } from '../../contexts/types/CadManager.types';

interface SymbolLibraryPanelProps {
  /** Callback when a symbol is selected */
  onSelectSymbol?: (symbol: SymbolDefinition, libraryId: string) => void;
  /** Currently selected symbol ID (for highlighting) */
  selectedId?: string;
  /** Compact mode for embedding */
  compact?: boolean;
  /** Target code name (for context) */
  targetCode?: string;
}

/**
 * Symbol thumbnail preview
 */
const SymbolThumbnail: React.FC<{ 
  symbol: LibrarySymbol; 
  size?: number;
  selected?: boolean;
  onClick?: () => void;
}> = ({ symbol, size = 48, selected, onClick }) => (
  <div
    onClick={onClick}
    className={`
      flex flex-col items-center p-2 rounded-lg cursor-pointer transition-all
      ${selected 
        ? 'bg-cyan-600/30 ring-2 ring-cyan-400' 
        : 'bg-gray-800/50 hover:bg-gray-700/50 hover:ring-1 hover:ring-gray-600'
      }
    `}
  >
    <svg
      width={size}
      height={size}
      viewBox={symbol.viewBox}
      className={selected ? 'text-cyan-400' : 'text-gray-300'}
    >
      <path
        d={symbol.svgPath}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
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
    <span className={`text-xs mt-1 truncate w-full text-center ${selected ? 'text-cyan-300' : 'text-gray-400'}`}>
      {symbol.name}
    </span>
  </div>
);

export const SymbolLibraryPanel: React.FC<SymbolLibraryPanelProps> = ({
  onSelectSymbol,
  selectedId,
  compact = false,
  targetCode,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [previewSymbol, setPreviewSymbol] = useState<LibrarySymbol | null>(null);

  const categories = useMemo(() => ['all', ...getSymbolCategories()], []);

  // Filter symbols based on search and category
  const filteredSymbols = useMemo(() => {
    const symbols = searchQuery 
      ? searchSymbols(searchQuery) 
      : getSymbolsByCategory(selectedCategory);
    
    return symbols;
  }, [searchQuery, selectedCategory]);

  // Handle symbol selection
  const handleSelect = useCallback((symbol: LibrarySymbol) => {
    if (onSelectSymbol) {
      const symDef = libraryToSymbolDefinition(symbol, targetCode);
      onSelectSymbol(symDef, symbol.id);
    }
  }, [onSelectSymbol, targetCode]);

  return (
    <div className={`flex flex-col ${compact ? 'gap-3' : 'gap-4'}`}>
      {/* Header */}
      {!compact && (
        <div className="flex items-center gap-2">
          <span className="text-2xl">📚</span>
          <div>
            <h3 className="font-semibold text-white">Symbol Library</h3>
            <p className="text-xs text-gray-400">
              {SURVEY_SYMBOL_LIBRARY.length} standard survey symbols
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (e.target.value) setSelectedCategory('all');
          }}
          placeholder="Search symbols... (e.g., iron, manhole, tree)"
          className="w-full px-3 py-2 pl-9 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-cyan-500 focus:outline-none"
        />
        <span className="absolute left-3 top-2.5 text-gray-500">🔍</span>
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-2 text-gray-500 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      {/* Category tabs */}
      {!searchQuery && (
        <div className="flex gap-1 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                selectedCategory === cat
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {cat === 'all' ? 'All' : cat.split(' - ').pop()}
            </button>
          ))}
        </div>
      )}

      {/* Symbol grid */}
      <div className={`
        grid gap-2 overflow-y-auto
        ${compact ? 'grid-cols-4 max-h-48' : 'grid-cols-5 max-h-80'}
      `}>
        {filteredSymbols.map(symbol => (
          <SymbolThumbnail
            key={symbol.id}
            symbol={symbol}
            size={compact ? 36 : 44}
            selected={selectedId === symbol.id}
            onClick={() => {
              handleSelect(symbol);
              setPreviewSymbol(symbol);
            }}
          />
        ))}
      </div>

      {/* No results */}
      {filteredSymbols.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <span className="text-3xl mb-2 block">🔍</span>
          <p className="text-sm">No symbols match "{searchQuery}"</p>
          <p className="text-xs mt-1">Try different keywords or browse categories</p>
        </div>
      )}

      {/* Selected symbol detail */}
      {previewSymbol && (
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <div className="flex gap-4">
            <div className="bg-gray-900 rounded-lg p-4 flex items-center justify-center">
              <svg
                width={64}
                height={64}
                viewBox={previewSymbol.viewBox}
                className="text-cyan-400"
              >
                <path
                  d={previewSymbol.svgPath}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {previewSymbol.fillPath && (
                  <path
                    d={previewSymbol.fillPath}
                    fill="currentColor"
                    stroke="none"
                  />
                )}
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-white">{previewSymbol.name}</h4>
              <p className="text-sm text-gray-400 mt-1">{previewSymbol.description}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {previewSymbol.tags.slice(0, 5).map(tag => (
                  <span key={tag} className="px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded text-xs">
                    {tag}
                  </span>
                ))}
              </div>
              {onSelectSymbol && (
                <button
                  onClick={() => handleSelect(previewSymbol)}
                  className="mt-3 px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm font-medium"
                >
                  Use This Symbol
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="text-xs text-gray-500 flex justify-between">
        <span>
          Showing {filteredSymbols.length} of {SURVEY_SYMBOL_LIBRARY.length} symbols
        </span>
        <span>
          {categories.length - 1} categories
        </span>
      </div>
    </div>
  );
};

export default SymbolLibraryPanel;
