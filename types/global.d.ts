// Global type declarations for LandSurv.ai

interface InterAgentMessage {
  from: string;
  to: string;
  command: string;
  data?: unknown;
}

interface InterAgentCommResponse {
  success: boolean;
  data?: {
    points?: unknown[];
    [key: string]: unknown;
  };
  error?: string;
}

interface InterAgentComm {
  sendMessage: (message: InterAgentMessage) => void;
  request: (message: InterAgentMessage, timeout?: number) => Promise<InterAgentCommResponse>;
}

declare global {
  interface Window {
    interAgentComm?: InterAgentComm;
    gtag?: (command: string, eventName: string, params?: Record<string, unknown>) => void;
  }
}

export {};
