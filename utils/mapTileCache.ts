/**
 * Basemap cache: grid-aligned tile planning, an in-memory bitmap LRU, and an
 * IndexedDB store so imagery survives reloads. Concurrent requests for the same
 * key share one fetch.
 */

const DB_NAME = 'landsurv-map-cache';
const STORE = 'entries';
const MAX_ENTRIES = 300;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BITMAP_LRU_MAX = 160;

interface StoredEntry {
  key: string;
  at: number;
  blob?: Blob;
  text?: string;
}

export interface CacheOptions {
  ttlMs?: number;
  persist?: boolean;
}

// ── IndexedDB ────────────────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise(resolve => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: 'key' });
            store.createIndex('at', 'at');
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function idbGet(key: string): Promise<StoredEntry | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise(resolve => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as StoredEntry | undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

let writesSincePrune = 0;

async function idbPut(entry: StoredEntry): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  if (++writesSincePrune >= 25) {
    writesSincePrune = 0;
    void idbPrune(db);
  }
}

async function idbPrune(db: IDBDatabase): Promise<void> {
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const countReq = store.count();
    countReq.onsuccess = () => {
      let excess = countReq.result - MAX_ENTRIES;
      if (excess <= 0) return;
      const cursorReq = store.index('at').openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || excess <= 0) return;
        cursor.delete();
        excess--;
        cursor.continue();
      };
    };
  } catch {
    /* best effort */
  }
}

/** Remove every persisted map entry. */
export async function clearMapCache(): Promise<void> {
  bitmapLru.clear();
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
  } catch {
    /* ignore */
  }
}

// ── Persisted JSON values ────────────────────────────────────────────────────

export async function readPersisted<T>(key: string, ttlMs = DEFAULT_TTL_MS): Promise<T | undefined> {
  const entry = await idbGet(key);
  if (!entry?.text || Date.now() - entry.at > ttlMs) return undefined;
  try {
    return JSON.parse(entry.text) as T;
  } catch {
    return undefined;
  }
}

export async function writePersisted(key: string, value: unknown): Promise<void> {
  try {
    await idbPut({ key, at: Date.now(), text: JSON.stringify(value) });
  } catch {
    /* quota or serialization failure — cache is best effort */
  }
}

// ── Download activity ────────────────────────────────────────────────────────

let pendingTiles = 0;
const activityListeners = new Set<() => void>();

export function getPendingTileCount(): number {
  return pendingTiles;
}

export function subscribeTileActivity(listener: () => void): () => void {
  activityListeners.add(listener);
  return () => {
    activityListeners.delete(listener);
  };
}

/** Count `task` as an in-flight tile download until it settles. */
export function trackTileLoad<T>(task: () => Promise<T>): Promise<T> {
  pendingTiles++;
  activityListeners.forEach(l => l());
  return task().finally(() => {
    pendingTiles--;
    activityListeners.forEach(l => l());
  });
}

// ── Bitmap cache ─────────────────────────────────────────────────────────────

const bitmapLru = new Map<string, ImageBitmap>();
const inflight = new Map<string, Promise<ImageBitmap>>();
const failedUntil = new Map<string, number>();
const FAILURE_BACKOFF_MS = 30_000;

function lruGet(key: string): ImageBitmap | undefined {
  const hit = bitmapLru.get(key);
  if (hit) {
    bitmapLru.delete(key);
    bitmapLru.set(key, hit);
  }
  return hit;
}

function lruSet(key: string, bmp: ImageBitmap): void {
  bitmapLru.delete(key);
  bitmapLru.set(key, bmp);
  while (bitmapLru.size > BITMAP_LRU_MAX) {
    const oldest = bitmapLru.keys().next().value;
    if (oldest === undefined) break;
    bitmapLru.delete(oldest);
  }
}

/** Memory-only lookup so callers can skip async work on a hit. */
export function peekCachedBitmap(key: string): ImageBitmap | undefined {
  return lruGet(key);
}

/**
 * Return a decoded bitmap for `key`: memory, then IndexedDB (if fresh), then
 * `fetchBlob`. A stale persisted copy is used when the network fails.
 */
