// GlobalErrorDialog.tsx
// Renders the red FloatingErrorBanner for errors reported while the notification
// bell is out of scope (landing / subdomain / checkout pages, pre-mount init).
// Mounted at the App root, inside the providers but outside AppContent's early
// returns, so it can surface on every render path.

import React from 'react';
import FloatingErrorBanner from './FloatingErrorBanner';
import { useAppState } from '../contexts/AppStateContext';

const GlobalErrorDialog: React.FC = () => {
  const { criticalError, dismissCriticalError } = useAppState();
  if (!criticalError) return null;
  return <FloatingErrorBanner message={criticalError} onClose={dismissCriticalError} />;
};

export default GlobalErrorDialog;
