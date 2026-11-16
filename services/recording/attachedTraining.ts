/**
 * In-memory handoff between the recording studio and the project save.
 *
 * Attaching is non-destructive: the live project geometry is untouched. The
 * next Save Project writes the recording under training/<id>/ and adds it to
 * the manifest. If the user never saves, nothing changes on disk.
 */

import type { RecordingBundle } from '../../utils/recording/types';

let attached: RecordingBundle[] = [];

export const attachRecordingToProject = (bundle: RecordingBundle): void => {
  attached = [bundle, ...attached.filter(item => item.manifest.id !== bundle.manifest.id)];
};

export const getAttachedTrainingBundles = (): RecordingBundle[] => [...attached];

export const detachRecordingFromProject = (id: string): void => {
  attached = attached.filter(item => item.manifest.id !== id);
};

export const clearAttachedTraining = (): void => {
  attached = [];
};
