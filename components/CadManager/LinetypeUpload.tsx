/**
 * LinetypeUpload Component
 * 
 * Upload and manage AutoCAD linetype (.lin) files.
 * Supports:
 * - Upload existing .lin files
 * - Preview parsed linetypes
 * - Select common survey linetypes
 * - AI-generated linetypes
 * - Download .lin file
 * 
 * Integrates with CAD Manager for pushing linetypes to Civil 3D.
 */

import React, { useState, useMemo } from 'react';
import { useMirrorError } from '../../hooks/useMirrorError';
import { LinetypeDefinition, LinetypeFile } from '../../contexts/types/CadManager.types';
import {
  parseLinFile,
  generateLinFileContent,
  formatPatternDisplay,
  validateLinetypeName,
  COMMON_SURVEY_LINETYPES,
} from '../../utils/linetypeParser';
import { InferenceService } from '../../services/InferenceService';

interface LinetypeUploadProps {
  onLinetypesParsed?: (linetypes: LinetypeFile) => void;
  isLoading?: boolean;
  isC3DConnected?: boolean;
  onPushToC3D?: (linetypes: LinetypeDefinition[]) => Promise<void>;
}

/**
 * LinetypeUpload Component
 */
export const LinetypeUpload: React.FC<LinetypeUploadProps> = ({
  onLinetypesParsed,
  isLoading: externalLoading = false,
  isC3DConnected = false,
  onPushToC3D,
}) => {
  // State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [parsedLinetypes, setParsedLinetypes] = useState<LinetypeFile | null>(null);
  const [selectedLinetypes, setSelectedLinetypes] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useMirrorError(error, { title: 'Linetype upload', kind: 'linetype-upload-error' });
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'common' | 'ai'>('upload');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGeneratedLinetypes, setAiGeneratedLinetypes] = useState<LinetypeDefinition[]>([]);

  const loading = isLoading || externalLoading;

  /**
   * Handle file selection
   */
  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccess(null);

    // Validate file type
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'lin') {
      setError('Please select a .lin file');
      return;
    }

    // Validate file size (1MB limit for lin files)
    if (file.size > 1024 * 1024) {
      setError('File too large. Maximum 1MB allowed for linetype files.');
      return;
    }

    setSelectedFile(file);

    try {
      const content = await file.text();
      setFileContent(content);

      // Parse the linetype file
      const parsed = parseLinFile(content, file.name);
      setParsedLinetypes(parsed);
      
      // Select all by default
      setSelectedLinetypes(new Set(parsed.linetypes.map(lt => lt.name)));
      
      setSuccess(`✓ Parsed ${parsed.linetypes.length} linetypes from ${file.name}`);
      
      if (onLinetypesParsed) {
        onLinetypesParsed(parsed);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Could not parse file: ${message}`);
      setSelectedFile(null);
      setFileContent('');
      setParsedLinetypes(null);
    }
  };

  /**
   * Toggle linetype selection
   */
  const toggleLinetypeSelection = (name: string) => {
    const newSelected = new Set(selectedLinetypes);
    if (newSelected.has(name)) {
      newSelected.delete(name);
    } else {
      newSelected.add(name);
    }
    setSelectedLinetypes(newSelected);
  };

  /**
   * Select/deselect all linetypes
   */
  const toggleSelectAll = (linetypes: LinetypeDefinition[]) => {
    if (selectedLinetypes.size === linetypes.length) {
      setSelectedLinetypes(new Set());
    } else {
      setSelectedLinetypes(new Set(linetypes.map(lt => lt.name)));
    }
  };

  /**
   * Handle AI generation
   */
  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) {
      setError('Please describe the linetypes you need');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      console.log('[LinetypeUpload] Generating linetypes via AI...');
      
      const generated = await InferenceService.generateLinetypes(aiPrompt);
      
      setAiGeneratedLinetypes(generated);
      setSelectedLinetypes(new Set(generated.map(lt => lt.name)));
      setSuccess(`✓ Generated ${generated.length} linetypes`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to generate linetypes: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Download as .lin file
   */
  const handleDownload = () => {
    const linetypes = getCurrentLinetypes();
    const selectedLts = linetypes.filter(lt => selectedLinetypes.has(lt.name));
    
    if (selectedLts.length === 0) {
      setError('No linetypes selected');
      return;
    }

    const content = generateLinFileContent(selectedLts, 'Custom Survey Linetypes');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'custom_linetypes.lin';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setSuccess('✓ Downloaded custom_linetypes.lin');
  };

  /**
   * Push to Civil 3D
   */
  const handlePushToC3D = async () => {
    if (!onPushToC3D) return;
    
    const linetypes = getCurrentLinetypes();
    const selectedLts = linetypes.filter(lt => selectedLinetypes.has(lt.name));
    
    if (selectedLts.length === 0) {
      setError('No linetypes selected');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onPushToC3D(selectedLts);
      setSuccess(`✓ Pushed ${selectedLts.length} linetypes to Civil 3D`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to push linetypes: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Clear everything
   */
  const handleClear = () => {
    setSelectedFile(null);
    setFileContent('');
    setParsedLinetypes(null);
    setSelectedLinetypes(new Set());
    setAiGeneratedLinetypes([]);
    setAiPrompt('');
    setError(null);
    setSuccess(null);
  };

  /**
   * Get current linetypes based on active tab
   */
  const getCurrentLinetypes = (): LinetypeDefinition[] => {
    switch (activeTab) {
      case 'upload':
        return parsedLinetypes?.linetypes || [];
      case 'common':
        return COMMON_SURVEY_LINETYPES;
      case 'ai':
        return aiGeneratedLinetypes;
      default:
        return [];
    }
  };

  const currentLinetypes = getCurrentLinetypes();

  return (
    <div className="linetype-upload-container p-4">
      <h2 className="text-lg font-bold mb-3 text-gray-200 light-theme:text-gray-800">
        📏 Linetype Manager
      </h2>

      {/* Tab Selector */}
      <div className="flex border-b border-gray-700 mb-4 light-theme:border-gray-300">
        <button
          onClick={() => setActiveTab('upload')}
          className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === 'upload'
              ? 'border-b-2 border-indigo-400 text-indigo-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          📁 Upload .lin
        </button>
        <button
          onClick={() => setActiveTab('common')}
          className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === 'common'
              ? 'border-b-2 border-indigo-400 text-indigo-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          📋 Common
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === 'ai'
              ? 'border-b-2 border-indigo-400 text-indigo-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          🤖 AI Generate
        </button>
      </div>

      {/* Upload Tab */}
      {activeTab === 'upload' && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-300 mb-2 light-theme:text-gray-700">
            Select .lin File
          </label>
          <input
            type="file"
            accept=".lin"
            onChange={handleFileSelected}
            disabled={loading}
            className="block w-full text-sm text-gray-400
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-indigo-600 file:text-white
              hover:file:bg-indigo-700
              disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {selectedFile && (
            <p className="text-xs text-gray-500 mt-2">
              Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>
      )}

      {/* Common Tab */}
      {activeTab === 'common' && (
        <div className="mb-4">
          <p className="text-sm text-gray-400 mb-2">
            Select from common survey/civil linetypes:
          </p>
        </div>
      )}

      {/* AI Tab */}
      {activeTab === 'ai' && (
        <div className="mb-4">
          <div className="flex gap-2 mb-3">
            <button
              onClick={async () => {
                const quickPrompt = 'Create a comprehensive set of survey linetypes including: property lines (solid and dashed), centerlines, utility lines (water, sewer, electric, gas, telecom), easements, right-of-way, contours, and construction limits. Include both above-ground and underground variations with appropriate patterns.';
                setAiPrompt(quickPrompt);
                
                setIsLoading(true);
                setError(null);
                setSuccess(null);

                try {
                  console.log('[LinetypeUpload] Quick generating standard survey linetypes...');
                  
                  const generated = await InferenceService.generateLinetypes(quickPrompt);
                  
                  setAiGeneratedLinetypes(generated);
                  setSelectedLinetypes(new Set(generated.map(lt => lt.name)));
                  setSuccess(`✓ Generated ${generated.length} standard survey linetypes`);
                } catch (err) {
                  const message = err instanceof Error ? err.message : 'Unknown error';
                  setError(`Failed to generate linetypes: ${message}`);
                } finally {
                  setIsLoading(false);
                }
              }}
              disabled={loading}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-md font-medium
                hover:from-indigo-700 hover:to-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed
                transition-all duration-200 shadow-lg"
            >
              ⚡ Quick Generate Standard Survey Linetypes
            </button>
          </div>
          
          <div className="relative">
            <label className="block text-sm font-medium text-gray-300 mb-2 light-theme:text-gray-700">
              Or describe custom linetypes:
            </label>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g., Create linetypes for: water mains (blue), sewer lines (green), electric (yellow), gas (orange). Include both underground and overhead variations."
              disabled={loading}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-200 
                placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 
                disabled:opacity-50 resize-none"
              rows={3}
            />
            <button
              onClick={handleAiGenerate}
              disabled={loading || !aiPrompt.trim()}
              className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-md font-medium
                hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed
                transition-colors duration-200"
            >
              {loading ? 'Generating...' : '🤖 Generate Custom Linetypes'}
            </button>
          </div>
        </div>
      )}

      {/* Linetype List */}
      {currentLinetypes.length > 0 && (
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-gray-300 light-theme:text-gray-700">
              Linetypes ({selectedLinetypes.size}/{currentLinetypes.length} selected)
            </label>
            <button
              onClick={() => toggleSelectAll(currentLinetypes)}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              {selectedLinetypes.size === currentLinetypes.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          
          <div className="bg-gray-900 border border-gray-700 rounded-md max-h-60 overflow-y-auto">
            {currentLinetypes.map((lt) => (
              <div
                key={lt.name}
                onClick={() => toggleLinetypeSelection(lt.name)}
                className={`flex items-center p-2 border-b border-gray-800 cursor-pointer hover:bg-gray-800/50
                  ${selectedLinetypes.has(lt.name) ? 'bg-indigo-900/20' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedLinetypes.has(lt.name)}
                  onChange={() => {}}
                  className="mr-3 accent-indigo-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-gray-200">{lt.name}</span>
                    {lt.isComplex && (
                      <span className="text-xs bg-purple-900/50 text-purple-300 px-1 rounded">
                        complex
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{lt.description}</div>
                  <div className="text-xs font-mono text-gray-600 mt-1">
                    {formatPatternDisplay(lt.pattern)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 rounded border border-red-500/30">
          <p className="text-sm text-red-300">
            <strong>Error:</strong> {error}
          </p>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="mb-4 p-3 bg-green-900/30 rounded border border-green-500/30">
          <p className="text-sm text-green-300">{success}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="mb-4 p-3 bg-yellow-900/30 rounded border border-yellow-500/30">
          <p className="text-sm text-yellow-300">Processing...</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleDownload}
          disabled={loading || selectedLinetypes.size === 0}
          title={selectedLinetypes.size === 0 ? 'Select linetypes first' : 'Download selected linetypes as .lin file'}
          className="px-4 py-2 bg-gray-700 text-gray-300 rounded-md font-medium
            hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed
            transition-colors duration-200"
        >
          💾 Download .lin ({selectedLinetypes.size})
        </button>
        
        <button
          onClick={handlePushToC3D}
          disabled={loading || selectedLinetypes.size === 0 || !isC3DConnected || !onPushToC3D}
          title={
            !isC3DConnected ? 'Civil 3D not connected' :
            selectedLinetypes.size === 0 ? 'Select linetypes first' :
            'Push selected linetypes to Civil 3D'
          }
          className="px-4 py-2 bg-green-600 text-white rounded-md font-medium
            hover:bg-green-700 disabled:bg-gray-600 disabled:text-gray-500 disabled:cursor-not-allowed
            transition-colors duration-200"
        >
          📤 Push to Civil 3D ({selectedLinetypes.size})
        </button>
        
        <button
          onClick={handleClear}
          disabled={loading}
          className="px-4 py-2 bg-gray-700 text-gray-400 rounded-md font-medium
            hover:bg-gray-600 disabled:cursor-not-allowed
            transition-colors duration-200"
        >
          Clear
        </button>
      </div>

      {/* Info */}
      <p className="text-xs text-gray-500 mt-4">
        Linetypes define how lines appear in AutoCAD/Civil 3D. Upload existing .lin files, 
        choose from common survey linetypes, or use AI to generate custom patterns.
      </p>
    </div>
  );
};
