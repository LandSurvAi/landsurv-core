/**
 * Playback and takeover session for the real app.
 *
 * Playback mounts the normal provider graph, loads a v2 bundle, resolves state
 * through the deterministic seek index, and applies it to registered channels.
 * Takeover boots the same graph in live mode, applies a local handoff once, and
 * leaves the viewer with a normal editable, unsaved project.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AppBoot } from '../utils/recording/boot';
import type {
  JsonValue,
  RecordingBundleV2,
  TakeoverDocument,
} from '../utils/recording/v2';
import {
  deleteTakeoverHandoff,
  getRecordingBundleV2,
  getTakeoverHandoff,
  saveTakeoverHandoff,
} from '../services/recording/recordingStore';
import {
  createReplaySeekIndex,
  type ReplaySeekIndex,
} from '../utils/recording/seek';
import {
  buildTimeMap,
  type TimeMap,
} from '../utils/recording/time';
import { setReplayNetworkGuardPhase } from '../services/recording/networkGuard';
import { hydrateReplayChannels, loadReplayAssets } from '../services/recording/v2Assets';
import { ReplayChannelRegistry } from '../services/replay/channelRegistry';

export type ReplaySessionMode = 'live' | 'playback' | 'takeover';
export type ReplayPhase = 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';

export interface ReplayDrift {
  missingChannels: string[];
  recordedAppVersion?: string;
  currentAppVersion?: string;
}

export interface ReplaySessionValue {
  mode: ReplaySessionMode;
  recordingId: string | null;
  handoffId: string | null;
  bundle: RecordingBundleV2 | null;
  timeMap: TimeMap;
  seekIndex: ReplaySeekIndex | null;
  registry: ReplayChannelRegistry;
  ready: boolean;
  phase: ReplayPhase;
  timeMs: number;
  durationMs: number;
  speed: number;
  error: string | null;
  drift: ReplayDrift | null;
  takeoverTitle: string | null;
  play: () => void;
  pause: () => void;
  seek: (timeMs: number) => void;
  setSpeed: (speed: number) => void;
  exit: () => void;
  takeover: () => void;
  takeoverAvailable: boolean;
  exploring: boolean;
  setExploring: (next: boolean) => void;
}

const ReplaySessionContext = createContext<ReplaySessionValue | null>(null);

const EMPTY_TIME_MAP = buildTimeMap(undefined, 0);
const CURRENT_APP_VERSION = (import.meta as any).env?.VITE_APP_VERSION || 'dev';

const takeoverId = (): string => {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `handoff-${Date.now().toString(36)}-${random}`;
};

export const ReplaySessionProvider: React.FC<{
  boot: AppBoot;
  children: ReactNode;
}> = ({ boot, children }) => {
  const mode: ReplaySessionMode = boot.kind === 'playback'
    ? 'playback'
    : boot.kind === 'live-takeover'
      ? 'takeover'
      : 'live';
  const recordingId = boot.kind === 'playback' ? boot.recordingId : null;
  const handoffId = boot.kind === 'live-takeover' ? boot.handoffId : null;
  const registry = useMemo(() => new ReplayChannelRegistry(), []);

  const [bundle, setBundle] = useState<RecordingBundleV2 | null>(null);
  const [seekIndex, setSeekIndex] = useState<ReplaySeekIndex | null>(null);
  const [takeoverChannels, setTakeoverChannels] = useState<Record<string, JsonValue> | null>(null);
  const [takeoverTitle, setTakeoverTitle] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<ReplayPhase>(mode === 'live' ? 'ready' : 'loading');
  const [timeMs, setTimeMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [drift, setDrift] = useState<ReplayDrift | null>(null);
  const [versionDrift, setVersionDrift] = useState<Pick<ReplayDrift, 'recordedAppVersion' | 'currentAppVersion'> | null>(null);
  const [registryRevision, setRegistryRevision] = useState(0);
  const [exploring, setExploring] = useState(false);
  const replayAssetsRef = useRef<Record<string, string>>({});
  const timeRef = useRef(0);

  const timeMap = useMemo(
    () => (bundle ? buildTimeMap(bundle.edits, bundle.manifest.durationMs) : EMPTY_TIME_MAP),
    [bundle],
  );
  const durationMs = timeMap.editedDurationMs;

  useEffect(() => {
    if (mode !== 'playback' || !recordingId) return undefined;
    let cancelled = false;
    setPhase('loading');
    setError(null);

    getRecordingBundleV2(recordingId)
      .then(async loaded => {
        if (cancelled) return;
        if (!loaded) {
          setError('This recording uses the retired player format. Record a new session to play it in the app.');
          setPhase('error');
          return;
        }
        const assets = await loadReplayAssets(loaded.manifest.assets);
        if (cancelled) return;
        replayAssetsRef.current = assets;
        const index = createReplaySeekIndex(loaded.keyframes, loaded.changes);
        setBundle(loaded);
        setSeekIndex(index);
        setVersionDrift(
          loaded.manifest.appVersion !== CURRENT_APP_VERSION
            ? { recordedAppVersion: loaded.manifest.appVersion, currentAppVersion: CURRENT_APP_VERSION }
            : null,
        );
        document.title = `${loaded.manifest.title} · App playback`;
      })
      .catch(loadError => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'This recording could not be loaded.');
        setPhase('error');
      });

    return () => {
      cancelled = true;
    };
  }, [mode, recordingId]);

  useEffect(() => registry.subscribe(() => setRegistryRevision(version => version + 1)), [registry]);

  useEffect(() => {
    if (mode !== 'takeover' || !handoffId) return undefined;
    let cancelled = false;
    setPhase('loading');
    setError(null);

    getTakeoverHandoff(handoffId)
      .then(loaded => {
        if (cancelled) return;
        if (!loaded) {
          setError('This takeover copy is no longer available. Open the recording and try again.');
          setPhase('error');
          return;
        }
        setTakeoverChannels(loaded.channels);
        setTakeoverTitle(loaded.recordingTitle);
        document.title = `${loaded.recordingTitle} · Editable copy`;
      })
      .catch(loadError => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'This takeover copy could not be loaded.');
        setPhase('error');
      });

    return () => {
      cancelled = true;
    };
  }, [handoffId, mode]);

  const applyAt = useCallback((nextMs: number, force: boolean): void => {
    if (!seekIndex) return;
    const clamped = Math.max(0, Math.min(durationMs, nextMs));
    const sourceTimeMs = timeMap.effectiveToSource(clamped);
    const resolved = seekIndex.resolve(sourceTimeMs);
    registry.applyAll(hydrateReplayChannels(resolved.channels, replayAssetsRef.current), { force });
  }, [durationMs, registry, seekIndex, timeMap]);

  // Panels such as PDF and the point editor mount after frame 0. When their
  // channels register, replay the current instant into them once.
  useEffect(() => {
    if (mode !== 'playback' || !ready || exploring) return undefined;
    const timer = window.setTimeout(() => {
      try {
        applyAt(timeRef.current, true);
      } catch {
        // The normal transport path surfaces apply failures.
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [applyAt, exploring, mode, ready, registryRevision]);

  useEffect(() => {
    if (mode !== 'takeover' || !ready || !takeoverChannels) return undefined;
    const timer = window.setTimeout(() => {
      try {
        registry.applyAll(takeoverChannels, { force: true });
      } catch {
        // The normal takeover path surfaces apply failures.
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [mode, ready, registry, registryRevision, takeoverChannels]);

  // Playback: wait for the real app's channels, then apply the first frame.
  useEffect(() => {
    if (mode !== 'playback' || !bundle || !seekIndex || ready) return undefined;
    let cancelled = false;
    let timer = 0;
    const startedAt = performance.now();

    const check = () => {
      if (cancelled) return;
      const missing = registry.missingCritical();
      const elapsed = performance.now() - startedAt;
      if (missing.length > 0 && elapsed < 2_000) {
        timer = window.setTimeout(check, 50);
        return;
      }

      try {
        applyAt(0, true);
        setTimeMs(0);
        timeRef.current = 0;
        registry.resetAppliedState();
        setReady(true);
        setPhase('paused');
        if (missing.length > 0 || versionDrift) {
          setDrift({ missingChannels: missing, ...(versionDrift ?? {}) });
        }
        setReplayNetworkGuardPhase('strict');
      } catch (applyError) {
        setError(applyError instanceof Error ? applyError.message : 'Playback state could not be applied.');
        setPhase('error');
      }
    };

    timer = window.setTimeout(check, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [applyAt, bundle, mode, ready, registry, seekIndex, versionDrift]);

  // Takeover: apply the handoff once the live channels are ready.
  useEffect(() => {
    if (mode !== 'takeover' || !takeoverChannels || ready) return undefined;
    let cancelled = false;
    let timer = 0;
    const startedAt = performance.now();

    const check = () => {
      if (cancelled) return;
      const missing = registry.missingCritical();
      if (missing.length > 0 && performance.now() - startedAt < 2_000) {
        timer = window.setTimeout(check, 50);
        return;
      }

      try {
        registry.applyAll(takeoverChannels, { force: true });
        registry.resetAppliedState();
        setReady(true);
        setPhase('ready');
        if (missing.length > 0) setDrift({ missingChannels: missing });
        if (handoffId) void deleteTakeoverHandoff(handoffId);
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (applyError) {
        setError(applyError instanceof Error ? applyError.message : 'The editable copy could not be applied.');
        setPhase('error');
      }
    };

    timer = window.setTimeout(check, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [handoffId, mode, ready, registry, takeoverChannels]);

  // 10 Hz playback clock. The real app receives one batched apply per tick.
  useEffect(() => {
    if (phase !== 'playing' || !ready || mode !== 'playback') return undefined;
    let raf = 0;
    let last = performance.now();
    let lastPaint = 0;

    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      const next = Math.min(durationMs, timeRef.current + delta * speed);
      timeRef.current = next;

      if (now - lastPaint > 100 || next >= durationMs) {
        lastPaint = now;
        setTimeMs(next);
        applyAt(next, false);
      }

      if (next >= durationMs) {
        setPhase('ended');
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [applyAt, durationMs, mode, phase, ready, speed]);

  const play = useCallback(() => {
    if (mode !== 'playback' || !ready) return;
    if (exploring) {
      setExploring(false);
      applyAt(timeRef.current, true);
    }
    if (timeRef.current >= durationMs) {
      timeRef.current = 0;
      setTimeMs(0);
      applyAt(0, true);
    }
    setPhase('playing');
  }, [applyAt, durationMs, exploring, mode, ready]);

  const pause = useCallback(() => {
    if (phase === 'playing') setPhase('paused');
  }, [phase]);

  const setExploringMode = useCallback((next: boolean) => {
    if (mode !== 'playback' || !ready) return;
    if (next) {
      setPhase(previous => (previous === 'playing' ? 'paused' : previous));
      setExploring(true);
      return;
    }
    setExploring(false);
    try {
      applyAt(timeRef.current, true);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Could not restore the recording.');
      setPhase('error');
    }
  }, [applyAt, mode, ready]);

  const seek = useCallback((nextMs: number) => {
    if (mode !== 'playback' || !ready) return;
    setExploring(false);
    const clamped = Math.max(0, Math.min(durationMs, nextMs));
    timeRef.current = clamped;
    setTimeMs(clamped);
    setPhase(prev => (prev === 'playing' ? 'paused' : prev));
    try {
      applyAt(clamped, true);
    } catch (seekError) {
      setError(seekError instanceof Error ? seekError.message : 'Could not seek playback.');
      setPhase('error');
    }
  }, [applyAt, durationMs, mode, ready]);

  const setPlaybackSpeed = useCallback((next: number) => {
    setSpeed(Math.max(0.25, Math.min(4, next)));
  }, []);

  const exit = useCallback(() => {
    window.close();
    window.setTimeout(() => { window.location.href = '/'; }, 200);
  }, []);

  const takeover = useCallback(() => {
    if (!bundle || !seekIndex || !ready || mode !== 'playback') return;
    const atMs = timeRef.current;
    const sourceTimeMs = timeMap.effectiveToSource(atMs);
    const resolved = seekIndex.resolve(sourceTimeMs);
    // Prefer the current live values so an explored/edited view is what the
    // new tab receives; fall back to the recorded frame for unbound channels.
    const channels = { ...resolved.channels, ...registry.snapshot() };
    const document: TakeoverDocument = {
      schemaVersion: 1,
      id: takeoverId(),
      recordingId: bundle.manifest.id,
      createdAt: new Date().toISOString(),
      atMs,
      sourceTimeMs,
      appVersion: bundle.manifest.appVersion,
      recordingTitle: bundle.manifest.title,
      channels,
      assetIds: bundle.manifest.assets.map(asset => asset.id),
      projectName: bundle.startState.jobInfo?.jobName || bundle.manifest.title,
    };

    // Open the tab synchronously on the click so popup blockers do not turn
    // takeover into same-tab navigation. It is pointed at the handoff after
    // the write completes.
    const takeoverWindow = window.open('about:blank', '_blank');
    void saveTakeoverHandoff(document)
      .then(() => {
        const url = `/?takeover=${encodeURIComponent(document.id)}`;
        if (takeoverWindow && !takeoverWindow.closed) {
          takeoverWindow.opener = null;
          takeoverWindow.location.href = url;
        } else {
          window.location.assign(url);
        }
      })
      .catch(saveError => {
        takeoverWindow?.close();
        setError(saveError instanceof Error ? saveError.message : 'Could not prepare the editable copy.');
        setPhase('error');
      });
  }, [bundle, mode, ready, registry, seekIndex, timeMap]);

  const value: ReplaySessionValue = {
    mode,
    recordingId,
    handoffId,
    bundle,
    timeMap,
    seekIndex,
    registry,
    ready,
    phase,
    timeMs,
    durationMs,
    speed,
    error,
    drift,
    takeoverTitle,
    play,
    pause,
    seek,
    setSpeed: setPlaybackSpeed,
    exit,
    takeover,
    takeoverAvailable: mode === 'playback' && Boolean(bundle && seekIndex && ready),
    exploring,
    setExploring: setExploringMode,
  };

  return (
    <ReplaySessionContext.Provider value={value}>
      {children}
    </ReplaySessionContext.Provider>
  );
};

export const useReplaySession = (): ReplaySessionValue => {
  const context = useContext(ReplaySessionContext);
  if (!context) {
    throw new Error('useReplaySession must be used within a ReplaySessionProvider');
  }
  return context;
};
