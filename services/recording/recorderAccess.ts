/**
 * Recorder access client.
 *
 * The portable key is exchanged once for a recorder session token. The token
 * is kept in sessionStorage (not the key) and sent as a bearer header, while
 * the backend also sets an HttpOnly cookie for same-site deployments.
 */

export interface RecorderSessionInfo {
  keyId: string;
  label: string;
  ownerEmail?: string | null;
  expiresAt: string;
}

export type RecorderAccessResult =
  | { status: 'ok'; session: RecorderSessionInfo }
  | { status: 'locked' }
  | { status: 'unavailable'; message: string };

const TOKEN_KEY = 'landsurv_recorder_session_token';
const ARMED_KEY = 'landsurv_recorder_armed';

/**
 * A device is "armed" only after an explicit unlock or launch. Public visitors
 * never have this marker, so their app never mounts the recorder HUD or calls
 * the recorder API.
 */
export const isRecorderArmed = (): boolean => {
  try {
    return localStorage.getItem(ARMED_KEY) === '1';
  } catch {
    return false;
  }
};

const setRecorderArmed = (armed: boolean): void => {
  try {
    if (armed) localStorage.setItem(ARMED_KEY, '1');
    else localStorage.removeItem(ARMED_KEY);
  } catch {
    /* private mode: the session cookie still governs access */
  }
};

const apiBase = (): string =>
  String((import.meta as any)?.env?.VITE_API_URL || '').trim().replace(/\/+$/, '');

const apiUrl = (path: string): string => `${apiBase()}/api/recorder${path}`;

const storedToken = (): string => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
};

const storeToken = (token: string): void => {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: header auth falls back to the cookie */
  }
};

const recorderHeaders = (): Record<string, string> => {
  const token = storedToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const parseError = async (response: Response): Promise<string> => {
  try {
    const body = await response.json();
    return String(body?.error || body?.message || `Request failed (${response.status}).`);
  } catch {
    return `Request failed (${response.status}).`;
  }
};

const mapSession = (body: any): RecorderSessionInfo => ({
  keyId: String(body?.keyId ?? ''),
  label: String(body?.label ?? 'Recorder'),
  ownerEmail: body?.ownerEmail ?? null,
  expiresAt: String(body?.expiresAt ?? ''),
});

const unlockRequest = async (path: string, body: unknown): Promise<RecorderSessionInfo> => {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Recorder service is unreachable. Check the backend connection and try again.');
  }
  if (!response.ok) throw new Error(await parseError(response));
  const payload = await response.json();
  if (payload?.token) storeToken(String(payload.token));
  setRecorderArmed(true);
  return mapSession(payload);
};

export const unlockWithRecorderKey = (key: string): Promise<RecorderSessionInfo> =>
  unlockRequest('/unlock', { key: key.trim() });

export const unlockWithLaunchToken = (launchToken: string): Promise<RecorderSessionInfo> =>
  unlockRequest('/launch/exchange', { launchToken });

export const getRecorderSession = async (): Promise<RecorderAccessResult> => {
  let response: Response;
  try {
    response = await fetch(apiUrl('/session'), {
      method: 'GET',
      headers: recorderHeaders(),
      credentials: 'include',
    });
  } catch {
    return { status: 'unavailable', message: 'Recorder service is unreachable.' };
  }
  if (response.status === 401) {
    storeToken('');
    setRecorderArmed(false);
    return { status: 'locked' };
  }
  if (!response.ok) {
    return { status: 'unavailable', message: await parseError(response) };
  }
  setRecorderArmed(true);
  return { status: 'ok', session: mapSession(await response.json()) };
};

export const logoutRecorder = async (): Promise<void> => {
  storeToken('');
  setRecorderArmed(false);
  try {
    await fetch(apiUrl('/logout'), {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    /* best effort */
  }
};

export const registerRecorderSession = async (metadata: {
  title: string;
  projectLabel?: string;
  durationMs: number;
  eventCount: number;
  appVersion?: string;
}): Promise<void> => {
  try {
    await fetch(apiUrl('/sessions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...recorderHeaders() },
      credentials: 'include',
      body: JSON.stringify(metadata),
    });
  } catch {
    // Metadata registration is best-effort; the local recording is authoritative.
  }
};
