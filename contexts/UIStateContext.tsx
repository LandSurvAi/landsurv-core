import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { VisualPanel } from '../types';

// Import DevOps settings check function (defined inline to avoid circular dependency)
function getDevOpsAlwaysShowWelcome(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = localStorage.getItem('landsurv-devops-settings');
    if (stored) {
      const settings = JSON.parse(stored);
      return settings.alwaysShowWelcome === true;
    }
  } catch {
    // Ignore parse errors
  }
  return false;
}

// Type definitions for UI state
export type PageMode = 'app' | 'landing' | 'xml_sitemap';

export interface ProjectionPromptState {
  message?: string;
  file?: any; // GIS file for projection prompt
  source?: 'file' | 'url';
  onConfirm: () => void;
  onCancel: () => void;
}

export interface ConfirmationModalState {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  newPoint?: any;
  existingPoint?: any;
  position?: { x: number; y: number };
}

export interface FabPosition {
  x: number;
  y: number;
  initialized: boolean;
}

interface UIState {
  // Page & Navigation State
  pageMode: PageMode | null;
  setPageMode: (mode: PageMode | null) => void;
  landingContent: { title: string; content: React.FC<any> } | null;
  setLandingContent: (content: { title: string; content: React.FC<any> } | null) => void;
  showWelcome: boolean;
  setShowWelcome: (show: boolean) => void;
  isInitialScreen: boolean;
  setIsInitialScreen: (isInitial: boolean) => void;
  isAddingData: boolean;
  setIsAddingData: (isAdding: boolean) => void;

  // Loading State
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  isSessionLoading: boolean;
  setIsSessionLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;

  // Modal Visibility State
  isDocVisible: boolean;
  setIsDocVisible: (visible: boolean) => void;
  isTechPageVisible: boolean;
  setIsTechPageVisible: (visible: boolean) => void;
  isCivil3DPageVisible: boolean;
  setIsCivil3DPageVisible: (visible: boolean) => void;
  isInvestorFormVisible: boolean;
  setIsInvestorFormVisible: (visible: boolean) => void;
  isReleaseLogVisible: boolean;
  setIsReleaseLogVisible: (visible: boolean) => void;
  isHelpModalVisible: boolean;
  setIsHelpModalVisible: (visible: boolean) => void;
  isSettingsVisible: boolean;
  setIsSettingsVisible: (visible: boolean) => void;
  isAboutVisible: boolean;
  setIsAboutVisible: (visible: boolean) => void;
  isForwardThinkingVisible: boolean;
  setIsForwardThinkingVisible: (visible: boolean) => void;
  isDisclaimerVisible: boolean;
  setIsDisclaimerVisible: (visible: boolean) => void;
  isLegalPageVisible: boolean;
  setIsLegalPageVisible: (visible: boolean) => void;
  isDxfExportModalOpen: boolean;
  setIsDxfExportModalOpen: (open: boolean) => void;
  
  // Mobile Menu
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;

  // Confirmation & Prompt Modals
  projectionPrompt: ProjectionPromptState | null;
  setProjectionPrompt: (prompt: ProjectionPromptState | null) => void;
  confirmationModal: ConfirmationModalState | null;
  setConfirmationModal: (modal: ConfirmationModalState | null) => void;

  // Panel Layout State
  isVisualPanelFullscreen: boolean;
  setIsVisualPanelFullscreen: (fullscreen: boolean | ((prev: boolean) => boolean)) => void;
  isPdfViewerFullscreen: boolean;
  setIsPdfViewerFullscreen: (fullscreen: boolean | ((prev: boolean) => boolean)) => void;
  isStationingPanelExpanded: boolean;
  setIsStationingPanelExpanded: (expanded: boolean | ((prev: boolean) => boolean)) => void;
  isPointEditorExpanded: boolean;
  setIsPointEditorExpanded: (expanded: boolean | ((prev: boolean) => boolean)) => void;
  isChatPanelVisible: boolean;
  setIsChatPanelVisible: (visible: boolean) => void;
  toggleChatPanel: () => void;
  isToolsDrawerOpen: boolean;
  setIsToolsDrawerOpen: (open: boolean) => void;
  toggleToolsDrawer: () => void;

  // Active Panel State
  activeVisualPanel: VisualPanel;
  setActiveVisualPanel: (panel: VisualPanel) => void;

