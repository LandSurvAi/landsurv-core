// CACP — LSVZ Orchestrator
//
// Thin dispatcher: takes a skill id + payload, looks up which CACP-enabled
// agent owns the skill, and calls it via interAgentComm.request.
//
// Per design: each sub-agent invocation is its own request (no bundling).

import { interAgentComm, AgentResponse } from './InterAgentCommunication';
import { agentRegistry } from './AgentRegistry';
import { AgentType } from '../types';

export interface DispatchResult {
  ok: boolean;
  ownerAgent?: AgentType;
  data?: AgentResponse['data'];
  error?: string;
}

export type SpecialistDelegateHandler = (
  targetAgent: AgentType,
  query: string,
  reason?: string
) => Promise<void> | void;

class LsvzOrchestrator {
  private delegateHandler: SpecialistDelegateHandler | null = null;

  /** Register the host callback that executes a specialist agent turn. */
  setSpecialistDelegateHandler(handler: SpecialistDelegateHandler | null): void {
    this.delegateHandler = handler;
  }

  /** Delegate a turn to a specialist agent pipeline (e.g. Civil Drafter, Deed Reader). */
  async delegateToSpecialist(
    targetAgent: AgentType,
    query: string,
    reason?: string
  ): Promise<{ delegated: boolean; targetAgent: AgentType; error?: string }> {
    if (!this.delegateHandler) {
      return {
        delegated: false,
        targetAgent,
        error: 'No specialist delegate handler registered in host.',
      };
    }
    try {
      await this.delegateHandler(targetAgent, query, reason);
      return { delegated: true, targetAgent };
    } catch (e) {
      return {
        delegated: false,
        targetAgent,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /** Dispatch a single skill to its registered owner. */
  async dispatch(skillId: string, payload: Record<string, unknown> = {}, timeoutMs = 5000): Promise<DispatchResult> {
    const owner = agentRegistry.findOwnerOfSkill(skillId);
    if (!owner) {
      return { ok: false, error: `No CACP agent owns skill "${skillId}"` };
    }
    if (!owner.cacpEnabled) {
      return { ok: false, ownerAgent: owner.agent, error: `Owner ${owner.agent} is not CACP-enabled` };
    }
    try {
      const resp = await interAgentComm.request(
        AgentType.LSVZ_AGENT,
        owner.agent,
        skillId,
        payload,
        timeoutMs
      );
      return { ok: !!resp?.success, ownerAgent: owner.agent, data: resp?.data, error: resp?.error };
    } catch (e) {
      return { ok: false, ownerAgent: owner.agent, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** List all skills currently dispatchable (across CACP-enabled agents). */
  catalogue() {
    return agentRegistry.listCacpEnabled().flatMap(m =>
      m.skills.map(s => ({
        skillId: s.id,
        skillName: s.name,
        agent: m.agent,
        agentName: m.displayName,
        description: s.description,
      }))
    );
  }
}

export const lsvzOrchestrator = new LsvzOrchestrator();

// Self-register a meta-skill so callers can ask LSVZ to dispatch.
import { interAgentComm as bus } from './InterAgentCommunication';
bus.onCommand('lsvz_dispatch', async (message) => {
  const skillId = String(message.data.skillId || '');
  const payload = (message.data.payload as Record<string, unknown>) || {};
  const result = await lsvzOrchestrator.dispatch(skillId, payload);
  return {
    requestId: message.id,
    from: AgentType.LSVZ_AGENT,
    success: result.ok,
    timestamp: Date.now(),
    data: { result },
    error: result.error,
  };
});

bus.onCommand('lsvz_delegate_agent', async (message) => {
  const targetAgent = String(message.data.targetAgent || '') as AgentType;
  const query = String(message.data.query || '');
  const reason = message.data.reason ? String(message.data.reason) : undefined;
  const res = await lsvzOrchestrator.delegateToSpecialist(targetAgent, query, reason);
  return {
    requestId: message.id,
    from: AgentType.LSVZ_AGENT,
    success: res.delegated,
    timestamp: Date.now(),
    data: { delegated: res.delegated, targetAgent: res.targetAgent, reason },
    error: res.error,
  };
});
