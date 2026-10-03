/**
 * CAD Manager Context
 * 
 * Manages the state for code standard parsing, AI-assisted code matching,
 * and learning from user confirmations.
 * 
 * No database. State lives in React Context and is persisted to .lsvz file.
 */

import React, { createContext, useContext, useState, useCallback, useReducer, useEffect } from 'react';
import {
  CadManagerState,
  CadManagerAction,
  StandardDefinition,
  CadTextStyleDefinition,
  InferenceResult,
  AliasMapping,
  CodeResolution,
  CodeDefinition,
  LayerDefinition,
  SurveyData,
  INITIAL_CAD_MANAGER_STATE,
  normalizeSurveyorAliases,
  aliasToRegExp,
} from './types/CadManager.types';
import { InferenceService } from '../services/InferenceService';
import {
  getHatchForFemaZone,
  getHatchContextString as buildHatchContextString,
  HatchDefinition,
} from '../services/hatchLibrary';
import { LsvzPersistence } from '../services/LsvzPersistence';
import { USACE_AEC_STANDARD } from '../utils/defaultUsaceStandard';

const DEFAULT_CAD_TEXT_STYLES: CadTextStyleDefinition[] = [
  { name: 'Parcel Owner - Narrow CAD', fontFamily: 'Arial Narrow', fontBold: false, fontItalic: true, textCase: 'uppercase', lineSpacing: 1.2 },
  { name: 'Parcel Owner - Classic CAD', fontFamily: 'Romans', fontBold: false, fontItalic: false, textCase: 'uppercase', lineSpacing: 1.15 },
  { name: 'Parcel Owner - Plan Readable', fontFamily: 'Calibri', fontBold: true, fontItalic: false, textCase: 'original', lineSpacing: 1.3 },
  { name: 'Parcel Owner - Field Compact', fontFamily: 'Simplex', fontBold: false, fontItalic: false, textCase: 'uppercase', lineSpacing: 1.0 },
];

const createInitialCadManagerState = (): CadManagerState => ({
  ...INITIAL_CAD_MANAGER_STATE,
  standard: {
    ...USACE_AEC_STANDARD,
    textStyles: DEFAULT_CAD_TEXT_STYLES,
  },
});

/**
 * Context object
 */
interface CadManagerContextType {
  // State
  state: CadManagerState;
  dispatch: React.Dispatch<CadManagerAction>;
  
  // Standard operations
  uploadStandard: (markdownContent: string, fileName?: string) => Promise<void>;
  
  // Survey processing
  processSurveyFile: (surveyData: SurveyData) => Promise<void>;
  
  // Code resolution
  resolveCode: (rawCode: string) => CodeResolution;
  
  /**
   * Returns the CAD layer for a point's description, or undefined if not found.
   * Convenience wrapper around resolveCode for the common case of resolving a point layer.
   */
  resolvePointLayer: (description: string) => string | undefined;

  /**
   * Returns a formatted context string (a concise markdown table) of all codes → layers in the
   * loaded standard. Designed to be injected into AI agent system instructions so every agent
   * knows which layer names to use. Returns an empty string when no standard is loaded.
   * format='condensed' → code | pointLayer | lineLayer | lineType
   * format='full'      → all CodeDefinition columns
   */
  getLayersContextString: (format?: 'condensed' | 'full') => string;

  /**
   * Returns all unique layer names (both point and line layers) across the loaded standard.
   * Each entry carries { name, isPointLayer, isLineLayer, description? }.
   * Used by the Data Visibility panel to build the dynamic layer toggle list.
   */
  getAllLayers: () => Array<{ name: string; isPointLayer: boolean; isLineLayer: boolean; description?: string }>;

