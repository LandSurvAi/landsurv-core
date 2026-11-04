

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
    if (file && (file.name.toLowerCase().endsWith('.raw') || file.type === 'text/plain')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        onFileUploaded(content, file.name);
      };
      reader.readAsText(file);
    } else {
      reportError({ title: 'Invalid file', message: 'Please upload a valid .RAW or text file.' });
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
      title="RAW Crawler"
      description="Upload a surveyor's .RAW file and interrogate it in plain language — the agent parses codes, shots, and geometry for you."
      onGoBack={onGoBack}
      backTitle={backButtonTitle}
    >
      <UploadPanel>
        <UploadDropzone
          id="file-input"
          accept=".raw,text/plain"
          onFiles={(selected) => {
            const file = selected?.[0];
            if (file) handleFile(file);
          }}
          onDrop={handleDrop}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          isDragging={isDragging}
          title="Drop your .RAW file here"
          hint="or click to browse local files"
        />
      </UploadPanel>

      <div className="flex justify-center">
        <UploadGhostButton onClick={handleLoadExample}>Load an example .RAW file</UploadGhostButton>
      </div>
    </UploadShell>
  );
};

export default FileUpload;