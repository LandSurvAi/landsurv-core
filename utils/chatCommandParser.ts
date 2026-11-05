/**
 * Deterministic app-level chat commands.
 *
 * Some requests are actions, not questions. If "open settings" is sent to the
 * model, it answers with directions to the gear icon instead of opening the
 * dialog. These command-shaped phrases run locally before any API call, so the
 * UI action is guaranteed and does not depend on model behavior.
 *
 * Matching is intentionally anchored to the whole message: "open settings"
 * acts, while "where are settings?" or "open settings for point labels" still
 * flow to the agent.
 */

export interface LocalChatCommand {
  action: 'open-settings';
  replyText: string;
}

const SETTINGS_NOUN =
  '(?:(?:the|my|project)\\s+){0,2}settings?(?:\\s+(?:window|dialog|panel|page|tab))?';

const SETTINGS_COMMAND_RE = new RegExp(
  `^(?:please\\s+)?(?:(?:open|show|bring\\s+up|pull\\s+up|launch|display)\\s+(?:me\\s+)?${SETTINGS_NOUN}|${SETTINGS_NOUN})$`,
  'i',
);

/**
 * Parse a raw chat message into a local app command, or null when the message
 * should continue through the normal agent pipeline.
 */
export function parseLocalChatCommand(raw: string): LocalChatCommand | null {
  if (!raw || raw.trim().length === 0) return null;

  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, '')
    .replace(/\s+/g, ' ');

  if (SETTINGS_COMMAND_RE.test(normalized)) {
    return {
      action: 'open-settings',
      replyText: 'Here are your **Project Settings**. Open fullscreen to edit them.',
    };
  }

  return null;
}
