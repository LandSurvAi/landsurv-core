

import React, { useState, useCallback } from 'react';
import { BrainCircuitIcon } from './icons.tsx';
import { UploadShell, UploadPanel, UploadDropzone, UploadGhostButton } from './UploadShell.tsx';
import { exampleFileContent, exampleFileName } from '../assets/example.raw.ts';
import { useErrorReporter } from '../contexts/AppStateContext';

interface FileUploadProps {
  onFileUploaded: (content: string, fileName:string) => void;
  onGoBack: () => void;
  backButtonTitle?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileUploaded, onGoBack, backButtonTitle = 'Go to Home Screen' }) => {
  const [isDragging, setIsDragging] = useState(false);
  const { reportError } = useErrorReporter();

  const handleFile = useCallback((file: File) => {
    const extension = file.name.toLowerCase().split('.').pop();
    if (file && (['rw5', 'raw', 'txt', 'fbk', 'gsi'].includes(extension ?? '') || file.type === 'text/plain')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        onFileUploaded(content, file.name);
      };
      reader.readAsText(file);
    } else {
      reportError({ title: 'Invalid file', message: 'Please upload a valid .RW5, .RAW, .FBK, .GSI or text file.' });
    }
  }, [onFileUploaded, reportError]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  }, [handleFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const handleClick = () => {
    document.getElementById('file-input')?.click();
  };

  const handleLoadExample = useCallback(() => {
    onFileUploaded(exampleFileContent, exampleFileName);
  }, [onFileUploaded]);

  return (
    <UploadShell
      icon={BrainCircuitIcon}
      accent="#22d3ee"
      title="Raw Replay"
      description="Open a raw field survey and replay the observation sequence in 3D. Raw Replay reads the file read-only and produces a deterministic field summary — no AI inference, no coordinate adjustment."
      onGoBack={onGoBack}
      backTitle={backButtonTitle}
    >
      <UploadPanel>
        <UploadDropzone
          id="file-input"
          accept=".rw5,.raw,.txt,.fbk,.gsi,text/plain"
          onFiles={(selected) => {
            const file = selected?.[0];
            if (file) handleFile(file);
          }}
          onDrop={handleDrop}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          isDragging={isDragging}
          title="Drop your raw survey file here"
          hint="RW5 · TDS / Survey Pro · legacy RAW · GSI · TXT"
        />
      </UploadPanel>

      <div className="flex justify-center">
        <UploadGhostButton onClick={handleLoadExample}>Load an example raw file</UploadGhostButton>
      </div>
    </UploadShell>
  );
};

export default FileUpload;