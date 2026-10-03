
import React, { useState, useCallback } from 'react';
import { TableCellsIcon, UploadIcon, HomeIcon } from './icons.tsx';
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
    <div className="relative flex flex-col items-center justify-center h-full p-8 text-center">
      <button onClick={onGoBack} className="absolute top-4 left-4 p-2 text-gray-300 hover:text-white transition-colors" title="Cancel">
        <HomeIcon className="w-6 h-6"/>
      </button>
       <h1 className="text-5xl sm:text-6xl font-extrabold leading-none tracking-tight text-center mb-4">
          <span className="text-white">Point</span><span className="text-yellow-400">Editor</span><span className="text-[0.5em]"><span className="text-gray-500">.</span><span className="text-white">Land</span><span className="text-cyan-400">Surv</span><span className="text-green-400">.ai</span></span><sup className="text-xl text-gray-500">™</sup>
      </h1>
      <p className="text-gray-300 mb-6 max-w-lg">
        Upload a point file (.csv or .txt) to add points to the current session. The expected format is Point,Northing,Easting,Elevation,Description.
      </p>
      <div
        className={`w-full max-w-lg cursor-pointer flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg transition-colors duration-300 ${isDragging ? 'border-yellow-400 bg-gray-700/50' : 'border-gray-600 hover:border-yellow-500'}`}
        onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop} onClick={handleClick}
        role="button" tabIndex={0} aria-label="Upload a point file"
      >
        <input id="point-file-input" type="file" className="hidden" accept=".csv,.txt,text/plain,text/csv" onChange={handleFileChange} />
        <UploadIcon className="w-16 h-16 mb-4 text-gray-500" />
        <h2 className="text-xl font-semibold text-white">Drop your point file here</h2>
        <p className="text-gray-400 mt-2">or click to browse</p>
      </div>
    </div>
  );
};

export default PointFileInput;
