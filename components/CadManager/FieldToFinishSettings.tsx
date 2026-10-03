/**
 * FieldToFinishSettings Component
 * 
 * Configuration panel for Field-to-Finish processing settings:
 * - Line drafting controls (begin/end/close markers)
 * - Wildcard patterns for code matching
 * - Point label formatting rules
 * - Surface line settings (breaklines, inclusion/exclusion boundaries)
 * - Color/print table (plot styles for AutoCAD colors)
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  FieldToFinishSettings as F2FSettings,
  LineDraftingControls,
  WildcardPattern,
  PointLabelFormatting,
  SurfaceLineSettings,
  ColorPrintTable,
  ColorPrintEntry,
  AUTOCAD_COLORS,
  DEFAULT_F2F_SETTINGS,
  CodeDefinition,
  SymbolLayerSettings,
} from '../../contexts/types/CadManager.types';
import { SymbolLibraryPanel } from './SymbolLibraryPanel';
import { useErrorReporter } from '../../contexts/AppStateContext';

// Debug logging helper - outputs to console in format easy to copy for AutoCAD
const f2fDebug = (category: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const prefix = `[F2F-Debug ${timestamp}] [${category}]`;
  
  if (data !== undefined) {
    console.log(`${prefix} ${message}`, data);
    // Also log as copyable string
    console.log(`${prefix} ${message} => ${JSON.stringify(data, null, 2)}`);
  } else {
    console.log(`${prefix} ${message}`);
  }
};

interface FieldToFinishSettingsProps {
  settings: F2FSettings;
  onSettingsChange: (settings: F2FSettings) => void;
  availableCodes: CodeDefinition[];
  onClose: () => void;
}

type TabType = 'lineDrafting' | 'wildcards' | 'labelFormatting' | 'surfaceLines' | 'colorPrint' | 'symbols';

export const FieldToFinishSettings: React.FC<FieldToFinishSettingsProps> = ({
  settings,
  onSettingsChange,
  availableCodes,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('lineDrafting');
  const { notify } = useErrorReporter();
  // Ensure symbolLayers exists for backward compatibility with old saved settings
  const settingsWithSymbols: F2FSettings = {
    ...settings,
    symbolLayers: settings.symbolLayers || DEFAULT_F2F_SETTINGS.symbolLayers,
  };
  const [localSettings, setLocalSettings] = useState<F2FSettings>(settingsWithSymbols);

  // Log when component mounts with current settings
  useEffect(() => {
    f2fDebug('INIT', '========== F2F SETTINGS OPENED ==========');
    f2fDebug('INIT', 'Current Settings', settings);
    f2fDebug('INIT', 'Available Codes Count', availableCodes.length);
    f2fDebug('LINEDRAFT', 'Line Drafting Controls', settings.lineDrafting);
    f2fDebug('WILDCARD', 'Wildcard Patterns', settings.wildcardPatterns);
    f2fDebug('LABEL', 'Label Formatting', settings.labelFormatting);
    f2fDebug('SURFACE', 'Surface Line Settings', settings.surfaceLines);
    f2fDebug('COLOR', 'Color Print Table', settings.colorPrintTable);
  }, []);

  // Update local settings and propagate up
  const updateSettings = useCallback((updates: Partial<F2FSettings>) => {
    const newSettings = { ...localSettings, ...updates };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
    
    // Log the update
    f2fDebug('UPDATE', 'Settings Updated', updates);
    f2fDebug('UPDATE', 'New Full Settings', newSettings);
  }, [localSettings, onSettingsChange]);

  // Tab button component
  const TabButton: React.FC<{ tab: TabType; label: string; icon: string }> = ({ tab, label, icon }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
        activeTab === tab
          ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/25'
          : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-gray-700 flex flex-col">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-900/50 to-indigo-900/50 p-5 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-2xl">⚙️</span>
                Field-to-Finish Settings
              </h2>
              <p className="text-purple-200 text-sm mt-1">
                Configure line drafting, wildcards, labels, and surface settings
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition p-2 hover:bg-gray-700/50 rounded-lg"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/>
              </svg>
            </button>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-2 mt-4 flex-wrap">
            <TabButton tab="lineDrafting" label="Line Drafting" icon="✏️" />
            <TabButton tab="wildcards" label="Wildcards" icon="🃏" />
            <TabButton tab="labelFormatting" label="Label Format" icon="🏷️" />
            <TabButton tab="surfaceLines" label="Surface Lines" icon="📐" />
            <TabButton tab="symbols" label="Symbols" icon="⭐" />
            <TabButton tab="colorPrint" label="Color/Print" icon="🎨" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'lineDrafting' && (
            <LineDraftingPanel
              controls={localSettings.lineDrafting}
              onChange={(lineDrafting) => updateSettings({ lineDrafting })}
            />
          )}
          {activeTab === 'wildcards' && (
            <WildcardPanel
              patterns={localSettings.wildcardPatterns}
              onChange={(wildcardPatterns) => updateSettings({ wildcardPatterns })}
            />
          )}
          {activeTab === 'labelFormatting' && (
            <LabelFormattingPanel
              formatting={localSettings.labelFormatting}
              onChange={(labelFormatting) => updateSettings({ labelFormatting })}
            />
          )}
          {activeTab === 'surfaceLines' && (
            <SurfaceLinesPanel
              surfaceLines={localSettings.surfaceLines}
              availableCodes={availableCodes}
              onChange={(surfaceLines) => updateSettings({ surfaceLines })}
            />
          )}
          {activeTab === 'colorPrint' && (
            <ColorPrintPanel
              colorPrintTable={localSettings.colorPrintTable}
              onChange={(colorPrintTable) => updateSettings({ colorPrintTable })}
            />
          )}
          {activeTab === 'symbols' && (
            <SymbolLayersPanel
              symbolLayers={localSettings.symbolLayers}
              availableCodes={availableCodes}
              onChange={(symbolLayers) => updateSettings({ symbolLayers })}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 p-4 bg-gray-800/50 flex justify-between items-center">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setLocalSettings(DEFAULT_F2F_SETTINGS);
                onSettingsChange(DEFAULT_F2F_SETTINGS);
                f2fDebug('RESET', 'Settings reset to defaults', DEFAULT_F2F_SETTINGS);
              }}
              className="px-4 py-2 text-gray-400 hover:text-white transition"
            >
              Reset to Defaults
            </button>
            <button
              onClick={() => {
                // Copy full settings to clipboard for debugging
                const debugInfo = {
                  timestamp: new Date().toISOString(),
                  settings: localSettings,
                  availableCodesCount: availableCodes.length,
                };
                const debugStr = JSON.stringify(debugInfo, null, 2);
                navigator.clipboard.writeText(debugStr).then(() => {
                  f2fDebug('EXPORT', 'Settings copied to clipboard');
                  f2fDebug('EXPORT', 'Full Debug Info', debugInfo);
                  notify({ title: 'Copied', message: 'F2F settings copied to clipboard!\nCheck browser console for details.' });
                });
              }}
              className="px-4 py-2 text-orange-400 hover:text-orange-300 transition flex items-center gap-1"
              title="Copy settings JSON to clipboard for debugging"
            >
              📋 Copy Debug
            </button>
          </div>
          <button
            onClick={() => {
              f2fDebug('CLOSE', 'Settings dialog closed', localSettings);
              onClose();
            }}
            className="px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg font-medium hover:from-cyan-500 hover:to-blue-500 transition shadow-lg shadow-cyan-500/25"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Line Drafting Controls Panel
 */
