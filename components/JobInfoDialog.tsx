import React, { useState, useEffect } from 'react';
import { type JobInfo } from '../types.ts';
import { XMarkIcon } from './icons.tsx';

interface JobInfoDialogProps {
  jobInfo: JobInfo;
  onSave: (next: JobInfo) => void;
  onClose: () => void;
}

/**
 * JobInfoDialog — central project metadata editor.
 * Any agent that needs project context (client, site, scope, zoning, etc.)
 * should read from the shared `jobInfo` state populated here.
 */
const JobInfoDialog: React.FC<JobInfoDialogProps> = ({ jobInfo, onSave, onClose }) => {
  const [draft, setDraft] = useState<JobInfo>(jobInfo);

  useEffect(() => { setDraft(jobInfo); }, [jobInfo]);

  const update = <K extends keyof JobInfo>(key: K, value: JobInfo[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  const inputCls =
    'w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm text-gray-100 ' +
    'focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ' +
    'light-theme:bg-white light-theme:text-gray-900 light-theme:border-gray-300';
  const labelCls =
    'block text-xs font-medium text-gray-400 mb-1 light-theme:text-gray-600';

  return (
    <div
      className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 border border-teal-700 rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col animate-modal-panel-fade-in-down light-theme:bg-white light-theme:border-gray-300"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700 light-theme:border-gray-300">
          <h2 className="text-xl font-bold text-teal-400">Job Info</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-700 light-theme:hover:bg-gray-200"
            aria-label="Close"
          >
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </header>

        <main className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Job Name</label>
              <input
                type="text"
                className={inputCls}
                value={draft.jobName ?? ''}
                onChange={e => update('jobName', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Job No.</label>
              <input
                type="text"
                className={inputCls}
                value={draft.jobNo ?? ''}
                onChange={e => update('jobNo', e.target.value)}
              />
            </div>
          </div>

          <hr className="border-gray-700 light-theme:border-gray-300" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Client Name</label>
              <input
                type="text"
                className={inputCls}
                value={draft.clientName ?? ''}
                onChange={e => update('clientName', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Client Phone</label>
              <input
                type="tel"
                className={inputCls}
                value={draft.clientPhone ?? ''}
                onChange={e => update('clientPhone', e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Client Address</label>
              <input
                type="text"
                className={inputCls}
                value={draft.clientAddress ?? ''}
                onChange={e => update('clientAddress', e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Client Email</label>
              <input
                type="email"
                className={inputCls}
                value={draft.clientEmail ?? ''}
                onChange={e => update('clientEmail', e.target.value)}
              />
            </div>
          </div>

          <hr className="border-gray-700 light-theme:border-gray-300" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className={labelCls}>Site Address</label>
              <input
                type="text"
                className={inputCls}
                value={draft.siteAddress ?? ''}
                onChange={e => update('siteAddress', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Site Municipality</label>
              <input
                type="text"
                className={inputCls}
                value={draft.siteMunicipality ?? ''}
                onChange={e => update('siteMunicipality', e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Zoning District</label>
              <input
                type="text"
                className={inputCls}
                value={draft.zoningDistrict ?? ''}
                onChange={e => update('zoningDistrict', e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Desired Use</label>
              <input
                type="text"
                className={inputCls}
                value={draft.desiredUse ?? ''}
                onChange={e => update('desiredUse', e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Job Scope</label>
              <textarea
                rows={3}
                className={inputCls}
                value={draft.jobScope ?? ''}
                onChange={e => update('jobScope', e.target.value)}
              />
            </div>
          </div>

          <hr className="border-gray-700 light-theme:border-gray-300" />

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-300 light-theme:text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-teal-500"
                checked={!!draft.topo}
                onChange={e => update('topo', e.target.checked)}
              />
              Topo
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300 light-theme:text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-teal-500"
                checked={!!draft.stakeout}
                onChange={e => update('stakeout', e.target.checked)}
              />
              Stakeout
            </label>
          </div>
        </main>

        <footer className="flex items-center justify-end gap-2 p-4 border-t border-gray-700 light-theme:border-gray-300">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-700 light-theme:text-gray-700 light-theme:hover:bg-gray-200"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-md text-sm font-semibold bg-teal-600 hover:bg-teal-500 text-white"
            type="button"
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
};

export default JobInfoDialog;
