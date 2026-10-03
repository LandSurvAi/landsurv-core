/**
 * StandardsEditor Component
 * 
 * Full-screen spreadsheet editor for CAD standards.
 * Features:
 * - Editable cells (double-click to edit)
 * - Row selection (click row, shift-click for range)
 * - Delete rows (Delete key or button)
 * - Copy/paste support (Ctrl+C, Ctrl+V)
 * - Add new rows
 * - Undo/redo
 * - Save as single source of truth
 * - Export to markdown/CSV
 * - Field-to-Finish settings (line drafting, wildcards, labels, surfaces)
 * - Symbol management (AI generation, DXF upload, preview)
 * - Surveyor code matching (collaborative code uploads)
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { CodeDefinition, StandardDefinition, FieldToFinishSettings as F2FSettings, DEFAULT_F2F_SETTINGS, SymbolDefinition, SurveyorCodeSession, SurveyorCodeMatch, normalizeSurveyorAliases, type CadTextStyleDefinition } from '../../contexts/types/CadManager.types';
import { checkAliasConflict, type AliasConflict } from '../../utils/codeDomainClassifier';
import { FieldToFinishSettings } from './FieldToFinishSettings';
import { SymbolCell, SymbolPreviewModal } from './SymbolCell';
import { SurveyorCodeMatcher, createEmptySurveyorSession } from './SurveyorCodeMatcher';
import { useSettings } from '../../types';
import { findMatchingSymbol, libraryToSymbolDefinition, SURVEY_SYMBOL_LIBRARY } from '../../data/surveySymbolLibrary';
import { useErrorReporter } from '../../contexts/AppStateContext';

interface StandardsEditorProps {
  standard: StandardDefinition;
  onSave: (standard: StandardDefinition) => void;
  onClose: () => void;
}

interface EditingCell {
  rowIndex: number;
  column: keyof CodeDefinition;
}

const TEXT_STYLE_FONT_OPTIONS = ['Arial', 'Arial Narrow', 'Calibri', 'Romans', 'Simplex'];

const COLUMNS: { key: keyof CodeDefinition; label: string; width: string }[] = [
  { key: 'code', label: 'Code', width: 'w-24' },
  // Note: Surveyor Alias column is rendered specially in thead/tbody, not via COLUMNS
  { key: 'description', label: 'Description', width: 'w-48' },
  { key: 'pointLayer', label: 'Point Layer', width: 'w-36' },
  { key: 'lineLayer', label: 'Line Layer', width: 'w-36' },
  { key: 'lineType', label: 'Linetype', width: 'w-32' },
  { key: 'symbol', label: 'Symbol', width: 'w-44' },  // Wider for preview + actions
  { key: 'category', label: 'Category', width: 'w-28' },
];

export const StandardsEditor: React.FC<StandardsEditorProps> = ({
  standard,
  onSave,
  onClose,
}) => {
  // Settings context for API key
  const { settings } = useSettings();
  const { reportError } = useErrorReporter();
  
  // State
  const [codes, setCodes] = useState<CodeDefinition[]>([...standard.codes]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState('');
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [undoStack, setUndoStack] = useState<CodeDefinition[][]>([]);
  const [redoStack, setRedoStack] = useState<CodeDefinition[][]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [hasChanges, setHasChanges] = useState(false);
  const [copiedRows, setCopiedRows] = useState<CodeDefinition[]>([]);
  const [showF2FSettings, setShowF2FSettings] = useState(false);
  const [f2fSettings, setF2FSettings] = useState<F2FSettings>(() => standard.f2fSettings ?? DEFAULT_F2F_SETTINGS);
  const [textStyles, setTextStyles] = useState<CadTextStyleDefinition[]>(() =>
    (standard.textStyles ?? []).map(style => ({ ...style }))
  );
  
  // Surveyor code matching state — hydrated from the standard so adding a
  // surveyor (or accepting matches) survives editor close / app reload.
  const [showSurveyorMatcher, setShowSurveyorMatcher] = useState(false);
  const [surveyorSession, setSurveyorSession] = useState<SurveyorCodeSession>(
    () => standard.surveyorCodeSession ?? createEmptySurveyorSession()
  );
  const [selectedSurveyorId, setSelectedSurveyorId] = useState<string | null>(
    () => standard.surveyorCodeSession?.surveyors[0]?.id ?? null
  );

  // Inline editing for the per-row Surveyor Alias cell.
  // The header dropdown picks WHICH surveyor's column is shown; this state
  // tracks which row is currently being edited and the typed value.
  const [editingSurveyorAliasRow, setEditingSurveyorAliasRow] = useState<number | null>(null);
  const [surveyorAliasDraft, setSurveyorAliasDraft] = useState('');
  
  // Symbol preview state
  const [previewSymbol, setPreviewSymbol] = useState<{ symbol: SymbolDefinition; rowIndex: number } | null>(null);
  
  // Auto-assign symbols state
  const [showAutoAssign, setShowAutoAssign] = useState(false);
  const [autoAssignResults, setAutoAssignResults] = useState<Array<{
    codeIndex: number;
    code: string;
    description: string;
    matchedSymbol: import('../../data/surveySymbolLibrary').LibrarySymbol | null;
    selected: boolean;
  }>>([]);
  
  const tableRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const textStyleValidation = useMemo(() => {
    const normalizedNameCounts = new Map<string, number>();
    const emptyIndexes = new Set<number>();

    textStyles.forEach((style, index) => {
      const normalized = style.name.trim().toLowerCase();
      if (!normalized) {
        emptyIndexes.add(index);
        return;
      }
      normalizedNameCounts.set(normalized, (normalizedNameCounts.get(normalized) ?? 0) + 1);
    });

    const duplicateIndexes = new Set<number>();
    textStyles.forEach((style, index) => {
      const normalized = style.name.trim().toLowerCase();
      if (!normalized) return;
      if ((normalizedNameCounts.get(normalized) ?? 0) > 1) duplicateIndexes.add(index);
    });

    const hasErrors = emptyIndexes.size > 0 || duplicateIndexes.size > 0;
    return { emptyIndexes, duplicateIndexes, hasErrors };
  }, [textStyles]);

  // Get unique categories
  const categories = ['all', ...new Set(codes.map(c => c.category || 'Uncategorized').filter(Boolean))];

  // Filtered codes
  const filteredCodes = codes.filter(code => {
    const matchesSearch = searchTerm === '' || 
      code.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      code.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || code.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Save to undo stack before changes
  const saveToUndo = useCallback(() => {
    setUndoStack(prev => [...prev, [...codes]]);
    setRedoStack([]);
    setHasChanges(true);
  }, [codes]);

  // Undo
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack(prev => [...prev, [...codes]]);
    setUndoStack(prev => prev.slice(0, -1));
    setCodes(previous);
  }, [undoStack, codes]);

  // Redo
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(prev => [...prev, [...codes]]);
    setRedoStack(prev => prev.slice(0, -1));
    setCodes(next);
  }, [redoStack, codes]);

  // Handle row click
  const handleRowClick = (index: number, event: React.MouseEvent) => {
    if (event.shiftKey && selectedRows.size > 0) {
      // Range select
      const lastSelected = Math.max(...Array.from(selectedRows));
      const start = Math.min(lastSelected, index);
      const end = Math.max(lastSelected, index);
      const newSelection = new Set<number>();
      for (let i = start; i <= end; i++) {
        newSelection.add(i);
      }
      setSelectedRows(newSelection);
    } else if (event.ctrlKey || event.metaKey) {
      // Toggle select
      const newSelection = new Set(selectedRows);
      if (newSelection.has(index)) {
        newSelection.delete(index);
      } else {
        newSelection.add(index);
      }
      setSelectedRows(newSelection);
    } else {
      // Single select
      setSelectedRows(new Set([index]));
    }
  };

  // Handle cell double-click to edit
  const handleCellDoubleClick = (rowIndex: number, column: keyof CodeDefinition) => {
    const actualIndex = codes.findIndex(c => c === filteredCodes[rowIndex]);
    if (actualIndex === -1) return;
    
    const value = codes[actualIndex][column];
    setEditingCell({ rowIndex: actualIndex, column });
    setEditValue(value?.toString() || '');
  };

  // Handle single-click to edit (more user-friendly)
  const handleCellClick = (rowIndex: number, column: keyof CodeDefinition, event: React.MouseEvent) => {
    // Don't enter edit mode if clicking for selection
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    
    const actualIndex = codes.findIndex(c => c === filteredCodes[rowIndex]);
    if (actualIndex === -1) return;
    
    const value = codes[actualIndex][column];
    setEditingCell({ rowIndex: actualIndex, column });
    setEditValue(value?.toString() || '');
  };

  // Check if a cell has been user-edited (locked)
  const isCellLocked = (code: CodeDefinition, column: keyof CodeDefinition): boolean => {
    return !!(code.userEdits && code.userEdits[column]);
  };

  // Handle edit complete - now tracks user edits
  const handleEditComplete = () => {
    commitEditValue(editValue);
  };

  /**
   * Commit a specific value for the cell currently being edited. Used by
   * both Enter/blur (with the current input value) and the autocomplete
   * dropdown (with the picked suggestion, which may not yet have flushed
   * into editValue state).
   */
  const commitEditValue = (value: string) => {
    if (!editingCell) return;

    const currentCode = codes[editingCell.rowIndex];
    const originalValue = currentCode[editingCell.column]?.toString() || '';

    // Only save if value actually changed
    if (originalValue === value) {
      setEditingCell(null);
      setEditValue('');
      return;
    }

    saveToUndo();
    const newCodes = [...codes];
    const updatedCode = { ...newCodes[editingCell.rowIndex] };

    // Update the value
    (updatedCode as any)[editingCell.column] = value;

    // Track this as a user edit (locked field)
    updatedCode.userEdits = {
      ...(updatedCode.userEdits || {}),
      [editingCell.column]: {
        editedAt: new Date().toISOString(),
        originalValue: originalValue,
      },
    };

    newCodes[editingCell.rowIndex] = updatedCode;
    setCodes(newCodes);
    setEditingCell(null);
    setEditValue('');
  };

  // Unlock a cell (remove user edit tracking)
  const handleUnlockCell = (rowIndex: number, column: keyof CodeDefinition) => {
    const actualIndex = codes.findIndex(c => c === filteredCodes[rowIndex]);
    if (actualIndex === -1) return;
    
    saveToUndo();
    const newCodes = [...codes];
    const updatedCode = { ...newCodes[actualIndex] };
    
    if (updatedCode.userEdits) {
      const { [column]: removed, ...rest } = updatedCode.userEdits;
      updatedCode.userEdits = Object.keys(rest).length > 0 ? rest : undefined;
    }
    
    newCodes[actualIndex] = updatedCode;
    setCodes(newCodes);
  };

  // Handle symbol change from SymbolCell
  const handleSymbolChange = useCallback((rowIndex: number, symbol: SymbolDefinition | string | undefined) => {
    const actualIndex = codes.findIndex(c => c === filteredCodes[rowIndex]);
    if (actualIndex === -1) return;
    
    saveToUndo();
    const newCodes = [...codes];
    const updatedCode = { ...newCodes[actualIndex] };
    
    updatedCode.symbol = symbol;
    
    // Track as user edit if it's a symbol definition
    if (symbol && typeof symbol === 'object') {
      updatedCode.userEdits = {
        ...(updatedCode.userEdits || {}),
        symbol: {
          editedAt: new Date().toISOString(),
          originalValue: String(newCodes[actualIndex].symbol || '-'),
        },
      };
    }
    
    newCodes[actualIndex] = updatedCode;
    setCodes(newCodes);
  }, [codes, filteredCodes, saveToUndo]);

  // Commit an edit to a code's surveyor-specific aliases. The cell now
  // supports multiple alias terms per surveyor (chips + "add" inline input)
  // rather than a single comma-delimited string. Each term may contain `*`
  // wildcards and is fuzzy-matched at resolveCode time.
  const writeSurveyorAliases = useCallback((rowIndex: number, nextTerms: string[]) => {
    if (!selectedSurveyorId) return;
    const actualIndex = codes.findIndex(c => c === filteredCodes[rowIndex]);
    if (actualIndex === -1) return;
    const cleaned = normalizeSurveyorAliases(nextTerms);
    const current = normalizeSurveyorAliases(codes[actualIndex].surveyorAliases?.[selectedSurveyorId]);
    // Skip work when nothing changed (preserves undo stack hygiene).
    const same =
      cleaned.length === current.length &&
      cleaned.every((t, i) => t === current[i]);
    if (same) return;

    saveToUndo();
    const newCodes = [...codes];
    const updatedCode = { ...newCodes[actualIndex] };
    const nextAliases = { ...(updatedCode.surveyorAliases || {}) };
    if (cleaned.length === 0) {
      delete nextAliases[selectedSurveyorId];
    } else {
      nextAliases[selectedSurveyorId] = cleaned;
    }
    updatedCode.surveyorAliases = Object.keys(nextAliases).length > 0 ? nextAliases : undefined;
    newCodes[actualIndex] = updatedCode;
    setCodes(newCodes);
  }, [codes, filteredCodes, selectedSurveyorId, saveToUndo]);

  const addSurveyorAlias = useCallback((rowIndex: number, term: string) => {
    if (!selectedSurveyorId) return;
    const actualIndex = codes.findIndex(c => c === filteredCodes[rowIndex]);
    if (actualIndex === -1) return;
    const current = normalizeSurveyorAliases(codes[actualIndex].surveyorAliases?.[selectedSurveyorId]);
    writeSurveyorAliases(rowIndex, [...current, term]);
    setEditingSurveyorAliasRow(null);
    setSurveyorAliasDraft('');
  }, [codes, filteredCodes, selectedSurveyorId, writeSurveyorAliases]);

  const removeSurveyorAlias = useCallback((rowIndex: number, termIndex: number) => {
    if (!selectedSurveyorId) return;
    const actualIndex = codes.findIndex(c => c === filteredCodes[rowIndex]);
    if (actualIndex === -1) return;
    const current = normalizeSurveyorAliases(codes[actualIndex].surveyorAliases?.[selectedSurveyorId]);
    if (termIndex < 0 || termIndex >= current.length) return;
    const next = current.slice();
    next.splice(termIndex, 1);
    writeSurveyorAliases(rowIndex, next);
  }, [codes, filteredCodes, selectedSurveyorId, writeSurveyorAliases]);
  const handleEditCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  // Sanity-check pass: for every surveyor alias on every master code, run the
  // domain classifier and collect cross-domain mismatches (e.g. surveyor types
  // "EC" against "Edge of Water" — electric/concrete vs water).
  const [isSanityPanelOpen, setIsSanityPanelOpen] = useState(false);
  const aliasConflicts = useMemo(() => {
    type Entry = AliasConflict & {
      surveyorId: string;
      surveyorName: string;
      rowIndex: number;
      termIndex: number;
    };
    const result: Entry[] = [];
    for (let r = 0; r < codes.length; r++) {
      const code = codes[r];
      if (!code.surveyorAliases) continue;
      for (const sid of Object.keys(code.surveyorAliases)) {
        const surveyor = surveyorSession.surveyors.find(s => s.id === sid);
        const terms = normalizeSurveyorAliases(code.surveyorAliases[sid]);
        for (let i = 0; i < terms.length; i++) {
          const conflict = checkAliasConflict(terms[i], code.code, code.description);
          if (conflict) {
            result.push({
              ...conflict,
              surveyorId: sid,
              surveyorName: surveyor?.name ?? sid,
              rowIndex: r,
              termIndex: i,
            });
          }
        }
      }
    }
    return result;
  }, [codes, surveyorSession]);

  // Fast lookup: "masterCode|sid|TERM" → conflict (for chip rendering).
  const conflictByKey = useMemo(() => {
    const map = new Map<string, AliasConflict>();
    for (const c of aliasConflicts) {
      map.set(`${c.masterCode}|${c.surveyorId}|${c.aliasTerm.toUpperCase()}`, c);
    }
    return map;
  }, [aliasConflicts]);


  // Focus edit input when editing
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
    setAutocompleteIndex(0);
  }, [editingCell]);

  // Reset highlighted suggestion when the user types (so it doesn't point
  // past the end of the filtered list).
  useEffect(() => {
    setAutocompleteIndex(0);
  }, [editValue]);

  // Delete selected rows
  const handleDeleteRows = useCallback(() => {
    if (selectedRows.size === 0) return;
    
    saveToUndo();
    const newCodes = codes.filter((_, index) => !selectedRows.has(index));
    setCodes(newCodes);
    setSelectedRows(new Set());
  }, [codes, selectedRows, saveToUndo]);

  // Add new row
  const handleAddRow = () => {
    saveToUndo();
    const newCode: CodeDefinition = {
      code: 'NEW',
      description: 'New Code',
      pointLayer: 'V-SURV-CTRL',
      lineLayer: '-',
      symbol: 'POINT',
      category: 'Misc',
    };
    setCodes([...codes, newCode]);
    // Select and scroll to new row
    setSelectedRows(new Set([codes.length]));
    setTimeout(() => {
      tableRef.current?.scrollTo({ top: tableRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  // Copy selected rows
  const handleCopy = useCallback(() => {
    if (selectedRows.size === 0) return;
    const rowsToCopy = codes.filter((_, index) => selectedRows.has(index));
    setCopiedRows(rowsToCopy);
    // Also copy to clipboard as tab-separated values
    const tsv = rowsToCopy.map(row => 
      COLUMNS.map(col => row[col.key] || '').join('\t')
    ).join('\n');
    navigator.clipboard.writeText(tsv);
  }, [codes, selectedRows]);

  // Paste rows
  const handlePaste = useCallback(async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      const lines = clipboardText.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        // Try to paste from internal copy
        if (copiedRows.length > 0) {
          saveToUndo();
          const insertIndex = selectedRows.size > 0 ? Math.max(...Array.from(selectedRows)) + 1 : codes.length;
          const newCodes = [...codes];
          newCodes.splice(insertIndex, 0, ...copiedRows.map(row => ({ ...row })));
          setCodes(newCodes);
        }
        return;
      }

      // Parse pasted data
      saveToUndo();
      const newRows: CodeDefinition[] = lines.map(line => {
        const parts = line.split('\t');
        return {
          code: parts[0] || 'NEW',
          description: parts[1] || '',
          pointLayer: parts[2] || 'V-MISC',
          lineLayer: parts[3] || '-',
          symbol: parts[4] || '',
          category: parts[5] || 'Misc',
        };
      });
      
      const insertIndex = selectedRows.size > 0 ? Math.max(...Array.from(selectedRows)) + 1 : codes.length;
      const newCodes = [...codes];
      newCodes.splice(insertIndex, 0, ...newRows);
      setCodes(newCodes);
    } catch (err) {
      console.error('Paste failed:', err);
    }
  }, [codes, selectedRows, copiedRows, saveToUndo]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete key
      if (e.key === 'Delete' && selectedRows.size > 0 && !editingCell) {
        e.preventDefault();
        handleDeleteRows();
      }
      // Escape to cancel edit
      if (e.key === 'Escape') {
        if (editingCell) {
          handleEditCancel();
        } else {
          setSelectedRows(new Set());
        }
      }
      // Ctrl+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Ctrl+Shift+Z or Ctrl+Y for redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        handleRedo();
      }
      // Ctrl+C for copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !editingCell) {
        e.preventDefault();
        handleCopy();
      }
      // Ctrl+V for paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !editingCell) {
        e.preventDefault();
        handlePaste();
      }
      // Ctrl+A to select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !editingCell) {
        e.preventDefault();
        setSelectedRows(new Set(codes.map((_, i) => i)));
      }
      // Ctrl+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRows, editingCell, handleDeleteRows, handleUndo, handleRedo, handleCopy, handlePaste, codes]);

  // Save — persists codes, surveyor team session, and F2F settings together.
  // Without this, surveyors added via the Team Codes modal and any F2F
  // changes were silently dropped when the editor closed.
  const handleSave = () => {
    if (textStyleValidation.hasErrors) {
      reportError({ title: 'Invalid text styles', message: 'Cannot save standard: shared text style names must be non-empty and unique.' });
      return;
    }
    const updatedStandard: StandardDefinition = {
      ...standard,
      codes: codes,
      textStyles: textStyles,
      surveyorCodeSession: surveyorSession.surveyors.length > 0 ? surveyorSession : undefined,
      f2fSettings: f2fSettings,
      lastUpdated: new Date().toISOString(),
    };
    onSave(updatedStandard);
    setHasChanges(false);
  };

  // Close guard: warn before discarding unsaved edits to codes, surveyor
  // roster, or F2F settings.
  const handleCloseGuarded = useCallback(() => {
    if (hasChanges) {
      const ok = window.confirm('You have unsaved changes to this standard. Close without saving?');
      if (!ok) return;
    }
    onClose();
  }, [hasChanges, onClose]);

  // If the currently selected surveyor was removed from the roster, fall
  // back to the first available surveyor (or null) so dropdowns and
  // per-row alias cells never dereference a stale id.
  useEffect(() => {
    if (selectedSurveyorId && !surveyorSession.surveyors.find(s => s.id === selectedSurveyorId)) {
      setSelectedSurveyorId(surveyorSession.surveyors[0]?.id ?? null);
    }
  }, [surveyorSession.surveyors, selectedSurveyorId]);

  // Garbage-collect orphaned surveyorAliases on code rows when a surveyor
  // is removed from the roster, to prevent stale id keys persisting
  // forever in the saved standard.
  useEffect(() => {
    const activeIds = new Set(surveyorSession.surveyors.map(s => s.id));
    let mutated = false;
    const cleaned = codes.map(code => {
      if (!code.surveyorAliases) return code;
      const entries = Object.entries(code.surveyorAliases).filter(([sid]) => activeIds.has(sid));
      if (entries.length === Object.keys(code.surveyorAliases).length) return code;
      mutated = true;
      const next = { ...code } as CodeDefinition;
      if (entries.length === 0) {
        delete next.surveyorAliases;
      } else {
        next.surveyorAliases = Object.fromEntries(entries);
      }
      return next;
    });
    if (mutated) setCodes(cleaned);
    // Intentionally only re-run when the roster itself changes, not on every code edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyorSession.surveyors]);

  // Export to Markdown
  const handleExportMarkdown = () => {
    const header = '| ' + COLUMNS.map(c => c.label).join(' | ') + ' |';
    const separator = '|' + COLUMNS.map(() => '------').join('|') + '|';
    const rows = codes.map(code => 
      '| ' + COLUMNS.map(col => code[col.key] || '-').join(' | ') + ' |'
    );
    const markdown = [header, separator, ...rows].join('\n');
    
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${standard.name}-standards.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export to CSV
  const handleExportCSV = () => {
    const header = COLUMNS.map(c => c.label).join(',');
    const rows = codes.map(code => 
      COLUMNS.map(col => `"${(code[col.key] || '').toString().replace(/"/g, '""')}"`).join(',')
    );
    const csv = [header, ...rows].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${standard.name}-standards.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateTextStyle = useCallback((index: number, patch: Partial<CadTextStyleDefinition>) => {
    setTextStyles(prev => prev.map((style, styleIndex) => (
      styleIndex === index ? { ...style, ...patch } : style
    )));
    setHasChanges(true);
  }, []);

  const handleAddTextStyle = useCallback(() => {
    setTextStyles(prev => ([
      ...prev,
      {
        name: `Text Style ${prev.length + 1}`,
        fontFamily: 'Arial',
        fontBold: false,
        fontItalic: false,
        textCase: 'original',
        lineSpacing: 1.2,
      },
    ]));
    setHasChanges(true);
  }, []);

  const handleDeleteTextStyle = useCallback((index: number) => {
    setTextStyles(prev => prev.filter((_, styleIndex) => styleIndex !== index));
    setHasChanges(true);
  }, []);

  // Statistics
  const lockedCellCount = codes.reduce((count, code) => {
    return count + (code.userEdits ? Object.keys(code.userEdits).length : 0);
  }, 0);
  
  const stats = {
    total: codes.length,
    lineworkCodes: codes.filter(c => c.lineLayer && c.lineLayer !== '-').length,
    pointLayers: new Set(codes.map(c => c.pointLayer)).size,
    lineLayers: new Set(codes.filter(c => c.lineLayer && c.lineLayer !== '-').map(c => c.lineLayer)).size,
    categories: new Set(codes.map(c => c.category)).size,
    lockedCells: lockedCellCount,
  };

  /**
   * Union of every layer name already used on any row, for the layer cell
   * autocomplete dropdowns. Sorted alphabetically and deduped.
   */
  const availableLayers = useMemo(() => {
    const set = new Set<string>();
    for (const c of codes) {
      const pl = (c.pointLayer || '').trim();
      const ll = (c.lineLayer || '').trim();
      if (pl && pl !== '-') set.add(pl);
      if (ll && ll !== '-') set.add(ll);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [codes]);

  /**
   * Available linetypes pulled from the standard definition + any in-use
   * linetype values on the codes themselves.
   */
  const availableLinetypes = useMemo(() => {
    const set = new Set<string>();
    (standard.linetypes || []).forEach(lt => lt?.name && set.add(lt.name));
    for (const c of codes) {
      const lt = (c.lineType || '').trim();
      if (lt && lt !== '-') set.add(lt);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [codes, standard.linetypes]);

  /**
   * Available categories already used on any row.
   */
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const c of codes) {
      const cat = (c.category || '').trim();
      if (cat) set.add(cat);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [codes]);

  /**
   * Suggestions for the currently-editing cell, filtered by editValue.
   * Only certain columns get an autocomplete dropdown.
   */
  const autocompleteSuggestions = useMemo(() => {
    if (!editingCell) return [] as string[];
    let source: string[] | null = null;
    if (editingCell.column === 'pointLayer' || editingCell.column === 'lineLayer') {
      source = availableLayers;
    } else if (editingCell.column === 'lineType') {
      source = availableLinetypes;
    } else if (editingCell.column === 'category') {
      source = availableCategories;
    }
    if (!source) return [];
    const q = editValue.trim().toLowerCase();
    if (!q) return source.slice(0, 200);
    return source.filter(v => v.toLowerCase().includes(q)).slice(0, 200);
  }, [editingCell, editValue, availableLayers, availableLinetypes, availableCategories]);

  /**
   * Find codes without symbols and try to match them against the library.
   * Only matches point codes (not linework-only codes). Shared by the
   * silent auto-assign-on-open effect and the manual "Auto-Apply Symbols"
   * review modal so both use identical matching logic.
   */
  const computeAutoAssignMatches = useCallback((codeList: CodeDefinition[]) => {
    return codeList.map((code, index) => {
      // Skip if already has a symbol with SVG
      const hasExistingSymbol = typeof code.symbol === 'object' && code.symbol?.svgPath;
      if (hasExistingSymbol) return null;

      // Skip linework-only codes (no point layer or point layer is annotation-only)
      // These shouldn't have symbols - they're for drawing lines, not placing point symbols
      const pointLayer = code.pointLayer?.toUpperCase() || '';
      const lineLayer = code.lineLayer?.toUpperCase() || '';
      const isLineworkOnly = (
        !pointLayer ||
        pointLayer === '-' ||
        pointLayer === lineLayer ||  // Same layer means linework code
        pointLayer.includes('_A') ||  // Annotation layers
        pointLayer.includes('-ANNO')
      );

      // Additional check: if description contains linework-related terms
      const desc = code.description?.toLowerCase() || '';
      const lineworkTerms = ['edge', 'line', 'boundary', 'centerline', 'flowline', 'ditch', 'swale', 'ridge', 'break'];
      const hasLineworkDescription = lineworkTerms.some(term => desc.includes(term));

      // Skip if linework-only AND has a line layer defined
      if (isLineworkOnly && lineLayer && lineLayer !== '-') return null;
      if (hasLineworkDescription && lineLayer && lineLayer !== '-' && pointLayer === lineLayer) return null;

      // Try to find a match
      const matchedSymbol = findMatchingSymbol(code.code, code.description);

      return {
        codeIndex: index,
        code: code.code,
        description: code.description,
        matchedSymbol,
        selected: matchedSymbol !== null, // Pre-select all matches
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null && r.matchedSymbol !== null);
  }, []);

  // Auto-assign symbols automatically on load — reuses the same matching
  // logic exposed via CACP's `cad_resolve_symbol_for_code` / the canvas
  // render-time resolver (data/surveySymbolLibrary's findMatchingSymbol), so
  // any code that already resolves to a library symbol gets it applied
  // silently the moment the standard is opened, without requiring the user
  // to click "Auto-Apply Symbols" and review each match.
  const didAutoAssignOnLoad = useRef(false);
  useEffect(() => {
    if (didAutoAssignOnLoad.current) return;
    didAutoAssignOnLoad.current = true;
    const matches = computeAutoAssignMatches(codes);
    if (matches.length === 0) return;
    setCodes(prev => {
      const next = [...prev];
      for (const m of matches) {
        if (!m.matchedSymbol) continue;
        next[m.codeIndex] = { ...next[m.codeIndex], symbol: libraryToSymbolDefinition(m.matchedSymbol) };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Auto-assign symbols from library
   * Finds matching library symbols for codes that don't have symbols yet
   * Only assigns to point codes (not linework-only codes)
   */
  const handleAutoAssignOpen = useCallback(() => {
    setAutoAssignResults(computeAutoAssignMatches(codes));
    setShowAutoAssign(true);
  }, [codes, computeAutoAssignMatches]);

  /**
   * Apply selected auto-assign matches
   */
  const handleAutoAssignApply = useCallback(() => {
    const selected = autoAssignResults.filter(r => r.selected && r.matchedSymbol);
    if (selected.length === 0) {
      setShowAutoAssign(false);
      return;
    }
    
    saveToUndo();
    const newCodes = [...codes];
    
    selected.forEach(result => {
      if (result.matchedSymbol) {
        const symbolDef = libraryToSymbolDefinition(result.matchedSymbol);
        newCodes[result.codeIndex] = {
          ...newCodes[result.codeIndex],
          symbol: symbolDef,
        };
      }
    });
    
    setCodes(newCodes);
    setShowAutoAssign(false);
    setAutoAssignResults([]);
  }, [autoAssignResults, codes, saveToUndo]);

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleCloseGuarded}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white"
              title="Close (Esc)"
            >
              ✕
            </button>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                📋 {standard.name}
                {hasChanges && <span className="text-yellow-400 text-sm">• Unsaved</span>}
              </h1>
              <p className="text-sm text-gray-400">
                {stats.total} codes • {stats.lineworkCodes} with linework • {stats.pointLayers} point layers • {stats.lineLayers} line layers
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
              title="Undo (Ctrl+Z)"
            >
              ↩️ Undo
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
              title="Redo (Ctrl+Y)"
            >
              ↪️ Redo
            </button>
            <div className="w-px h-6 bg-gray-600 mx-2" />
            <button
              onClick={() => setShowSurveyorMatcher(true)}
              className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm transition-colors flex items-center gap-1"
              title="Surveyor Code Matcher - Match team codes to standards"
            >
              👥 Team Codes
              {surveyorSession.surveyors.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-xs">
                  {surveyorSession.surveyors.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowF2FSettings(true)}
              className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm transition-colors flex items-center gap-1"
              title="Field-to-Finish Settings"
            >
              ⚙️ F2F Settings
            </button>
            <div className="w-px h-6 bg-gray-600 mx-2" />
            <button
              onClick={handleExportMarkdown}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
              title="Export as Markdown"
            >
              📄 .md
            </button>
            <button
              onClick={handleExportCSV}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
              title="Export as CSV"
            >
              📊 .csv
            </button>
            <div className="w-px h-6 bg-gray-600 mx-2" />
            <button
              onClick={handleSave}
              disabled={textStyleValidation.hasErrors}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition-colors"
              title="Save (Ctrl+S)"
            >
              💾 Save
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-shrink-0 bg-gray-800/50 border-b border-gray-700 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleAddRow}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium transition-colors"
            >
              + Add Row
            </button>
            <button
              onClick={handleDeleteRows}
              disabled={selectedRows.size === 0}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded text-sm font-medium transition-colors"
            >
              🗑️ Delete ({selectedRows.size})
            </button>
            <button
              onClick={handleCopy}
              disabled={selectedRows.size === 0}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-gray-300 rounded text-sm transition-colors"
            >
              📋 Copy
            </button>
            <button
              onClick={handlePaste}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors"
            >
              📥 Paste
            </button>
            
            <div className="w-px h-6 bg-gray-600 mx-2" />
            
            {/* Auto-assign symbols button */}
            <button
              onClick={handleAutoAssignOpen}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium transition-colors flex items-center gap-1"
              title="Auto-assign symbols from library based on code names"
            >
              📚 Auto-Assign Symbols
            </button>

            {/* Sanity-check: open a panel listing every alias whose domain
                disagrees with the master code's domain. */}
            <button
              onClick={() => setIsSanityPanelOpen(true)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1 ${aliasConflicts.length > 0 ? 'bg-yellow-600 hover:bg-yellow-500 text-gray-900' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
              title={aliasConflicts.length > 0
                ? `${aliasConflicts.length} alias${aliasConflicts.length === 1 ? '' : 'es'} may be miscategorized — review and confirm or remove`
                : 'No alias domain conflicts detected'}
            >
              {aliasConflicts.length > 0 ? '⚠' : '✓'} Sanity Check{aliasConflicts.length > 0 ? ` (${aliasConflicts.length})` : ''}
            </button>
            
            <div className="w-px h-6 bg-gray-600 mx-2" />
            
            <span className="text-sm text-gray-500">
              {selectedRows.size > 0 ? `${selectedRows.size} selected` : 'Click row to select, Shift+click for range'}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search codes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
            />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat === 'all' ? 'All Categories' : cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 border-b border-gray-800 bg-gray-900/70 px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-200">Shared Text Styles</h2>
            <p className="text-xs text-gray-500">
              CAD Manager styles used by annotation categories and parcel labels.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddTextStyle}
            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-sm font-medium transition-colors"
          >
            + Add Text Style
          </button>
        </div>

        {textStyles.length === 0 ? (
          <div className="rounded border border-dashed border-gray-700 px-3 py-4 text-sm text-gray-500">
            No shared text styles defined yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-2 font-semibold">Name</th>
                  <th className="px-2 py-2 font-semibold">Font</th>
                  <th className="px-2 py-2 font-semibold">Bold</th>
                  <th className="px-2 py-2 font-semibold">Italic</th>
                  <th className="px-2 py-2 font-semibold">Case</th>
                  <th className="px-2 py-2 font-semibold">Line Spacing</th>
                  <th className="px-2 py-2 font-semibold w-16">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {textStyles.map((style, index) => (
                  <tr key={`${style.name}-${index}`} className="border-t border-gray-800">
                    <td className="px-2 py-2 align-middle">
                      <input
                        type="text"
                        value={style.name}
                        onChange={e => updateTextStyle(index, { name: e.target.value })}
                        className={`w-full px-2 py-1.5 bg-gray-800 border rounded text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                          textStyleValidation.emptyIndexes.has(index) || textStyleValidation.duplicateIndexes.has(index)
                            ? 'border-red-500'
                            : 'border-gray-700'
                        }`}
                      />
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <select
                        value={style.fontFamily}
                        onChange={e => updateTextStyle(index, { fontFamily: e.target.value })}
                        className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      >
                        {TEXT_STYLE_FONT_OPTIONS.map(font => (
                          <option key={font} value={font}>{font}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2 align-middle text-center">
                      <input
                        type="checkbox"
                        checked={!!style.fontBold}
                        onChange={e => updateTextStyle(index, { fontBold: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-600 bg-gray-800"
                      />
                    </td>
                    <td className="px-2 py-2 align-middle text-center">
                      <input
                        type="checkbox"
                        checked={!!style.fontItalic}
                        onChange={e => updateTextStyle(index, { fontItalic: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-600 bg-gray-800"
                      />
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <select
                        value={style.textCase ?? 'original'}
                        onChange={e => updateTextStyle(index, { textCase: e.target.value as CadTextStyleDefinition['textCase'] })}
                        className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      >
                        <option value="original">Original Case</option>
                        <option value="uppercase">UPPERCASE</option>
                      </select>
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <input
                        type="number"
                        min={0.8}
                        max={2}
                        step={0.05}
                        value={style.lineSpacing ?? 1.2}
                        onChange={e => updateTextStyle(index, { lineSpacing: Number(e.target.value) })}
                        className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </td>
                    <td className="px-2 py-2 align-middle text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteTextStyle(index)}
                        className="px-2 py-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded text-xs font-medium transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {textStyleValidation.hasErrors && (
          <div className="mt-2 rounded border border-red-800/70 bg-red-950/30 px-3 py-2 text-xs text-red-200">
            Shared text style names must be non-empty and unique before saving.
          </div>
        )}
      </div>

      {/* Table */}
      <div ref={tableRef} className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-gray-800 z-10">
            <tr>
              <th className="w-10 px-2 py-3 text-left text-xs font-semibold text-gray-400 border-b border-gray-700">#</th>
              {/* Code column header */}
              <th className="w-24 px-3 py-3 text-left text-xs font-semibold text-gray-400 border-b border-gray-700">
                Code
              </th>
              {/* Surveyor Alias column header with dropdown */}
              {surveyorSession.surveyors.length > 0 && (
                <th className="w-28 px-2 py-1 text-left text-xs font-semibold border-b border-gray-700">
                  <select
                    value={selectedSurveyorId || ''}
                    onChange={(e) => setSelectedSurveyorId(e.target.value || null)}
                    className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-gray-300 focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="">👤 Surveyor</option>
                    {surveyorSession.surveyors.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.initials} - {s.name}
                      </option>
                    ))}
                  </select>
                </th>
              )}
              {/* Rest of columns (skip code since we rendered it manually) */}
              {COLUMNS.filter(col => col.key !== 'code').map(col => (
                <th key={col.key} className={`${col.width} px-3 py-3 text-left text-xs font-semibold text-gray-400 border-b border-gray-700`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredCodes.map((code, displayIndex) => {
              const actualIndex = codes.indexOf(code);
              const isSelected = selectedRows.has(actualIndex);
              
              return (
                <tr
                  key={actualIndex}
                  onClick={(e) => handleRowClick(actualIndex, e)}
                  className={`
                    cursor-pointer border-b border-gray-800 transition-colors
                    ${isSelected ? 'bg-indigo-900/50' : 'hover:bg-gray-800/50'}
                    ${actualIndex % 2 === 0 ? 'bg-gray-900/30' : 'bg-gray-900/10'}
                  `}
                >
                  <td className="px-2 py-2 text-xs text-gray-500 font-mono">
                    {actualIndex + 1}
                  </td>
                  
                  {/* Code column - always first */}
                  <td
                    onClick={(e) => {
                      e.stopPropagation();
                      if (editingCell?.rowIndex !== actualIndex || editingCell?.column !== 'code') {
                        handleCellClick(displayIndex, 'code', e);
                      }
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleCellDoubleClick(displayIndex, 'code');
                    }}
                    className="w-24 px-3 py-2 text-sm font-mono font-bold text-cyan-400 cursor-text hover:bg-gray-700/30 hover:ring-1 hover:ring-inset hover:ring-gray-600"
                  >
                    {editingCell?.rowIndex === actualIndex && editingCell?.column === 'code' ? (
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleEditComplete}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEditComplete();
                          if (e.key === 'Escape') handleEditCancel();
                        }}
                        className="w-full px-2 py-1 bg-gray-700 border-2 border-indigo-500 rounded text-white text-sm focus:outline-none"
                      />
                    ) : (
                      code.code
                    )}
                  </td>
                  
                  {/* Surveyor Alias column - chip list of per-surveyor codes
                      that map to this master code. Each chip is removable; a
                      "+" button opens an inline input to add another term.
                      Wildcards (e.g. "CM*") are supported and fuzzy-matched
                      by resolveCode at draw time. */}
                  {surveyorSession.surveyors.length > 0 && (
                    <td
                      className="w-28 px-2 py-2 text-sm align-top"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {selectedSurveyorId ? (() => {
                        const surveyor = surveyorSession.surveyors.find(s => s.id === selectedSurveyorId);
                        const aliases = normalizeSurveyorAliases(code.surveyorAliases?.[selectedSurveyorId]);
                        const isAdding = editingSurveyorAliasRow === displayIndex;
                        const surveyorColor = surveyor?.color || '#9ca3af';
                        return (
                          <div className="flex flex-wrap items-center gap-1">
                            {aliases.map((alias, i) => {
                              const conflict = conflictByKey.get(`${code.code}|${selectedSurveyorId}|${alias.toUpperCase()}`);
                              const baseTitle = `${surveyor?.name}'s code for ${code.code} — click × to remove`;
                              return (
                              <span
                                key={`${alias}-${i}`}
                                className={`inline-flex items-center gap-1 font-mono font-bold px-1.5 py-0.5 rounded text-xs ${conflict ? 'ring-1 ring-yellow-400' : ''}`}
                                style={conflict
                                  ? { color: '#fde68a', backgroundColor: '#78350f33' }
                                  : { color: surveyorColor, backgroundColor: `${surveyorColor}20` }}
                                title={conflict
                                  ? `⚠ Sanity check: ${conflict.reason}\n\n${baseTitle}`
                                  : baseTitle}
                              >
                                {conflict && <span aria-hidden className="text-yellow-300">⚠</span>}
                                {alias}
                                <button
                                  onClick={() => removeSurveyorAlias(displayIndex, i)}
                                  className="hover:text-red-400 leading-none"
                                  title={`Remove "${alias}"`}
                                  aria-label={`Remove alias ${alias}`}
                                >
                                  ×
                                </button>
                              </span>
                              );
                            })}
                            {isAdding ? (
                              <input
                                type="text"
                                autoFocus
                                value={surveyorAliasDraft}
                                onChange={(e) => setSurveyorAliasDraft(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onBlur={() => {
                                  const trimmed = surveyorAliasDraft.trim();
                                  if (trimmed) addSurveyorAlias(displayIndex, trimmed);
                                  else {
                                    setEditingSurveyorAliasRow(null);
                                    setSurveyorAliasDraft('');
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const trimmed = surveyorAliasDraft.trim();
                                    if (trimmed) addSurveyorAlias(displayIndex, trimmed);
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setEditingSurveyorAliasRow(null);
                                    setSurveyorAliasDraft('');
                                  }
                                }}
                                placeholder="code or pattern*"
                                className="w-24 bg-gray-800 text-white text-xs font-mono px-1.5 py-0.5 rounded border border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                              />
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingSurveyorAliasRow(displayIndex);
                                  setSurveyorAliasDraft('');
                                }}
                                className="inline-flex items-center justify-center w-5 h-5 rounded border border-gray-600 text-gray-400 hover:text-white hover:border-indigo-400 text-xs leading-none"
                                title={`Add ${surveyor?.name ?? 'surveyor'} alias for ${code.code}`}
                                aria-label={`Add surveyor alias for ${code.code}`}
                              >
                                +
                              </button>
                            )}
                          </div>
                        );
                      })() : (
                        <span className="text-gray-600 text-xs italic">Select ↑</span>
                      )}
                    </td>
                  )}
                  
                  {/* Rest of columns (excluding code which we already rendered) */}
                  {COLUMNS.filter(col => col.key !== 'code').map(col => {
                    const isLocked = isCellLocked(code, col.key);
                    const isEditing = editingCell?.rowIndex === actualIndex && editingCell?.column === col.key;
                    const cellValue = code[col.key];
                    
                    // Special rendering for Symbol column
                    if (col.key === 'symbol') {
                      return (
                        <td
                          key={col.key}
                          className={`${col.width} px-2 py-1 text-sm relative`}
                        >
                          <SymbolCell
                            symbol={code.symbol}
                            codeName={code.code}
                            codeDescription={code.description}
                            category={code.category}
                            userApiKey={settings.userApiKey}
                            onSymbolChange={(newSymbol) => handleSymbolChange(displayIndex, newSymbol)}
                            isLocked={isLocked}
                            onShowPreview={(sym) => setPreviewSymbol({ symbol: sym, rowIndex: displayIndex })}
                          />
                        </td>
                      );
                    }
                    
                    return (
                      <td
                        key={col.key}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isEditing) handleCellClick(displayIndex, col.key, e);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleCellDoubleClick(displayIndex, col.key);
                        }}
                        className={`
                          ${col.width} px-3 py-2 text-sm relative group
                          ${col.key === 'code' ? 'font-mono font-bold text-cyan-400' : isLocked ? 'text-emerald-400 font-medium' : 'text-gray-300'}
                          ${isLocked ? 'bg-emerald-900/10' : ''}
                          ${!isEditing ? 'cursor-text hover:bg-gray-700/30 hover:ring-1 hover:ring-inset hover:ring-gray-600' : ''}
                        `}
                        title={!isEditing ? 'Click or double-click to edit' : undefined}
                      >
                        {isEditing ? (
                          <>
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => {
                                // Delay so a click on a suggestion can fire first.
                                setTimeout(() => {
                                  if (editingCell?.rowIndex === actualIndex && editingCell?.column === col.key) {
                                    handleEditComplete();
                                  }
                                }, 120);
                              }}
                              onKeyDown={(e) => {
                                const hasSuggestions = autocompleteSuggestions.length > 0;
                                if (e.key === 'ArrowDown' && hasSuggestions) {
                                  e.preventDefault();
                                  setAutocompleteIndex(i => Math.min(i + 1, autocompleteSuggestions.length - 1));
                                  return;
                                }
                                if (e.key === 'ArrowUp' && hasSuggestions) {
                                  e.preventDefault();
                                  setAutocompleteIndex(i => Math.max(i - 1, 0));
                                  return;
                                }
                                if (e.key === 'Enter') {
                                  if (hasSuggestions && autocompleteSuggestions[autocompleteIndex]) {
                                    commitEditValue(autocompleteSuggestions[autocompleteIndex]);
                                  } else {
                                    handleEditComplete();
                                  }
                                  return;
                                }
                                if (e.key === 'Escape') handleEditCancel();
                                if (e.key === 'Tab') {
                                  e.preventDefault();
                                  if (hasSuggestions && autocompleteSuggestions[autocompleteIndex]) {
                                    commitEditValue(autocompleteSuggestions[autocompleteIndex]);
                                  } else {
                                    handleEditComplete();
                                  }
                                  // Move to next column
                                  const currentColIndex = COLUMNS.findIndex(c => c.key === col.key);
                                  const nextCol = COLUMNS[currentColIndex + 1];
                                  if (nextCol) {
                                    setTimeout(() => handleCellClick(displayIndex, nextCol.key, e as any), 50);
                                  }
                                }
                              }}
                              className="w-full px-2 py-1 bg-gray-700 border-2 border-indigo-500 rounded text-white text-sm focus:outline-none shadow-lg"
                            />
                            {(col.key === 'pointLayer' || col.key === 'lineLayer' || col.key === 'lineType' || col.key === 'category') && autocompleteSuggestions.length > 0 && (
                              <div
                                className="absolute left-0 right-0 mt-1 z-50 max-h-56 overflow-y-auto bg-gray-900 border border-indigo-500 rounded shadow-xl text-xs"
                                onMouseDown={(e) => e.preventDefault() /* keep input focus */}
                              >
                                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-700 bg-gray-800 sticky top-0">
                                  {autocompleteSuggestions.length} match{autocompleteSuggestions.length === 1 ? '' : 'es'} · ↑↓ Enter
                                </div>
                                {autocompleteSuggestions.map((suggestion, idx) => (
                                  <button
                                    key={suggestion}
                                    type="button"
                                    onClick={() => commitEditValue(suggestion)}
                                    onMouseEnter={() => setAutocompleteIndex(idx)}
                                    className={`w-full text-left px-2 py-1 font-mono ${idx === autocompleteIndex ? 'bg-indigo-600 text-white' : 'text-gray-200 hover:bg-gray-800'}`}
                                  >
                                    {suggestion}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <span className={cellValue === '-' ? 'text-gray-600' : ''}>
                              {String(cellValue || '-')}
                            </span>
                            {/* AI-Protected indicator (green = user owns this value) */}
                            {isLocked && (
                              <span 
                                className="absolute top-0.5 right-0.5 text-emerald-500 text-xs opacity-60 group-hover:opacity-100 cursor-pointer transition-opacity"
                                title={`✓ AI-Protected (you can still edit this)\n\nEdited: ${code.userEdits?.[col.key]?.editedAt ? new Date(code.userEdits[col.key].editedAt).toLocaleString() : 'Unknown'}\nOriginal: "${code.userEdits?.[col.key]?.originalValue || 'N/A'}"\n\nClick to remove protection (allows AI to modify)`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Remove AI protection from this field?\n\nYou can still edit it anytime, but the AI will also be able to modify it when regenerating standards.\n\nCurrent value: "${String(cellValue)}"\nOriginal value: "${code.userEdits?.[col.key]?.originalValue || 'N/A'}"`)) {
                                    handleUnlockCell(displayIndex, col.key);
                                  }
                                }}
                              >
                                🛡️
                              </span>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        
        {filteredCodes.length === 0 && (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <p>No codes match your search</p>
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="flex-shrink-0 bg-gray-800 border-t border-gray-700 px-4 py-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span>Total: <strong className="text-gray-300">{stats.total}</strong> codes</span>
            <span>•</span>
            <span>Linework: <strong className="text-orange-400">{stats.lineworkCodes}</strong></span>
            <span>•</span>
            <span>Point-only: <strong className="text-blue-400">{stats.total - stats.lineworkCodes}</strong></span>
            <span>•</span>
            <span>Categories: <strong className="text-gray-300">{stats.categories}</strong></span>
            {stats.lockedCells > 0 && (
              <>
                <span>•</span>
                <span className="text-emerald-400">🛡️ {stats.lockedCells} AI-protected</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span>Click or double-click to edit • 🛡️ = AI-protected (you can still edit) • Tab to move • Esc to cancel</span>
          </div>
        </div>
      </div>

      {/* Field-to-Finish Settings Modal */}
      {showF2FSettings && (
        <FieldToFinishSettings
          settings={f2fSettings}
          onSettingsChange={(newSettings) => {
            setF2FSettings(newSettings);
            setHasChanges(true);
          }}
          availableCodes={codes}
          onClose={() => setShowF2FSettings(false)}
        />
      )}

      {/* Symbol Preview Modal */}
      {previewSymbol && (
        <SymbolPreviewModal
          symbol={previewSymbol.symbol}
          codeName={filteredCodes[previewSymbol.rowIndex]?.code || ''}
          onClose={() => setPreviewSymbol(null)}
          onRegenerate={() => {
            // Trigger regeneration for this specific symbol
            const code = filteredCodes[previewSymbol.rowIndex];
            if (code) {
              // Clear current symbol and try to find a match from library
              const matchedSymbol = findMatchingSymbol(code.code, code.description);
              if (matchedSymbol) {
                const symbolDef = libraryToSymbolDefinition(matchedSymbol);
                handleSymbolChange(previewSymbol.rowIndex, symbolDef);
              }
              setPreviewSymbol(null);
            }
          }}
          onRegenerateAll={() => {
            // Close modal and open auto-assign dialog
            setPreviewSymbol(null);
            handleAutoAssignOpen();
          }}
          onClear={() => {
            handleSymbolChange(previewSymbol.rowIndex, undefined);
            setPreviewSymbol(null);
          }}
        />
      )}

      {/* Auto-Assign Symbols Modal */}
      {showAutoAssign && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 w-full max-w-3xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-4 border-b border-gray-700">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    📚 Auto-Assign Symbols from Library
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Found {autoAssignResults.length} codes without symbols that match library entries
                  </p>
                </div>
                <button
                  onClick={() => setShowAutoAssign(false)}
                  className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto p-4">
              {autoAssignResults.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-4xl mb-4">✓</p>
                  <p>All codes either have symbols or no matches found in the library.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Select All / None */}
                  <div className="flex items-center gap-4 mb-4 text-sm">
                    <button
                      onClick={() => setAutoAssignResults(prev => prev.map(r => ({ ...r, selected: true })))}
                      className="text-cyan-400 hover:text-cyan-300"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => setAutoAssignResults(prev => prev.map(r => ({ ...r, selected: false })))}
                      className="text-gray-400 hover:text-gray-300"
                    >
                      Select None
                    </button>
                    <span className="text-gray-500 ml-auto">
                      {autoAssignResults.filter(r => r.selected).length} selected
                    </span>
                  </div>

                  {autoAssignResults.map((result, idx) => (
                    <div
                      key={result.codeIndex}
                      className={`
                        flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer
                        ${result.selected 
                          ? 'bg-purple-900/30 border-purple-600' 
                          : 'bg-gray-900/50 border-gray-700 hover:border-gray-600'}
                      `}
                      onClick={() => {
                        setAutoAssignResults(prev => prev.map((r, i) => 
                          i === idx ? { ...r, selected: !r.selected } : r
                        ));
                      }}
                    >
                      {/* Checkbox */}
                      <div className={`
                        w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0
                        ${result.selected ? 'bg-purple-600 border-purple-600' : 'border-gray-600'}
                      `}>
                        {result.selected && <span className="text-white text-xs">✓</span>}
                      </div>

                      {/* Code Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-cyan-400">{result.code}</span>
                          <span className="text-gray-500 text-sm truncate">{result.description}</span>
                        </div>
                      </div>

                      {/* Arrow */}
                      <span className="text-gray-500">→</span>

                      {/* Matched Symbol */}
                      {result.matchedSymbol && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <svg
                            className="w-6 h-6 text-purple-400"
                            viewBox={result.matchedSymbol.viewBox || '0 0 24 24'}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <path d={result.matchedSymbol.svgPath} strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span className="text-sm text-gray-300">{result.matchedSymbol.name}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-400">
                            {result.matchedSymbol.category}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-gray-700 flex justify-between items-center">
              <div className="text-sm text-gray-500">
                Library has {SURVEY_SYMBOL_LIBRARY.length} symbols
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAutoAssign(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAutoAssignApply}
                  disabled={autoAssignResults.filter(r => r.selected).length === 0}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Apply {autoAssignResults.filter(r => r.selected).length} Symbols
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Surveyor Code Matcher Modal */}
      {showSurveyorMatcher && (
        <SurveyorCodeMatcher
          masterCodes={codes}
          session={surveyorSession}
          onSessionChange={(next) => {
            setSurveyorSession(next);
            setHasChanges(true);
          }}
          onAcceptMatches={(acceptedMatches) => {
            // Add accepted uploaded codes as aliases to master codes
            saveToUndo();
            const updatedCodes = codes.map(code => {
              const matchesForCode = acceptedMatches.filter(m => m.matchedMasterCode === code.code);
              if (matchesForCode.length === 0) return code;
              
              // Build surveyorAliases map - each surveyor's code(s) for this
              // master code. Append to any existing alias list so we never
              // clobber terms the user (or a prior batch) already accepted.
              const newSurveyorAliases = { ...code.surveyorAliases };
              matchesForCode.forEach(m => {
                if (m.surveyorId && m.uploadedCode !== code.code) {
                  const existing = normalizeSurveyorAliases(newSurveyorAliases[m.surveyorId]);
                  if (!existing.some(t => t.toUpperCase() === m.uploadedCode.toUpperCase())) {
                    newSurveyorAliases[m.surveyorId] = [...existing, m.uploadedCode];
                  }
                }
              });
              
              // Also keep legacy aliases array for backward compatibility
              const newAliases = matchesForCode.map(m => m.uploadedCode);
              const existingAliases = code.aliases || [];
              const mergedAliases = [...new Set([...existingAliases, ...newAliases])];
              
              return {
                ...code,
                aliases: mergedAliases,
                surveyorAliases: Object.keys(newSurveyorAliases).length > 0 ? newSurveyorAliases : undefined,
              };
            });
            setCodes(updatedCodes);
            setShowSurveyorMatcher(false);
            
            // Auto-select first surveyor if none selected
            if (!selectedSurveyorId && surveyorSession.surveyors.length > 0) {
              setSelectedSurveyorId(surveyorSession.surveyors[0].id);
            }
          }}
          onAddMasterCode={(newCode) => {
            // Add a brand new master code to the list
            saveToUndo();
            setCodes(prevCodes => [...prevCodes, newCode]);
          }}
          onClose={() => setShowSurveyorMatcher(false)}
        />
      )}

      {/* Sanity Check Panel — lists every cross-domain alias mismatch with a
          one-click action to remove the alias. Closed when no conflicts. */}
      {isSanityPanelOpen && (
        <div
          className="fixed inset-0 z-[10000] bg-black/70 flex items-center justify-center p-6"
          onClick={() => setIsSanityPanelOpen(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
              <div>
                <h2 className="text-lg font-semibold text-white">Alias Sanity Check</h2>
                <p className="text-xs text-gray-400">
                  Cross-domain mismatches between surveyor aliases and master codes.
                  Rule-based heuristics — review and act where it matters.
                </p>
              </div>
              <button
                onClick={() => setIsSanityPanelOpen(false)}
                className="px-3 py-1 text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {aliasConflicts.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-4xl mb-2">✓</div>
                  <div className="text-sm">No alias domain conflicts detected.</div>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="text-left py-2">Surveyor</th>
                      <th className="text-left py-2">Alias</th>
                      <th className="text-left py-2">Master Code</th>
                      <th className="text-left py-2">Why flagged</th>
                      <th className="text-right py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aliasConflicts.map((c, idx) => (
                      <tr key={`${c.surveyorId}-${c.masterCode}-${c.aliasTerm}-${idx}`} className="border-t border-gray-800">
                        <td className="py-2 text-gray-300">{c.surveyorName}</td>
                        <td className="py-2 font-mono font-bold text-yellow-300">{c.aliasTerm}</td>
                        <td className="py-2">
                          <div className="font-mono font-bold text-white">{c.masterCode}</div>
                          <div className="text-xs text-gray-400">{c.masterDescription}</div>
                        </td>
                        <td className="py-2 text-xs text-gray-300">
                          <div><span className="text-yellow-300">{c.aliasDomains.join(' / ')}</span> vs <span className="text-cyan-300">{c.masterDomains.join(' / ')}</span></div>
                        </td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => {
                              saveToUndo();
                              setCodes(prev => prev.map((code, ri) => {
                                if (ri !== c.rowIndex) return code;
                                const aliases = { ...(code.surveyorAliases || {}) };
                                const terms = normalizeSurveyorAliases(aliases[c.surveyorId]);
                                const next = terms.filter((_, ti) => ti !== c.termIndex);
                                if (next.length === 0) delete aliases[c.surveyorId];
                                else aliases[c.surveyorId] = next;
                                return {
                                  ...code,
                                  surveyorAliases: Object.keys(aliases).length > 0 ? aliases : undefined,
                                };
                              }));
                            }}
                            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-700 text-xs text-gray-500">
              Aliases that don't trigger the lexicon (e.g. project-specific shorthand) are intentionally not flagged.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
