/**
 * Recorder state machine.
 *
 * The provider owns the live capture buffer, the monotonic clock, autosave,
 * and the finished bundle. It never imports the timeline engine and never
 * writes into project state; the bridge only hands it read-only snapshots.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { MessageRole, type AgentType, type ChatMessage } from '../types';
import { createBundleFromSeed, recountBundle } from '../services/recording/bundle';
import { saveRecordingBundle, saveRecordingBundleV2, scrubLegacyRecordingCredentials } from '../services/recording/recordingStore';
import { dedupeV2Assets } from '../services/recording/v2Assets';
import { createV2CaptureFromSeed, makeV2Keyframe, recountV2Bundle, toJsonValue } from '../services/recording/v2Capture';
import { diffKeyedArray, entityId as replayEntityId } from '../utils/recording/diff';
import { stableStringify } from '../utils/recording/stable';
import type { JsonValue, RecordingBundleV2 } from '../utils/recording/v2';
import {
  MAX_RECORDING_DURATION_MS,
  type AiRecord,
  type CameraTransform,
  type CursorSample,
  type GeometryDelta,
  type RecordingBundle,
  type RecordingEvent,
  type RecordingSeed,
  type ReplayUiState,
} from '../utils/recording/types';

export type RecordingPhase = 'idle' | 'recording' | 'paused' | 'stopped';

interface RecordingContextValue {
  phase: RecordingPhase;
  elapsedMs: number;
  seedReady: boolean;
  completed: RecordingBundle | null;
  storageError: string | null;
  setLatestSeed: (seed: RecordingSeed) => void;
  startRecording: (title?: string, aiReveal?: 'instant' | 'simulated') => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => Promise<void>;
  clearCompleted: () => void;
  updateBundle: (mutator: (bundle: RecordingBundle) => void) => Promise<void>;
  getBundle: () => RecordingBundle | null;
  recordCamera: (camera: CameraTransform | null) => void;
  recordUi: (ui: ReplayUiState) => void;
  recordGeometry: (entity: string, items: unknown) => void;
  recordChat: (agent: AgentType, messages: ChatMessage[]) => void;
  /** Record an arbitrary v2 channel from live provider state. */
  recordChannel: (channel: string, value: unknown) => void;
}

const RecordingContext = createContext<RecordingContextValue | null>(null);

const cloneSeed = (seed: RecordingSeed): RecordingSeed => {
  try {
    return typeof structuredClone === 'function'
      ? structuredClone(seed)
      : JSON.parse(JSON.stringify(seed)) as RecordingSeed;
  } catch {
    return seed;
  }
};

const entityId = (value: unknown, index: number): string => {
  const record = value as Record<string, unknown> | null;
  return String(
    record?.id
    ?? record?.pointNumber
    ?? `${record?.from ?? record?.x ?? ''}|${record?.to ?? record?.y ?? ''}|${index}`,
  );
};

const stringify = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? 'null';
  } catch {
    return String(value);
  }
};

const stableEntityArray = (entity: string): boolean =>
  entity !== 'contourLabels' && entity !== 'streetLabels';

const draftChapters = (events: RecordingEvent[]) => {
  const chapters: Array<{
    id: string;
    title: string;
    atMs: number;
    suggested: boolean;
  }> = [{ id: 'chapter-start', title: 'Session start', atMs: 0, suggested: true }];
  const seen = new Set<string>(['Session start']);
  let panel: string | undefined;

  for (const event of events) {
    if (event.type === 'ai/result' && event.ai) {
      const title = `AI: ${event.ai.promptText.replace(/\s+/g, ' ').trim().slice(0, 52)}`;
      if (title !== 'AI:' && !seen.has(title)) {
        seen.add(title);
        chapters.push({ id: `chapter-ai-${chapters.length}`, title, atMs: event.t, suggested: true });
      }
    }
    if (event.type === 'ui/state' && event.ui?.activeVisualPanel && event.ui.activeVisualPanel !== panel) {
      panel = event.ui.activeVisualPanel;
      if (panel !== 'canvas') {
        const title = `Open ${panel.replace(/[-_]/g, ' ')}`;
        if (!seen.has(title)) {
          seen.add(title);
          chapters.push({ id: `chapter-panel-${chapters.length}`, title, atMs: event.t, suggested: true });
        }
      }
    }
  }

  return chapters
    .sort((a, b) => a.atMs - b.atMs)
    .slice(0, 20)
    .map((chapter, index) => ({ ...chapter, id: `chapter-draft-${index}` }));
};

