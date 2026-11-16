import { useMemo } from 'react';
import { useReplaySession } from '../../contexts/ReplaySessionContext.tsx';
import type { CursorFrame } from '../../utils/recording/v2';

const frameAt = (frames: CursorFrame[], sourceTimeMs: number): CursorFrame | null => {
  let low = 0;
  let high = frames.length - 1;
  let result = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (frames[middle].t <= sourceTimeMs) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return result === -1 ? null : frames[result];
};

/** Fixed overlay so the recorded pointer survives app reflows. */
export const ReplayCursorOverlay: React.FC = () => {
  const { mode, bundle, timeMs, timeMap } = useReplaySession();
  const frame = useMemo(() => {
    if (!bundle || bundle.cursor.length === 0) return null;
    return frameAt(bundle.cursor, timeMap.effectiveToSource(timeMs));
  }, [bundle, timeMs, timeMap]);

  if (mode !== 'playback' || !frame?.visible) return null;

  return (
    <div
      className="pointer-events-none fixed z-[76]"
      style={{
        left: `${Math.min(1, Math.max(0, frame.x)) * 100}%`,
        top: `${Math.min(1, Math.max(0, frame.y)) * 100}%`,
        transform: 'translate(-7px, -7px)',
      }}
      aria-hidden
    >
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path
          d="M3 2.5 18 12l-7 1.2-3.6 6.3L3 2.5Z"
          fill="#f8fafc"
          stroke="#06b6d4"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
