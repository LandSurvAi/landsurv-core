/**
 * Bearing & distance annotation preference.
 *
 * The canvas B/D control is NOT a visibility filter. It tells the AI and the
 * CAD exporters which annotation text to emit for linework drawn from now on:
 * bearings only, distances only, or both. Labels already on the canvas keep
 * whatever they were created with.
 */

export type BearingDistanceMode = 'both' | 'bearing' | 'distance';

let currentMode: BearingDistanceMode = 'both';

export function setBearingDistanceMode(mode: BearingDistanceMode): void {
  currentMode = mode;
}

export function getBearingDistanceMode(): BearingDistanceMode {
  return currentMode;
}

/** Prompt addendum that explains the preference without dropping geometry. */
export function bearingDistancePreferenceInstruction(
  mode: BearingDistanceMode = currentMode,
): string {
  const label =
    mode === 'bearing' ? 'bearings only'
      : mode === 'distance' ? 'distances only'
        : 'bearings and distances';

  return `ANNOTATION OUTPUT PREFERENCE — ${label.toUpperCase()}:
The user's B/D control selects the annotation text for boundary linework drawn from now on. When you draw or describe new boundary calls, annotate them with ${label}.
Still emit the complete structured geometry (both bearing and distance values) so the linework remains mathematically valid and closable.
Never remove, hide, or re-annotate boundary labels that already exist.`;
}
