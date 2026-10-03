/**
 * ProfileGenerationPanel (v26.05.19.4)
 *
 * A floating, direct-UI panel for the Profile & Cross Section Agent.
 * Generates elevation profiles 100% client-side — no AI round-trip needed.
 *
 * Supported profile types:
 *   • Line profile   — from-point to to-point (by point number)
 *   • Quick section  — perpendicular at a single point, given half-width
 *
 * The panel calls the `onGenerateProfile` callback which invokes
 * `generateProfile()` from utils/contouring.ts in the parent and
 * then calls `showView('profile')`.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { SurveyPoint, Centerline } from '../types.ts';

// ── Props ──────────────────────────────────────────────────────────────────────

export interface ProfileGenerateParams {
  type: 'line';
  fromPointNumber: string;
  toPointNumber: string;
  name?: string;
}

interface ProfileGenerationPanelProps {
  /** All survey points in the current session (all point lists merged). */
  allPoints: SurveyPoint[];
  /** Currently generated profile stats (for the summary badge). */
  profilePointCount?: number;
  profileElevMin?: number;
  profileElevMax?: number;
  profileLength?: number;
  profileName?: string;
  /** Whether a profile is currently being computed. */
  isGenerating?: boolean;
  /** Called when the user presses Generate — compute and set profileData in parent. */
  onGenerateProfile: (params: ProfileGenerateParams) => void;
  /** Called to switch to the profile view. */
  onViewProfile: () => void;
  /** Called to export the current profile as CSV. */
  onSaveProfile?: () => void;
  /** Close button. */
  onClose: () => void;
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export const ProfileGenerationPanel: React.FC<ProfileGenerationPanelProps> = ({
  allPoints,
  profilePointCount = 0,
  profileElevMin,
  profileElevMax,
  profileLength,
  profileName,
  isGenerating = false,
  onGenerateProfile,
  onViewProfile,
  onSaveProfile,
  onClose,
}) => {
  // Position + drag
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [pos, setPos] = useState(() => ({
    x: typeof window !== 'undefined' ? Math.max(20, window.innerWidth - 380) : 20,
    y: 180,
  }));
  const [collapsed, setCollapsed] = useState(false);

  // Form state
  const [fromPt, setFromPt] = useState('');
  const [toPt, setToPt] = useState('');
  const [profileNameInput, setProfileNameInput] = useState('');

  // Drag handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button,input,select,textarea')) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    const onMove = (mv: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: dragRef.current.origX + mv.clientX - dragRef.current.startX,
        y: dragRef.current.origY + mv.clientY - dragRef.current.startY,
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos]);

  // Point number autocomplete list
  const pointNumbers = allPoints
    .filter(p => p.layer !== 'FEMA-NSI')
    .map(p => p.pointNumber)
    .sort((a, b) => {
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb;
    });

  const canGenerate =
    !isGenerating &&
    fromPt.trim().length > 0 &&
    toPt.trim().length > 0 &&
    fromPt.trim() !== toPt.trim();

  const handleGenerate = () => {
    if (!canGenerate) return;
    const name =
      profileNameInput.trim() ||
      `Line ${fromPt.trim()}-${toPt.trim()}`;
    onGenerateProfile({
      type: 'line',
      fromPointNumber: fromPt.trim(),
      toPointNumber: toPt.trim(),
      name,
    });
  };

  const hasProfile = profilePointCount > 0;

  return (
    <div
      ref={panelRef}
      style={{ left: pos.x, top: pos.y, position: 'fixed', zIndex: 1550 }}
      className="w-80 bg-gray-950 border border-sky-500/40 rounded-xl shadow-2xl shadow-sky-900/30 flex flex-col overflow-hidden select-none"
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-sky-900/30 border-b border-sky-700/40 cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
      >
        <svg className="w-4 h-4 text-sky-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 20l4-8 4 4 4-6 4 10" />
        </svg>
        <span className="text-xs font-bold text-sky-300 uppercase tracking-wide flex-1">Profile Generator</span>
        <button
          type="button"
          onClick={() => setCollapsed(v => !v)}
          className="p-0.5 text-sky-400 hover:text-sky-200"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            {collapsed
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            }
          </svg>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 text-sky-400 hover:text-red-400"
          title="Close"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-3">
          {/* From / To */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 mb-0.5 uppercase tracking-wide">
                  From Point
                </label>
                <input
                  type="text"
                  list="profile-pt-list"
                  value={fromPt}
                  onChange={e => setFromPt(e.target.value)}
                  placeholder="e.g. 1"
                  className="w-full px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-gray-100 focus:border-sky-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 mb-0.5 uppercase tracking-wide">
                  To Point
                </label>
                <input
                  type="text"
                  list="profile-pt-list"
                  value={toPt}
                  onChange={e => setToPt(e.target.value)}
                  placeholder="e.g. 12"
                  className="w-full px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-gray-100 focus:border-sky-400 focus:outline-none"
                />
              </div>
            </div>
            <datalist id="profile-pt-list">
              {pointNumbers.map(n => <option key={n} value={n} />)}
            </datalist>
          </div>

          {/* Optional name */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 mb-0.5 uppercase tracking-wide">
              Profile Name (optional)
            </label>
            <input
              type="text"
              value={profileNameInput}
              onChange={e => setProfileNameInput(e.target.value)}
              placeholder={`Line ${fromPt || '?'}-${toPt || '?'}`}
              className="w-full px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-gray-100 focus:border-sky-400 focus:outline-none"
            />
          </div>

          {/* Point count hint */}
          <p className="text-[10px] text-gray-500">
            {pointNumbers.length} survey points available.
            Points within 5&apos; of the profile line are included.
          </p>

          {/* Generate button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full py-2 px-4 font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-500 transition-colors disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-sm"
          >
            {isGenerating ? 'Generating\u2026' : '\u25B6 Generate Profile'}
          </button>

          {/* Result summary */}
          {hasProfile && (
            <div className="bg-gray-900/60 border border-sky-500/20 rounded-md p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-sky-300">{profileName ?? 'Profile'}</span>
                <span className="text-[10px] text-gray-400">{profilePointCount} pts</span>
              </div>
              {profileLength != null && (
                <div className="text-[11px] text-gray-400">
                  Length: <span className="text-sky-200 font-mono">{profileLength.toFixed(2)}&apos;</span>
                </div>
              )}
              {profileElevMin != null && profileElevMax != null && (
                <div className="text-[11px] text-gray-400">
                  Elevation: <span className="text-sky-200 font-mono">{profileElevMin.toFixed(2)}</span>
                  {' \u2013 '}
                  <span className="text-sky-200 font-mono">{profileElevMax.toFixed(2)}</span>
                  <span className="text-gray-500"> ft</span>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onViewProfile}
                  className="flex-1 py-1.5 text-xs font-semibold text-white bg-sky-700 rounded hover:bg-sky-600 transition-colors"
                >
                  View Profile
                </button>
                {onSaveProfile && (
                  <button
                    type="button"
                    onClick={onSaveProfile}
                    className="flex-1 py-1.5 text-xs font-semibold text-white bg-gray-700 rounded hover:bg-gray-600 transition-colors"
                  >
                    Export CSV
                  </button>
                )}
              </div>
            </div>
          )}

          <p className="text-[10px] text-gray-600 border-t border-gray-800 pt-2">
            Computed client-side via TIN surface intersection &#8212; no AI round-trip needed.
            Contour lines on canvas are also sampled for maximum accuracy.
          </p>
        </div>
      )}
    </div>
  );
};

export default ProfileGenerationPanel;
