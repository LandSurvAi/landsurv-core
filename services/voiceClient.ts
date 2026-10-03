export interface VoiceTurnProposal {
  type: 'set_active_layer';
  kind?: 'building' | 'road' | 'utility' | 'boundary' | 'topo' | 'unknown';
  layer: string;
  confidence: number;
  reason: string;
}

export type VoiceTurnTaskRisk = 'low' | 'medium' | 'high';

export interface VoiceTurnExecutableTask {
  id: string;
  label: string;
  description: string;
  risk: VoiceTurnTaskRisk;
  confidence: number;
  command: 'askPeer';
  skillId: string;
  payload: Record<string, unknown>;
}

export interface VoiceTurnResponse {
  reply: string;
  requiresConfirmation: boolean;
  proposal: VoiceTurnProposal | null;
  taskSuggestions: string[];
  executableTasks?: VoiceTurnExecutableTask[];
}

interface VoiceTurnRequest {
  transcript: string;
  context: {
    availableLayers: string[];
    isDrawing: boolean;
    activeDrawingLayer: string;
  };
}

export const postVoiceTurn = async (payload: VoiceTurnRequest): Promise<VoiceTurnResponse> => {
  const resp = await fetch('/api/voice/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => `${resp.status} ${resp.statusText}`);
    throw new Error(`Voice turn failed (${resp.status}): ${text}`);
  }

  return resp.json() as Promise<VoiceTurnResponse>;
};
