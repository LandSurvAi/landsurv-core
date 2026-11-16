/**
 * Session playback schema v2.
 *
 * This module is deliberately separate from `./types` while the v1 recorder is
 * still shipping. V2 bundles are written behind the capture flag described in
 * APP-PLAYS-THE-APP-spec.md, then become the only format once the real-app
 * player replaces the legacy replay shell.
 */

import type { JobInfo, Settings } from '../../types';
import type {
  AiRecord,
  AnnotationDocument,
  CameraTransform,
  CursorSample,
  EditDocument,
  RecordedChatThread,
  RecordedFileSummary,
  ReplayUiState,
} from './types';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const RECORDING_SCHEMA_VERSION_V2 = 2 as const;
export const RECORDER_VERSION_V2 = '2.0.0';

export type ReplaySurfaceId =
  | 'canvas'
  | 'tool-shelf'
  | 'point-editor'
  | 'chat'
  | 'timeline'
  | 'modals'
  | 'files'
  | 'notifications'
  | 'app'
  | 'pdf-viewer'
  | 'cad'
  | 'settings'
  | 'text-editor'
  | 'raw-replay';

export interface ReplayChannelManifestEntry {
  id: string;
  version: number;
  surface: ReplaySurfaceId;
  keyframe: boolean;
}

export type RecordingAssetKind = 'csv' | 'pdf' | 'image' | 'dxf' | 'geojson' | 'text' | 'other';

export interface RecordingAsset {
  id: string;
  name: string;
  kind: RecordingAssetKind;
  mime: string;
  sizeBytes: number;
  sha256: string;
  refs: string[];
}

export interface RecordingManifestV2 {
  schemaVersion: 2;
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  appVersion: string;
  recorderVersion: string;
  timebase: 'monotonic-ms';
  durationMs: number;
  editedDurationMs?: number;
  viewport: { width: number; height: number; dpr: number };
  canvasViewport?: { width: number; height: number };
  counts: {
    keyframes: number;
    changes: number;
    events: number;
    ai: number;
    cursorSamples: number;
    assets: number;
    chapters: number;
    callouts: number;
    strokes: number;
    masks: number;
  };
  features: {
    timeline: boolean;
    video: false;
    audio: false;
    sandboxDrawing: true;
    appPlayback: true;
  };
  aiReveal: 'instant';
  status: 'draft' | 'edited' | 'exported' | 'linked' | 'error';
  surfaces: Array<{ id: ReplaySurfaceId; version: number }>;
  channels: ReplayChannelManifestEntry[];
  assets: RecordingAsset[];
  paths: {
    keyframes: string;
    changes: string;
    cursor: string;
    events: string;
    ai: string;
    annotations: string;
    edits: string;
    assets: string;
    thumbnail?: string;
    video?: string;
    audio?: string;
  };
  checksum?: string;
  warnings?: string[];
}

export interface ReplayStartStateV2 {
  schemaVersion: 2;
  capturedAt: string;
  appVersion: string;
  jobInfo: JobInfo;
  /** Display-only settings. Credentials and viewer-owned keys are excluded. */
  settings: Partial<Settings> | Record<string, unknown>;
  files: RecordedFileSummary[];
  chat: RecordedChatThread[];
  ui: ReplayUiState;
  camera: CameraTransform | null;
}

export type ReplayKeyframeReason =
  | 'start'
  | 'stop'
  | 'safety'
  | 'panel-change'
  | 'agent-change'
  | 'modal-change'
  | 'project-change'
  | 'file-import'
  | 'timeline-seek'
  | 'chat-thread-change'
  | 'large-change'
  | 'pause'
  | 'resume';

export interface ReplayKeyframeChannel {
  /** Diagnostic hash of the channel value. Resolution never depends on it. */
  h: string;
  /** Omitted on a patch means "inherit the previous resolved value". */
  v?: JsonValue;
}

export interface ReplayKeyframe {
  t: number;
  id: string;
  kind: 'full' | 'patch';
  reason: ReplayKeyframeReason;
  baseId?: string;
  channels: Record<string, ReplayKeyframeChannel>;
}

export interface ReplayKeyedDelta {
  action: 'add' | 'update' | 'remove';
  id: string;
  value?: JsonValue;
}

export type ReplayChange =
  | {
      t: number;
      seq: number;
      ch: string;
      op: 'replace';
      v: JsonValue;
    }
  | {
      t: number;
      seq: number;
      ch: string;
      op: 'keyed';
      entity: string;
      deltas: ReplayKeyedDelta[];
    };

export interface CursorFrame extends CursorSample {
  t: number;
}

export interface RecordingActivityEvent {
  t: number;
  id: string;
  type: string;
  label?: string;
  data?: JsonValue;
}

export interface RecordingBundleV2 {
  schemaVersion: 2;
  manifest: RecordingManifestV2;
  startState: ReplayStartStateV2;
  keyframes: ReplayKeyframe[];
  changes: ReplayChange[];
  cursor: CursorFrame[];
  ai: AiRecord[];
  events: RecordingActivityEvent[];
  annotations: AnnotationDocument;
  edits: EditDocument;
}

export interface TakeoverDocument {
  schemaVersion: 1;
  id: string;
  recordingId: string;
  createdAt: string;
  atMs: number;
  sourceTimeMs: number;
  appVersion: string;
  recordingTitle: string;
  channels: Record<string, JsonValue>;
  assetIds: string[];
  projectName: string;
}

export interface ReplayChannelDefinition<T> {
  /** Stable forever. Example: `canvas.pointLists`. */
  id: string;
  surface: ReplaySurfaceId;
  /** Bumped when the serialized shape or semantics change. */
  version: number;
  keyframe: boolean;
  diff: 'replace' | 'keyed-array';
  idOf?: (entity: unknown) => string;
  serialize: (value: T) => JsonValue;
  deserialize?: (json: JsonValue) => T;
  migrate?: (fromVersion: number, json: JsonValue) => JsonValue;
  equals?: (a: T, b: T) => boolean;
}