export const RecordingProvider: React.FC<{ appVersion: string; children: ReactNode }> = ({
  appVersion,
  children,
}) => {
  const [phase, setPhase] = useState<RecordingPhase>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [seedReady, setSeedReady] = useState(false);
  const [completed, setCompleted] = useState<RecordingBundle | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  const seedRef = useRef<RecordingSeed | null>(null);
  const bundleRef = useRef<RecordingBundle | null>(null);
  const phaseRef = useRef<RecordingPhase>('idle');
  const startedAtRef = useRef(0);
  const pausedAccumRef = useRef(0);
  const pauseStartedRef = useRef<number | null>(null);
  const stoppedElapsedRef = useRef(0);
  const eventSeqRef = useRef(0);
  const lastCameraRef = useRef<CameraTransform | null>(null);
  const lastUiRef = useRef<string>('');
  const lastGeometryRef = useRef<Map<string, unknown>>(new Map());
  const chatCountsRef = useRef<Map<AgentType, number>>(new Map());
  const cursorLastAtRef = useRef(0);
  const v2Ref = useRef<RecordingBundleV2 | null>(null);
  const v2ChannelsRef = useRef(new Map<string, JsonValue>());
  const v2SeqRef = useRef(0);
  const v2FrameSeqRef = useRef(0);
  const v2LastFullRef = useRef(0);

  useEffect(() => {
    void scrubLegacyRecordingCredentials().catch(error => {
      setStorageError(error instanceof Error ? error.message : 'Could not audit old recordings.');
    });
  }, []);

  const currentElapsed = useCallback((): number => {
    if (phaseRef.current === 'recording') {
      return Math.max(0, performance.now() - startedAtRef.current - pausedAccumRef.current);
    }
    if (phaseRef.current === 'paused') {
      return Math.max(
        0,
        (pauseStartedRef.current ?? performance.now()) - startedAtRef.current - pausedAccumRef.current,
      );
    }
    return stoppedElapsedRef.current;
  }, []);

  const setLatestSeed = useCallback((seed: RecordingSeed) => {
    seedRef.current = seed;
    setSeedReady(true);
  }, []);

  const pushEvent = useCallback((event: Omit<RecordingEvent, 't' | 'id'> & { t?: number }) => {
    if (!bundleRef.current || phaseRef.current !== 'recording') return;
    const t = Math.max(0, Math.round(event.t ?? currentElapsed()));
    eventSeqRef.current += 1;
    bundleRef.current.events.push({
      ...event,
      t,
      id: `evt-${eventSeqRef.current}`,
    });
  }, [currentElapsed]);

  const recordV2Replace = useCallback((ch: string, value: JsonValue) => {
    const bundle = v2Ref.current;
    if (!bundle || phaseRef.current !== 'recording') return;
    const prior = v2ChannelsRef.current.get(ch);
    if (prior !== undefined && stableStringify(prior) === stableStringify(value)) return;
    v2ChannelsRef.current.set(ch, value);
    v2SeqRef.current += 1;
    bundle.changes.push({
      t: Math.round(currentElapsed()),
      seq: v2SeqRef.current,
      ch,
      op: 'replace',
      v: value,
    });
  }, [currentElapsed]);

  const recordV2Geometry = useCallback((ch: string, entity: string, items: unknown) => {
    const bundle = v2Ref.current;
    if (!bundle || phaseRef.current !== 'recording') return;
    const next = toJsonValue(items);
    const prior = v2ChannelsRef.current.get(ch);
    if (prior === undefined) {
      v2ChannelsRef.current.set(ch, next);
      return;
    }
    if (Array.isArray(prior) && Array.isArray(next)) {
      try {
        const deltas = diffKeyedArray(prior, next, replayEntityId, value => value);
        if (deltas !== null && deltas.length === 0) return;
        if (deltas !== null) {
          v2ChannelsRef.current.set(ch, next);
          v2SeqRef.current += 1;
          bundle.changes.push({
            t: Math.round(currentElapsed()),
            seq: v2SeqRef.current,
            ch,
            op: 'keyed',
            entity,
            deltas,
          });
          return;
        }
      } catch {
        // Non-keyed geometry falls back to a whole-channel replace below.
      }
    }
    recordV2Replace(ch, next);
  }, [currentElapsed, recordV2Replace]);

  const pushV2Keyframe = useCallback((kind: 'full' | 'patch', reason: 'safety' | 'pause' | 'resume' | 'stop') => {
    const bundle = v2Ref.current;
    if (!bundle) return;
    const elapsed = Math.round(currentElapsed());
    v2FrameSeqRef.current += 1;
    bundle.keyframes.push(makeV2Keyframe(
      elapsed,
      `v2-kf-${v2FrameSeqRef.current}`,
      kind,
      reason,
      v2ChannelsRef.current,
    ));
    if (kind === 'full') v2LastFullRef.current = elapsed;
  }, [currentElapsed]);

  const recordChannel = useCallback((channel: string, value: unknown) => {
    recordV2Replace(channel, toJsonValue(value));
  }, [recordV2Replace]);

  const persistDraft = useCallback(async () => {
    const bundle = bundleRef.current;
    if (!bundle) return;
    bundle.manifest.durationMs = Math.round(currentElapsed());
    recountBundle(bundle);
    const v2 = v2Ref.current;
    if (v2) {
      v2.manifest.durationMs = bundle.manifest.durationMs;
      recountV2Bundle(v2);
    }
    try {
      await saveRecordingBundle(bundle);
      if (v2) await saveRecordingBundleV2(v2);
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Recording autosave failed.');
    }
  }, [currentElapsed]);

  const startRecording = useCallback((title?: string, aiReveal: 'instant' | 'simulated' = 'simulated') => {
    if (phaseRef.current === 'recording' || phaseRef.current === 'paused') return;
    const seed = seedRef.current;
    if (!seed) {
      setStorageError('The project is still loading; the recorder is not ready yet.');
      return;
    }

    const cloned = cloneSeed({ ...seed, title: title?.trim() || seed.title });
    const bundle = createBundleFromSeed(cloned, appVersion);
    bundle.manifest.aiReveal = aiReveal;
    bundleRef.current = bundle;
    const v2 = createV2CaptureFromSeed(
      cloned,
      appVersion,
      bundle.manifest.id,
      bundle.manifest.createdAt,
    );
    v2Ref.current = v2.bundle;
    v2ChannelsRef.current = new Map(Object.entries(v2.channels));
    v2SeqRef.current = 0;
    v2FrameSeqRef.current = v2.bundle.keyframes.length;
    v2LastFullRef.current = 0;
    void saveRecordingBundleV2(v2.bundle).catch(error => {
      setStorageError(error instanceof Error ? error.message : 'Could not save the app-playback recording.');
    });
    eventSeqRef.current = 0;
    pausedAccumRef.current = 0;
    pauseStartedRef.current = null;
    stoppedElapsedRef.current = 0;
    startedAtRef.current = performance.now();
    setCompleted(null);
    setStorageError(null);
    setElapsedMs(0);

    // Seed diff baselines so the first bridge pass does not duplicate the
    // whole project as a change.
    const project = cloned.project;
    const baselines: Array<[string, unknown]> = [
      ['pointLists', project.pointLists],
      ['lines', project.lines],
      ['centerlines', project.centerlines],
      ['contourLabels', project.contourLabels],
      ['boundaryFiles', project.boundaryFiles ?? []],
      ['textAnnotations', project.textAnnotations ?? []],
      ['dimensions', project.dimensions ?? []],
      ['hatches', project.hatches ?? []],
      ['streetLabels', project.streetLabels ?? []],
      ['parcelLabels', project.parcelLabels ?? []],
      ['areaLabels', project.areaLabels ?? []],
    ];
    lastGeometryRef.current = new Map(baselines);
    chatCountsRef.current = new Map(
      project.chat.map(thread => [thread.agent, thread.messages.length]),
    );

    phaseRef.current = 'recording';
    setPhase('recording');

    const startEvent: RecordingEvent = { t: 0, id: 'evt-0', type: 'session/start' };
    bundle.events.push(startEvent);
    if (cloned.camera) {
      lastCameraRef.current = cloned.camera;
      bundle.events.push({
        t: 0,
        id: 'evt-camera-0',
        type: 'camera',
        camera: cloned.camera,
      });
    }
    if (cloned.ui) {
      lastUiRef.current = stringify(cloned.ui);
      bundle.events.push({
        t: 0,
        id: 'evt-ui-0',
        type: 'ui/state',
        ui: cloned.ui,
      });
    }
    bundle.frames.push({
      t: 0,
      id: 'frame-0',
      kind: 'keyframe',
      camera: cloned.camera ?? undefined,
      ui: cloned.ui,
    });
    recountBundle(bundle);
    setSeedReady(true);
  }, [appVersion]);

  const pauseRecording = useCallback(() => {
    if (phaseRef.current !== 'recording') return;
    const t = currentElapsed();
    pauseStartedRef.current = performance.now();
    phaseRef.current = 'paused';
    setPhase('paused');
    setElapsedMs(t);
    if (bundleRef.current) {
      eventSeqRef.current += 1;
      bundleRef.current.events.push({ t: Math.round(t), id: `evt-${eventSeqRef.current}`, type: 'session/pause' });
    }
  }, [currentElapsed]);

  const resumeRecording = useCallback(() => {
    if (phaseRef.current !== 'paused') return;
    const now = performance.now();
    pausedAccumRef.current += now - (pauseStartedRef.current ?? now);
    pauseStartedRef.current = null;
    phaseRef.current = 'recording';
    setPhase('recording');
    if (bundleRef.current) {
      const t = Math.round(currentElapsed());
      eventSeqRef.current += 1;
      bundleRef.current.events.push({ t, id: `evt-${eventSeqRef.current}`, type: 'session/resume' });
      bundleRef.current.frames.push({
        t,
        id: `frame-${bundleRef.current.frames.length}`,
        kind: 'keyframe',
        camera: lastCameraRef.current ?? undefined,
      });
    }
  }, [currentElapsed]);

  const stopRecording = useCallback(async () => {
    if (phaseRef.current !== 'recording' && phaseRef.current !== 'paused') return;
    const bundle = bundleRef.current;
    if (!bundle) return;
    const t = Math.round(currentElapsed());
    eventSeqRef.current += 1;
    bundle.events.push({ t, id: `evt-${eventSeqRef.current}`, type: 'session/stop' });
    bundle.manifest.durationMs = t;
    bundle.manifest.status = 'draft';
    bundle.annotations.chapters = draftChapters(bundle.events);
    const v2 = v2Ref.current;
    if (v2) {
      v2.manifest.durationMs = t;
      v2.manifest.status = 'draft';
      v2.annotations = bundle.annotations;
      v2.edits = bundle.edits;
      v2.ai = [...bundle.ai];
      pushV2Keyframe('full', 'stop');
      try {
        await dedupeV2Assets(v2);
      } catch (error) {
        setStorageError(error instanceof Error ? error.message : 'Could not store recording assets.');
      }
      recountV2Bundle(v2);
    }
    stoppedElapsedRef.current = t;
    phaseRef.current = 'stopped';
    setPhase('stopped');
    setElapsedMs(t);
    recountBundle(bundle);
    setCompleted(bundle);
    try {
      await saveRecordingBundle(bundle);
      if (v2) await saveRecordingBundleV2(v2);
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Could not save the finished recording.');
    }
  }, [currentElapsed, pushV2Keyframe]);

  const clearCompleted = useCallback(() => {
    bundleRef.current = null;
    v2Ref.current = null;
    v2ChannelsRef.current = new Map();
    setCompleted(null);
    setPhase('idle');
    phaseRef.current = 'idle';
    setElapsedMs(0);
  }, []);

  const updateBundle = useCallback(async (mutator: (bundle: RecordingBundle) => void) => {
    const bundle = bundleRef.current ?? completed;
    if (!bundle) return;
    mutator(bundle);
    recountBundle(bundle);
    setCompleted({ ...bundle });
    try {
      await saveRecordingBundle(bundle);
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Could not save recording changes.');
    }
  }, [completed]);

  const recordCamera = useCallback((camera: CameraTransform | null) => {
    if (!camera || phaseRef.current !== 'recording') return;
    const previous = lastCameraRef.current;
    if (previous
      && Math.abs(previous.scale - camera.scale) < 0.0001
      && Math.abs(previous.offsetX - camera.offsetX) < 0.05
      && Math.abs(previous.offsetY - camera.offsetY) < 0.05) {
      return;
    }
    lastCameraRef.current = camera;
    pushEvent({ type: 'camera', camera });
    recordV2Replace('canvas.camera', toJsonValue(camera));
  }, [pushEvent, recordV2Replace]);

  const recordUi = useCallback((ui: ReplayUiState) => {
    if (phaseRef.current !== 'recording') return;
    const serialized = stringify(ui);
    if (serialized === lastUiRef.current) return;
    lastUiRef.current = serialized;
    pushEvent({ type: 'ui/state', ui });
    if (ui.activeVisualPanel !== undefined) {
      recordV2Replace('viewport.activeVisualPanel', toJsonValue(ui.activeVisualPanel));
    }
    if (ui.isChatPanelVisible !== undefined) {
      recordV2Replace('viewport.isChatPanelVisible', toJsonValue(ui.isChatPanelVisible));
    }
    if (ui.isToolShelfVisible !== undefined) {
      recordV2Replace('viewport.isToolShelfVisible', toJsonValue(ui.isToolShelfVisible));
    }
    if (ui.activeAgent !== undefined) {
      recordV2Replace('app.activeAgent', toJsonValue(ui.activeAgent));
    }
  }, [pushEvent, recordV2Replace]);

  const recordGeometry = useCallback((entity: string, items: unknown) => {
    if (phaseRef.current !== 'recording') return;
    const next = Array.isArray(items) ? items : [];
    recordV2Geometry(`canvas.${entity}`, entity, next);
    const previous = lastGeometryRef.current.get(entity);
    if (previous === undefined) {
      lastGeometryRef.current.set(entity, next);
      return;
    }

    if (!stableEntityArray(entity)) {
      if (stringify(previous) !== stringify(next)) {
        lastGeometryRef.current.set(entity, next);
        pushEvent({ type: 'geometry/replace', entity, value: next });
      }
      return;
    }

    const before = Array.isArray(previous) ? previous : [];
    const beforeMap = new Map<string, unknown>();
    before.forEach((value, index) => beforeMap.set(entityId(value, index), value));
    const afterMap = new Map<string, unknown>();
    next.forEach((value, index) => afterMap.set(entityId(value, index), value));

    const deltas: GeometryDelta[] = [];
    afterMap.forEach((value, id) => {
      const old = beforeMap.get(id);
      if (old === undefined) {
        deltas.push({ entity, action: 'add', id, value });
      } else if (stringify(old) !== stringify(value)) {
        deltas.push({ entity, action: 'update', id, value });
      }
    });
    beforeMap.forEach((_value, id) => {
      if (!afterMap.has(id)) deltas.push({ entity, action: 'remove', id });
    });

    if (deltas.length === 0) return;
    lastGeometryRef.current.set(entity, next);
    pushEvent({ type: 'geometry/deltas', entity, deltas });
  }, [pushEvent, recordV2Geometry]);

  const recordChat = useCallback((agent: AgentType, messages: ChatMessage[]) => {
    if (phaseRef.current !== 'recording') return;
    const list = Array.isArray(messages) ? messages : [];
    const previousCount = chatCountsRef.current.get(agent);
    if (previousCount === undefined) {
      chatCountsRef.current.set(agent, list.length);
      return;
    }
    if (list.length < previousCount) {
      chatCountsRef.current.set(agent, list.length);
      return;
    }
    if (list.length === previousCount) return;

    const bundle = bundleRef.current;
    const newMessages = list.slice(previousCount);
    chatCountsRef.current.set(agent, list.length);

    const priorThreads = v2ChannelsRef.current.get('chat.histories');
    const threads = Array.isArray(priorThreads) ? priorThreads as JsonValue[] : [];
    const nextThreads = [
      ...threads.filter(thread => {
        if (!thread || typeof thread !== 'object' || Array.isArray(thread)) return true;
        return thread.agent !== agent;
      }),
      toJsonValue({ agent, messages: list }),
    ];
    recordV2Replace('chat.histories', nextThreads);

    newMessages.forEach((message, offset) => {
      const index = previousCount + offset;
      if (!message?.text?.trim()) return;
      pushEvent({
        type: 'chat/message',
        message: {
          agent,
          role: message.role === MessageRole.MODEL ? 'model' : 'user',
          text: message.text,
          model: message.model,
          index,
        },
      });

      if (message.role === MessageRole.MODEL && bundle) {
        const prompt = [...list.slice(0, index)].reverse().find(item => item.role === MessageRole.USER)?.text ?? '';
        const record: AiRecord = {
          id: `ai-${bundle.ai.length + 1}`,
          t: Math.round(currentElapsed()),
          turnId: `turn-${index}`,
          agent,
          model: message.model,
          promptText: prompt,
          responseText: message.text,
          toolCalls: [],
          durationMs: 0,
          status: 'ok',
        };
        bundle.ai.push(record);
        pushEvent({ type: 'ai/result', ai: record });
      }
    });
  }, [currentElapsed, pushEvent, recordV2Replace]);

  // Live timer for the HUD.
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'paused') return;
    const timer = window.setInterval(() => setElapsedMs(Math.round(currentElapsed())), 250);
    return () => window.clearInterval(timer);
  }, [phase, currentElapsed]);

  // Cursor + click sampling across the app viewport.
  useEffect(() => {
    if (phase !== 'recording') return;
    const sample = (event: PointerEvent, kind: CursorSample['kind']) => {
      if (phaseRef.current !== 'recording') return;
      const now = performance.now();
      if (kind === 'move' && now - cursorLastAtRef.current < 50) return;
      cursorLastAtRef.current = now;
      const cursor = {
        x: Math.min(1, Math.max(0, event.clientX / Math.max(1, window.innerWidth))),
        y: Math.min(1, Math.max(0, event.clientY / Math.max(1, window.innerHeight))),
        visible: true,
        kind,
      } satisfies CursorSample;
      pushEvent({ type: 'cursor', cursor });
      if (v2Ref.current && phaseRef.current === 'recording') {
        v2Ref.current.cursor.push({ t: Math.round(currentElapsed()), ...cursor });
      }
    };
    const onMove = (event: PointerEvent) => sample(event, 'move');
    const onDown = (event: PointerEvent) => sample(event, 'down');
    const onUp = (event: PointerEvent) => sample(event, 'up');
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [phase, pushEvent, currentElapsed]);

  // Autosave draft, keyframes, and the duration cap.
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'paused') return;
    const autosave = window.setInterval(() => { void persistDraft(); }, 3000);
    const keyframe = window.setInterval(() => {
      if (phaseRef.current !== 'recording') return;
      const bundle = bundleRef.current;
      if (!bundle) return;
      bundle.frames.push({
        t: Math.round(currentElapsed()),
        id: `frame-${bundle.frames.length}`,
        kind: 'keyframe',
        camera: lastCameraRef.current ?? undefined,
      });
      if (currentElapsed() >= MAX_RECORDING_DURATION_MS) void stopRecording();
    }, 5000);
    const v2Keyframe = window.setInterval(() => {
      if (phaseRef.current !== 'recording') return;
      const elapsed = Math.round(currentElapsed());
      if (elapsed - v2LastFullRef.current >= 5 * 60 * 1000) {
        pushV2Keyframe('full', 'safety');
      } else {
        pushV2Keyframe('patch', 'safety');
      }
    }, 30_000);
    return () => {
      window.clearInterval(autosave);
      window.clearInterval(keyframe);
      window.clearInterval(v2Keyframe);
    };
  }, [phase, persistDraft, currentElapsed, stopRecording, pushV2Keyframe]);

  const value: RecordingContextValue = {
    phase,
    elapsedMs,
    seedReady,
    completed,
    storageError,
    setLatestSeed,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    clearCompleted,
    updateBundle,
    getBundle: () => bundleRef.current ?? completed,
    recordCamera,
    recordUi,
    recordGeometry,
    recordChat,
    recordChannel,
  };

  return <RecordingContext.Provider value={value}>{children}</RecordingContext.Provider>;
};

export const useRecording = (): RecordingContextValue => {
  const context = useContext(RecordingContext);
  if (!context) throw new Error('useRecording must be used within a RecordingProvider');
  return context;
};

