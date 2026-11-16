/**
 * Recording bundle packaging and .lsvz export.
 *
 * A bundle is stored as one object in IndexedDB and serialized into the
 * `training/<id>/` tree when embedded in a .lsvz. The archive keeps the
 * recording's start-state project authoritative so the recipient opens the
 * project they actually see in the replay.
 */

import JSZip from 'jszip';
import { AgentType, type SessionState } from '../../types';
import {
  createSessionZip,
  type TrainingAsset,
} from '../../utils/sessionZip';
import { buildTimeMap } from '../../utils/recording/time';
import { normalizeLoadedSession } from '../../utils/sessionMigration';
import { toDisplaySettings } from '../../utils/recording/settings';
import {
  RECORDER_VERSION,
  RECORDING_SCHEMA_VERSION,
  type AnnotationDocument,
  type EditDocument,
  type RecordingBundle,
  type RecordingSeed,
  type ReplayStartState,
} from '../../utils/recording/types';
import type { EmbeddedTrainingIndex } from '../../types';

export const createRecordingId = (): string => {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `rec-${Date.now().toString(36)}-${random}`;
};

export const createEmptyAnnotations = (): AnnotationDocument => ({
  schemaVersion: 1,
  chapters: [],
  callouts: [],
  strokes: [],
  masks: [],
});

export const createEmptyEdits = (): EditDocument => ({
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
  trims: [],
  speed: [],
  chapterRetimes: [],
});

export const createBundleFromSeed = (
  seed: RecordingSeed,
  appVersion: string,
  id: string = createRecordingId(),
): RecordingBundle => {
  const now = new Date().toISOString();
  const startState: ReplayStartState = {
    schemaVersion: RECORDING_SCHEMA_VERSION,
    capturedAt: now,
    appVersion,
    project: { ...seed.project, settings: toDisplaySettings(seed.project.settings) },
  };
  const manifest: RecordingBundle['manifest'] = {
    schemaVersion: RECORDING_SCHEMA_VERSION,
    id,
    title: seed.title?.trim() || seed.project.jobInfo?.jobName?.trim() || 'Untitled training',
    createdAt: now,
    updatedAt: now,
    appVersion,
    recorderVersion: RECORDER_VERSION,
    timebase: 'monotonic-ms',
    durationMs: 0,
    viewport: {
      width: typeof window !== 'undefined' ? window.innerWidth : 1440,
      height: typeof window !== 'undefined' ? window.innerHeight : 900,
      dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    },
    counts: { events: 0, frames: 0, ai: 0, chapters: 0, callouts: 0, strokes: 0, masks: 0 },
    features: { timeline: false, video: false, audio: false, sandboxDrawing: true },
    aiReveal: 'simulated',
    status: 'draft',
    paths: {
      startState: 'start-state.json',
      events: 'events.ndjson',
      frames: 'frames.ndjson',
      ai: 'ai.ndjson',
      annotations: 'annotations.json',
      edits: 'edits.json',
    },
  };

  return {
    schemaVersion: RECORDING_SCHEMA_VERSION,
    manifest,
    startState,
    events: [],
    frames: [],
    ai: [],
    annotations: createEmptyAnnotations(),
    edits: createEmptyEdits(),
  };
};

export const recountBundle = (bundle: RecordingBundle): void => {
  const { manifest, annotations, events, frames, ai } = bundle;
  manifest.counts = {
    events: events.length,
    frames: frames.length,
    ai: ai.length,
    chapters: annotations.chapters.length,
    callouts: annotations.callouts.length,
    strokes: annotations.strokes.length,
    masks: annotations.masks.length,
  };
  manifest.editedDurationMs = buildTimeMap(bundle.edits, manifest.durationMs).editedDurationMs;
  manifest.updatedAt = new Date().toISOString();
};

export const buildTrainingIndex = (
  bundle: RecordingBundle,
  sourceProjectLabel?: string,
): EmbeddedTrainingIndex => ({
  schemaVersion: 1,
  recordings: [{
    id: bundle.manifest.id,
    title: bundle.manifest.title,
    createdAt: bundle.manifest.createdAt,
    appVersion: bundle.manifest.appVersion,
    durationMs: bundle.manifest.durationMs,
    editedDurationMs: bundle.manifest.editedDurationMs ?? bundle.manifest.durationMs,
    status: bundle.manifest.status === 'error' ? 'draft' : bundle.manifest.status,
    hasVideo: Boolean(bundle.manifest.features.video),
    hasAudio: Boolean(bundle.manifest.features.audio),
    manifestPath: `training/${bundle.manifest.id}/manifest.json`,
    sourceProjectLabel,
  }],
  defaultRecordingId: bundle.manifest.id,
});

