export type MapImageryStatusKind =
  | 'disabled'
  | 'no-projection'
  | 'loading'
  | 'ready'
  | 'error'
  | 'idle';

/**
 * Lightweight status reported by DrawingCanvas to the header Map button.
 * It deliberately carries no image data, only enough to explain what the map
 * is doing and whether the project is missing a coordinate system.
 */
export interface MapImageryStatus {
  kind: MapImageryStatusKind;
  message: string;
  completed?: number;
  total?: number;
  source?: string;
  mapType?: string;
  tileCount?: number;
}
