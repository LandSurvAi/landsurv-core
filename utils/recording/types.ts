/**
 * Integrated session recording — data model.
 *
 * A recording is its own entity: it is not the timeline, not undo history, and
 * not a field on the live project. It references a display snapshot of the
 * project only so the replay shell can seed itself, then applies semantic
 * events recorded from the live app.
 */

import type {
  AgentType,
  ChatMessage,
  EmbeddedTrainingIndex,
  JobInfo,
  Settings,
  SessionState,
} from '../../types';

type ArrayMember<T> = T extends readonly (infer U)[] ? U : never;

export type ReplayPointList = ArrayMember<SessionState['pointLists']>;
export type ReplayLine = ArrayMember<SessionState['lines']>;
export type ReplayCenterline = ArrayMember<SessionState['centerlines']>;
export type ReplayContourLabel = ArrayMember<SessionState['contourLabels']>;
export type ReplayBoundaryFile = NonNullable<ArrayMember<NonNullable<SessionState['boundaryFiles']>>>;
export type ReplayTextAnnotation = NonNullable<ArrayMember<NonNullable<SessionState['textAnnotations']>>>;
export type ReplayDimension = NonNullable<ArrayMember<NonNullable<SessionState['dimensions']>>>;
export type ReplayHatch = NonNullable<ArrayMember<NonNullable<SessionState['hatches']>>>;
export type ReplayStreetLabel = NonNullable<ArrayMember<NonNullable<SessionState['streetLabels']>>>;
export type ReplayParcelLabel = NonNullable<ArrayMember<NonNullable<SessionState['parcelLabels']>>>;
export type ReplayAreaLabel = NonNullable<ArrayMember<NonNullable<SessionState['areaLabels']>>>;

export const RECORDING_SCHEMA_VERSION = 1;
export const RECORDER_VERSION = '1.0.0';
export const MAX_RECORDING_DURATION_MS = 60 * 60 * 1000;

export type CameraTransform = { scale: number; offsetX: number; offsetY: number };

export interface ReplayUiState {
  activeAgent?: AgentType;
  activeVisualPanel?: string;
  isChatPanelVisible?: boolean;
  isToolShelfVisible?: boolean;
  theme?: string;
  tool?: string;
  isDrawing?: boolean;
  isTrimming?: boolean;
  isExtending?: boolean;
  isDeleting?: boolean;
  selectedCount?: number;
}

export interface RecordedFileSummary {
  name: string;
  kind: string;
  sizeBytes?: number;
}

export interface RecordedChatThread {
  agent: AgentType;
  messages: ChatMessage[];
}

export interface ReplayProject {
  jobInfo: JobInfo;
  /** Camera at Record. Later camera events supersede it during playback. */
  camera?: CameraTransform | null;
  /** Display-only settings — never the full Settings object (credentials are excluded). */
  settings: Partial<Settings> | Record<string, unknown>;
  pointLists: ReplayPointList[];
  lines: ReplayLine[];
  centerlines: ReplayCenterline[];
  contourLabels: ReplayContourLabel[];
  boundaryFiles?: ReplayBoundaryFile[];
  textAnnotations?: ReplayTextAnnotation[];
  dimensions?: ReplayDimension[];
  hatches?: ReplayHatch[];
  streetLabels?: ReplayStreetLabel[];
  parcelLabels?: ReplayParcelLabel[];
  areaLabels?: ReplayAreaLabel[];
  customSymbols?: NonNullable<SessionState['customSymbols']>;
  files: RecordedFileSummary[];
  chat: RecordedChatThread[];
  ui: ReplayUiState;
}

export interface ReplayStartState {
  schemaVersion: 1;
  capturedAt: string;
  appVersion: string;
  project: ReplayProject;
}

export type RecordingEventType =
  | 'session/start'
  | 'session/pause'
  | 'session/resume'
  | 'session/stop'
  | 'camera'
  | 'cursor'
  | 'geometry/deltas'
  | 'geometry/replace'
  | 'chat/message'
  | 'ai/result'
  | 'ui/state'
  | 'system/visibility';

export interface CursorSample {
  /** Normalized app viewport coordinate, 0..1. */
  x: number;
  y: number;
  visible: boolean;
  kind?: 'move' | 'down' | 'up' | 'click';
}

export interface GeometryDelta {
  entity: string;
  action: 'add' | 'update' | 'remove';
  id: string;
  value?: unknown;
}

