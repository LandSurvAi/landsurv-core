/**
 * Product analytics for the Gulf rollout.
 *
 * Mirrors the existing `utils/pwaTelemetry.ts` gtag wrapper so events stay in
 * the same GA4 property. Local development is deliberately silent.
 */
export type GrowthEventName =
  | 'region_preset_shown'
  | 'region_preset_applied'
  | 'region_preset_dismissed'
  | 'region_preset_crs_selected'
  | 'arabic_landing_view'
  | 'arabic_landing_cta_click'
  | 'region_preset_undone'
  | 'region_sample_opened'
  | 'gulf_crs_selected'
  | 'aed_checkout_started';

export type GrowthEventParams = Record<string, string | number | boolean | null | undefined>;

type GtagFunction = (command: 'event', eventName: string, params?: Record<string, unknown>) => void;

function isLocalHost(): boolean {
  if (typeof window === 'undefined') return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '';
}

function getGtag(): GtagFunction | null {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    return window.gtag as GtagFunction;
  }
  return null;
}

export function trackGrowthEvent(eventName: GrowthEventName, params: GrowthEventParams = {}): void {
  if (isLocalHost()) return;
  const gtag = getGtag();
  if (!gtag) return;

  gtag('event', eventName, {
    event_category: 'growth',
    ...params,
  });
}