export const buildTrainingIndexForBundles = (
  bundles: RecordingBundle[],
  defaultRecordingId?: string,
): EmbeddedTrainingIndex | null => {
  if (bundles.length === 0) return null;
  return {
    schemaVersion: 1,
    recordings: bundles.map(bundle => buildTrainingIndex(bundle).recordings[0]),
    defaultRecordingId: defaultRecordingId ?? bundles[0]?.manifest.id,
  };
};

export const mergeTrainingIndexes = (
  first: EmbeddedTrainingIndex | null | undefined,
  second: EmbeddedTrainingIndex | null | undefined,
): EmbeddedTrainingIndex | null => {
  if (!first && !second) return null;
  if (!first) return second ?? null;
  if (!second) return first;
  const byId = new Map<string, EmbeddedTrainingIndex['recordings'][number]>();
  for (const recording of first.recordings) byId.set(recording.id, recording);
  for (const recording of second.recordings) byId.set(recording.id, recording);
  return {
    schemaVersion: 1,
    recordings: [...byId.values()],
    defaultRecordingId: first.defaultRecordingId ?? second.defaultRecordingId,
  };
};

const ndjson = (rows: unknown[]): string =>
  rows.map(row => JSON.stringify(row)).join('\n');

export const bundleToTrainingAssets = (bundle: RecordingBundle): TrainingAsset[] => {
  recountBundle(bundle);
  const base = `training/${bundle.manifest.id}`;
  const startState = {
    ...bundle.startState,
    project: { ...bundle.startState.project, settings: toDisplaySettings(bundle.startState.project.settings) },
  };
  return [
    { path: `${base}/manifest.json`, data: JSON.stringify(bundle.manifest, null, 2) },
    { path: `${base}/start-state.json`, data: JSON.stringify(startState, null, 2) },
    { path: `${base}/events.ndjson`, data: ndjson(bundle.events) },
    { path: `${base}/frames.ndjson`, data: ndjson(bundle.frames) },
    { path: `${base}/ai.ndjson`, data: ndjson(bundle.ai) },
    { path: `${base}/annotations.json`, data: JSON.stringify(bundle.annotations, null, 2) },
    { path: `${base}/edits.json`, data: JSON.stringify(bundle.edits, null, 2) },
  ];
};

const readText = async (value: Blob | string): Promise<string> => {
  if (typeof value === 'string') return value;
  if (typeof value.text === 'function') return value.text();
  // Older/embedded browsers (and jsdom) may not implement Blob.text().
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read a training asset.'));
    reader.readAsText(value);
  });
};

const parseNdjson = <T>(text: string): T[] => {
  if (!text.trim()) return [];
  const rows: T[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line) as T);
    } catch {
      // A single truncated autosave line must not invalidate the recording.
    }
  }
  return rows;
};

/** Rebuild a bundle from the `training/<id>/**` entries extracted from a .lsvz. */
export const bundleFromTrainingAssets = async (
  training: Map<string, Blob | string>,
  recordingId: string,
): Promise<RecordingBundle> => {
  const base = `training/${recordingId}`;
  const get = async (name: string): Promise<string> => {
    const value = training.get(`${base}/${name}`);
    if (value === undefined) throw new Error(`Training recording is missing ${name}.`);
    return readText(value);
  };

  const manifest = JSON.parse(await get('manifest.json')) as RecordingBundle['manifest'];
  if (manifest?.schemaVersion !== RECORDING_SCHEMA_VERSION || manifest.id !== recordingId) {
    throw new Error('Training recording has an unsupported or mismatched manifest.');
  }
  const startState = JSON.parse(await get('start-state.json')) as ReplayStartState;
  startState.project.settings = toDisplaySettings(startState.project.settings);
  let annotations = createEmptyAnnotations();
  let edits = createEmptyEdits();
  try {
    annotations = JSON.parse(await get('annotations.json')) as AnnotationDocument;
  } catch {
    /* optional for older recordings */
  }
  try {
    edits = JSON.parse(await get('edits.json')) as EditDocument;
  } catch {
    /* optional for older recordings */
  }

  return {
    schemaVersion: RECORDING_SCHEMA_VERSION,
    manifest,
    startState,
    events: parseNdjson(await get('events.ndjson')),
    frames: parseNdjson(await get('frames.ndjson')),
    ai: parseNdjson(await get('ai.ndjson')),
    annotations,
    edits,
  };
};

