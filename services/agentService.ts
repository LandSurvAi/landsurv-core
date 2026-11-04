/**
 * Agent Service
 * 
 * Handles agent initialization and configuration logic.
 * Provides factory functions for creating agent initialization callbacks
 * with consistent patterns for:
 * - Chat session creation via startGeminiChat
 * - Theme-colored greeting messages
 * - Suggested questions for user guidance
 * - Agent state tracking
 * 
 * @module services/agentService
 */

import { AgentType, MessageRole, ProjectSettings, GeminiChatMessage } from '../types';
import { buildAgentWelcome } from './agentWelcome';

/**
 * Configuration for a single agent
 */
export interface AgentConfig {
  agentType: AgentType;
  displayName: string;
  greetingMessage: string;
  suggestedQuestions: string[];
  logMessage: string;
  requiresProjection?: boolean;
  contextContent?: string;
}

/**
 * Get greeting message with colored agent name
 * 
 * @param agentName - Display name of the agent
 * @param agentType - Type of agent (for color lookup)
 * @param themeColor - Color for the agent name
 * @returns HTML-formatted greeting message
 */
export function createColoredGreeting(
  agentName: string,
  themeColor: string
): string {
  return `<strong style="color: ${themeColor};">${agentName}</strong>`;
}

/**
 * Create initial chat history entry for an agent
 * 
 * @param message - Message text (can include HTML)
 * @returns Chat message object with MODEL role
 */
export function createGreetingMessage(message: string): GeminiChatMessage {
  return {
    role: MessageRole.MODEL,
    text: message,
  };
}

/**
 * Standard agent initialization message
 * 
 * @param agentDisplayName - Colored HTML for agent name
 * @param introText - Introduction/capability text
 * @returns Full greeting message
 */
export function buildGreetingMessage(
  agentDisplayName: string,
  introText: string
): string {
  return `Hello! I am the ${agentDisplayName} agent. ${introText}`;
}

/**
 * Contouring agent configuration
 */
export const contouringAgentConfig: AgentConfig = {
  agentType: AgentType.CONTOURING_AGENT,
  displayName: 'Contouring Agent',
  greetingMessage: buildAgentWelcome(AgentType.CONTOURING_AGENT, 'Tell me the contour interval you would like and I will generate and label the lines.'),
  suggestedQuestions: [
    'Generate contours at a 1-foot interval.',
    'Create 5-foot contours using only points with "GROUND" in the description.',
    'What is the highest and lowest elevation in the project?',
  ],
  logMessage: 'Contouring agent activated.',
};

/**
 * Profile agent configuration
 */
export const profileAgentConfig: AgentConfig = {
  agentType: AgentType.PROFILE_AGENT,
  displayName: 'Profile & Cross Section Agent',
  greetingMessage: buildAgentWelcome(AgentType.PROFILE_AGENT, 'Select a line or alignment to generate a profile or cross sections.'),
  suggestedQuestions: [
    'Generate a profile along line from point 1 to 2.',
    'Create a profile of CL-1 from station 0+00 to 10+00.',
    'Show cross sections every 50 feet along the highway.',
  ],
  logMessage: 'Profile & Cross Section agent activated.',
};

/**
 * COGO agent configuration
 */
export const cogoAgentConfig: AgentConfig = {
  agentType: AgentType.COGO_AGENT,
  displayName: 'COGO Agent',
  greetingMessage: buildAgentWelcome(AgentType.COGO_AGENT, 'Select the computation you need, or describe it in plain language.'),
  suggestedQuestions: [
    'Calculate the bearing and distance between two points.',
    'Find the intersection of two lines.',
    'Compute coordinates from a known point using bearing and distance.',
  ],
  logMessage: 'COGO agent activated.',
};

/**
 * GNSS/RINEX agent configuration
 */
export const gnssAgentConfig: AgentConfig = {
  agentType: AgentType.GNSS_AGENT,
  displayName: 'RINEX Post-Processor',
  greetingMessage: buildAgentWelcome(AgentType.GNSS_AGENT, 'Use the <strong>RINEX Tools</strong> panel to upload an observation file and configure processing parameters.'),
  suggestedQuestions: [
    'What RINEX file formats are supported?',
    'How do I use RTK mode with a reference station?',
    'When will this feature be available?',
  ],
  logMessage: 'RINEX Agent activated.',
};

export const droneAgentConfig: AgentConfig = {
  agentType: AgentType.DRONE_AGENT,
  displayName: 'Drone Agent',
  greetingMessage: buildAgentWelcome(AgentType.DRONE_AGENT, 'Use the <strong>Drone Tools</strong> panel to begin.'),
  suggestedQuestions: [
    'What image overlap do I need for a good orthomosaic?',
    'What outputs will the Drone Agent produce?',
    'How will temporary processing storage be cleaned up?',
  ],
  logMessage: 'Drone Agent activated.',
};

/**
 * AR agent configuration
 */
export const arAgentConfig: AgentConfig = {
  agentType: AgentType.AR_AGENT,
  displayName: 'AR (Augmented Reality)',
  greetingMessage: buildAgentWelcome(AgentType.AR_AGENT, 'Ask me to visualize project points or linework, or to prepare a stakeout set for the field.'),
  suggestedQuestions: [
    'Show me all points in AR mode',
    'Which points need stakeout?',
    'What\'s the elevation range of my points?',
  ],
  logMessage: 'AR Agent activated.',
};