const LineDraftingPanel: React.FC<{
  controls: LineDraftingControls;
  onChange: (controls: LineDraftingControls) => void;
}> = ({ controls, onChange }) => {
  const updateControl = (field: keyof LineDraftingControls, value: string | boolean) => {
    onChange({ ...controls, [field]: value });
  };

  const ControlInput: React.FC<{
    label: string;
    field: keyof LineDraftingControls;
    placeholder: string;
    description: string;
    icon: string;
  }> = ({ label, field, placeholder, description, icon }) => (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <label className="text-sm font-medium text-gray-200">{label}</label>
      </div>
      <input
        type="text"
        value={(controls[field] as string) || ''}
        onChange={(e) => updateControl(field, e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition font-mono"
      />
      <p className="text-xs text-gray-500 mt-2">{description}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-cyan-900/30 to-blue-900/30 rounded-xl p-4 border border-cyan-700/30">
        <h3 className="text-lg font-semibold text-white mb-2">Line Drafting Controls</h3>
        <p className="text-sm text-gray-300">
          Define the characters or codes that control how linework is drawn when processing field data.
          These can be typed after the code in the field (e.g., "EP B" to begin edge of pavement line).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ControlInput
          label="Begin Line"
          field="beginLine"
          placeholder="B"
          description="Start a new line segment. Common: B, .B, BEGIN, START"
          icon="▶️"
        />
        <ControlInput
          label="End Line"
          field="endLine"
          placeholder="E"
          description="End the current line segment. Common: E, .E, END, STOP"
          icon="⏹️"
        />
        <ControlInput
          label="Close Polygon"
          field="closeLine"
          placeholder="C"
          description="Close the current line to form a polygon. Common: C, .C, CLOSE, CL"
          icon="🔷"
        />
        <ControlInput
          label="Start Curve (PC)"
          field="startCurve"
          placeholder="PC"
          description="Point of Curve - begin curved segment. Common: PC, .PC, CURVE"
          icon="↪️"
        />
        <ControlInput
          label="End Curve (PT)"
          field="endCurve"
          placeholder="PT"
          description="Point of Tangent - end curved segment. Common: PT, .PT, TANG"
          icon="↩️"
        />
      </div>

      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={controls.caseSensitive}
            onChange={(e) => updateControl('caseSensitive', e.target.checked)}
            className="w-5 h-5 rounded border-gray-600 bg-gray-900 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
          />
          <div>
            <span className="text-sm font-medium text-gray-200">Case Sensitive</span>
            <p className="text-xs text-gray-500">If enabled, "B" and "b" are treated differently</p>
          </div>
        </label>
      </div>

      {/* Preview */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <h4 className="text-sm font-medium text-gray-200 mb-3">Example Usage</h4>
        <div className="bg-gray-900 rounded-lg p-3 font-mono text-sm space-y-1">
          <div className="text-gray-400">// Field codes with line control:</div>
          <div><span className="text-cyan-400">EP</span> <span className="text-yellow-400">{controls.beginLine || 'B'}</span> <span className="text-gray-500">← Begin edge of pavement line</span></div>
          <div><span className="text-cyan-400">EP</span> <span className="text-gray-500">← Continue line</span></div>
          <div><span className="text-cyan-400">EP</span> <span className="text-gray-500">← Continue line</span></div>
          <div><span className="text-cyan-400">EP</span> <span className="text-yellow-400">{controls.endLine || 'E'}</span> <span className="text-gray-500">← End line segment</span></div>
          <div className="mt-2"><span className="text-green-400">TC</span> <span className="text-yellow-400">{controls.beginLine || 'B'}</span> <span className="text-gray-500">← Begin curb line</span></div>
          <div><span className="text-green-400">TC</span> <span className="text-yellow-400">{controls.startCurve || 'PC'}</span> <span className="text-gray-500">← Start curve</span></div>
          <div><span className="text-green-400">TC</span> <span className="text-yellow-400">{controls.endCurve || 'PT'}</span> <span className="text-gray-500">← End curve</span></div>
          <div><span className="text-green-400">TC</span> <span className="text-yellow-400">{controls.closeLine || 'C'}</span> <span className="text-gray-500">← Close polygon</span></div>
        </div>
      </div>
    </div>
  );
};

/**
 * Wildcard Patterns Panel
 */
const WildcardPanel: React.FC<{
  patterns: WildcardPattern[];
  onChange: (patterns: WildcardPattern[]) => void;
}> = ({ patterns, onChange }) => {
  const [newPattern, setNewPattern] = useState<Partial<WildcardPattern>>({
    position: 'suffix',
    pattern: '',
    description: '',
    enabled: true,
  });

  const togglePattern = (id: string) => {
    onChange(patterns.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p));
  };

  const deletePattern = (id: string) => {
    onChange(patterns.filter(p => p.id !== id));
  };

  const addPattern = () => {
    if (!newPattern.pattern || !newPattern.description) return;
    const id = `custom-${Date.now()}`;
    onChange([...patterns, {
      id,
      position: newPattern.position || 'suffix',
      pattern: newPattern.pattern,
      description: newPattern.description,
      examples: newPattern.examples || [],
      enabled: true,
    }]);
    setNewPattern({ position: 'suffix', pattern: '', description: '', enabled: true });
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-xl p-4 border border-purple-700/30">
        <h3 className="text-lg font-semibold text-white mb-2">Wildcard Patterns</h3>
        <p className="text-sm text-gray-300">
          Define patterns that match variations of codes. For example, "EP1", "EP2", "EPA" can all match the base code "EP".
          Wildcards can be prefixes (before code) or suffixes (after code).
        </p>
      </div>

      {/* Existing patterns */}
      <div className="space-y-3">
        {patterns.map((pattern) => (
          <div
            key={pattern.id}
            className={`bg-gray-800/50 rounded-xl p-4 border transition ${
              pattern.enabled ? 'border-gray-600' : 'border-gray-700 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={pattern.enabled}
                  onChange={() => togglePattern(pattern.id)}
                  className="w-5 h-5 rounded border-gray-600 bg-gray-900 text-purple-500 focus:ring-purple-500 cursor-pointer"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      pattern.position === 'prefix' 
                        ? 'bg-orange-900/50 text-orange-300' 
                        : 'bg-blue-900/50 text-blue-300'
                    }`}>
                      {pattern.position}
                    </span>
                    <code className="bg-gray-900 px-2 py-0.5 rounded text-cyan-400 font-mono text-sm">
                      {pattern.pattern}
                    </code>
                  </div>
                  <p className="text-sm text-gray-300 mt-1">{pattern.description}</p>
                  {pattern.examples && pattern.examples.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Examples: {pattern.examples.join(', ')}
                    </p>
                  )}
                </div>
              </div>
              {pattern.id.startsWith('custom-') && (
                <button
                  onClick={() => deletePattern(pattern.id)}
                  className="text-gray-500 hover:text-red-400 transition p-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add new pattern */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-dashed border-gray-600">
        <h4 className="text-sm font-medium text-gray-200 mb-3">Add Custom Pattern</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select
            value={newPattern.position}
            onChange={(e) => setNewPattern({ ...newPattern, position: e.target.value as 'prefix' | 'suffix' })}
            className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-purple-500"
          >
            <option value="suffix">Suffix (after code)</option>
            <option value="prefix">Prefix (before code)</option>
          </select>
          <input
            type="text"
            value={newPattern.pattern || ''}
            onChange={(e) => setNewPattern({ ...newPattern, pattern: e.target.value })}
            placeholder="Pattern (e.g., [0-9]+)"
            className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500 font-mono"
          />
          <input
            type="text"
            value={newPattern.description || ''}
            onChange={(e) => setNewPattern({ ...newPattern, description: e.target.value })}
            placeholder="Description"
            className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500"
          />
        </div>
        <button
          onClick={addPattern}
          disabled={!newPattern.pattern || !newPattern.description}
          className="mt-3 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition"
        >
          + Add Pattern
        </button>
      </div>

      {/* Pattern reference */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <h4 className="text-sm font-medium text-gray-200 mb-2">Pattern Reference</h4>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div><span className="text-cyan-400">[0-9]+</span> <span className="text-gray-500">- One or more digits</span></div>
          <div><span className="text-cyan-400">[A-Z]</span> <span className="text-gray-500">- Single uppercase letter</span></div>
          <div><span className="text-cyan-400">[A-Z]+</span> <span className="text-gray-500">- One or more letters</span></div>
          <div><span className="text-cyan-400">_</span> <span className="text-gray-500">- Underscore character</span></div>
          <div><span className="text-cyan-400">\.</span> <span className="text-gray-500">- Literal dot</span></div>
          <div><span className="text-cyan-400">.*</span> <span className="text-gray-500">- Any characters</span></div>
        </div>
      </div>
    </div>
  );
};

/**
 * Label Formatting Panel
 */
const LabelFormattingPanel: React.FC<{
  formatting: PointLabelFormatting;
  onChange: (formatting: PointLabelFormatting) => void;
}> = ({ formatting, onChange }) => {
  const updateFormatting = (field: keyof PointLabelFormatting, value: any) => {
    onChange({ ...formatting, [field]: value });
  };

  const addReplacement = () => {
    onChange({
      ...formatting,
      replacements: [...formatting.replacements, { from: '', to: '' }],
    });
  };

  const updateReplacement = (index: number, field: 'from' | 'to', value: string) => {
    const newReplacements = [...formatting.replacements];
    newReplacements[index] = { ...newReplacements[index], [field]: value };
    onChange({ ...formatting, replacements: newReplacements });
  };

  const removeReplacement = (index: number) => {
    onChange({
      ...formatting,
      replacements: formatting.replacements.filter((_, i) => i !== index),
    });
  };

  const addStripChar = (char: string) => {
    if (char && !formatting.stripCharacters.includes(char)) {
      onChange({
        ...formatting,
        stripCharacters: [...formatting.stripCharacters, char],
      });
    }
  };

  const removeStripChar = (char: string) => {
    onChange({
      ...formatting,
      stripCharacters: formatting.stripCharacters.filter(c => c !== char),
    });
  };

  // Preview label transformation
  const previewLabel = (input: string): string => {
    let result = input;
    
    // Apply replacements
    for (const { from, to } of formatting.replacements) {
      if (from) result = result.split(from).join(to);
    }
    
    // Strip characters
    for (const char of formatting.stripCharacters) {
      result = result.split(char).join('');
    }
    
    // Case transformation
    if (formatting.uppercase) result = result.toUpperCase();
    if (formatting.lowercase) result = result.toLowerCase();
    
    // Special char handling
    if (formatting.specialCharMode === 'remove') {
      result = result.replace(/[^a-zA-Z0-9\s]/g, '');
    } else if (formatting.specialCharMode === 'replace') {
      result = result.replace(/[^a-zA-Z0-9\s]/g, '_');
    }
    
    // Max length
    if (formatting.maxLength > 0 && result.length > formatting.maxLength) {
      result = result.substring(0, formatting.maxLength);
    }
    
    // Prefix/suffix
    if (formatting.labelPrefix) result = formatting.labelPrefix + result;
    if (formatting.labelSuffix) result = result + formatting.labelSuffix;
    
    return result;
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-green-900/30 to-teal-900/30 rounded-xl p-4 border border-green-700/30">
        <h3 className="text-lg font-semibold text-white mb-2">Point Label Formatting</h3>
        <p className="text-sm text-gray-300">
          Control how point labels are formatted when processing field data. 
          Handle special characters, set case preferences, and define character replacements.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Delimiter */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <label className="text-sm font-medium text-gray-200 block mb-2">
            Delimiter (between point # and description)
          </label>
          <select
            value={formatting.delimiter}
            onChange={(e) => updateFormatting('delimiter', e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-green-500"
          >
            <option value=" ">Space</option>
            <option value="_">Underscore (_)</option>
            <option value="-">Hyphen (-)</option>
            <option value=".">Period (.)</option>
            <option value="">None</option>
          </select>
        </div>

        {/* Special char mode */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <label className="text-sm font-medium text-gray-200 block mb-2">
            Special Characters
          </label>
          <select
            value={formatting.specialCharMode}
            onChange={(e) => updateFormatting('specialCharMode', e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-green-500"
          >
            <option value="keep">Keep as-is</option>
            <option value="remove">Remove all</option>
            <option value="replace">Replace with underscore</option>
          </select>
        </div>

        {/* Case */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <label className="text-sm font-medium text-gray-200 block mb-2">Case</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="case"
                checked={!formatting.uppercase && !formatting.lowercase}
                onChange={() => {
                  updateFormatting('uppercase', false);
                  updateFormatting('lowercase', false);
                }}
                className="text-green-500 focus:ring-green-500"
              />
              <span className="text-sm text-gray-300">Keep</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="case"
                checked={formatting.uppercase}
                onChange={() => {
                  updateFormatting('uppercase', true);
                  updateFormatting('lowercase', false);
                }}
                className="text-green-500 focus:ring-green-500"
              />
              <span className="text-sm text-gray-300">UPPER</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="case"
                checked={formatting.lowercase}
                onChange={() => {
                  updateFormatting('uppercase', false);
                  updateFormatting('lowercase', true);
                }}
                className="text-green-500 focus:ring-green-500"
              />
              <span className="text-sm text-gray-300">lower</span>
            </label>
          </div>
        </div>

        {/* Max length */}
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <label className="text-sm font-medium text-gray-200 block mb-2">
            Max Label Length
          </label>
          <input
            type="number"
            min="0"
            value={formatting.maxLength}
            onChange={(e) => updateFormatting('maxLength', parseInt(e.target.value) || 0)}
            placeholder="0 = unlimited"
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-green-500"
          />
          <p className="text-xs text-gray-500 mt-1">0 = no limit</p>
        </div>
      </div>

      {/* Prefix/Suffix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <label className="text-sm font-medium text-gray-200 block mb-2">Label Prefix</label>
          <input
            type="text"
            value={formatting.labelPrefix || ''}
            onChange={(e) => updateFormatting('labelPrefix', e.target.value)}
            placeholder="e.g., PT_"
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-green-500 font-mono"
          />
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <label className="text-sm font-medium text-gray-200 block mb-2">Label Suffix</label>
          <input
            type="text"
            value={formatting.labelSuffix || ''}
            onChange={(e) => updateFormatting('labelSuffix', e.target.value)}
            placeholder="e.g., _2024"
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-green-500 font-mono"
          />
        </div>
      </div>

      {/* Strip characters */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <label className="text-sm font-medium text-gray-200 block mb-2">Strip Characters</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {formatting.stripCharacters.map((char) => (
            <span
              key={char}
              className="bg-red-900/50 text-red-300 px-2 py-1 rounded flex items-center gap-1 font-mono text-sm"
            >
              "{char}"
              <button onClick={() => removeStripChar(char)} className="hover:text-white">×</button>
            </span>
          ))}
          {formatting.stripCharacters.length === 0 && (
            <span className="text-gray-500 text-sm">No characters to strip</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            maxLength={1}
            placeholder="Character"
            className="w-24 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-red-500 font-mono text-center"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value) {
                addStripChar(e.currentTarget.value);
                e.currentTarget.value = '';
              }
            }}
          />
          <span className="text-gray-500 text-sm self-center">Press Enter to add</span>
        </div>
      </div>

      {/* Character replacements */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <label className="text-sm font-medium text-gray-200 block mb-2">Character Replacements</label>
        <div className="space-y-2 mb-3">
          {formatting.replacements.map((replacement, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={replacement.from}
                onChange={(e) => updateReplacement(index, 'from', e.target.value)}
                placeholder="From"
                className="w-24 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-yellow-500 font-mono"
              />
              <span className="text-gray-500">→</span>
              <input
                type="text"
                value={replacement.to}
                onChange={(e) => updateReplacement(index, 'to', e.target.value)}
                placeholder="To"
                className="w-24 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-yellow-500 font-mono"
              />
              <button
                onClick={() => removeReplacement(index)}
                className="text-gray-500 hover:text-red-400 transition p-1"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addReplacement}
          className="px-3 py-1.5 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-300 rounded-lg text-sm font-medium transition"
        >
          + Add Replacement
        </button>
      </div>

      {/* Preview */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <h4 className="text-sm font-medium text-gray-200 mb-3">Preview</h4>
        <div className="bg-gray-900 rounded-lg p-3 font-mono text-sm space-y-2">
          <div className="flex items-center gap-4">
            <span className="text-gray-500 w-32">Input:</span>
            <span className="text-gray-300">1001 EP/TC-BEGIN</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-500 w-32">Output:</span>
            <span className="text-green-400">{previewLabel('1001 EP/TC-BEGIN')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Surface Lines Panel (Breaklines, Inclusion, Exclusion)
 */
const SurfaceLinesPanel: React.FC<{
  surfaceLines: SurfaceLineSettings;
  availableCodes: CodeDefinition[];
  onChange: (surfaceLines: SurfaceLineSettings) => void;
}> = ({ surfaceLines, availableCodes, onChange }) => {
  const [newCode, setNewCode] = useState('');
  const [activeSection, setActiveSection] = useState<'breakline' | 'inclusion' | 'exclusion'>('breakline');

  const updateSetting = (field: keyof SurfaceLineSettings, value: any) => {
    onChange({ ...surfaceLines, [field]: value });
  };

  const addCode = (type: 'breaklineCodes' | 'inclusionCodes' | 'exclusionCodes') => {
    if (newCode && !surfaceLines[type].includes(newCode.toUpperCase())) {
      onChange({
        ...surfaceLines,
        [type]: [...surfaceLines[type], newCode.toUpperCase()],
      });
      setNewCode('');
    }
  };

  const removeCode = (type: 'breaklineCodes' | 'inclusionCodes' | 'exclusionCodes', code: string) => {
    onChange({
      ...surfaceLines,
      [type]: surfaceLines[type].filter(c => c !== code),
    });
  };

  const CodeSection: React.FC<{
    title: string;
    description: string;
    codes: string[];
    type: 'breaklineCodes' | 'inclusionCodes' | 'exclusionCodes';
    color: string;
    icon: string;
  }> = ({ title, description, codes, type, color, icon }) => (
    <div className={`bg-gray-800/50 rounded-xl p-4 border ${
      activeSection === type.replace('Codes', '') as any ? `border-${color}-500/50` : 'border-gray-700'
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <h4 className="text-sm font-medium text-gray-200">{title}</h4>
        <span className={`ml-auto px-2 py-0.5 rounded text-xs bg-${color}-900/50 text-${color}-300`}>
          {codes.length} codes
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-3">{description}</p>
      
      <div className="flex flex-wrap gap-1.5 mb-3 min-h-[32px]">
        {codes.map((code) => (
          <span
            key={code}
            className={`bg-${color}-900/50 text-${color}-300 px-2 py-0.5 rounded flex items-center gap-1 font-mono text-xs`}
          >
            {code}
            <button onClick={() => removeCode(type, code)} className="hover:text-white ml-1">×</button>
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={activeSection === type.replace('Codes', '') as any ? newCode : ''}
          onChange={(e) => {
            setActiveSection(type.replace('Codes', '') as any);
            setNewCode(e.target.value.toUpperCase());
          }}
          onFocus={() => setActiveSection(type.replace('Codes', '') as any)}
          placeholder="Add code..."
          className={`flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-1.5 text-white placeholder-gray-500 focus:border-${color}-500 font-mono text-sm`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addCode(type);
          }}
        />
        <button
          onClick={() => addCode(type)}
          className={`px-3 py-1.5 bg-${color}-600/20 hover:bg-${color}-600/30 text-${color}-300 rounded-lg text-sm font-medium transition`}
        >
          +
        </button>
      </div>

      {/* Quick add from available codes */}
      {availableCodes.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-gray-600 mb-1">Quick add from standards:</p>
          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
            {availableCodes
              .filter(c => c.lineLayer && !codes.includes(c.code))
              .slice(0, 20)
              .map(c => (
                <button
                  key={c.code}
                  onClick={() => {
                    if (!codes.includes(c.code)) {
                      onChange({ ...surfaceLines, [type]: [...codes, c.code] });
                    }
                  }}
                  className="px-1.5 py-0.5 bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 hover:text-white rounded text-xs font-mono transition"
                  title={c.description}
                >
                  {c.code}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-orange-900/30 to-red-900/30 rounded-xl p-4 border border-orange-700/30">
        <h3 className="text-lg font-semibold text-white mb-2">Surface Line Settings</h3>
        <p className="text-sm text-gray-300">
          Define which codes create breaklines (hard edges) in TIN surfaces, and which codes 
          define inclusion boundaries (outer edges) or exclusion boundaries (holes).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <CodeSection
          title="Breakline Codes"
          description="These codes create hard edges in the TIN surface (e.g., curbs, walls, grade breaks)"
          codes={surfaceLines.breaklineCodes}
          type="breaklineCodes"
          color="cyan"
          icon="📐"
        />
        
        <CodeSection
          title="Inclusion Boundary Codes"
          description="These codes define the outer boundary of the TIN surface"
          codes={surfaceLines.inclusionCodes}
          type="inclusionCodes"
          color="green"
          icon="🔲"
        />
        
        <CodeSection
          title="Exclusion Boundary Codes"
          description="These codes create holes/voids in the TIN surface (e.g., buildings, ponds)"
          codes={surfaceLines.exclusionCodes}
          type="exclusionCodes"
          color="red"
          icon="⭕"
        />
      </div>

      {/* Layer overrides */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <h4 className="text-sm font-medium text-gray-200 mb-3">Layer Overrides (Optional)</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Breakline Layer</label>
            <input
              type="text"
              value={surfaceLines.breaklineLayer || ''}
              onChange={(e) => updateSetting('breaklineLayer', e.target.value || undefined)}
              placeholder="Use code's layer"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-cyan-500 font-mono text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Inclusion Layer</label>
            <input
              type="text"
              value={surfaceLines.inclusionLayer || ''}
              onChange={(e) => updateSetting('inclusionLayer', e.target.value || undefined)}
              placeholder="Use code's layer"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-green-500 font-mono text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Exclusion Layer</label>
            <input
              type="text"
              value={surfaceLines.exclusionLayer || ''}
              onChange={(e) => updateSetting('exclusionLayer', e.target.value || undefined)}
              placeholder="Use code's layer"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-red-500 font-mono text-sm"
            />
          </div>
        </div>
      </div>

      {/* Auto-detect */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={surfaceLines.autoDetectBreaklines}
            onChange={(e) => updateSetting('autoDetectBreaklines', e.target.checked)}
            className="w-5 h-5 rounded border-gray-600 bg-gray-900 text-orange-500 focus:ring-orange-500 cursor-pointer"
          />
          <div>
            <span className="text-sm font-medium text-gray-200">Auto-detect Breaklines</span>
            <p className="text-xs text-gray-500">Automatically create breaklines where elevation changes exceed threshold</p>
          </div>
        </label>
        
        {surfaceLines.autoDetectBreaklines && (
          <div className="mt-3 ml-8">
            <label className="text-xs text-gray-500 block mb-1">Elevation Threshold</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                min="0"
                value={surfaceLines.breaklineElevationThreshold || 0.5}
                onChange={(e) => updateSetting('breaklineElevationThreshold', parseFloat(e.target.value) || 0.5)}
                className="w-24 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-orange-500"
              />
              <span className="text-gray-500 text-sm">survey units</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Color Print/Plot Style Panel
 */
const ColorPrintPanel: React.FC<{
  colorPrintTable: ColorPrintTable;
  onChange: (table: ColorPrintTable) => void;
}> = ({ colorPrintTable, onChange }) => {
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);
  const [showAddColor, setShowAddColor] = useState(false);
  const [newColorIndex, setNewColorIndex] = useState<number>(10);

  // Log when panel loads
  useEffect(() => {
    f2fDebug('COLOR-PANEL', '========== COLOR PRINT TABLE LOADED ==========');
    f2fDebug('COLOR-PANEL', 'Table Name', colorPrintTable.name);
    f2fDebug('COLOR-PANEL', 'Entries Count', colorPrintTable.entries.length);
    f2fDebug('COLOR-PANEL', 'Monochrome', colorPrintTable.monochrome);
    f2fDebug('COLOR-PANEL', 'Default Line Weight', colorPrintTable.defaultLineWeight);
    f2fDebug('COLOR-PANEL', 'All Entries', colorPrintTable.entries);
  }, []);

  const updateEntry = (index: number, updates: Partial<ColorPrintEntry>) => {
    const newEntries = [...colorPrintTable.entries];
    newEntries[index] = { ...newEntries[index], ...updates };
    const newTable = { ...colorPrintTable, entries: newEntries };
    onChange(newTable);
    
    f2fDebug('COLOR-ENTRY', `Entry ${index} Updated`, {
      colorIndex: newEntries[index].colorIndex,
      colorName: newEntries[index].colorName,
      updates,
      result: newEntries[index]
    });
  };

  const removeEntry = (index: number) => {
    const removed = colorPrintTable.entries[index];
    const newEntries = colorPrintTable.entries.filter((_, i) => i !== index);
    onChange({ ...colorPrintTable, entries: newEntries });
    
    f2fDebug('COLOR-ENTRY', 'Entry Removed', {
      colorIndex: removed.colorIndex,
      colorName: removed.colorName,
      remainingCount: newEntries.length
    });
  };

  const addEntry = (colorIndex: number) => {
    const existing = colorPrintTable.entries.find(e => e.colorIndex === colorIndex);
    if (existing) {
      f2fDebug('COLOR-ENTRY', 'Add Skipped - Already Exists', { colorIndex });
      return;
    }
    
    const colorInfo = AUTOCAD_COLORS.find(c => c.index === colorIndex);
    const newEntry: ColorPrintEntry = {
      colorIndex,
      colorName: colorInfo?.name || `Color ${colorIndex}`,
      plotColor: 'black',
      lineWeight: 0.18,
      screening: 100,
      lineStyle: 'solid',
      enabled: true,
    };
    const newTable = {
      ...colorPrintTable,
      entries: [...colorPrintTable.entries, newEntry].sort((a, b) => a.colorIndex - b.colorIndex),
    };
    onChange(newTable);
    setShowAddColor(false);
    
    f2fDebug('COLOR-ENTRY', 'Entry Added', {
      colorIndex,
      colorName: newEntry.colorName,
      newEntry,
      totalEntries: newTable.entries.length
    });
  };

  const getColorHex = (index: number): string => {
    const color = AUTOCAD_COLORS.find(c => c.index === index);
    if (color) return color.hex;
    // Generate approximate color for other indices
    if (index >= 10 && index < 250) {
      const hue = ((index - 10) / 240) * 360;
      return `hsl(${hue}, 100%, 50%)`;
    }
    return '#808080';
  };

  const lineWeightOptions = [
    { value: -1, label: 'Use Object' },
    { value: 0, label: 'Default' },
    { value: 0.05, label: '0.05 mm' },
    { value: 0.09, label: '0.09 mm' },
    { value: 0.13, label: '0.13 mm' },
    { value: 0.18, label: '0.18 mm' },
    { value: 0.25, label: '0.25 mm' },
    { value: 0.35, label: '0.35 mm' },
    { value: 0.50, label: '0.50 mm' },
    { value: 0.70, label: '0.70 mm' },
    { value: 1.00, label: '1.00 mm' },
    { value: 1.40, label: '1.40 mm' },
    { value: 2.00, label: '2.00 mm' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-gradient-to-r from-pink-900/30 to-purple-900/30 rounded-xl p-4 border border-pink-700/30">
        <h3 className="text-lg font-semibold text-white mb-2">Color Print Table</h3>
        <p className="text-sm text-gray-300">
          Define how AutoCAD colors are plotted. Similar to CTB/STB plot styles, this controls
          line weights, colors, and screening for each AutoCAD color index used in your standards.
        </p>
      </div>

      {/* Global Settings */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <h4 className="text-sm font-semibold text-gray-200 mb-3">Global Settings</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Table Name</label>
            <input
              type="text"
              value={colorPrintTable.name}
              onChange={(e) => onChange({ ...colorPrintTable, name: e.target.value })}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:border-pink-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Default Line Weight</label>
            <select
              value={colorPrintTable.defaultLineWeight}
              onChange={(e) => onChange({ ...colorPrintTable, defaultLineWeight: parseFloat(e.target.value) })}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-pink-500"
            >
              {lineWeightOptions.filter(o => o.value >= 0).map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={colorPrintTable.monochrome}
                onChange={(e) => onChange({ ...colorPrintTable, monochrome: e.target.checked })}
                className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-pink-500 focus:ring-pink-500"
              />
              <span className="text-sm text-gray-300">Monochrome</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={colorPrintTable.useObjectLineWeights}
                onChange={(e) => onChange({ ...colorPrintTable, useObjectLineWeights: e.target.checked })}
                className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-pink-500 focus:ring-pink-500"
              />
              <span className="text-sm text-gray-300">Object Weights</span>
            </label>
          </div>
        </div>
      </div>

      {/* Color Entries */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-200">Color Mappings</h4>
          <button
            onClick={() => setShowAddColor(true)}
            className="px-3 py-1.5 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-sm font-medium transition flex items-center gap-1"
          >
            <span>+</span> Add Color
          </button>
        </div>

        {/* Add Color Dialog */}
        {showAddColor && (
          <div className="p-4 bg-gray-900/50 border-b border-gray-700">
            <div className="flex items-center gap-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">AutoCAD Color Index</label>
                <input
                  type="number"
                  min="1"
                  max="255"
                  value={newColorIndex}
                  onChange={(e) => setNewColorIndex(parseInt(e.target.value) || 1)}
                  className="w-24 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-pink-500"
                />
              </div>
              <div 
                className="w-10 h-10 rounded-lg border border-gray-600 mt-4"
                style={{ backgroundColor: getColorHex(newColorIndex) }}
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => addEntry(newColorIndex)}
                  className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-sm font-medium transition"
                >
                  Add
                </button>
                <button
                  onClick={() => setShowAddColor(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white transition"
                >
                  Cancel
                </button>
              </div>
            </div>
            {/* Quick Add Standard Colors */}
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs text-gray-500 self-center mr-2">Quick add:</span>
              {AUTOCAD_COLORS.slice(0, 9).map(color => {
                const exists = colorPrintTable.entries.some(e => e.colorIndex === color.index);
                return (
                  <button
                    key={color.index}
                    onClick={() => !exists && addEntry(color.index)}
                    disabled={exists}
                    className={`w-8 h-8 rounded border ${exists ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:scale-110 transition'}`}
                    style={{ backgroundColor: color.hex, borderColor: '#444' }}
                    title={`${color.name} (${color.index})${exists ? ' - already added' : ''}`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Entries Table */}
        <div className="divide-y divide-gray-700/50">
          {colorPrintTable.entries.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No color mappings defined. Click "Add Color" to start.
            </div>
          ) : (
            colorPrintTable.entries.map((entry, index) => (
              <div key={entry.colorIndex} className="hover:bg-gray-700/30 transition">
                {/* Summary Row */}
                <div
                  className="p-3 flex items-center gap-4 cursor-pointer"
                  onClick={() => setExpandedEntry(expandedEntry === index ? null : index)}
                >
                  {/* Enable Toggle */}
                  <input
                    type="checkbox"
                    checked={entry.enabled}
                    onChange={(e) => {
                      e.stopPropagation();
                      updateEntry(index, { enabled: e.target.checked });
                    }}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-pink-500 focus:ring-pink-500"
                  />
                  
                  {/* Color Swatch */}
                  <div
                    className="w-8 h-8 rounded border border-gray-600 flex-shrink-0"
                    style={{ backgroundColor: getColorHex(entry.colorIndex) }}
                    title={`Color ${entry.colorIndex}`}
                  />
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{entry.colorName}</span>
                      <span className="text-xs text-gray-500">#{entry.colorIndex}</span>
                    </div>
                    <div className="text-xs text-gray-500 flex gap-3">
                      <span>→ {entry.plotColor === 'same' ? 'Same' : entry.plotColor === 'black' ? 'Black' : entry.plotColor}</span>
                      <span>{lineWeightOptions.find(o => o.value === entry.lineWeight)?.label || `${entry.lineWeight}mm`}</span>
                      {entry.screening < 100 && <span>{entry.screening}%</span>}
                    </div>
                  </div>

                  {/* Categories */}
                  {entry.associatedCategories && entry.associatedCategories.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {entry.associatedCategories.slice(0, 2).map(cat => (
                        <span key={cat} className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded">
                          {cat}
                        </span>
                      ))}
                      {entry.associatedCategories.length > 2 && (
                        <span className="px-2 py-0.5 text-gray-500 text-xs">
                          +{entry.associatedCategories.length - 2}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Expand Indicator */}
                  <span className="text-gray-500">
                    {expandedEntry === index ? '▼' : '▶'}
                  </span>
                </div>

                {/* Expanded Details */}
                {expandedEntry === index && (
                  <div className="px-4 pb-4 bg-gray-900/30">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                      {/* Plot Color */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Plot Color</label>
                        <select
                          value={entry.plotColor}
                          onChange={(e) => updateEntry(index, { plotColor: e.target.value as 'same' | 'black' | string })}
                          className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-pink-500"
                        >
                          <option value="same">Same as Object</option>
                          <option value="black">Black</option>
                        </select>
                      </div>

                      {/* Line Weight */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Line Weight</label>
                        <select
                          value={entry.lineWeight}
                          onChange={(e) => updateEntry(index, { lineWeight: parseFloat(e.target.value) })}
                          className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-pink-500"
                        >
                          {lineWeightOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Screening */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Screening %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={entry.screening}
                          onChange={(e) => updateEntry(index, { screening: parseInt(e.target.value) || 100 })}
                          className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-pink-500"
                        />
                      </div>

                      {/* Line Style */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Line Style</label>
                        <select
                          value={entry.lineStyle}
                          onChange={(e) => updateEntry(index, { lineStyle: e.target.value as ColorPrintEntry['lineStyle'] })}
                          className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-pink-500"
                        >
                          <option value="solid">Solid</option>
                          <option value="dashed">Dashed</option>
                          <option value="dotted">Dotted</option>
                          <option value="dashdot">Dash-Dot</option>
                          <option value="object">Use Object</option>
                        </select>
                      </div>
                    </div>

                    {/* Associated Categories */}
                    <div className="mt-4">
                      <label className="text-xs text-gray-500 block mb-1">Associated Categories (comma-separated)</label>
                      <input
                        type="text"
                        value={(entry.associatedCategories || []).join(', ')}
                        onChange={(e) => updateEntry(index, { 
                          associatedCategories: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                        })}
                        placeholder="e.g., Topo, Monuments, Control"
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:border-pink-500"
                      />
                    </div>

                    {/* Remove Button */}
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={() => removeEntry(index)}
                        className="px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded-lg text-sm transition"
                      >
                        🗑️ Remove Color
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
        <h4 className="text-sm font-semibold text-gray-200 mb-3">Line Weight Preview</h4>
        <div className="space-y-2">
          {colorPrintTable.entries.filter(e => e.enabled).slice(0, 5).map(entry => (
            <div key={entry.colorIndex} className="flex items-center gap-3">
              <div
                className="w-6 h-6 rounded"
                style={{ backgroundColor: getColorHex(entry.colorIndex) }}
              />
              <div className="flex-1 h-[2px] bg-gray-700 overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    backgroundColor: entry.plotColor === 'black' ? '#000' : 
                      entry.plotColor === 'same' ? getColorHex(entry.colorIndex) : entry.plotColor,
                    height: `${Math.max(entry.lineWeight * 4, 1)}px`,
                    opacity: entry.screening / 100,
                  }}
                />
              </div>
              <span className="text-xs text-gray-500 w-16">{entry.lineWeight}mm</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Symbol Layers Panel
 * Configure symbol layer naming and default settings
 */
const SymbolLayersPanel: React.FC<{
  symbolLayers: SymbolLayerSettings;
  availableCodes: CodeDefinition[];
  onChange: (settings: SymbolLayerSettings) => void;
}> = ({ symbolLayers, availableCodes, onChange }) => {
  // Log when panel loads
  useEffect(() => {
    f2fDebug('SYMBOL-PANEL', '========== SYMBOL LAYERS LOADED ==========');
    f2fDebug('SYMBOL-PANEL', 'Settings', symbolLayers);
  }, []);

  const updateSetting = <K extends keyof SymbolLayerSettings>(
    key: K,
    value: SymbolLayerSettings[K]
  ) => {
    const newSettings = { ...symbolLayers, [key]: value };
    onChange(newSettings);
    f2fDebug('SYMBOL', `Setting Updated: ${key}`, { value, newSettings });
  };

  // Generate preview layer names from current codes
  const previewLayers = availableCodes
    .filter(c => c.symbol && c.symbol !== '-')
    .slice(0, 8)
    .map(c => {
      const symbolName = typeof c.symbol === 'string' ? c.symbol : c.symbol?.name || c.code;
      return `${symbolLayers.layerPrefix}${symbolName}${symbolLayers.layerSuffix}`;
    });

  return (
    <div className="space-y-6">
      {/* Description */}
      <div className="bg-gradient-to-r from-yellow-900/30 to-orange-900/30 border border-yellow-700/50 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">⭐</span>
          <div>
            <h3 className="font-semibold text-yellow-200">Symbol Layer Settings</h3>
            <p className="text-yellow-100/70 text-sm mt-1">
              Configure how symbol layers are named and inserted. Symbol blocks will be placed on 
              these auto-generated layers based on the symbol name.
            </p>
          </div>
        </div>
      </div>

      {/* Layer Naming */}
      <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
        <h4 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
          🏷️ Layer Naming Convention
        </h4>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Layer Prefix</label>
            <input
              type="text"
              value={symbolLayers.layerPrefix}
              onChange={(e) => updateSetting('layerPrefix', e.target.value)}
              placeholder="V-SYM-"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-yellow-500 focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">Added before symbol name</p>
          </div>
          
          <div>
            <label className="block text-xs text-gray-400 mb-1">Layer Suffix</label>
            <input
              type="text"
              value={symbolLayers.layerSuffix}
              onChange={(e) => updateSetting('layerSuffix', e.target.value)}
              placeholder="-SYM"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-yellow-500 focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">Added after symbol name</p>
          </div>
        </div>

        {/* Preview */}
        <div className="mt-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
          <p className="text-xs text-gray-400 mb-2">Preview (from your codes):</p>
          <div className="flex flex-wrap gap-2">
            {previewLayers.length > 0 ? (
              previewLayers.map((layer, i) => (
                <span key={i} className="px-2 py-1 bg-yellow-900/30 text-yellow-300 rounded text-xs font-mono">
                  {layer}
                </span>
              ))
            ) : (
              <span className="text-gray-500 text-xs">No symbols defined in codes yet</span>
            )}
          </div>
        </div>
      </div>

      {/* Auto Generate Toggle */}
      <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-200">Auto-Generate Layers</h4>
            <p className="text-xs text-gray-400 mt-1">
              Automatically create symbol layers when pushing standards to Civil 3D
            </p>
          </div>
          <button
            onClick={() => updateSetting('autoGenerateLayers', !symbolLayers.autoGenerateLayers)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              symbolLayers.autoGenerateLayers ? 'bg-yellow-500' : 'bg-gray-600'
            }`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
              symbolLayers.autoGenerateLayers ? 'left-7' : 'left-1'
            }`} />
          </button>
        </div>
      </div>

      {/* Default Settings */}
      <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
        <h4 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
          ⚙️ Default Symbol Settings
        </h4>
        
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Default Color</label>
            <select
              value={symbolLayers.defaultColor}
              onChange={(e) => updateSetting('defaultColor', parseInt(e.target.value))}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-yellow-500 focus:outline-none"
            >
              <option value={1}>1 - Red</option>
              <option value={2}>2 - Yellow</option>
              <option value={3}>3 - Green</option>
              <option value={4}>4 - Cyan</option>
              <option value={5}>5 - Blue</option>
              <option value={6}>6 - Magenta</option>
              <option value={7}>7 - White</option>
              <option value={8}>8 - Gray</option>
              <option value={256}>256 - ByLayer</option>
            </select>
          </div>
          
          <div>
            <label className="block text-xs text-gray-400 mb-1">Default Scale</label>
            <input
              type="number"
              value={symbolLayers.defaultScale}
              onChange={(e) => updateSetting('defaultScale', parseFloat(e.target.value) || 1)}
              min="0.1"
              max="100"
              step="0.1"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:border-yellow-500 focus:outline-none"
            />
          </div>
          
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={symbolLayers.rotateWithBearing}
                onChange={(e) => updateSetting('rotateWithBearing', e.target.checked)}
                className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-yellow-500 focus:ring-yellow-500"
              />
              <span className="text-sm text-gray-300">Rotate with bearing</span>
            </label>
          </div>
        </div>
      </div>

      {/* Symbol Preview Section */}
      <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
        <h4 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
          👁️ Code Symbol Previews
        </h4>
        <p className="text-xs text-gray-400 mb-4">
          Symbols with visual previews from your standards. Click ✨ in the spreadsheet to AI-generate symbols.
        </p>
        
        <div className="grid grid-cols-4 gap-3">
          {availableCodes
            .filter(c => c.symbol && typeof c.symbol === 'object' && c.symbol.svgPath)
            .slice(0, 8)
            .map((code, i) => {
              const sym = code.symbol as { svgPath: string; fillPath?: string; viewBox: string; name: string };
              return (
                <div key={i} className="bg-gray-900/50 rounded-lg p-3 text-center border border-gray-700">
                  <svg
                    width={40}
                    height={40}
                    viewBox={sym.viewBox || '0 0 24 24'}
                    className="mx-auto text-cyan-400"
                  >
                    <path
                      d={sym.svgPath}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {sym.fillPath && (
                      <path d={sym.fillPath} fill="currentColor" stroke="none" />
                    )}
                  </svg>
                  <p className="text-xs text-gray-400 mt-2 truncate">{code.code}</p>
                  <p className="text-xs text-gray-500 truncate">{sym.name}</p>
                </div>
              );
            })}
          {availableCodes.filter(c => c.symbol && typeof c.symbol === 'object' && c.symbol.svgPath).length === 0 && (
            <div className="col-span-4 text-center py-8 text-gray-500">
              <span className="text-3xl mb-2 block">✨</span>
              <p className="text-sm">No visual symbols yet</p>
              <p className="text-xs mt-1">Use the ✨ button in Symbol column to generate</p>
            </div>
          )}
        </div>
      </div>

      {/* Symbol Library Section */}
      <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700">
        <h4 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
          📚 Standard Symbol Library
        </h4>
        <p className="text-xs text-gray-400 mb-4">
          Browse pre-defined survey symbols. Use the 📚 button in the Symbol column to pick from library.
        </p>
        <SymbolLibraryPanel compact />
      </div>
    </div>
  );
};

export default FieldToFinishSettings;
