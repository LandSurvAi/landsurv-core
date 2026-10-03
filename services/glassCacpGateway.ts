/**
 * Glass → CACP gateway for the field AR stack.
 *
 * Responsibilities:
 *  - Capture keyframe + audio intent
 *  - Run VAD/NLU preprocessing
 *  - Generate CACP Event Notification payloads
 *  - Send them to the upstream DGX / cloud interchange
 */

import { googleGlassService } from './googleGlassService';
import { vadEngine } from './vadEngine';
import type { CacpEventNotification, CacpFeature } from './CacpSchema';
import { cacpRouterClient } from './cacpRouter';

export interface GlassIntentCapture {
  rawText: string;
  confidence: number;
  featureType?: string;
  coordinates?: [number, number] | [number, number, number];
}

export class GlassCacpGateway {
  async captureIntent(rawText: string, featureType?: string): Promise<CacpEventNotification | null> {
    try {
      const capture = await googleGlassService.captureFrame();
      const detected = await vadEngine.detect(new ArrayBuffer(32));

      const event: CacpEventNotification = {
        version: '1.0.0',
        event_id: capture.eventId,
        timestamp: capture.timestamp,
        session_context: {
          project_id: 'project-live',
          surveyor_id: 'field-surveyor',
          location: {
            latitude: 40.7128,
            longitude: -111.8910,
            elevation: 0,
          },
        },
        intent: {
          raw_text: rawText || 'Draw a feature at the current marker',
          command_category: 'DRAW_FEATURE',
          confidence: detected.isSpeech ? detected.confidence : 0.6,
        },
        payload: {
          features: [
            {
              type: (featureType as CacpFeature['type']) || 'tree',
              raw_coordinates: [0, 0, 0],
              attributes: {
                description_key: 'DK-VEG-001',
                condition: 'healthy',
              },
            },
          ],
        },
      };

      if (capture.keyframeDataUrl) {
        console.log('[GlassCacpGateway] Captured keyframe size:', capture.keyframeDataUrl.length);
      }

      await googleGlassService.sendEvent(event);

      try {
        const action = await cacpRouterClient.submitEvent(event);
        return {
          ...event,
          payload: action.payload,
          intent: {
            ...event.intent,
            command_category: event.intent.command_category,
          },
        } satisfies CacpEventNotification;
      } catch (error) {
        console.warn('[GlassCacpGateway] CACP router unavailable; keeping event local only:', error);
        return event;
      }
    } catch (error) {
      console.error('[GlassCacpGateway] Failed to capture intent:', error);
      return null;
    }
  }
}

export const glassCacpGateway = new GlassCacpGateway();
