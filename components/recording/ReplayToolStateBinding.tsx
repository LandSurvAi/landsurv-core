import { useEffect } from 'react';
import { useRecording } from '../../contexts/RecordingContext.tsx';
import { useReplayChannel } from '../../hooks/useReplayChannel';
import type { JsonValue, ReplayChannelDefinition } from '../../utils/recording/v2';

const canvasToolState = {
  id: 'canvas.toolState',
  surface: 'canvas',
  version: 1,
  keyframe: true,
  diff: 'replace',
  serialize: (value: unknown) => value as JsonValue,
  deserialize: (value: JsonValue) => value,
} satisfies ReplayChannelDefinition<unknown>;

interface ReplayToolStateBindingProps {
  state: unknown;
  setState: (next: any) => void;
}

/** Local to AppContent, so it lives beside the camera binding. */
export const ReplayToolStateBinding: React.FC<ReplayToolStateBindingProps> = ({ state, setState }) => {
  const recording = useRecording();
  useReplayChannel(canvasToolState, state, setState);

  useEffect(() => {
    if (recording.phase !== 'recording') return;
    recording.recordChannel('canvas.toolState', state);
  }, [recording.phase, recording.recordChannel, state]);

  return null;
};