export interface AiRecord {
  id: string;
  t: number;
  turnId: string;
  agent: AgentType;
  model?: string;
  promptText: string;
  responseText: string;
  toolCalls: Array<{
    name: string;
    argsSummary: string;
    resultSummary: string;
    status: 'ok' | 'error' | 'cancelled';
  }>;
  durationMs: number;
  status: 'ok' | 'error' | 'cancelled';
  error?: string;
}

/**
 * A single recorded event. Optional payload fields keep NDJSON parsing and
 * forward compatibility simple: unknown event types are skipped, not fatal.
 */
export interface RecordingEvent {
  t: number;
  id: string;
  type: RecordingEventType | string;
  camera?: CameraTransform;
  cursor?: CursorSample;
  ui?: ReplayUiState;
  deltas?: GeometryDelta[];
  entity?: string;
  value?: unknown;
  message?: {
    agent: AgentType;
    role: 'user' | 'model';
    text: string;
    model?: string;
    index: number;
  };
  ai?: AiRecord;
}

export interface StateFrame {
  t: number;
  id: string;
  kind: 'keyframe' | 'change';
  camera?: CameraTransform;
  ui?: ReplayUiState;
  cursor?: CursorSample;
}

export interface AnnotationChapter {
  id: string;
  title: string;
  description?: string;
  /** Source-time milliseconds. Composition maps this to the effective timeline. */
  atMs: number;
  anchorEventId?: string;
  suggested?: boolean;
}

export interface AnnotationCallout {
  id: string;
  atMs: number;
  durationMs: number;
  title?: string;
  body: string;
  /** Normalized viewport coordinates, 0..1. */
  position: { x: number; y: number };
  anchor?: { eventId?: string; panel?: string; entityId?: string };
  style: 'note' | 'arrow' | 'spotlight';
  color?: string;
  suggested?: boolean;
}

export interface AnnotationStroke {
  id: string;
  atMs: number;
  durationMs: number;
  tool: 'freehand' | 'line' | 'arrow' | 'rect' | 'ellipse';
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
  opacity: number;
  coordinateSpace: 'viewport' | 'canvas';
  canvasTransform?: CameraTransform;
}

export interface AnnotationMask {
  id: string;
  atMs: number;
  durationMs: number;
  shape: 'rect' | 'ellipse';
  rect: { x: number; y: number; w: number; h: number };
  mode: 'blur' | 'solid';
  color?: string;
}

export interface AnnotationDocument {
  schemaVersion: 1;
  chapters: AnnotationChapter[];
  callouts: AnnotationCallout[];
  strokes: AnnotationStroke[];
  masks: AnnotationMask[];
}

export interface SpeedRange {
  id: string;
  startMs: number;
  endMs: number;
  rate: number;
}

export interface TrimRange {
  id: string;
  startMs: number;
  endMs: number;
}

export interface EditDocument {
  schemaVersion: 1;
  updatedAt: string;
  trims: TrimRange[];
  speed: SpeedRange[];
  chapterRetimes: Array<{ chapterId: string; atMs: number }>;
}

export interface RecordingManifest {
  schemaVersion: 1;
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
  counts: {
    events: number;
    frames: number;
    ai: number;
    chapters: number;
    callouts: number;
    strokes: number;
    masks: number;
  };
  features: {
    timeline: boolean;
    video: boolean;
    audio: boolean;
    sandboxDrawing: true;
  };
  aiReveal: 'instant' | 'simulated';
  status: 'draft' | 'edited' | 'exported' | 'linked' | 'error';
  paths: {
    startState: 'start-state.json';
    events: 'events.ndjson';
    frames: 'frames.ndjson';
    ai: 'ai.ndjson';
    annotations: 'annotations.json';
    edits: 'edits.json';
    thumbnail?: 'thumbnail.png';
    video?: 'media/video.webm';
    audio?: 'media/audio.webm';
  };
  checksum?: string;
  warnings?: string[];
}

export interface RecordingBundle {
  schemaVersion: 1;
  manifest: RecordingManifest;
  startState: ReplayStartState;
  events: RecordingEvent[];
  frames: StateFrame[];
  ai: AiRecord[];
  annotations: AnnotationDocument;
  edits: EditDocument;
}

export interface RecordingSeed {
  project: ReplayProject;
  camera: CameraTransform | null;
  ui: ReplayUiState;
  title?: string;
}

export interface RecordingSummary {
  id: string;
  title: string;
  createdAt: string;
  durationMs: number;
  editedDurationMs: number;
  eventCount: number;
  status: RecordingManifest['status'];
  aiReveal: 'instant' | 'simulated';
}

export type TrainingIndex = EmbeddedTrainingIndex;
