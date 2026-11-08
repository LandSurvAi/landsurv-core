import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { AgentType, type Settings } from '../types';

type GoogleMapsSettings = NonNullable<Settings['googleMaps']>;

interface UseGpsRoverMapScopeOptions {
  activeAgent: AgentType;
  googleMaps: Settings['googleMaps'];
  setSettings: Dispatch<SetStateAction<Settings>>;
}

function sameGoogleMaps(
  left: GoogleMapsSettings | null | undefined,
  right: GoogleMapsSettings | null | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.enabled === right.enabled &&
    left.apiKey === right.apiKey &&
    left.mapType === right.mapType &&
    left.opacity === right.opacity &&
    left.scale === right.scale &&
    left.showLabels === right.showLabels
  );
}

/**
 * Map imagery is on by default for GPS Rover, but that convenience must not
 * leak into the rest of the workspace. Entering the rover auto-enables the map
 * when it is off; leaving restores exactly what was there before. Any map
 * change made while the rover is active is treated as an explicit user choice,
 * so it survives the switch away.
 */
export function useGpsRoverMapScope({
  activeAgent,
  googleMaps,
  setSettings,
}: UseGpsRoverMapScopeOptions): void {
  const isActiveRef = useRef(false);
  const restoreRef = useRef<GoogleMapsSettings | null>(null);
  const autoEnabledRef = useRef<GoogleMapsSettings | null>(null);
  const lastMapsRef = useRef<GoogleMapsSettings | undefined>(googleMaps);

  useEffect(() => {
    const isGpsRover = activeAgent === AgentType.GPS_STAKEOUT;

    if (isGpsRover && !isActiveRef.current) {
      isActiveRef.current = true;

      if (!googleMaps?.enabled) {
        const previous = googleMaps ? { ...googleMaps } : { enabled: false };
        const autoEnabled: GoogleMapsSettings = {
          ...(googleMaps ?? {}),
          enabled: true,
          mapType: 'naip',
          scale: 2,
        };
        restoreRef.current = previous;
        autoEnabledRef.current = autoEnabled;
        setSettings(prev =>
          prev.googleMaps?.enabled
            ? prev
            : { ...prev, googleMaps: autoEnabled },
        );
      } else {
        restoreRef.current = null;
        autoEnabledRef.current = null;
      }
      return;
    }

    if (!isGpsRover && isActiveRef.current) {
      isActiveRef.current = false;
      autoEnabledRef.current = null;
      const restore = restoreRef.current;
      restoreRef.current = null;
      if (restore) {
        setSettings(prev => ({
          ...prev,
          googleMaps: { ...prev.googleMaps, ...restore },
        }));
      }
    }
  }, [activeAgent, googleMaps?.enabled, setSettings]);

  useEffect(() => {
    if (lastMapsRef.current === googleMaps) return;
    lastMapsRef.current = googleMaps;

    if (!isActiveRef.current) return;

    // The state update from the auto-enable above is not a user choice.
    if (autoEnabledRef.current && sameGoogleMaps(autoEnabledRef.current, googleMaps)) {
      autoEnabledRef.current = null;
      return;
    }

    // The user changed the map while in GPS Rover; keep their choice when
    // they switch away instead of restoring the pre-rover state.
    autoEnabledRef.current = null;
    restoreRef.current = null;
  }, [googleMaps]);
}
