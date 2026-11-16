/**
 * Recording v2 capture helpers.
 *
 * The v1 bundle remains the recorder's editing/library format while the real
 * app player is rolled out. V2 is written alongside it: a full keyframe at
 * start/stop and compact channel changes in between.
 */

import { createEmptyAnnotations, createEmptyEdits, createRecordingId } from './bundle';
import type {
  JsonValue,
  RecordingBundleV2,
  RecordingManifestV2,
  ReplayKeyframe,
  ReplayKeyframeReason,
} from '../../utils/recording/v2';
import { RECORDER_VERSION_V2 } from '../../utils/recording/v2';
import { REPLAY_SURFACES } from '../../utils/recording/surfaces';
import { replayChannelManifest } from '../../utils/recording/channels';
import { hashJson } from '../../utils/recording/stable';
import { buildTimeMap } from '../../utils/recording/time';
import type { RecordingSeed } from '../../utils/recording/types';

export const toJsonValue = (value: unknown): JsonValue => {
  if (value === undefined) return null;
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? null : JSON.parse(serialized) as JsonValue;
  } catch {
    return null;
  }
};

export const seedV2Channels = (seed: RecordingSeed): Record<string, JsonValue> => ({
  'canvas.pointLists': toJsonValue(seed.project.pointLists ?? []),
  'canvas.lines': toJsonValue(seed.project.lines ?? []),
  'canvas.centerlines': toJsonValue(seed.project.centerlines ?? []),
  'canvas.contourLabels': toJsonValue(seed.project.contourLabels ?? []),
  'canvas.boundaryFiles': toJsonValue(seed.project.boundaryFiles ?? []),
  'canvas.textAnnotations': toJsonValue(seed.project.textAnnotations ?? []),
  'canvas.dimensions': toJsonValue(seed.project.dimensions ?? []),
  'canvas.hatches': toJsonValue(seed.project.hatches ?? []),
  'canvas.streetLabels': toJsonValue(seed.project.streetLabels ?? []),
  'canvas.parcelLabels': toJsonValue(seed.project.parcelLabels ?? []),
  'canvas.areaLabels': toJsonValue(seed.project.areaLabels ?? []),
  'canvas.customSymbols': toJsonValue(seed.project.customSymbols ?? []),
  'canvas.camera': toJsonValue(seed.camera ?? seed.project.camera ?? null),
  'app.jobInfo': toJsonValue(seed.project.jobInfo),
  'app.activeAgent': toJsonValue(seed.ui.activeAgent ?? null),
  'app.lastActiveAgent': toJsonValue(seed.ui.activeAgent ?? null),
  'viewport.activeVisualPanel': toJsonValue(seed.ui.activeVisualPanel ?? 'canvas'),
  'viewport.isChatPanelVisible': toJsonValue(seed.ui.isChatPanelVisible ?? true),
  'viewport.isToolShelfVisible': toJsonValue(seed.ui.isToolShelfVisible ?? true),
  'viewport.pageMode': 'app',
  'viewport.showWelcome': false,
  'viewport.isInitialScreen': false,
  'chat.histories': toJsonValue(seed.project.chat ?? []),
});

export const makeV2Keyframe = (
  t: number,
  id: string,
  kind: ReplayKeyframe['kind'],
  reason: ReplayKeyframeReason,
  channels: Iterable<[string, JsonValue]>,
): ReplayKeyframe => ({
  t,
  id,
  kind,
  reason,
  channels: Object.fromEntries(
    Array.from(channels, ([channel, value]) => [channel, { h: hashJson(value), v: value }]),
  ),
});