  /**
   * Author one or more CodeDefinitions into the loaded standard. Existing codes
   * (case-insensitive match on `code`) are updated in-place; new codes are
   * appended. If no standard is loaded yet a minimal seed standard is created
   * so the codes have a home. Used by CACP `cad_create_layer` so peer agents
   * (Deed Reader, Boundary Agent, etc.) can author layers on demand. v26.05.17.41.
   */
  addCodes: (codes: CodeDefinition[]) => CodeDefinition[];

  /**
   * Ensure the four boundary/topo special codes exist (DEED, INCLUSION,
   * EXCLUSION, BREAKLINE). No-op for codes already present (case-insensitive).
   * Returns the list of codes that were newly added. v26.05.17.41.
   */
  ensureDefaultBoundaryCodes: () => CodeDefinition[];

  /**
   * Return the hatch definition for a FEMA flood zone designation.
   * Falls back to the built-in FEMA hatch library if the standard has no
   * custom overrides. Callable by FEMA Agent, Drafting Agent, and CACP.
   * @param zone e.g. 'AE', 'V', 'X Shaded', 'FLOODWAY'
   */
  getHatchForZone: (zone: string) => HatchDefinition;

  /**
   * Returns a markdown table of all available hatch patterns (built-in +
   * any custom hatches stored in the current standard) for injection into
   * agent system prompts via CACP. Agents use the Name column to reference
   * patterns when specifying polygon fills.
   */
  getHatchContextString: () => string;

  // Alias management
  confirmMatch: (raw: string, master: string) => void;
  rejectMatch: (raw: string) => void;
  clearAlias: (raw: string) => void;
  
  // State management
  reset: () => void;
  export: () => CadManagerState;
  import: (state: Partial<CadManagerState>) => void;

  // Persistence
  saveProject: (projectName: string) => Promise<void>;
  loadProject: (projectName: string) => Promise<void>;
  listProjects: () => Promise<string[]>;
  deleteProject: (projectName: string) => Promise<void>;
  lastSavedTime: string | null;
  isSaving: boolean;
  currentProjectName: string | null;
}

/**
 * Create context with undefined default (forces use of provider)
 */
const CadManagerContext = createContext<CadManagerContextType | undefined>(undefined);

/**
 * Record layer definitions for layers a newly authored code introduces.
 *
 * Only the standard's `layers` list is sent to Civil 3D, so a layer invented in
 * LandSurv.ai (by the user or an agent) would otherwise never mirror into the
 * drawing. Existing definitions are left alone — a pulled company layer keeps
 * the drawing's colour, linetype and lineweight.
 */
function withAuthoredLayers(
  existing: LayerDefinition[] | undefined,
  codes: CodeDefinition[],
): LayerDefinition[] {
  const layers = [...(existing ?? [])];
  const index = new Map<string, number>();
  layers.forEach((l, i) => {
    const key = (l?.name || '').trim().toUpperCase();
    if (key) index.set(key, i);
  });

  const record = (name: string | undefined, role: 'point' | 'line', code: CodeDefinition) => {
    const trimmed = (name || '').trim();
    if (!trimmed || trimmed === '-') return;
    const key = trimmed.toUpperCase();
    const at = index.get(key);
    if (at !== undefined) {
      layers[at] = {
        ...layers[at],
        isPointLayer: layers[at].isPointLayer || role === 'point',
        isLineLayer: layers[at].isLineLayer || role === 'line',
      };
      return;
    }
    index.set(key, layers.length);
    layers.push({
      name: trimmed,
      description: code.description,
      lineType: role === 'line' ? (code.lineType || 'CONTINUOUS') : undefined,
      isPointLayer: role === 'point' || undefined,
      isLineLayer: role === 'line' || undefined,
    });
  };

  for (const code of codes) {
    if (!code || !code.code) continue;
    record(code.pointLayer, 'point', code);
    record(code.lineLayer, 'line', code);
  }

  return layers;
}

/**
 * Reducer for state management
 */
