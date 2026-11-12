/**
 * LSAI conversation identity.
 *
 * The user only ever talks to LSAI. Selecting an agent calls that specialist
 * in: it becomes the agent that does domain work, but it never becomes the
 * visible speaker. Force Agent is the one test-only bypass.
 *
 * This module is intentionally pure so the command line, the chat panel and
 * the host routing all agree on the same labels, colors and relay decision.
 */

import { AgentType } from '../types.ts';
import { agentConfig, agentThemeColors } from '../constants/agents.ts';
import { routeIntent } from './cacpIntentRouter.ts';

export interface ConversationIdentity {
  /** Who the user is talking to. LSAI unless Force Agent is active. */
  conversationAgent: AgentType;
  /** Whose domain behavior applies to the turn. */
  behaviorAgent: AgentType;
  /** The specialist the user called in, or null for plain LSAI. */
  calledInAgent: AgentType | null;
  /** The Force Agent test override, when set. */
  forcedAgent: AgentType | null;
  /** True when Force Agent is the active bypass. */
  isForced: boolean;
  /** The visible command-line label. Always LSAI except under Force Agent. */
  displayLabel: string;
  /** Accent used by the wordmark. */
  voiceColor: string;
  /** Agent whose glyph is shown in the socket/plug. */
  socketAgent: AgentType;
  /** The one visible transcript. Always LSAI. */
  transcriptAgent: AgentType;
}

/**
 * Agents with a real interactive chat pipeline. Selecting any other agent is a
 * panel-only call-in: the panel opens and the line takes its color, but LSAI
 * remains the chat and there is nothing to relay.
 */
const CHAT_CAPABLE_AGENTS = new Set<AgentType>([
  AgentType.RAW_CRAWLER,
  AgentType.CIVIL_DRAFTER,
  AgentType.DEED_READER,
  AgentType.CIVIL_PLAN_EXPERT,
  AgentType.DXF_ANALYZER,
  AgentType.IMAGE_ANALYZER,
  AgentType.GIS_AGENT,
  AgentType.GPS_STAKEOUT,
  AgentType.CENTERLINE_STATIONING,
  AgentType.POINT_EDITOR,
  AgentType.CONTOURING_AGENT,
  AgentType.STEEP_SLOPE_AGENT,
  AgentType.PROFILE_AGENT,
  AgentType.COGO_AGENT,
  AgentType.GNSS_AGENT,
  AgentType.DRONE_AGENT,
  AgentType.ZONING_AGENT,
  AgentType.TITLE_SEARCH,
  AgentType.CAD_MANAGER,
  AgentType.STANDARDS_COMPLIANCE,
  AgentType.STRUCTURES_AGENT,
  AgentType.SOILS_AGENT,
  AgentType.ROADING_AGENT,
  AgentType.STORMWATER_AGENT,
  AgentType.DIRT_VOLUME_AGENT,
  AgentType.REDLINE_AGENT,
]);

export function isChatCapableAgent(agent: AgentType | null | undefined): agent is AgentType {
  return !!agent && CHAT_CAPABLE_AGENTS.has(agent);
}

export function getAgentDisplayLabel(agent: AgentType): string {
  return agentConfig[agent]?.label ?? String(agent);
}

/**
 * Resolve who speaks, who works, which glyph the socket shows, and which color
 * the LSAI letters take.
 */
export function resolveConversationIdentity(
  activeAgent?: AgentType | null,
  forcedAgent?: AgentType | null,
): ConversationIdentity {
  const forced = forcedAgent ?? null;
  const isForced = !!forced;
  const behaviorAgent = forced ?? activeAgent ?? AgentType.LSVZ_AGENT;
  const calledInAgent =
    !isForced && activeAgent && activeAgent !== AgentType.LSVZ_AGENT ? activeAgent : null;
  const conversationAgent = forced ?? AgentType.LSVZ_AGENT;

  return {
    conversationAgent,
    behaviorAgent,
    calledInAgent,
    forcedAgent: forced,
    isForced,
    displayLabel: isForced ? getAgentDisplayLabel(forced) : 'LSAI',
    voiceColor: agentThemeColors[behaviorAgent] ?? '#38bdf8',
    socketAgent: behaviorAgent,
    transcriptAgent: AgentType.LSVZ_AGENT,
  };
}

/** Domain actions that a called-in specialist should get first refusal on. */
const ACTION_VERB_RE = /\b(draw|draft|design|create|add|make|build|generate|compute|calculate|label|annotate|apply|update|change|move|copy|delete|remove|import|export|connect|fix|adjust|set|place|plot|run|process|extract|synthesize|renumber|rotate|scale|offset|stake|analyze|audit|check)\b/i;

/** Elliptical follow-ups that should stay with the last specialist used. */
const FOLLOW_UP_RE = /\b(it|that|this|those|these|them|same|again|also|instead|now)\b/i;

export function isFollowUpQuery(query: string): boolean {
  const q = query.trim();
  if (!q || q.length > 140) return false;
  return FOLLOW_UP_RE.test(q) || /^(?:and|then|make|do|change|update|adjust|move|add|remove|delete|use|try)\b/i.test(q);
}

/**
 * Specialist-first routing. The called-in agent is offered the turn when the
 * request is in its domain; general project questions stay with LSAI.
 *
 * Deterministic on purpose: no extra model call before the specialist runs.
 */
export function shouldRelayToCalledIn(
  query: string,
  calledInAgent: AgentType | null | undefined,
  lastRelayAgent?: AgentType | null,
): boolean {
  if (!calledInAgent || calledInAgent === AgentType.LSVZ_AGENT) return false;
  if (!isChatCapableAgent(calledInAgent)) return false;

  if (lastRelayAgent === calledInAgent && isFollowUpQuery(query)) return true;

  const route = routeIntent(query, calledInAgent);
  if (route.primary?.agent === calledInAgent) return true;

  // No specialist owns the request, but it is clearly a domain action rather
  // than a project question: give the called-in agent the first attempt.
  if (!route.primary && ACTION_VERB_RE.test(query)) return true;

  return false;
}

export function buildCallInAnnouncement(agent: AgentType): string {
  const label = getAgentDisplayLabel(agent);
  return isChatCapableAgent(agent)
    ? `**${label} is called in.** I'll stay on the conversation and bring them in when the work needs them.`
    : `**${label} is called in.** Their panel is open; ask me anything about the results.`;
}

export function buildReleaseAnnouncement(agent: AgentType): string {
  return `**${getAgentDisplayLabel(agent)} is no longer called in.** I'm handling the conversation again — what's next?`;
}

/** `via Civil Drafter` or `via Civil Drafter → Boundary` for a relayed body. */
export function formatRelayTag(
  agent: AgentType,
  composedBy?: AgentType | null,
): string {
  const label = getAgentDisplayLabel(agent);
  if (composedBy && composedBy !== agent) {
    return `via ${label} → ${getAgentDisplayLabel(composedBy)}`;
  }
  return `via ${label}`;
}