/**
 * GPS Stakeout agent configuration
 */
export const gpsStakeoutAgentConfig: AgentConfig = {
  agentType: AgentType.GPS_STAKEOUT,
  displayName: 'GPS Rover',
  greetingMessage: buildAgentWelcome(AgentType.GPS_STAKEOUT, 'Live stakeout mode is active and your GPS is ready for field work.'),
  suggestedQuestions: [
    'What\'s the closest point to me?',
    'Give me stakeout info for point 501.',
    'Inverse between stored points GPS-1 and GPS-2.',
  ],
  logMessage: 'GPS Stakeout agent activated.',
  requiresProjection: true,
};

/**
 * Standards Compliance agent configuration
 */
export const standardsComplianceAgentConfig: AgentConfig = {
  agentType: AgentType.STANDARDS_COMPLIANCE,
  displayName: 'Standards Compliance',
  greetingMessage: buildAgentWelcome(AgentType.STANDARDS_COMPLIANCE, 'Upload your reference and subject PDFs, then run a compliance audit.'),
  suggestedQuestions: [
    'Run compliance using combined mode.',
    'Check title block, north arrow, and revision block only.',
    'Show all linetype and layer violations.',
  ],
  logMessage: 'Standards Compliance agent activated.',
};

/**
 * Get agent configuration by type
 * 
 * @param agentType - The agent type to get configuration for
 * @returns Agent configuration or undefined if not found
 */
export function getAgentConfig(agentType: AgentType): AgentConfig | undefined {
  const configMap: Record<AgentType, AgentConfig> = {
    [AgentType.CONTOURING_AGENT]: contouringAgentConfig,
    [AgentType.PROFILE_AGENT]: profileAgentConfig,
    [AgentType.COGO_AGENT]: cogoAgentConfig,
    [AgentType.GNSS_AGENT]: gnssAgentConfig,
    [AgentType.DRONE_AGENT]: droneAgentConfig,
    [AgentType.AR_AGENT]: arAgentConfig,
    [AgentType.GPS_STAKEOUT]: gpsStakeoutAgentConfig,
    [AgentType.STANDARDS_COMPLIANCE]: standardsComplianceAgentConfig,
  };

  return configMap[agentType];
}

/**
 * Build a greeting message with projection info for GPS Stakeout
 * 
 * @param displayName - Colored HTML for agent name
 * @param settings - Current project settings with projection info
 * @returns Greeting message with projection details
 */
export function buildGpsStakeoutGreeting(
  displayName: string,
  settings: ProjectSettings
): string {
  const projectionInfo = settings.projection?.zoneName
    ? `<strong>${settings.projection.state} - ${settings.projection.zoneName}</strong>`
    : 'Please set a projection';

  return buildAgentWelcome(
    AgentType.GPS_STAKEOUT,
    `I am now operating in <strong>live stakeout mode</strong>. Your GPS is active and ready for field work. Your current projection is ${projectionInfo}.`
  );
}

/**
 * Check if projection is required and valid for an agent
 * 
 * @param agentType - Type of agent to check
 * @param settings - Current project settings
 * @returns true if projection is available or not required
 */
export function isProjectionValidForAgent(
  agentType: AgentType,
  settings: ProjectSettings
): boolean {
  const config = getAgentConfig(agentType);
  
  if (!config?.requiresProjection) {
    return true; // No projection required
  }

  return !!(settings.projection && settings.projection.zoneName);
}

/**
 * Get projection validation error message if needed
 * 
 * @param agentType - Type of agent to validate
 * @returns Error message or null if no error
 */
export function getProjectionValidationError(agentType: AgentType): string | null {
  const config = getAgentConfig(agentType);
  
  if (!config?.requiresProjection) {
    return null;
  }

  return `${config.displayName} requires a projection to be set. Please select your coordinate system.`;
}

/**
 * Build LSAI agent context
 * (Note: The actual implementation is in App.tsx with getSummarizedLsvzContext)
 * This function documents the pattern for context building
 * 
 * @param sessionState - Full session state for context building
 * @param pointCount - Number of points in project
 * @returns Formatted context string for AI
 */
export function buildLsvzAgentContext(
  sessionState: any,
  pointCount: number
): string {
  let context = 'LSAI Agent context: Full project state available for analysis.';

  if (pointCount > 1000) {
    context += '\n[SYSTEM: Vector Search / RAG enabled. For large projects, use semantic search for detailed analysis.]';
  } else if (pointCount > 500) {
    context += '\n[SYSTEM: Cloud context service available for enhanced analysis.]';
  }

  return context;
}

/**
 * Suggested questions are agent-specific prompts to guide user interaction
 * 
 * @param agentType - Type of agent
 * @returns Array of suggested question strings
 */
export function getSuggestedQuestionsForAgent(agentType: AgentType): string[] {
  const config = getAgentConfig(agentType);
  return config?.suggestedQuestions || [];
}

/**
 * Get log action message for agent activation
 * 
 * @param agentType - Type of agent
 * @returns Log message for fieldbook
 */
export function getAgentActivationLogMessage(agentType: AgentType): string {
  const config = getAgentConfig(agentType);
  return config?.logMessage || `${agentType} activated.`;
}
