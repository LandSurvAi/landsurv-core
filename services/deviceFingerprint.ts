/**
 * Device Fingerprint
 *
 * Builds a stable, dependency-free device identifier for the free-deed
 * allowance. Signals are collected from the browser (canvas + WebGL render
 * hashes, user agent, screen geometry, timezone, language, hardware hints) and
 * hashed with SHA-256.
 *
 * The resulting id is cached in localStorage so a returning visitor keeps the
 * same allowance, but it is *derived from the device*, not from a random value:
 * clearing storage re-computes the same id from the same hardware/browser
 * signals, which is what makes the free-deed limit meaningful.
 *
 * All collection is best-effort and wrapped: browsers that block canvas/WebGL
 * (or non-browser test environments) simply contribute fewer signals.
 */

const ID_STORAGE_KEY = 'landsurv_device_fingerprint_v1';
const SIGNALS_STORAGE_KEY = 'landsurv_device_fingerprint_signals_v1';
const FINGERPRINT_VERSION = 1;

export interface FingerprintSignals {
  version: number;
  userAgent: string;
  platform: string;
  language: string;
  languages: string[];
  timezone: string;
  timezoneOffsetMinutes: number;
  screen: { width: number; height: number; colorDepth: number; pixelDepth: number };
  devicePixelRatio: number;
  hardwareConcurrency: number;
  deviceMemory: number;
  maxTouchPoints: number;
  canvas: string;
  webgl: string;
  webglVendor: string;
  webglRenderer: string;
}

export interface DeviceFingerprint {
  id: string;
  signals: FingerprintSignals;
  createdAt: number;
  /** True when the id came from the localStorage cache instead of a fresh hash. */
  cached: boolean;
}

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function hasWindow(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/** SHA-256 hex digest, with a deterministic FNV-1a fallback for old/insecure contexts. */
export async function hashFingerprintInput(input: string): Promise<string> {
  const subtle = (typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined)?.subtle;
  if (subtle && typeof TextEncoder !== 'undefined') {
    try {
      const bytes = new TextEncoder().encode(input);
      const digest = await subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      /* fall through to FNV */
    }
  }

  // FNV-1a (32-bit, run twice with different offsets to widen the output).
  const fnv = (seed: number): string => {
    let h = seed >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };
  return `${fnv(0x811c9dc5)}${fnv(0x01000193)}${fnv(0x9e3779b9)}${fnv(0x85ebca6b)}`;
}

function hashSync(input: string): string {
  // Small synchronous digest used for the canvas/WebGL sub-signals. The final
  // id is still hashed asynchronously with SHA-256.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = (Math.imul(h2 ^ (code + i), 0x85ebca6b) + 0x9e3779b9) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

function collectCanvasHash(): string {
  if (!hasWindow()) return 'no-canvas';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-context';
    ctx.textBaseline = 'top';
    ctx.font = '14px "Arial"';
    ctx.fillStyle = '#f60';
    ctx.fillRect(2, 2, 120, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('LandSurv.ai fingerprint 🛰', 4, 4);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('LandSurv.ai fingerprint 🛰', 6, 24);
    ctx.strokeStyle = 'rgba(120, 60, 220, 0.6)';
    ctx.beginPath();
    ctx.arc(60, 30, 18, 0, Math.PI * 2);
    ctx.stroke();
    return hashSync(canvas.toDataURL());
  } catch {
    return 'canvas-error';
  }
}

function collectWebglFingerprint(): { webgl: string; vendor: string; renderer: string } {
  if (!hasWindow()) return { webgl: 'no-webgl', vendor: 'unknown', renderer: 'unknown' };
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return { webgl: 'no-webgl', vendor: 'unknown', renderer: 'unknown' };

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '') : '';
    const renderer = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '') : '';

    const params: string[] = [
      vendor,
      renderer,
      String(gl.getParameter(gl.VERSION) || ''),
      String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || ''),
      String(gl.getParameter(gl.MAX_TEXTURE_SIZE) || ''),
      String(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || ''),
      String(gl.getParameter(gl.MAX_VIEWPORT_DIMS) || ''),
      String(gl.getParameter(gl.MAX_VERTEX_ATTRIBS) || ''),
      String(gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) || ''),
      String(gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) || ''),
      (gl.getSupportedExtensions() || []).slice().sort().join(','),
    ];

    return { webgl: hashSync(params.join('|')), vendor, renderer };
  } catch {
    return { webgl: 'webgl-error', vendor: 'unknown', renderer: 'unknown' };
  }
}

