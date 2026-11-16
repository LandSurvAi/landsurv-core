import { useReplayChannel } from '../../hooks/useReplayChannel';
import type { CameraTransform } from '../../utils/recording/types';
import type { JsonValue, ReplayChannelDefinition } from '../../utils/recording/v2';

const cameraChannel: ReplayChannelDefinition<CameraTransform | null> = {
  id: 'canvas.camera',
  surface: 'canvas',
  version: 1,
  keyframe: true,
  diff: 'replace',
  serialize: value => value as unknown as JsonValue,
  deserialize: value => value as unknown as CameraTransform | null,
};

export const ReplayCameraBinding: React.FC<{
  camera: CameraTransform | null;
  setCamera: (next: CameraTransform | null) => void;
}> = ({ camera, setCamera }) => {
  useReplayChannel(cameraChannel, camera, setCamera);
  return null;
};
