type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<unknown>;
};

/** True when the browser can open a directory without a folder-upload input. */
export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined'
    && typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function';
}

export function isDirectoryPickerAbort(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : Boolean(error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError');
}

/**
 * Read every file under a user-picked directory.
 *
 * Chrome's `<input webkitdirectory>` path adds a browser security warning that
 * says the whole folder will be uploaded. The File System Access picker does
 * not use that warning path, so this is the preferred folder intake where it
 * is available. Older browsers keep the classic folder input as a fallback.
 */
export async function pickDirectoryFiles(): Promise<File[]> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) throw new Error('Directory picker is not available');

  const handle = await picker({ mode: 'read' });
  const files: File[] = [];

  const walk = async (directory: unknown): Promise<void> => {
    const entries = (directory as { values?: () => AsyncIterable<unknown> }).values;
    if (!entries) return;
    for await (const entry of entries.call(directory)) {
      const typed = entry as {
        kind?: string;
        getFile?: () => Promise<File>;
      };
      if (typed.kind === 'file' && typed.getFile) {
        files.push(await typed.getFile());
      } else if (typed.kind === 'directory') {
        await walk(entry);
      }
    }
  };

  await walk(handle);
  return files;
}
