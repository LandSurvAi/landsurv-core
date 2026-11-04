import React, { useState, useCallback } from 'react';
import { CameraIcon } from './icons';
import { UploadShell, UploadPanel, UploadDropzone, UploadPrimaryButton, UploadActionBar, UploadFileList } from './UploadShell.tsx';
import { type SessionFile } from '../types';
import { useAppState } from '../contexts/AppStateContext.tsx';

interface ImageInputProps {
  onImagesSubmitted: (files: SessionFile[]) => void;
  onGoBack: () => void;
  backButtonTitle?: string;
}

const ImageInput: React.FC<ImageInputProps> = ({ onImagesSubmitted, onGoBack, backButtonTitle = 'Go to Home Screen' }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const { addNotification } = useAppState();

  const notifyError = useCallback((message: string) => {
    addNotification({ kind: 'image-input', severity: 'error', title: 'Image Analyzer', message });
  }, [addNotification]);

  const handleFiles = useCallback((selectedFiles: FileList | null) => {
    if (selectedFiles) {
      const imageFiles = Array.from(selectedFiles).filter(file => file.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        setFiles(prev => [...prev, ...imageFiles]);
      } else {
        notifyError('Only image files (jpg, png, webp, etc.) are accepted.');
      }
    }
  }, [notifyError]);

  const processFiles = useCallback(async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setProgress('Initializing...');

    const processedFiles: SessionFile[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Processing ${file.name} (${i + 1}/${files.length})...`);
        
        const fileDataPromise = new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target?.result as string);
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(file);
        });
        const fileData = await fileDataPromise;
        
        // For images, content can be empty, as the fileData is the primary payload for the AI
        processedFiles.push({ name: file.name, content: `Image file: ${file.name}`, fileData: fileData });
      }
      onImagesSubmitted(processedFiles);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      notifyError(`Failed to process files: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  }, [files, notifyError, onImagesSubmitted]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); handleFiles(e.dataTransfer.files); }, []);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { handleFiles(e.target.files); };
  const handleClick = () => { document.getElementById('image-file-input')?.click(); };

  return (
    <UploadShell
      icon={CameraIcon}
      accent="#f87171"
      title="Image Analyzer"
      description="Drop site photos and let the agent tag, analyze, and tie them back to your project data."
      onGoBack={onGoBack}
      backTitle={backButtonTitle}
    >
      <UploadPanel>
        <UploadDropzone
          id="image-file-input"
          accept="image/*"
          multiple
          onFiles={(selected) => handleFiles(selected)}
          onDrop={handleDrop}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          isDragging={isDragging}
          title="Drop image files here"
          hint="or click to browse · JPG, PNG, WebP, and other raster formats"
        />

        <div className="mt-3">
          <UploadFileList
            files={files.map((file, index) => ({ key: `${file.name}-${index}`, name: file.name }))}
            title="Queued images"
          />
        </div>
      </UploadPanel>

      {isProcessing ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2.5">
          <span className="h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border-2 border-red-300 border-t-transparent" />
          <span className="min-w-0 truncate font-mono text-[11px] text-slate-400">{progress || 'Processing…'}</span>
        </div>
      ) : (
        <UploadActionBar note={files.length === 0 ? 'No images queued yet' : `${files.length} image${files.length === 1 ? '' : 's'} queued`}>
          <UploadPrimaryButton onClick={processFiles} disabled={files.length === 0}>
            Process {files.length} image{files.length !== 1 && 's'}
          </UploadPrimaryButton>
        </UploadActionBar>
      )}
    </UploadShell>
  );
};

export default ImageInput;