/**
 * Contour layer resolution.
 *
 * The Contouring Agent must not invent or leave contour linework on the
 * zero layer. Ask the CAD Manager for the current standard's CONTN (minor)
 * and CONTM (major) layers through CACP, then stamp those names onto the
 * generated SurveyLines.
 */
import { AgentType } from '../types.ts';
import { interAgentComm } from './InterAgentCommunication.ts';

export interface ContourLineLayerAssignment {
  majorLayer: string;
  minorLayer: string;
  majorLineType: string;
  minorLineType: string;
  source: 'cacp' | 'fallback';
}

export const DEFAULT_CONTOUR_LINE_LAYERS: ContourLineLayerAssignment = {
  majorLayer: 'C-TOPO-MAJR',
  minorLayer: 'C-TOPO-MINR',
  majorLineType: 'DASHED',
  minorLineType: 'DASHED',
  source: 'fallback',
};

interface ResolvedContourCode {
  lineLayer?: string;
  lineType?: string;
}

function lineLayerFrom(value: unknown): ResolvedContourCode {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const lineLayer = typeof record.lineLayer === 'string' ? record.lineLayer.trim() : '';
  const lineType = typeof record.lineType === 'string' ? record.lineType.trim() : '';
  return {
    lineLayer: lineLayer && lineLayer !== '-' ? lineLayer : undefined,
    lineType: lineType && lineType !== '-' ? lineType : undefined,
  };
}

/**
 * Resolve the contour layers through the CAD Manager CACP skill.
 *
 * `cad_resolve_batch` is used so both the minor and major contour codes are
 * resolved in one CACP transaction. When the CAD Manager handler is not mounted
 * (unit tests, early startup) the USACE baseline layers are used rather than
 * leaving the lines on "(no layer)".
 */
export async function resolveContourLineLayersViaCacp(): Promise<ContourLineLayerAssignment> {
  const fallback = { ...DEFAULT_CONTOUR_LINE_LAYERS };
  const hasBatchHandler = interAgentComm
    .getStats()
    .handlers.some(handler => handler.command === 'cad_resolve_batch' && handler.handlerCount > 0);
  if (!hasBatchHandler) {
    return fallback;
  }

  try {
    const response = await interAgentComm.request(
      AgentType.CONTOURING_AGENT,
      AgentType.CAD_MANAGER,
      'cad_resolve_batch',
      { codes: ['CONTN', 'CONTM'] },
      2_000,
    );
    if (!response.success) return fallback;

    const results = Array.isArray(response.data?.results)
      ? (response.data.results as unknown[])
      : [];
    const byCode = new Map<string, ResolvedContourCode>();
    for (const result of results) {
      if (!result || typeof result !== 'object') continue;
      const code = String((result as Record<string, unknown>).code ?? '').trim().toUpperCase();
      if (code) byCode.set(code, lineLayerFrom(result));
    }

    const minor = byCode.get('CONTN');
    const major = byCode.get('CONTM');
    return {
      minorLayer: minor?.lineLayer ?? fallback.minorLayer,
      majorLayer: major?.lineLayer ?? fallback.majorLayer,
      minorLineType: minor?.lineType ?? fallback.minorLineType,
      majorLineType: major?.lineType ?? fallback.majorLineType,
      source: minor?.lineLayer || major?.lineLayer ? 'cacp' : 'fallback',
    };
  } catch {
    return fallback;
  }
}
