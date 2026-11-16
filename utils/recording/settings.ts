/**
 * Recording-safe display settings.
 *
 * Recordings and takeover handoffs must never contain credentials or
 * viewer-owned integration secrets. Keep this list display-only and extend it
 * deliberately when a new visual setting needs replaying.
 */

const DISPLAY_SETTING_KEYS = [
  'theme',
  'coordinatePrecision',
  'linearUnits',
  'zoomToPointLevel',
  'projection',
  'defaultCutSheetInfo',
  'northArrowStyle',
  'northArrowPosition',
  'pointLabelingSettings',
  'uncertaintySensitivity',
  'pointAttributeScaling',
  'showPointSymbols',
  'pointEfficiencyMode',
  'showCacpNotifications',
  'showCacpHandlerNotifications',
  'floodHatch',
  'soilHatch',
  'argonReasoning',
  'stationing',
] as const;

export const toDisplaySettings = (
  settings: Record<string, unknown> | null | undefined,
): Record<string, unknown> => {
  const source = settings ?? {};
  const result: Record<string, unknown> = {};
  for (const key of DISPLAY_SETTING_KEYS) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
};