  // Resizing State
  isResizingPointEditor: boolean;
  setIsResizingPointEditor: (resizing: boolean) => void;
  pointEditorHeight: number;
  setPointEditorHeight: (height: number) => void;
  isResizingContourPanel: boolean;
  setIsResizingContourPanel: (resizing: boolean) => void;
  contourPanelHeight: number;
  setContourPanelHeight: (height: number) => void;
  chatPanelWidth: number;
  setChatPanelWidth: (width: number) => void;
  isResizingChat: boolean;
  setIsResizingChat: (resizing: boolean) => void;

  // FAB (Floating Action Button) State
  fabPosition: FabPosition;
  setFabPosition: (position: FabPosition | ((prev: FabPosition) => FabPosition)) => void;
  
  // Navigation History
  navigationHistory: Array<{ agent: string; panel: VisualPanel }>;
  pushNavigation: (agent: string, panel: VisualPanel) => void;
  goBack: () => { agent: string; panel: VisualPanel } | null;
  canGoBack: boolean;
}

const UIStateContext = createContext<UIState | undefined>(undefined);

export function UIStateProvider({ children }: { children: ReactNode }) {
  // Page & Navigation State
  const [pageMode, setPageMode] = useState<PageMode | null>(null);
  const [landingContent, setLandingContent] = useState<{ title: string; content: React.FC<any> } | null>(null);
  
  // Welcome dialog: use sessionStorage to show only once per tab session
  // Unless DevOps setting overrides to always show
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    // Check if DevOps override is enabled
    if (getDevOpsAlwaysShowWelcome()) {
      return true; // Always show when DevOps setting is enabled
    }
    // Check if welcome was already shown in this tab session
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('landsurv-welcome-shown') !== 'true';
    }
    return true;
  });
  
  // When welcome is closed, mark it as shown for this tab session
  // (unless DevOps override is enabled, in which case we don't persist)
  const handleSetShowWelcome = (show: boolean) => {
    setShowWelcome(show);
    if (!show && typeof window !== 'undefined' && !getDevOpsAlwaysShowWelcome()) {
      sessionStorage.setItem('landsurv-welcome-shown', 'true');
    }
  };
  
  const [isInitialScreen, setIsInitialScreen] = useState(true);
  const [isAddingData, setIsAddingData] = useState(false);

  useEffect(() => {
    if (!isInitialScreen && showWelcome) {
      handleSetShowWelcome(false);
    }
  }, [isInitialScreen, showWelcome]);

  // Loading State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSessionLoading, setIsSessionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Modal Visibility State
  const [isDocVisible, setIsDocVisible] = useState<boolean>(false);
  const [isTechPageVisible, setIsTechPageVisible] = useState<boolean>(false);
  const [isCivil3DPageVisible, setIsCivil3DPageVisible] = useState<boolean>(false);
  const [isInvestorFormVisible, setIsInvestorFormVisible] = useState<boolean>(false);
  const [isReleaseLogVisible, setIsReleaseLogVisible] = useState<boolean>(false);
  const [isHelpModalVisible, setIsHelpModalVisible] = useState<boolean>(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState<boolean>(false);
  const [isAboutVisible, setIsAboutVisible] = useState<boolean>(false);
  const [isForwardThinkingVisible, setIsForwardThinkingVisible] = useState<boolean>(false);
  const [isDisclaimerVisible, setIsDisclaimerVisible] = useState<boolean>(false);
  const [isLegalPageVisible, setIsLegalPageVisible] = useState<boolean>(false);
  const [isDxfExportModalOpen, setIsDxfExportModalOpen] = useState(false);

  // Mobile Menu
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Confirmation & Prompt Modals
  const [projectionPrompt, setProjectionPrompt] = useState<ProjectionPromptState | null>(null);
  const [confirmationModal, setConfirmationModal] = useState<ConfirmationModalState | null>(null);

  // Panel Layout State
  const [isVisualPanelFullscreen, setIsVisualPanelFullscreen] = useState<boolean>(false);
  const [isPdfViewerFullscreen, setIsPdfViewerFullscreen] = useState<boolean>(false);
  const [isStationingPanelExpanded, setIsStationingPanelExpanded] = useState(false);
  const [isPointEditorExpanded, setIsPointEditorExpanded] = useState(true);
  const [isChatPanelVisible, setIsChatPanelVisible] = useState(true);
  const toggleChatPanel = useCallback(() => setIsChatPanelVisible(prev => !prev), []);
  const [isToolsDrawerOpen, setIsToolsDrawerOpen] = useState(false);
  const toggleToolsDrawer = useCallback(() => setIsToolsDrawerOpen(prev => !prev), []);

  // Active Panel State
  const [activeVisualPanel, setActiveVisualPanel] = useState<VisualPanel>('canvas');

  // Resizing State
  const [isResizingPointEditor, setIsResizingPointEditor] = useState<boolean>(false);
  const [pointEditorHeight, setPointEditorHeight] = useState<number>(320);
  const [isResizingContourPanel, setIsResizingContourPanel] = useState<boolean>(false);
  const [contourPanelHeight, setContourPanelHeight] = useState<number>(240);
  const [chatPanelWidth, setChatPanelWidth] = useState(450);
  const [isResizingChat, setIsResizingChat] = useState(false);

  // FAB (Floating Action Button) State
  const [fabPosition, setFabPosition] = useState<FabPosition>({ x: 0, y: 0, initialized: false });

  // Navigation History
  const [navigationHistory, setNavigationHistory] = useState<Array<{ agent: string; panel: VisualPanel }>>([]);
  
  const pushNavigation = useCallback((agent: string, panel: VisualPanel) => {
    setNavigationHistory(prev => [...prev, { agent, panel }]);
  }, []);
  
  const goBack = useCallback(() => {
    if (navigationHistory.length === 0) return null;
    const history = [...navigationHistory];
    const previous = history.pop();
    setNavigationHistory(history);
    return previous || null;
  }, [navigationHistory]);
  
  const canGoBack = navigationHistory.length > 0;

  const value: UIState = {
    // Page & Navigation State
    pageMode,
    setPageMode,
    landingContent,
    setLandingContent,
    showWelcome,
    setShowWelcome: handleSetShowWelcome,
    isInitialScreen,
    setIsInitialScreen,
    isAddingData,
    setIsAddingData,

    // Loading State
    isLoading,
    setIsLoading,
    isSessionLoading,
    setIsSessionLoading,
    error,
    setError,

    // Modal Visibility State
    isDocVisible,
    setIsDocVisible,
    isTechPageVisible,
    setIsTechPageVisible,
    isCivil3DPageVisible,
    setIsCivil3DPageVisible,
    isInvestorFormVisible,
    setIsInvestorFormVisible,
    isReleaseLogVisible,
    setIsReleaseLogVisible,
    isHelpModalVisible,
    setIsHelpModalVisible,
    isSettingsVisible,
    setIsSettingsVisible,
    isAboutVisible,
    setIsAboutVisible,
    isForwardThinkingVisible,
    setIsForwardThinkingVisible,
    isDisclaimerVisible,
    setIsDisclaimerVisible,
    isLegalPageVisible,
    setIsLegalPageVisible,
    isDxfExportModalOpen,
    setIsDxfExportModalOpen,

    // Mobile Menu
    isMobileMenuOpen,
    setIsMobileMenuOpen,

    // Confirmation & Prompt Modals
    projectionPrompt,
    setProjectionPrompt,
    confirmationModal,
    setConfirmationModal,

    // Panel Layout State
    isVisualPanelFullscreen,
    setIsVisualPanelFullscreen,
    isPdfViewerFullscreen,
    setIsPdfViewerFullscreen,
    isStationingPanelExpanded,
    setIsStationingPanelExpanded,
    isPointEditorExpanded,
    setIsPointEditorExpanded,
    isChatPanelVisible,
    setIsChatPanelVisible,
    toggleChatPanel,
    isToolsDrawerOpen,
    setIsToolsDrawerOpen,
    toggleToolsDrawer,

    // Active Panel State
    activeVisualPanel,
    setActiveVisualPanel,

    // Resizing State
    isResizingPointEditor,
    setIsResizingPointEditor,
    pointEditorHeight,
    setPointEditorHeight,
    isResizingContourPanel,
    setIsResizingContourPanel,
    contourPanelHeight,
    setContourPanelHeight,
    chatPanelWidth,
    setChatPanelWidth,
    isResizingChat,
    setIsResizingChat,

    // FAB State
    fabPosition,
    setFabPosition,
    
    // Navigation History
    navigationHistory,
    pushNavigation,
    goBack,
    canGoBack,
  };

  return <UIStateContext.Provider value={value}>{children}</UIStateContext.Provider>;
}

export function useUIState() {
  const context = useContext(UIStateContext);
  if (context === undefined) {
    throw new Error('useUIState must be used within a UIStateProvider');
  }
  return context;
}
