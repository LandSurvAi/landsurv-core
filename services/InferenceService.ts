/**
 * Inference Service
 * 
 * Handles communication with the AI backend for:
 * 1. Parsing markdown standards files
 * 2. Inferring matches between unknown codes and master codes
 * 
 * Phase 1B: Uses real API calls to GCP backend
 * POST /api/cad-manager/parse
 * POST /api/cad-manager/infer
 */

import {
  StandardDefinition,
  InferenceRequest,
  InferenceResponse,
  InferenceResult,
  LinetypeDefinition,
} from '../contexts/types/CadManager.types';

/**
 * Get the API base URL
 * Uses relative URL in browser, or full URL for server-side
 */
function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Browser environment - use relative URL
    return window.location.origin;
  }
  // Server-side or test environment
  return process.env.API_BASE_URL || 'http://localhost:3001';
}

/**
 * Parse markdown standards file
 * 
 * Calls: POST /api/cad-manager/parse
 * 
 * Input: Markdown text
 * Output: StandardDefinition with parsed codes
 */
async function parseStandardsWithAPI(
  markdownContent: string,
  fileName?: string
): Promise<StandardDefinition> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/cad-manager/parse`;

  console.log('[InferenceService] Parsing standards via API...');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        markdownContent,
        fileName,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.message || errorData.error || 'Failed to parse standards';
      throw new Error(`${response.status}: ${errorMessage}`);
    }

    const standard = await response.json();
    console.log(
      `[InferenceService] Successfully parsed: ${standard.name} with ${standard.codes.length} codes`
    );
    return standard;
  } catch (error) {
    const err = error as Error;
    console.error('[InferenceService] Parse error:', err.message);
    throw new Error(`Failed to parse standards: ${err.message}`);
  }
}

/**
 * Infer code matches using semantic analysis
 * 
 * Calls: POST /api/cad-manager/infer
 * 
 * Input: Unknown codes + master codes + previous aliases
 * Output: InferenceResult[] with match suggestions
 */
async function inferCodesWithAPI(request: InferenceRequest): Promise<InferenceResult[]> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/cad-manager/infer`;

  console.log(
    `[InferenceService] Inferring matches for ${request.unknownCodes.length} codes via API...`
  );

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.message || errorData.error || 'Failed to infer codes';
      throw new Error(`${response.status}: ${errorMessage}`);
    }

    const data: InferenceResponse = await response.json();
    console.log(
      `[InferenceService] Inference complete in ${data.processingTime}ms using ${data.modelUsed}`
    );
    console.log(
      `[InferenceService] Matched ${data.results.length} codes with >50% confidence`
    );
    return data.results;
  } catch (error) {
    const err = error as Error;
    console.error('[InferenceService] Inference error:', err.message);
    throw new Error(`Failed to infer codes: ${err.message}`);
  }
}

/**
 * Public API for InferenceService
 * 
 * Phase 1B: Real API calls
 * All functions are async and call the backend endpoints
 */
export const InferenceService = {
  /**
   * Parse markdown standards file
   * 
   * Calls: POST /api/cad-manager/parse
   * Returns: StandardDefinition with parsed codes
   */
  parseStandards: async (markdownContent: string, fileName?: string): Promise<StandardDefinition> => {
    return parseStandardsWithAPI(markdownContent, fileName);
  },

  /**
   * Infer code matches using semantic analysis
   * 
   * Calls: POST /api/cad-manager/infer
   * Returns: InferenceResult[] with confidence scores
   */
  inferCodes: async (request: InferenceRequest): Promise<InferenceResult[]> => {
    return inferCodesWithAPI(request);
  },

  /**
   * Request survey codes from connected Civil 3D instance
   * 
   * Calls: POST /api/cad-manager/c3d/get-codes
   * Returns: Request acknowledgment (actual codes come via WebSocket)
   */
  requestC3DCodes: async (sessionId: string): Promise<{ requestId: string }> => {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/cad-manager/c3d/get-codes`;

    console.log('[InferenceService] Requesting survey codes from Civil 3D...');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to request codes from Civil 3D');
    }

    const data = await response.json();
    console.log(`[InferenceService] C3D code request sent: ${data.requestId}`);
    return { requestId: data.requestId };
  },

  /**
   * Apply confirmed aliases to Civil 3D drawing
   * 
   * Calls: POST /api/cad-manager/c3d/apply-aliases
   * Returns: Request acknowledgment (result comes via WebSocket)
   */
  applyC3DAliases: async (
    sessionId: string,
    aliases: Array<{ unknownCode: string; masterCode: string }>
  ): Promise<{ requestId: string; aliasCount: number }> => {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/cad-manager/c3d/apply-aliases`;

    console.log(`[InferenceService] Applying ${aliases.length} aliases to Civil 3D...`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, aliases }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to apply aliases to Civil 3D');
    }

    const data = await response.json();
    console.log(`[InferenceService] C3D alias application sent: ${data.requestId}`);
    return { requestId: data.requestId, aliasCount: data.aliasCount };
  },

  /**
   * Create layers in Civil 3D from CAD Manager export
   * 
   * Calls: POST /api/cad-manager/c3d/create-layers
   * Returns: Request acknowledgment (result comes via WebSocket)
   */
  createC3DLayers: async (
    sessionId: string,
    layers: Array<{ name: string; color: number; lineType?: string; description?: string }>
  ): Promise<{ requestId: string; layerCount: number }> => {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/cad-manager/c3d/create-layers`;

    console.log(`[InferenceService] Creating ${layers.length} layers in Civil 3D...`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, layers }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to create layers in Civil 3D');
    }

    const data = await response.json();
    console.log(`[InferenceService] C3D layer creation sent: ${data.requestId}`);
    return { requestId: data.requestId, layerCount: data.layerCount };
  },

  /**
   * Get active Civil 3D connections
   * 
   * Calls: GET /api/cad-manager/c3d/connections
   * Returns: List of active connections
   */
  getC3DConnections: async (): Promise<{
    count: number;
    connections: Array<{ sessionId: string; clientId: string; connectedAt: string }>;
  }> => {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/cad-manager/c3d/connections`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to get Civil 3D connections');
    }

    return response.json();
  },

  /**
   * Generate linetypes using AI
   * 
   * Calls: POST /api/cad-manager/generate-linetypes
   * Input: Natural language description of linetypes needed
   * Output: LinetypeDefinition[] with generated patterns
   */
  generateLinetypes: async (prompt: string): Promise<LinetypeDefinition[]> => {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/cad-manager/generate-linetypes`;

    console.log('[InferenceService] Generating linetypes via AI...');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || errorData.error || 'Failed to generate linetypes';
        throw new Error(`${response.status}: ${errorMessage}`);
      }

      const data = await response.json();
      console.log(`[InferenceService] Generated ${data.linetypes?.length || 0} linetypes`);
      return data.linetypes || [];
    } catch (error) {
      const err = error as Error;
      console.error('[InferenceService] Linetype generation error:', err.message);
      throw new Error(`Failed to generate linetypes: ${err.message}`);
    }
  },
};
