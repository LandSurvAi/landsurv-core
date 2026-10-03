// NotificationScopeMarker.tsx
// Mounted only inside the main app shell (where the header NotificationCenter
// bell lives). While mounted, it marks the notification bar as "in scope" so
// the error reporter routes errors to the bell only. When unmounted (landing /
// subdomain / checkout pages, or a React crash), errors fall back to the red
// dialog and still mirror to the bell.

import { useEffect } from 'react';
import { setNotificationBarInScope } from '../utils/errorReporting';

const NotificationScopeMarker: React.FC = () => {
  useEffect(() => {
    setNotificationBarInScope(true);
    return () => setNotificationBarInScope(false);
  }, []);
  return null;
};

export default NotificationScopeMarker;