const buildManifest = (
  seed: RecordingSeed,
  appVersion: string,
  id: string,
  now: string,
): RecordingManifestV2 => ({
  schemaVersion: 2,
  id,
  title: seed.title?.trim() || seed.project.jobInfo?.jobName?.trim() || 'Untitled training',
  description: undefined,
  createdAt: now,
  updatedAt: now,
  appVersion,
  recorderVersion: RECORDER_VERSION_V2,
  timebase: 'monotonic-ms',
  durationMs: 0,
  editedDurationMs: 0,
  viewport: {
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  },
  counts: {
    keyframes: 1,
    changes: 0,
    events: 0,
    ai: 0,
    cursorSamples: 0,
    assets: 0,
    chapters: 0,
    callouts: 0,
    strokes: 0,
    masks: 0,
  },
  features: {
    timeline: true,
    video: false,
    audio: false,
    sandboxDrawing: true,
    appPlayback: true,
  },
  aiReveal: 'instant',
  status: 'draft',
  surfaces: REPLAY_SURFACES.map(surface => ({ ...surface })),
  channels: replayChannelManifest(),
  assets: [],
  paths: {
    keyframes: 'keyframes.ndjson',
    changes: 'changes.ndjson',
    cursor: 'cursor.ndjson',
    events: 'events.ndjson',
    ai: 'ai.ndjson',
    annotations: 'annotations.json',
    edits: 'edits.json',
    assets: 'assets/index.json',
  },
});

export interface V2CaptureStart {
  bundle: RecordingBundleV2;
  channels: Record<string, JsonValue>;
}

export const createV2CaptureFromSeed = (
  seed: RecordingSeed,
  appVersion: string,
  id: string = createRecordingId(),
  now: string = new Date().toISOString(),
): V2CaptureStart => {
  const channels = seedV2Channels(seed);
  const manifest = buildManifest(seed, appVersion, id, now);
  const sourceSettings = seed.project.settings;
  // Display-only whitelist. Never copy BYOK keys, NTRIP credentials, Notion
  // tokens, or Google Maps keys into a recording or takeover handoff.
  const displaySettings: Record<string, unknown> = {
    theme: sourceSettings.theme,
    coordinatePrecision: sourceSettings.coordinatePrecision,
    linearUnits: sourceSettings.linearUnits,
    zoomToPointLevel: sourceSettings.zoomToPointLevel,
    projection: sourceSettings.projection,
    defaultCutSheetInfo: sourceSettings.defaultCutSheetInfo,
    northArrowStyle: sourceSettings.northArrowStyle,
    northArrowPosition: sourceSettings.northArrowPosition,
    pointLabelingSettings: sourceSettings.pointLabelingSettings,
    uncertaintySensitivity: sourceSettings.uncertaintySensitivity,
    pointAttributeScaling: sourceSettings.pointAttributeScaling,
    showPointSymbols: sourceSettings.showPointSymbols,
    pointEfficiencyMode: sourceSettings.pointEfficiencyMode,
    showCacpNotifications: sourceSettings.showCacpNotifications,
    showCacpHandlerNotifications: sourceSettings.showCacpHandlerNotifications,
    floodHatch: sourceSettings.floodHatch,
    soilHatch: sourceSettings.soilHatch,
  };
  const bundle: RecordingBundleV2 = {
    schemaVersion: 2,
    manifest,
    startState: {
      schemaVersion: 2,
      capturedAt: now,
      appVersion,
      jobInfo: seed.project.jobInfo,
      settings: displaySettings,
      files: seed.project.files ?? [],
      chat: seed.project.chat ?? [],
      ui: seed.ui,
      camera: seed.camera ?? seed.project.camera ?? null,
    },
    keyframes: [
      makeV2Keyframe(0, 'v2-kf-0', 'full', 'start', Object.entries(channels)),
    ],
    changes: [],
    cursor: [],
    ai: [],
    events: [],
    annotations: createEmptyAnnotations(),
    edits: createEmptyEdits(),
  };
  recountV2Bundle(bundle);
  return { bundle, channels };
};

export const recountV2Bundle = (bundle: RecordingBundleV2): void => {
  const { manifest, keyframes, changes, events, ai, cursor, annotations } = bundle;
  manifest.counts = {
    keyframes: keyframes.length,
    changes: changes.length,
    events: events.length,
    ai: ai.length,
    cursorSamples: cursor.length,
    assets: manifest.assets.length,
    chapters: annotations.chapters.length,
    callouts: annotations.callouts.length,
    strokes: annotations.strokes.length,
    masks: annotations.masks.length,
  };
  manifest.editedDurationMs = buildTimeMap(bundle.edits, manifest.durationMs).editedDurationMs;
  manifest.updatedAt = new Date().toISOString();
};
