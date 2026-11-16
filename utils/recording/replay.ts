/**
 * Pure replay reducer.
 *
 * Playback applies recorded outcomes. It never calls a model, a tool, the
 * timeline engine, or the project store. Seeking is deterministic: the same
 * source time always produces the same state from the start snapshot.
 */

import { MessageRole, type ChatMessage } from '../../types';
import type {
  AiRecord,
  CameraTransform,
  CursorSample,
  GeometryDelta,
  RecordedChatThread,
  RecordingBundle,
  ReplayUiState,
} from './types';

export interface ReplayGeometry {
  pointLists: unknown[];
  lines: unknown[];
  centerlines: unknown[];
  contourLabels: unknown[];
  boundaryFiles: unknown[];
  textAnnotations: unknown[];
  dimensions: unknown[];
  hatches: unknown[];
  streetLabels: unknown[];
  parcelLabels: unknown[];
  areaLabels: unknown[];
}

export interface ReplayRuntime {
  geometry: ReplayGeometry;
  camera: CameraTransform | null;
  cursor: CursorSample | null;
  ui: ReplayUiState;
  chat: RecordedChatThread[];
  ai: AiRecord[];
}

const idFor = (value: unknown, index: number): string => {
  const record = value as Record<string, unknown> | null;
  return String(
    record?.id
    ?? record?.pointNumber
    ?? `${record?.from ?? record?.x ?? ''}|${record?.to ?? record?.y ?? ''}|${index}`,
  );
};

const arraysFromBundle = (bundle: RecordingBundle): ReplayGeometry => {
  const project = bundle.startState.project;
  return {
    pointLists: [...(project.pointLists ?? [])],
    lines: [...(project.lines ?? [])],
    centerlines: [...(project.centerlines ?? [])],
    contourLabels: [...(project.contourLabels ?? [])],
    boundaryFiles: [...(project.boundaryFiles ?? [])],
    textAnnotations: [...(project.textAnnotations ?? [])],
    dimensions: [...(project.dimensions ?? [])],
    hatches: [...(project.hatches ?? [])],
    streetLabels: [...(project.streetLabels ?? [])],
    parcelLabels: [...(project.parcelLabels ?? [])],
    areaLabels: [...(project.areaLabels ?? [])],
  };
};

const applyDeltas = (list: unknown[], deltas: GeometryDelta[]): unknown[] => {
  let next = list;
  for (const delta of deltas) {
    const index = next.findIndex((value, position) => idFor(value, position) === delta.id);
    if (delta.action === 'add') {
      if (index === -1) next = [...next, delta.value];
      else next = next.map((value, position) => (position === index ? delta.value : value));
    } else if (delta.action === 'update') {
      if (index !== -1) next = next.map((value, position) => (position === index ? delta.value : value));
    } else if (delta.action === 'remove' && index !== -1) {
      next = next.filter((_value, position) => position !== index);
    }
  }
  return next;
};

export const buildReplayRuntime = (
  bundle: RecordingBundle,
  sourceTimeMs: number,
): ReplayRuntime => {
  const geometry = arraysFromBundle(bundle);
  const start = bundle.startState.project;
  let camera = start.camera ?? null;
  let cursor: CursorSample | null = null;
  let ui: ReplayUiState = start.ui ?? {};
  let ai: AiRecord[] = [];
  const chat: RecordedChatThread[] = start.chat.map(thread => ({
    agent: thread.agent,
    messages: [...thread.messages],
  }));

  const findThread = (agent: RecordedChatThread['agent']): RecordedChatThread => {
    let thread = chat.find(row => row.agent === agent);
    if (!thread) {
      thread = { agent, messages: [] };
      chat.push(thread);
    }
    return thread;
  };

  const eventList = bundle.events;
  for (const event of eventList) {
    if (event.t > sourceTimeMs) break;
    switch (event.type) {
      case 'camera':
        if (event.camera) camera = event.camera;
        break;
      case 'cursor':
        if (event.cursor) cursor = event.cursor;
        break;
      case 'ui/state':
        if (event.ui) ui = { ...ui, ...event.ui };
        break;
      case 'geometry/deltas':
        if (event.entity && Array.isArray(event.deltas)) {
          const key = event.entity as keyof ReplayGeometry;
          if (key in geometry) {
            const current = geometry[key];
            geometry[key] = applyDeltas(current, event.deltas);
          }
        }
        break;
      case 'geometry/replace':
        if (event.entity) {
          const key = event.entity as keyof ReplayGeometry;
          if (key in geometry && Array.isArray(event.value)) {
            geometry[key] = [...event.value];
          }
        }
        break;
      case 'chat/message':
        if (event.message) {
          const thread = findThread(event.message.agent);
          if (event.message.index >= thread.messages.length) {
            const message: ChatMessage = {
              role: event.message.role === 'model' ? MessageRole.MODEL : MessageRole.USER,
              text: event.message.text,
              ...(event.message.model ? { model: event.message.model } : {}),
            };
            thread.messages = [...thread.messages, message];
          }
        }
        break;
      case 'ai/result':
        if (event.ai) ai = [...ai, event.ai];
        break;
      default:
        // Unknown event types are skipped by design.
        break;
    }
  }

  if (!camera) camera = null;
  return { geometry, camera, cursor, ui, chat, ai };
};

export const geometryBounds = (geometry: ReplayGeometry): {
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
} | null => {
  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  let count = 0;

  const include = (easting: number, northing: number) => {
    if (!Number.isFinite(easting) || !Number.isFinite(northing)) return;
    minE = Math.min(minE, easting);
    maxE = Math.max(maxE, easting);
    minN = Math.min(minN, northing);
    maxN = Math.max(maxN, northing);
    count += 1;
  };

  for (const list of geometry.pointLists as Array<{ points?: Array<{ easting: number; northing: number; hidden?: boolean }> }>) {
    for (const point of list.points ?? []) {
      if (!point.hidden) include(point.easting, point.northing);
    }
  }
  for (const line of geometry.lines as Array<{ fromPt?: { x: number; y: number }; toPt?: { x: number; y: number } }>) {
    if (line.fromPt) include(line.fromPt.x, line.fromPt.y);
    if (line.toPt) include(line.toPt.x, line.toPt.y);
  }
  for (const label of geometry.textAnnotations as Array<{ x: number; y: number }>) {
    include(label.x, label.y);
  }

  if (count === 0) return null;
  return { minE, maxE, minN, maxN };
};
