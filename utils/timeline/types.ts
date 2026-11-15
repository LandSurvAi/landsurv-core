// Timeline / sketch domain contracts.
//
// The timeline is a persistent feature history layered on top of the existing
// per-edit undo engine. A feature stores:
//   * the semantic entity deltas it applied, and
//   * a snapshot of the tracked canvas after it ran (in memory only; stripped
//     from .lsvz so the archive does not duplicate the whole drawing per step).
//
// Sketches are one feature. Their internal edits are stored as the feature's
// deltas; there is deliberately no separate timeline entry per line.
//
// Not every useful timeline step changes geometry. Questions, shrinkwrap
// reviews, and AOI decisions are recorded as zero-delta event features so they
// still form a readable history without being replayable canvas edits.

import type { PointList, SurveyLine, Centerline, ContourLabel, BoundaryFile } from '../../types';

export interface TimelineSnapshot {
  pointLists: PointList[];
  lines: SurveyLine[];
  centerlines: Centerline[];
  contourLabels: ContourLabel[];
  boundaryFiles: BoundaryFile[];
}

export type TimelineEntityKind =
  | 'point-list'
  | 'point'
  | 'line'
  | 'centerline'
  | 'contour-label'
  | 'boundary-file';

export type TimelineDeltaAction = 'add' | 'update' | 'remove';

export interface TimelineDelta {
  kind: TimelineEntityKind;
  action: TimelineDeltaAction;
  /** Stable entity id (point number for points, list id for lists). */
  id: string;
  /** Parent list for point deltas. */
  listId?: string;
  /** Optional insertion index, used to preserve array order on replay. */
  index?: number;
  /** Full entity or partial metadata payload. */
  value?: unknown;
  /**
   * Digest of the entity immediately before this delta was recorded.
   * On replay, a mismatch means the upstream state changed in a way this
   * absolute delta cannot rebase. The delta still applies, but the feature is
   * marked stale so the divergence is visible.
   */
  beforeDigest?: string;
}

/** Visual vocabulary shared by every timeline entry. */
export type TimelineIcon =
  | 'baseline'
  | 'sketch'
  | 'upload'
  | 'deed'
  | 'boundary'
  | 'c3d'
  | 'question'
  | 'shrinkwrap'
  | 'aoi'
  | 'surface'
  | 'contour'
  | 'station'
  | 'export'
  | 'display'
  | 'generate'
  | 'ai'
  | 'feature';

export type TimelineFeatureKind =
  | 'baseline'
  | 'sketch'
  | 'manual-feature'
  | 'ai-turn'
  | 'import'
  | 'display'
  | 'param-generation'
  | 'event'
  | 'utterance';

export type TimelineFeatureStatus =
  | 'applied'
  | 'current'
  | 'future'
  | 'suppressed'
  | 'error'
  | 'pending'
  | 'stale';

export interface TimelineAuthor {
  type: 'human' | 'agent';
  agent?: string;
  displayName?: string;
}

export interface TimelineFeatureError {
  code:
    | 'REPLAY_DELTA_FAILED'
    | 'REPLAY_MISSING_ENTITY'
    | 'REPLAY_INVALID_DELTA'
    | 'REPLAY_MISSING_FEATURE';
  message: string;
  failedDeltaIndex?: number;
}

export interface TimelineFeatureMeta {
  /** Glyph rendered in the compact timeline strip. */
  icon?: TimelineIcon;
  /** Extra hover-card context; not part of replay. */
  detail?: string;
}

export interface TimelineFeature extends TimelineFeatureMeta {
  id: string;
  kind: TimelineFeatureKind;
  label: string;
  createdAt: number;
  author: TimelineAuthor;
  deltas: TimelineDelta[];
  /** State after this feature ran. In-memory checkpoint, not serialized. */
  snapshot: TimelineSnapshot;
  suppressed: boolean;
  /** Container this entry belongs to (usually a sketch). */
  parentFeatureId?: string;
  /** True for the empty sketch created automatically when points arrive first. */
  isGroup?: boolean;
  /** Replay produced a different premise but was still applied. */
  stale?: boolean;
  error?: TimelineFeatureError;
}

