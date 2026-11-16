/**
 * Lazy import of a recording embedded in an opened .lsvz.
 *
 * The project load keeps only the manifest index and the archive bytes. When
 * the viewer presses Play, the training tree is unzipped, validated, imported
 * into IndexedDB under a deterministic local id, and opened in the replay tab.
 * No recorder key is required for this path.
 */

import JSZip from 'jszip';
import { bundleFromTrainingAssets, recountBundle } from './bundle';
import { saveRecordingBundle } from './recordingStore';

const safeProjectKey = (value: string): string =>
  value.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'project';

export const importEmbeddedTraining = async (
  source: ArrayBuffer,
  recordingId: string,
  projectKey: string,
): Promise<string> => {
  const zip = await JSZip.loadAsync(source);
  const prefix = `training/${recordingId}/`;
  const assets = new Map<string, Blob>();

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !path.startsWith(prefix)) continue;
    assets.set(path, await entry.async('blob'));
  }

  if (!assets.has(`${prefix}manifest.json`)) {
    throw new Error('This training is missing its manifest. The .lsvz may be incomplete.');
  }

  const bundle = await bundleFromTrainingAssets(assets, recordingId);
  const localId = `lsvz:${safeProjectKey(projectKey)}:${recordingId}`;
  bundle.manifest.id = localId;
  bundle.manifest.status = 'linked';
  recountBundle(bundle);
  await saveRecordingBundle(bundle);
  return localId;
};
