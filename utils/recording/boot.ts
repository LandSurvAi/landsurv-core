/** Boot modes for the real app. Live is the default. */
export type AppBoot =
  | { kind: 'live' }
  | { kind: 'live-takeover'; handoffId: string }
  | { kind: 'playback'; recordingId: string };

export const defaultAppBoot: AppBoot = { kind: 'live' };
