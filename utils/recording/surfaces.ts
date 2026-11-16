/**
 * Stable replay surfaces.
 *
 * A surface groups channels that belong to one user-visible area. Bumping a
 * surface version tells playback that at least one channel in the group
 * changed shape; channel versions carry the migration detail.
 */

import type { ReplaySurfaceId } from './v2';

export interface ReplaySurface {
  id: ReplaySurfaceId;
  version: number;
}

export const REPLAY_SURFACES: readonly ReplaySurface[] = [
  { id: 'canvas', version: 1 },
  { id: 'tool-shelf', version: 1 },
  { id: 'point-editor', version: 1 },
  { id: 'chat', version: 1 },
  { id: 'timeline', version: 1 },
  { id: 'modals', version: 1 },
  { id: 'files', version: 1 },
  { id: 'notifications', version: 1 },
  { id: 'app', version: 1 },
  { id: 'pdf-viewer', version: 1 },
  { id: 'cad', version: 1 },
  { id: 'settings', version: 1 },
  { id: 'text-editor', version: 1 },
  { id: 'raw-replay', version: 1 },
];

export const replaySurface = (id: string): ReplaySurface | null =>
  REPLAY_SURFACES.find(surface => surface.id === id) ?? null;
