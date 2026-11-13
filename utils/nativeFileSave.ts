/**
 * Native project-file save support.
 *
 * A browser download always lands in the Downloads folder. When the File System
 * Access API is available, ask the user where the .lsvz should live and write
 * directly to that file. Browsers without the API still use the caller's
 * download fallback.
 */

export interface NativeSaveFileHandle {
  name?: string;
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}

export type SaveFilePickerResult =
  | { status: 'picked'; handle: NativeSaveFileHandle }
  | { status: 'canceled' }
  | { status: 'unsupported' };

interface SavePickerOptions {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
  excludeAcceptAllOption?: boolean;
}

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options?: SavePickerOptions) => Promise<NativeSaveFileHandle>;
};

const getSavePicker = (): SavePickerWindow['showSaveFilePicker'] | null => {
  if (typeof window === 'undefined') return null;
  const picker = (window as SavePickerWindow).showSaveFilePicker;
  return typeof picker === 'function' ? picker : null;
};

/** True when this browser can save through a native file picker. */
export const supportsNativeFileSave = (): boolean => getSavePicker() !== null;

/** True when the user dismissed a picker or permission prompt. */
export const isFileSaveCanceled = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  return (error as { name?: unknown }).name === 'AbortError';
};

/**
 * Ask for a destination `.lsvz` handle. Cancellation is returned as a result so
 * callers can leave their dialogs open instead of turning it into an error.
 */
export async function pickSessionFileHandle(
  suggestedName: string,
): Promise<SaveFilePickerResult> {
  const picker = getSavePicker();
  if (!picker) return { status: 'unsupported' };

  try {
    const handle = await picker.call(window, {
      suggestedName,
      types: [
        {
          description: 'LandSurv.ai project archive',
          accept: { 'application/zip': ['.lsvz'] },
        },
      ],
    });
    return { status: 'picked', handle };
  } catch (error) {
    if (isFileSaveCanceled(error)) return { status: 'canceled' };
    if (
      typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      (error.name === 'SecurityError' || error.name === 'NotAllowedError')
    ) {
      // Some embedded or locked-down contexts expose the API but refuse to
      // open the picker. A download is still better than losing the save.
      console.warn('[nativeFileSave] File picker unavailable; using download fallback.', error);
      return { status: 'unsupported' };
    }
    throw error;
  }
}

/** Write a generated project archive into an already-picked file. */
export async function writeBlobToFileHandle(
  handle: NativeSaveFileHandle,
  blob: Blob,
): Promise<void> {
  if (!blob || blob.size === 0) {
    throw new Error('Save failed: no data was produced.');
  }

  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    // Close a partially written stream so the browser does not keep a lock.
    try {
      await writable.close();
    } catch {
      /* already closed or canceled */
    }
    throw error;
  }
}
