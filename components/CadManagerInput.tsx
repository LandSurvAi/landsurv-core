
import React, { useState, useCallback } from 'react';
import { LayersIcon } from './icons';
import { UploadShell, UploadPanel, UploadDropzone, UploadPrimaryButton, UploadActionBar } from './UploadShell.tsx';
import { useErrorReporter } from '../contexts/AppStateContext';

interface CadManagerInputProps {
  onSessionStart: () => void;
  onGoBack: () => void;
  onFileUploaded?: (content: string, fileName: string) => void;
}

const CadManagerInput: React.FC<CadManagerInputProps> = ({ onSessionStart, onGoBack, onFileUploaded }) => {
  const [isDragging, setIsDragging] = useState(false);
  const { reportError } = useErrorReporter();

  const handleFile = useCallback((file: File) => {
    if (!onFileUploaded) {
      // If no upload handler, just start a new session
      onSessionStart();
      return;
    }
    
    const fileName = file.name.toLowerCase();
    // Accept layer files (.lay), description key files (.dsc), linetype files (.lin), JSON/MD/CSV/TXT/XML/FXL/FCL config files
    if (
      fileName.endsWith('.lay') ||
      fileName.endsWith('.dsc') ||
      fileName.endsWith('.lin') ||
      fileName.endsWith('.json') ||
      fileName.endsWith('.md') ||
      fileName.endsWith('.markdown') ||
      fileName.endsWith('.csv') ||
      fileName.endsWith('.txt') ||
      fileName.endsWith('.xml') ||
      fileName.endsWith('.fxl') ||
      fileName.endsWith('.fcl')
    ) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        onFileUploaded(content, file.name);
      };
      reader.readAsText(file);
    } else {
      reportError({ title: 'Invalid file', message: 'Please upload a CAD standards file (.lay, .dsc, .lin, .json, .md, .csv, .txt, .xml, .fxl, or .fcl)' });
    }
  }, [onFileUploaded, onSessionStart, reportError]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  }, [handleFile]);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files.length > 0) { handleFile(e.target.files[0]); } };
  const handleClick = () => { document.getElementById('cad-manager-file-input')?.click(); };

  return (
    <UploadShell
      icon={LayersIcon}
      accent="#818cf8"
      title="CAD Manager"
      description="Load an existing standards file or start clean — then author layers, description keys, and linetypes with the agent."
      onGoBack={onGoBack}
      backTitle="Go to Home Screen"
    >
      <UploadPanel>
        <UploadDropzone
          id="cad-manager-file-input"
          accept=".lay,.dsc,.lin,.json,.md,.markdown,.csv,.txt,.xml,.fxl,.fcl"
          onFiles={(selected) => {
            const file = selected?.[0];
            if (file) handleFile(file);
          }}
          onDrop={handleDrop}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          isDragging={isDragging}
          title="Drop your standards file here"
          hint=".lay · .dsc · .lin · .json · .md · .csv · .fxl · .fcl"
          icon={LayersIcon}
        />
      </UploadPanel>

      <UploadActionBar note="Nothing to import? Start from an empty standard set.">
        <UploadPrimaryButton onClick={onSessionStart}>
          <LayersIcon className="h-3.5 w-3.5" />
          Start new standards session
        </UploadPrimaryButton>
      </UploadActionBar>
    </UploadShell>
  );
};

export default CadManagerInput;
