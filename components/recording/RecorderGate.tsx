/**
 * Public recorder gate.
 *
 * The recorder must leave no trace in the public app: no locked pill, no menu
 * item, and no recorder API request. This gate therefore renders nothing unless
 * the device was explicitly armed by a previous unlock, the owner opens the
 * private `?recorder=1` entry, or a DevOps launch link is present. Only then is
 * the HUD chunk fetched.
 */

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { isRecorderArmed } from '../../services/recording/recorderAccess';

const LazyRecorderHud = lazy(() =>
  import('./RecorderHud.tsx').then(module => ({ default: module.RecorderHud })),
);

const shouldLoadRecorder = (): boolean => {
  if (isRecorderArmed()) return true;
  const params = new URLSearchParams(window.location.search);
  if (params.has('recorderLaunch') || params.get('recorder') === '1') return true;
  return Boolean((import.meta as any).env?.DEV)
    && String((import.meta as any).env?.VITE_RECORDER_DEV_UNLOCK || '') === 'true';
};

export const RecorderGate: React.FC = () => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(shouldLoadRecorder());
  }, []);

  if (!enabled) return null;

  return (
    <Suspense fallback={null}>
      <LazyRecorderHud />
    </Suspense>
  );
};
