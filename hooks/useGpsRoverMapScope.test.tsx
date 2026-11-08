import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentType, type Settings } from '../types';
import { DEFAULT_SETTINGS } from '../utils/sessionDefaults';
import { useGpsRoverMapScope } from './useGpsRoverMapScope';

function makeSettings(
  enabled: boolean,
  mapType: NonNullable<Settings['googleMaps']>['mapType'] = 'naip',
): Settings {
  return {
    ...DEFAULT_SETTINGS,
    googleMaps: {
      ...DEFAULT_SETTINGS.googleMaps!,
      enabled,
      mapType,
      scale: 2,
    },
  };
}

function useHarness(initialAgent: AgentType, initialEnabled: boolean) {
  const [activeAgent, setActiveAgent] = useState(initialAgent);
  const [settings, setSettings] = useState<Settings>(() => makeSettings(initialEnabled));

  useGpsRoverMapScope({
    activeAgent,
    googleMaps: settings.googleMaps,
    setSettings,
  });

  return { activeAgent, setActiveAgent, settings, setSettings };
}

describe('useGpsRoverMapScope', () => {
  it('keeps map imagery off and defaults to NAIP outside GPS Rover', () => {
    expect(DEFAULT_SETTINGS.googleMaps?.enabled).toBe(false);
    expect(DEFAULT_SETTINGS.googleMaps?.mapType).toBe('naip');

    const { result } = renderHook(() => useHarness(AgentType.LSVZ_AGENT, false));
    expect(result.current.settings.googleMaps?.enabled).toBe(false);
  });

  it('turns the map on for GPS Rover and restores the previous state on exit', () => {
    const { result } = renderHook(() => useHarness(AgentType.LSVZ_AGENT, false));

    act(() => result.current.setActiveAgent(AgentType.GPS_STAKEOUT));
    expect(result.current.settings.googleMaps?.enabled).toBe(true);
    expect(result.current.settings.googleMaps?.mapType).toBe('naip');

    act(() => result.current.setActiveAgent(AgentType.POINT_EDITOR));
    expect(result.current.settings.googleMaps?.enabled).toBe(false);
    expect(result.current.settings.googleMaps?.mapType).toBe('naip');
  });

  it('keeps a manually enabled map on after leaving GPS Rover', () => {
    const { result } = renderHook(() => useHarness(AgentType.LSVZ_AGENT, true));

    act(() => result.current.setActiveAgent(AgentType.GPS_STAKEOUT));
    act(() => result.current.setActiveAgent(AgentType.POINT_EDITOR));

    expect(result.current.settings.googleMaps?.enabled).toBe(true);
  });

  it('does not undo a map change the user makes while in GPS Rover', () => {
    const { result } = renderHook(() => useHarness(AgentType.LSVZ_AGENT, false));

    act(() => result.current.setActiveAgent(AgentType.GPS_STAKEOUT));
    expect(result.current.settings.googleMaps?.enabled).toBe(true);

    act(() => {
      result.current.setSettings(prev => ({
        ...prev,
        googleMaps: { ...prev.googleMaps, enabled: false },
      }));
    });
    act(() => {
      result.current.setSettings(prev => ({
        ...prev,
        googleMaps: { ...prev.googleMaps, enabled: true },
      }));
    });
    act(() => result.current.setActiveAgent(AgentType.POINT_EDITOR));

    expect(result.current.settings.googleMaps?.enabled).toBe(true);
  });
});
