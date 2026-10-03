/**
 * CACP Router client helper.
 *
 * Sends Glass/DGX-generated CACP events to the backend routing layer and
 * returns the downstream CAD action payload.
 */

import type { CacpActionNotification, CacpEventNotification } from './CacpSchema';

export class CacpRouterClient {
  private readonly baseUrl: string;

  constructor(baseUrl = '/api/cacp') {
    this.baseUrl = baseUrl;
  }

  async submitEvent(event: CacpEventNotification): Promise<CacpActionNotification> {
    const response = await fetch(`${this.baseUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`CACP event submission failed: ${response.status} ${text}`);
    }

    return await response.json() as CacpActionNotification;
  }

  async submitAction(action: CacpActionNotification): Promise<{ ok: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`CACP action submission failed: ${response.status} ${text}`);
    }

    return await response.json() as { ok: boolean; message: string };
  }
}

export const cacpRouterClient = new CacpRouterClient();
