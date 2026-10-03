/**
 * Hook for Inter-Agent Communication
 * 
 * Provides easy access to inter-agent communication in React components
 */

import { useEffect, useCallback } from 'react';
import { AgentType } from '../types.ts';
import { interAgentComm, AgentMessage, AgentResponse } from './InterAgentCommunication.ts';

export interface UseInterAgentCommOptions {
  agent: AgentType;
  commands?: string[]; // Commands this agent can handle
}

export function useInterAgentComm(options: UseInterAgentCommOptions) {
  const { agent, commands = [] } = options;

  const sendMessage = useCallback(
    async (
      to: AgentType | 'broadcast',
      command: string,
      data: Record<string, unknown>
    ) => {
      return interAgentComm.sendMessage(agent, to, command, data);
    },
    [agent]
  );

  const request = useCallback(
    async (to: AgentType, command: string, data: Record<string, unknown>) => {
      return interAgentComm.request(agent, to, command, data);
    },
    [agent]
  );

  const onCommand = useCallback(
    (command: string, handler: (message: AgentMessage) => Promise<AgentResponse | void>) => {
      return interAgentComm.onCommand(command, handler);
    },
    []
  );

  // Auto-register commands on mount
  useEffect(() => {
    if (commands.length === 0) return;

    console.log(`[useInterAgentComm] Registering ${commands.length} command handlers for ${agent}`);
    
    const unsubscribers: Array<() => void> = [];

    // Setup default handlers for registered commands
    commands.forEach(cmd => {
      const unsubscribe = onCommand(cmd, async (message) => {
        console.log(`[${agent}] Received command: ${cmd}`, message.data);
        // Subclass components will override these with actual handlers
        return { requestId: message.id, from: agent, success: true };
      });
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [agent, commands, onCommand]);

  return {
    sendMessage,
    request,
    onCommand,
  };
}

/**
 * Example usage in a component:
 * 
 * const { sendMessage, onCommand } = useInterAgentComm({
 *   agent: AgentType.DEED_READER,
 *   commands: ['deed_loaded', 'deed_parsed']
 * });
 * 
 * // Register handler for incoming messages
 * useEffect(() => {
 *   const unsubscribe = onCommand('request_deed_data', async (message) => {
 *     return {
 *       requestId: message.id,
 *       from: AgentType.DEED_READER,
 *       success: true,
 *       data: { vertices, parcelName }
 *     };
 *   });
 *   return unsubscribe;
 * }, [onCommand]);
 * 
 * // Send deed data to Civil 3D when ready
 * await sendMessage(AgentType.CIVIL_3D_PLUGIN, 'import_deed', {
 *   vertices: parsedVertices,
 *   parcelName: deedParcelName
 * });
 */