function cadManagerReducer(state: CadManagerState, action: CadManagerAction): CadManagerState {
  switch (action.type) {
    case 'SET_STANDARD': {
      // Backfill linetypes from the USACE baseline whenever the incoming
      // standard lacks them — covers legacy .lsvz files saved before the
      // linetype library existed, AI/agent-generated standards that omit
      // them, and partial imports from .csv code lists.
      const incoming = action.payload;
      const merged = incoming && (!incoming.linetypes || incoming.linetypes.length === 0)
        ? {
            ...incoming,
            linetypes: USACE_AEC_STANDARD.linetypes,
            globalLinetypeScale: incoming.globalLinetypeScale ?? USACE_AEC_STANDARD.globalLinetypeScale ?? 1,
            textStyles: incoming.textStyles && incoming.textStyles.length > 0 ? incoming.textStyles : DEFAULT_CAD_TEXT_STYLES,
          }
        : {
            ...incoming,
            textStyles: incoming?.textStyles && incoming.textStyles.length > 0 ? incoming.textStyles : DEFAULT_CAD_TEXT_STYLES,
          };
      return {
        ...state,
        standard: merged,
        lastStandardUpload: new Date().toISOString(),
      };
    }
    
    case 'SET_ALIASES':
      return {
        ...state,
        aliases: action.payload,
        lastAliasUpdate: new Date().toISOString(),
      };
    
    case 'ADD_ALIAS':
      return {
        ...state,
        aliases: {
          ...state.aliases,
          [action.payload.raw]: action.payload.master,
        },
        aliasHistory: [...state.aliasHistory, action.payload],
        lastAliasUpdate: new Date().toISOString(),
      };
    
    case 'SET_PENDING_REVIEW':
      return {
        ...state,
        pendingReview: action.payload,
      };
    
    case 'CONFIRM_MATCH':
      const { raw, match } = action.payload;
      const masterCode = state.standard?.codes.find(c => c.code === match);
      return {
        ...state,
        aliases: {
          ...state.aliases,
          [raw]: match,
        },
        aliasHistory: [
          ...state.aliasHistory,
          {
            raw,
            master: match,
            masterDescription: masterCode?.description || '',
            confidence: 1.0,
            learnedAt: new Date().toISOString(),
          },
        ],
        pendingReview: state.pendingReview.filter(r => r.raw !== raw),
        lastAliasUpdate: new Date().toISOString(),
      };
    
    case 'REJECT_MATCH':
      return {
        ...state,
        pendingReview: state.pendingReview.filter(r => r.raw !== action.payload),
      };
    
    case 'SET_LOADING_STANDARD':
      return {
        ...state,
        isLoadingStandard: action.payload,
      };
    
    case 'SET_LOADING_INFERENCE':
      return {
        ...state,
        isLoadingInference: action.payload,
      };
    
    case 'SET_ERROR':
      return {
        ...state,
        lastError: action.payload,
      };
    
    case 'RESET':
      return createInitialCadManagerState();
    
    default:
      return state;
  }
}

/**
 * CAD Manager Provider Component
 */
