/**
 * sessionService.ts
 * Extracted business logic for session management (.lsvz file handling)
 * Phase 8: Business Logic Extraction
 * 
 * Handles:
 * - Session file creation and serialization
 * - Session file loading and deserialization
 * - Version compatibility and migration
 * - ZIP file packaging
 */

import JSZip from 'jszip';
import { SessionState, SessionFile, AgentType, SessionSaveOptions } from '../types';
import {
  createSessionZip as createCanonicalSessionZip,
  generateSessionFileName as generateCanonicalSessionFileName,
} from '../utils/sessionZip';
import {
  COMPATIBLE_VERSIONS as DEFAULT_COMPATIBLE_VERSIONS,
  isVersionCompatible,
} from '../utils/sessionDefaults';
import { normalizeLoadedSession } from '../utils/sessionMigration';

/**
 * Compatible versions for session file loading
 * Update this when changing SessionState structure
 */
export const COMPATIBLE_VERSIONS = [
  ...DEFAULT_COMPATIBLE_VERSIONS,
];

/**
 * Create a ZIP file containing session state and all associated files
 */
export const createSessionZip = async (
  sessionState: Omit<SessionState, 'fileManagerChatHistory' | 'textEditorChatHistory'>,
  filesToInclude: (SessionFile | null | undefined)[]
): Promise<Blob> => {
  return createCanonicalSessionZip(
    sessionState as SessionState,
    filesToInclude.filter(Boolean) as SessionFile[]
  );
};

/**
 * Generate a suggested filename for session export
 */
export const generateSessionFileName = (
  jobName: string,
  associatedFiles: (string | undefined | null)[],
  options?: SessionSaveOptions
): string => {
  return generateCanonicalSessionFileName(
    jobName,
    associatedFiles.map(name => name ?? undefined),
    options
  );
};

/**
 * Validate a session file for compatibility
 */
export const validateSessionFile = (sessionState: SessionState): void => {
  if (sessionState.version && !isVersionCompatible(sessionState.version)) {
    throw new Error(`Incompatible session version: ${sessionState.version}`);
  }
};

/**
 * Determine which agents were active based on session state
 */
export const determineLoadedAgents = (sessionState: SessionState): Set<AgentType> => {
  const loadedAgents = new Set<AgentType>();

  if (sessionState.rawFile) loadedAgents.add(AgentType.RAW_CRAWLER);
  if (sessionState.deedFile) loadedAgents.add(AgentType.DEED_READER);
  if (sessionState.planFiles) loadedAgents.add(AgentType.CIVIL_PLAN_EXPERT);
  if (sessionState.dxfFile) loadedAgents.add(AgentType.DXF_ANALYZER);
  if (sessionState.clFile) loadedAgents.add(AgentType.CENTERLINE_STATIONING);
  if (sessionState.imageFiles) loadedAgents.add(AgentType.IMAGE_ANALYZER);
  if (sessionState.gisFile) loadedAgents.add(AgentType.GIS_AGENT);
  if (sessionState.contouringChatHistory && sessionState.contouringChatHistory.length > 0) {
    loadedAgents.add(AgentType.CONTOURING_AGENT);
  }
  if (sessionState.profileChatHistory && sessionState.profileChatHistory.length > 0) {
    loadedAgents.add(AgentType.PROFILE_AGENT);
  }
  if (sessionState.cogoChatHistory && sessionState.cogoChatHistory.length > 0) {
    loadedAgents.add(AgentType.COGO_AGENT);
  }

  loadedAgents.add(AgentType.POINT_EDITOR);

  if (sessionState.gpsStakeoutChatHistory) {
    loadedAgents.add(AgentType.GPS_STAKEOUT);
  }

  loadedAgents.add(AgentType.LSVZ_AGENT);

  return loadedAgents;
};

/**
 * Check if session requires migration from older version
 */
export const needsVersionMigration = (version: string | undefined): boolean => {
  if (!version) return true;
  return parseFloat(version) < 1.8;
};

/**
 * Extract files from a ZIP-based session file
 */
export const extractFilesFromZip = async (arrayBuffer: ArrayBuffer): Promise<{
  sessionState: SessionState;
  files: Map<string, string>;
}> => {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const manifestFile = zip.file('manifest.json');

  if (!manifestFile) {
    throw new Error('Invalid .lsvz file: manifest.json not found.');
  }

  const manifestContent = await manifestFile.async('string');
  const parsedSessionState = JSON.parse(manifestContent) as Partial<SessionState>;

  // Validate session state
  validateSessionFile(parsedSessionState as SessionState);

  const sessionState = normalizeLoadedSession(parsedSessionState);

  // Extract files from both legacy files/ directory and canonical root layout.
  const files = new Map<string, string>();

  for (const [filePath, file] of Object.entries(zip.files)) {
    if (file.dir || filePath === 'manifest.json') continue;

    const isLegacyFolderFile = filePath.startsWith('files/');
    const isRootFile = !filePath.includes('/');
    if (!isLegacyFolderFile && !isRootFile) continue;

    const fileName = filePath.split('/').pop();
    if (fileName) {
      const content = await file.async('string');
      files.set(fileName, content);
    }
  }

  return { sessionState, files };
};

/**
 * Determine which visual panel to show based on UI state
 * Includes backwards compatibility for older versions
 */
export const determineActiveVisualPanel = (uiState: any): string => {
  if (uiState.activeVisualPanel) {
    return uiState.activeVisualPanel;
  }

  // Backwards compatibility for versions < 1.15.0
  if (uiState.isCutSheetVisible) return 'cutsheet';
  if (uiState.isFieldbookVisible) return 'fieldbook';
  if (uiState.isPdfViewerVisible) return 'pdfviewer';
  if (uiState.isTextEditorVisible) return 'texteditor';
  if (uiState.isGpsStakeoutVisible) return 'gpsstakeout';
  if (uiState.isFileManagerVisible) return 'filemanager';
  if (uiState.isImageAnalyzerVisible) return 'imageanalyzer';
  if (uiState.isWmsPanelVisible) return 'wms';

  // Default to canvas if no visual panel is saved
  return 'canvas';
};

/**
 * Migrate point layers structure for backwards compatibility
 * Older versions stored booleans, newer versions store objects with color
 */
export const migratePointLayers = (loadedPointLayers: any): any => {
  if (typeof (loadedPointLayers as any).pointNumber === 'boolean') {
    return {
      pointNumber: { visible: (loadedPointLayers as any).pointNumber, color: '#00FFFF' },
      description: { visible: (loadedPointLayers as any).description, color: '#FF00FF' },
      elevation: { visible: (loadedPointLayers as any).elevation, color: '#00FF00' },
    };
  }
  return loadedPointLayers;
};

/**
 * Load a single file from session if it matches the active text editor file
 */
export const loadTextEditorFile = (
  sessionState: SessionState,
  activeTextEditorFile: string | null,
  activeVisualPanel: string
): string | null => {
  if (!activeTextEditorFile || activeVisualPanel !== 'texteditor') {
    return null;
  }

  const allFiles = [
    sessionState.rawFile,
    sessionState.deedFile,
    sessionState.dxfFile,
    sessionState.clFile,
    ...(sessionState.planFiles || []),
    ...(sessionState.generatedFiles || []),
  ].filter((f) => f !== null) as SessionFile[];

  const fileToOpen = allFiles.find((f) => f.name === activeTextEditorFile);
  return fileToOpen?.content || null;
};
