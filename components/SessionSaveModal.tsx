import React, { useEffect, useMemo, useState } from 'react';
import { DownloadIcon, XMarkIcon } from './icons.tsx';
import { AgentType, type SessionSaveOptions } from '../types.ts';
import { generateSessionFileName } from '../utils/sessionZip.ts';

interface SessionSaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (options: SessionSaveOptions) => void;
  defaultFileName: string;
  defaultAuthor?: string;
  jobName?: string;
  jobNumber?: string;
  activeAgent: AgentType;
  associatedFiles: (string | undefined)[];
}

const defaultOptionsFromProps = (
  defaultFileName: string,
  defaultAuthor: string | undefined,
  jobNumber: string | undefined,
  activeAgent: AgentType
): SessionSaveOptions => ({
  fileName: defaultFileName,
  author: defaultAuthor || '',
  note: '',
  includeTimestampInName: true,
  includeJobNumberInName: Boolean(jobNumber),
  includeActiveAgentInName: false,
  includeAuthorInName: false,
  jobNumber,
  activeAgent,
});

const SessionSaveModal: React.FC<SessionSaveModalProps> = ({
  isOpen,
  onClose,
  onSave,
  defaultFileName,
  defaultAuthor,
  jobName,
  jobNumber,
  activeAgent,
  associatedFiles,
}) => {
  const [options, setOptions] = useState<SessionSaveOptions>(() => defaultOptionsFromProps(defaultFileName, defaultAuthor, jobNumber, activeAgent));

  useEffect(() => {
    if (!isOpen) return;
    setOptions(defaultOptionsFromProps(defaultFileName, defaultAuthor, jobNumber, activeAgent));
  }, [isOpen, defaultFileName, defaultAuthor, jobNumber, activeAgent]);

  const previewFileName = useMemo(() => {
    return generateSessionFileName(jobName, associatedFiles, {
      ...options,
      jobNumber,
      activeAgent,
      savedAt: new Date().toISOString(),
    });
  }, [jobName, associatedFiles, options, jobNumber, activeAgent]);

  if (!isOpen) return null;

  const toggleOption = (key: keyof SessionSaveOptions) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveClick = () => {
    onSave({
      ...options,
      jobNumber,
      activeAgent,
    });
  };

  const Checkbox = ({ id, label, description, checked, onChange }: { id: string; label: string; description: string; checked: boolean; onChange: () => void; }) => (
    <label htmlFor={id} className="flex items-start gap-3 p-3 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-5 w-5 rounded bg-gray-800 border-gray-600 text-cyan-500 focus:ring-cyan-500"
      />
      <span>
        <span className="block font-medium text-gray-200">{label}</span>
        <span className="block text-xs text-gray-400 mt-1">{description}</span>
      </span>
    </label>
  );

  return (
    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl max-w-2xl w-full flex flex-col animate-modal-panel-fade-in-down max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-cyan-400 flex items-center gap-2"><DownloadIcon className="w-6 h-6" /> Save Session</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700" aria-label="Close">
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </header>
        <main className="p-6 space-y-6 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="session-save-file-name" className="block text-sm font-medium text-gray-400 mb-1">File Name</label>
              <input
                id="session-save-file-name"
                type="text"
                value={options.fileName || ''}
                onChange={(e) => setOptions(prev => ({ ...prev, fileName: e.target.value }))}
                className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="Project deliverable"
              />
              <p className="text-xs text-gray-500 mt-1">The .lsvz extension is added automatically.</p>
            </div>
            <div>
              <label htmlFor="session-save-author" className="block text-sm font-medium text-gray-400 mb-1">Author</label>
              <input
                id="session-save-author"
                type="text"
                value={options.author || ''}
                onChange={(e) => setOptions(prev => ({ ...prev, author: e.target.value }))}
                className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="Crew chief, PM, or drafter"
              />
              <p className="text-xs text-gray-500 mt-1">Saved into the session manifest for traceability.</p>
            </div>
          </div>

          <div>
            <label htmlFor="session-save-note" className="block text-sm font-medium text-gray-400 mb-1">Save Note</label>
            <textarea
              id="session-save-note"
              value={options.note || ''}
              onChange={(e) => setOptions(prev => ({ ...prev, note: e.target.value }))}
              className="w-full min-h-28 bg-gray-700 border border-gray-600 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="Example: 60% review package with updated control, parcels, and contour labels."
            />
            <p className="text-xs text-gray-500 mt-1">Use this for revision notes, deliverable stage, or handoff context.</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2">File Name Options</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Checkbox
                id="session-save-timestamp"
                label="Include timestamp"
                description="Adds a sortable YYYYMMDD_HHMMSS suffix for versioned saves."
                checked={Boolean(options.includeTimestampInName)}
                onChange={() => toggleOption('includeTimestampInName')}
              />
              <Checkbox
                id="session-save-job-number"
                label="Include job number"
                description="Appends the current project number when one is available."
                checked={Boolean(options.includeJobNumberInName)}
                onChange={() => toggleOption('includeJobNumberInName')}
              />
              <Checkbox
                id="session-save-agent"
                label="Include active agent"
                description="Useful when saving from a specialized workflow such as CAD Manager or Boundary Agent."
                checked={Boolean(options.includeActiveAgentInName)}
                onChange={() => toggleOption('includeActiveAgentInName')}
              />
              <Checkbox
                id="session-save-author-name"
                label="Include author"
                description="Adds the author field to the file name for team handoffs."
                checked={Boolean(options.includeAuthorInName)}
                onChange={() => toggleOption('includeAuthorInName')}
              />
            </div>
          </div>

          <div className="rounded-lg border border-cyan-700/50 bg-cyan-950/30 p-4">
            <p className="text-xs uppercase tracking-wide text-cyan-300 font-semibold">Preview</p>
            <p className="mt-2 font-mono text-sm text-cyan-100 break-all">{previewFileName}</p>
            <p className="mt-2 text-xs text-cyan-200/80">Manifest metadata will include the save timestamp automatically, plus your note and author when provided.</p>
          </div>
        </main>
        <footer className="p-4 bg-gray-700/50 flex justify-end gap-3 rounded-b-lg">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold bg-gray-600 hover:bg-gray-500 text-white rounded-md">Cancel</button>
          <button onClick={handleSaveClick} className="px-4 py-2 text-sm font-semibold bg-cyan-600 hover:bg-cyan-700 text-white rounded-md">Save .lsvz</button>
        </footer>
      </div>
    </div>
  );
};

export default SessionSaveModal;
