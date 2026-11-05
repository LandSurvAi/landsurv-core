/**
 * ReviewModal Component
 * 
 * Displays inference results and allows users to review, confirm, or reject code matches.
 * Shows alternatives for each code and allows manual selection.
 * 
 * Features:
 * - Modal dialog
 * - Table of results (Code | Master | Confidence | Alternatives | Actions)
 * - Inline editing of master match
 * - Alternatives dropdown
 * - Batch confirm/reject buttons
 * - Progress indicator
 * - Loading state during inference
 */

import React, { useState, useEffect } from 'react';
import { useMirrorError } from '../../hooks/useMirrorError';
import {
  StandardDefinition,
  InferenceRequest,
  InferenceResult,
} from '../../contexts/types/CadManager.types';
import { InferenceService } from '../../services/InferenceService';

interface ReviewModalProps {
  isOpen: boolean;
  unknownCodes: string[];
  standard: StandardDefinition;
  previousAliases?: Record<string, string>;
  onConfirm: (results: InferenceResult[]) => void;
  onCancel: () => void;
  onAliasChange?: (alias: { unknownCode: string; masterCode: string }) => void;
}

/**
 * ReviewModal Component
 * 
 * Displays inference results and allows user confirmation.
 */
export const ReviewModal: React.FC<ReviewModalProps> = ({
  isOpen,
  unknownCodes,
  standard,
  previousAliases = {},
  onConfirm,
  onCancel,
  onAliasChange,
}) => {
  // State
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<InferenceResult[]>([]);
  const [edits, setEdits] = useState<Map<string, string>>(new Map());
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useMirrorError(error, { title: 'Review', kind: 'review-modal-error' });

  /**
   * Load and infer codes when modal opens
   */
  useEffect(() => {
    if (!isOpen) return;

    const performInference = async () => {
      setIsLoading(true);
      setError(null);

      try {
        console.log(`[ReviewModal] Starting inference for ${unknownCodes.length} codes...`);

        const request: InferenceRequest = {
          unknownCodes,
          masterCodes: standard.codes,
          previousAliases,
        };

        const inferredResults = await InferenceService.inferCodes(request);
        setResults(inferredResults);
        setEdits(new Map());
        setExpandedRow(null);

        console.log(`[ReviewModal] Inference complete: ${inferredResults.length} results`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[ReviewModal] Inference error:', message);
        setError(`Failed to infer codes: ${message}`);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    performInference();
  }, [isOpen, unknownCodes, standard, previousAliases]);

  /**
   * Handle alternative selection
   */
  const handleAlternativeSelected = (unknownCode: string, alternativeCode: string) => {
    setEdits(prev => new Map(prev).set(unknownCode, alternativeCode));

    // Emit alias change if handler provided
    if (onAliasChange) {
      onAliasChange({
        unknownCode,
        masterCode: alternativeCode,
      });
    }

    console.log(`[ReviewModal] User selected: ${unknownCode} → ${alternativeCode}`);
  };

  /**
   * Handle confirm all
   */
  const handleConfirmAll = () => {
    // Apply all edits to results
    const confirmedResults = results.map(result => {
      const edited = edits.get(result.raw);
      if (edited && edited !== result.match) {
        return {
          ...result,
          match: edited,
          reasoning: 'User override',
        };
      }
      return result;
    });

    console.log(`[ReviewModal] User confirmed ${confirmedResults.length} matches`);
    onConfirm(confirmedResults);
  };

  /**
   * Get display master code (including edits)
   */
  const getDisplayMaster = (result: InferenceResult): string => {
    const edited = edits.get(result.raw);
    return edited || result.match || '?';
  };

  /**
   * Format confidence as percentage
   */
  const formatConfidence = (confidence: number): string => {
    return `${(confidence * 100).toFixed(0)}%`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#0a111c] text-slate-200 rounded-xl border border-white/[0.08] shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-base font-semibold text-white">Confirm code matches</h2>
          <button
            onClick={onCancel}
            className="text-slate-500 hover:text-slate-300 font-bold text-xl"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Progress */}
        {!isLoading && results.length > 0 && (
          <div className="px-6 pt-4 pb-2 bg-white/[0.02] border-b">
            <p className="text-sm text-slate-400">
              Progress: <strong>{results.length}</strong> of <strong>{unknownCodes.length}</strong> codes
            </p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Loading */}
          {isLoading && (
            <div className="p-8 text-center">
              <div className="inline-block">
                <div className="animate-spin h-8 w-8 border-4 border-cyan-400/20 border-t-cyan-400 rounded-full"></div>
              </div>
              <p className="mt-4 text-slate-400">
                Analyzing codes with AI... Please wait.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-6 bg-red-500/[0.07] border border-red-500/25 m-4 rounded">
              <p className="text-red-300">
                <strong>Error:</strong> {error}
              </p>
            </div>
          )}

          {/* Results Table */}
          {!isLoading && results.length > 0 && (
            <div className="p-6">
              <table className="w-full text-sm">
                <thead className="bg-white/[0.04] border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">Unknown Code</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">Match</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-300">Confidence</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-300">Alternatives</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {results.map((result) => (
                    <React.Fragment key={result.raw}>
                      <tr className={`hover:bg-white/[0.02] ${edits.has(result.raw) ? 'bg-cyan-400/[0.06]' : ''}`}>
                        <td className="px-4 py-3 font-mono font-medium text-slate-100">
                          {result.raw}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={getDisplayMaster(result)}
                            onChange={(e) => handleAlternativeSelected(result.raw, e.target.value)}
                            className="w-full rounded border border-white/[0.1] bg-[#070d16] px-2 py-1 font-mono text-slate-200
                              focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                            placeholder="Click to edit"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs font-medium
                              ${result.confidence >= 0.8
                                ? 'bg-emerald-500/10 text-emerald-300'
                                : result.confidence >= 0.5
                                  ? 'bg-amber-500/10 text-amber-300'
                                  : 'bg-red-500/10 text-red-300'
                              }`}
                          >
                            {formatConfidence(result.confidence)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {result.alternatives && result.alternatives.length > 0 && (
                            <button
                              onClick={() =>
                                setExpandedRow(
                                  expandedRow === result.raw ? null : result.raw
                                )
                              }
                              className="text-cyan-300 hover:text-cyan-200 font-medium"
                            >
                              ▼ {result.alternatives.length}
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Alternatives Row */}
                      {expandedRow === result.raw && result.alternatives && result.alternatives.length > 0 && (
                        <tr className="bg-white/[0.02]">
                          <td colSpan={4} className="px-4 py-3">
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-slate-400 mb-2">Alternatives:</p>
                              {result.alternatives.map((alt) => (
                                <button
                                  key={alt.code}
                                  onClick={() => {
                                    handleAlternativeSelected(result.raw, alt.code);
                                    setExpandedRow(null);
                                  }}
                                  className="block w-full text-left px-3 py-2 rounded border border-white/[0.1]
                                    hover:bg-cyan-400/[0.06] hover:border-cyan-400/40 transition-colors"
                                >
                                  <span className="font-mono font-medium">{alt.code}</span>
                                  <span className="ml-2 text-xs text-slate-400">
                                    ({formatConfidence(alt.confidence)})
                                  </span>
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* No Results */}
          {!isLoading && results.length === 0 && !error && (
            <div className="p-8 text-center text-slate-500">
              <p>No results to display</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t bg-white/[0.02]">
          <button
            onClick={handleConfirmAll}
            disabled={isLoading || results.length === 0}
            className="flex-1 px-6 py-2 bg-cyan-500/90 text-white rounded-md font-medium
              hover:bg-cyan-400 disabled:bg-white/[0.08] disabled:cursor-not-allowed
              transition-colors duration-200"
          >
            Confirm all
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-6 py-2 bg-white/[0.08] text-white rounded-md font-medium
              hover:bg-white/[0.02]0 transition-colors duration-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
