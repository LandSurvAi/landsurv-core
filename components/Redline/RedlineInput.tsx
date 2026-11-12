import React, { useMemo, useState } from 'react';
import type { RedlineReadingMode, SessionFile } from '../../types';
import { RedlineIcon, XMarkIcon } from '../icons';
import {
  UploadShell,
  UploadPanel,
  UploadDropzone,
  UploadPrimaryButton,
  UploadGhostButton,
  UploadActionBar,
  UploadModeSwitch,
  UploadFileList,
} from '../UploadShell';

export interface RedlineInputProps {
  onPackageSubmitted: (files: SessionFile[], mode: RedlineReadingMode) => void;
  onOpenWorkspace: () => void;
  onGoBack: () => void;
  backButtonTitle?: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the PDF.'));
    reader.readAsDataURL(file);
  });
}

/**
 * A2UI intake for the Redline Agent. Accepts annotated PDFs only and routes the
 * package into the Redline workspace, where calibration and review happen.
 */
export const RedlineInput: React.FC<RedlineInputProps> = ({
  onPackageSubmitted,
  onOpenWorkspace,
  onGoBack,
  backButtonTitle = 'Hide',
}) => {
  const [mode, setMode] = useState<RedlineReadingMode>('fast');
  const [files, setFiles] = useState<SessionFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const totalMb = useMemo(
    () => files.reduce((sum, file) => sum + (file.fileData?.length ?? 0) * 0.75, 0) / (1024 * 1024),
    [files],
  );

  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const next: SessionFile[] = [];
      for (const file of Array.from(list)) {
        if (!/\.pdf$/i.test(file.name)) {
          setError('Annotated PDFs only. Image and point files are not accepted by the Redline Agent.');
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        next.push({ name: file.name, content: '', fileData: dataUrl });
      }
      setFiles((previous) => {
        const byName = new Map(previous.map((file) => [file.name, file]));
        for (const file of next) byName.set(file.name, file);
        return [...byName.values()];
      });
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'Could not read the selected PDF.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <UploadShell
      icon={RedlineIcon}
      accent="#ef4444"
      title="Redline"
      accentWord=" Agent"
      description="Review annotated PDFs with sheet calibration, a numbered worklist, and Civil Drafter coordination. Fast reads the annotation layer; Deep also runs a vision pass."
      onGoBack={onGoBack}
      backTitle={backButtonTitle}
      headerRight={
        <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
          Experimental
        </span>
      }
    >
      <UploadPanel>
        <UploadDropzone
          id="redline-file-input"
          accept=".pdf,application/pdf"
          multiple
          onFiles={(selected) => void addFiles(selected)}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIsDragging(false);
            void addFiles(event.dataTransfer.files);
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIsDragging(false);
          }}
          isDragging={isDragging}
          title="Drop marked-up PDFs here"
          hint="or click to browse · Bluebeam or Acrobat revision clouds, callouts, highlights, and notes"
          disabled={busy}
        />

        {files.length > 0 && (
          <div className="mt-3">
            <UploadFileList
              title="Redline package"
              files={files.map((file) => ({
                key: file.name,
                name: file.name,
                meta: 'PDF',
                action: (
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    className="rounded p-1 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-rose-300"
                    onClick={() => setFiles((previous) => previous.filter((candidate) => candidate.name !== file.name))}
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                ),
              }))}
            />
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <UploadModeSwitch<RedlineReadingMode>
            value={mode}
            options={[
              { value: 'fast' as RedlineReadingMode, label: 'Fast' },
              { value: 'deep' as RedlineReadingMode, label: 'Deep' },
            ]}
            onChange={setMode}
          />
          <span className="text-[10px] text-slate-500">20 sheets / 50 MB experimental limit</span>
        </div>
        <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
          {mode === 'fast'
            ? 'Reads embedded annotations and the PDF text layer. No vision call.'
            : 'Also renders pages for a vision pass. Slower, and sends page imagery to the model.'}
        </p>

        {mode === 'deep' && (
          <p className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-200">
            Calibration on flattened scans is approximate, so verify targets before applying.
          </p>
        )}
      </UploadPanel>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
          {error}
        </p>
      )}

      <UploadActionBar
        note={
          busy
            ? 'Reading marked-up PDFs…'
            : files.length === 0
              ? 'No marked-up PDFs queued yet'
              : `${files.length} file${files.length === 1 ? '' : 's'} · ~${totalMb.toFixed(1)} MB`
        }
      >
        <UploadGhostButton onClick={onOpenWorkspace} disabled={busy}>
          Use project PDFs
        </UploadGhostButton>
        <UploadPrimaryButton
          disabled={busy || files.length === 0}
          onClick={() => onPackageSubmitted(files, mode)}
        >
          Open Redline workspace
        </UploadPrimaryButton>
      </UploadActionBar>
    </UploadShell>
  );
};

export default RedlineInput;
