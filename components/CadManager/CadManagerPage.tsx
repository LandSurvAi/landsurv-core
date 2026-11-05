/**
 * CAD Manager Page
 * 
 * Main page orchestrating the entire CAD Manager feature.
 * Combines StandardUpload and StandardsBuilder components.
 * 
 * Features:
 * - Two-tab interface: Upload existing standards OR build with AI
 * - Linetypes are auto-generated from code definitions (lineType property)
 * - Multi-format file support for standards and codes
 * - Direct export to Civil 3D when connected
 * - Session management (save/load)
 * 
 * Key Flow:
 * 1. User creates standards (Upload or AI Build)
 * 2. Codes have lineType property that maps to layer linetype
 * 3. Push Layers creates layers WITH linetype assignment
 * 4. Lines drawn on those layers inherit the linetype from the layer
 */

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Download,
  FolderOpen,
  KeyRound,
  Layers,
  LayoutGrid,
  ListTree,
  Loader2,
  Plus,
  PlugZap,
  RefreshCw,
  Save,
  Sparkles,
  Table2,
  Upload,
} from 'lucide-react';
import { useCadManagerContext } from '../../contexts/CadManagerContext';
import { useMirrorError } from '../../hooks/useMirrorError';
import { InferenceService } from '../../services/InferenceService';
import {
  StandardDefinition,
  InferenceResult,
  AliasMapping,
  LinetypeDefinition,
  LinetypeFile,
} from '../../contexts/types/CadManager.types';
import { StandardUpload } from './StandardUpload';
import { StandardsBuilder, ChatMessage } from './StandardsBuilder';
import { SurveyUpload } from './SurveyUpload';
import { LinetypeUpload } from './LinetypeUpload';
import { SymbolLibraryPanel } from './SymbolLibraryPanel';
import { ReviewModal } from './ReviewModal';
import { generateLinetypesFromCodes } from '../../utils/markdownTableParser';
import { StandardsEditor } from './StandardsEditor';
import { SessionModal } from './SessionModal';
import { validateStandardLayers } from '../../utils/aecLayerValidation';
import { primeStandardWithDrawingLayers, buildStandardFromDrawingLayers, type PulledDrawingLayer } from '../../utils/c3dLayerStandard';
import { LayerAnalysisChat, LayerInfo } from './LayerAnalysisChat';
import { HatchManagerPanel } from './HatchManagerPanel';
import {
  saveSession,
  getSession,
  getActiveSessionId,
  setActiveSessionId,
  clearActiveSession,
  dedupeSessions,
  findSessionIdByName,
  CadManagerSession,
  CadManagerChatMessage,
} from './CadManagerSessionStorage';

type StandardsTab = 'upload' | 'build' | 'pull' | 'survey' | 'linetypes' | 'symbols' | 'hatch';

interface Phase {
  name: string;
  complete: boolean;
  description: string;
}

interface CadManagerPageProps {
  c3dSessionToken?: string | null;
  isC3DConnected?: boolean;
  sendToC3D?: <T = any>(tool: string, args: Record<string, any>) => Promise<T>;
  reconnectWebSocket?: () => void;
}

/**
 * CadManagerPage Component
 * 
 * Main orchestration for CAD Manager workflow.
 */
