
import React, { useState, useCallback } from 'react';
import { PlumbBobIcon } from './icons.tsx';
import { UploadShell, UploadPanel, UploadDropzone } from './UploadShell.tsx';
import { type SurveyPoint } from '../types.ts';
import { useErrorReporter } from '../contexts/AppStateContext';

interface PointFileInputProps {
  onPointsUploaded: (points: SurveyPoint[], fileName: string) => void;
  onGoBack: () => void;
}

const parsePointFile = (content: string): SurveyPoint[] => {
    const points: SurveyPoint[] = [];
    const lines = content.trim().split('\n');
    
    for (const line of lines) {
        const cleanedLine = line.trim();
        if (!cleanedLine || /^[a-zA-Z#]/.test(cleanedLine)) continue; // skip empty lines and headers

        const parts = cleanedLine.split(/[,\s]+/).filter(Boolean);
        if (parts.length < 3) continue;

        const pn = parts[0];
        const n = parseFloat(parts[1]);
        const e = parseFloat(parts[2]);
        const z = parts.length > 3 ? parseFloat(parts[3]) : 0;
        const d = parts.length > 4 ? parts.slice(4).join(' ') : '';

        if (pn && !isNaN(n) && !isNaN(e)) {
            points.push({
                pointNumber: pn,
                northing: n,
                easting: e,
                elevation: isNaN(z) ? 0 : z,
                description: d
            });
        }
    }
    return points;
};


const PointFileInput: React.FC<PointFileInputProps> = ({ onPointsUploaded, onGoBack }) => {
  const [isDragging, setIsDragging] = useState(false);
  const { reportError } = useErrorReporter();

  const handleFile = useCallback((file: File) => {
    if (file && (file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.txt') || file.type === 'text/plain' || file.type === 'text/csv')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const parsedPoints = parsePointFile(content);
        if (parsedPoints.length > 0) {
            onPointsUploaded(parsedPoints, file.name);
        } else {
            reportError({ title: 'Import failed', message: 'Could not parse any points from the file. Please check the format (P,N,E,Z,D).' });
        }
      };
      reader.readAsText(file);
    } else {
      reportError({ title: 'Invalid file', message: 'Please upload a valid .csv or .txt file.' });
    }
  }, [onPointsUploaded, reportError]);

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
  const handleClick = () => { document.getElementById('point-file-input')?.click(); };

  return (
    <UploadShell
      icon={PlumbBobIcon}
      accent="#facc15"
      title="Add Points"
      description="Upload a point file (.csv or .txt) to add it to the current session. Expected format: Point, Northing, Easting, Elevation, Description."
      onGoBack={onGoBack}
      backTitle="Cancel"
    >
      <UploadPanel>
        <UploadDropzone
          id="point-file-input"
          accept=".csv,.txt,text/plain,text/csv"
          onFiles={(selected) => {
            const file = selected?.[0];
            if (file) handleFile(file);
          }}
          onDrop={handleDrop}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          isDragging={isDragging}
          title="Drop your point file here"
          hint="or click to browse"
        />
      </UploadPanel>
    </UploadShell>
  );
};

export default PointFileInput;