export interface TimelineFeatureView extends TimelineFeature {
  status: TimelineFeatureStatus;
}

export interface TimelineDocument {
  schemaVersion: 1;
  id: string;
  createdAt: number;
  updatedAt: number;
  baselineFeatureId: string;
  features: TimelineFeature[];
  cursorFeatureId: string;
  /** Sketch that receives new point imports until a new sketch is started. */
  currentSketchFeatureId?: string;
  sketchCounter: number;
}

export interface SerializedTimelineFeature extends TimelineFeatureMeta {
  id: string;
  kind: TimelineFeatureKind;
  label: string;
  createdAt: number;
  author: TimelineAuthor;
  deltas: TimelineDelta[];
  suppressed: boolean;
  parentFeatureId?: string;
  isGroup?: boolean;
  stale?: boolean;
  error?: TimelineFeatureError;
}

export interface SerializedTimelineDocument {
  schemaVersion: 1;
  id: string;
  createdAt: number;
  updatedAt: number;
  baselineFeatureId: string;
  /** The state before the first feature. Serialized once. */
  baselineSnapshot: TimelineSnapshot;
  features: SerializedTimelineFeature[];
  cursorFeatureId: string;
  currentSketchFeatureId?: string;
  sketchCounter: number;
}

export interface TimelinePendingEvent extends TimelineFeatureMeta {
  label: string;
  kind: 'event' | 'utterance';
}

export interface TimelineEventInput extends TimelineFeatureMeta {
  label: string;
  kind?: 'event' | 'utterance';
  /** Attach to the current sketch group when no transaction is open. */
  groupWithCurrentSketch?: boolean;
  /** Attach to a specific existing feature. */
  parentFeatureId?: string;
}

export interface TimelineTransaction {
  kind: 'sketch' | 'manual-feature' | 'import';
  label: string;
  startedAt: number;
  startSnapshot: TimelineSnapshot;
  /** Present when a finished sketch is being re-entered and edited. */
  editingFeatureId?: string;
  /** Point imports become child entries under a sketch instead of top-level rows. */
  sketchGroup?: boolean;
  /** Icon/detail copied onto the committed feature. */
  icon?: TimelineIcon;
  detail?: string;
  /** Events raised while this transaction is open; flushed under the result. */
  pendingEvents?: TimelinePendingEvent[];
}

export interface ActiveSketchInfo {
  id: string;
  name: string;
}

export interface TimelineContextValue {
  document: TimelineDocument;
  features: TimelineFeatureView[];
  activeSketch: ActiveSketchInfo | null;
  activeTransaction: TimelineTransaction | null;
  isSketchMode: boolean;
  hasFuture: boolean;
  lastReplayError: TimelineFeatureError | null;

  beginSketch: () => void;
  finishSketch: () => void;
  cancelSketch: () => void;
  reopenSketch: (featureId: string) => boolean;

  beginFeature: (label?: string, meta?: TimelineFeatureMeta) => void;
  beginImport: (
    label: string,
    options?: TimelineFeatureMeta & { sketchGroup?: boolean },
  ) => boolean;
  commitFeature: (label?: string) => void;
  cancelFeature: () => void;
  recordEvent: (event: TimelineEventInput) => boolean;

  moveCursor: (featureId: string) => void;
  renameFeature: (featureId: string, label: string) => void;
  toggleSuppress: (featureId: string) => void;
  deleteFeature: (featureId: string) => void;

  resetTimeline: (snapshot?: TimelineSnapshot) => void;
  loadTimeline: (
    serialized?: SerializedTimelineDocument,
    snapshot?: TimelineSnapshot,
  ) => void;
  getSerializableDocument: () => SerializedTimelineDocument;
}

export function emptyTimelineSnapshot(): TimelineSnapshot {
  return {
    pointLists: [],
    lines: [],
    centerlines: [],
    contourLabels: [],
    boundaryFiles: [],
  };
}
