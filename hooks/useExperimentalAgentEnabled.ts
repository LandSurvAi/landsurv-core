import { useEffect, useState } from 'react';
import { AgentType } from '../types';
import {
  isExperimentalAgentEnabled,
  subscribeExperimentalAgents,
} from '../utils/experimentalAgents';

/** Re-renders when the user toggles an experimental agent on or off. */
export function useExperimentalAgentEnabled(agent: AgentType): boolean {
  const [enabled, setEnabled] = useState(() => isExperimentalAgentEnabled(agent));

  useEffect(() => {
    const sync = () => setEnabled(isExperimentalAgentEnabled(agent));
    sync();
    return subscribeExperimentalAgents(sync);
  }, [agent]);

  return enabled;
}
