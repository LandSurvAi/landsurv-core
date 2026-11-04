
import React, { useState, useCallback } from 'react';
import { RoadIcon } from './icons';
import { UploadShell, UploadPanel, UploadDropzone, UploadPrimaryButton, UploadGhostButton } from './UploadShell.tsx';
import { exampleHighwayCl } from '../assets/example.highway.cl';
import { useErrorReporter } from '../contexts/AppStateContext';


interface CenterlineInputProps {
  onSessionStart: () => void;
  onClFileUploaded: (content: string, fileName: string) => void;
  onGoBack: () => void;
  backButtonTitle?: string;
}

const CenterlineInput: React.FC<CenterlineInputProps> = ({ onSessionStart, onClFileUploaded, onGoBack, backButtonTitle = 'Go to Home Screen' }) => {
  const [isDragging, setIsDragging] = useState(false);
  const { reportError } = useErrorReporter();
  
  const handleFile = useCallback((file: File) => {
    if (file && (file.name.toLowerCase().endsWith('.cl') || file.type === 'text/plain')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        onClFileUploaded(content, file.name);
      };
      reader.readAsText(file);
    } else {
      reportError({ title: 'Invalid file', message: 'Please upload a valid .cl or text file.' });
    }
  }, [onClFileUploaded, reportError]);

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
    document.getElementById('cl-file-input')?.click();
  };


  return (
    <UploadShell
      icon={RoadIcon}
      accent="#c084fc"
      title="Stationing"
      accentWord=" & CL"
      description="Upload a .cl alignment or start a blank centerline, then let the agent work stations, curves, and offsets."
      onGoBack={onGoBack}
      backTitle={backButtonTitle}
    >
      <UploadPanel>
        <UploadDropzone
          id="cl-file-input"
          accept=".cl,text/plain"
          onFiles={(selected) => {
            const file = selected?.[0];
            if (file) handleFile(file);
          }}
          onDrop={handleDrop}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          isDragging={isDragging}
          title="Drop your .cl file here"
          hint="or click to browse local files"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] pt-3">
          <UploadGhostButton onClick={() => onClFileUploaded(exampleHighwayCl, 'example.highway.cl')}>
            Load 1.5-mile highway example
          </UploadGhostButton>
          <UploadPrimaryButton onClick={onSessionStart}>Start a blank centerline</UploadPrimaryButton>
        </div>
      </UploadPanel>
    </UploadShell>
  );
};

export default CenterlineInput;