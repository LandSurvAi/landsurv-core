// Public-facing concierge chat service for the splash & lock screens.
// Requests now go through the backend so server-side screening and Model
// Armor can be applied before Google AI traffic is sent upstream.

export interface PublicChatMessage {
  role: 'user' | 'model';
  text: string;
}

/**
 * Send the conversation so far and get the next reply.
 * Stateless — caller maintains history.
 */
export async function askPublicConcierge(history: PublicChatMessage[]): Promise<string> {
  const contents = history.map(m => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));

  const response = await fetch('/api/public/concierge/ask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      history: contents,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => `${response.status} ${response.statusText}`);
    throw new Error(`Public concierge proxy error (${response.status}): ${errText}`);
  }

  const data = await response.json();

  return typeof data?.text === 'string' ? data.text : '';
}
