/**
 * Replay channel catalogue (v2).
 *
 * Channel ids are stable. A change to a channel's serialized shape bumps that
 * channel's `version` and its surface's version. The catalogue is the single
 * source for manifest generation and drift checks.
 */

import type {
  ReplayChannelManifestEntry,
  ReplaySurfaceId,
} from './v2';

export interface ReplayChannelDeclaration {
  id: string;
  surface: ReplaySurfaceId;
  keyframe: boolean;
  diff: 'replace' | 'keyed-array';
  /** Defaults to 1. */
  version?: number;
}

export interface ReplayChannelMeta {
  id: string;
  surface: ReplaySurfaceId;
  keyframe: boolean;
  diff: 'replace' | 'keyed-array';
  version: number;
}

export const REPLAY_CHANNELS: readonly ReplayChannelDeclaration[] = [
  // Canvas geometry and display state.
  { id: 'canvas.pointLists', surface: 'canvas', keyframe: true, diff: 'keyed-array' },
  { id: 'canvas.lines', surface: 'canvas', keyframe: true, diff: 'keyed-array' },
  { id: 'canvas.centerlines', surface: 'canvas', keyframe: true, diff: 'keyed-array' },
  { id: 'canvas.contourLabels', surface: 'canvas', keyframe: true, diff: 'keyed-array' },
  { id: 'canvas.boundaryFiles', surface: 'canvas', keyframe: true, diff: 'keyed-array' },
  { id: 'canvas.textAnnotations', surface: 'canvas', keyframe: true, diff: 'keyed-array' },
  { id: 'canvas.dimensions', surface: 'canvas', keyframe: true, diff: 'keyed-array' },
  { id: 'canvas.hatches', surface: 'canvas', keyframe: true, diff: 'keyed-array' },
  { id: 'canvas.streetLabels', surface: 'canvas', keyframe: true, diff: 'keyed-array' },
  { id: 'canvas.parcelLabels', surface: 'canvas', keyframe: true, diff: 'keyed-array' },
  { id: 'canvas.areaLabels', surface: 'canvas', keyframe: true, diff: 'keyed-array' },
  { id: 'canvas.customSymbols', surface: 'canvas', keyframe: true, diff: 'keyed-array' },
  { id: 'canvas.cadLayerVisibility', surface: 'canvas', keyframe: true, diff: 'replace' },
  { id: 'canvas.cadLayerColors', surface: 'canvas', keyframe: true, diff: 'replace' },
  { id: 'canvas.pointLayers', surface: 'canvas', keyframe: true, diff: 'replace' },
  { id: 'canvas.contourSettings', surface: 'canvas', keyframe: true, diff: 'replace' },
  { id: 'canvas.orientationTuple', surface: 'canvas', keyframe: true, diff: 'replace' },
  { id: 'canvas.pendingPointDeletes', surface: 'canvas', keyframe: true, diff: 'replace' },
  { id: 'canvas.camera', surface: 'canvas', keyframe: true, diff: 'replace' },
  { id: 'canvas.toolState', surface: 'canvas', keyframe: true, diff: 'replace' },

  // Tool shelf, drawers and layout.
  { id: 'viewport.activeVisualPanel', surface: 'tool-shelf', keyframe: true, diff: 'replace' },
  { id: 'viewport.isChatPanelVisible', surface: 'tool-shelf', keyframe: true, diff: 'replace' },
  { id: 'viewport.isToolShelfVisible', surface: 'tool-shelf', keyframe: true, diff: 'replace' },
  { id: 'viewport.isToolsDrawerOpen', surface: 'tool-shelf', keyframe: true, diff: 'replace' },
  { id: 'viewport.isVisualPanelFullscreen', surface: 'tool-shelf', keyframe: true, diff: 'replace' },
  { id: 'viewport.isPdfViewerFullscreen', surface: 'tool-shelf', keyframe: true, diff: 'replace' },
  { id: 'viewport.contourPanelHeight', surface: 'tool-shelf', keyframe: true, diff: 'replace' },
  { id: 'viewport.toolShelfWidth', surface: 'tool-shelf', keyframe: true, diff: 'replace' },
  { id: 'viewport.fabPosition', surface: 'tool-shelf', keyframe: false, diff: 'replace' },

  // Point editor.
  { id: 'viewport.isPointEditorExpanded', surface: 'point-editor', keyframe: true, diff: 'replace' },
  { id: 'viewport.pointEditorHeight', surface: 'point-editor', keyframe: true, diff: 'replace' },
  { id: 'pointEditor.selection', surface: 'point-editor', keyframe: true, diff: 'replace' },
  { id: 'pointEditor.draft', surface: 'point-editor', keyframe: true, diff: 'replace' },
  { id: 'pointEditor.filters', surface: 'point-editor', keyframe: true, diff: 'replace' },
  { id: 'pointEditor.pendingDelete', surface: 'point-editor', keyframe: true, diff: 'replace' },

  // Chat and AI display state.
  { id: 'viewport.chatPanelWidth', surface: 'chat', keyframe: true, diff: 'replace' },
  { id: 'chat.histories', surface: 'chat', keyframe: true, diff: 'keyed-array' },
  { id: 'chat.activeAgentThread', surface: 'chat', keyframe: true, diff: 'replace' },
  { id: 'chat.fieldbookNotes', surface: 'chat', keyframe: true, diff: 'replace' },
  { id: 'chat.composerDraft', surface: 'chat', keyframe: false, diff: 'replace' },

  // App-level state.
  { id: 'viewport.pageMode', surface: 'app', keyframe: true, diff: 'replace' },
  { id: 'viewport.isInitialScreen', surface: 'app', keyframe: true, diff: 'replace' },
  { id: 'viewport.showWelcome', surface: 'modals', keyframe: true, diff: 'replace' },
  { id: 'viewport.modals', surface: 'modals', keyframe: true, diff: 'replace' },
  { id: 'app.jobInfo', surface: 'app', keyframe: true, diff: 'replace' },
  { id: 'app.settingsDisplay', surface: 'app', keyframe: true, diff: 'replace' },
  { id: 'app.activeAgent', surface: 'app', keyframe: true, diff: 'replace' },
  { id: 'app.lastActiveAgent', surface: 'app', keyframe: true, diff: 'replace' },
  { id: 'app.activeModel', surface: 'app', keyframe: true, diff: 'replace' },
  { id: 'app.initializedAgents', surface: 'app', keyframe: true, diff: 'replace' },
  { id: 'app.notifications', surface: 'notifications', keyframe: true, diff: 'keyed-array' },
  { id: 'app.criticalError', surface: 'notifications', keyframe: true, diff: 'replace' },
  { id: 'app.textEditorContent', surface: 'text-editor', keyframe: true, diff: 'replace' },
  { id: 'app.activeTextEditorFile', surface: 'text-editor', keyframe: true, diff: 'replace' },

  // Files and embedded assets.
  { id: 'files.rawFile', surface: 'files', keyframe: true, diff: 'replace' },
  { id: 'files.deedFile', surface: 'files', keyframe: true, diff: 'replace' },
  { id: 'files.planFiles', surface: 'files', keyframe: true, diff: 'replace' },
  { id: 'files.dxfFile', surface: 'files', keyframe: true, diff: 'replace' },
  { id: 'files.clFile', surface: 'files', keyframe: true, diff: 'replace' },
  { id: 'files.imageFiles', surface: 'files', keyframe: true, diff: 'replace' },
  { id: 'files.gisFile', surface: 'files', keyframe: true, diff: 'replace' },
  { id: 'files.gisFeatures', surface: 'files', keyframe: true, diff: 'keyed-array' },
  { id: 'files.generatedFiles', surface: 'files', keyframe: true, diff: 'keyed-array' },
  { id: 'files.pdfViewerFiles', surface: 'files', keyframe: true, diff: 'replace' },

  // Timeline dock.
  { id: 'timeline.document', surface: 'timeline', keyframe: true, diff: 'replace' },
  { id: 'timeline.cursor', surface: 'timeline', keyframe: true, diff: 'replace' },
  { id: 'timeline.activeSketch', surface: 'timeline', keyframe: true, diff: 'replace' },
  { id: 'timeline.suppression', surface: 'timeline', keyframe: true, diff: 'replace' },

  // PDF viewer.
  { id: 'pdf.pageIndex', surface: 'pdf-viewer', keyframe: true, diff: 'replace' },
  { id: 'pdf.zoom', surface: 'pdf-viewer', keyframe: true, diff: 'replace' },
  { id: 'pdf.scroll', surface: 'pdf-viewer', keyframe: false, diff: 'replace' },
  { id: 'pdf.rotation', surface: 'pdf-viewer', keyframe: true, diff: 'replace' },
  { id: 'pdf.fileIndex', surface: 'pdf-viewer', keyframe: true, diff: 'replace' },

  // CAD manager (wave 2).
  { id: 'cad.manager', surface: 'cad', keyframe: true, diff: 'replace' },
];

export const CRITICAL_REPLAY_CHANNELS: readonly string[] = [
  'canvas.pointLists',
  'canvas.lines',
  'canvas.camera',
  'viewport.activeVisualPanel',
];

const channelById = new Map(REPLAY_CHANNELS.map(channel => [channel.id, channel] as const));

export const replayChannelMeta = (id: string): ReplayChannelMeta | null => {
  const channel = channelById.get(id);
  if (!channel) return null;
  return {
    id: channel.id,
    surface: channel.surface,
    keyframe: channel.keyframe,
    diff: channel.diff,
    version: channel.version ?? 1,
  };
};

export const replayChannelManifest = (): ReplayChannelManifestEntry[] =>
  REPLAY_CHANNELS.map(channel => ({
    id: channel.id,
    version: channel.version ?? 1,
    surface: channel.surface,
    keyframe: channel.keyframe,
  }));

export const isCriticalReplayChannel = (id: string): boolean =>
  CRITICAL_REPLAY_CHANNELS.includes(id);
