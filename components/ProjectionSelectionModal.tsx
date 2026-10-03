import React, { useState, useEffect } from 'react';
import { type ProjectionSetting } from '../types.ts';
import { projectionStates, projectionZones } from '../utils/projections.ts';
import { XMarkIcon, GlobeAltIcon } from './icons.tsx';

interface ProjectionSelectionModalProps {
  onConfirm: (projection: ProjectionSetting) => void;
  onClose: () => void;
}

const ProjectionSelectionModal: React.FC<ProjectionSelectionModalProps> = ({ onConfirm, onClose }) => {
  const [state, setState] = useState<string | null>(null);
  const [zone, setZone] = useState<number | null>(null);
  const [availableZones, setAvailableZones] = useState<{ name: string; epsg: number; }[]>([]);

  useEffect(() => {
    if (state) {
      const stateCode = projectionStates.find(s => s.name === state)?.code || '';
      setAvailableZones(projectionZones[stateCode] || []);
      setZone(null); // Reset zone when state changes
    } else {
      setAvailableZones([]);
      setZone(null);
    }
  }, [state]);

  const handleConfirm = () => {
    if (state && zone) {
      const selectedZone = availableZones.find(z => z.epsg === zone);
      if (selectedZone) {
        onConfirm({
          state: state,
          zoneName: selectedZone.name,
          epsg: selectedZone.epsg,
        });
        // Note: onClose is called by parent after projection is processed
      }
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className={`bg-gray-800 border border-teal-700 rounded-lg shadow-2xl max-w-lg w-full flex flex-col animate-modal-panel-fade-in-down light-theme:bg-white light-theme:border-gray-300`}
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700 light-theme:border-gray-300">
          <h2 className="text-xl font-bold text-teal-400 flex items-center gap-2"><GlobeAltIcon className="w-6 h-6"/> Projection Required</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 light-theme:hover:bg-gray-200" aria-label="Close">
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </header>
        <main className="p-6 space-y-4">
          <p className="text-gray-300 light-theme:text-gray-700">A State Plane Coordinate System is required to plot GIS data. Please select a projection for this session.</p>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label htmlFor="state-select-modal" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">State</label>
              <select id="state-select-modal" value={state || ''} onChange={(e) => setState(e.target.value || null)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900">
                <option value="">Select State...</option>
                {projectionStates.map(s => <option key={s.code} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label htmlFor="zone-select-modal" className="block text-sm font-medium text-gray-400 mb-1 light-theme:text-gray-500">Zone</label>
              <select id="zone-select-modal" value={zone ? String(zone) : ''} onChange={(e) => setZone(e.target.value ? parseInt(e.target.value, 10) : null)} disabled={!state} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 light-theme:bg-white light-theme:border-gray-300 light-theme:text-gray-900">
                <option value="">Select Zone...</option>
                {availableZones.map(z => <option key={z.epsg} value={z.epsg}>{z.name}</option>)}
              </select>
            </div>
          </div>
        </main>
        <footer className="p-4 bg-gray-700/50 flex justify-end gap-3 rounded-b-lg light-theme:bg-gray-100/50">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold bg-gray-600 hover:bg-gray-500 text-white rounded-md">Cancel</button>
          <button onClick={handleConfirm} disabled={!state || !zone} className="px-4 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-md disabled:bg-gray-500 disabled:cursor-not-allowed">
            Continue
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ProjectionSelectionModal;
