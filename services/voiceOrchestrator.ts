export type VoiceDrawingKind = 'building' | 'road' | 'utility' | 'boundary' | 'topo' | 'unknown';

export type VoiceTaskRisk = 'low' | 'medium' | 'high';

export interface VoiceExecutableTask {
  id: string;
  label: string;
  description: string;
  risk: VoiceTaskRisk;
  confidence: number;
  command: 'askPeer';
  skillId: string;
  payload: Record<string, unknown>;
}

export interface VoiceLayerSuggestion {
  kind: VoiceDrawingKind;
  layer: string;
  confidence: number;
  reason: string;
}

const KIND_PATTERNS: Array<{ kind: VoiceDrawingKind; regex: RegExp }> = [
  { kind: 'building', regex: /\b(building|buildings|structure|structures|footprint|house|houses)\b/i },
  { kind: 'road', regex: /\b(road|roads|street|streets|pavement|edge\s*of\s*pavement|centerline|cl)\b/i },
  { kind: 'utility', regex: /\b(utility|utilities|water|sewer|storm|drain|electric|power|gas|telecom)\b/i },
  { kind: 'boundary', regex: /\b(boundary|parcel|lot\s*line|property\s*line|tract|deed)\b/i },
  { kind: 'topo', regex: /\b(topo|contour|breakline|grade|grading|surface)\b/i },
];

const LAYER_HINTS: Record<Exclude<VoiceDrawingKind, 'unknown'>, string[]> = {
  building: ['L-BUILDING', 'BUILDING', 'BLDG', 'STRUCTURE'],
  road: ['L-ROAD', 'ROAD', 'PAVE', 'PAVEMENT', 'CENTERLINE', 'CL'],
  utility: ['L-UTIL', 'UTIL', 'WATER', 'SEWER', 'STORM', 'ELEC', 'GAS'],
  boundary: ['L-BOUNDARY', 'BOUNDARY', 'PARCEL', 'PROP', 'DEED', 'LOT'],
  topo: ['L-TOPO', 'TOPO', 'CONTOUR', 'BREAKLINE', 'GRADE'],
};

const normalizeLayer = (name: string): string => name.toUpperCase().replace(/[^A-Z0-9]+/g, '');

export const classifyDrawingIntent = (utterance: string): VoiceDrawingKind => {
  const text = utterance.trim();
  if (!text) return 'unknown';
  for (const pattern of KIND_PATTERNS) {
    if (pattern.regex.test(text)) return pattern.kind;
  }
  return 'unknown';
};

const findLayerForKind = (kind: VoiceDrawingKind, availableLayers: string[]): { layer: string; confidence: number } | null => {
  if (kind === 'unknown' || availableLayers.length === 0) return null;

  const hints = LAYER_HINTS[kind];
  const normalizedLayers = availableLayers.map(layer => ({ layer, norm: normalizeLayer(layer) }));

  for (const hint of hints) {
    const normHint = normalizeLayer(hint);
    const exact = normalizedLayers.find(l => l.norm === normHint);
    if (exact) return { layer: exact.layer, confidence: 0.95 };
  }

  for (const hint of hints) {
    const normHint = normalizeLayer(hint);
    const partial = normalizedLayers.find(l => l.norm.includes(normHint) || normHint.includes(l.norm));
    if (partial) return { layer: partial.layer, confidence: 0.8 };
  }

  return null;
};

export const suggestLayerForUtterance = (utterance: string, availableLayers: string[]): VoiceLayerSuggestion | null => {
  const kind = classifyDrawingIntent(utterance);
  const layerMatch = findLayerForKind(kind, availableLayers);
  if (!layerMatch) return null;

  return {
    kind,
    layer: layerMatch.layer,
    confidence: layerMatch.confidence,
    reason: `Detected ${kind} intent from your response and matched it to ${layerMatch.layer}.`,
  };
};

export const shouldPromptForDrawingIntent = (args: {
  isDrawing: boolean;
  activeDrawingLayer: string;
  nowMs: number;
  lastPromptAtMs: number;
  cooldownMs?: number;
  justEnteredDrawingMode?: boolean;
}): boolean => {
  const cooldownMs = args.cooldownMs ?? 45000;
  if (!args.isDrawing) return false;
  if (args.activeDrawingLayer.trim()) return false;
  if (!args.justEnteredDrawingMode) return false;
  return args.nowMs - args.lastPromptAtMs >= cooldownMs;
};

export const getTaskSuggestionsForKind = (kind: VoiceDrawingKind): string[] => {
  switch (kind) {
    case 'building':
      return [
        'Delegate to Structures Agent to draft building footprints from available points.',
        'Check and normalize all structure lines onto the selected building layer.',
        'Auto-label building corners and frontage dimensions for review.',
      ];
    case 'road':
      return [
        'Generate centerline stationing points from the current alignment.',
        'Run a quick QC pass for parallel edge consistency and gaps.',
        'Suggest curb, edge-of-pavement, and centerline layer normalization.',
      ];
    case 'utility':
      return [
        'Suggest utility symbology and linetypes by utility class.',
        'Check layer consistency for water, sewer, storm, and power runs.',
        'Propose stakeout points at utility intersections and bends.',
      ];
    case 'boundary':
      return [
        'Run closure check on active boundary and surface ambiguities.',
        'Suggest boundary/inclusion/exclusion layer cleanup before export.',
        'Prepare legal-description-ready geometry summary.',
      ];
    case 'topo':
      return [
        'Generate contours from visible points at a recommended interval.',
        'Tag breaklines and run steep-slope analysis preview.',
        'Normalize contour major/minor layer usage before export.',
      ];
    default:
      return [
        'Propose the best layer once you tell me what feature you are drawing.',
        'Suggest next drafting tasks based on your active tool and geometry.',
      ];
  }
};

export const getExecutableTasksForKind = (kind: VoiceDrawingKind): VoiceExecutableTask[] => {
  switch (kind) {
    case 'building':
      return [
        {
          id: 'building-draft-footprints',
          label: 'Draft building footprints',
          description: 'Delegate to Structures Agent to draw building footprints from available project context.',
          risk: 'medium',
          confidence: 0.86,
          command: 'askPeer',
          skillId: 'structures_draw_footprints',
          payload: {},
        },
        {
          id: 'building-ensure-layers',
          label: 'Ensure default boundary layers',
          description: 'Seed default CAD boundary layers if missing for consistent drafting output.',
          risk: 'low',
          confidence: 0.9,
          command: 'askPeer',
          skillId: 'cad_ensure_default_layers',
          payload: {},
        },
      ];
    case 'boundary':
      return [
        {
          id: 'boundary-shrinkwrap',
          label: 'Run shrinkwrap on visible points',
          description: 'Delegate to COGO to compute and draw a convex hull around the current point set.',
          risk: 'medium',
          confidence: 0.84,
          command: 'askPeer',
          skillId: 'cogo_shrinkwrap',
          payload: {},
        },
        {
          id: 'boundary-ensure-layers',
          label: 'Ensure default boundary layers',
          description: 'Seed DEED/INCL/EXCL/BRKL default CAD layers if missing.',
          risk: 'low',
          confidence: 0.95,
          command: 'askPeer',
          skillId: 'cad_ensure_default_layers',
          payload: {},
        },
      ];
    default:
      return [];
  }
};