const chatFor = (bundle: RecordingBundle, agent: AgentType) =>
  bundle.startState.project.chat.find(thread => thread.agent === agent)?.messages ?? [];

/**
 * Build the .lsvz project that ships beside the training. It is deliberately
 * seeded from the recording start state, not the live project, so a recipient
 * opens exactly the project the replay shows.
 */
export const buildSessionStateForBundle = (bundle: RecordingBundle): SessionState => {
  const project = bundle.startState.project;
  const ui = project.ui ?? {};
  const session = {
    version: bundle.startState.appVersion,
    savedAt: new Date().toISOString(),
    settings: toDisplaySettings(project.settings),
    rawFile: null,
    deedFile: null,
    planFiles: null,
    dxfFile: null,
    clFile: null,
    imageFiles: null,
    gisFile: null,
    generatedFiles: [],
    pdfViewerFiles: null,
    pdfHighlights: [],
    customSymbols: project.customSymbols ?? [],
    jobInfo: project.jobInfo,
    rawChatHistory: [],
    deedChatHistory: [],
    civilDrafterChatHistory: [],
    dxfChatHistory: [],
    stationingChatHistory: [],
    pointEditorChatHistory: [],
    fieldbookChatHistory: [],
    gpsStakeoutChatHistory: [],
    lsvzChatHistory: chatFor(bundle, AgentType.LSVZ_AGENT),
    planExpertChatHistory: [],
    imageAnalyzerChatHistory: [],
    gisChatHistory: [],
    contouringChatHistory: [],
    profileChatHistory: [],
    cogoChatHistory: [],
    rinexChatHistory: [],
    zoningChatHistory: [],
    fieldbookNotes: '',
    pointLists: project.pointLists,
    lines: project.lines,
    contourLabels: project.contourLabels,
    centerlines: project.centerlines,
    boundaryFiles: project.boundaryFiles,
    textAnnotations: project.textAnnotations,
    dimensions: project.dimensions,
    hatches: project.hatches,
    streetLabels: project.streetLabels,
    parcelLabels: project.parcelLabels,
    areaLabels: project.areaLabels,
    wmsServices: [],
    activeWmsLayers: [],
    offlineMapAreas: [],
    cutSheetData: [],
    cutSheetInfo: {},
    uiState: {
      activeAgent: ui.activeAgent ?? AgentType.LSVZ_AGENT,
      activeVisualPanel: 'canvas',
      isChatPanelVisible: ui.isChatPanelVisible ?? true,
      canvasTransform: null,
    },
    training: buildTrainingIndex(bundle),
  };
  // Fill every display/restore default so a training .lsvz opens cleanly in
  // the main app as well as in the replay shell.
  return normalizeLoadedSession(session as unknown as Partial<SessionState>);
};

export const exportTrainingLsvz = async (bundle: RecordingBundle): Promise<Blob> => {
  const session = buildSessionStateForBundle(bundle);
  return createSessionZip(session, [], bundleToTrainingAssets(bundle));
};

export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
};

export const safeTrainingFilename = (title: string): string => {
  const cleaned = title
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'training';
  return `${cleaned}.lsvz`;
};

/** Extract the training index from a loaded manifest without parsing bundles. */
export const readTrainingIndex = (sessionState: SessionState): EmbeddedTrainingIndex | null => {
  const index = sessionState.training;
  if (!index || index.schemaVersion !== 1 || !Array.isArray(index.recordings)) return null;
  return index as EmbeddedTrainingIndex;
};

/** A .lsvz opened with training but without the referenced asset is non-fatal. */
export const hasTrainingPayload = (
  training: Map<string, Blob | string> | undefined,
  recordingId: string,
): boolean => Boolean(training?.has(`training/${recordingId}/manifest.json`));

/** Import a raw .lsvz file's training tree into a standalone bundle. */
export const readBundleZip = async (arrayBuffer: ArrayBuffer, recordingId: string): Promise<RecordingBundle> => {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const training = new Map<string, Blob>();
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !path.startsWith('training/')) continue;
    training.set(path, await entry.async('blob'));
  }
  return bundleFromTrainingAssets(training, recordingId);
};

/** A display-safe label for a recording's project. */
export const projectLabelFor = (bundle: RecordingBundle): string =>
  [bundle.startState.project.jobInfo?.jobNo, bundle.startState.project.jobInfo?.jobName]
    .filter(Boolean)
    .join(' · ') || 'Untitled project';