export const CadManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(cadManagerReducer, undefined, createInitialCadManagerState);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [currentProjectName, setCurrentProjectName] = useState<string | null>(null);

  /**
   * Seed the baseline USACE A/E/C CADD Standard on first mount when no
   * standard is loaded (fresh app start, no .lsvz restored). User uploads
   * and .lsvz-restored standards always take priority and will not be
   * overwritten because this only fires when `state.standard` is null.
   */
  useEffect(() => {
    if (!state.standard) {
      dispatch({ type: 'SET_STANDARD', payload: USACE_AEC_STANDARD });
    } else if (!state.standard.linetypes || state.standard.linetypes.length === 0) {
      // Existing standard (e.g. restored from .lsvz) missing the linetype
      // library — re-dispatch so the reducer's backfill merges in the
      // USACE baseline linetypes. Without this the canvas can't render
      // dashed/complex linetypes for the active standard.
      dispatch({ type: 'SET_STANDARD', payload: state.standard });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Upload and parse a standards markdown file
   */
  const uploadStandard = useCallback(async (markdownContent: string, fileName?: string) => {
    dispatch({ type: 'SET_LOADING_STANDARD', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    
    try {
      const standard = await InferenceService.parseStandards(markdownContent);
      if (fileName) {
        standard.source = fileName;
      }
      dispatch({ type: 'SET_STANDARD', payload: standard });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse standards';
      dispatch({ type: 'SET_ERROR', payload: message });
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING_STANDARD', payload: false });
    }
  }, []);

  /**
   * Process survey file with unknown codes
   * Extract unique codes, filter out known aliases, send to inference API
   */
  const processSurveyFile = useCallback(
    async (surveyData: SurveyData) => {
      if (!state.standard) {
        dispatch({
          type: 'SET_ERROR',
          payload: 'No standard loaded. Please upload a standard first.',
        });
        throw new Error('No standard loaded');
      }

      dispatch({ type: 'SET_LOADING_INFERENCE', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      try {
        // Filter out codes we already know about
        const unknownCodes = surveyData.rawCodes.filter(
          code => !state.aliases[code] && !state.standard!.codes.find(c => c.code === code)
        );

        if (unknownCodes.length === 0) {
          // All codes are already known
          dispatch({
            type: 'SET_PENDING_REVIEW',
            payload: [],
          });
          return;
        }

        // Call inference service
        const results = await InferenceService.inferCodes({
          unknownCodes,
          masterCodes: state.standard.codes,
          previousAliases: state.aliases,
        });

        dispatch({ type: 'SET_PENDING_REVIEW', payload: results });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to infer codes';
        dispatch({ type: 'SET_ERROR', payload: message });
        throw error;
      } finally {
        dispatch({ type: 'SET_LOADING_INFERENCE', payload: false });
      }
    },
    [state.standard, state.aliases]
  );

  /**
   * Resolve a code to its master code
   * 1. Check aliases first (learned mappings)
   * 2. Check exact match in standard
   * 3. Return as unknown
   */
  const resolveCode = useCallback(
    (rawCode: string): CodeResolution => {
      const normalizedRaw = rawCode.trim();
      const upperRaw = normalizedRaw.toUpperCase();
      
      // Check learned alias first (case-insensitive)
      const aliasKey = Object.keys(state.aliases).find(k => k.toUpperCase() === upperRaw);
      if (aliasKey) {
        const master = state.aliases[aliasKey];
        const codedef = state.standard?.codes.find(c => c.code.toUpperCase() === master.toUpperCase());
        return {
          raw: rawCode,
          master,
          description: codedef?.description || '',
          layer: codedef?.pointLayer,
          lineLayer: codedef?.lineLayer,
          lineType: codedef?.lineType,
          source: 'alias',
          confidence: 1.0,
        };
      }

      // Check if it's already a master code (case-insensitive)
      const directMatch = state.standard?.codes.find(c => c.code.toUpperCase() === upperRaw);
      if (directMatch) {
        return {
          raw: rawCode,
          master: directMatch.code,
          description: directMatch.description,
          layer: directMatch.pointLayer,
          lineLayer: directMatch.lineLayer,
          lineType: directMatch.lineType,
          source: 'standard',
          confidence: 1.0,
        };
      }

      // Check per-surveyor aliases on every code (wildcards supported, e.g. "CM*").
      // Any surveyor's alias that matches the raw code maps it to that master.
      // All terms are fuzzy-matched as word-bounded tokens so an alias like
      // "MH-SAN" still hits descriptions like "MH-SAN-8.06 TO INV 8\"PVC".
      if (state.standard) {
        for (const c of state.standard.codes) {
          if (!c.surveyorAliases) continue;
          for (const sid of Object.keys(c.surveyorAliases)) {
            const terms = normalizeSurveyorAliases(c.surveyorAliases[sid]);
            for (const term of terms) {
              // Fast path: exact case-insensitive match (covers terms that
              // contain whitespace or characters the regex wouldn't anchor).
              if (term.toUpperCase() === upperRaw) {
                return {
                  raw: rawCode,
                  master: c.code,
                  description: c.description,
                  layer: c.pointLayer,
                  lineLayer: c.lineLayer,
                  lineType: c.lineType,
                  source: 'alias',
                  confidence: 1.0,
                };
              }
              // Fuzzy: word-bounded regex (supports `*` wildcards too).
              if (aliasToRegExp(term).test(normalizedRaw)) {
                return {
                  raw: rawCode,
                  master: c.code,
                  description: c.description,
                  layer: c.pointLayer,
                  lineLayer: c.lineLayer,
                  lineType: c.lineType,
                  source: 'alias',
                  confidence: term.includes('*') ? 0.9 : 0.95,
                };
              }
            }
          }
        }
      }
      
      // Try matching by first word if the code has multiple parts (e.g., "EP BLDG" → "EP")
      if (normalizedRaw.includes(' ')) {
        const firstPart = normalizedRaw.split(' ')[0].toUpperCase();
        const partialMatch = state.standard?.codes.find(c => c.code.toUpperCase() === firstPart);
        if (partialMatch) {
          return {
            raw: rawCode,
            master: partialMatch.code,
            description: partialMatch.description,
            layer: partialMatch.pointLayer,
            lineLayer: partialMatch.lineLayer,
            lineType: partialMatch.lineType,
            source: 'standard',
            confidence: 0.9, // Slightly lower confidence for partial match
          };
        }
      }
      
      // Try matching by description (case-insensitive substring)
      const descriptionMatch = state.standard?.codes.find(c => 
        c.description.toUpperCase().includes(upperRaw) ||
        upperRaw.includes(c.description.toUpperCase())
      );
      if (descriptionMatch) {
        return {
          raw: rawCode,
          master: descriptionMatch.code,
          description: descriptionMatch.description,
          layer: descriptionMatch.pointLayer,
          lineLayer: descriptionMatch.lineLayer,
          lineType: descriptionMatch.lineType,
          source: 'standard',
          confidence: 0.8, // Lower confidence for description match
        };
      }

      // Unknown
      return {
        raw: rawCode,
        master: rawCode,
        description: 'Unknown code',
        source: 'unknown',
        confidence: 0,
      };
    },
    [state.aliases, state.standard]
  );

  /**
   * Convenience: return the pointLayer for a description, or undefined.
   */
  const resolvePointLayer = useCallback(
    (description: string): string | undefined => {
      if (!description || !state.standard) return undefined;
      const resolution = resolveCode(description);
      return resolution.source !== 'unknown' ? resolution.layer : undefined;
    },
    [resolveCode, state.standard]
  );

  /**
   * Returns a formatted context string for injection into AI prompts.
   */
  const getLayersContextString = useCallback(
    (format: 'condensed' | 'full' = 'condensed'): string => {
      const codes = state.standard?.codes ?? [];
      const definedLayers = state.standard?.layers ?? [];
      if (!codes.length && !definedLayers.length) return '';
      const lines: string[] = [
        `**CAD Layer Standard: ${state.standard?.name || 'Loaded Standard'}**`,
        '',
        'Use the following layers when assigning `layer` (for points) or line layer for linework.',
        '',
      ];
      if (format === 'condensed') {
        lines.push('| Code | Description | Point Layer | Line Layer | Linetype |');
        lines.push('|------|-------------|-------------|------------|----------|');
        for (const c of codes) {
          lines.push(
            `| ${c.code} | ${c.description} | ${c.pointLayer || '-'} | ${c.lineLayer || '-'} | ${c.lineType || 'CONTINUOUS'} |`
          );
        }
      } else {
        lines.push('| Code | Description | Point Layer | Line Layer | Linetype | Category |');
        lines.push('|------|-------------|-------------|------------|----------|----------|');
        for (const c of codes) {
          lines.push(
            `| ${c.code} | ${c.description} | ${c.pointLayer || '-'} | ${c.lineLayer || '-'} | ${c.lineType || 'CONTINUOUS'} | ${c.category || '-'} |`
          );
        }
      }

      // Layers that exist in the standard but aren't reachable through a code —
      // typically pulled straight from a drawing. They are still legal targets.
      const codeLayers = new Set<string>();
      for (const c of codes) {
        if (c.pointLayer) codeLayers.add(c.pointLayer.trim().toUpperCase());
        if (c.lineLayer) codeLayers.add(c.lineLayer.trim().toUpperCase());
      }
      const extraLayers = definedLayers
        .map(l => (l?.name || '').trim())
        .filter(name => name && !codeLayers.has(name.toUpperCase()));
      if (extraLayers.length > 0) {
        lines.push('');
        lines.push(`Additional layers available in this drawing: ${extraLayers.join(', ')}`);
      }

      lines.push('');
      lines.push(
        'IMPORTANT: Always assign the `layer` property on every point and line you generate using the table above. ' +
        'If the code is not in this table, derive a sensible layer name (e.g. "L-FEATURE-NAME").'
      );
      return lines.join('\n');
    },
    [state.standard]
  );

  /**
   * Returns all unique layer names the standard makes available.
   *
   * Codes are the primary source, but layers pulled from a drawing are legal
   * targets too — they are the company's own table, so agents must be able to
   * see them even before a code references them.
   */
  const getAllLayers = useCallback((): Array<{ name: string; isPointLayer: boolean; isLineLayer: boolean; description?: string }> => {
    const codes = state.standard?.codes ?? [];
    const definedLayers = state.standard?.layers ?? [];
    if (!codes.length && !definedLayers.length) return [];
    const map = new Map<string, { name: string; isPointLayer: boolean; isLineLayer: boolean; description?: string }>();
    for (const c of codes) {
      if (c.pointLayer && c.pointLayer !== '-') {
        const existing = map.get(c.pointLayer);
        map.set(c.pointLayer, { name: c.pointLayer, isPointLayer: true, isLineLayer: existing?.isLineLayer ?? false, description: existing?.description });
      }
      if (c.lineLayer && c.lineLayer !== '-') {
        const existing = map.get(c.lineLayer);
        map.set(c.lineLayer, { name: c.lineLayer, isPointLayer: existing?.isPointLayer ?? false, isLineLayer: true, description: existing?.description });
      }
    }
    for (const l of definedLayers) {
      const name = (l?.name || '').trim();
      if (!name || name === '-') continue;
      const existing = map.get(name);
      map.set(name, {
        name,
        isPointLayer: existing?.isPointLayer || l.isPointLayer === true,
        isLineLayer: existing?.isLineLayer || l.isLineLayer === true,
        description: existing?.description ?? l.description,
      });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [state.standard]);

  /**
   * Author / upsert codes into the loaded standard. Case-insensitive match on `code`.
   */
  const addCodes = useCallback((codes: CodeDefinition[]): CodeDefinition[] => {
    if (!codes || codes.length === 0) return [];
    const baseStandard: StandardDefinition = state.standard ?? {
      name: 'Authored Standard',
      version: '1.0',
      codes: [],
      lastUpdated: new Date().toISOString(),
    };
    const existing = [...baseStandard.codes];
    const added: CodeDefinition[] = [];
    for (const c of codes) {
      if (!c || !c.code) continue;
      const upper = c.code.trim().toUpperCase();
      if (!upper) continue;
      const idx = existing.findIndex(e => e.code.trim().toUpperCase() === upper);
      const normalized: CodeDefinition = {
        code: c.code.trim(),
        description: c.description?.trim() || c.code.trim(),
        pointLayer: c.pointLayer?.trim() || 'V-NODE',
        lineLayer: c.lineLayer?.trim() || undefined,
        lineType: c.lineType?.trim() || 'CONTINUOUS',
        category: c.category || undefined,
      };
      if (idx >= 0) {
        existing[idx] = { ...existing[idx], ...normalized };
      } else {
        existing.push(normalized);
        added.push(normalized);
      }
    }
    const next: StandardDefinition = {
      ...baseStandard,
      codes: existing,
      layers: withAuthoredLayers(baseStandard.layers, codes),
      lastUpdated: new Date().toISOString(),
    };
    dispatch({ type: 'SET_STANDARD', payload: next });
    return added;
  }, [state.standard]);

  /**
   * Return the FEMA hatch for a zone string, consulting any custom overrides
   * stored on the current standard first.
   */
  const getHatchForZone = useCallback((zone: string): HatchDefinition => {
    const custom = state.standard?.hatches ?? [];
    const z = zone.toUpperCase().trim();
    const override = custom.find(h => h.femaZone?.toUpperCase() === z || h.name.toUpperCase() === z);
    return override ?? getHatchForFemaZone(zone);
  }, [state.standard]);

  /**
   * Returns a markdown context string of all available hatch patterns.
   */
  const getHatchContextString = useCallback((): string => {
    return buildHatchContextString(state.standard?.hatches ?? []);
  }, [state.standard]);

  /**
   * Seed the boundary-special codes if missing. Idempotent.
   */
  const ensureDefaultBoundaryCodes = useCallback((): CodeDefinition[] => {
    const defaults: CodeDefinition[] = [
      { code: 'DEED', description: 'Deed / Property Boundary', pointLayer: 'V-PROP-CORN', lineLayer: 'L-DEED-BOUNDARY', lineType: 'CONTINUOUS', category: 'Boundary' },
      { code: 'INCL', description: 'Inclusion Boundary',       pointLayer: 'V-NODE',      lineLayer: 'L-INCLUSION',     lineType: 'CONTINUOUS', category: 'Boundary' },
      { code: 'EXCL', description: 'Exclusion Boundary',       pointLayer: 'V-NODE',      lineLayer: 'L-EXCLUSION',     lineType: 'DASHED',     category: 'Boundary' },
      { code: 'BRKL', description: 'Breakline (TIN)',          pointLayer: 'V-NODE',      lineLayer: 'L-BREAKLINE',     lineType: 'CONTINUOUS', category: 'Topography' },
    ];
    const existingCodes = new Set((state.standard?.codes ?? []).map(c => c.code.trim().toUpperCase()));
    const missing = defaults.filter(d => !existingCodes.has(d.code.toUpperCase()));
    if (missing.length === 0) return [];
    return addCodes(missing);
  }, [state.standard, addCodes]);

  /**
   * User confirms an AI-suggested match
   */
  const confirmMatch = useCallback((raw: string, master: string) => {
    dispatch({ type: 'CONFIRM_MATCH', payload: { raw, match: master } });
  }, []);

  /**
   * User rejects an AI-suggested match
   */
  const rejectMatch = useCallback((raw: string) => {
    dispatch({ type: 'REJECT_MATCH', payload: raw });
  }, []);

  /**
   * Remove a learned alias
   */
  const clearAlias = useCallback((raw: string) => {
    const newAliases = { ...state.aliases };
    delete newAliases[raw];
    dispatch({ type: 'SET_ALIASES', payload: newAliases });
  }, [state.aliases]);

  /**
   * Reset all state
   */
  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  /**
   * Export state for .lsvz persistence
   */
  const exportState = useCallback((): CadManagerState => {
    return state;
  }, [state]);

  /**
   * Import state from .lsvz file
   */
  const importState = useCallback((partial: Partial<CadManagerState>) => {
    // Restore standard
    if (partial.standard) {
      dispatch({ type: 'SET_STANDARD', payload: partial.standard });
    }
    // Restore aliases
    if (partial.aliases) {
      dispatch({ type: 'SET_ALIASES', payload: partial.aliases });
    }
    // Restore alias history if present
    if (partial.aliasHistory) {
      // This would require a new action type, keeping simple for now
    }
  }, []);

  /**
   * Save project to .lsvz file
   */
  const saveProject = useCallback(
    async (projectName: string) => {
      setIsSaving(true);
      try {
        // Convert aliases object to array of CodeAlias
        const confirmedAliases = Object.entries(state.aliases).map(([unknownCode, masterCode]) => ({
          unknownCode,
          masterCode,
        }));

        await LsvzPersistence.saveProject(
          projectName,
          state.standard,
          confirmedAliases
        );

        setCurrentProjectName(projectName);
        setLastSavedTime(new Date().toISOString());
        console.log(`[CadManagerContext] Project saved: ${projectName}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[CadManagerContext] Save error:', message);
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [state.aliases, state.standard]
  );

  /**
   * Load project from .lsvz file
   */
  const loadProject = useCallback(async (projectName: string) => {
    try {
      const projectData = await LsvzPersistence.loadProject(projectName);
      if (!projectData) {
        throw new Error('Project not found');
      }

      // Restore state
      if (projectData.standard) {
        dispatch({ type: 'SET_STANDARD', payload: projectData.standard });
      }

      // Convert CodeAlias[] back to aliases object
      const aliasesObject = projectData.confirmedAliases.reduce(
        (acc, alias) => ({
          ...acc,
          [alias.unknownCode]: alias.masterCode,
        }),
        {} as Record<string, string>
      );

      if (Object.keys(aliasesObject).length > 0) {
        dispatch({ type: 'SET_ALIASES', payload: aliasesObject });
      }

      setCurrentProjectName(projectName);
      setLastSavedTime(projectData.metadata.modified);
      console.log(`[CadManagerContext] Project loaded: ${projectName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[CadManagerContext] Load error:', message);
      throw error;
    }
  }, []);

  /**
   * List all saved projects
   */
  const listProjects = useCallback(async (): Promise<string[]> => {
    try {
      return await LsvzPersistence.listProjects();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[CadManagerContext] List error:', message);
      throw error;
    }
  }, []);

  /**
   * Delete project
   */
  const deleteProject = useCallback(async (projectName: string) => {
    try {
      await LsvzPersistence.deleteProject(projectName);
      if (currentProjectName === projectName) {
        setCurrentProjectName(null);
        setLastSavedTime(null);
      }
      console.log(`[CadManagerContext] Project deleted: ${projectName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[CadManagerContext] Delete error:', message);
      throw error;
    }
  }, [currentProjectName]);

  const value: CadManagerContextType = {
    state,
    dispatch,
    uploadStandard,
    processSurveyFile,
    resolveCode,
    resolvePointLayer,
    getLayersContextString,
    getAllLayers,
    addCodes,
    ensureDefaultBoundaryCodes,
    getHatchForZone,
    getHatchContextString,
    confirmMatch,
    rejectMatch,
    clearAlias,
    reset,
    export: exportState,
    import: importState,
    saveProject,
    loadProject,
    listProjects,
    deleteProject,
    lastSavedTime,
    isSaving,
    currentProjectName,
  };

  return (
    <CadManagerContext.Provider value={value}>
      {children}
    </CadManagerContext.Provider>
  );
};

/**
 * Hook to use CAD Manager context
 * Throws if used outside of CadManagerProvider
 */
export const useCadManager = (): CadManagerContextType => {
  const context = useContext(CadManagerContext);
  if (!context) {
    throw new Error('useCadManager must be used within CadManagerProvider');
  }
  return context;
};

/**
 * Hook to use CAD Manager context (alternative name for compatibility)
 */
export const useCadManagerContext = (): CadManagerContextType => {
  return useCadManager();
};
