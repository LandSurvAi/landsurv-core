import { useEffect, useRef } from 'react';
import type { ReplayChannelDefinition } from '../utils/recording/v2';
import { useReplaySession } from '../contexts/ReplaySessionContext.tsx';

/**
 * Register one piece of live app state with the playback registry.
 *
 * The hook is inert in normal live mode. Playback and takeover both register
 * so the same bindings can drive a recording or apply a handoff.
 */
export const useReplayChannel = <T,>(
  definition: ReplayChannelDefinition<T>,
  value: T,
  apply: (next: T) => void,
): void => {
  const { mode, registry } = useReplaySession();
  const valueRef = useRef(value);
  const applyRef = useRef(apply);
  valueRef.current = value;
  applyRef.current = apply;

  useEffect(() => {
    if (mode === 'live' || !registry) return undefined;
    return registry.register(
      definition,
      () => valueRef.current,
      next => applyRef.current(next),
    );
  }, [mode, registry, definition.id]);
};
