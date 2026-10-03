/**
 * Very-lightweight VAD placeholder for the Glass field agent.
 *
 * The actual implementation should use a native Silero VAD model or on-device
 * speech detection pipeline. This stub keeps the flow testable and prevents the
 * app from crashing in non-device environments while the production model is
 * integrated later.
 */

export interface VadResult {
  isSpeech: boolean;
  confidence: number;
  timestamp: number;
}

export class VadEngine {
  private isListening = false;

  async initialize(): Promise<void> {
    this.isListening = true;
    console.log('[VadEngine] Initialized');
  }

  async shutdown(): Promise<void> {
    this.isListening = false;
    console.log('[VadEngine] Shut down');
  }

  getState(): boolean {
    return this.isListening;
  }

  async detect(audioBuffer: ArrayBuffer): Promise<VadResult> {
    if (!this.isListening) {
      return { isSpeech: false, confidence: 0, timestamp: Date.now() };
    }

    // Lightweight heuristic used only as a placeholder until Silero is mounted.
    const sampleText = audioBuffer.byteLength > 0 ? 'speech-like' : 'silence';
    const confidence = sampleText === 'speech-like' ? 0.74 : 0.12;

    return {
      isSpeech: confidence > 0.5,
      confidence,
      timestamp: Date.now(),
    };
  }
}

export const vadEngine = new VadEngine();
