/**
 * FileStateContext - Manages all file-related state in the application
 * 
 * This context is part of the "Strangler Pattern" refactoring effort.
 * It will gradually replace file state management in App.tsx.
 * 
 * Migration Status: 🟡 IN PROGRESS
 * - Phase 1: Context created, not yet integrated
 * - Phase 2: Wire up alongside existing App.tsx state (both will coexist)
 * - Phase 3: Migrate file upload handlers to use this context
 * - Phase 4: Remove old state from App.tsx once fully migrated
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { SessionFile, GisFeature } from '../types.ts';

// ============================================================================
// Types
// ============================================================================

interface FileState {
  // Primary data files (one per agent type)
  rawFile: SessionFile | null;
  deedFile: SessionFile | null;
  planFiles: SessionFile[] | null;
  dxfFile: SessionFile | null;
  clFile: SessionFile | null;
  imageFiles: SessionFile[] | null;
  gisFile: SessionFile | null;
  gisFeatures: GisFeature[];
  
  // Generated/processed files
  generatedFiles: SessionFile[];
  
  // PDF viewer state
  pdfViewerFiles: SessionFile[] | null;
}

interface FileActions {
  // File setters (support both value and updater function like useState)
  setRawFile: (file: SessionFile | null) => void;
  setDeedFile: (file: SessionFile | null) => void;
  setPlanFiles: (files: SessionFile[] | null | ((prev: SessionFile[] | null) => SessionFile[] | null)) => void;
  setDxfFile: (file: SessionFile | null) => void;
  setClFile: (file: SessionFile | null) => void;
  setImageFiles: (files: SessionFile[] | null | ((prev: SessionFile[] | null) => SessionFile[] | null)) => void;
  setGisFile: (file: SessionFile | null) => void;
  setGisFeatures: (features: GisFeature[] | ((prev: GisFeature[]) => GisFeature[])) => void;
  setGeneratedFiles: (files: SessionFile[] | ((prev: SessionFile[]) => SessionFile[])) => void;
  setPdfViewerFiles: (files: SessionFile[] | null | ((prev: SessionFile[] | null) => SessionFile[] | null)) => void;
  
  // Helper actions
  addGeneratedFile: (file: SessionFile) => void;
  addGeneratedFiles: (files: SessionFile[]) => void;
  addPlanFiles: (files: SessionFile[]) => void;
  addImageFiles: (files: SessionFile[]) => void;
  archiveFile: (file: SessionFile, newFile: SessionFile) => void;
  
  // Reset
  resetAllFiles: () => void;
  
  // Query helpers
  hasAnyFiles: () => boolean;
  getAllFiles: () => SessionFile[];
}

type FileContextValue = FileState & FileActions;

// ============================================================================
// Context
// ============================================================================

const FileStateContext = createContext<FileContextValue | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface FileStateProviderProps {
  children: ReactNode;
}

export const FileStateProvider: React.FC<FileStateProviderProps> = ({ children }) => {
  // State
  const [rawFile, setRawFile] = useState<SessionFile | null>(null);
  const [deedFile, setDeedFile] = useState<SessionFile | null>(null);
  const [planFiles, setPlanFiles] = useState<SessionFile[] | null>(null);
  const [dxfFile, setDxfFile] = useState<SessionFile | null>(null);
  const [clFile, setClFile] = useState<SessionFile | null>(null);
  const [imageFiles, setImageFiles] = useState<SessionFile[] | null>(null);
  const [gisFile, setGisFile] = useState<SessionFile | null>(null);
  const [gisFeatures, setGisFeatures] = useState<GisFeature[]>([]);
  const [generatedFiles, setGeneratedFiles] = useState<SessionFile[]>([]);
  const [pdfViewerFiles, setPdfViewerFiles] = useState<SessionFile[] | null>(null);

  // Helper actions
  const addGeneratedFile = useCallback((file: SessionFile) => {
    setGeneratedFiles(prev => [...prev, file]);
  }, []);

  const addGeneratedFiles = useCallback((files: SessionFile[]) => {
    setGeneratedFiles(prev => [...prev, ...files]);
  }, []);

  const addPlanFiles = useCallback((files: SessionFile[]) => {
    setPlanFiles(prev => {
      if (!prev) return files;
      return [...prev, ...files];
    });
  }, []);

  const addImageFiles = useCallback((files: SessionFile[]) => {
    setImageFiles(prev => {
      if (!prev) return files;
      return [...prev, ...files];
    });
  }, []);

  const archiveFile = useCallback((oldFile: SessionFile, newFile: SessionFile) => {
    const archivedFile = { ...oldFile, name: `(Archived) ${oldFile.name}` };
    addGeneratedFile(archivedFile);
  }, [addGeneratedFile]);

  const resetAllFiles = useCallback(() => {
    setRawFile(null);
    setDeedFile(null);
    setPlanFiles(null);
    setDxfFile(null);
    setClFile(null);
    setImageFiles(null);
    setGisFile(null);
    setGisFeatures([]);
    setGeneratedFiles([]);
    setPdfViewerFiles(null);
  }, []);

  const hasAnyFiles = useCallback(() => {
    return !!(
      rawFile ||
      deedFile ||
      planFiles?.length ||
      dxfFile ||
      clFile ||
      imageFiles?.length ||
      gisFile ||
      gisFeatures.length ||
      generatedFiles.length
    );
  }, [rawFile, deedFile, planFiles, dxfFile, clFile, imageFiles, gisFile, gisFeatures, generatedFiles]);

  const getAllFiles = useCallback((): SessionFile[] => {
    const files: SessionFile[] = [];
    if (rawFile) files.push(rawFile);
    if (deedFile) files.push(deedFile);
    if (planFiles) files.push(...planFiles);
    if (dxfFile) files.push(dxfFile);
    if (clFile) files.push(clFile);
    if (imageFiles) files.push(...imageFiles);
    if (gisFile) files.push(gisFile);
    files.push(...generatedFiles);
    return files;
  }, [rawFile, deedFile, planFiles, dxfFile, clFile, imageFiles, gisFile, generatedFiles]);

  const value: FileContextValue = {
    // State
    rawFile,
    deedFile,
    planFiles,
    dxfFile,
    clFile,
    imageFiles,
    gisFile,
    gisFeatures,
    generatedFiles,
    pdfViewerFiles,
    
    // Setters
    setRawFile,
    setDeedFile,
    setPlanFiles,
    setDxfFile,
    setClFile,
    setImageFiles,
    setGisFile,
    setGisFeatures,
    setGeneratedFiles,
    setPdfViewerFiles,
    
    // Helpers
    addGeneratedFile,
    addGeneratedFiles,
    addPlanFiles,
    addImageFiles,
    archiveFile,
    resetAllFiles,
    hasAnyFiles,
    getAllFiles,
  };

  return (
    <FileStateContext.Provider value={value}>
      {children}
    </FileStateContext.Provider>
  );
};

// ============================================================================
// Hook
// ============================================================================

export const useFileState = (): FileContextValue => {
  const context = useContext(FileStateContext);
  if (context === undefined) {
    throw new Error('useFileState must be used within a FileStateProvider');
  }
  return context;
};
