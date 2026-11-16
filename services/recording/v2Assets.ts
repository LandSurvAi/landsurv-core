import type { RecordingAsset, RecordingBundleV2 } from '../../utils/recording/v2';
import type { SessionFile } from '../../types';
import { getRecordingAsset, saveRecordingAsset } from './recordingStore';

const MIN_ASSET_CHARS = 256;
const ASSET_PREFIX = 'asset:';

const extensionOf = (name: string): string => {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index + 1).toLowerCase();
};

const kindFor = (name: string): RecordingAsset['kind'] => {
  const extension = extensionOf(name);
  if (extension === 'csv') return 'csv';
  if (extension === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'tif', 'tiff'].includes(extension)) return 'image';
  if (extension === 'dxf') return 'dxf';
  if (['geojson', 'json'].includes(extension)) return 'geojson';
  if (['txt', 'md', 'cl'].includes(extension)) return 'text';
  return 'other';
};

const mimeFor = (name: string): string => {
  switch (kindFor(name)) {
    case 'csv': return 'text/csv';
    case 'pdf': return 'application/pdf';
    case 'image': return 'image/*';
    case 'dxf': return 'application/dxf';
    case 'geojson': return 'application/geo+json';
    case 'text': return 'text/plain';
    default: return 'application/octet-stream';
  }
};

const digest = async (data: string): Promise<string> => {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const bytes = new TextEncoder().encode(data);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  let hash = 2166136261;
  for (let index = 0; index < data.length; index += 1) {
    hash ^= data.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const isSessionFile = (value: unknown): value is SessionFile => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.name === 'string'
    && (typeof record.content === 'string'
      || typeof record.fileData === 'string'
      || Array.isArray(record.rasterImageData));
};

interface AssetState {
  byHash: Map<string, string>;
  assets: RecordingAsset[];
}

const processString = async (
  data: string,
  fileName: string,
  ref: string,
  state: AssetState,
): Promise<string> => {
  if (data.length < MIN_ASSET_CHARS || data.startsWith(ASSET_PREFIX)) return data;
  const sha256 = await digest(data);
  let id = state.byHash.get(sha256);
  if (!id) {
    id = `asset-${sha256.slice(0, 24)}`;
    state.byHash.set(sha256, id);
    const asset: RecordingAsset = {
      id,
      name: fileName,
      kind: kindFor(fileName),
      mime: mimeFor(fileName),
      sizeBytes: data.length,
      sha256,
      refs: [ref],
    };
    state.assets.push(asset);
    await saveRecordingAsset(id, data);
  } else {
    const existing = state.assets.find(asset => asset.id === id);
    if (existing && !existing.refs.includes(ref)) existing.refs.push(ref);
  }
  return `${ASSET_PREFIX}${id}`;
};

const walk = async (value: any, ref: string, state: AssetState): Promise<any> => {
  if (Array.isArray(value)) {
    const result: any[] = [];
    for (const item of value) result.push(await walk(item, ref, state));
    return result;
  }
  if (!value || typeof value !== 'object') return value;

  if (isSessionFile(value)) {
    const next: SessionFile = { ...value };
    if (typeof next.content === 'string') {
      next.content = await processString(next.content, next.name, ref, state);
    }
    if (typeof next.fileData === 'string') {
      next.fileData = await processString(next.fileData, next.name, ref, state);
    }
    if (Array.isArray(next.rasterImageData)) {
      const pages: string[] = [];
      for (const page of next.rasterImageData) {
        pages.push(typeof page === 'string' ? await processString(page, next.name, ref, state) : page);
      }
      next.rasterImageData = pages;
    }
    return next;
  }

  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) next[key] = await walk(item, ref, state);
  return next;
};

/** Replace large file payloads with content-addressed refs at recording stop. */
export const dedupeV2Assets = async (bundle: RecordingBundleV2): Promise<void> => {
  const state: AssetState = { byHash: new Map(), assets: [] };

  for (const keyframe of bundle.keyframes) {
    keyframe.channels = await walk(keyframe.channels, `keyframe:${keyframe.id}`, state);
  }
  for (const change of bundle.changes) {
    const mutable = change as unknown as Record<string, unknown>;
    if ('v' in mutable) mutable.v = await walk(mutable.v, `change:${mutable.seq}`, state);
    if (Array.isArray(mutable.deltas)) {
      mutable.deltas = await walk(mutable.deltas, `change:${mutable.seq}`, state);
    }
  }

  bundle.manifest.assets = state.assets;
  bundle.manifest.counts.assets = state.assets.length;
};

const FILE_CHANNEL_IDS = new Set([
  'files.rawFile',
  'files.deedFile',
  'files.planFiles',
  'files.dxfFile',
  'files.clFile',
  'files.imageFiles',
  'files.gisFile',
  'files.generatedFiles',
  'files.pdfViewerFiles',
]);

export const hydrateReplayChannels = <T extends Record<string, any>>(
  channels: T,
  assets: Record<string, string>,
): T => {
  if (Object.keys(assets).length === 0) return channels;
  let result: T = channels;
  for (const id of FILE_CHANNEL_IDS) {
    if (channels[id] === undefined) continue;
    if (result === channels) result = { ...channels };
    result[id as keyof T] = hydrateReplayValue(channels[id], assets);
  }
  return result;
};

export const hydrateReplayValue = <T,>(value: T, assets: Record<string, string>): T => {
  if (typeof value === 'string' && value.startsWith(ASSET_PREFIX)) {
    return (assets[value.slice(ASSET_PREFIX.length)] ?? value) as T;
  }
  if (Array.isArray(value)) {
    return value.map(item => hydrateReplayValue(item, assets)) as T;
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) next[key] = hydrateReplayValue(item, assets);
    return next as T;
  }
  return value;
};

export const loadReplayAssets = async (
  assets: RecordingAsset[],
): Promise<Record<string, string>> => {
  const loaded: Record<string, string> = {};
  await Promise.all(assets.map(async asset => {
    const data = await getRecordingAsset(asset.id);
    if (data !== null) loaded[asset.id] = data;
  }));
  return loaded;
};
