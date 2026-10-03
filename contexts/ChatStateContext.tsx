/**
 * ChatStateContext - Manages all chat and AI conversation state
 * 
 * This context is part of the "Strangler Pattern" refactoring effort.
 * It manages all chat instances and chat histories for each agent.
 * 
 * Migration Status: 🟢 READY FOR INTEGRATION
 * - Phase 1: Context created
 * - Phase 2: Wire up alongside existing App.tsx state
 * - Phase 3: Migrate chat initialization handlers
 * - Phase 4: Remove old state from App.tsx
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Chat, ChatMessage } from '../types.ts';

// ============================================================================
// Types
// ============================================================================

interface ChatState {
  // Chat instances (Gemini chat sessions)
  rawChat: Chat | null;
  deedChat: Chat | null;
  dxfChat: Chat | null;
  stationingChat: Chat | null;
  pointEditorChat: Chat | null;
  gpsStakeoutChat: Chat | null;
  lsvzChat: Chat | null;
  planExpertChat: Chat | null;
  imageAnalyzerChat: Chat | null;
  gisChat: Chat | null;
  contouringChat: Chat | null;
  steepSlopeChat: Chat | null;
  profileChat: Chat | null;
  cogoChat: Chat | null;
  rinexChat: Chat | null;
  droneChat: Chat | null;
  arChat: Chat | null;
  zoningChat: Chat | null;
  titleSearchChat: Chat | null;
  civilDrafterChat: Chat | null;
  cadManagerChat: Chat | null;
  standardsComplianceChat: Chat | null;
  structuresChat: Chat | null;
  soilsChat: Chat | null;
  
  // Chat histories (message arrays)
  rawChatHistory: ChatMessage[];
  deedChatHistory: ChatMessage[];
  dxfChatHistory: ChatMessage[];
  stationingChatHistory: ChatMessage[];
  pointEditorChatHistory: ChatMessage[];
  fieldbookLog: ChatMessage[];
  gpsStakeoutChatHistory: ChatMessage[];
  lsvzChatHistory: ChatMessage[];
  planExpertChatHistory: ChatMessage[];
  imageAnalyzerChatHistory: ChatMessage[];
  gisChatHistory: ChatMessage[];
  contouringChatHistory: ChatMessage[];
  steepSlopeChatHistory: ChatMessage[];
  profileChatHistory: ChatMessage[];
  cogoChatHistory: ChatMessage[];
  rinexChatHistory: ChatMessage[];
  droneChatHistory: ChatMessage[];
  arChatHistory: ChatMessage[];
  zoningChatHistory: ChatMessage[];
  titleSearchChatHistory: ChatMessage[];
  civilDrafterChatHistory: ChatMessage[];
  cadManagerChatHistory: ChatMessage[];
  standardsComplianceChatHistory: ChatMessage[];
  structuresChatHistory: ChatMessage[];
  soilsChatHistory: ChatMessage[];
  
  // Fieldbook notes
  fieldbookNotes: string;
}

interface ChatActions {
  // Chat setters
  setRawChat: (chat: Chat | null) => void;
  setDeedChat: (chat: Chat | null) => void;
  setDxfChat: (chat: Chat | null) => void;
  setStationingChat: (chat: Chat | null) => void;
  setPointEditorChat: (chat: Chat | null) => void;
  setGpsStakeoutChat: (chat: Chat | null) => void;
  setLsvzChat: (chat: Chat | null) => void;
  setPlanExpertChat: (chat: Chat | null) => void;
  setImageAnalyzerChat: (chat: Chat | null) => void;
  setGisChat: (chat: Chat | null) => void;
  setContouringChat: (chat: Chat | null) => void;
  setSteepSlopeChat: (chat: Chat | null) => void;
  setProfileChat: (chat: Chat | null) => void;
  setCogoChat: (chat: Chat | null) => void;
  setRinexChat: (chat: Chat | null) => void;
  setDroneChat: (chat: Chat | null) => void;
  setArChat: (chat: Chat | null) => void;
  setZoningChat: (chat: Chat | null) => void;
  setTitleSearchChat: (chat: Chat | null) => void;
  setCivilDrafterChat: (chat: Chat | null) => void;
  setCadManagerChat: (chat: Chat | null) => void;
  setStandardsComplianceChat: (chat: Chat | null) => void;
  setStructuresChat: (chat: Chat | null) => void;
  setSoilsChat: (chat: Chat | null) => void;
  
  // Chat history setters
  setRawChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setDeedChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setDxfChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setStationingChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setPointEditorChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setFieldbookLog: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setGpsStakeoutChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setLsvzChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setPlanExpertChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setImageAnalyzerChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setGisChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setContouringChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setSteepSlopeChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setProfileChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setCogoChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setRinexChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setDroneChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setArChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setZoningChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setTitleSearchChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setCivilDrafterChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setCadManagerChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setStandardsComplianceChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setStructuresChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setSoilsChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  
  // Fieldbook notes
  setFieldbookNotes: (notes: string) => void;
  
  // Helper actions
  addMessageToHistory: (agentType: string, message: ChatMessage) => void;
  clearChatHistory: (agentType: string) => void;
  resetAllChats: () => void;
}

type ChatContextValue = ChatState & ChatActions;

// ============================================================================
// Context
// ============================================================================

const ChatStateContext = createContext<ChatContextValue | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface ChatStateProviderProps {
  children: ReactNode;
}

export const ChatStateProvider: React.FC<ChatStateProviderProps> = ({ children }) => {
  // Chat instances
  const [rawChat, setRawChat] = useState<Chat | null>(null);
  const [deedChat, setDeedChat] = useState<Chat | null>(null);
  const [dxfChat, setDxfChat] = useState<Chat | null>(null);
  const [stationingChat, setStationingChat] = useState<Chat | null>(null);
  const [pointEditorChat, setPointEditorChat] = useState<Chat | null>(null);
  const [gpsStakeoutChat, setGpsStakeoutChat] = useState<Chat | null>(null);
  const [lsvzChat, setLsvzChat] = useState<Chat | null>(null);
  const [planExpertChat, setPlanExpertChat] = useState<Chat | null>(null);
  const [imageAnalyzerChat, setImageAnalyzerChat] = useState<Chat | null>(null);
  const [gisChat, setGisChat] = useState<Chat | null>(null);
  const [contouringChat, setContouringChat] = useState<Chat | null>(null);
  const [steepSlopeChat, setSteepSlopeChat] = useState<Chat | null>(null);
  const [profileChat, setProfileChat] = useState<Chat | null>(null);
  const [cogoChat, setCogoChat] = useState<Chat | null>(null);
  const [rinexChat, setRinexChat] = useState<Chat | null>(null);
  const [droneChat, setDroneChat] = useState<Chat | null>(null);
  const [arChat, setArChat] = useState<Chat | null>(null);
  const [zoningChat, setZoningChat] = useState<Chat | null>(null);
  const [titleSearchChat, setTitleSearchChat] = useState<Chat | null>(null);
  const [civilDrafterChat, setCivilDrafterChat] = useState<Chat | null>(null);
  const [cadManagerChat, setCadManagerChat] = useState<Chat | null>(null);
  const [standardsComplianceChat, setStandardsComplianceChat] = useState<Chat | null>(null);
  const [structuresChat, setStructuresChat] = useState<Chat | null>(null);
  const [soilsChat, setSoilsChat] = useState<Chat | null>(null);
  
  // Chat histories
  const [rawChatHistory, setRawChatHistory] = useState<ChatMessage[]>([]);
  const [deedChatHistory, setDeedChatHistory] = useState<ChatMessage[]>([]);
  const [dxfChatHistory, setDxfChatHistory] = useState<ChatMessage[]>([]);
  const [stationingChatHistory, setStationingChatHistory] = useState<ChatMessage[]>([]);
  const [pointEditorChatHistory, setPointEditorChatHistory] = useState<ChatMessage[]>([]);
  const [fieldbookLog, setFieldbookLog] = useState<ChatMessage[]>([]);
  const [gpsStakeoutChatHistory, setGpsStakeoutChatHistory] = useState<ChatMessage[]>([]);
  const [lsvzChatHistory, setLsvzChatHistory] = useState<ChatMessage[]>([]);
  const [planExpertChatHistory, setPlanExpertChatHistory] = useState<ChatMessage[]>([]);
  const [imageAnalyzerChatHistory, setImageAnalyzerChatHistory] = useState<ChatMessage[]>([]);
  const [gisChatHistory, setGisChatHistory] = useState<ChatMessage[]>([]);
  const [contouringChatHistory, setContouringChatHistory] = useState<ChatMessage[]>([]);
  const [steepSlopeChatHistory, setSteepSlopeChatHistory] = useState<ChatMessage[]>([]);
  const [profileChatHistory, setProfileChatHistory] = useState<ChatMessage[]>([]);
  const [cogoChatHistory, setCogoChatHistory] = useState<ChatMessage[]>([]);
  const [rinexChatHistory, setRinexChatHistory] = useState<ChatMessage[]>([]);
  const [droneChatHistory, setDroneChatHistory] = useState<ChatMessage[]>([]);
  const [arChatHistory, setArChatHistory] = useState<ChatMessage[]>([]);
  const [zoningChatHistory, setZoningChatHistory] = useState<ChatMessage[]>([]);
  const [titleSearchChatHistory, setTitleSearchChatHistory] = useState<ChatMessage[]>([]);
  const [civilDrafterChatHistory, setCivilDrafterChatHistory] = useState<ChatMessage[]>([]);
  const [cadManagerChatHistory, setCadManagerChatHistory] = useState<ChatMessage[]>([]);
  const [standardsComplianceChatHistory, setStandardsComplianceChatHistory] = useState<ChatMessage[]>([]);
  const [structuresChatHistory, setStructuresChatHistory] = useState<ChatMessage[]>([]);
  const [soilsChatHistory, setSoilsChatHistory] = useState<ChatMessage[]>([]);
  
  // Fieldbook notes
  const [fieldbookNotes, setFieldbookNotes] = useState<string>('');

  // Helper actions
  const addMessageToHistory = useCallback((agentType: string, message: ChatMessage) => {
    const setterMap: Record<string, React.Dispatch<React.SetStateAction<ChatMessage[]>>> = {
      'raw': setRawChatHistory,
      'deed': setDeedChatHistory,
      'dxf': setDxfChatHistory,
      'stationing': setStationingChatHistory,
      'pointEditor': setPointEditorChatHistory,
      'fieldbook': setFieldbookLog,
      'gpsStakeout': setGpsStakeoutChatHistory,
      'lsvz': setLsvzChatHistory,
      'planExpert': setPlanExpertChatHistory,
      'imageAnalyzer': setImageAnalyzerChatHistory,
      'gis': setGisChatHistory,
      'contouring': setContouringChatHistory,
      'steepSlope': setSteepSlopeChatHistory,
      'profile': setProfileChatHistory,
      'cogo': setCogoChatHistory,
      'drone': setDroneChatHistory,
      'ar': setArChatHistory,
      'civilDrafter': setCivilDrafterChatHistory,
      'standardsCompliance': setStandardsComplianceChatHistory,
    };
    
    const setter = setterMap[agentType];
    if (setter) {
      setter(prev => [...prev, message]);
    }
  }, []);

  const clearChatHistory = useCallback((agentType: string) => {
    const setterMap: Record<string, React.Dispatch<React.SetStateAction<ChatMessage[]>>> = {
      'raw': setRawChatHistory,
      'deed': setDeedChatHistory,
      'dxf': setDxfChatHistory,
      'stationing': setStationingChatHistory,
      'pointEditor': setPointEditorChatHistory,
      'fieldbook': setFieldbookLog,
      'gpsStakeout': setGpsStakeoutChatHistory,
      'lsvz': setLsvzChatHistory,
      'planExpert': setPlanExpertChatHistory,
      'imageAnalyzer': setImageAnalyzerChatHistory,
      'gis': setGisChatHistory,
      'contouring': setContouringChatHistory,
      'steepSlope': setSteepSlopeChatHistory,
      'profile': setProfileChatHistory,
      'cogo': setCogoChatHistory,
      'drone': setDroneChatHistory,
      'ar': setArChatHistory,
      'civilDrafter': setCivilDrafterChatHistory,
      'standardsCompliance': setStandardsComplianceChatHistory,
    };
    
    const setter = setterMap[agentType];
    if (setter) {
      setter([]);
    }
  }, []);

  const resetAllChats = useCallback(() => {
    // Reset chat instances
    setRawChat(null);
    setDeedChat(null);
    setDxfChat(null);
    setStationingChat(null);
    setPointEditorChat(null);
    setGpsStakeoutChat(null);
    setLsvzChat(null);
    setPlanExpertChat(null);
    setImageAnalyzerChat(null);
    setGisChat(null);
    setContouringChat(null);
    setSteepSlopeChat(null);
    setProfileChat(null);
    setCogoChat(null);
    setArChat(null);
    setCivilDrafterChat(null);
    setStandardsComplianceChat(null);
    
    // Reset chat histories
    setRawChatHistory([]);
    setDeedChatHistory([]);
    setDxfChatHistory([]);
    setStationingChatHistory([]);
    setPointEditorChatHistory([]);
    setFieldbookLog([]);
    setGpsStakeoutChatHistory([]);
    setLsvzChatHistory([]);
    setPlanExpertChatHistory([]);
    setImageAnalyzerChatHistory([]);
    setGisChatHistory([]);
    setContouringChatHistory([]);
    setSteepSlopeChatHistory([]);
    setProfileChatHistory([]);
    setCogoChatHistory([]);
    setArChatHistory([]);
    setCivilDrafterChatHistory([]);
    setStandardsComplianceChatHistory([]);
    
    // Reset fieldbook notes
    setFieldbookNotes('');
  }, []);

  const value: ChatContextValue = {
    // State
    rawChat,
    deedChat,
    dxfChat,
    stationingChat,
    pointEditorChat,
    gpsStakeoutChat,
    lsvzChat,
    planExpertChat,
    imageAnalyzerChat,
    gisChat,
    contouringChat,
    steepSlopeChat,
    profileChat,
    cogoChat,
    rinexChat,
    droneChat,
    arChat,
    zoningChat,
    titleSearchChat,
    civilDrafterChat,
    cadManagerChat,
    standardsComplianceChat,
    structuresChat,
    soilsChat,
    rawChatHistory,
    deedChatHistory,
    dxfChatHistory,
    stationingChatHistory,
    pointEditorChatHistory,
    fieldbookLog,
    gpsStakeoutChatHistory,
    lsvzChatHistory,
    planExpertChatHistory,
    imageAnalyzerChatHistory,
    gisChatHistory,
    contouringChatHistory,
    steepSlopeChatHistory,
    profileChatHistory,
    cogoChatHistory,
    rinexChatHistory,
    droneChatHistory,
    arChatHistory,
    zoningChatHistory,
    titleSearchChatHistory,
    civilDrafterChatHistory,
    cadManagerChatHistory,
    standardsComplianceChatHistory,
    structuresChatHistory,
    soilsChatHistory,
    fieldbookNotes,
    
    // Setters
    setRawChat,
    setDeedChat,
    setDxfChat,
    setStationingChat,
    setPointEditorChat,
    setGpsStakeoutChat,
    setLsvzChat,
    setPlanExpertChat,
    setImageAnalyzerChat,
    setGisChat,
    setContouringChat,
    setSteepSlopeChat,
    setProfileChat,
    setCogoChat,
    setRinexChat,
    setDroneChat,
    setArChat,
    setZoningChat,
    setTitleSearchChat,
    setCivilDrafterChat,
    setCadManagerChat,
    setStandardsComplianceChat,
    setStructuresChat,
    setSoilsChat,
    setRawChatHistory,
    setDeedChatHistory,
    setDxfChatHistory,
    setStationingChatHistory,
    setPointEditorChatHistory,
    setFieldbookLog,
    setGpsStakeoutChatHistory,
    setLsvzChatHistory,
    setPlanExpertChatHistory,
    setImageAnalyzerChatHistory,
    setGisChatHistory,
    setContouringChatHistory,
    setSteepSlopeChatHistory,
    setProfileChatHistory,
    setCogoChatHistory,
    setRinexChatHistory,
    setDroneChatHistory,
    setArChatHistory,
    setZoningChatHistory,
    setTitleSearchChatHistory,
    setCivilDrafterChatHistory,
    setCadManagerChatHistory,
    setStandardsComplianceChatHistory,
    setStructuresChatHistory,
    setSoilsChatHistory,
    setFieldbookNotes,
    
    // Helpers
    addMessageToHistory,
    clearChatHistory,
    resetAllChats,
  };

  return (
    <ChatStateContext.Provider value={value}>
      {children}
    </ChatStateContext.Provider>
  );
};

// ============================================================================
// Hook
// ============================================================================

export const useChatState = (): ChatContextValue => {
  const context = useContext(ChatStateContext);
  if (context === undefined) {
    throw new Error('useChatState must be used within a ChatStateProvider');
  }
  return context;
};
