// useMirrorError.ts
// Mirrors a component's local error state into the unified notification bell
// while leaving the component's own inline error UI intact. Every time the
// provided `error` becomes a non-empty value it is reported via the shared
// error bus (deduped so repeats don't flood the bell). Routing through the
// module-level bus means the component does not require the AppStateProvider
// to be present (e.g. in isolated unit tests it simply becomes a no-op).

import { useEffect } from 'react';
import { emitError } from '../utils/errorReporting';

interface MirrorErrorOptions {
  /** Short headline shown in the notification row. Defaults to 'Error'. */
  title?: string;
  /** Stable notification kind/dedupe namespace, e.g. 'cadmanager-error'. */
  kind: string;
  /** Auto-dismiss delay in ms. Defaults to 8000. */
  autoDismissMs?: number;
}

export function useMirrorError(
  error: string | null | undefined,
  { title = 'Error', kind, autoDismissMs = 8000 }: MirrorErrorOptions,
): void {
  useEffect(() => {
    if (!error) return;
    emitError({
      title,
      message: error,
      kind,
      dedupeKey: `${kind}:${error}`,
      autoDismissMs,
    });
  }, [error, title, kind, autoDismissMs]);
}
