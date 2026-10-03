

import React, { useState, useEffect } from 'react';
import { XMarkIcon, DownloadIcon } from './icons.tsx';
import { type DxfExportOptions } from '../types.ts';

interface DxfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: DxfExportOptions) => void;
  defaultFileName: string;
}

const DxfExportModal: React.FC<DxfExportModalProps> = ({ isOpen, onClose, onExport, defaultFileName }) => {
  // FIX: Changed default file extension from .docx to .dxf to match the export format.
  const [fileName, setFileName] = useState(`${defaultFileName}.dxf`);
  const [includePoints, setIncludePoints] = useState(true);
  const [includeLines, setIncludeLines] = useState(true);
  const [includeCenterlines, setIncludeCenterlines] = useState(true);
  const [pointScale, setPointScale] = useState(1);
  const [steepSlopeFillStyle, setSteepSlopeFillStyle] = useState<'solid' | 'hatch' | 'native-hatch'>('solid');

  useEffect(() => {
    // FIX: Changed default file extension from .docx to .dxf to match the export format.
    setFileName(`${defaultFileName}.dxf`);
  }, [defaultFileName]);

  if (!isOpen) return null;

  const handleExportClick = () => {
    // Ensure the filename has the .dxf extension
    let finalFileName = fileName.trim();
    if (!finalFileName.toLowerCase().endsWith('.dxf')) {
      finalFileName += '.dxf';
    }
    
    onExport({
      fileName: finalFileName,
      includePoints,
      includeLines,
      includeCenterlines,
      pointScale,
      steepSlopeFillStyle,
    });
  };

  const Checkbox = ({ id, label, checked, onChange }: { id: string, label: string, checked: boolean, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) => (
    <label htmlFor={id} className="flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={onChange}
        className="h-5 w-5 rounded bg-gray-800 border-gray-600 text-cyan-500 focus:ring-cyan-500"
      />
      <span className="font-medium text-gray-200">{label}</span>
    </label>
  );

  return (
    <div 
      className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl max-w-md w-full flex flex-col animate-modal-panel-fade-in-down"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-cyan-400 flex items-center gap-2"><DownloadIcon className="w-6 h-6"/> Export Options</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700" aria-label="Close">
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </header>
        <main className="p-6 space-y-6">
          <div>
            <label htmlFor="fileName" className="block text-sm font-medium text-gray-400 mb-1">File Name</label>
            <input
              type="text"
              id="fileName"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="Enter filename (e.g., 'my_survey')"
            />
            <p className="text-xs text-gray-500 mt-1">.dxf extension will be added automatically</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">Include in Export:</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Checkbox id="includePoints" label="Points" checked={includePoints} onChange={(e) => setIncludePoints(e.target.checked)} />
              <Checkbox id="includeLines" label="Lines" checked={includeLines} onChange={(e) => setIncludeLines(e.target.checked)} />
              <Checkbox id="includeCenterlines" label="Centerlines" checked={includeCenterlines} onChange={(e) => setIncludeCenterlines(e.target.checked)} />
            </div>
          </div>
          <div>
            <label htmlFor="pointScale" className="block text-sm font-medium text-gray-400 mb-1">Point &amp; Label Scale</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                id="pointScale"
                min="0.5"
                max="5"
                step="0.1"
                value={pointScale}
                onChange={(e) => setPointScale(parseFloat(e.target.value))}
                className="w-full accent-cyan-500"
              />
              <span className="font-mono bg-gray-700 text-gray-200 px-3 py-1 rounded-md text-sm">{pointScale.toFixed(1)}x</span>
            </div>
          </div>

          <div>
            <label htmlFor="steepSlopeFillStyle" className="block text-sm font-medium text-gray-400 mb-1">Steep Slope Fill Export</label>
            <select
              id="steepSlopeFillStyle"
              value={steepSlopeFillStyle}
              onChange={(e) => setSteepSlopeFillStyle(e.target.value as 'solid' | 'hatch' | 'native-hatch')}
              className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="solid">SOLID entities</option>
              <option value="hatch">Hatch line pattern</option>
              <option value="native-hatch">Native HATCH entity</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Applies to steep-slope filled triangles in DXF export.</p>
          </div>
        </main>
        <footer className="p-4 bg-gray-700/50 flex justify-end gap-3 rounded-b-lg">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold bg-gray-600 hover:bg-gray-500 text-white rounded-md">Cancel</button>
          <button onClick={handleExportClick} className="px-4 py-2 text-sm font-semibold bg-cyan-600 hover:bg-cyan-700 text-white rounded-md">Export</button>
        </footer>
      </div>
    </div>
  );
};

export default DxfExportModal;
