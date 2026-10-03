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
  greetingMessage: 'I can generate contour lines from your project\'s points. What contour interval would you like?',
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
  greetingMessage: 'I can generate elevation profiles along lines or centerlines. How can I assist?',
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
  greetingMessage: 'I can perform coordinate geometry calculations including inverse calculations and intersection computations. How can I assist?',
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
  greetingMessage: `I can help you process RINEX observation files from raw GNSS receivers to generate precise positioning solutions.<br/><br/><strong>Available Features:</strong><br/><ul style="margin-top: 8px; margin-left: 20px;"><li>Process RINEX files to generate precise positioning solutions</li><li>Single Point Positioning (SPP) with least-squares optimization</li><li>Support multi-constellation processing (GPS, GLONASS, Galileo, BeiDou)</li><li>Export results in multiple formats (CSV, GeoJSON, KML, JSON)</li><li>Analyze solution quality with DOP calculations</li></ul><br/><strong>To get started:</strong> Click the "RINEX Tools" button below to upload a RINEX file and configure processing parameters. You'll need an API key for premium features.`,
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
  greetingMessage: 'I can help you stage aerial imagery in temporary processing storage, run NodeODM photogrammetry, and export orthomosaics and meshes back to connected destination storage.',
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
  greetingMessage: `I help you visualize and interact with your survey data in 3D augmented reality on your Meta Quest headset. I can help you:<br/><ul style="margin-top: 8px; margin-left: 20px;"><li>View survey points as 3D markers in your physical environment</li><li>Stake out points using AR visualization</li><li>Analyze point data and relationships in 3D space</li><li>Plan fieldwork with spatial awareness</li><li>Answer questions about your project data</li></ul><br/>Ask me questions about your survey points or ask me to help you visualize specific data in AR!`,
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
  greetingMessage: 'I am now operating in live stakeout mode. Your GPS is active and ready for field work.',
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
  greetingMessage: 'I can audit plan-sheet completeness and standards compliance using CAD Manager context, any number of reference/control PDFs, or both. Upload your reference and target PDFs to get started.',
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

  return `Hello! I am the ${displayName} agent. I am now operating in <strong>live stakeout mode</strong>. Your GPS is active and ready for field work. Your current projection is ${projectionInfo}.`;
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
 * Build LSVZ agent context
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
  let context = 'LSVZ Meta-Agent context: Full project state available for analysis.';

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
