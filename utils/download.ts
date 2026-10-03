// A robust, single download function to replace all uses of `showSaveFilePicker` and legacy fallbacks.
//
// Hardening notes:
// - The object URL is revoked on a deferred timer, NOT synchronously after click().
//   Revoking immediately can cancel the download before the browser has started
//   streaming the blob, which manifests as "Save is not working / nothing downloads".
// - Guards against empty/invalid blobs so callers get a clear error instead of a
//   silently produced 0-byte file.
// - Falls back to the legacy `msSaveOrOpenBlob` API when available (older Edge /
//   locked-down environments).
export const triggerDownload = (blob: Blob, fileName: string): void => {
    if (!blob || !(blob instanceof Blob)) {
        throw new Error('Download failed: no data was produced.');
    }
    if (blob.size === 0) {
        throw new Error('Download failed: the generated file is empty (0 bytes).');
    }

    const safeName = (fileName && fileName.trim()) || 'download';

    // Legacy IE/old-Edge path.
    const legacySave = (navigator as unknown as {
        msSaveOrOpenBlob?: (b: Blob, name: string) => boolean;
    }).msSaveOrOpenBlob;
    if (typeof legacySave === 'function') {
        legacySave.call(navigator, blob, safeName);
        return;
    }

    const url = URL.createObjectURL(blob);
    try {
        const link = document.createElement('a');
        link.href = url;
        link.download = safeName;
        link.rel = 'noopener';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } finally {
        // Defer revocation so the browser has time to begin the download.
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
};