export const CadManagerPage: React.FC<CadManagerPageProps> = ({
  c3dSessionToken,
  isC3DConnected = false,
  sendToC3D,
  reconnectWebSocket,
}) => {
  // Context
  const { state, dispatch } = useCadManagerContext();

  // Local state
  const [currentStandard, setCurrentStandard] = useState<StandardDefinition | null>(null);
  const [unknownCodes, setUnknownCodes] = useState<string[]>([]);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useMirrorError(error, { title: 'CAD Manager', kind: 'cadmanager-error' });
  const [standardsTab, setStandardsTab] = useState<StandardsTab>('build');
  const [generatedMarkdown, setGeneratedMarkdown] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [includeSymbolGeometry, setIncludeSymbolGeometry] = useState(true);  // Toggle for symbol geometry in legend
  
  // Open drawings state (for pulling layers from C3D)
  const [openDrawings, setOpenDrawings] = useState<{ name: string; fullPath: string; isActive: boolean; layerCount: number }[]>([]);
  const [selectedDrawing, setSelectedDrawing] = useState<string>('');
  const [isLoadingDrawings, setIsLoadingDrawings] = useState(false);
  const [pulledLayers, setPulledLayers] = useState<PulledDrawingLayer[]>([]);
  const [isAnalyzingLayers, setIsAnalyzingLayers] = useState(false);  // AI analysis mode
  /** Session opened by the last layer pull, so AI refinement updates it in place. */
  const [pullSessionId, setPullSessionId] = useState<string | null>(null);
  
  // Session management state
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentSessionName, setCurrentSessionName] = useState<string>('Untitled Session');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [surveyFileName, setSurveyFileName] = useState<string | undefined>();

  // Phases
  const phases: Phase[] = [
    {
      name: '1. Define Standards',
      complete: !!currentStandard,
      description: 'Upload file or build with AI',
    },
    {
      name: '2. Review & Confirm',
      complete: Object.keys(state.aliases || {}).length > 0,
      description: 'Verify codes and confirm',
    },
  ];

  /**
   * Handle standard parsed (from upload)
   */
  const handleStandardParsed = (standard: StandardDefinition) => {
    console.log(`[CadManagerPage] Standard uploaded: ${standard.name}`);
    setCurrentStandard(standard);
    setError(null);

    // Auto-generate linetypes from code definitions if not already present
    if (!standard.linetypes || standard.linetypes.length === 0) {
      const generatedLinetypes = generateLinetypesFromCodes(standard.codes);
      if (generatedLinetypes.length > 0) {
        standard.linetypes = generatedLinetypes;
        console.log(`[CadManagerPage] Auto-generated ${generatedLinetypes.length} linetypes from codes`);
      }
    }

    // Dispatch to context
    dispatch({
      type: 'SET_STANDARD',
      payload: standard,
    });
  };

  /**
   * Handle standard generated (from AI builder)
   */
  const handleStandardGenerated = (standard: StandardDefinition, markdown: string) => {
    console.log(`[CadManagerPage] Standard generated: ${standard.name} with ${standard.codes.length} codes`);
    setCurrentStandard(standard);
    setGeneratedMarkdown(markdown);
    setError(null);

    // Auto-generate linetypes from code definitions if not already present
    if (!standard.linetypes || standard.linetypes.length === 0) {
      const generatedLinetypes = generateLinetypesFromCodes(standard.codes);
      if (generatedLinetypes.length > 0) {
        standard.linetypes = generatedLinetypes;
        console.log(`[CadManagerPage] Auto-generated ${generatedLinetypes.length} linetypes from codes`);
      }
    }

    // Dispatch to context
    dispatch({
      type: 'SET_STANDARD',
      payload: standard,
    });
  };

  /**
   * Handle codes extracted
   */
  const handleCodesExtracted = (codes: string[]) => {
    console.log(`[CadManagerPage] Codes extracted: ${codes.length}`);
    setUnknownCodes(codes);
    setError(null);

    // Set pending review in context
    dispatch({
      type: 'SET_PENDING_REVIEW',
      payload: codes.map(code => ({
        raw: code,
        match: '',
        confidence: 0,
        reasoning: 'Pending review',
      })),
    });

    // Open review modal
    setIsReviewOpen(true);
  };

  /**
   * Handle matches confirmed
   */
  const handleMatchesConfirmed = (results: InferenceResult[]) => {
    console.log(`[CadManagerPage] ${results.length} matches confirmed`);

    // Store results in pending review first
    dispatch({
      type: 'SET_PENDING_REVIEW',
      payload: results,
    });

    // Confirm each match with a valid master code
    results
      .filter(r => r.match)
      .forEach(r => {
        dispatch({
          type: 'CONFIRM_MATCH',
          payload: { raw: r.raw, match: r.match },
        });
      });

    setIsReviewOpen(false);
    setError(null);

    // Clear for next batch
    setUnknownCodes([]);
  };

  /**
   * Handle alias change (during review)
   */
  const handleAliasChange = (alias: { unknownCode: string; masterCode: string }) => {
    console.log(`[CadManagerPage] Alias change: ${alias.unknownCode} → ${alias.masterCode}`);
    // Could emit to parent or update local state if needed
  };

  /**
   * Handle cancel review
   */
  const handleReviewCancel = () => {
    console.log('[CadManagerPage] Review cancelled');
    setIsReviewOpen(false);
    setUnknownCodes([]);
  };

  /**
   * Handle save from StandardsEditor
   *
   * Commits the edited standard to the in-memory CadManager context only.
   * We intentionally do NOT write to localStorage here — persistence to
   * disk is reserved for the explicit "Save Session" button so a refresh
   * starts with a clean slate unless the user opted in.
   */
  const handleEditorSave = (updatedStandard: StandardDefinition) => {
    console.log(`[CadManagerPage] Standard saved from editor: ${updatedStandard.codes.length} codes`);
    setCurrentStandard(updatedStandard);
    dispatch({
      type: 'SET_STANDARD',
      payload: updatedStandard,
    });
    setHasUnsavedChanges(true);
    setIsEditorOpen(false);
  };

  /**
   * Open the full-screen spreadsheet editor, initializing an empty standard if
   * the user hasn't loaded or generated one yet so they can author from scratch.
   */
  const handleOpenSpreadsheetEditor = useCallback(() => {
    if (!currentStandard) {
      const starter: StandardDefinition = state.standard ?? {
        name: currentSessionName && currentSessionName !== 'Untitled Session'
          ? currentSessionName
          : 'Custom CAD Standard',
        description: 'Created in CAD Standards Spreadsheet Editor',
        codes: [],
        layers: [],
        linetypes: [],
      };
      setCurrentStandard(starter);
      dispatch({ type: 'SET_STANDARD', payload: starter });
    }
    setIsEditorOpen(true);
  }, [currentStandard, state.standard, currentSessionName, dispatch]);

  /**
   * Export standards to Civil 3D via MCP
   * This creates the Description Key Set and layers in Civil 3D
   */
  const handleExportToC3D = async () => {
    if (!currentStandard) return;
    
    setIsExporting(true);
    setError(null);
    setExportSuccess(null);
    
    try {
      // Build the export payload for MCP import_cad_manager_config tool
      const exportPayload = {
        standardName: currentStandard.name,
        codes: currentStandard.codes.map(code => ({
          code: code.code,
          description: code.description,
          pointLayer: code.pointLayer,
          lineLayer: code.lineLayer || null,
          lineType: code.lineType || 'Continuous',
          symbol: code.symbol || code.code,
          category: code.category || 'General',
          aliases: code.aliases || [],
        })),
        descriptionKeySetName: `CAD Manager - ${currentStandard.name}`,
        createLayers: true,
        updateExisting: true,
      };
      
      // Copy to clipboard for MCP use
      await navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2));
      
      setExportSuccess(`Full config copied! Use import_cad_manager_config in MCP.`);
      
      // Also trigger download as JSON file
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentStandard.name.replace(/\s+/g, '-')}-full-export.json`;
      a.click();
      URL.revokeObjectURL(url);
      
    } catch (err) {
      setError(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Export ONLY layers to Civil 3D
   * Creates all unique layers referenced by the codes
   * If connected to C3D, pushes directly; otherwise downloads JSON
   */
  const handleExportLayers = async () => {
    if (!currentStandard) return;
    
    setIsExporting(true);
    setError(null);
    setExportSuccess(null);
    
    try {
      // Build a map of layer -> linetype from code definitions
      // This allows per-layer linetype assignment from the standards
      const layerLinetypeMap = new Map<string, string>();
      currentStandard.codes.forEach(code => {
        // If code has a lineLayer and lineType, associate them
        if (code.lineLayer && code.lineLayer !== '-' && code.lineType && code.lineType !== '-') {
          layerLinetypeMap.set(code.lineLayer, code.lineType.toUpperCase());
        }
      });
      
      // Collect all unique layers
      const allLayers = new Set<string>();
      currentStandard.codes.forEach(code => {
        if (code.pointLayer && code.pointLayer !== '-') allLayers.add(code.pointLayer);
        if (code.lineLayer && code.lineLayer !== '-') allLayers.add(code.lineLayer);
      });
      
      // Smart linetype inference based on layer naming convention
      // Uses complex linetypes from landsurv.lin with embedded text (----E----, ----W----, etc.)
      // Order matters - more specific patterns first
      const inferLinetypeFromLayer = (layerName: string): string => {
        const upper = layerName.toUpperCase();
        
        // === UTILITIES - Complex linetypes with embedded text ===
        // Water → ----W----W----W----
        if (upper.includes('-WATR-') || upper.includes('-WATER-') || upper.endsWith('-WATR') || upper.endsWith('-WATER')) return 'WATER';
        // Gas → ----G----G----G----
        if (upper.includes('-GAS-') || upper.endsWith('-GAS')) return 'GAS';
        // Sanitary Sewer → ----S----S----S----
        if (upper.includes('-SSWR-') || upper.includes('-SAN-') || upper.includes('-SEWR-') || upper.includes('SEWER')) return 'SEWER';
        // Storm Drain → ----ST----ST----ST----
        if (upper.includes('-STRM-') || upper.includes('-STORM-') || upper.endsWith('-STRM') || upper.endsWith('-STORM')) return 'STORM';
        // Electric → ----E----E----E----
        if (upper.includes('-ELEC-') || upper.startsWith('C-ELEC') || upper.includes('ELECTRIC')) return 'ELECTRIC';
        // Communications/Telecom → ----T----T----T----
        if (upper.includes('-COMM-') || upper.startsWith('C-COMM') || upper.includes('-TEL-') || upper.includes('TELE') || upper.includes('PHONE')) return 'TELEPHONE';
        // Fiber → ----F----F----F----
        if (upper.includes('-FIB-') || upper.includes('FIBER') || upper.endsWith('-FIB')) return 'FIBER';
        // Cable TV → ----C----C----C----
        if (upper.includes('CABLE') || upper.includes('CATV')) return 'CABLE';
        // Irrigation → ----I----I----I----
        if (upper.includes('-IRR-') || upper.includes('IRRIG')) return 'IRRIGATION';
        // Culvert → ----CV----CV----
        if (upper.includes('CULV')) return 'CULVERT';
        // Drainage → ----D----D----D----
        if (upper.includes('-DRAN-') || upper.includes('DRAIN')) return 'DRAINAGE';
        // Fuel → ----FL----FL----
        if (upper.includes('FUEL')) return 'FUEL';
        // Steam → ----SM----SM----
        if (upper.includes('STEAM')) return 'STEAM';
        
        // Overhead utilities → --E--OH--E--OH--
        if (upper.includes('-OH') && upper.includes('ELEC')) return 'ELEC_OH';
        if (upper.includes('-OH') && (upper.includes('COMM') || upper.includes('TELE'))) return 'TELE_OH';
        
        // Underground utilities → --E--UG--E--UG--
        if (upper.includes('-UG') && upper.includes('ELEC')) return 'ELEC_UG';
        
        // === PROPERTY/BOUNDARY - Complex linetypes with text ===
        // Easements → ----ESMT----ESMT----
        if (upper.includes('-ESMT') || upper.includes('EASE') || upper.includes('EASEMENT')) return 'EASEMENT';
        // Right of Way → ----ROW----ROW----
        if (upper.includes('-ROW') || upper.includes('RIGHT-OF-WAY') || upper.includes('R-O-W')) return 'ROW';
        // Setbacks → ----SETB----SETB----
        if (upper.includes('-SETB') || upper.includes('SETBACK')) return 'SETBACK';
        // Property/Boundary lines
        if (upper.includes('-BNDRY') || upper.includes('BOUNDARY')) return 'PHANTOM';
        // Centerlines (roads, property)
        if (upper.endsWith('-CL') || upper.includes('-CL-') || upper.includes('CENTERLINE')) return 'CENTER';
        // Lot lines
        if (upper.includes('-LOT') && !upper.includes('PLOT')) return 'CONTINUOUS';
        
        // === ROAD FEATURES ===
        if (upper.includes('-ROAD-LOOP') || upper.includes('CUL-DE-SAC')) return 'HIDDEN';
        if (upper.includes('-ROAD-CL') || upper.includes('ROAD-CENTER')) return 'CENTER';
        
        // === WATER FEATURES ===
        if (upper.includes('-HWM') || upper.includes('HIGH-WATER')) return 'PHANTOM';
        if (upper.includes('-OHWM') || upper.includes('ORDINARY-HIGH')) return 'PHANTOM';
        if (upper.includes('-WETL') || upper.includes('WETLAND')) return 'DASHED';
        if (upper.includes('-FLOOD') || upper.includes('FLOODPLAIN')) return 'DASHED';
        
        // === SITE FEATURES ===
        if (upper.includes('-FNCE') || upper.includes('FENCE')) return 'FENCELINE';
        
        // Default to Continuous for topo, misc, structure layers
        return 'CONTINUOUS';
      };
      
      // Build layer definitions with sensible defaults based on naming convention
      const layerDefinitions = Array.from(allLayers).map(layerName => {
        // Assign colors based on layer prefix
        let color = 7; // Default white
        if (layerName.includes('SURV') || layerName.includes('CTRL') || layerName.includes('BNDRY')) color = 1; // Red
        else if (layerName.includes('TOPO')) color = 3; // Green
        else if (layerName.includes('STRM') || layerName.includes('STORM')) color = 4; // Cyan
        else if (layerName.includes('SSWR') || layerName.includes('SAN')) color = 30; // Orange
        else if (layerName.includes('WATR') || layerName.includes('WATER')) color = 5; // Blue
        else if (layerName.includes('GAS')) color = 50; // Yellow-orange
        else if (layerName.includes('ELEC') || layerName.includes('LITE')) color = 2; // Yellow
        else if (layerName.includes('COMM') || layerName.includes('TELE')) color = 6; // Magenta
        else if (layerName.includes('SITE') || layerName.includes('FNCE') || layerName.includes('WALL')) color = 8; // Gray
        else if (layerName.includes('VEGE') || layerName.includes('TREE')) color = 92; // Dark green
        else if (layerName.includes('BLDG')) color = 9; // Light gray
        else if (layerName.includes('ANNO')) color = 7; // White for annotation
        else if (layerName.includes('WETL') || layerName.includes('FLOOD')) color = 140; // Light blue
        
        // Get linetype from code definitions first, then infer from layer name
        let lineType = layerLinetypeMap.get(layerName);
        if (!lineType || lineType === 'CONTINUOUS') {
          lineType = inferLinetypeFromLayer(layerName);
        }
        
        return {
          name: layerName,
          color,
          lineType,
          description: `CAD Manager layer for ${layerName}`,
        };
      });
      
      // Log what we're sending for debugging
      console.log(`[CadManager] Layer linetype assignments:`);
      layerDefinitions.filter(l => l.lineType !== 'CONTINUOUS').forEach(l => {
        console.log(`  ${l.name} -> ${l.lineType}`);
      });
      
      // If connected to Civil 3D, push directly via WebSocket
      // Using WebSocket ensures command goes through same Cloud Run instance with the connection
      console.log(`[CadManager] Export check: isC3DConnected=${isC3DConnected}, sendToC3D=${!!sendToC3D}`);
      if (isC3DConnected && sendToC3D) {
        try {
          console.log(`[CadManager] Pushing ${layerDefinitions.length} layers to C3D via WebSocket...`);
          const result = await sendToC3D('create_layers_batch', { layers: layerDefinitions });
          console.log(`[CadManager] Layers pushed successfully: ${result.requestId}`);
          setExportSuccess(`🚀 ${layerDefinitions.length} layers sent to Civil 3D! Check your drawing.`);
          return;
        } catch (c3dErr) {
          console.warn('[CadManager] WebSocket C3D export failed:', c3dErr);
          // Try to reconnect and inform user
          if (reconnectWebSocket) {
            reconnectWebSocket();
            setError('Connection lost. Reconnecting... Please try again in a few seconds.');
            return;
          }
          // Fall through to download fallback
        }
      } else {
        console.log(`[CadManager] Skipping WebSocket push - C3D not connected or sendToC3D not available`);
      }
      
      // Fallback: copy to clipboard and download JSON
      const layerPayload = {
        layers: layerDefinitions,
        totalLayers: layerDefinitions.length,
      };
      
      await navigator.clipboard.writeText(JSON.stringify(layerPayload, null, 2));
      setExportSuccess(`📁 ${layerDefinitions.length} layers copied! ${isC3DConnected ? '(C3D export also sent)' : 'Use create_layer for each in MCP.'}`);
      
      // Download JSON
      const blob = new Blob([JSON.stringify(layerPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentStandard.name.replace(/\s+/g, '-')}-layers.json`;
      a.click();
      URL.revokeObjectURL(url);
      
    } catch (err) {
      setError(`Layer export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Export ONLY Description Key Set to Civil 3D
   * Creates the keys that map codes to layers/styles in Settings > Point > Description Key Sets
   */
  const handleExportDescriptionKeys = async () => {
    if (!currentStandard) return;
    
    setIsExporting(true);
    setError(null);
    setExportSuccess(null);
    
    try {
      // Build Description Key Set payload
      // This goes into: Civil 3D Settings > Point > Description Key Sets
      const descriptionKeySetPayload = {
        name: `CAD Manager - ${currentStandard.name}`,
        description: `Auto-generated from CAD Manager on ${new Date().toISOString().split('T')[0]}`,
        keys: currentStandard.codes.map(code => ({
          // The code pattern - can include wildcards like EP* to match EP, EP1, EPNW, etc.
          code: code.code,
          // Full description format - $* means "use raw description"
          format: `$* ${code.description}`,
          // Layer where COGO points are inserted
          pointLayer: code.pointLayer,
          // Point style (Civil 3D point style name)
          pointStyle: code.symbol || 'Standard',
          // Point label style 
          pointLabelStyle: 'Standard',
          // Layer for Figure/Linework (if this code draws lines in F2F)
          lineLayer: code.lineLayer && code.lineLayer !== '-' ? code.lineLayer : undefined,
          // Linework code match for connecting points
          lineworkCodeMatch: code.lineLayer && code.lineLayer !== '-' ? code.code : undefined,
          // Apply to both points and figures
          applyTo: code.lineLayer && code.lineLayer !== '-' ? 'BOTH' : 'POINTS',
        })),
      };
      
      const lineworkCount = currentStandard.codes.filter(c => c.lineLayer && c.lineLayer !== '-').length;
      
      // If connected to Civil 3D, push directly via WebSocket
      console.log(`[CadManager] Description keys export: isC3DConnected=${isC3DConnected}, sendToC3D=${!!sendToC3D}`);
      if (isC3DConnected && sendToC3D) {
        try {
          console.log(`[CadManager] Pushing ${currentStandard.codes.length} description keys to C3D via WebSocket...`);
          const result = await sendToC3D('create_description_key_set', descriptionKeySetPayload);
          console.log(`[CadManager] Description keys pushed successfully: ${result.requestId}`);
          setExportSuccess(`🚀 ${currentStandard.codes.length} description keys sent to Civil 3D! (${lineworkCount} with linework)\n\nLocation: Settings → Point → Description Key Sets`);
          return;
        } catch (c3dErr) {
          console.warn('[CadManager] WebSocket C3D description key export failed:', c3dErr);
          // Fall through to download fallback
        }
      }
      
      // Fallback: copy to clipboard and download JSON
      await navigator.clipboard.writeText(JSON.stringify(descriptionKeySetPayload, null, 2));
      setExportSuccess(`🔑 ${currentStandard.codes.length} description keys copied! (${lineworkCount} with linework)\n\nUse create_description_key_set in MCP.\n\nLocation in C3D: Settings → Point → Description Key Sets`);
      
      // Download JSON
      const blob = new Blob([JSON.stringify(descriptionKeySetPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentStandard.name.replace(/\s+/g, '-')}-description-keys.json`;
      a.click();
      URL.revokeObjectURL(url);
      
    } catch (err) {
      setError(`Description key export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Create a Layer Legend in Civil 3D
   * Draws horizontal lines (1' long) on each layer with MText labels
   * Shows the linetype/color of each layer as a visual reference
   */
  const handleCreateLegend = async () => {
    if (!currentStandard) return;
    if (!isC3DConnected || !sendToC3D) {
      setError('Layer Legend requires Civil 3D connection. Connect via sidebar "Connect C3D" first.');
      return;
    }
    
    setIsExporting(true);
    setError(null);
    setExportSuccess(null);
    
    try {
      // Collect unique linetypes that need to be loaded
      const uniqueLinetypes = new Set<string>();
      currentStandard.codes.forEach(code => {
        if (code.lineType && code.lineType !== '-' && code.lineType !== 'CONTINUOUS' && code.lineType !== 'Continuous') {
          uniqueLinetypes.add(code.lineType.toUpperCase());
        }
      });
      
      // First, load any required linetypes into the drawing
      if (uniqueLinetypes.size > 0) {
        console.log(`[CadManager] Loading ${uniqueLinetypes.size} linetypes before legend creation...`);
        
        // Get linetype definitions from standard or use common patterns
        const linetypeDefinitions = Array.from(uniqueLinetypes).map(ltName => {
          // Check if we have a definition in the standard's linetypes array
          const ltDef = currentStandard.linetypes?.find(lt => lt.name.toUpperCase() === ltName);
          if (ltDef) {
            return {
              name: ltDef.name,
              description: ltDef.description || ltDef.name,
              pattern: ltDef.pattern || [0.5, -0.25],
              isComplex: ltDef.isComplex || false,
            };
          }
          // Default patterns for common linetypes
          const commonPatterns: Record<string, number[]> = {
            'DASHED': [0.5, -0.25],
            'HIDDEN': [0.25, -0.125],
            'CENTER': [1.25, -0.25, 0.25, -0.25],
            'DASHDOT': [0.5, -0.25, 0, -0.25],
            'FENCELINE1': [0.25, -0.1, 0, -0.1, 0, -0.1],
            'FENCELINE2': [0.25, -0.1, 0.25, -0.1],
            'GAS_LINE': [0.5, -0.25, ['G', 'STANDARD', 0.1, 0, 0], -0.25],
            'BATTING': [0, -0.25, 0.25, -0.25],
          };
          return {
            name: ltName,
            description: ltName,
            pattern: commonPatterns[ltName] || [0.5, -0.25],
            isComplex: false,
          };
        });
        
        try {
          await sendToC3D('load_linetypes', { 
            linetypes: linetypeDefinitions,
            saveToFile: true,
            fileName: 'cad_manager_linetypes.lin'
          });
          console.log(`[CadManager] Linetypes loaded successfully`);
        } catch (ltErr) {
          console.warn(`[CadManager] Linetype loading warning: ${ltErr}`);
          // Continue anyway - some may already exist
        }
      }
      
      // Common survey symbol SVG paths - used when symbol is just a name string
      const commonSymbolPaths: Record<string, { svgPath: string; viewBox: string }> = {
        // Control & Monuments
        'BACKSIGHT_TARGET': { svgPath: 'M 12 2 L 12 22 M 2 12 L 22 12 M 12 8 A 4 4 0 1 0 12 16 A 4 4 0 1 0 12 8 Z', viewBox: '0 0 24 24' },
        'BENCHMARK': { svgPath: 'M 12 4 L 20 20 L 4 20 Z M 12 10 L 12 16', viewBox: '0 0 24 24' },
        'CONTROL_POINT': { svgPath: 'M 12 2 L 12 22 M 2 12 L 22 12 M 12 6 A 6 6 0 1 0 12 18 A 6 6 0 1 0 12 6 Z', viewBox: '0 0 24 24' },
        'GPS_BASE_STATION': { svgPath: 'M 12 2 L 12 22 M 2 12 L 22 12 M 8 8 L 16 16 M 16 8 L 8 16', viewBox: '0 0 24 24' },
        // Set monuments
        'IRON_PIPE_SET': { svgPath: 'M 12 4 A 8 8 0 1 0 12 20 A 8 8 0 1 0 12 4 Z M 12 8 A 4 4 0 1 0 12 16 A 4 4 0 1 0 12 8 Z', viewBox: '0 0 24 24' },
        'IRON_ROD_SET': { svgPath: 'M 12 4 A 8 8 0 1 0 12 20 A 8 8 0 1 0 12 4 Z', viewBox: '0 0 24 24' },
        'MAG_NAIL_SET': { svgPath: 'M 4 4 L 20 4 L 20 20 L 4 20 Z M 4 4 L 20 20 M 20 4 L 4 20', viewBox: '0 0 24 24' },
        'PK_NAIL_SET': { svgPath: 'M 4 4 L 20 4 L 20 20 L 4 20 Z', viewBox: '0 0 24 24' },
        'REBAR_SET': { svgPath: 'M 12 4 L 20 12 L 12 20 L 4 12 Z', viewBox: '0 0 24 24' },
        'REBAR_CAP_SET': { svgPath: 'M 12 4 L 20 12 L 12 20 L 4 12 Z M 12 8 L 16 12 L 12 16 L 8 12 Z', viewBox: '0 0 24 24' },
        // Found monuments
        'CL_MON_FOUND': { svgPath: 'M 12 4 L 20 20 L 4 20 Z', viewBox: '0 0 24 24' },
        'CONCRETE_MONUMENT_FOUND': { svgPath: 'M 4 4 L 20 4 L 20 20 L 4 20 Z', viewBox: '0 0 24 24' },
        'IRON_PIPE_FOUND': { svgPath: 'M 12 4 A 8 8 0 1 0 12 20 A 8 8 0 1 0 12 4 Z', viewBox: '0 0 24 24' },
        'IRON_ROD_FOUND': { svgPath: 'M 12 4 A 8 8 0 1 0 12 20 A 8 8 0 1 0 12 4 Z M 8 8 L 16 16 M 16 8 L 8 16', viewBox: '0 0 24 24' },
        'MAG_NAIL_FOUND': { svgPath: 'M 4 4 L 20 4 L 20 20 L 4 20 Z M 4 4 L 20 20 M 20 4 L 4 20', viewBox: '0 0 24 24' },
        'PK_NAIL_FOUND': { svgPath: 'M 4 4 L 20 4 L 20 20 L 4 20 Z M 8 8 L 16 16 M 16 8 L 8 16', viewBox: '0 0 24 24' },
        'PROPERTY_CORNER_FOUND': { svgPath: 'M 12 4 L 20 12 L 12 20 L 4 12 Z M 12 8 A 4 4 0 1 0 12 16', viewBox: '0 0 24 24' },
        'QUARTER_CORNER_FOUND': { svgPath: 'M 12 2 L 12 22 M 2 12 L 22 12 M 12 4 L 20 12 L 12 20 L 4 12 Z', viewBox: '0 0 24 24' },
        'REBAR_FOUND': { svgPath: 'M 12 4 L 20 12 L 12 20 L 4 12 Z', viewBox: '0 0 24 24' },
        'REBAR_CAP_FOUND': { svgPath: 'M 12 4 L 20 12 L 12 20 L 4 12 Z M 12 8 L 16 12 L 12 16 L 8 12 Z', viewBox: '0 0 24 24' },
        'SECTION_CORNER_FOUND': { svgPath: 'M 12 2 L 12 22 M 2 12 L 22 12 M 6 6 L 18 18 M 18 6 L 6 18', viewBox: '0 0 24 24' },
        'LOT_CORNER_FOUND': { svgPath: 'M 12 4 A 8 8 0 1 0 12 20 A 8 8 0 1 0 12 4 Z M 12 2 L 12 22', viewBox: '0 0 24 24' },
        // Staking
        'LATH': { svgPath: 'M 10 2 L 14 2 L 14 22 L 10 22 Z', viewBox: '0 0 24 24' },
        'LATH_FLAGGED': { svgPath: 'M 10 2 L 14 2 L 14 22 L 10 22 Z M 14 2 L 22 6 L 14 10', viewBox: '0 0 24 24' },
        'WOOD_STAKE': { svgPath: 'M 8 2 L 16 2 L 14 22 L 10 22 Z', viewBox: '0 0 24 24' },
        'WOOD_HUB': { svgPath: 'M 4 8 L 20 8 L 20 16 L 4 16 Z M 12 8 L 12 2 M 12 16 L 12 22', viewBox: '0 0 24 24' },
        // Utilities
        'LIGHT_POLE': { svgPath: 'M 12 2 L 12 22 M 6 4 L 18 4 L 12 10 Z', viewBox: '0 0 24 24' },
        'POWER_POLE': { svgPath: 'M 12 2 L 12 22 M 4 6 L 20 6', viewBox: '0 0 24 24' },
        'GAS_METER': { svgPath: 'M 4 8 L 20 8 L 20 16 L 4 16 Z M 8 8 L 8 16 M 16 8 L 16 16', viewBox: '0 0 24 24' },
        'GAS_VALVE': { svgPath: 'M 12 4 L 20 12 L 12 20 L 4 12 Z M 8 12 L 16 12', viewBox: '0 0 24 24' },
        // Generic
        'X': { svgPath: 'M 4 4 L 20 20 M 20 4 L 4 20', viewBox: '0 0 24 24' },
        'POINT': { svgPath: 'M 12 8 A 4 4 0 1 0 12 16 A 4 4 0 1 0 12 8 Z', viewBox: '0 0 24 24' },
        'CROSS': { svgPath: 'M 12 2 L 12 22 M 2 12 L 22 12', viewBox: '0 0 24 24' },
        'SQUARE': { svgPath: 'M 4 4 L 20 4 L 20 20 L 4 20 Z', viewBox: '0 0 24 24' },
        'TRIANGLE': { svgPath: 'M 12 4 L 20 20 L 4 20 Z', viewBox: '0 0 24 24' },
        'DIAMOND': { svgPath: 'M 12 4 L 20 12 L 12 20 L 4 12 Z', viewBox: '0 0 24 24' },
        'CIRCLE': { svgPath: 'M 12 4 A 8 8 0 1 0 12 20 A 8 8 0 1 0 12 4 Z', viewBox: '0 0 24 24' },
      };

      // Send all code data for comprehensive legend
      // Include full symbol data (SVG paths) for rendering in C3D
      const legendCodes = currentStandard.codes.map(code => {
        // Extract symbol data if it's a full SymbolDefinition object
        let symbolData = undefined;
        let symbolName = '-';
        
        if (code.symbol) {
          if (typeof code.symbol === 'object') {
            // Full SymbolDefinition with SVG paths
            symbolData = {
              svgPath: code.symbol.svgPath,
              fillPath: code.symbol.fillPath,
              viewBox: code.symbol.viewBox || '0 0 24 24',
              name: code.symbol.name,
            };
            symbolName = code.symbol.name;
          } else if (typeof code.symbol === 'string') {
            symbolName = code.symbol;
            // Look up in common symbols library
            const upperName = code.symbol.toUpperCase().replace(/[- ]/g, '_');
            const commonSym = commonSymbolPaths[upperName] || commonSymbolPaths[code.symbol];
            if (commonSym) {
              symbolData = {
                svgPath: commonSym.svgPath,
                viewBox: commonSym.viewBox,
                name: code.symbol,
              };
            }
          }
        }
        
        return {
          code: code.code,
          description: code.description || '',
          pointLayer: code.pointLayer || '-',
          lineLayer: code.lineLayer || '-',
          lineType: code.lineType || 'CONTINUOUS',
          symbol: symbolName,
          symbolData: symbolData,  // Full SVG data for C3D to render
          category: code.category || '-',
        };
      });
      
      // Sort by category then code for organized legend
      legendCodes.sort((a, b) => {
        const catCompare = (a.category || '').localeCompare(b.category || '');
        if (catCompare !== 0) return catCompare;
        return a.code.localeCompare(b.code);
      });
      
      // Build comprehensive legend payload
      // Scale for civil drawings: 4ft text, 6ft row spacing, 75ft line samples
      const legendPayload = {
        codes: legendCodes,
        startX: 0,
        startY: 0,
        textHeight: 4.0,   // 4 ft text height for civil scale
        rowSpacing: 6.0,   // 6 ft vertical spacing between rows
        title: `${currentStandard.name} - CODE LEGEND`,
        textLayer: '0',    // Put text on layer 0
        includeSymbolGeometry: includeSymbolGeometry,  // Toggle for symbol geometry rendering
        // Column widths (approximate, will adjust in C#)
        columns: ['Code', 'Description', 'Point Layer', 'Line Layer', 'Linetype', 'Line', 'Symbol', 'Category'],
      };
      
      console.log(`[CadManager] Creating legend with ${legendCodes.length} codes, ${legendCodes.filter(c => c.symbolData).length} with symbols...`);
      const result = await sendToC3D('create_layer_legend', legendPayload);
      console.log(`[CadManager] Legend created: ${result.requestId}`);
      setExportSuccess(`🎨 Code legend created!\n\n${legendCodes.length} codes with full details.\nView will zoom to legend location.`);
      
    } catch (err) {
      setError(`Legend failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Fetch open drawings from Civil 3D
   */
  const handleRefreshDrawings = async () => {
    if (!isC3DConnected || !sendToC3D) {
      setError('Connect to Civil 3D first to see open drawings.');
      return;
    }
    
    setIsLoadingDrawings(true);
    setError(null);
    
    try {
      console.log('[CadManager] Fetching open drawings from C3D...');
      const result = await sendToC3D<{
        success: boolean;
        drawings: Array<{ name: string; fullPath: string; isActive: boolean; layerCount: number }>;
        count: number;
        error?: string;
      }>('get_open_drawings', {});
      console.log('[CadManager] Open drawings result:', result);
      
      if (result.success && result.drawings) {
        setOpenDrawings(result.drawings);
        // Auto-select active drawing
        const active = result.drawings.find(d => d.isActive);
        if (active) {
          setSelectedDrawing(active.name);
        }
      } else {
        setError(result.error || 'Failed to fetch drawings');
      }
    } catch (err) {
      setError(`Failed to fetch drawings: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoadingDrawings(false);
    }
  };

  /**
   * Adopt a drawing's layer table as the active standard.
   *
   * Pressing "Pull Layers from Drawing" is the same decision as answering "Use
   * layers from CAD" in the Sync wizard, so it does the same thing: build a
   * standard whose codes are bound to the drawing's layers, open its OWN
   * session, and make that session current. Codes matter as much as the layer
   * list because every agent-facing lookup resolves layers through codes — a
   * bare layer list would leave the agents drawing on their old layers.
   *
   * The previous session is left untouched on disk, so nothing the user built
   * is silently replaced.
   */
  const adoptDrawingLayers = useCallback((
    layers: PulledDrawingLayer[],
    drawingName: string,
  ): boolean => {
    const drawingLabel = (drawingName || 'Civil 3D')
      .replace(/^.*[\\/]/, '')
      .replace(/\.dwg$/i, '')
      .trim() || 'Civil 3D';

    const standard = buildStandardFromDrawingLayers(layers, drawingLabel);
    if (standard.codes.length === 0) {
      setError(`No usable layers found in ${drawingLabel}.`);
      return false;
    }

    const linetypes = generateLinetypesFromCodes(standard.codes);
    const adopted: StandardDefinition = linetypes.length > 0 ? { ...standard, linetypes } : standard;

    try {
      const sessionName = `${drawingLabel} — C3D Layers`;
      const session = saveSession({
        // Re-pulling the same drawing refreshes its session instead of stacking
        // up another copy in the session list.
        id: findSessionIdByName(sessionName) || undefined,
        name: sessionName,
        description: adopted.description,
        standard: adopted,
        generatedMarkdown: null,
        chatHistory: [],
        unknownCodes: [],
        surveyFileName: undefined,
        aliases: {},
        standardsTab: 'pull',
      });

      setCurrentSessionId(session.id);
      setCurrentSessionName(session.name);
      setActiveSessionId(session.id);
      setPullSessionId(session.id);
      setHasUnsavedChanges(false);
    } catch (err) {
      // Storage failed — the standard still becomes active so the pull isn't lost.
      setPullSessionId(null);
      setHasUnsavedChanges(true);
      setError(`Layers adopted, but saving a new session failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    setGeneratedMarkdown(null);
    setChatHistory([]);
    setUnknownCodes([]);
    setSurveyFileName(undefined);
    dispatch({ type: 'SET_ALIASES', payload: {} });
    setCurrentStandard(adopted);
    dispatch({ type: 'SET_STANDARD', payload: adopted });

    const layerCount = adopted.layers?.length ?? 0;
    setExportSuccess(
      `✓ Now using "${adopted.name}" — ${layerCount} layer${layerCount === 1 ? '' : 's'} from ${drawingLabel} mapped to ${adopted.codes.length} codes. LandSurv.ai and its agents will draw on these layers.`
    );
    return true;
  }, [dispatch]);

  /**
   * Pull layers from selected drawing and adopt them as the active standard.
   */
  const handlePullLayers = async () => {
    if (!isC3DConnected || !sendToC3D) {
      setError('Connect to Civil 3D first.');
      return;
    }
    
    setIsLoadingDrawings(true);
    setError(null);
    
    try {
      console.log(`[CadManager] Pulling layers from: ${selectedDrawing || 'active drawing'}...`);
      const result = await sendToC3D<{
        success: boolean;
        drawingName: string;
        layers: PulledDrawingLayer[];
        count: number;
        error?: string;
      }>('get_layers_from_drawing', {
        drawingName: selectedDrawing || undefined,
        includeDetails: true,
      });
      console.log('[CadManager] Layers result:', result);
      
      if (result.success && result.layers) {
        setPulledLayers(result.layers);
        // Update selected drawing name if returned
        if (result.drawingName) {
          setSelectedDrawing(result.drawingName);
        }
        adoptDrawingLayers(
          result.layers,
          result.drawingName || selectedDrawing || openDrawings.find(d => d.isActive)?.name || 'Civil 3D',
        );
      } else {
        setError(result.error || 'Failed to pull layers');
      }
    } catch (err) {
      setError(`Failed to pull layers: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoadingDrawings(false);
    }
  };

  /**
   * Refine the pulled layer standard with AI - launches the analysis chat
   */
  const handleCreateStandardFromLayers = () => {
    if (pulledLayers.length === 0) {
      setError('No layers to create standard from. Pull layers first.');
      return;
    }
    
    // Launch AI analysis mode
    setIsAnalyzingLayers(true);
  };

  /**
   * Handle AI-generated standard from layer analysis.
   *
   * The pull already opened a session for this drawing, so the AI's richer code
   * descriptions refine THAT session rather than spawning a second one. The
   * drawing's real layer table is re-attached afterwards because the drawing —
   * not the AI — is authoritative for colour, linetype and lineweight.
   */
  const handleLayerAnalysisComplete = (standard: StandardDefinition) => {
    const drawingLabel = (selectedDrawing || 'Civil 3D')
      .replace(/^.*[\\/]/, '')
      .replace(/\.dwg$/i, '')
      .trim() || 'Civil 3D';

    // Attach the drawing's real layer table so LandSurv.ai is primed to draw
    // features onto the company's layers, and so those layers reconcile
    // cleanly instead of re-diffing on every live-sync poll.
    const primedStandard = primeStandardWithDrawingLayers(standard, pulledLayers);

    setIsAnalyzingLayers(false);

    try {
      const session = saveSession({
        id: pullSessionId || undefined,
        name: `${drawingLabel} — C3D Layers`,
        description: primedStandard.description || `Layer standard pulled from ${drawingLabel}`,
        standard: primedStandard,
        generatedMarkdown: null,
        chatHistory: [],
        unknownCodes: [],
        surveyFileName: undefined,
        aliases: {},
        standardsTab: 'pull',
      });

      setCurrentSessionId(session.id);
      setCurrentSessionName(session.name);
      setActiveSessionId(session.id);
      setPullSessionId(session.id);
      setGeneratedMarkdown(null);
      setChatHistory([]);
      setUnknownCodes([]);
      setSurveyFileName(undefined);
      dispatch({ type: 'SET_ALIASES', payload: {} });
      setHasUnsavedChanges(false);

      setCurrentStandard(primedStandard);
      dispatch({ type: 'SET_STANDARD', payload: primedStandard });
      setExportSuccess(
        `✓ Session "${session.name}" refined — ${primedStandard.codes.length} codes and ${primedStandard.layers?.length ?? 0} layers from the drawing`
      );
    } catch (err) {
      // Storage failed: still surface the standard so the pull isn't lost.
      setCurrentStandard(primedStandard);
      dispatch({ type: 'SET_STANDARD', payload: primedStandard });
      setHasUnsavedChanges(true);
      setError(
        `Created standard with ${primedStandard.codes.length} codes, but saving a new session failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  };

  /**
   * Cancel layer analysis
   */
  const handleCancelLayerAnalysis = () => {
    setIsAnalyzingLayers(false);
  };

  /**
   * Handle chat history updates from StandardsBuilder
   */
  const handleChatHistoryUpdate = useCallback((messages: ChatMessage[]) => {
    setChatHistory(messages);
    setHasUnsavedChanges(true);
  }, []);

  /**
   * Save current session
   */
  const handleSaveSession = useCallback(() => {
    if (!currentStandard && chatHistory.length <= 1) {
      setError('Nothing to save - create standards first');
      return;
    }

    try {
      const session = saveSession({
        id: currentSessionId || undefined,
        name: currentSessionName,
        description: currentStandard?.description,
        standard: currentStandard,
        generatedMarkdown,
        chatHistory: chatHistory.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
        })),
        unknownCodes,
        surveyFileName,
        aliases: state.aliases || {},
        standardsTab,
      });

      setCurrentSessionId(session.id);
      setCurrentSessionName(session.name);
      setActiveSessionId(session.id);
      setHasUnsavedChanges(false);
      
      console.log(`[CadManagerPage] Session saved: ${session.name}`);
    } catch (err) {
      setError(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [currentSessionId, currentSessionName, currentStandard, generatedMarkdown, chatHistory, unknownCodes, surveyFileName, state.aliases, standardsTab]);

  /**
   * Load a session
   */
  const handleLoadSession = useCallback((session: CadManagerSession) => {
    setCurrentSessionId(session.id);
    setCurrentSessionName(session.name);
    
    // If standard exists but has no linetypes, auto-generate them from codes
    let standardWithLinetypes = session.standard;
    if (session.standard && (!session.standard.linetypes || session.standard.linetypes.length === 0)) {
      const generatedLinetypes = generateLinetypesFromCodes(session.standard.codes);
      if (generatedLinetypes.length > 0) {
        console.log(`[CadManagerPage] Auto-generating ${generatedLinetypes.length} linetypes for loaded session`);
        standardWithLinetypes = {
          ...session.standard,
          linetypes: generatedLinetypes,
        };
      }
    }
    
    setCurrentStandard(standardWithLinetypes);
    setGeneratedMarkdown(session.generatedMarkdown);
    setChatHistory(session.chatHistory.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: new Date(m.timestamp),
    })));
    setUnknownCodes(session.unknownCodes);
    setSurveyFileName(session.surveyFileName);
    setStandardsTab(session.standardsTab);
    setActiveSessionId(session.id);
    setPullSessionId(null);
    setHasUnsavedChanges(false);

    // Update context with potentially enhanced standard
    if (standardWithLinetypes) {
      dispatch({ type: 'SET_STANDARD', payload: standardWithLinetypes });
    }
    if (Object.keys(session.aliases).length > 0) {
      Object.entries(session.aliases).forEach(([raw, match]) => {
        dispatch({ type: 'CONFIRM_MATCH', payload: { raw, match } });
      });
    }

    console.log(`[CadManagerPage] Session loaded: ${session.name}`);
  }, [dispatch]);

  /**
   * Start a new session
   */
  const handleNewSession = useCallback(() => {
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Start new session anyway?')) {
        return;
      }
    }

    setCurrentSessionId(null);
    setCurrentSessionName('Untitled Session');
    clearActiveSession();
    setPullSessionId(null);
    setPulledLayers([]);
    setCurrentStandard(null);
    setGeneratedMarkdown(null);
    setChatHistory([]);
    setUnknownCodes([]);
    setSurveyFileName(undefined);
    setStandardsTab('build');
    setHasUnsavedChanges(false);
    setError(null);
    setExportSuccess(null);

    // Reset context (use SET_ALIASES with empty object to clear)
    dispatch({ type: 'SET_ALIASES', payload: {} });
    
    console.log('[CadManagerPage] New session started');
  }, [hasUnsavedChanges, dispatch]);

  /**
   * On mount: do NOT auto-restore a saved session from localStorage.
   *
   * A page refresh should start with a clean slate — the Standards / Sessions
   * tab still lets the user explicitly load a previously-saved session via
   * the session picker. We only clear the active-session pointer so the
   * next explicit Save Session creates a new record instead of silently
   * overwriting whatever was last active.
   *
   * In-app navigation between Standards ↔ Canvas is handled by the
   * context-rehydration effect below, which pulls from the live in-memory
   * CadManager context (not from disk) so unsaved edits survive view
   * switches without leaking past a refresh.
   *
   * One-time cleanup: prior versions (v26.05.16.15 and earlier) auto-saved
   * every editor commit to localStorage. Wipe any lingering records so
   * users aren't stuck with stale persisted data they never asked to save.
   * The cleanup runs once per browser via a sentinel key.
   */
  useEffect(() => {
    const CLEANUP_KEY = 'landsurv-cad-manager-cleanup-v26.05.16.16';
    try {
      if (!localStorage.getItem(CLEANUP_KEY)) {
        localStorage.removeItem('landsurv-cad-manager-sessions');
        localStorage.removeItem('landsurv-cad-manager-active');
        localStorage.setItem(CLEANUP_KEY, new Date().toISOString());
        console.log('[CadManagerPage] One-time cleanup: cleared legacy auto-saved sessions');
      }
    } catch (err) {
      console.warn('[CadManagerPage] Legacy session cleanup failed:', err);
    }

    // One-time collapse of the identical "Untitled Session" records earlier
    // builds accumulated (see below — the active session used to be dropped on
    // every mount, so each save created a fresh record instead of updating).
    const DEDUPE_KEY = 'landsurv-cad-manager-dedupe-v26.09.07.07';
    try {
      if (!localStorage.getItem(DEDUPE_KEY)) {
        dedupeSessions();
        localStorage.setItem(DEDUPE_KEY, new Date().toISOString());
      }
    } catch (err) {
      console.warn('[CadManagerPage] Session dedupe failed:', err);
    }

    // Rehydrate the active session. This component unmounts whenever the user
    // switches views, so without restoring the id here every subsequent save
    // looked like a brand-new session and duplicated the record.
    try {
      const activeId = getActiveSessionId();
      if (activeId) {
        const active = getSession(activeId);
        if (active) {
          setCurrentSessionId(active.id);
          setCurrentSessionName(active.name);
        } else {
          clearActiveSession();
        }
      }
    } catch (err) {
      console.warn('[CadManagerPage] Active session restore failed:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Hydrate local currentStandard from the CadManager context on mount /
   * whenever the context's standard changes from underneath us.
   *
   * Why: This component unmounts when the user navigates from the Standards
   * view to the Canvas view (and any other visual panel), so its local state
   * is destroyed. The context (mounted at App level) is the source of truth
   * and already holds the most recent edits — including the surveyor roster
   * and F2F settings. Without this sync the user would see the editor reopen
   * with empty surveyors even though the data was saved correctly.
   */
  useEffect(() => {
    if (state.standard && state.standard !== currentStandard) {
      setCurrentStandard(state.standard);
    }
    // We deliberately do not depend on currentStandard — we only want to
    // rehydrate when the context's standard reference changes (e.g. after
    // a save from elsewhere or on remount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.standard]);

  /**
   * Handle keyboard shortcuts
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close modal
      if (e.key === 'Escape' && isReviewOpen) {
        handleReviewCancel();
      }

      // Ctrl+S or Cmd+S for save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveSession();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReviewOpen, handleSaveSession]);

  const totalCodes = currentStandard?.codes.length || 0;
  const totalUnknown = unknownCodes.length;
  const totalMatched = Object.keys(state.aliases || {}).length;
  
  // Calculate layer statistics
  const uniquePointLayers = currentStandard 
    ? new Set(currentStandard.codes.map(c => c.pointLayer).filter(l => l && l !== '-')).size 
    : 0;
  const uniqueLineLayers = currentStandard 
    ? new Set(currentStandard.codes.map(c => c.lineLayer).filter(l => l && l !== '-')).size 
    : 0;
  const lineworkCodes = currentStandard 
    ? currentStandard.codes.filter(c => c.lineLayer && c.lineLayer !== '-').length 
    : 0;
  const uniqueLinetypes = currentStandard 
    ? new Set(currentStandard.codes.map(c => c.lineType).filter(l => l && l !== '-' && l.toUpperCase() !== 'CONTINUOUS')).size 
    : 0;
  const uniqueSymbols = currentStandard 
    ? new Set(currentStandard.codes.map(c => c.symbol).filter(s => s && s !== '-' && s !== 'Standard')).size 
    : 0;
  
  // A/E/C CAD Standard compliance check
  const layerValidation = currentStandard 
    ? validateStandardLayers(currentStandard.codes)
    : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#070c14] text-slate-200">
      {/* Workspace header */}
      <header className="shrink-0 border-b border-white/[0.07] bg-[#0a111c]/90 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
              <Table2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[13.5px] font-semibold tracking-tight text-white">CAD Manager</h1>
                <span className="rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-cyan-300/80">
                  A2UI
                </span>
              </div>
              <p className="truncate text-[10.5px] text-slate-500">Standards workspace · codes, layers, and Civil 3D export</p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-1.5">
              <span className="text-[8.5px] font-bold uppercase tracking-[0.14em] text-slate-500">Session</span>
              <input
                type="text"
                value={currentSessionName}
                onChange={(e) => {
                  setCurrentSessionName(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="w-32 bg-transparent text-[11px] font-medium text-slate-200 outline-none placeholder:text-slate-600"
                placeholder="Session name..."
                aria-label="Session name"
              />
              {hasUnsavedChanges && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Unsaved changes" />}
            </div>
            <button
              onClick={handleOpenSpreadsheetEditor}
              data-testid="cad-manager-open-spreadsheet"
              title="Open Standards Spreadsheet Editor"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-2.5 text-[10.5px] font-semibold text-cyan-200 transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/20 hover:text-white"
            >
              <Table2 className="h-3.5 w-3.5" />
              <span>Edit Spreadsheet</span>
            </button>
            <button
              onClick={handleNewSession}
              title="Start a new session"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 text-[10.5px] font-semibold text-slate-300 transition-colors hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New</span>
            </button>
            <button
              onClick={() => setIsSessionModalOpen(true)}
              title="Manage sessions"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 text-[10.5px] font-semibold text-slate-300 transition-colors hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sessions</span>
            </button>
            <button
              onClick={handleSaveSession}
              title="Save session (Ctrl+S)"
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10.5px] font-semibold transition-colors ${
                hasUnsavedChanges
                  ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200 hover:border-cyan-300/60 hover:bg-cyan-400/20 hover:text-white'
                  : 'border-white/[0.08] bg-white/[0.025] text-slate-400 hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              <Save className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Save</span>
              {hasUnsavedChanges && <span className="h-1 w-1 rounded-full bg-cyan-300" />}
            </button>
          </div>
        </div>
      </header>

      {/* Context strip */}
      <div className="shrink-0 border-b border-white/[0.06] bg-[#080e17] px-4 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.025] px-2 py-1 text-[10px] text-slate-300">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${currentStandard ? 'bg-emerald-400' : 'bg-slate-600'}`} />
            <span className="max-w-[220px] truncate font-medium">{currentStandard?.name || 'No standard loaded'}</span>
          </span>
          <span className="rounded-md border border-white/[0.07] bg-white/[0.025] px-2 py-1 text-[10px] tabular-nums text-slate-400">
            <strong className="font-semibold text-cyan-300">{totalCodes}</strong> codes
          </span>
          <span className="hidden rounded-md border border-white/[0.07] bg-white/[0.025] px-2 py-1 text-[10px] tabular-nums text-slate-400 sm:inline">
            <strong className="font-semibold text-slate-200">{uniquePointLayers + uniqueLineLayers}</strong> layers
          </span>
          <span className="hidden rounded-md border border-white/[0.07] bg-white/[0.025] px-2 py-1 text-[10px] tabular-nums text-slate-400 md:inline">
            <strong className="font-semibold text-slate-200">{uniqueLinetypes}</strong> linetypes
          </span>
          {isC3DConnected ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Civil 3D live
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-300/90">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Civil 3D offline
            </span>
          )}
          <div className="ml-auto hidden items-center gap-1 lg:flex">
            {phases.map((phase, idx) => (
              <React.Fragment key={phase.name}>
                {idx > 0 && <ChevronRight className="h-3 w-3 text-slate-700" />}
                <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[9.5px] font-medium ${phase.complete ? 'text-emerald-300' : 'text-slate-500'}`}>
                  {phase.complete ? <CheckCircle2 className="h-3 w-3" /> : <span className="grid h-3 w-3 place-items-center rounded-full border border-slate-700 text-[7px]">{idx + 1}</span>}
                  {phase.name.replace(/^\d+\.\s*/, '')}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="shrink-0 border-b border-red-500/25 bg-red-500/[0.07] px-4 py-2">
          <p className="text-[11px] text-red-300"><strong className="font-semibold">Error:</strong> {error}</p>
        </div>
      )}

      {/* Scenario canvas */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 p-3 sm:p-4">
          <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a111c] shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
            {/* Scenario picker */}
            <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.07] bg-[#080e17]/70 p-1.5">
              {([
                { id: 'build', label: 'AI Build', icon: Sparkles },
                { id: 'upload', label: 'Import', icon: Upload },
                { id: 'pull', label: 'Pull from C3D', icon: PlugZap },
                { id: 'survey', label: 'Match Survey CSV', icon: KeyRound },
                { id: 'linetypes', label: 'Linetypes', icon: ListTree },
                { id: 'symbols', label: 'Symbols', icon: Table2 },
                { id: 'hatch', label: 'Hatches', icon: LayoutGrid },
              ] as const).map(({ id, label, icon: Icon }) => {
                const active = standardsTab === id;
                return (
                  <button
                    key={id}
                    onClick={() => setStandardsTab(id)}
                    aria-pressed={active}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10.5px] font-semibold transition-colors ${
                      active
                        ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
                        : 'border-transparent text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
              <span className="ml-auto hidden items-center gap-1.5 pr-1 text-[9px] uppercase tracking-[0.14em] text-slate-600 sm:inline-flex">
                Scenario
              </span>
            </div>

            <div className="h-[min(58vh,560px)] min-h-[420px] overflow-y-auto">
              {standardsTab === 'upload' ? (
                <StandardUpload onStandardParsed={handleStandardParsed} />
              ) : standardsTab === 'build' ? (
                <StandardsBuilder
                  onStandardGenerated={handleStandardGenerated}
                  initialChatHistory={chatHistory.length > 0 ? chatHistory : undefined}
                  onChatHistoryChange={handleChatHistoryUpdate}
                />
              ) : standardsTab === 'survey' ? (
                <div className="p-4">
                  <SurveyUpload
                    standard={currentStandard ?? state.standard}
                    onCodesExtracted={handleCodesExtracted}
                  />
                </div>
              ) : standardsTab === 'linetypes' ? (
                <div className="p-4">
                  <LinetypeUpload
                    isC3DConnected={isC3DConnected}
                    onLinetypesParsed={(ltFile: LinetypeFile) => {
                      const base = currentStandard ?? state.standard;
                      if (base) {
                        const next = { ...base, linetypes: ltFile.linetypes };
                        setCurrentStandard(next);
                        dispatch({ type: 'SET_STANDARD', payload: next });
                      }
                    }}
                    onPushToC3D={
                      isC3DConnected && sendToC3D
                        ? async (linetypes: LinetypeDefinition[]) => {
                            await sendToC3D('load_linetypes', {
                              linetypes,
                              saveToFile: true,
                              fileName: 'cad_manager_linetypes.lin',
                            });
                          }
                        : undefined
                    }
                  />
                </div>
              ) : standardsTab === 'symbols' ? (
                <div className="p-4">
                  <SymbolLibraryPanel />
                </div>
              ) : standardsTab === 'hatch' ? (
                <HatchManagerPanel
                  customHatches={state.standard?.hatches ?? []}
                  onCustomHatchesChange={(hatches) => {
                    if (state.standard) {
                      dispatch({ type: 'SET_STANDARD', payload: { ...state.standard, hatches } });
                    }
                  }}
                />
              ) : (
                <div className="p-4">
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                    <div className="mb-4 flex items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                        <PlugZap className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="text-[13px] font-semibold text-white">Adopt a drawing layer table</h2>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                          Pull the active Civil 3D drawing's layers into this session and make them the company standard.
                        </p>
                      </div>
                    </div>

                    {!isC3DConnected ? (
                      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-amber-500/25 bg-amber-500/[0.05] px-4 py-8 text-center">
                        <PlugZap className="h-6 w-6 text-amber-300/80" />
                        <p className="text-[12px] font-semibold text-amber-200">Civil 3D not connected</p>
                        <p className="max-w-sm text-[10.5px] leading-relaxed text-slate-500">
                          Connect from the Civil 3D sidebar, then return here to pull layers from the open drawing.
                        </p>
                      </div>
                    ) : isAnalyzingLayers ? (
                      <LayerAnalysisChat
                        layers={pulledLayers.map(l => ({
                          name: l.name,
                          linetype: l.linetype,
                          colorIndex: l.colorIndex,
                          description: l.description,
                        }))}
                        drawingName={selectedDrawing || openDrawings.find(d => d.isActive)?.name || 'Drawing'}
                        onStandardGenerated={handleLayerAnalysisComplete}
                        onCancel={handleCancelLayerAnalysis}
                      />
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1.5 block text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-500">Source drawing</label>
                          <div className="flex gap-1.5">
                            <select
                              value={selectedDrawing}
                              onChange={(e) => setSelectedDrawing(e.target.value)}
                              className="h-8 min-w-0 flex-1 rounded-lg border border-white/[0.09] bg-[#070d16] px-2.5 text-[11px] text-slate-200 outline-none focus:border-cyan-400/40"
                            >
                              <option value="">Active Drawing</option>
                              {openDrawings.map((d, i) => (
                                <option key={i} value={d.fullPath}>
                                  {d.isActive ? '● ' : ''}{d.name} ({d.layerCount} layers)
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={handleRefreshDrawings}
                              disabled={isLoadingDrawings}
                              title="Refresh drawing list"
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.09] bg-white/[0.025] text-slate-400 transition-colors hover:border-white/[0.16] hover:text-white disabled:opacity-40"
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingDrawings ? 'animate-spin' : ''}`} />
                            </button>
                          </div>
                        </div>

                        <button
                          onClick={handlePullLayers}
                          disabled={isLoadingDrawings}
                          className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-cyan-400/35 bg-cyan-400/10 px-3 text-[11px] font-semibold text-cyan-200 transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/20 hover:text-white disabled:opacity-40"
                        >
                          {isLoadingDrawings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          {isLoadingDrawings ? 'Loading layers…' : 'Pull layers and use them'}
                        </button>

                        {pulledLayers.length > 0 ? (
                          <div className="overflow-hidden rounded-lg border border-white/[0.07]">
                            <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] bg-white/[0.025] px-3 py-2">
                              <span className="text-[10px] text-slate-400">{pulledLayers.length} layers loaded</span>
                              <button
                                onClick={handleCreateStandardFromLayers}
                                className="inline-flex h-6 items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 text-[9.5px] font-semibold text-cyan-200 transition-colors hover:bg-cyan-400/20"
                              >
                                <Sparkles className="h-3 w-3" />
                                Refine with AI
                              </button>
                            </div>
                            <div className="max-h-64 overflow-y-auto">
                              <table className="w-full text-left text-[10.5px]">
                                <thead className="sticky top-0 bg-[#0a111c] text-[8.5px] uppercase tracking-[0.12em] text-slate-600">
                                  <tr>
                                    <th className="px-3 py-1.5 font-semibold">Layer</th>
                                    <th className="px-3 py-1.5 font-semibold">Linetype</th>
                                    <th className="px-3 py-1.5 font-semibold">Color</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.05] text-slate-300">
                                  {pulledLayers.slice(0, 50).map((layer, idx) => (
                                    <tr key={idx} className="hover:bg-white/[0.03]">
                                      <td className="px-3 py-1.5 font-mono text-[10px]">{layer.name}</td>
                                      <td className="px-3 py-1.5 text-slate-400">{layer.linetype}</td>
                                      <td className="px-3 py-1.5">
                                        <span
                                          className="inline-block h-3 w-3 rounded-sm border border-white/20"
                                          style={{ backgroundColor: `#${(layer.colorIndex * 1118481 % 16777215).toString(16).padStart(6, '0')}` }}
                                        />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {pulledLayers.length > 50 && (
                              <p className="border-t border-white/[0.05] px-3 py-1.5 text-center text-[9.5px] text-slate-600">
                                + {pulledLayers.length - 50} more layers
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-white/[0.08] px-4 py-8 text-center">
                            <Layers className="mx-auto mb-2 h-5 w-5 text-slate-600" />
                            <p className="text-[11px] text-slate-500">Pull layers to preview and adopt the drawing's layer table.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Standards intelligence */}
          <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0a111c]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-2">
              <div className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-cyan-400" />
                <h2 className="text-[11px] font-semibold text-slate-200">Standards intelligence</h2>
              </div>
              {layerValidation && layerValidation.totalLayers > 0 && (
                <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[9.5px] font-semibold ${
                  layerValidation.compliancePercentage >= 95
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                    : layerValidation.compliancePercentage >= 80
                      ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                      : 'border-red-500/25 bg-red-500/10 text-red-300'
                }`}>
                  {layerValidation.compliancePercentage >= 95 ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                  {layerValidation.compliancePercentage}% A/E/C
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 divide-x divide-white/[0.06] sm:grid-cols-6">
              {[
                ['Codes', totalCodes],
                ['Matched', totalMatched],
                ['Unknown', totalUnknown],
                ['Layers', uniquePointLayers + uniqueLineLayers],
                ['Linetypes', uniqueLinetypes],
                ['Symbols', uniqueSymbols],
              ].map(([label, value]) => (
                <div key={String(label)} className="px-2 py-2.5 text-center">
                  <p className="text-base font-bold tabular-nums text-cyan-300">{value}</p>
                  <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
                </div>
              ))}
            </div>
            {layerValidation && layerValidation.totalLayers > 0 && (
              <div className="border-t border-white/[0.06] px-3 py-2.5">
                <div className="mb-1.5 flex items-center justify-between text-[9.5px] text-slate-500">
                  <span>A/E/C layer compliance</span>
                  <span className="tabular-nums text-slate-400">{layerValidation.validLayers}/{layerValidation.totalLayers} layers</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={`h-full rounded-full ${
                      layerValidation.compliancePercentage >= 95 ? 'bg-emerald-400' : layerValidation.compliancePercentage >= 80 ? 'bg-amber-400' : 'bg-red-400'
                    }`}
                    style={{ width: `${Math.max(2, Math.min(100, layerValidation.compliancePercentage))}%` }}
                  />
                </div>
                {layerValidation.uniqueDisciplines.length > 0 && (
                  <p className="mt-1.5 text-[9.5px] text-slate-600">Disciplines: {layerValidation.uniqueDisciplines.join(', ')}</p>
                )}
              </div>
            )}
          </section>

          {/* Actions */}
          <section className="grid gap-2 sm:grid-cols-2">
            <button
              onClick={handleOpenSpreadsheetEditor}
              className="group flex items-center justify-between gap-3 rounded-xl border border-cyan-400/25 bg-cyan-400/[0.07] px-3 py-2.5 text-left transition-colors hover:border-cyan-300/45 hover:bg-cyan-400/[0.12] sm:col-span-2"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
                  <Table2 className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11.5px] font-semibold text-white">Open standards editor</span>
                  <span className="block truncate text-[9.5px] text-slate-500">Codes, layers, linetypes, symbols, F2F settings, Team Codes, and shared text styles</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-slate-300">{totalCodes}</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-cyan-300/70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </span>
            </button>
          </section>

          {currentStandard && currentStandard.codes.length > 0 ? (
            <section className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.08] bg-[#0a111c] p-3 sm:col-span-2">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Download className="h-3.5 w-3.5 text-slate-400" />
                    <h2 className="text-[11px] font-semibold text-slate-200">Export to Civil 3D</h2>
                  </div>
                  {isC3DConnected ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Connected
                    </span>
                  ) : (
                    <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold text-amber-300">
                      Connect in sidebar
                    </span>
                  )}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <button
                    onClick={handleExportLayers}
                    disabled={isExporting}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-2 text-left transition-colors hover:border-cyan-400/30 hover:bg-white/[0.05] disabled:opacity-40"
                  >
                    <span className="flex items-center gap-2 text-[10.5px] font-medium text-slate-200"><Layers className="h-3.5 w-3.5 text-cyan-300/80" />Export layers</span>
                    <span className="text-[9px] tabular-nums text-slate-500">{uniquePointLayers + uniqueLineLayers}</span>
                  </button>
                  <button
                    onClick={handleExportDescriptionKeys}
                    disabled={isExporting}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-2 text-left transition-colors hover:border-cyan-400/30 hover:bg-white/[0.05] disabled:opacity-40"
                  >
                    <span className="flex items-center gap-2 text-[10.5px] font-medium text-slate-200"><KeyRound className="h-3.5 w-3.5 text-cyan-300/80" />Description keys</span>
                    <span className="text-[9px] tabular-nums text-slate-500">{currentStandard.codes.length}</span>
                  </button>
                  <button
                    onClick={handleCreateLegend}
                    disabled={isExporting || !isC3DConnected}
                    title={!isC3DConnected ? 'Connect to Civil 3D to create the code legend table' : 'Create a full code legend table'}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-2 text-left transition-colors hover:border-cyan-400/30 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="flex items-center gap-2 text-[10.5px] font-medium text-slate-200"><ListTree className="h-3.5 w-3.5 text-cyan-300/80" />Code legend table</span>
                    <span className="text-[9px] tabular-nums text-slate-500">{currentStandard.codes.length}</span>
                  </button>
                  <button
                    onClick={handleExportToC3D}
                    disabled={isExporting}
                    className="flex items-center justify-center gap-2 rounded-lg border border-cyan-400/35 bg-cyan-400/10 px-2.5 py-2 text-[10.5px] font-semibold text-cyan-200 transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/20 hover:text-white disabled:opacity-40"
                  >
                    {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    {isExporting ? 'Exporting…' : 'Full export'}
                  </button>
                </div>
                <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-[9.5px] text-slate-500">
                  <input
                    type="checkbox"
                    checked={includeSymbolGeometry}
                    onChange={(e) => setIncludeSymbolGeometry(e.target.checked)}
                    className="h-3 w-3 rounded border-white/20 bg-transparent accent-cyan-400"
                  />
                  Include symbol geometry in the legend
                </label>
                {exportSuccess && (
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] p-2 text-[10px] text-emerald-300">{exportSuccess}</pre>
                )}
              </div>
            </section>
          ) : (
            <section className="rounded-xl border border-white/[0.08] bg-[#0a111c] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold text-slate-200">
                <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                Start with a standard
              </h2>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ['01', 'Build or import', 'Describe your firm, upload a file, or pull a Civil 3D layer table.'],
                  ['02', 'Review the sheet', 'Edit codes, layers, linetypes, symbols, and aliases.'],
                  ['03', 'Export to C3D', 'Push layers, description keys, and a code legend.'],
                ].map(([num, title, detail]) => (
                  <div key={num} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5">
                    <span className="text-[8.5px] font-bold tracking-[0.14em] text-cyan-400/70">{num}</span>
                    <p className="mt-1 text-[10.5px] font-semibold text-slate-200">{title}</p>
                    <p className="mt-0.5 text-[9.5px] leading-relaxed text-slate-500">{detail}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {totalMatched > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-[10px] text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <strong className="font-semibold">{totalMatched}</strong> code aliases confirmed
            </div>
          )}
        </div>
      </div>

      {currentStandard && isReviewOpen && (typeof document !== 'undefined' && document.body
        ? createPortal(
            <ReviewModal
              isOpen={isReviewOpen}
              unknownCodes={unknownCodes}
              standard={currentStandard}
              previousAliases={state.aliases}
              onConfirm={handleMatchesConfirmed}
              onCancel={handleReviewCancel}
              onAliasChange={handleAliasChange}
            />,
            document.body,
          )
        : (
            <ReviewModal
              isOpen={isReviewOpen}
              unknownCodes={unknownCodes}
              standard={currentStandard}
              previousAliases={state.aliases}
              onConfirm={handleMatchesConfirmed}
              onCancel={handleReviewCancel}
              onAliasChange={handleAliasChange}
            />
          ))}

      {/* Full-screen Standards Editor */}
      {isEditorOpen && (currentStandard || state.standard) && (
        <StandardsEditor
          standard={(currentStandard || state.standard)!}
          onSave={handleEditorSave}
          onClose={() => setIsEditorOpen(false)}
        />
      )}

      {/* Session Manager Modal */}
      {isSessionModalOpen && (typeof document !== 'undefined' && document.body
        ? createPortal(
            <SessionModal
              isOpen={isSessionModalOpen}
              onClose={() => setIsSessionModalOpen(false)}
              onLoadSession={handleLoadSession}
              onNewSession={handleNewSession}
              currentSessionId={currentSessionId}
            />,
            document.body,
          )
        : (
            <SessionModal
              isOpen={isSessionModalOpen}
              onClose={() => setIsSessionModalOpen(false)}
              onLoadSession={handleLoadSession}
              onNewSession={handleNewSession}
              currentSessionId={currentSessionId}
            />
          ))}
    </div>
  );
};
