/**
 * Google Glass service interface for the XR field orchestration flow.
 *
 * This is intentionally implementation-light: the actual Google Glass Enterprise
 * Edition SDK is device-specific and not available in the web workspace. The
 * service exposes the contract the AR Agent needs to interact with the smart
 * glasses while keeping the app buildable and testable in-browser.
 */

import type { CacpEventNotification } from './CacpSchema';

export interface GlassCaptureResult {
  eventId: string;
  timestamp: string;
  keyframeDataUrl: string | null;
  audioAvailable: boolean;
}

export interface GlassActionListener {
  (payload: unknown): void;
}

export class GoogleGlassService {
  private actionListeners = new Set<GlassActionListener>();
  private sessionUrl: string | null = null;
  private isConnected = false;

  async connect(sessionUrl: string): Promise<void> {
    this.sessionUrl = sessionUrl;
    this.isConnected = true;
    console.log('[GoogleGlassService] Connected to Glass session:', sessionUrl);
  }

  disconnect(): void {
    this.isConnected = false;
    this.sessionUrl = null;
    console.log('[GoogleGlassService] Disconnected from Glass session');
  }

  isReady(): boolean {
    return this.isConnected;
  }

  subscribeToActions(listener: GlassActionListener): () => void {
    this.actionListeners.add(listener);
    return () => {
      this.actionListeners.delete(listener);
    };
  }

  publishAction(payload: unknown): void {
    for (const listener of this.actionListeners) {
      listener(payload);
    }
  }

  async startVoiceCapture(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      console.warn('[GoogleGlassService] Microphone capture unavailable in this environment');
      return false;
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      console.log('[GoogleGlassService] Voice capture started');
      return true;
    } catch (error) {
      console.warn('[GoogleGlassService] Unable to start microphone capture:', error);
      return false;
    }
  }

  async captureKeyframe(): Promise<string | null> {
    try {
      if (typeof document === 'undefined') {
        return null;
      }

      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return null;
      }

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#22c55e';
      ctx.font = '48px sans-serif';
      ctx.fillText('Glass Keyframe', 60, 120);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '32px sans-serif';
      ctx.fillText('LandSurv.ai XR capture', 60, 180);

      return canvas.toDataURL('image/png');
    } catch (error) {
      console.warn('[GoogleGlassService] Keyframe capture failed:', error);
      return null;
    }
  }

  async captureFrame(): Promise<GlassCaptureResult> {
    const eventId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `glass-${Date.now()}`;

    const keyframeDataUrl = await this.captureKeyframe();

    return {
      eventId,
      timestamp: new Date().toISOString(),
      keyframeDataUrl,
      audioAvailable: await this.startVoiceCapture().catch(() => false),
    };
  }

  async sendEvent(event: CacpEventNotification): Promise<void> {
    if (!this.isConnected) {
      console.warn('[GoogleGlassService] Glass is not connected; event kept local only');
      return;
    }

    console.log('[GoogleGlassService] Sending CACP event to Glass gateway', event);
  }
}

export const googleGlassService = new GoogleGlassService();