export function getCachedBitmap(
  key: string,
  fetchBlob: () => Promise<Blob>,
  opts: CacheOptions = {},
): Promise<ImageBitmap> {
  const hit = lruGet(key);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;
  const retryAt = failedUntil.get(key);
  if (retryAt && Date.now() < retryAt) return Promise.reject(new Error('Tile fetch recently failed'));

  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  const persist = opts.persist !== false;

  const task = (async () => {
    const stored = persist ? await idbGet(key) : undefined;
    if (stored?.blob && Date.now() - stored.at <= ttl) {
      try {
        return await createImageBitmap(stored.blob);
      } catch {
        /* corrupt entry — refetch */
      }
    }
    try {
      const blob = await trackTileLoad(fetchBlob);
      const bmp = await createImageBitmap(blob);
      if (persist) void idbPut({ key, at: Date.now(), blob });
      return bmp;
    } catch (err) {
      if (stored?.blob) return await createImageBitmap(stored.blob);
      throw err;
    }
  })()
    .then(bmp => {
      failedUntil.delete(key);
      lruSet(key, bmp);
      return bmp;
    }, err => {
      failedUntil.set(key, Date.now() + FAILURE_BACKOFF_MS);
      throw err;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, task);
  return task;
}

// ── Decoded <img> cache for data URLs ────────────────────────────────────────

const imageByDataUrl = new Map<string, Promise<HTMLImageElement>>();

/** Decode a data URL once; repeated calls return the same element. */
export function decodeImageCached(dataUrl: string): Promise<HTMLImageElement> {
  const hit = imageByDataUrl.get(dataUrl);
  if (hit) {
    imageByDataUrl.delete(dataUrl);
    imageByDataUrl.set(dataUrl, hit);
    return hit;
  }
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Overlay image decode failed'));
    img.src = dataUrl;
  });
  p.catch(() => imageByDataUrl.delete(dataUrl));
  imageByDataUrl.set(dataUrl, p);
  while (imageByDataUrl.size > 40) {
    const oldest = imageByDataUrl.keys().next().value;
    if (oldest === undefined) break;
    imageByDataUrl.delete(oldest);
  }
  return p;
}

// ── Tile planning ────────────────────────────────────────────────────────────

export interface PlannedTile {
  bbox: [number, number, number, number];
  sizePx: number;
}

/**
 * Cover `view` with power-of-two-sized world cells so panning reuses the same
 * tiles. Cell size keeps tile resolution at or above the screen resolution.
 */
export function planMapTiles(
  view: [number, number, number, number],
  viewPxWidth: number,
  opts: { tilePx?: number; maxTiles?: number } = {},
): PlannedTile[] {
  const tilePx = opts.tilePx ?? 1024;
  const maxTiles = opts.maxTiles ?? 36;
  const [minX, minY, maxX, maxY] = view;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (!(spanX > 0) || !(spanY > 0) || !(viewPxWidth > 0)) return [];

  const pxPerUnit = viewPxWidth / spanX;
  let exp = Math.floor(Math.log2(tilePx / pxPerUnit));
  const cover = (e: number) => {
    const cell = Math.pow(2, e);
    const x0 = Math.floor(minX / cell);
    const x1 = Math.floor(maxX / cell);
    const y0 = Math.floor(minY / cell);
    const y1 = Math.floor(maxY / cell);
    return { cell, x0, x1, y0, y1, count: (x1 - x0 + 1) * (y1 - y0 + 1) };
  };

  let c = cover(exp);
  while (c.count > maxTiles && exp < 60) {
    exp++;
    c = cover(exp);
  }

  const tiles: PlannedTile[] = [];
  for (let iy = c.y0; iy <= c.y1; iy++) {
    for (let ix = c.x0; ix <= c.x1; ix++) {
      tiles.push({
        bbox: [ix * c.cell, iy * c.cell, (ix + 1) * c.cell, (iy + 1) * c.cell],
        sizePx: tilePx,
      });
    }
  }
  return tiles;
}

/** Run `worker` over `items` with at most `limit` in flight. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}