/** Collect the raw signal set. Safe to call repeatedly; nothing is persisted. */
export function collectFingerprintSignals(): FingerprintSignals {
  const nav: any = typeof navigator !== 'undefined' ? navigator : {};
  const scr: any = typeof screen !== 'undefined' ? screen : {};
  const webgl = collectWebglFingerprint();

  return {
    version: FINGERPRINT_VERSION,
    userAgent: String(nav.userAgent || ''),
    platform: String(nav.platform || ''),
    language: String(nav.language || ''),
    languages: Array.isArray(nav.languages) ? nav.languages.map((l: unknown) => String(l)) : [],
    timezone: (() => {
      try {
        return String(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
      } catch {
        return '';
      }
    })(),
    timezoneOffsetMinutes: typeof Date !== 'undefined' ? new Date().getTimezoneOffset() : 0,
    screen: {
      width: Number(scr.width || 0),
      height: Number(scr.height || 0),
      colorDepth: Number(scr.colorDepth || 0),
      pixelDepth: Number(scr.pixelDepth || 0),
    },
    devicePixelRatio: typeof window !== 'undefined' ? Number(window.devicePixelRatio || 1) : 1,
    hardwareConcurrency: Number(nav.hardwareConcurrency || 0),
    deviceMemory: Number(nav.deviceMemory || 0),
    maxTouchPoints: Number(nav.maxTouchPoints || 0),
    canvas: collectCanvasHash(),
    webgl: webgl.webgl,
    webglVendor: webgl.vendor,
    webglRenderer: webgl.renderer,
  };
}

/**
 * Stable string fed to the final hash. Screen *geometry* is excluded from the
 * id on purpose: plugging in an external monitor or resizing a window would
 * otherwise mint a brand-new "device" and hand out a fresh free-deed allowance.
 */
function canonicalSignalString(signals: FingerprintSignals): string {
  return [
    `v${signals.version}`,
    signals.userAgent,
    signals.platform,
    signals.language,
    signals.languages.join(','),
    signals.timezone,
    signals.hardwareConcurrency,
    signals.deviceMemory,
    signals.maxTouchPoints,
    signals.canvas,
    signals.webgl,
    signals.webglVendor,
    signals.webglRenderer,
  ].join('::');
}

export interface GetFingerprintOptions {
  /** Ignore the cached id and re-derive it from current signals. */
  forceRefresh?: boolean;
}

let inFlight: Promise<DeviceFingerprint> | null = null;

/**
 * Resolve the device fingerprint. Reuses a cached id when present (stable
 * allowance across visits) and otherwise derives one from current signals.
 */
export async function getDeviceFingerprint(options: GetFingerprintOptions = {}): Promise<DeviceFingerprint> {
  if (inFlight && !options.forceRefresh) return inFlight;

  inFlight = (async () => {
    const storage = safeStorage();
    const signals = collectFingerprintSignals();
    const derived = await hashFingerprintInput(canonicalSignalString(signals));

    let id = '';
    let createdAt = Date.now();
    let cached = false;

    if (storage && !options.forceRefresh) {
      try {
        const raw = storage.getItem(ID_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { id?: string; createdAt?: number; version?: number };
          if (parsed?.id && parsed.version === FINGERPRINT_VERSION && typeof parsed.id === 'string' && parsed.id.length >= 16) {
            id = parsed.id;
            createdAt = Number(parsed.createdAt) || createdAt;
            cached = true;
          }
        }
      } catch {
        /* corrupted cache — derive again below */
      }
    }

    if (!id) {
      id = derived;
      if (storage) {
        try {
          storage.setItem(ID_STORAGE_KEY, JSON.stringify({ id, createdAt, version: FINGERPRINT_VERSION }));
        } catch {
          /* storage full / disabled — still return the derived id */
        }
      }
    }

    if (storage) {
      try {
        storage.setItem(
          SIGNALS_STORAGE_KEY,
          JSON.stringify({
            userAgent: signals.userAgent,
            platform: signals.platform,
            webglVendor: signals.webglVendor,
            webglRenderer: signals.webglRenderer,
            timezone: signals.timezone,
            screen: signals.screen,
            capturedAt: new Date().toISOString(),
          }),
        );
      } catch {
        /* non-fatal */
      }
    }

    return { id, signals, createdAt, cached };
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/** Clear the cached id (used by tests and the DevOps "reset device" workflow). */
export function clearCachedDeviceFingerprint(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(ID_STORAGE_KEY);
    storage.removeItem(SIGNALS_STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}

/** Short display form, e.g. `a1b2c3d4…9f0e`. */
export function shortFingerprint(id: string, edge = 8): string {
  if (!id) return '—';
  if (id.length <= edge * 2) return id;
  return `${id.slice(0, edge)}…${id.slice(-4)}`;
}
